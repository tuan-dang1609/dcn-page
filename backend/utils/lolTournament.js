import logger from "./logger.js";
import { pool } from "./db.js";
import { getManagerIds, notifyUsers } from "./groups.js";
import { LOL_LINEUP_CLOSE_MINUTES, completeMatch, ensureMatchLineupTable, forfeitWins } from "./matchLineups.js";

/**
 * Mã phòng giải đấu LMHT (Riot tournament-v5) cho trận DCN:
 *   - Tới hạn chốt đội hình (giờ trận) + 2 đội đã chốt → tạo mã cho ván 1; chỉ puuid LoL của người đã chốt
 *     (riot_puuid_lol) được vào phòng. Ván xong → tự cộng tỉ số, tạo mã ván kế tiếp; đủ số ván thắng → kết thúc
 *     trận + đẩy đội thắng đi tiếp (completeMatch).
 *   - Kết quả: Riot gọi POST /api/lol-tournament/callback; server cũng tự hỏi games/by-code định kỳ
 *     (callback có thể lỡ khi server ngủ). Mã ván lưu vào match_games.info_game_id = "<PLATFORM>_<gameId>"
 *     → match-v5 lấy chỉ số chi tiết (utils/lolPlayerStats.js).
 *
 * Env: LOL_RIOT_API_KEY (bắt buộc), RIOT_LOL_TOURNAMENT_STUB=1 (dùng bản thử, không tạo phòng thật),
 *      RIOT_LOL_TOURNAMENT_REGION (mặc định VN), RIOT_LOL_PLATFORM (mặc định VN2),
 *      LOL_TOURNAMENT_CALLBACK_URL (mặc định <RENDER_EXTERNAL_URL>/api/lol-tournament/callback).
 * Tournament API của Riot chỉ phục vụ qua cụm americas (kể cả máy chủ VN).
 */

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const lolTournamentMode = () => (String(process.env.RIOT_LOL_TOURNAMENT_STUB ?? "").trim() === "1" ? "stub" : "live");
const apiKey = () => String(process.env.LOL_RIOT_API_KEY ?? "").trim();
const providerRegion = () => String(process.env.RIOT_LOL_TOURNAMENT_REGION ?? "VN").trim().toUpperCase();
export const lolPlatform = () => String(process.env.RIOT_LOL_PLATFORM ?? "VN2").trim().toUpperCase();
const callbackUrl = () => {
  const explicit = String(process.env.LOL_TOURNAMENT_CALLBACK_URL ?? "").trim();
  if (explicit) return explicit;
  const base = String(process.env.RENDER_EXTERNAL_URL ?? "https://dcn-page.onrender.com").replace(/\/+$/, "");
  return `${base}/api/lol-tournament/callback`;
};
const baseUrl = (mode) =>
  `https://americas.api.riotgames.com/lol/${mode === "stub" ? "tournament-stub" : "tournament"}/v5`;

const COMPLETED = ["completed", "complete", "finished", "done"];
const MAX_PLAYERS = 10;

class RiotError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const riot = async (mode, method, path, body) => {
  const key = apiKey();
  if (!key) throw new RiotError(500, "Chưa cấu hình LOL_RIOT_API_KEY");
  const response = await fetch(`${baseUrl(mode)}${path}`, {
    method,
    headers: { "X-Riot-Token": key, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new RiotError(response.status, `Riot ${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};

let ensured = null;
export const ensureLolTournamentTables = () => {
  ensured ??= pool
    .query(
      `CREATE TABLE IF NOT EXISTS lol_tournament_providers (
         id           BIGSERIAL PRIMARY KEY,
         mode         TEXT NOT NULL,
         region       TEXT NOT NULL,
         callback_url TEXT NOT NULL,
         provider_id  BIGINT NOT NULL,
         created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         UNIQUE (mode, region, callback_url)
       );
       CREATE TABLE IF NOT EXISTS lol_tournaments (
         tournament_id      BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
         mode               TEXT NOT NULL,
         provider_id        BIGINT NOT NULL,
         riot_tournament_id BIGINT NOT NULL,
         created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         PRIMARY KEY (tournament_id, mode)
       );
       CREATE TABLE IF NOT EXISTS lol_tournament_codes (
         code           TEXT PRIMARY KEY,
         match_id       BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
         game_no        INT NOT NULL,
         mode           TEXT NOT NULL,
         -- open = chờ đấu; played = đã có kết quả; review = không xác định được đội thắng (BTC xử)
         status         TEXT NOT NULL DEFAULT 'open',
         allowed_puuids TEXT[] NOT NULL DEFAULT '{}',
         missing_user_ids BIGINT[] NOT NULL DEFAULT '{}',
         riot_game_id   BIGINT,
         winner_team_id BIGINT,
         match_game_id  BIGINT,
         note           TEXT,
         created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         polled_at      TIMESTAMPTZ
       );
       CREATE INDEX IF NOT EXISTS lol_tournament_codes_match_idx ON lol_tournament_codes (match_id, game_no);`,
    )
    .catch((error) => {
      ensured = null;
      throw error;
    });
  return ensured;
};

/** Provider (đăng ký callback) — 1 lần cho mỗi mode / region / URL. */
const getProviderId = async (mode) => {
  const region = providerRegion();
  const url = callbackUrl();
  const { rows } = await pool.query(
    "SELECT provider_id FROM lol_tournament_providers WHERE mode = $1 AND region = $2 AND callback_url = $3",
    [mode, region, url],
  );
  if (rows[0]) return toNumber(rows[0].provider_id);
  const providerId = toNumber(await riot(mode, "POST", "/providers", { region, url }));
  await pool.query(
    `INSERT INTO lol_tournament_providers (mode, region, callback_url, provider_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (mode, region, callback_url) DO NOTHING`,
    [mode, region, url, providerId],
  );
  logger.info(`[lol-tournament] provider ${mode} ${region} → ${providerId} (${url})`);
  return providerId;
};

/** Giải phía Riot cho 1 giải DCN. */
const getRiotTournamentId = async (mode, tournament) => {
  const { rows } = await pool.query(
    "SELECT riot_tournament_id FROM lol_tournaments WHERE tournament_id = $1 AND mode = $2",
    [tournament.id, mode],
  );
  if (rows[0]) return toNumber(rows[0].riot_tournament_id);
  const providerId = await getProviderId(mode);
  const riotTournamentId = toNumber(
    await riot(mode, "POST", "/tournaments", { providerId, name: `DCN ${tournament.name}`.slice(0, 60) }),
  );
  await pool.query(
    `INSERT INTO lol_tournaments (tournament_id, mode, provider_id, riot_tournament_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (tournament_id, mode) DO NOTHING`,
    [tournament.id, mode, providerId, riotTournamentId],
  );
  return riotTournamentId;
};

const loadMatch = async (matchId) => {
  const { rows } = await pool.query(
    `SELECT m.*, COALESCE(m.tournament_id, b.tournament_id) AS tid, t.name AS tournament_name,
            LOWER(g.short_name) AS game_short_name, g.id AS game_row_id
     FROM matches m
     LEFT JOIN brackets b ON b.id = m.bracket_id
     JOIN tournaments t ON t.id = COALESCE(m.tournament_id, b.tournament_id)
     LEFT JOIN games g ON g.id = t.game_id
     WHERE m.id = $1`,
    [matchId],
  );
  return rows[0] ?? null;
};

/**
 * Người thi đấu của 2 đội trong trận: đội hình đã chốt (match_lineups); đội chưa chốt → cả đội hình đăng ký.
 * Trả { teamA: [{user_id, puuid}], teamB: [...] }.
 */
const loadMatchPlayers = async (match) => {
  await ensureMatchLineupTable();
  const side = async (teamId) => {
    const { rows: lineup } = await pool.query(
      `SELECT u.id AS user_id, to_jsonb(u)->>'riot_puuid_lol' AS puuid
       FROM match_lineups ml JOIN users u ON u.id = ml.user_id
       WHERE ml.match_id = $1 AND ml.team_id = $2`,
      [match.id, teamId],
    );
    if (lineup.length) return lineup;
    const { rows: roster } = await pool.query(
      `SELECT u.id AS user_id, to_jsonb(u)->>'riot_puuid_lol' AS puuid
       FROM tournament_teams tt
       JOIN tournament_team_players p ON p.tournament_team_id = tt.id
       JOIN users u ON u.id = p.user_id
       WHERE tt.tournament_id = $1 AND tt.team_id = $2`,
      [match.tid, teamId],
    );
    return roster;
  };
  return { teamA: await side(match.team_a_id), teamB: await side(match.team_b_id) };
};

/** Người nhận thông báo / được xem mã: người thi đấu + quản lý 2 đội. */
const matchAudience = async (match, players) => {
  const ids = new Set([...players.teamA, ...players.teamB].map((player) => toNumber(player.user_id)));
  for (const teamId of [match.team_a_id, match.team_b_id]) {
    const { rows } = await pool.query(
      `SELECT t.id, t.kind, t.created_by, tt.captain_user_id
       FROM teams t LEFT JOIN tournament_teams tt ON tt.team_id = t.id AND tt.tournament_id = $2
       WHERE t.id = $1`,
      [teamId, match.tid],
    );
    if (!rows[0]) continue;
    (await getManagerIds(rows[0])).forEach((id) => ids.add(id));
    if (rows[0].captain_user_id) ids.add(toNumber(rows[0].captain_user_id));
  }
  return [...ids].filter(Boolean);
};

/** Tạo mã cho 1 ván (nếu ván đó chưa có mã còn hiệu lực). */
export const createLolCodeForGame = async (matchId, gameNo) => {
  await ensureLolTournamentTables();
  const mode = lolTournamentMode();
  const match = await loadMatch(matchId);
  if (!match) throw new RiotError(404, "Không tìm thấy trận");
  const { rows: existing } = await pool.query(
    "SELECT code FROM lol_tournament_codes WHERE match_id = $1 AND game_no = $2 AND mode = $3 AND status IN ('open', 'played')",
    [match.id, gameNo, mode],
  );
  if (existing[0]) return existing[0].code;

  const players = await loadMatchPlayers(match);
  const all = [...players.teamA, ...players.teamB];
  const puuids = [...new Set(all.map((player) => player.puuid).filter(Boolean))];
  const missing = all.filter((player) => !player.puuid).map((player) => toNumber(player.user_id));

  const riotTournamentId = await getRiotTournamentId(mode, { id: match.tid, name: match.tournament_name });
  const codes = await riot(mode, "POST", `/codes?tournamentId=${riotTournamentId}&count=1`, {
    allowedParticipants: puuids,
    enoughPlayers: puuids.length >= MAX_PLAYERS,
    mapType: "SUMMONERS_RIFT",
    pickType: "TOURNAMENT_DRAFT",
    spectatorType: "ALL",
    teamSize: 5,
    metadata: JSON.stringify({ dcn_match_id: toNumber(match.id), game_no: gameNo }),
  });
  const code = Array.isArray(codes) ? codes[0] : null;
  if (!code) throw new RiotError(502, "Riot không trả mã giải đấu");
  await pool.query(
    `INSERT INTO lol_tournament_codes (code, match_id, game_no, mode, allowed_puuids, missing_user_ids)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [code, match.id, gameNo, mode, puuids, missing],
  );
  notifyUsers(await matchAudience(match, players), { event: "lol_code_ready", match_id: toNumber(match.id), game_no: gameNo });
  logger.info(`[lol-tournament] trận ${match.id} ván ${gameNo}: mã ${code} (${mode}), thiếu puuid: ${missing.length}`);
  return code;
};

const gamesPlayed = (match) => (toNumber(match.score_a) ?? 0) + (toNumber(match.score_b) ?? 0);

/**
 * Tới hạn chốt đội hình LMHT (giờ trận − 15 phút, để kịp vào phòng), 2 đội đã chốt (match_lineup_checks = 'ok'), chưa có mã → tạo mã ván kế tiếp.
 * Chỉ giải bật chốt đội hình; trận quá giờ > 6 tiếng bỏ qua.
 */
export const autoCreateLolCodes = async ({ matchId = null } = {}) => {
  await ensureLolTournamentTables();
  const { rows } = await pool.query(
    `SELECT m.id, m.score_a, m.score_b
     FROM matches m
     LEFT JOIN brackets b ON b.id = m.bracket_id
     JOIN tournaments t ON t.id = COALESCE(m.tournament_id, b.tournament_id)
     JOIN games g ON g.id = t.game_id
     JOIN match_lineup_checks c ON c.match_id = m.id AND c.outcome = 'ok'
     WHERE COALESCE((to_jsonb(t) ->> 'lineup_forfeit')::boolean, FALSE)
       AND ($1::bigint IS NULL OR m.id = $1)
       AND LOWER(g.short_name) IN ('lol', 'leagueoflegends')
       AND m.date_scheduled - INTERVAL '${LOL_LINEUP_CLOSE_MINUTES} minutes' <= NOW()
       AND m.date_scheduled > NOW() - INTERVAL '6 hours'
       AND LOWER(COALESCE(m.status, '')) <> ALL($2::text[])
       AND NOT EXISTS (SELECT 1 FROM lol_tournament_codes lc WHERE lc.match_id = m.id AND lc.status = 'open')`,
    [matchId, COMPLETED],
  );
  const created = [];
  for (const row of rows) {
    try {
      created.push(await createLolCodeForGame(toNumber(row.id), gamesPlayed(row) + 1));
    } catch (error) {
      logger.error(`[lol-tournament] tạo mã trận ${row.id} lỗi:`, error instanceof Error ? error.message : String(error));
    }
  }
  return created;
};

/** Thêm 1 dòng match_games cho ván vừa xong (mã ván = PLATFORM_gameId để match-v5 lấy chi tiết). */
const insertMatchGame = async (match, codeRow, game, winnerTeamId) => {
  const infoGameId = `${lolPlatform()}_${game.gameId}`;
  const { rows: existing } = await pool.query(
    "SELECT id FROM match_games WHERE match_id = $1 AND info_game_id = $2",
    [match.id, infoGameId],
  );
  if (existing[0]) return toNumber(existing[0].id);
  const winnerIsA = winnerTeamId === toNumber(match.team_a_id);
  const { rows } = await pool.query(
    `INSERT INTO match_games (match_id, game_no, info_game_id, game_id, team_a_score, team_b_score, winner_team_id,
                              played_at, external_provider, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'riot-lol-tournament', $9::jsonb)
     RETURNING id`,
    [
      match.id,
      codeRow.game_no,
      infoGameId,
      toNumber(match.game_row_id),
      winnerIsA ? 1 : 0,
      winnerIsA ? 0 : 1,
      winnerTeamId,
      game.startTime ? new Date(Number(game.startTime)) : new Date(),
      JSON.stringify({ tournament_code: codeRow.code, game }),
    ],
  );
  return toNumber(rows[0].id);
};

/** Xử lý 1 ván Riot báo đã xong: xác định đội thắng theo puuid → cập nhật tỉ số / kết thúc trận / mã ván sau. */
export const processGame = async (codeRow, game) => {
  const match = await loadMatch(codeRow.match_id);
  if (!match || COMPLETED.includes(String(match.status ?? "").toLowerCase())) {
    await pool.query("UPDATE lol_tournament_codes SET status = 'played', riot_game_id = $2 WHERE code = $1", [codeRow.code, game.gameId]);
    return { skipped: true };
  }

  const players = await loadMatchPlayers(match);
  const teamOf = new Map();
  players.teamA.forEach((player) => player.puuid && teamOf.set(player.puuid, toNumber(match.team_a_id)));
  players.teamB.forEach((player) => player.puuid && teamOf.set(player.puuid, toNumber(match.team_b_id)));
  const count = (team) => {
    const votes = new Map();
    for (const entry of team ?? []) {
      const teamId = teamOf.get(entry.puuid);
      if (teamId) votes.set(teamId, (votes.get(teamId) ?? 0) + 1);
    }
    return [...votes.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  };
  const winVote = count(game.winningTeam);
  const loseVote = count(game.losingTeam);
  const winnerTeamId = winVote?.[0] ?? null;
  // Đội thắng phải khác đội thua (theo đa số puuid) — không thì BTC xem lại
  if (!winnerTeamId || (loseVote && loseVote[0] === winnerTeamId)) {
    await pool.query(
      "UPDATE lol_tournament_codes SET status = 'review', riot_game_id = $2, note = $3 WHERE code = $1",
      [codeRow.code, game.gameId, "Không xác định được đội thắng theo puuid — BTC nhập kết quả tay"],
    );
    logger.error(`[lol-tournament] mã ${codeRow.code}: không xác định đội thắng (gameId ${game.gameId})`);
    return { review: true };
  }

  const matchGameId = await insertMatchGame(match, codeRow, game, winnerTeamId);
  await pool.query(
    "UPDATE lol_tournament_codes SET status = 'played', riot_game_id = $2, winner_team_id = $3, match_game_id = $4 WHERE code = $1",
    [codeRow.code, game.gameId, winnerTeamId, matchGameId],
  );

  const winnerIsA = winnerTeamId === toNumber(match.team_a_id);
  const scoreA = (toNumber(match.score_a) ?? 0) + (winnerIsA ? 1 : 0);
  const scoreB = (toNumber(match.score_b) ?? 0) + (winnerIsA ? 0 : 1);
  const need = forfeitWins(match.best_of);
  if (scoreA >= need || scoreB >= need) {
    await completeMatch({ matchId: match.id, tournamentId: match.tid, scoreA, scoreB, winnerTeamId });
    notifyUsers(await matchAudience(match, players), { event: "lol_match_finished", match_id: toNumber(match.id) });
    return { finished: true, scoreA, scoreB };
  }
  await pool.query("UPDATE matches SET score_a = $1, score_b = $2, status = 'ongoing' WHERE id = $3", [scoreA, scoreB, match.id]);
  await createLolCodeForGame(match.id, codeRow.game_no + 1);
  return { next_game: codeRow.game_no + 1, scoreA, scoreB };
};

/** Hỏi Riot kết quả các mã đang mở (sau callback, hoặc định kỳ). */
export const pollLolCodes = async ({ code = null, matchId = null, force = false } = {}) => {
  await ensureLolTournamentTables();
  const { rows } = await pool.query(
    `SELECT * FROM lol_tournament_codes
     WHERE status = 'open' AND mode = 'live'
       AND ($1::text IS NULL OR code = $1) AND ($2::bigint IS NULL OR match_id = $2)
       AND ($3 OR (created_at < NOW() - INTERVAL '10 minutes' AND (polled_at IS NULL OR polled_at < NOW() - INTERVAL '2 minutes')))
     ORDER BY created_at
     LIMIT 10`,
    [code, matchId, force],
  );
  const results = [];
  for (const row of rows) {
    try {
      await pool.query("UPDATE lol_tournament_codes SET polled_at = NOW() WHERE code = $1", [row.code]);
      const games = await riot("live", "GET", `/games/by-code/${encodeURIComponent(row.code)}`);
      const game = (Array.isArray(games) ? games : [])
        .filter((item) => item?.gameId && (item.winningTeam?.length || item.losingTeam?.length))
        .sort((a, b) => Number(a.startTime ?? 0) - Number(b.startTime ?? 0))[0];
      if (game) results.push({ code: row.code, ...(await processGame(row, game)) });
    } catch (error) {
      // 404 = chưa có ván nào với mã này
      if (error?.status !== 404) {
        logger.error(`[lol-tournament] hỏi kết quả mã ${row.code} lỗi:`, error instanceof Error ? error.message : String(error));
      }
    }
  }
  return results;
};

/** Callback từ Riot: chỉ dùng làm tín hiệu — kết quả luôn lấy lại từ games/by-code (đã xác thực qua API key). */
export const handleLolCallback = async (body) => {
  const shortCode = String(body?.shortCode ?? body?.short_code ?? "").trim();
  if (!shortCode) return { ignored: true };
  return pollLolCodes({ code: shortCode, force: true });
};

/** Mã của 1 trận (cho trang trận). */
export const listMatchCodes = async (matchId) => {
  await ensureLolTournamentTables();
  const { rows } = await pool.query(
    `SELECT code, game_no, mode, status, winner_team_id, missing_user_ids, note, created_at
     FROM lol_tournament_codes WHERE match_id = $1 AND mode = $2 ORDER BY game_no, created_at`,
    [matchId, lolTournamentMode()],
  );
  return rows;
};

/** Người được xem mã của trận: người thi đấu, quản lý 2 đội (BTC kiểm ở controller). */
export const canSeeMatchCodes = async (userId, matchId) => {
  const match = await loadMatch(matchId);
  if (!match) return false;
  const players = await loadMatchPlayers(match);
  return (await matchAudience(match, players)).includes(toNumber(userId));
};

/** Mã đang mở của các trận tôi thi đấu / quản lý (dải thông báo). */
export const listMyOpenCodes = async (userId) => {
  await ensureLolTournamentTables();
  const { rows } = await pool.query(
    `SELECT lc.code, lc.game_no, lc.match_id, tr.slug, LOWER(g.short_name) AS game,
            ta.short_name AS a_tag, ta.name AS a_name, tb.short_name AS b_tag, tb.name AS b_name
     FROM lol_tournament_codes lc
     JOIN matches m ON m.id = lc.match_id
     LEFT JOIN brackets b ON b.id = m.bracket_id
     JOIN tournaments tr ON tr.id = COALESCE(m.tournament_id, b.tournament_id)
     LEFT JOIN games g ON g.id = tr.game_id
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     WHERE lc.status = 'open' AND lc.mode = $1 AND lc.created_at > NOW() - INTERVAL '12 hours'
       AND LOWER(COALESCE(m.status, '')) <> ALL($2::text[])
     ORDER BY lc.created_at DESC
     LIMIT 20`,
    [lolTournamentMode(), COMPLETED],
  );
  const mine = [];
  for (const row of rows) {
    if (await canSeeMatchCodes(userId, row.match_id)) {
      mine.push({
        code: row.code,
        game_no: row.game_no,
        match_id: toNumber(row.match_id),
        team_a: { name: row.a_name, tag: row.a_tag },
        team_b: { name: row.b_name, tag: row.b_tag },
        link: row.game && row.slug ? `/tournament/${row.game}/${row.slug}/match/${row.match_id}` : `/match/${row.match_id}`,
      });
    }
  }
  return mine;
};

let timer = null;
let running = false;
/** Mỗi phút: tạo mã cho trận tới giờ + hỏi kết quả mã đang mở. */
export const startLolTournamentSweeper = (intervalMs = 60_000) => {
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await autoCreateLolCodes();
      await pollLolCodes();
    } catch (error) {
      if (error?.code !== "42P01" && error?.code !== "42703") {
        logger.error("[lol-tournament] sweep lỗi:", error instanceof Error ? error.message : String(error));
      }
    } finally {
      running = false;
    }
  };
  timer = setInterval(() => void tick(), intervalMs);
  void tick();
};
