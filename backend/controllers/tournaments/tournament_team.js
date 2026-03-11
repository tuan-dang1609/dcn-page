import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";

const teamTourRoute = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Tournament Teams";

const getCheckInColumnName = async () => {
  const { rows } = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'tournament_teams'
       AND column_name IN ('is_checked_in', 'isCheckedIn')
     ORDER BY CASE
       WHEN column_name = 'is_checked_in' THEN 0
       ELSE 1
     END
     LIMIT 1`,
  );

  return rows[0]?.column_name ?? null;
};

const isWithinRange = (now, start, end) => {
  const startMs = Number(new Date(start));
  const endMs = Number(new Date(end));

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;

  return now >= startMs && now <= endMs;
};

teamTourRoute.get(
  "/:tournament_id",
  async ({ params, set }) => {
    const tournamentId = Number(params.tournament_id);

    const { rows: tourTeam } = await pool.query(
      `SELECT
        tt.id,
        tt.team_id,
        t.name,
        t.short_name,
        t.logo_url,
        t.team_color_hex,
        u.nickname,
        t.created_at AS created_by,
        COALESCE(
          (to_jsonb(tt)->>'is_checked_in')::boolean,
          (to_jsonb(tt)->>'isCheckedIn')::boolean,
          false
        ) AS "isCheckedIn"
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

teamTourRoute.patch(
  "/:tournament_id/:team_id/check-in",
  async ({ params, body, set, user }) => {
    const tournamentId = Number(params.tournament_id);
    const targetTeamId = Number(params.team_id);
    const checkedIn =
      body?.checked_in === undefined ? true : Boolean(body?.checked_in);

    if (!user) {
      set.status = 403;
      return { message: "Bạn cần đăng nhập để check-in đội" };
    }

    if (!Number.isFinite(tournamentId) || !Number.isFinite(targetTeamId)) {
      set.status = 400;
      return { message: "tournament_id hoặc team_id không hợp lệ" };
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
        message: "Bạn không có quyền check-in cho đội này",
      };
    }

    const { rows: registrationRows } = await pool.query(
      `SELECT
         tt.id,
         tt.team_id,
         t.register_start,
         t.register_end,
         COALESCE(t.check_in_start, t.register_start) AS check_in_start,
         COALESCE(t.check_in_end, t.register_end) AS check_in_end
       FROM tournament_teams tt
       JOIN tournaments t ON t.id = tt.tournament_id
       WHERE tt.tournament_id = $1 AND tt.team_id = $2
       FOR UPDATE`,
      [tournamentId, targetTeamId],
    );

    if (registrationRows.length === 0) {
      set.status = 404;
      return { message: "Đội chưa đăng ký giải đấu này" };
    }

    const registration = registrationRows[0];
    const now = Date.now();
    const canCheckInNow = isWithinRange(
      now,
      registration.check_in_start,
      registration.check_in_end,
    );

    if (!canCheckInNow) {
      set.status = 400;
      return { message: "Ngoài thời gian check-in" };
    }

    const checkInColumn = await getCheckInColumnName();

    if (!checkInColumn) {
      set.status = 500;
      return {
        message:
          "Thiếu cột trạng thái check-in trong tournament_teams (is_checked_in hoặc isCheckedIn)",
      };
    }

    await pool.query(
      `UPDATE tournament_teams
       SET "${checkInColumn}" = $1
       WHERE tournament_id = $2 AND team_id = $3`,
      [checkedIn, tournamentId, targetTeamId],
    );

    set.status = 200;
    return {
      message: checkedIn ? "Check-in thành công" : "Đã bỏ check-in",
      data: {
        team_id: targetTeamId,
        tournament_id: tournamentId,
        isCheckedIn: checkedIn,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Check-in team in tournament",
    security: [{ bearerAuth: [] }],
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

    const { rows: tournamentRows } = await pool.query(
      "SELECT register_start, register_end FROM tournaments WHERE id = $1",
      [tournamentId],
    );

    if (tournamentRows.length === 0) {
      set.status = 404;
      return { message: "Không tìm thấy giải đấu" };
    }

    const registerStartMs = Number(new Date(tournamentRows[0].register_start));
    const registerEndMs = Number(new Date(tournamentRows[0].register_end));
    const now = Date.now();

    const isRegistrationOpen =
      Number.isFinite(registerStartMs) &&
      Number.isFinite(registerEndMs) &&
      now >= registerStartMs &&
      now <= registerEndMs;

    if (!isRegistrationOpen) {
      set.status = 400;
      return {
        message: "Ngoài thời gian đăng ký giải đấu",
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
