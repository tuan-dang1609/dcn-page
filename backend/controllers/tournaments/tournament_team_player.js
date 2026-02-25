import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";
const playerTourRoute = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Tournament Team Players";

playerTourRoute.get(
  "/:tournament_team_id",
  async ({ params, set }) => {
    const { tournament_team_id } = params;
    const { rows } = await pool.query(
      `SELECT t.name, t.short_name, t.logo_url, t.team_color_hex, t.created_by, t.created_at 
      FROM teams t
      JOIN tournament_teams tt ON t.id = tt.team_id
      JOIN tournament_team_players ttp ON tt.id = ttp.tournament_team_id
      WHERE ttp.tournament_team_id = $1`,
      [Number(tournament_team_id)],
    );
    const team_tour_info = rows[0];
    const { rows: player_team_info } = await pool.query(
      `
      SELECT
        ttp.id AS tournament_team_player_id,
        u.id AS user_id,
        u.nickname,
        u.profile_picture,
        u.riot_account,
        COALESCE(r.name, 'UNKNOWN') AS role_in_team
      FROM users u
      JOIN tournament_team_players ttp ON ttp.user_id = u.id
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE ttp.tournament_team_id = $1`,
      [Number(tournament_team_id)],
    );
    set.status = 200;
    return {
      ...team_tour_info,
      players: player_team_info,
    };
  },
  {
    tags: [TAG],
    summary: "List players by tournament team",
    detail: {
      parameters: [
        {
          name: "tournament_team_id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 1 },
        },
      ],
    },
  },
);

// Chỉ thêm người chơi mới vào đội thi
playerTourRoute.post(
  "/:tournament_team_id",
  async ({ params, body, set, user }) => {
    const tournamentTeamId = Number(params.tournament_team_id);
    const userIds = Array.isArray(body?.user_ids)
      ? [...new Set(body.user_ids.map(Number).filter(Number.isFinite))]
      : null;

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    if (!Number.isFinite(tournamentTeamId)) {
      set.status = 400;
      return { error: "ID đội giải không hợp lệ" };
    }

    if (!Array.isArray(userIds)) {
      set.status = 400;
      return { error: "user_ids phải là mảng số" };
    }

    const { rows } = await pool.query(
      `
      SELECT tt.team_id, tt.tournament_id,
             t.created_by AS tournament_owner,
             tm.created_by AS team_owner
      FROM tournament_teams tt
      JOIN tournaments t ON t.id = tt.tournament_id
      JOIN teams tm ON tm.id = tt.team_id
      WHERE tt.id = $1
      FOR UPDATE
    `,
      [tournamentTeamId],
    );

    if (rows.length === 0) {
      set.status = 404;
      return { error: "Tournament team not found" };
    }

    const teamInfo = rows[0];
    const allowedRoleIds = new Set([1, 2, 3]);
    const isTournamentOwner =
      Number(user.id) === Number(teamInfo.tournament_owner);
    const isTeamOwner = Number(user.id) === Number(teamInfo.team_owner);
    const hasRolePermission = allowedRoleIds.has(Number(user.role_id));

    if (!isTournamentOwner && !isTeamOwner && !hasRolePermission) {
      set.status = 403;
      return { error: "Bạn không có quyền gán thành viên cho đội này" };
    }

    if (userIds.length === 0) {
      set.status = 400;
      return { error: "POST chỉ dùng để thêm, user_ids không được rỗng" };
    }

    const userIdPlaceholders = userIds
      .map((_, index) => `$${index + 1}`)
      .join(", ");
    const { rows: validUsers } = await pool.query(
      `SELECT id FROM users WHERE id IN (${userIdPlaceholders}) AND team_id = $${userIds.length + 1}`,
      [...userIds, teamInfo.team_id],
    );

    if (validUsers.length !== userIds.length) {
      set.status = 400;
      return { error: "Một số user không thuộc team này" };
    }

    const userPlaceholders = userIds
      .map((_, index) => `($1, $${index + 2})`)
      .join(", ");
    await pool.query(
      `
  INSERT INTO tournament_team_players (tournament_team_id, user_id)
  VALUES ${userPlaceholders}
  ON CONFLICT DO NOTHING
  `,
      [tournamentTeamId, ...userIds],
    );

    const { rows: players } = await pool.query(
      `
      SELECT u.id, u.username
      FROM tournament_team_players ttp
      JOIN users u ON u.id = ttp.user_id
      WHERE ttp.tournament_team_id = $1
      ORDER BY u.id
    `,
      [tournamentTeamId],
    );

    set.status = 200;
    return { message: "Thêm người chơi thành công", players };
  },
  {
    tags: [TAG],
    summary: "Add players cho team giải đấu",
    security: [{ bearerAuth: [] }],
    detail: {
      parameters: [
        {
          name: "tournament_team_id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 5002 },
          description: "ID đội đã đăng ký giải",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                user_ids: {
                  type: "array",
                  items: { type: "integer" },
                  description:
                    "Danh sách user id (chỉ chấp nhận mảng số thuộc team)",
                },
              },
            },
            examples: {
              addOnly: { value: { user_ids: [4, 5, 7] } },
            },
          },
        },
      },
    },
  },
);

// Cập nhật/sync danh sách người chơi của đội thi
playerTourRoute.patch(
  "/:tournament_team_id",
  async ({ params, body, set, user }) => {
    const tournamentTeamId = Number(params.tournament_team_id);
    const userIds = Array.isArray(body?.user_ids)
      ? [...new Set(body.user_ids.map(Number).filter(Number.isFinite))]
      : null;

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    if (!Number.isFinite(tournamentTeamId)) {
      set.status = 400;
      return { error: "ID đội giải không hợp lệ" };
    }

    if (!Array.isArray(userIds)) {
      set.status = 400;
      return { error: "user_ids phải là mảng số" };
    }

    const { rows } = await pool.query(
      `
      SELECT tt.team_id, tt.tournament_id,
             t.created_by AS tournament_owner,
             tm.created_by AS team_owner
      FROM tournament_teams tt
      JOIN tournaments t ON t.id = tt.tournament_id
      JOIN teams tm ON tm.id = tt.team_id
      WHERE tt.id = $1
      FOR UPDATE
    `,
      [tournamentTeamId],
    );

    if (rows.length === 0) {
      set.status = 404;
      return { error: "Tournament team not found" };
    }

    const teamInfo = rows[0];
    const allowedRoleIds = new Set([1, 2, 3]);
    const isTournamentOwner =
      Number(user.id) === Number(teamInfo.tournament_owner);
    const isTeamOwner = Number(user.id) === Number(teamInfo.team_owner);
    const hasRolePermission = allowedRoleIds.has(Number(user.role_id));

    if (!isTournamentOwner && !isTeamOwner && !hasRolePermission) {
      set.status = 403;
      return { error: "Bạn không có quyền gán thành viên cho đội này" };
    }

    if (userIds.length === 0) {
      await pool.query(
        "DELETE FROM tournament_team_players WHERE tournament_team_id = $1",
        [tournamentTeamId],
      );

      set.status = 200;
      return { message: "Cập nhật thành công: đã xóa toàn bộ người chơi" };
    }

    const userIdPlaceholders = userIds
      .map((_, index) => `$${index + 1}`)
      .join(", ");
    const { rows: validUsers } = await pool.query(
      `SELECT id FROM users WHERE id IN (${userIdPlaceholders}) AND team_id = $${userIds.length + 1}`,
      [...userIds, teamInfo.team_id],
    );

    if (validUsers.length !== userIds.length) {
      set.status = 400;
      return { error: "Một số user không thuộc team này" };
    }

    await pool.query(
      "DELETE FROM tournament_team_players WHERE tournament_team_id = $1",
      [tournamentTeamId],
    );

    const userPlaceholders = userIds
      .map((_, index) => `($1, $${index + 2})`)
      .join(", ");
    await pool.query(
      `
  INSERT INTO tournament_team_players (tournament_team_id, user_id)
  VALUES ${userPlaceholders}
  ON CONFLICT DO NOTHING
  `,
      [tournamentTeamId, ...userIds],
    );

    const { rows: players } = await pool.query(
      `
      SELECT u.id, u.username
      FROM tournament_team_players ttp
      JOIN users u ON u.id = ttp.user_id
      WHERE ttp.tournament_team_id = $1
      ORDER BY u.id
    `,
      [tournamentTeamId],
    );

    set.status = 200;
    return { message: "Cập nhật người chơi thành công", players };
  },
  {
    tags: [TAG],
    summary: "Sync players cho team giải đấu",
    security: [{ bearerAuth: [] }],
    detail: {
      parameters: [
        {
          name: "tournament_team_id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 5002 },
          description: "ID đội đã đăng ký giải",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                user_ids: {
                  type: "array",
                  items: { type: "integer" },
                  description:
                    "Danh sách user id (chỉ chấp nhận mảng số thuộc team)",
                },
              },
            },
            examples: {
              update: { value: { user_ids: [4, 5, 7] } },
              clear: { value: { user_ids: [] } },
            },
          },
        },
      },
    },
  },
);

export default playerTourRoute;
