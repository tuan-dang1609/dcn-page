import { pool } from "./db.js";
import {
  assignAovPlayersAcrossTeams,
  matchAovIgnToPlayer,
  normalizeAovIgn,
} from "./aovIgnMatch.js";

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

let ensureTablesPromise = null;
let infoGameIdColumnCache = null;
let hasGameIdColumnCache = null;

export const ensureAovStatsTables = async () => {
  if (ensureTablesPromise) return ensureTablesPromise;

  ensureTablesPromise = pool
    .query(
      `
      ALTER TABLE public.match_games
        ADD COLUMN IF NOT EXISTS team_a_score INTEGER,
        ADD COLUMN IF NOT EXISTS team_b_score INTEGER,
        ADD COLUMN IF NOT EXISTS winner_team_id INTEGER,
        ADD COLUMN IF NOT EXISTS played_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS external_provider TEXT,
        ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;

      CREATE TABLE IF NOT EXISTS public.match_game_player_stats (
        id SERIAL PRIMARY KEY,
        match_game_id INTEGER NOT NULL REFERENCES public.match_games(id) ON DELETE CASCADE,
        team_side VARCHAR(10) NOT NULL CHECK (team_side IN ('blue', 'red')),
        team_id INTEGER REFERENCES public.teams(id) ON DELETE SET NULL,
        slot_no SMALLINT NOT NULL CHECK (slot_no BETWEEN 1 AND 5),
        ign TEXT NOT NULL,
        hero_name TEXT,
        performance_score NUMERIC(5, 2),
        kills INTEGER NOT NULL DEFAULT 0,
        deaths INTEGER NOT NULL DEFAULT 0,
        assists INTEGER NOT NULL DEFAULT 0,
        gold INTEGER,
        is_mvp BOOLEAN NOT NULL DEFAULT FALSE,
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        source TEXT NOT NULL DEFAULT 'manual_json',
        raw_payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (match_game_id, team_side, slot_no)
      );

      CREATE INDEX IF NOT EXISTS idx_match_game_player_stats_match_game
        ON public.match_game_player_stats(match_game_id);
      `,
    )
    .catch((error) => {
      ensureTablesPromise = null;
      throw error;
    });

  return ensureTablesPromise;
};

export const getInfoGameIdColumnName = async () => {
  if (infoGameIdColumnCache) return infoGameIdColumnCache;

  const { rows } = await pool.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'match_games'
      AND column_name IN ('info_game_id', 'external_match_id')
    `,
  );

  const columns = new Set(rows.map((row) => String(row.column_name)));
  if (columns.has("info_game_id")) {
    infoGameIdColumnCache = "info_game_id";
    return infoGameIdColumnCache;
  }
  if (columns.has("external_match_id")) {
    infoGameIdColumnCache = "external_match_id";
    return infoGameIdColumnCache;
  }

  throw new Error(
    "match_games must have info_game_id or external_match_id column",
  );
};

const getMatchGamesHasGameIdColumn = async () => {
  if (hasGameIdColumnCache !== null) return hasGameIdColumnCache;

  const { rows } = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'match_games'
      AND column_name = 'game_id'
    LIMIT 1
    `,
  );

  hasGameIdColumnCache = rows.length > 0;
  return hasGameIdColumnCache;
};

const getAovGameId = async () => {
  const { rows } = await pool.query(
    `
    SELECT id
    FROM games
    WHERE LOWER(short_name) IN ('aov', 'arena_of_valor', 'lienquan', 'lq')
    ORDER BY id ASC
    LIMIT 1
    `,
  );

  return rows[0]?.id ? Number(rows[0].id) : null;
};

const resolveWinnerTeamId = (matchRow, winnerSide) => {
  const teamA = toNumber(matchRow?.team_a_id);
  const teamB = toNumber(matchRow?.team_b_id);
  if (!teamA || !teamB) return null;

  if (winnerSide === "blue") return teamA;
  if (winnerSide === "red") return teamB;
  return null;
};

export const findOrCreateMatchGame = async ({
  matchId,
  gameNo,
  aovGameId,
}) => {
  await ensureAovStatsTables();

  const infoGameIdColumn = await getInfoGameIdColumnName();
  const hasGameIdColumn = await getMatchGamesHasGameIdColumn();

  const { rows: existingRows } = await pool.query(
    `
    SELECT id, match_id, game_no
    FROM match_games
    WHERE match_id = $1 AND game_no = $2
    LIMIT 1
    `,
    [matchId, gameNo],
  );

  if (existingRows[0]) {
    return existingRows[0];
  }

  const insertSql = hasGameIdColumn
    ? `
      INSERT INTO match_games (match_id, game_no, ${infoGameIdColumn}, game_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, match_id, game_no
      `
    : `
      INSERT INTO match_games (match_id, game_no, ${infoGameIdColumn})
      VALUES ($1, $2, $3)
      RETURNING id, match_id, game_no
      `;

  const placeholderInfoId = `pending-aov-${matchId}-g${gameNo}`;
  const insertParams = hasGameIdColumn
    ? [matchId, gameNo, placeholderInfoId, aovGameId]
    : [matchId, gameNo, placeholderInfoId];

  const { rows } = await pool.query(insertSql, insertParams);
  return rows[0];
};

const upsertPlayerStats = async ({ matchGameId, teamSide, players, source }) => {
  await pool.query(
    "DELETE FROM match_game_player_stats WHERE match_game_id = $1 AND team_side = $2",
    [matchGameId, teamSide],
  );

  for (const [index, player] of players.entries()) {
    const slotNo = toNumber(player.slot) ?? index + 1;
    const originalIgn =
      String(player.matched_from_ign ?? "").trim() ||
      String(player.ign ?? "").trim();

    await pool.query(
      `
      INSERT INTO match_game_player_stats (
        match_game_id,
        team_side,
        slot_no,
        ign,
        hero_name,
        performance_score,
        kills,
        deaths,
        assists,
        gold,
        is_mvp,
        items,
        source,
        raw_payload
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb)
      `,
      [
        matchGameId,
        teamSide,
        slotNo,
        player.ign,
        null,
        player.performance_score,
        player.kills,
        player.deaths,
        player.assists,
        player.gold,
        false,
        "[]",
        source,
        JSON.stringify({
          ...player,
          ign: originalIgn,
          matched_from_ign: originalIgn,
          display_ign: player.ign,
        }),
      ],
    );
  }
};

const updateMatchGameFromParsed = async ({
  matchGameId,
  infoGameIdColumn,
  parsed,
  matchRow,
  preserveInfoGameId = false,
}) => {
  const blueKills = parsed.game.blue_kills;
  const redKills = parsed.game.red_kills;
  const winnerTeamId = resolveWinnerTeamId(matchRow, parsed.game.winner_side);

  const aovMeta = {
    blue_kills: blueKills,
    red_kills: redKills,
    duration_sec: parsed.game.duration_sec,
    played_at: parsed.game.played_at,
    winner_side: parsed.game.winner_side,
    imported_at: new Date().toISOString(),
  };

  if (preserveInfoGameId) {
    await pool.query(
      `
      UPDATE match_games
      SET team_a_score = $1,
          team_b_score = $2,
          winner_team_id = $3,
          played_at = COALESCE($4::timestamptz, played_at),
          external_provider = COALESCE(external_provider, 'aov'),
          payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('aov', $5::jsonb)
      WHERE id = $6
      `,
      [
        blueKills,
        redKills,
        winnerTeamId,
        parsed.game.played_at,
        JSON.stringify(aovMeta),
        matchGameId,
      ],
    );
    return;
  }

  const infoGameId = `mg:${matchGameId}`;

  await pool.query(
    `
    UPDATE match_games
    SET team_a_score = $1,
        team_b_score = $2,
        winner_team_id = $3,
        played_at = COALESCE($4::timestamptz, played_at),
        external_provider = COALESCE(external_provider, 'aov'),
        payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('aov', $5::jsonb),
        ${infoGameIdColumn} = $6
    WHERE id = $7
    `,
    [
      blueKills,
      redKills,
      winnerTeamId,
      parsed.game.played_at,
      JSON.stringify(aovMeta),
      infoGameId,
      matchGameId,
    ],
  );
};

const loadMatchSidePlayers = async (matchId) => {
  const { rows: matchRows } = await pool.query(
    `
    SELECT m.team_a_id, m.team_b_id, b.tournament_id
    FROM matches m
    JOIN brackets b ON b.id = m.bracket_id
    WHERE m.id = $1
    `,
    [matchId],
  );

  const matchMeta = matchRows[0];
  if (!matchMeta) {
    return { teamAPlayers: [], teamBPlayers: [] };
  }

  const tournamentId = toNumber(matchMeta.tournament_id);
  const teamAId = toNumber(matchMeta.team_a_id);
  const teamBId = toNumber(matchMeta.team_b_id);

  const fetchPlayersForTeam = async (teamId) => {
    if (!teamId || !tournamentId) return [];

    const { rows } = await pool.query(
      `
      SELECT user_id, username, nickname, profile_picture, riot_account
      FROM (
        SELECT
          u.id AS user_id,
          u.username,
          u.nickname,
          u.profile_picture,
          u.riot_account
        FROM tournament_teams tt
        INNER JOIN tournament_team_players ttp ON ttp.tournament_team_id = tt.id
        INNER JOIN users u ON u.id = ttp.user_id
        WHERE tt.tournament_id = $1 AND tt.team_id = $2

        UNION

        SELECT
          u.id AS user_id,
          u.username,
          u.nickname,
          u.profile_picture,
          u.riot_account
        FROM users u
        WHERE u.team_id = $2
      ) team_players
      ORDER BY user_id ASC
      `,
      [tournamentId, teamId],
    );

    return rows;
  };

  const [teamAPlayers, teamBPlayers] = await Promise.all([
    fetchPlayersForTeam(teamAId),
    fetchPlayersForTeam(teamBId),
  ]);

  return { teamAPlayers, teamBPlayers };
};

const remapParsedPlayersToMatchRosters = async (matchId, parsed) => {
  const { teamAPlayers, teamBPlayers } = await loadMatchSidePlayers(matchId);

  // Giữ 5v5: chỉ đảo cả side nếu roster khớp ngược
  const assigned = assignAovPlayersAcrossTeams({
    bluePlayers: parsed.players?.blue ?? [],
    redPlayers: parsed.players?.red ?? [],
    teamAPlayers,
    teamBPlayers,
  });

  const game = { ...(parsed.game ?? {}) };
  if (assigned.swapped) {
    const blueKills = game.blue_kills;
    game.blue_kills = game.red_kills;
    game.red_kills = blueKills;
    if (game.winner_side === "blue") game.winner_side = "red";
    else if (game.winner_side === "red") game.winner_side = "blue";
  }

  return {
    ...parsed,
    game,
    players: {
      blue: assigned.blue,
      red: assigned.red,
    },
    sides_swapped: Boolean(assigned.swapped),
  };
};

export const applyParsedStatsToMatchGame = async ({
  matchGameId,
  matchId,
  parsed,
  source = "manual_json",
  preserveInfoGameId = false,
}) => {
  await ensureAovStatsTables();

  const { rows: matchRows } = await pool.query(
    "SELECT * FROM matches WHERE id = $1",
    [matchId],
  );
  const matchRow = matchRows[0];
  if (!matchRow) {
    throw new Error("Match not found");
  }

  const infoGameIdColumn = await getInfoGameIdColumnName();
  const remapped = await remapParsedPlayersToMatchRosters(matchId, parsed);

  await upsertPlayerStats({
    matchGameId,
    teamSide: "blue",
    players: remapped.players.blue ?? [],
    source,
  });
  await upsertPlayerStats({
    matchGameId,
    teamSide: "red",
    players: remapped.players.red ?? [],
    source,
  });

  await updateMatchGameFromParsed({
    matchGameId,
    infoGameIdColumn,
    parsed: remapped,
    matchRow,
    preserveInfoGameId,
  });

  // Không tự ghi đè score_a/score_b series — giữ theo Score Control

  return getMatchGameStats(matchGameId);
};

export const importAovGameStats = async ({
  matchId,
  gameNo,
  parsed,
  source = "manual_json",
}) => {
  await ensureAovStatsTables();

  const normalizedGameNo = toNumber(gameNo) ?? 1;

  const { rows: matchRows } = await pool.query(
    "SELECT * FROM matches WHERE id = $1",
    [matchId],
  );
  const matchRow = matchRows[0];
  if (!matchRow) {
    throw new Error("Match not found");
  }

  const aovGameId = await getAovGameId();
  const matchGame = await findOrCreateMatchGame({
    matchId,
    gameNo: normalizedGameNo,
    aovGameId,
  });

  const matchGameId = Number(matchGame.id);
  const infoGameIdColumn = await getInfoGameIdColumnName();

  return applyParsedStatsToMatchGame({
    matchGameId,
    matchId,
    parsed,
    source,
    preserveInfoGameId: false,
  });
};

export const getMatchGameStats = async (matchGameId) => {
  await ensureAovStatsTables();

  const { rows: gameRows } = await pool.query(
    `
    SELECT mg.*,
           COALESCE(to_jsonb(mg)->>'info_game_id', to_jsonb(mg)->>'external_match_id') AS info_game_id
    FROM match_games mg
    WHERE mg.id = $1
    LIMIT 1
    `,
    [matchGameId],
  );

  const gameRow = gameRows[0];
  if (!gameRow) return null;

  let payload = gameRow.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }

  const { rows: playerRows } = await pool.query(
    `
    SELECT id, team_side, team_id, slot_no, ign, hero_name,
           performance_score, kills, deaths, assists, gold,
           is_mvp, items, source, raw_payload, created_at
    FROM match_game_player_stats
    WHERE match_game_id = $1
    ORDER BY team_side ASC, slot_no ASC
    `,
    [matchGameId],
  );

  const players = playerRows.map((row) => {
    let raw = row.raw_payload;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = null;
      }
    }

    const matchedFromIgn =
      String(raw?.matched_from_ign ?? "").trim() ||
      String(raw?.ign ?? "").trim() ||
      null;

    // ign cột = tên hiển thị; matched_from_ign = IGN gốc trong game
    return {
      ...row,
      matched_from_ign: matchedFromIgn || null,
    };
  });

  return {
    match_game_id: matchGameId,
    match_id: gameRow.match_id,
    game_no: gameRow.game_no,
    info_game_id: gameRow.info_game_id,
    team_a_score: toNumber(gameRow.team_a_score),
    team_b_score: toNumber(gameRow.team_b_score),
    winner_team_id: toNumber(gameRow.winner_team_id),
    aov: payload?.aov ?? null,
    players,
  };
};

export const getMatchStatsByMatchId = async (matchId) => {
  const { rows } = await pool.query(
    `
    SELECT id
    FROM match_games
    WHERE match_id = $1
    ORDER BY game_no ASC, id ASC
    `,
    [matchId],
  );

  const games = [];
  for (const row of rows) {
    const stats = await getMatchGameStats(row.id);
    if (stats) games.push(stats);
  }

  return games;
};

const normalizeIgnKey = (value) => normalizeAovIgn(value);

const parseRawPayload = (raw) => {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Tổng hợp stats người chơi AOV theo tournament (gom theo user/IGN).
 * Dùng cho BXH cá nhân.
 */
export const getTournamentPlayerStatsLeaderboard = async (tournamentId) => {
  const normalizedTournamentId = toNumber(tournamentId);
  if (!normalizedTournamentId) return [];

  await ensureAovStatsTables();

  const { rows: statRows } = await pool.query(
    `
    SELECT
      ps.ign,
      ps.kills,
      ps.deaths,
      ps.assists,
      ps.performance_score,
      ps.gold,
      ps.team_side,
      ps.raw_payload,
      m.team_a_id,
      m.team_b_id
    FROM match_game_player_stats ps
    INNER JOIN match_games mg ON mg.id = ps.match_game_id
    INNER JOIN matches m ON m.id = mg.match_id
    WHERE m.tournament_id = $1
      AND TRIM(COALESCE(ps.ign, '')) <> ''
    `,
    [normalizedTournamentId],
  );

  const { rows: playerRows } = await pool.query(
    `
    SELECT DISTINCT ON (u.id)
      u.id AS user_id,
      u.username,
      u.nickname,
      u.profile_picture,
      u.riot_account,
      t.id AS team_id,
      t.name AS team_name,
      t.short_name AS team_short_name,
      t.logo_url AS team_logo_url
    FROM tournament_teams tt
    INNER JOIN tournament_team_players ttp ON ttp.tournament_team_id = tt.id
    INNER JOIN users u ON u.id = ttp.user_id
    LEFT JOIN teams t ON t.id = tt.team_id
    WHERE tt.tournament_id = $1
    ORDER BY u.id ASC, ttp.id ASC
    `,
    [normalizedTournamentId],
  );

  const { rows: teamRows } = await pool.query(
    `
    SELECT t.id, t.name, t.short_name, t.logo_url
    FROM tournament_teams tt
    INNER JOIN teams t ON t.id = tt.team_id
    WHERE tt.tournament_id = $1
    `,
    [normalizedTournamentId],
  );

  const teamById = new Map(
    teamRows.map((team) => [Number(team.id), team]),
  );
  const rosterPlayers = playerRows.map((player) => ({
    ...player,
    id: player.user_id,
  }));

  const createBucket = ({
    ign,
    display_name,
    user_id = null,
    profile_picture = null,
    team_id = null,
    team_name = null,
    team_short_name = null,
    team_logo_url = null,
  }) => ({
    ign: String(ign ?? "").trim(),
    display_name: String(display_name ?? "").trim() || String(ign ?? "").trim(),
    user_id,
    profile_picture,
    team_id,
    team_name,
    team_short_name,
    team_logo_url,
    games_played: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    performance_sum: 0,
    performance_count: 0,
    gold_sum: 0,
    gold_count: 0,
  });

  const buckets = new Map();

  // Seed toàn bộ roster giải — kể cả chưa chơi ván nào
  for (const player of rosterPlayers) {
    const displayName =
      String(player.nickname ?? "").trim() ||
      String(player.username ?? "").trim() ||
      `User ${player.user_id}`;
    buckets.set(`user:${player.user_id}`, createBucket({
      ign: displayName,
      display_name: displayName,
      user_id: player.user_id,
      profile_picture: player.profile_picture ?? null,
      team_id: player.team_id ?? null,
      team_name: player.team_name ?? null,
      team_short_name: player.team_short_name ?? null,
      team_logo_url: player.team_logo_url ?? null,
    }));
  }

  if (!statRows.length && !buckets.size) return [];

  const resolveTeamFromMatchSide = (row) => {
    const side = String(row.team_side ?? "").toLowerCase();
    const teamId =
      side === "blue"
        ? toNumber(row.team_a_id)
        : side === "red"
          ? toNumber(row.team_b_id)
          : null;
    if (!teamId) return null;
    return teamById.get(teamId) ?? null;
  };

  const resolveProfile = (row) => {
    const raw = parseRawPayload(row.raw_payload);
    const candidates = [
      row.ign,
      raw?.display_ign,
      raw?.matched_from_ign,
      raw?.ign,
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);

    for (const candidate of candidates) {
      const hit = matchAovIgnToPlayer(candidate, rosterPlayers, {
        minScore: 0.72,
      });
      if (hit?.player) return hit.player;
    }
    return null;
  };

  for (const row of statRows) {
    const profile = resolveProfile(row);
    const matchTeam = resolveTeamFromMatchSide(row);
    const ign = String(row.ign ?? "").trim();
    const bucketKey = profile?.user_id
      ? `user:${profile.user_id}`
      : `ign:${normalizeIgnKey(ign) || ign.toLowerCase()}`;

    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = createBucket({
        ign,
        display_name:
          String(profile?.nickname ?? "").trim() ||
          String(profile?.username ?? "").trim() ||
          ign,
        user_id: profile?.user_id ?? null,
        profile_picture: profile?.profile_picture ?? null,
        team_id: profile?.team_id ?? matchTeam?.id ?? null,
        team_name: profile?.team_name ?? matchTeam?.name ?? null,
        team_short_name:
          profile?.team_short_name ?? matchTeam?.short_name ?? null,
        team_logo_url: profile?.team_logo_url ?? matchTeam?.logo_url ?? null,
      });
      buckets.set(bucketKey, bucket);
    }

    if (!bucket.user_id && profile?.user_id) {
      bucket.user_id = profile.user_id;
      bucket.display_name =
        String(profile.nickname ?? "").trim() ||
        String(profile.username ?? "").trim() ||
        bucket.display_name;
      bucket.profile_picture = profile.profile_picture ?? bucket.profile_picture;
    }
    if (!bucket.profile_picture && profile?.profile_picture) {
      bucket.profile_picture = profile.profile_picture;
    }
    if (!bucket.team_id) {
      const teamSource = profile?.team_id
        ? profile
        : matchTeam
          ? {
              team_id: matchTeam.id,
              team_name: matchTeam.name,
              team_short_name: matchTeam.short_name,
              team_logo_url: matchTeam.logo_url,
            }
          : null;
      if (teamSource) {
        bucket.team_id = teamSource.team_id ?? teamSource.id ?? null;
        bucket.team_name = teamSource.team_name ?? teamSource.name ?? null;
        bucket.team_short_name =
          teamSource.team_short_name ?? teamSource.short_name ?? null;
        bucket.team_logo_url =
          teamSource.team_logo_url ?? teamSource.logo_url ?? null;
      }
    }

    bucket.games_played += 1;
    bucket.kills += Number(row.kills ?? 0);
    bucket.deaths += Number(row.deaths ?? 0);
    bucket.assists += Number(row.assists ?? 0);
    if (row.performance_score != null && Number.isFinite(Number(row.performance_score))) {
      bucket.performance_sum += Number(row.performance_score);
      bucket.performance_count += 1;
    }
    if (row.gold != null && Number.isFinite(Number(row.gold))) {
      bucket.gold_sum += Number(row.gold);
      bucket.gold_count += 1;
    }
  }

  const MIN_GAMES = 3;

  const leaderboard = Array.from(buckets.values()).map((bucket) => {
    const gamesPlayed = bucket.games_played;
    const qualified = gamesPlayed >= MIN_GAMES;
    const kills = bucket.kills;
    const deaths = bucket.deaths;
    const assists = bucket.assists;
    const kda = deaths > 0 ? (kills + assists) / deaths : kills + assists;
    const avgPerformance =
      bucket.performance_count > 0
        ? bucket.performance_sum / bucket.performance_count
        : null;
    const avgGold =
      bucket.gold_count > 0 ? bucket.gold_sum / bucket.gold_count : null;

    return {
      ign: bucket.ign,
      display_name: bucket.display_name,
      user_id: bucket.user_id,
      profile_picture: bucket.profile_picture,
      team_id: toNumber(bucket.team_id),
      team_name: bucket.team_name,
      team_short_name: bucket.team_short_name,
      team_logo_url: bucket.team_logo_url,
      games_played: gamesPlayed,
      qualified,
      kills: qualified ? kills : null,
      deaths: qualified ? deaths : null,
      assists: qualified ? assists : null,
      kda: qualified ? Number(kda.toFixed(2)) : null,
      avg_performance:
        qualified && avgPerformance != null
          ? Number(avgPerformance.toFixed(2))
          : null,
      avg_gold:
        qualified && avgGold != null ? Math.round(avgGold) : null,
      _sort_avg: qualified ? avgPerformance ?? -1 : -2,
      _sort_kda: qualified ? kda : -1,
    };
  });

  leaderboard.sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    if (b._sort_avg !== a._sort_avg) return b._sort_avg - a._sort_avg;
    if (b._sort_kda !== a._sort_kda) return b._sort_kda - a._sort_kda;
    if (b.games_played !== a.games_played) return b.games_played - a.games_played;
    return String(a.display_name).localeCompare(String(b.display_name), "vi");
  });

  return leaderboard.map((row, index) => {
    const { _sort_avg, _sort_kda, ...rest } = row;
    return {
      ...rest,
      rank: row.qualified ? index + 1 : null,
    };
  });
};
