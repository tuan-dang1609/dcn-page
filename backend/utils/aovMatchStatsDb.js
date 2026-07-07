import { pool } from "./db.js";

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

const getInfoGameIdColumnName = async () => {
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
        JSON.stringify(player),
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

  await upsertPlayerStats({
    matchGameId,
    teamSide: "blue",
    players: parsed.players.blue ?? [],
    source,
  });
  await upsertPlayerStats({
    matchGameId,
    teamSide: "red",
    players: parsed.players.red ?? [],
    source,
  });

  await updateMatchGameFromParsed({
    matchGameId,
    infoGameIdColumn,
    parsed,
    matchRow,
    preserveInfoGameId,
  });

  await recalculateSeriesScore(matchId);

  return getMatchGameStats(matchGameId);
};

const recalculateSeriesScore = async (matchId) => {
  const { rows: gameRows } = await pool.query(
    `
    SELECT winner_team_id
    FROM match_games
    WHERE match_id = $1
      AND winner_team_id IS NOT NULL
    `,
    [matchId],
  );

  if (!gameRows.length) return;

  const { rows: matchRows } = await pool.query(
    "SELECT team_a_id, team_b_id FROM matches WHERE id = $1",
    [matchId],
  );
  const matchRow = matchRows[0];
  if (!matchRow) return;

  const teamA = toNumber(matchRow.team_a_id);
  const teamB = toNumber(matchRow.team_b_id);

  let scoreA = 0;
  let scoreB = 0;

  for (const row of gameRows) {
    const winner = toNumber(row.winner_team_id);
    if (winner === teamA) scoreA += 1;
    else if (winner === teamB) scoreB += 1;
  }

  let winnerTeamId = null;
  if (scoreA > scoreB) winnerTeamId = teamA;
  if (scoreB > scoreA) winnerTeamId = teamB;

  await pool.query(
    `
    UPDATE matches
    SET score_a = $1,
        score_b = $2,
        winner_team_id = COALESCE($3, winner_team_id),
        status = CASE WHEN $3 IS NOT NULL THEN 'completed' ELSE status END
    WHERE id = $4
    `,
    [scoreA, scoreB, winnerTeamId, matchId],
  );
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
           is_mvp, items, source, created_at
    FROM match_game_player_stats
    WHERE match_game_id = $1
    ORDER BY team_side ASC, slot_no ASC
    `,
    [matchGameId],
  );

  return {
    match_game_id: matchGameId,
    match_id: gameRow.match_id,
    game_no: gameRow.game_no,
    info_game_id: gameRow.info_game_id,
    team_a_score: toNumber(gameRow.team_a_score),
    team_b_score: toNumber(gameRow.team_b_score),
    winner_team_id: toNumber(gameRow.winner_team_id),
    aov: payload?.aov ?? null,
    players: playerRows,
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
