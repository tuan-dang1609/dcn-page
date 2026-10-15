import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";
import { GroupError, isAdmin, toNumber, withTransaction } from "../../utils/groups.js";
import {
  canEditLineup,
  autoStartBanPicks,
  checkLineupForfeits,
  forfeitWins,
  ensureMatchLineupTable,
  isLineupLocked,
  isLineupNotOpenYet,
  lineupClosesAt,
  lineupOpensAt,
  listMyPendingLineups,
  loadLineups,
  loadMatchForLineup,
  loadRegistration,
  startersFor,
} from "../../utils/matchLineups.js";

/**
 * Đội hình ra sân từng trận (utils/matchLineups.js):
 *   GET /mine              — trận sắp tới tôi cần chốt đội hình ra sân (dải thông báo)
 *   GET /:matchId          — 2 đội: đội hình đăng ký, người đã chọn ra sân, tôi có sửa được không
 *   PUT /:matchId/:teamId  — { user_ids } đúng số người ra sân, trước khi mở ban/pick / tới giờ (admin luôn được)
 *   DELETE /:matchId/:teamId — huỷ chốt (về "chưa chốt"), cùng điều kiện
 *   GET|PUT /settings/:tournamentId — BTC: mở chốt trước giờ đấu bao nhiêu phút, bật xử thua
 * Số người: ít nhất `starters` (5), tối đa cả đội hình đăng ký.
 */
const matchLineupRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Match lineups";

const handle = (fn) => async (ctx) => {
  try {
    return await fn(ctx);
  } catch (error) {
    if (error instanceof GroupError) {
      ctx.set.status = error.status;
      return { error: error.message };
    }
    throw error;
  }
};

const loadRoster = async (registrationId) => {
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.username, u.nickname, u.profile_picture, u.riot_account, p.ingame_role
     FROM tournament_team_players p JOIN users u ON u.id = p.user_id
     WHERE p.tournament_team_id = $1
     ORDER BY p.id`,
    [registrationId],
  );
  return rows;
};

const isStaff = (user) => isAdmin(user);

/** Đội thuộc trận + tôi sửa được + chưa khoá (admin luôn được). Trả lượt đăng ký của đội. */
const requireLineupEditor = async (user, match, teamId) => {
  if (teamId !== toNumber(match.team_a_id) && teamId !== toNumber(match.team_b_id)) {
    throw new GroupError(400, "Đội không thuộc trận này");
  }
  const registration = await loadRegistration(match.tournament_id, teamId);
  if (!registration || !(await canEditLineup(user, match, registration))) {
    throw new GroupError(403, "Chỉ đội trưởng / quản lý đội mới chọn được đội hình ra sân");
  }
  if (isLineupLocked(match) && !isStaff(user)) {
    throw new GroupError(400, "Đã hết hạn chốt đội hình ra sân (hoặc đã mở ban/pick) — không đổi được nữa");
  }
  if (isLineupNotOpenYet(match) && !isStaff(user)) {
    const at = lineupOpensAt(match).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" });
    throw new GroupError(400, `Chưa tới giờ mở chốt đội hình (${at})`);
  }
  return registration;
};

matchLineupRouter.get(
  "/mine",
  handle(async ({ user, set }) => {
    set.status = 200;
    return { data: user ? await listMyPendingLineups(user.id) : [] };
  }),
  { tags: [TAG], summary: "Upcoming matches where my team must set its lineup", security: [{ bearerAuth: [] }] },
);

matchLineupRouter.get(
  "/:matchId",
  handle(async ({ params, user, set }) => {
    // Hết hạn mà server chưa kịp quét (Render ngủ) → xét xử thua ngay
    await checkLineupForfeits({ matchId: toNumber(params.matchId) }).catch(() => {});
    await autoStartBanPicks({ matchId: toNumber(params.matchId) }).catch(() => {});
    const match = await loadMatchForLineup(toNumber(params.matchId));
    if (!match) throw new GroupError(404, "Không tìm thấy trận");
    const lineups = await loadLineups(match.id);
    const locked = isLineupLocked(match);

    const teams = [];
    for (const [side, teamId] of [
      ["team1", match.team_a_id],
      ["team2", match.team_b_id],
    ]) {
      const registration = await loadRegistration(match.tournament_id, teamId);
      if (!registration) {
        teams.push({ side, team_id: toNumber(teamId), registered: false, roster: [], lineup: [], lineup_set: false, can_edit: false });
        continue;
      }
      const canEdit = await canEditLineup(user, match, registration);
      const chosen = lineups.get(toNumber(teamId)) ?? [];
      teams.push({
        side,
        team_id: toNumber(teamId),
        registered: true,
        name: registration.name,
        short_name: registration.short_name,
        logo_url: registration.logo_url,
        captain_user_id: toNumber(registration.captain_user_id) ?? toNumber(registration.created_by),
        roster: await loadRoster(registration.id),
        // Trước khi khoá: chỉ đội mình (người sửa được) thấy người đã chọn — đối thủ chỉ biết đã chốt hay chưa
        lineup: canEdit || locked ? chosen : [],
        lineup_set: chosen.length > 0,
        can_edit: canEdit && (!locked || isStaff(user)),
      });
    }

    set.status = 200;
    return {
      data: {
        match_id: toNumber(match.id),
        game: match.game,
        starters: startersFor(match.game, match),
        // Hết hạn mà không chốt → xử thua với tỉ số này (null = giải không bật)
        forfeit_score: match.lineup_forfeit ? forfeitWins(match.best_of) : null,
        locked,
        date_scheduled: match.date_scheduled,
        opens_at: lineupOpensAt(match),
        // Hạn chốt: Valorant = giờ trận − 10 phút (giờ trận = giờ ban/pick); game khác = giờ trận
        closes_at: lineupClosesAt(match),
        not_open_yet: isLineupNotOpenYet(match),
        teams,
      },
    };
  }),
  { tags: [TAG], summary: "Match lineups (both teams)" },
);

matchLineupRouter.put(
  "/:matchId/:teamId",
  handle(async ({ params, body, user, set }) => {
    if (!user) throw new GroupError(401, "Bạn cần đăng nhập");
    const match = await loadMatchForLineup(toNumber(params.matchId));
    if (!match) throw new GroupError(404, "Không tìm thấy trận");
    const teamId = toNumber(params.teamId);
    const registration = await requireLineupEditor(user, match, teamId);

    const userIds = [...new Set((Array.isArray(body?.user_ids) ? body.user_ids : []).map(toNumber).filter(Boolean))];
    const starters = startersFor(match.game, match);
    if (userIds.length < starters) throw new GroupError(400, `Cần chọn ít nhất ${starters} người ra sân`);
    const rosterIds = new Set((await loadRoster(registration.id)).map((player) => toNumber(player.user_id)));
    if (userIds.some((id) => !rosterIds.has(id))) {
      throw new GroupError(400, "Chỉ chọn được người trong đội hình đã đăng ký giải");
    }

    await ensureMatchLineupTable();
    await withTransaction(async (client) => {
      await client.query("DELETE FROM match_lineups WHERE match_id = $1 AND team_id = $2", [match.id, teamId]);
      for (const id of userIds) {
        await client.query(
          "INSERT INTO match_lineups (match_id, team_id, user_id, set_by) VALUES ($1, $2, $3, $4)",
          [match.id, teamId, id, user.id],
        );
      }
    });
    set.status = 200;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Set my team's lineup for a match", security: [{ bearerAuth: [] }] },
);

matchLineupRouter.delete(
  "/:matchId/:teamId",
  handle(async ({ params, user, set }) => {
    if (!user) throw new GroupError(401, "Bạn cần đăng nhập");
    const match = await loadMatchForLineup(toNumber(params.matchId));
    if (!match) throw new GroupError(404, "Không tìm thấy trận");
    const teamId = toNumber(params.teamId);
    await requireLineupEditor(user, match, teamId);
    await ensureMatchLineupTable();
    await pool.query("DELETE FROM match_lineups WHERE match_id = $1 AND team_id = $2", [match.id, teamId]);
    set.status = 200;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Clear my team's lineup for a match", security: [{ bearerAuth: [] }] },
);

// ── Cài đặt theo giải (BTC: người tạo giải / role 1–3) ─────────────────

const MANAGE_ROLE_IDS = new Set([1, 2, 3]);
const requireTournamentManager = async (user, tournamentId) => {
  if (!user) throw new GroupError(401, "Bạn cần đăng nhập");
  const { rows } = await pool.query("SELECT * FROM tournaments WHERE id = $1", [tournamentId]);
  if (!rows[0]) throw new GroupError(404, "Không tìm thấy giải");
  if (toNumber(rows[0].created_by) !== toNumber(user.id) && !MANAGE_ROLE_IDS.has(toNumber(user.role_id))) {
    throw new GroupError(403, "Bạn không có quyền chỉnh giải này");
  }
  return rows[0];
};

const settingsOf = (tournament) => ({
  tournament_id: toNumber(tournament.id),
  lineup_open_minutes: toNumber(tournament.lineup_open_minutes),
  lineup_forfeit: Boolean(tournament.lineup_forfeit),
  ready: "lineup_open_minutes" in tournament && "lineup_forfeit" in tournament,
});

matchLineupRouter.get(
  "/settings/:tournamentId",
  handle(async ({ params, user, set }) => {
    const tournament = await requireTournamentManager(user, toNumber(params.tournamentId));
    set.status = 200;
    return { data: settingsOf(tournament) };
  }),
  { tags: [TAG], summary: "Lineup settings of a tournament (staff)", security: [{ bearerAuth: [] }] },
);

matchLineupRouter.put(
  "/settings/:tournamentId",
  handle(async ({ params, body, user, set }) => {
    const tournament = await requireTournamentManager(user, toNumber(params.tournamentId));
    if (!settingsOf(tournament).ready) {
      throw new GroupError(400, "DB chưa có cột cài đặt — chạy backend/docs/match_lineup_settings.sql");
    }
    const raw = body?.lineup_open_minutes;
    const minutes = raw === null || raw === undefined || raw === "" ? null : toNumber(raw);
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 60 * 24 * 14)) {
      throw new GroupError(400, "Số phút mở chốt phải từ 0 đến 20160 (14 ngày), hoặc để trống");
    }
    const { rows } = await pool.query(
      "UPDATE tournaments SET lineup_open_minutes = $1, lineup_forfeit = $2 WHERE id = $3 RETURNING *",
      [minutes, Boolean(body?.lineup_forfeit), tournament.id],
    );
    set.status = 200;
    return { data: settingsOf(rows[0]) };
  }),
  { tags: [TAG], summary: "Update lineup settings (staff)", security: [{ bearerAuth: [] }] },
);

export default matchLineupRouter;
