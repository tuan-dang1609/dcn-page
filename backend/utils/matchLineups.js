import logger from "./logger.js";
import { pool } from "./db.js";
import { canManage, getGroup, getManagerIds, getMemberRole, isAdmin, notifyUsers, toNumber } from "./groups.js";
import { gameKeyOf } from "./ingameRoles.js";
import { applyMatchProgression, ensureDoubleElimLoserNextLinks } from "./bracketProgression.js";
import { scheduleTournamentResultsRecalculate } from "./tournamentRanking.js";
import { createBanPickSession, mutateBanPickSession } from "./banPick.js";
import { broadcastBanPick } from "../realtime/banPickHub.js";

/**
 * Đội hình ra sân từng trận: đội trưởng (hoặc quản lý org, admin) chọn người thi đấu trận đó
 * trong đội hình đã đăng ký giải (tournament_team_players).
 * Giai đoạn chọn người: tới khi BTC tạo phòng ban/pick cho trận (hoặc tới giờ thi đấu) — sau đó là ban/pick.
 * matches.team_a_id / team_b_id là teams.id.
 */

let ensured = null;
export const ensureMatchLineupTable = () => {
  ensured ??= pool
    .query(
      `CREATE TABLE IF NOT EXISTS match_lineups (
         match_id   BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
         team_id    BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
         user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         set_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         PRIMARY KEY (match_id, team_id, user_id)
       );
       -- Đã xét xử thua do không chốt đội hình (1 lần / trận)
       CREATE TABLE IF NOT EXISTS match_lineup_checks (
         match_id   BIGINT PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
         outcome    TEXT NOT NULL,     -- 'ok' | 'forfeit' | 'both_missing'
         winner_team_id BIGINT,
         checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
    )
    .catch((error) => {
      ensured = null;
      throw error;
    });
  return ensured;
};

/** Số người ra sân TỐI THIỂU: game 5v5 → 5; game khác → đội hình tối thiểu của giải. Tối đa = cả đội hình đăng ký. */
export const startersFor = (game, tournament) => {
  if (game === "valorant" || game === "lol" || game === "aov") return 5;
  return Math.max(1, toNumber(tournament.max_player_per_team) ?? 1);
};

const DONE_STATUSES = new Set(["completed", "complete", "finished", "done", "ongoing", "live", "in_progress"]);

/**
 * Hạn chốt: Valorant = giờ trận − 10 phút (giờ trận = giờ ban/pick, server tự mở phòng lúc đó);
 * game khác = đúng giờ trận.
 */
export const VALORANT_LINEUP_CLOSE_MINUTES = 10;
const closeOffsetMinutes = (game) => (game === "valorant" ? VALORANT_LINEUP_CLOSE_MINUTES : 0);
const CLOSE_OFFSET_SQL = (gameAlias) =>
  `(CASE WHEN LOWER(${gameAlias}.short_name) IN ('val', 'valorant') THEN INTERVAL '${VALORANT_LINEUP_CLOSE_MINUTES} minutes' ELSE INTERVAL '0' END)`;

export const lineupClosesAt = (match) =>
  match.date_scheduled
    ? new Date(new Date(match.date_scheduled).getTime() - closeOffsetMinutes(match.game) * 60_000)
    : null;

/** Hết giai đoạn chọn người: tới hạn chốt, đã có phòng ban/pick, hoặc trận đã bắt đầu / kết thúc. */
export const isLineupLocked = (match) => {
  const status = String(match.status ?? "").trim().toLowerCase();
  if (DONE_STATUSES.has(status) || match.ban_pick_open) return true;
  const closesAt = lineupClosesAt(match);
  return Boolean(closesAt) && closesAt.getTime() <= Date.now();
};

/**
 * Lúc mở chốt: giờ đấu − tournaments.lineup_open_minutes (BTC cài, docs/match_lineup_settings.sql).
 * null = mở ngay từ khi có trận.
 */
export const lineupOpensAt = (match) => {
  const minutes = toNumber(match.lineup_open_minutes);
  if (minutes === null || !match.date_scheduled) return null;
  return new Date(new Date(match.date_scheduled).getTime() - minutes * 60_000);
};

export const isLineupNotOpenYet = (match) => {
  const opensAt = lineupOpensAt(match);
  return Boolean(opensAt) && opensAt.getTime() > Date.now();
};

// Đã có phòng ban/pick cho trận (tạo phòng = hết giai đoạn chọn người ra sân)
const BAN_PICK_EXISTS = `(m.ban_pick_id IS NOT NULL OR EXISTS (SELECT 1 FROM ban_picks bp WHERE bp.match_id = m.id))`;

export const loadMatchForLineup = async (matchId) => {
  const { rows } = await pool.query(
    `SELECT m.id, m.team_a_id, m.team_b_id, m.status, m.date_scheduled,
            COALESCE(m.tournament_id, b.tournament_id) AS tournament_id,
            t.max_player_per_team, g.short_name AS game_short_name, m.best_of,
            COALESCE((to_jsonb(t) ->> 'lineup_forfeit')::boolean, FALSE) AS lineup_forfeit,
            (to_jsonb(t) ->> 'lineup_open_minutes')::int AS lineup_open_minutes,
            ${BAN_PICK_EXISTS} AS ban_pick_open
     FROM matches m
     LEFT JOIN brackets b ON b.id = m.bracket_id
     LEFT JOIN tournaments t ON t.id = COALESCE(m.tournament_id, b.tournament_id)
     LEFT JOIN games g ON g.id = t.game_id
     WHERE m.id = $1`,
    [matchId],
  );
  const match = rows[0];
  return match ? { ...match, game: gameKeyOf(match.game_short_name) } : null;
};

/**
 * Người được chọn đội hình ra sân cho 1 đội: đội trưởng giải, quản lý org / đội lẻ, admin (role 1–2).
 * Người tạo giải / trọng tài không chọn hộ đội khác.
 */
export const canEditLineup = async (user, match, registration) => {
  if (!user || !registration) return false;
  if (isAdmin(user)) return true;
  const captainId = toNumber(registration.captain_user_id) ?? toNumber(registration.created_by);
  if (captainId === toNumber(user.id)) return true;
  const group = await getGroup(registration.team_id);
  return Boolean(group) && canManage(await getMemberRole(group, user.id), user);
};

/** Lượt đăng ký của 1 đội trong giải của trận (kèm đội hình). */
export const loadRegistration = async (tournamentId, teamId) => {
  if (!tournamentId || !teamId) return null;
  const { rows } = await pool.query(
    `SELECT tt.id, tt.team_id, tt.captain_user_id, t.created_by, t.name, t.short_name, t.logo_url
     FROM tournament_teams tt JOIN teams t ON t.id = tt.team_id
     WHERE tt.tournament_id = $1 AND tt.team_id = $2`,
    [tournamentId, teamId],
  );
  return rows[0] ?? null;
};

/** user_id đã chọn ra sân của các đội trong 1 trận: Map teamId → number[]. */
export const loadLineups = async (matchId) => {
  await ensureMatchLineupTable();
  const { rows } = await pool.query(
    "SELECT team_id, user_id FROM match_lineups WHERE match_id = $1 ORDER BY created_at, user_id",
    [matchId],
  );
  const byTeam = new Map();
  for (const row of rows) {
    const key = toNumber(row.team_id);
    if (!byTeam.has(key)) byTeam.set(key, []);
    byTeam.get(key).push(toNumber(row.user_id));
  }
  return byTeam;
};

/**
 * Trận sắp tới (trong 3 ngày) mà tôi cần chốt đội hình ra sân: tôi là đội trưởng giải / sáng lập, lead org /
 * đội trưởng đội lẻ; chưa có phòng ban/pick, chưa tới giờ, đội tôi chưa chốt.
 */
export const listMyPendingLineups = async (userId) => {
  await ensureMatchLineupTable();
  const { rows } = await pool.query(
    `SELECT m.id AS match_id, m.date_scheduled, me.team_id, tr.slug AS tournament_slug, g.short_name AS game_short_name,
            ta.name AS team_a_name, ta.short_name AS team_a_tag, tb.name AS team_b_name, tb.short_name AS team_b_tag
     FROM matches m
     LEFT JOIN brackets b ON b.id = m.bracket_id
     JOIN tournaments tr ON tr.id = COALESCE(m.tournament_id, b.tournament_id)
     LEFT JOIN games g ON g.id = tr.game_id
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     JOIN LATERAL (
       SELECT tt.team_id FROM tournament_teams tt JOIN teams t ON t.id = tt.team_id
       WHERE tt.tournament_id = tr.id AND tt.team_id IN (m.team_a_id, m.team_b_id)
         AND (COALESCE(tt.captain_user_id, t.created_by) = $1
              OR EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = t.id AND om.user_id = $1 AND om.role IN ('founder', 'lead'))
              OR EXISTS (SELECT 1 FROM squad_members sm WHERE sm.squad_id = t.id AND sm.user_id = $1 AND sm.role = 'captain'))
       LIMIT 1
     ) me ON TRUE
     WHERE m.date_scheduled - ${CLOSE_OFFSET_SQL("g")} > NOW() AND m.date_scheduled <= NOW() + INTERVAL '3 days'
       -- Đã tới giờ mở chốt (BTC cài số phút trước giờ đấu)
       AND (to_jsonb(tr) ->> 'lineup_open_minutes' IS NULL
            OR m.date_scheduled - make_interval(mins => (to_jsonb(tr) ->> 'lineup_open_minutes')::int) <= NOW())
       AND LOWER(COALESCE(m.status, '')) NOT IN ('completed', 'complete', 'finished', 'done', 'ongoing', 'live', 'in_progress')
       AND NOT ${BAN_PICK_EXISTS}
       AND NOT EXISTS (SELECT 1 FROM match_lineups ml WHERE ml.match_id = m.id AND ml.team_id = me.team_id)
     ORDER BY m.date_scheduled
     LIMIT 5`,
    [userId],
  );
  return rows.map((row) => ({
    match_id: toNumber(row.match_id),
    team_id: toNumber(row.team_id),
    date_scheduled: row.date_scheduled,
    closes_at: lineupClosesAt({ date_scheduled: row.date_scheduled, game: gameKeyOf(row.game_short_name) }),
    team_a: { name: row.team_a_name, tag: row.team_a_tag },
    team_b: { name: row.team_b_name, tag: row.team_b_tag },
    link:
      row.game_short_name && row.tournament_slug
        ? `/tournament/${row.game_short_name}/${row.tournament_slug}/match/${row.match_id}`
        : `/match/${row.match_id}`,
  }));
};
// ── Xử thua khi hết hạn mà không chốt đội hình ra sân ──────────────────
//   Hạn = lúc khoá (BTC mở phòng ban/pick / tới giờ đấu). 1 đội không chốt → thua 1-0 / 2-0 / 3-0 (BO1/3/5).
//   Cả 2 không chốt → không tự xử (BTC quyết). Chỉ giải bật tournaments.lineup_forfeit (docs/match_lineup_forfeit.sql).

const COMPLETED = ["completed", "complete", "finished", "done"];

/** Số ván thắng của bo: BO1 → 1, BO3 → 2, BO5 → 3. */
export const forfeitWins = (bestOf) => Math.floor(Math.max(1, toNumber(bestOf) ?? 1) / 2) + 1;

/** Trận đã tới hạn chốt, chưa xong, chưa xét, của giải bật xử thua. */
const listDueMatches = async (matchId = null) => {
  const { rows } = await pool.query(
    `SELECT m.*, COALESCE(m.tournament_id, b.tournament_id) AS tid
     FROM matches m
     LEFT JOIN brackets b ON b.id = m.bracket_id
     JOIN tournaments t ON t.id = COALESCE(m.tournament_id, b.tournament_id)
     JOIN games g ON g.id = t.game_id
     WHERE t.lineup_forfeit
       AND ($1::bigint IS NULL OR m.id = $1)
       AND m.team_a_id IS NOT NULL AND m.team_b_id IS NOT NULL
       AND LOWER(COALESCE(m.status, '')) <> ALL($2::text[])
       AND LOWER(g.short_name) IN ('val', 'valorant', 'lol', 'aov')
       AND ((m.date_scheduled IS NOT NULL AND m.date_scheduled - ${CLOSE_OFFSET_SQL("g")} <= NOW()) OR ${BAN_PICK_EXISTS})
       AND NOT EXISTS (SELECT 1 FROM match_lineup_checks c WHERE c.match_id = m.id)
     ORDER BY m.date_scheduled NULLS LAST
     LIMIT 50`,
    [matchId, COMPLETED],
  );
  return rows;
};

/** Ghi kết quả xử thua như BTC nhập tỉ số: completed + đội thắng đi tiếp + cập nhật BXH. */
const applyForfeit = async (match, winnerTeamId) => {
  const wins = forfeitWins(match.best_of);
  const winnerIsA = winnerTeamId === toNumber(match.team_a_id);
  const { rows } = await pool.query(
    `UPDATE matches SET score_a = $1, score_b = $2, winner_team_id = $3, status = 'completed'
     WHERE id = $4 AND LOWER(COALESCE(status, '')) <> ALL($5::text[])
     RETURNING *`,
    [winnerIsA ? wins : 0, winnerIsA ? 0 : wins, winnerTeamId, match.id, COMPLETED],
  );
  const updated = rows[0];
  if (!updated) return false; // BTC vừa nhập kết quả
  if (updated.bracket_id) {
    await ensureDoubleElimLoserNextLinks(Number(updated.bracket_id)).catch(() => {});
    const { rows: fresh } = await pool.query("SELECT * FROM matches WHERE id = $1", [match.id]);
    Object.assign(updated, fresh[0] ?? {});
  }
  await applyMatchProgression({ updatedMatch: updated, winnerTeamId });
  await scheduleTournamentResultsRecalculate(Number(match.tid)).catch(() => {});
  return true;
};

/** Xét 1 trận (hoặc mọi trận tới hạn). Trả danh sách kết quả. */
export const checkLineupForfeits = async ({ matchId = null } = {}) => {
  await ensureMatchLineupTable();
  const results = [];
  for (const match of await listDueMatches(matchId)) {
    const lineups = await loadLineups(match.id);
    const teamA = toNumber(match.team_a_id);
    const teamB = toNumber(match.team_b_id);
    const hasA = (lineups.get(teamA)?.length ?? 0) > 0;
    const hasB = (lineups.get(teamB)?.length ?? 0) > 0;
    const outcome = hasA && hasB ? "ok" : !hasA && !hasB ? "both_missing" : "forfeit";
    const winnerTeamId = outcome === "forfeit" ? (hasA ? teamA : teamB) : null;

    // Đánh dấu trước (chống chạy trùng), rồi mới ghi kết quả
    const { rowCount } = await pool.query(
      `INSERT INTO match_lineup_checks (match_id, outcome, winner_team_id) VALUES ($1, $2, $3)
       ON CONFLICT (match_id) DO NOTHING`,
      [match.id, outcome, winnerTeamId],
    );
    if (!rowCount) continue;
    if (outcome === "forfeit") {
      const applied = await applyForfeit(match, winnerTeamId);
      if (applied) {
        const loserTeamId = winnerTeamId === teamA ? teamB : teamA;
        const notify = async (teamId, event) => {
          const { rows } = await pool.query(
            `SELECT t.*, tt.captain_user_id FROM teams t
             LEFT JOIN tournament_teams tt ON tt.team_id = t.id AND tt.tournament_id = $2 WHERE t.id = $1`,
            [teamId, match.tid],
          );
          if (!rows[0]) return;
          const ids = new Set([...(await getManagerIds(rows[0])), toNumber(rows[0].captain_user_id)].filter(Boolean));
          notifyUsers([...ids], { event, match_id: toNumber(match.id) });
        };
        await notify(loserTeamId, "lineup_forfeit_lost").catch(() => {});
        await notify(winnerTeamId, "lineup_forfeit_won").catch(() => {});
        logger.info(`lineup forfeit: trận ${match.id} — đội ${loserTeamId} không chốt đội hình, ${winnerTeamId} thắng`);
      }
    }
    results.push({ match_id: toNumber(match.id), outcome, winner_team_id: winnerTeamId });
  }
  return results;
};

// ── Valorant: đúng giờ trận (= giờ ban/pick) tự tạo + bắt đầu phòng ban/pick ──────────
//   Chỉ trận của giải bật chốt đội hình, cả 2 đội đã chốt (match_lineup_checks = 'ok'), chưa có phòng.
//   Trận quá giờ > 2 tiếng thì bỏ qua (tránh mở phòng cho trận cũ khi server vừa thức dậy).

const SYSTEM_STAFF = { id: null, role_id: 1 };

export const autoStartBanPicks = async ({ matchId = null } = {}) => {
  const { rows } = await pool.query(
    `SELECT m.id
     FROM matches m
     LEFT JOIN brackets b ON b.id = m.bracket_id
     JOIN tournaments t ON t.id = COALESCE(m.tournament_id, b.tournament_id)
     JOIN games g ON g.id = t.game_id
     JOIN match_lineup_checks c ON c.match_id = m.id AND c.outcome = 'ok'
     WHERE t.lineup_forfeit
       AND ($1::bigint IS NULL OR m.id = $1)
       AND LOWER(g.short_name) IN ('val', 'valorant')
       AND m.date_scheduled <= NOW() AND m.date_scheduled > NOW() - INTERVAL '2 hours'
       AND LOWER(COALESCE(m.status, '')) <> ALL($2::text[])
       AND NOT ${BAN_PICK_EXISTS}`,
    [matchId, COMPLETED],
  );
  const started = [];
  for (const { id } of rows) {
    try {
      const session = await createBanPickSession({ matchId: toNumber(id) });
      if (!session) continue;
      const result = await mutateBanPickSession({ matchId: toNumber(id), user: SYSTEM_STAFF, command: "start" });
      const latest = result.ok ? result.session : session;
      void broadcastBanPick(latest.match_id, latest);
      started.push(toNumber(id));
      logger.info(`auto ban/pick: trận ${id} — đã mở + bắt đầu phòng`);
    } catch (error) {
      logger.error(`auto ban/pick trận ${id} lỗi:`, error instanceof Error ? error.message : String(error));
    }
  }
  return started;
};

let forfeitTimer = null;
let forfeitRunning = false;
/** Kiểm tra mỗi phút (server ngủ thì lần mở trang trận kế tiếp cũng xét — controller). */
export const startLineupForfeitSweeper = (intervalMs = 60_000) => {
  if (forfeitTimer) return;
  const tick = async () => {
    if (forfeitRunning) return;
    forfeitRunning = true;
    try {
      await checkLineupForfeits();
      await autoStartBanPicks();
    } catch (error) {
      // Chưa chạy docs/match_lineup_forfeit.sql (thiếu cột lineup_forfeit) → bỏ qua
      if (error?.code !== "42703" && error?.code !== "42P01") {
        logger.error("lineup forfeit sweep lỗi:", error instanceof Error ? error.message : String(error));
      }
    } finally {
      forfeitRunning = false;
    }
  };
  forfeitTimer = setInterval(() => void tick(), intervalMs);
  void tick();
};