import logger from "./logger.js";
import { pool } from "./db.js";
import { fetchValorantMatchFromRiot } from "./riotValorantClient.js";

/**
 * BXH tuyển thủ Valorant của 1 giải: chỉ số từng ván lấy từ Riot (val-match-v1) theo mã ván
 * (match_games.info_game_id) và LƯU vào DB — mỗi ván chỉ gọi Riot 1 lần (rate limit).
 * Người chơi ↔ tài khoản: users.riot_puuid_val, rồi riot_account (gameName#tagLine).
 */

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const VALORANT_MIN_MAPS = 2;
/** Mỗi lần mở BXH lấy tối đa N ván mới từ Riot (phần còn lại lấy ở lần sau). */
const SYNC_BATCH = 12;
/** Lỗi lấy ván (sai mã, Riot lỗi) → thử lại sau. */
const RETRY_AFTER_MINUTES = 30;

let ensured = null;
const ensureTables = () => {
  ensured ??= pool
    .query(
      `CREATE TABLE IF NOT EXISTS valorant_game_fetches (
         match_game_id BIGINT PRIMARY KEY REFERENCES match_games(id) ON DELETE CASCADE,
         riot_match_id TEXT NOT NULL,
         status        TEXT NOT NULL,          -- 'ok' | 'error'
         error         TEXT,
         rounds        INT,
         fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );
       CREATE TABLE IF NOT EXISTS valorant_game_player_stats (
         match_game_id BIGINT NOT NULL REFERENCES match_games(id) ON DELETE CASCADE,
         puuid         TEXT NOT NULL,
         game_name     TEXT,
         tag_line      TEXT,
         riot_team     TEXT,                   -- 'Red' | 'Blue'
         won           BOOLEAN,
         agent         TEXT,
         agent_icon    TEXT,
         rounds        INT NOT NULL DEFAULT 0,
         kills         INT NOT NULL DEFAULT 0,
         deaths        INT NOT NULL DEFAULT 0,
         assists       INT NOT NULL DEFAULT 0,
         acs           INT NOT NULL DEFAULT 0,
         adr           INT NOT NULL DEFAULT 0,
         hs_pct        INT NOT NULL DEFAULT 0,
         first_kills   INT NOT NULL DEFAULT 0,
         first_deaths  INT NOT NULL DEFAULT 0,
         PRIMARY KEY (match_game_id, puuid)
       )`,
    )
    .catch((error) => {
      ensured = null;
      throw error;
    });
  return ensured;
};

/** Các ván của giải có mã ván Riot (match_games.info_game_id / external_match_id). */
const listTournamentGames = async (tournamentId) => {
  const { rows } = await pool.query(
    `SELECT mg.id AS match_game_id,
            COALESCE(to_jsonb(mg)->>'info_game_id', to_jsonb(mg)->>'external_match_id') AS riot_match_id,
            f.status, f.fetched_at
     FROM match_games mg
     JOIN matches m ON m.id = mg.match_id
     LEFT JOIN brackets b ON b.id = m.bracket_id
     LEFT JOIN valorant_game_fetches f ON f.match_game_id = mg.id
     WHERE COALESCE(m.tournament_id, b.tournament_id) = $1
       AND TRIM(COALESCE(to_jsonb(mg)->>'info_game_id', to_jsonb(mg)->>'external_match_id', '')) <> ''`,
    [tournamentId],
  );
  return rows;
};

/** Lấy từ Riot các ván chưa có (hoặc lỗi lâu rồi) rồi lưu. */
export const syncValorantTournamentStats = async (tournamentId) => {
  await ensureTables();
  const now = Date.now();
  const pending = (await listTournamentGames(tournamentId)).filter(
    (game) =>
      !game.status ||
      (game.status === "error" && now - new Date(game.fetched_at).getTime() > RETRY_AFTER_MINUTES * 60_000),
  );

  for (const game of pending.slice(0, SYNC_BATCH)) {
    const riotMatchId = String(game.riot_match_id).trim();
    try {
      const { matchData } = await fetchValorantMatchFromRiot(riotMatchId);
      const rounds = matchData.roundResults?.length ?? 0;
      const winner = [...(matchData.teams ?? [])].sort((a, b) => (b.roundsWon ?? 0) - (a.roundsWon ?? 0))[0];
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM valorant_game_player_stats WHERE match_game_id = $1", [game.match_game_id]);
        for (const player of matchData.players ?? []) {
          const stats = player.stats ?? {};
          await client.query(
            `INSERT INTO valorant_game_player_stats
               (match_game_id, puuid, game_name, tag_line, riot_team, won, agent, agent_icon, rounds,
                kills, deaths, assists, acs, adr, hs_pct, first_kills, first_deaths)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
            [
              game.match_game_id,
              player.puuid,
              player.gameName ?? null,
              player.tagLine ?? null,
              player.teamId ?? null,
              winner ? player.teamId === winner.teamId : null,
              player.characterName ?? null,
              player.imgCharacter ?? null,
              rounds,
              stats.kills ?? 0,
              stats.deaths ?? 0,
              stats.assists ?? 0,
              stats.acs ?? 0,
              stats.adr ?? 0,
              stats.headshotPercentage ?? 0,
              stats.firstKills ?? 0,
              stats.firstDeaths ?? 0,
            ],
          );
        }
        await client.query(
          `INSERT INTO valorant_game_fetches (match_game_id, riot_match_id, status, rounds) VALUES ($1, $2, 'ok', $3)
           ON CONFLICT (match_game_id) DO UPDATE SET riot_match_id = EXCLUDED.riot_match_id, status = 'ok',
             error = NULL, rounds = EXCLUDED.rounds, fetched_at = NOW()`,
          [game.match_game_id, riotMatchId, rounds],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[valorant-stats] ván ${game.match_game_id} (${riotMatchId}) lỗi: ${message}`);
      await pool.query(
        `INSERT INTO valorant_game_fetches (match_game_id, riot_match_id, status, error) VALUES ($1, $2, 'error', $3)
         ON CONFLICT (match_game_id) DO UPDATE SET status = 'error', error = EXCLUDED.error, fetched_at = NOW()`,
        [game.match_game_id, riotMatchId, message.slice(0, 500)],
      );
    }
  }
  return { pending: Math.max(0, pending.length - SYNC_BATCH) };
};

const riotKey = (gameName, tagLine) =>
  gameName && tagLine ? `${String(gameName).trim()}#${String(tagLine).trim()}`.toLowerCase() : null;

/** BXH tuyển thủ Valorant (cùng dạng hàng với BXH AOV + chỉ số Valorant). */
export const getValorantPlayerLeaderboard = async (tournamentId) => {
  const id = toNumber(tournamentId);
  if (!id) return { data: [], pending: 0 };
  const { pending } = await syncValorantTournamentStats(id);

  const { rows: statRows } = await pool.query(
    `SELECT s.*
     FROM valorant_game_player_stats s
     JOIN match_games mg ON mg.id = s.match_game_id
     JOIN matches m ON m.id = mg.match_id
     LEFT JOIN brackets b ON b.id = m.bracket_id
     WHERE COALESCE(m.tournament_id, b.tournament_id) = $1`,
    [id],
  );

  // Toàn bộ người trong đội hình đăng ký giải (kể cả chưa đấu)
  const { rows: roster } = await pool.query(
    `SELECT DISTINCT ON (u.id)
            u.id AS user_id, u.username, u.nickname, u.profile_picture, u.riot_account,
            to_jsonb(u)->>'riot_puuid_val' AS riot_puuid_val,
            t.id AS team_id, t.name AS team_name, t.short_name AS team_short_name, t.logo_url AS team_logo_url
     FROM tournament_teams tt
     JOIN tournament_team_players ttp ON ttp.tournament_team_id = tt.id
     JOIN users u ON u.id = ttp.user_id
     LEFT JOIN teams t ON t.id = tt.team_id
     WHERE tt.tournament_id = $1
     ORDER BY u.id, ttp.id`,
    [id],
  );

  // Người chơi trong ván nhưng không ở đội hình giải (vd. dự bị chưa đăng ký) → vẫn nhận theo puuid / Riot ID
  const puuids = [...new Set(statRows.map((row) => row.puuid))];
  const { rows: linkedUsers } = puuids.length
    ? await pool.query(
        `SELECT id AS user_id, username, nickname, profile_picture, riot_account,
                to_jsonb(u)->>'riot_puuid_val' AS riot_puuid_val
         FROM users u
         WHERE to_jsonb(u)->>'riot_puuid_val' = ANY($1::text[])`,
        [puuids],
      )
    : { rows: [] };

  const byPuuid = new Map();
  const byRiot = new Map();
  for (const user of [...linkedUsers, ...roster]) {
    if (user.riot_puuid_val) byPuuid.set(user.riot_puuid_val, user);
    if (user.riot_account) byRiot.set(String(user.riot_account).trim().toLowerCase(), user);
  }

  const buckets = new Map();
  const bucketFor = (key, base) => {
    if (!buckets.has(key)) {
      buckets.set(key, {
        ...base,
        games_played: 0,
        wins: 0,
        rounds: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        acs_sum: 0,
        adr_sum: 0,
        hs_sum: 0,
        first_kills: 0,
        first_deaths: 0,
        agents: new Map(),
      });
    }
    return buckets.get(key);
  };
  const userBase = (user) => ({
    user_id: toNumber(user.user_id),
    display_name: String(user.nickname ?? "").trim() || String(user.username ?? "").trim() || `User ${user.user_id}`,
    ign: user.riot_account ?? null,
    profile_picture: user.profile_picture ?? null,
    team_id: toNumber(user.team_id),
    team_name: user.team_name ?? null,
    team_short_name: user.team_short_name ?? null,
    team_logo_url: user.team_logo_url ?? null,
  });

  for (const user of roster) bucketFor(`user:${user.user_id}`, userBase(user));

  for (const row of statRows) {
    const user = byPuuid.get(row.puuid) ?? byRiot.get(riotKey(row.game_name, row.tag_line));
    const riotId = row.game_name ? `${row.game_name}#${row.tag_line ?? ""}` : row.puuid.slice(0, 8);
    const rosterUser = user ? roster.find((entry) => String(entry.user_id) === String(user.user_id)) : null;
    const bucket = user
      ? bucketFor(`user:${user.user_id}`, userBase(rosterUser ?? user))
      : bucketFor(`puuid:${row.puuid}`, {
          user_id: null,
          display_name: riotId,
          ign: riotId,
          profile_picture: null,
          team_id: null,
          team_name: null,
          team_short_name: null,
          team_logo_url: null,
        });
    const rounds = Math.max(1, Number(row.rounds) || 1);
    bucket.games_played += 1;
    bucket.wins += row.won ? 1 : 0;
    bucket.rounds += rounds;
    bucket.kills += row.kills;
    bucket.deaths += row.deaths;
    bucket.assists += row.assists;
    // ACS / ADR / HS% trung bình theo số vòng
    bucket.acs_sum += row.acs * rounds;
    bucket.adr_sum += row.adr * rounds;
    bucket.hs_sum += row.hs_pct * rounds;
    bucket.first_kills += row.first_kills;
    bucket.first_deaths += row.first_deaths;
    if (row.agent) {
      const agent = bucket.agents.get(row.agent) ?? { name: row.agent, icon: row.agent_icon, count: 0 };
      agent.count += 1;
      bucket.agents.set(row.agent, agent);
    }
  }

  const rows = [...buckets.values()].map((bucket) => {
    const qualified = bucket.games_played >= VALORANT_MIN_MAPS;
    const kda = bucket.deaths > 0 ? (bucket.kills + bucket.assists) / bucket.deaths : bucket.kills + bucket.assists;
    const rounds = bucket.rounds || 1;
    const acs = bucket.games_played ? Math.round(bucket.acs_sum / rounds) : null;
    const { agents, acs_sum, adr_sum, hs_sum, rounds: _rounds, ...rest } = bucket;
    return {
      ...rest,
      qualified,
      kills: qualified ? bucket.kills : null,
      deaths: qualified ? bucket.deaths : null,
      assists: qualified ? bucket.assists : null,
      kda: qualified ? Number(kda.toFixed(2)) : null,
      acs: qualified ? acs : null,
      adr: qualified ? Math.round(adr_sum / rounds) : null,
      hs_pct: qualified ? Math.round(hs_sum / rounds) : null,
      first_kills: qualified ? bucket.first_kills : null,
      first_deaths: qualified ? bucket.first_deaths : null,
      top_agents: [...agents.values()].sort((a, b) => b.count - a.count).slice(0, 3),
      _sort: qualified ? acs ?? -1 : -2,
      _kda: qualified ? kda : -1,
    };
  });

  rows.sort(
    (a, b) =>
      (a.qualified === b.qualified ? 0 : a.qualified ? -1 : 1) ||
      b._sort - a._sort ||
      b._kda - a._kda ||
      b.games_played - a.games_played ||
      String(a.display_name).localeCompare(String(b.display_name), "vi"),
  );

  let rank = 0;
  return {
    pending,
    data: rows.map(({ _sort, _kda, ...row }) => ({ ...row, rank: row.qualified ? ++rank : null })),
  };
};
