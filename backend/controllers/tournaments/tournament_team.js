import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";

const teamTourRoute = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Tournament Teams";

teamTourRoute.get(
  "/:tournament_id",
  async ({ params, set }) => {
    const tournamentId = Number(params.tournament_id);

    const { rows: tourTeam } = await pool.query(
      `SELECT tt.id, tt.team_id, t.name, t.short_name, t.logo_url, t.team_color_hex, u.nickname, t.created_at AS created_by
     FROM tournament_teams tt
     JOIN teams t ON t.id = tt.team_id
     JOIN users u ON u.id = t.created_by
     WHERE tt.tournament_id = $1`,
      [tournamentId],
    );

    // count total registered teams for this tournament
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM tournament_teams WHERE tournament_id = $1`,
      [tournamentId],
    );

    const total = (countRows[0] && countRows[0].total) || 0;

    set.status = 200;
    return { total, teams: tourTeam };
  },
  {
    tags: [TAG],
    summary: "List teams by tournament",
    detail: {
      parameters: [
        {
          name: "tournament_id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 1 },
          description: "ID giải đấu",
        },
      ],
    },
  },
);

teamTourRoute.post(
  "/:tournament_id",
  async ({ params, set, user }) => {
    const tournamentId = Number(params.tournament_id);

    if (!user) {
      set.status = 403;
      return { message: "Bạn cần đăng nhập để đăng ký đội vào giải đấu" };
    }

    const roleId = Number(user.role_id);
    const teamId = Number(user.team_id);

    if (!Number.isFinite(teamId) || teamId <= 0) {
      set.status = 401;
      return {
        message: "Bạn cần có đội để có thể đăng ký giải đấu",
      };
    }

    const { rows: teamRows } = await pool.query(
      "SELECT created_by FROM teams WHERE id = $1",
      [teamId],
    );

    if (teamRows.length === 0) {
      set.status = 404;
      return { message: "Không tìm thấy đội của bạn" };
    }

    const isCaptain = roleId === 4;
    const isTeamOwner = Number(teamRows[0].created_by) === Number(user.id);

    if (!isCaptain && !isTeamOwner) {
      set.status = 403;
      return {
        message:
          "Không đủ quyền đăng ký. Cần role_id = 4 hoặc là người tạo đội.",
      };
    }

    const { rows: existed } = await pool.query(
      "SELECT 1 FROM tournament_teams WHERE team_id = $1 AND tournament_id = $2",
      [teamId, tournamentId],
    );

    if (existed.length > 0) {
      set.status = 400;
      return { message: "Đội này đã được đăng ký vào giải" };
    }

    const { rows: teamTour } = await pool.query(
      `INSERT INTO tournament_teams (team_id, tournament_id)
     VALUES ($1, $2)
     RETURNING *`,
      [teamId, tournamentId],
    );

    set.status = 201;
    return teamTour[0];
  },
  {
    tags: [TAG],
    summary: "Register team to tournament",
    detail: {
      parameters: [
        {
          name: "tournament_id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 1 },
          description: "ID giải đấu",
        },
      ],
    },
  },
);

teamTourRoute.delete(
  "/:tournament_id/:team_id",
  async ({ params, set, user }) => {
    const tournamentId = Number(params.tournament_id);
    const targetTeamId = Number(params.team_id);

    if (!user) {
      set.status = 403;
      return { message: "Bạn cần đăng nhập để đăng ký đội vào giải đấu" };
    }

    const roleId = Number(user.role_id);
    const myTeamId = Number(user.team_id);

    const isStaff = new Set([1, 2, 3]).has(roleId);
    const isCaptainOfTeam = roleId === 4 && myTeamId === targetTeamId;
    const { rows: teamRows } = await pool.query(
      "SELECT created_by FROM teams WHERE id = $1",
      [targetTeamId],
    );
    const isTeamOwner =
      teamRows.length > 0 && Number(teamRows[0].created_by) === Number(user.id);

    if (!isStaff && !isCaptainOfTeam && !isTeamOwner) {
      set.status = 401;
      return {
        message:
          "Bạn cần vào đội và làm đội trưởng đội đó để có thể đăng ký giải đấu",
      };
    }

    await pool.query(
      `DELETE FROM tournament_teams WHERE team_id = $1 AND tournament_id = $2`,
      [targetTeamId, tournamentId],
    );

    set.status = 204;
    return;
  },
  {
    tags: [TAG],
    summary: "Remove team from tournament",
    detail: {
      parameters: [
        {
          name: "tournament_id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 1 },
          description: "ID giải đấu",
        },
        {
          name: "team_id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 10 },
          description: "ID đội tham gia",
        },
      ],
    },
  },
);

export default teamTourRoute;
