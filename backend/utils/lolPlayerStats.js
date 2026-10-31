import logger from "./logger.js";
import { pool } from "./db.js";

/**
 * BXH tuyển thủ LMHT của 1 giải: chỉ số từng ván từ Riot match-v5 (cụm sea cho máy chủ VN) theo mã ván
 * match_games.info_game_id dạng "<PLATFORM>_<gameId>" (vd. VN2_1493491978) — mã phòng giải đấu tự ghi
 * (utils/lolTournament.js) hoặc BTC nhập tay. Mỗi ván gọi Riot 1 lần rồi LƯU DB.
 * Người chơi ↔ tài khoản: users.riot_puuid_lol, rồi riot_account (gameName#tagLine).
 */

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const LOL_MIN_GAMES = 2;
const SYNC_BATCH = 12;
const RETRY_AFTER_MINUTES = 30;
const MATCH_ID_RE = /^[A-Z0-9]+_\d+$/;
const POSITIONS = new Set(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);
const matchRegion = () => String(process.env.RIOT_LOL_MATCH_REGION ?? "sea").trim().toLowerCase();
const apiKey = () => String(process.env.LOL_RIOT_API_KEY ?? "").trim();

let ensured = null;
const ensureTables = () => {
  ensured ??= pool
    .query(
      `CREATE TABLE IF NOT EXISTS lol_game_fetches (
         match_game_id BIGINT PRIMARY KEY REFERENCES match_games(id) ON DELETE CASCADE,
         riot_match_id TEXT NOT NULL,
         status        TEXT NOT NULL,
         error         TEXT,
         duration_sec  INT,
         fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );
       CREATE TABLE IF NOT EXISTS lol_game_player_stats (
         match_game_id BIGINT NOT NULL REFERENCES match_games(id) ON DELETE CASCADE,
         puuid         TEXT NOT NULL,
         game_name     TEXT,
         tag_line      TEXT,
         riot_team     INT,                    -- 100 (xanh) | 200 (đỏ)
         won           BOOLEAN,
         champion_id   INT,
         champion      TEXT,
         position      TEXT,
         duration_sec  INT NOT NULL DEFAULT 0,
         kills         INT NOT NULL DEFAULT 0,
         deaths        INT NOT NULL DEFAULT 0,
         assists       INT NOT NULL DEFAULT 0,
         cs            INT NOT NULL DEFAULT 0,
         gold          INT NOT NULL DEFAULT 0,
         damage        INT NOT NULL DEFAULT 0,
         vision        INT NOT NULL DEFAULT 0,
         PRIMARY KEY (match_game_id, puuid)
       )`,
    )
    .catch((error) => {
      ensured = null;
      throw error;
    });
  return ensured;
};

const fetchMatch = async (riotMatchId) => {
  const key = apiKey();
  if (!key) throw new Error("Chưa cấu hình LOL_RIOT_API_KEY");
  const response = await fetch(
    `https://${matchRegion()}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(riotMatchId)}`,
    { headers: { "X-Riot-Token": key, Accept: "application/json" } },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`match-v5 ${response.status} ${text.slice(0, 120)}`);
  return JSON.parse(text);
};

export const syncLolTournamentStats = async (tournamentId) => {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT mg.id AS match_game_id,
            UPPER(TRIM(COALESCE(to_jsonb(mg)->>'info_game_id', to_jsonb(mg)->>'external_match_id'))) AS riot_match_id,
            f.status, f.fetched_at
     FROM match_games mg
     JOIN matches m ON m.id = mg.match_id
     LEFT JOIN brackets b ON b.id = m.bracket_id
     LEFT JOIN lol_game_fetches f ON f.match_game_id = mg.id
     WHERE COALESCE(m.tournament_id, b.tournament_id) = $1`,
    [tournamentId],
  );
  const now = Date.now();
  const pending = rows.filter(
    (game) =>
      MATCH_ID_RE.test(game.riot_match_id ?? "") &&
      (!game.status ||
        (game.status === "error" && now - new Date(game.fetched_at).getTime() > RETRY_AFTER_MINUTES * 60_000)),
  );

  for (const game of pending.slice(0, SYNC_BATCH)) {
    try {
      const payload = await fetchMatch(game.riot_match_id);
      const info = payload?.info ?? {};
      const duration = Number(info.gameDuration ?? 0);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM lol_game_player_stats WHERE match_game_id = $1", [game.match_game_id]);
        for (const player of info.participants ?? []) {
          await client.query(
            `INSERT INTO lol_game_player_stats
               (match_game_id, puuid, game_name, tag_line, riot_team, won, champion_id, champion, position, duration_sec,
                kills, deaths, assists, cs, gold, damage, vision)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
            [
              game.match_game_id,
              player.puuid,
              player.riotIdGameName ?? null,
              player.riotIdTagline ?? null,
              player.teamId ?? null,
              Boolean(player.win),
              player.championId ?? null,
              player.championName ?? null,
              // Vị trí Summoner's Rift; ARAM / phòng thường trả rỗng hoặc "Invalid"
              POSITIONS.has(player.teamPosition) ? player.teamPosition : null,
              duration,
              player.kills ?? 0,
              player.deaths ?? 0,
              player.assists ?? 0,
              Number(player.totalMinionsKilled ?? 0) + Number(player.neutralMinionsKilled ?? 0),
              player.goldEarned ?? 0,
              player.totalDamageDealtToChampions ?? 0,
              player.visionScore ?? 0,
            ],
          );
        }
        await client.query(
          `INSERT INTO lol_game_fetches (match_game_id, riot_match_id, status, duration_sec) VALUES ($1, $2, 'ok', $3)
           ON CONFLICT (match_game_id) DO UPDATE SET riot_match_id = EXCLUDED.riot_match_id, status = 'ok',
             error = NULL, duration_sec = EXCLUDED.duration_sec, fetched_at = NOW()`,
          [game.match_game_id, game.riot_match_id, duration],
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
      logger.error(`[lol-stats] ván ${game.match_game_id} (${game.riot_match_id}) lỗi: ${message}`);
      await pool.query(
        `INSERT INTO lol_game_fetches (match_game_id, riot_match_id, status, error) VALUES ($1, $2, 'error', $3)
         ON CONFLICT (match_game_id) DO UPDATE SET status = 'error', error = EXCLUDED.error, fetched_at = NOW()`,
        [game.match_game_id, game.riot_match_id, message.slice(0, 500)],
      );
    }
  }
  return { pending: Math.max(0, pending.length - SYNC_BATCH) };
};

const riotKey = (gameName, tagLine) =>
  gameName && tagLine ? `${String(gameName).trim()}#${String(tagLine).trim()}`.toLowerCase() : null;

const championIcon = (championId) =>
  championId ? `https://cdn.communitydragon.org/latest/champion/${championId}/square` : null;

/** BXH tuyển thủ LMHT (cùng dạng hàng với AOV / Valorant + chỉ số LMHT). Xếp theo KDA. */
export const getLolPlayerLeaderboard = async (tournamentId) => {
  const id = toNumber(tournamentId);
  if (!id) return { data: [], pending: 0 };
  const { pending } = await syncLolTournamentStats(id);

  const { rows: statRows } = await pool.query(
    `SELECT s.*
     FROM lol_game_player_stats s
     JOIN match_games mg ON mg.id = s.match_game_id
     JOIN matches m ON m.id = mg.match_id
     LEFT JOIN brackets b ON b.id = m.bracket_id
     WHERE COALESCE(m.tournament_id, b.tournament_id) = $1`,
    [id],
  );
  const { rows: roster } = await pool.query(
    `SELECT DISTINCT ON (u.id)
            u.id AS user_id, u.username, u.nickname, u.profile_picture, u.riot_account,
            to_jsonb(u)->>'riot_puuid_lol' AS riot_puuid_lol,
            t.id AS team_id, t.name AS team_name, t.short_name AS team_short_name, t.logo_url AS team_logo_url
     FROM tournament_teams tt
     JOIN tournament_team_players ttp ON ttp.tournament_team_id = tt.id
     JOIN users u ON u.id = ttp.user_id
     LEFT JOIN teams t ON t.id = tt.team_id
     WHERE tt.tournament_id = $1
     ORDER BY u.id, ttp.id`,
    [id],
  );
  const puuids = [...new Set(statRows.map((row) => row.puuid))];
  const { rows: linkedUsers } = puuids.length
    ? await pool.query(
        `SELECT id AS user_id, username, nickname, profile_picture, riot_account,
                to_jsonb(u)->>'riot_puuid_lol' AS riot_puuid_lol
         FROM users u WHERE to_jsonb(u)->>'riot_puuid_lol' = ANY($1::text[])`,
        [puuids],
      )
    : { rows: [] };

  const byPuuid = new Map();
  const byRiot = new Map();
  for (const user of [...linkedUsers, ...roster]) {
    if (user.riot_puuid_lol) byPuuid.set(user.riot_puuid_lol, user);
    if (user.riot_account) byRiot.set(String(user.riot_account).trim().toLowerCase(), user);
  }

  const buckets = new Map();
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
  const bucketFor = (key, base) => {
    if (!buckets.has(key)) {
      buckets.set(key, {
        ...base,
        games_played: 0,
        wins: 0,
        seconds: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        cs: 0,
        gold: 0,
        damage: 0,
        vision: 0,
        champions: new Map(),
        positions: new Map(),
      });
    }
    return buckets.get(key);
  };
  for (const user of roster) bucketFor(`user:${user.user_id}`, userBase(user));

  for (const row of statRows) {
    const user = byPuuid.get(row.puuid) ?? byRiot.get(riotKey(row.game_name, row.tag_line));
    const rosterUser = user ? roster.find((entry) => String(entry.user_id) === String(user.user_id)) : null;
    const riotId = row.game_name ? `${row.game_name}#${row.tag_line ?? ""}` : row.puuid.slice(0, 8);
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
    bucket.games_played += 1;
    bucket.wins += row.won ? 1 : 0;
    bucket.seconds += Number(row.duration_sec) || 0;
    bucket.kills += row.kills;
    bucket.deaths += row.deaths;
    bucket.assists += row.assists;
    bucket.cs += row.cs;
    bucket.gold += row.gold;
    bucket.damage += row.damage;
    bucket.vision += row.vision;
    if (row.champion) {
      const champ = bucket.champions.get(row.champion) ?? { name: row.champion, icon: championIcon(row.champion_id), count: 0 };
      champ.count += 1;
      bucket.champions.set(row.champion, champ);
    }
    if (row.position) bucket.positions.set(row.position, (bucket.positions.get(row.position) ?? 0) + 1);
  }

  const rows = [...buckets.values()].map((bucket) => {
    const qualified = bucket.games_played >= LOL_MIN_GAMES;
    const minutes = bucket.seconds / 60 || 1;
    const kda = bucket.deaths > 0 ? (bucket.kills + bucket.assists) / bucket.deaths : bucket.kills + bucket.assists;
    const { champions, positions, seconds, cs, gold, damage, vision, ...rest } = bucket;
    return {
      ...rest,
      qualified,
      kills: qualified ? bucket.kills : null,
      deaths: qualified ? bucket.deaths : null,
      assists: qualified ? bucket.assists : null,
      kda: qualified ? Number(kda.toFixed(2)) : null,
      cs_per_min: qualified ? Number((cs / minutes).toFixed(1)) : null,
      gold_per_min: qualified ? Math.round(gold / minutes) : null,
      damage_per_min: qualified ? Math.round(damage / minutes) : null,
      vision_per_game: qualified ? Number((vision / bucket.games_played).toFixed(1)) : null,
      main_position: [...positions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      top_agents: [...champions.values()].sort((a, b) => b.count - a.count).slice(0, 3),
      _kda: qualified ? kda : -1,
    };
  });
  rows.sort(
    (a, b) =>
      (a.qualified === b.qualified ? 0 : a.qualified ? -1 : 1) ||
      b._kda - a._kda ||
      b.games_played - a.games_played ||
      String(a.display_name).localeCompare(String(b.display_name), "vi"),
  );
  let rank = 0;
  return { pending, data: rows.map(({ _kda, ...row }) => ({ ...row, rank: row.qualified ? ++rank : null })) };
};
