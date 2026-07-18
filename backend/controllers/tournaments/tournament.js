import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";
import logger from "../../utils/logger.js";
import {
  ensureRankingTables,
  fetchTournamentResultsRows,
  getTournamentRankingBracketId,
  readTournamentRankingBracketId,
  recalculateTournamentResults,
  setTournamentRankingBracketId,
} from "../../utils/tournamentRanking.js";

const tournamentRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Tournaments";
const allowedRoleIds = new Set([1, 2, 3]);

const parseJsonIfNeeded = (value) => {
  if (value === null || value === undefined) return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
};

const ensureTournamentManagePermission = async (user, tournamentId, set) => {
  const userId = Number(user?.id);
  const roleId = Number(user?.role_id);

  if (!userId) {
    set.status = 401;
    return { ok: false, error: { error: "Unauthorized" } };
  }

  const { rows } = await pool.query(
    "SELECT id, created_by FROM tournaments WHERE id = $1",
    [tournamentId],
  );

  if (rows.length === 0) {
    set.status = 404;
    return { ok: false, error: { error: "Tournament not found" } };
  }

  const isOwner = userId === Number(rows[0].created_by);
  if (!isOwner && !allowedRoleIds.has(roleId)) {
    set.status = 403;
    return {
      ok: false,
      error: { error: "Bạn không có quyền thao tác giải đấu này" },
    };
  }

  return { ok: true };
};

function slugify(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const hasTournamentRegistrationModeColumn = async () => {
  const { rows } = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tournaments'
      AND column_name = 'registration_mode'
    LIMIT 1
    `,
  );
  return rows.length > 0;
};

const normalizeRegistrationMode = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "individual" ? "individual" : "org";
};

const loadTournamentInfo = async (tournamentId) => {
  const { rows: tRows } = await pool.query(
    `SELECT t.id, t.name, t.slug, t.game_id, g.short_name, g.name AS game_name, g.icon_game_url, f.name AS format, t.banner_url, t.season, t.date_start,
      t.date_end, t.register_start, t.register_end,
      COALESCE(t.check_in_start, t.register_start) AS check_in_start,
      COALESCE(t.check_in_end, t.register_end) AS check_in_end,
      t.created_by, t.max_player_per_team, t.max_participate,
      COALESCE(NULLIF(TRIM(to_jsonb(t)->>'registration_mode'), ''), 'org') AS registration_mode
   FROM tournaments t
   JOIN games g ON t.game_id = g.id
   LEFT JOIN formats f ON f.id = t.format_id
   WHERE t.id = $1
   LIMIT 1`,
    [tournamentId],
  );

  if (tRows.length === 0) return null;

  const tournament = tRows[0];

  const [
    { rows: mRows },
    { rows: rulesRows },
    { rows: tourTeam },
    { rows: requirementRows },
    { rows: creatorRows },
    { rows: regCountRows },
    prizeResult,
  ] = await Promise.all([
    pool
      .query(
        "SELECT id, title, context, milestone_time FROM milestones WHERE tournament_id = $1 ORDER BY milestone_time",
        [tournament.id],
      )
      .catch(() => ({ rows: [] })),
    pool
      .query("SELECT * FROM rules WHERE tournament_id = $1 ORDER BY id", [
        tournament.id,
      ])
      .catch(() => ({ rows: [] })),
    pool
      .query(
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
       ) AS "isCheckedIn",
       COALESCE((
         SELECT json_agg(ttp.user_id ORDER BY ttp.user_id)
         FROM tournament_team_players ttp
         WHERE ttp.tournament_team_id = tt.id
       ), '[]'::json) AS player_ids,
       (
         SELECT u2.riot_account
         FROM tournament_team_players ttp2
         JOIN users u2 ON u2.id = ttp2.user_id
         WHERE ttp2.tournament_team_id = tt.id
         ORDER BY ttp2.user_id
         LIMIT 1
       ) AS primary_riot_account
 FROM tournament_teams tt
 JOIN teams t ON t.id = tt.team_id
 JOIN users u ON u.id = t.created_by
 WHERE tt.tournament_id = $1`,
        [tournament.id],
      )
      .catch(() => ({ rows: [] })),
    pool
      .query(
        `SELECT r.device, r.discord,
       COALESCE((to_jsonb(r)->>'pner_only')::boolean, false) AS pner_only,
       rg1.name AS rank_min, rg2.name AS rank_max
   FROM requirements r
   LEFT JOIN rank_game rg1 ON rg1.id = r.rank_min
   LEFT JOIN rank_game rg2 ON rg2.id = r.rank_max
   WHERE tournament_id = $1
   ORDER BY r.id`,
        [tournament.id],
      )
      .catch(() => ({ rows: [] })),
    pool
      .query("SELECT nickname, profile_picture FROM users WHERE id = $1", [
        tournament.created_by,
      ])
      .catch(() => ({ rows: [] })),
    pool
      .query(
        "SELECT COUNT(*)::int AS registered_count FROM tournament_teams WHERE tournament_id = $1",
        [tournament.id],
      )
      .catch(() => ({ rows: [{ registered_count: 0 }] })),
    pool
      .query(
        `
      SELECT id, place_label, place_order, prize, description
      FROM tournament_prizes
      WHERE tournament_id = $1
      ORDER BY place_order ASC, id ASC
      `,
        [tournament.id],
      )
      .catch(() => ({ rows: [] })),
  ]);

  const registered_count = regCountRows[0]?.registered_count ?? 0;
  const prizeRows = prizeResult.rows ?? [];

  return {
    status: "success",
    info: {
      ...tournament,
      registered_count,
      prizes: prizeRows,
      registered: tourTeam,
      rule: rulesRows,
      requirement: requirementRows[0] || null,
      milestones: mRows,
      created_by: creatorRows[0] || null,
    },
  };
};

tournamentRouter.get(
  "/games",
  async ({ set }) => {
    const { rows } = await pool.query(
      "SELECT id, name, short_name, icon_game_url FROM games ORDER BY id ASC",
    );

    set.status = 200;
    return { data: rows };
  },
  {
    tags: [TAG],
    summary: "List games",
  },
);

tournamentRouter.get(
  "/formats",
  async ({ set }) => {
    const { rows } = await pool.query(
      `
      SELECT id, name, type, has_losers_bracket
      FROM formats
      ORDER BY id ASC
      `,
    );

    set.status = 200;
    return { data: rows };
  },
  {
    tags: [TAG],
    summary: "List formats",
  },
);

tournamentRouter.get(
  "/by-slug/:game/:slug",
  async ({ params, set }) => {
    const { game, slug } = params;

    try {
      const { rows: tRows } = await pool.query(
        `SELECT t.id
       FROM tournaments t
       JOIN games g ON t.game_id = g.id
       WHERE LOWER(g.short_name) = LOWER($1) AND t.slug = $2
       LIMIT 1`,
        [game, slug],
      );

      if (tRows.length === 0) {
        set.status = 404;
        return {
          status: "error",
          error: "Tournament not found",
        };
      }

      const payload = await loadTournamentInfo(tRows[0].id);

      if (!payload) {
        set.status = 404;
        return {
          status: "error",
          error: "Tournament not found",
        };
      }

      set.status = 200;
      return payload;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("GET /by-slug failed:", message);
      set.status = 500;
      return {
        status: "error",
        error: message || "Internal server error",
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
  "/:tournament_id/info",
  async ({ params, set }) => {
    const tournamentId = Number(params.tournament_id);

    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      set.status = 400;
      return { status: "error", error: "tournament_id không hợp lệ" };
    }

    try {
      const payload = await loadTournamentInfo(tournamentId);

      if (!payload) {
        set.status = 404;
        return { status: "error", error: "Tournament not found" };
      }

      set.status = 200;
      return payload;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("GET /:id/info failed:", message);
      set.status = 500;
      return { status: "error", error: message || "Internal server error" };
    }
  },
  {
    tags: [TAG],
    summary: "Get tournament info by id",
  },
);

tournamentRouter.get(
  "/:tournament_id/ranking-bracket",
  async ({ params, set }) => {
    const tournamentId = Number(params.tournament_id);

    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      set.status = 400;
      return { error: "tournament_id không hợp lệ" };
    }

    await ensureRankingTables();

    const rankingBracketId = await getTournamentRankingBracketId(tournamentId);

    if (!rankingBracketId) {
      set.status = 200;
      return {
        data: {
          tournament_id: tournamentId,
          ranking_bracket_id: null,
        },
      };
    }

    const { rows: bracketRows } = await pool.query(
      `
      SELECT id, tournament_id, name, stage, status, format_id
      FROM brackets
      WHERE id = $1 AND tournament_id = $2
      LIMIT 1
      `,
      [rankingBracketId, tournamentId],
    );

    const bracket = bracketRows[0] ?? null;

    set.status = 200;
    return {
      data: {
        tournament_id: tournamentId,
        ranking_bracket_id: rankingBracketId,
        bracket,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Get designated bracket used for tournament ranking",
  },
);

tournamentRouter.patch(
  "/:tournament_id/ranking-bracket",
  async ({ params, body, set, user }) => {
    const tournamentId = Number(params.tournament_id);

    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      set.status = 400;
      return { error: "tournament_id không hợp lệ" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      tournamentId,
      set,
    );

    if (!permission.ok) return permission.error;

    const bracketId = body?.bracket_id;

    try {
      const selectedBracketId = await setTournamentRankingBracketId({
        tournamentId,
        bracketId,
      });

      const recalculated = await recalculateTournamentResults(tournamentId);

      set.status = 200;
      return {
        message: selectedBracketId
          ? "Da cap nhat bracket tinh diem"
          : "Da go bo bracket tinh diem (fallback ve tat ca bracket)",
        data: {
          tournament_id: tournamentId,
          ranking_bracket_id: selectedBracketId,
          recalculated,
        },
      };
    } catch (error) {
      set.status = 400;
      return {
        error:
          error instanceof Error
            ? error.message
            : "Khong the cap nhat bracket tinh diem",
      };
    }
  },
  {
    tags: [TAG],
    summary: "Set designated bracket used for tournament ranking",
    security: [{ bearerAuth: [] }],
  },
);

const parseRefreshFlag = (query) =>
  query?.refresh === "1" ||
  query?.refresh === "true" ||
  query?.recalculate === "1" ||
  query?.recalculate === "true";

tournamentRouter.get(
  "/:tournament_id/results",
  async ({ params, set }) => {
    const tournamentId = Number(params.tournament_id);

    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      set.status = 400;
      return { error: "tournament_id không hợp lệ" };
    }

    // Luôn tính lại để hạng/thắng/thua cập nhật ngay khi có trận kết thúc
    const recalculated = await recalculateTournamentResults(tournamentId);
    const rows = await fetchTournamentResultsRows(tournamentId);

    set.status = 200;
    return {
      ranking_bracket_id: recalculated.ranking_bracket_id ?? null,
      data: rows,
    };
  },
  {
    tags: [TAG],
    summary: "Get tournament team results (placement + points)",
    detail: {
      parameters: [
        {
          name: "refresh",
          in: "query",
          required: false,
          schema: { type: "string", example: "1" },
          description:
            "Admin only: force recalculate before read (?refresh=1)",
        },
      ],
    },
  },
);

tournamentRouter.get(
  "/:tournament_id/achievements",
  async ({ params, query, set, user }) => {
    const tournamentId = Number(params.tournament_id);

    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      set.status = 400;
      return { error: "tournament_id không hợp lệ" };
    }

    if (parseRefreshFlag(query)) {
      const permission = await ensureTournamentManagePermission(
        user,
        tournamentId,
        set,
      );
      if (!permission.ok) return permission.error;
      await recalculateTournamentResults(tournamentId);
    }

    const [rankingBracketId, { rows }] = await Promise.all([
      readTournamentRankingBracketId(tournamentId),
      pool.query(
      `
      SELECT
        a.tournament_id,
        a.team_id,
        r.placement,
        r.placement_end,
        r.placement_label,
        a.code,
        a.title,
        a.description,
        a.meta,
        a.created_at,
        t.name,
        t.short_name,
        t.logo_url,
        t.team_color_hex
      FROM tournament_team_achievements a
      LEFT JOIN tournament_team_results r
        ON r.tournament_id = a.tournament_id
       AND r.team_id = a.team_id
      JOIN teams t ON t.id = a.team_id
      WHERE a.tournament_id = $1
      ORDER BY r.placement ASC NULLS LAST, t.id ASC, a.code ASC
      `,
        [tournamentId],
      ),
    ]);

    const normalizedRows = rows.map((row) => ({
      ...row,
      meta: parseJsonIfNeeded(row.meta),
    }));

    set.status = 200;
    return {
      ranking_bracket_id: rankingBracketId,
      data: normalizedRows,
    };
  },
  {
    tags: [TAG],
    summary: "Get tournament team achievements",
  },
);

tournamentRouter.post(
  "/:tournament_id/recalculate-results",
  async ({ params, set, user }) => {
    const tournamentId = Number(params.tournament_id);

    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      set.status = 400;
      return { error: "tournament_id không hợp lệ" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      tournamentId,
      set,
    );

    if (!permission.ok) return permission.error;

    const recalculated = await recalculateTournamentResults(tournamentId);

    set.status = 200;
    return {
      message: "Recalculate ket qua giai dau thanh cong",
      data: recalculated,
    };
  },
  {
    tags: [TAG],
    summary: "Recalculate tournament placements, points and achievements",
    security: [{ bearerAuth: [] }],
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
      registration_mode,
    } = body ?? {};

    const slug = slugify(name);
    const mode = normalizeRegistrationMode(registration_mode);
    const resolvedMaxPlayerPerTeam =
      mode === "individual"
        ? 1
        : max_player_per_team ?? null;
    const supportsRegistrationMode =
      await hasTournamentRegistrationModeColumn();

    if (mode === "individual" && !supportsRegistrationMode) {
      set.status = 400;
      return {
        error:
          "DB chưa có cột registration_mode. Chạy backend/docs/tournament_registration_mode.sql trước.",
      };
    }

    const ctesql = supportsRegistrationMode
      ? `INSERT INTO tournaments (name, slug, game_id, banner_url, season, date_start,
    date_end, register_start, register_end, check_in_start, check_in_end, created_by, max_player_per_team, max_participate, registration_mode)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`
      : `INSERT INTO tournaments (name, slug, game_id, banner_url, season, date_start,
    date_end, register_start, register_end, check_in_start, check_in_end, created_by, max_player_per_team, max_participate)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`;

    const queryParams = [
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
      resolvedMaxPlayerPerTeam,
      max_participate,
    ];

    if (supportsRegistrationMode) {
      queryParams.push(mode);
    }

    const { rows } = await pool.query(ctesql, queryParams);

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
                registration_mode: {
                  type: "string",
                  enum: ["org", "individual"],
                  example: "individual",
                  description:
                    "org = đăng ký theo đội; individual = đăng ký cá nhân (TFT solo)",
                },
              },
            },
          },
        },
      },
    },
  },
);

tournamentRouter.patch(
  "/:tournament_id",
  async ({ params, body, set, user }) => {
    const userId = Number(user?.id);
    const roleId = Number(user?.role_id);
    const id = Number(params.tournament_id);

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
      registration_mode,
    } = body ?? {};

    const slug = slugify(name);
    const mode = normalizeRegistrationMode(
      registration_mode ?? findTournament[0]?.registration_mode,
    );
    const resolvedMaxPlayerPerTeam =
      mode === "individual"
        ? 1
        : max_player_per_team ?? findTournament[0]?.max_player_per_team;
    const supportsRegistrationMode =
      await hasTournamentRegistrationModeColumn();

    if (mode === "individual" && !supportsRegistrationMode) {
      set.status = 400;
      return {
        error:
          "DB chưa có cột registration_mode. Chạy backend/docs/tournament_registration_mode.sql trước.",
      };
    }

    const ctesql = supportsRegistrationMode
      ? `UPDATE tournaments
    SET name = $1, slug = $2, game_id = $3, banner_url = $4, season = $5, date_start = $6,
      date_end = $7, register_start = $8, register_end = $9, check_in_start = $10, check_in_end = $11,
      max_player_per_team = $12, max_participate = $13, registration_mode = $14
    WHERE id = $15
    RETURNING *`
      : `UPDATE tournaments
    SET name = $1, slug = $2, game_id = $3, banner_url = $4, season = $5, date_start = $6,
      date_end = $7, register_start = $8, register_end = $9, check_in_start = $10, check_in_end = $11,
      max_player_per_team = $12, max_participate = $13
    WHERE id = $14
    RETURNING *`;

    const queryParams = [
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
      resolvedMaxPlayerPerTeam,
      max_participate,
    ];

    if (supportsRegistrationMode) {
      queryParams.push(mode, id);
    } else {
      queryParams.push(id);
    }

    const { rows } = await pool.query(ctesql, queryParams);

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
                registration_mode: {
                  type: "string",
                  enum: ["org", "individual"],
                  example: "individual",
                },
              },
            },
          },
        },
      },
    },
  },
);

export default tournamentRouter;
