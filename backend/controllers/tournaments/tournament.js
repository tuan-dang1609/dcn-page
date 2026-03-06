import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";

const tournamentRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Tournaments";

function slugify(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

tournamentRouter.get(
  "/by-slug/:game/:slug",
  async ({ params, set }) => {
    const { game, slug } = params;

    try {
      const { rows: tRows } = await pool.query(
        `SELECT t.id, t.name, g.short_name, g.name AS game_name, g.icon_game_url, f.name AS format, t.banner_url, t.season, t.date_start,
          t.date_end, t.register_start, t.register_end,
          COALESCE(t.check_in_start, t.register_start) AS check_in_start,
          COALESCE(t.check_in_end, t.register_end) AS check_in_end,
          t.created_by, t.max_player_per_team, t.max_participate
       FROM tournaments t
       JOIN games g ON t.game_id = g.id
       JOIN formats f ON f.id = t.format_id
       WHERE g.short_name = $1 AND t.slug = $2
       LIMIT 1`,
        [game, slug],
      );

      if (tRows.length === 0) {
        set.status = 404;
        return {
          status: "error",
          error: { code: "NOT_FOUND", message: "Tournament not found" },
        };
      }

      const tournament = tRows[0];

      const { rows: mRows } = await pool.query(
        "SELECT id, title, context, milestone_time FROM milestones WHERE tournament_id = $1 ORDER BY milestone_time",
        [tournament.id],
      );

      const { rows: rulesRows } = await pool.query(
        "SELECT * FROM rules WHERE tournament_id = $1 ORDER BY id",
        [tournament.id],
      );
      const { rows: tourTeam } = await pool.query(
        `SELECT
           tt.id,
           tt.team_id,
           tt.tournament_id,
           t.name,
           t.short_name,
           t.logo_url,
           t.team_color_hex,
           u.nickname,
           t.created_at,
           COALESCE(
             (to_jsonb(tt)->>'is_checked_in')::boolean,
             (to_jsonb(tt)->>'isCheckedIn')::boolean,
             false
           ) AS "isCheckedIn"
     FROM tournament_teams tt
     JOIN teams t ON t.id = tt.team_id
     JOIN users u ON u.id = t.created_by
     WHERE tt.tournament_id = $1`,
        [tournament.id],
      );
      const { rows: requirementRows } = await pool.query(
        `SELECT r.device, r.discord, rg1.name AS rank_min, rg2.name AS rank_max
       FROM requirements r
       JOIN rank_game rg1 ON rg1.id = r.rank_min
       JOIN rank_game rg2 ON rg2.id = r.rank_max
       WHERE tournament_id = $1
       ORDER BY r.id`,
        [tournament.id],
      );

      const { rows: creatorRows } = await pool.query(
        "SELECT nickname, profile_picture FROM users WHERE id = $1",
        [tournament.created_by],
      );

      const { rows: regCountRows } = await pool.query(
        "SELECT COUNT(*)::int AS registered_count FROM tournament_teams WHERE tournament_id = $1",
        [tournament.id],
      );
      const registered_count = regCountRows[0]?.registered_count ?? 0;

      set.status = 200;
      return {
        status: "success",
        info: {
          ...tournament,
          registered_count,
          registered: tourTeam,
          rule: rulesRows,
          requirement: requirementRows[0] || null,
          milestones: mRows,
          created_by: creatorRows[0] || null,
        },
      };
    } catch {
      set.status = 500;
      return {
        status: "error",
        error: { code: "INTERNAL_ERROR" },
      };
    }
  },
  {
    tags: [TAG],
    summary: "Get tournament by game and slug",
    detail: {
      parameters: [
        {
          name: "game",
          in: "path",
          required: true,
          schema: { type: "string", example: "valorant" },
          description: "Mã game (short name)",
        },
        {
          name: "slug",
          in: "path",
          required: true,
          schema: { type: "string", example: "dcn_spring_cup" },
          description: "Slug giải đấu",
        },
      ],
    },
  },
);

tournamentRouter.get(
  "/",
  async ({ set }) => {
    const { rows } = await pool.query("SELECT * FROM tournaments");
    set.status = 200;
    return rows;
  },
  { tags: [TAG], summary: "List tournaments" },
);

tournamentRouter.post(
  "/",
  async ({ body, set, user }) => {
    const userId = Number(user?.id);

    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const {
      name,
      game_id,
      banner_url,
      season,
      date_start,
      date_end,
      register_start,
      register_end,
      check_in_start,
      check_in_end,
      max_player_per_team,
      max_participate,
    } = body ?? {};

    const slug = slugify(name);

    const ctesql = `INSERT INTO tournaments (name, slug, game_id, banner_url, season, date_start,
    date_end, register_start, register_end, check_in_start, check_in_end, created_by, max_player_per_team, max_participate)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`;

    const { rows } = await pool.query(ctesql, [
      name,
      slug,
      game_id,
      banner_url,
      season,
      date_start,
      date_end,
      register_start,
      register_end,
      check_in_start ?? register_start,
      check_in_end ?? register_end,
      userId,
      max_player_per_team,
      max_participate,
    ]);

    set.status = 201;
    return { message: "Tạo giải thành công", data: rows[0] };
  },
  {
    tags: [TAG],
    summary: "Create tournament",
    detail: {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 1 },
          description: "ID giải đấu cần cập nhật",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "game_id"],
              properties: {
                name: { type: "string", example: "DCN Spring Cup" },
                game_id: { type: "integer", example: 1 },
                banner_url: {
                  type: "string",
                  example: "https://cdn.example.com/banner.png",
                },
                season: { type: "string", example: "2026-S1" },
                date_start: {
                  type: "string",
                  format: "date-time",
                  example: "2026-03-01T08:00:00.000Z",
                },
                date_end: {
                  type: "string",
                  format: "date-time",
                  example: "2026-03-10T15:00:00.000Z",
                },
                register_start: {
                  type: "string",
                  format: "date-time",
                  example: "2026-02-20T08:00:00.000Z",
                },
                register_end: {
                  type: "string",
                  format: "date-time",
                  example: "2026-02-28T15:00:00.000Z",
                },
                check_in_start: {
                  type: "string",
                  format: "date-time",
                  example: "2026-02-28T12:00:00.000Z",
                },
                check_in_end: {
                  type: "string",
                  format: "date-time",
                  example: "2026-02-28T15:00:00.000Z",
                },
                max_player_per_team: { type: "integer", example: 5 },
                max_participate: { type: "integer", example: 64 },
              },
            },
          },
        },
      },
    },
  },
);

tournamentRouter.patch(
  "/:id",
  async ({ params, body, set, user }) => {
    const userId = Number(user?.id);
    const roleId = Number(user?.role_id);
    const id = Number(params.id);

    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { rows: findTournament } = await pool.query(
      "SELECT * FROM tournaments WHERE id = $1 FOR UPDATE",
      [id],
    );

    if (findTournament.length === 0) {
      set.status = 404;
      return { error: "Tournament not found" };
    }

    const allowedRoleIds = new Set([1, 2, 3]);
    const isOwner = userId === Number(findTournament[0].created_by);

    if (!isOwner && !allowedRoleIds.has(roleId)) {
      set.status = 403;
      return { error: "Bạn không có quyền cập nhật giải đấu này" };
    }

    const {
      name,
      game_id,
      banner_url,
      season,
      date_start,
      date_end,
      register_start,
      register_end,
      check_in_start,
      check_in_end,
      max_player_per_team,
      max_participate,
    } = body ?? {};

    const slug = slugify(name);

    const ctesql = `UPDATE tournaments
    SET name = $1, slug = $2, game_id = $3, banner_url = $4, season = $5, date_start = $6,
      date_end = $7, register_start = $8, register_end = $9, check_in_start = $10, check_in_end = $11,
      max_player_per_team = $12, max_participate = $13
    WHERE id = $14
    RETURNING *`;

    const { rows } = await pool.query(ctesql, [
      name,
      slug,
      game_id,
      banner_url,
      season,
      date_start,
      date_end,
      register_start,
      register_end,
      check_in_start ?? register_start,
      check_in_end ?? register_end,
      max_player_per_team,
      max_participate,
      id,
    ]);

    set.status = 200;
    return { message: "Cập nhật giải thành công", data: rows[0] };
  },
  {
    tags: [TAG],
    summary: "Update tournament",
    detail: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string", example: "DCN Summer Cup" },
                game_id: { type: "integer", example: 1 },
                banner_url: {
                  type: "string",
                  example: "https://cdn.example.com/banner-new.png",
                },
                season: { type: "string", example: "2026-S2" },
                date_start: {
                  type: "string",
                  format: "date-time",
                  example: "2026-06-01T08:00:00.000Z",
                },
                date_end: {
                  type: "string",
                  format: "date-time",
                  example: "2026-06-10T15:00:00.000Z",
                },
                register_start: {
                  type: "string",
                  format: "date-time",
                  example: "2026-05-20T08:00:00.000Z",
                },
                register_end: {
                  type: "string",
                  format: "date-time",
                  example: "2026-05-31T15:00:00.000Z",
                },
                check_in_start: {
                  type: "string",
                  format: "date-time",
                  example: "2026-05-31T12:00:00.000Z",
                },
                check_in_end: {
                  type: "string",
                  format: "date-time",
                  example: "2026-05-31T15:00:00.000Z",
                },
                max_player_per_team: { type: "integer", example: 5 },
                max_participate: { type: "integer", example: 128 },
              },
            },
          },
        },
      },
    },
  },
);

export default tournamentRouter;
