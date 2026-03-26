import { pool } from "./db.js";

let ensurePickemTablesPromise = null;

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toIsoOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const asJson = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }
  return value;
};

const asObject = (value, fallback = {}) => {
  const parsed = asJson(value, fallback);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fallback;
  }
  return parsed;
};

const extractOptionTokens = (value) => {
  const initial = asJson(value, []);
  const stack = [initial];
  const tokens = [];

  while (stack.length) {
    const item = stack.pop();

    if (Array.isArray(item)) {
      for (const entry of item) stack.push(entry);
      continue;
    }

    if (item && typeof item === "object") {
      const preferredValue =
        item.value ??
        item.option_value ??
        item.team_id ??
        item.user_id ??
        item.id ??
        null;

      if (preferredValue !== null && preferredValue !== undefined) {
        tokens.push(preferredValue);
        continue;
      }

      if (item.label !== undefined || item.name !== undefined) {
        tokens.push(item.label ?? item.name);
        continue;
      }

      for (const entry of Object.values(item)) {
        stack.push(entry);
      }
      continue;
    }

    tokens.push(item);
  }

  return tokens;
};

export const normalizeOptions = (value) => {
  const raw = extractOptionTokens(value);
  const unique = new Set();

  raw.forEach((item) => {
    const normalized = String(item ?? "")
      .trim()
      .toLowerCase();
    if (normalized) unique.add(normalized);
  });

  return Array.from(unique);
};

const clampPositiveInt = (value, fallback = 1) => {
  const parsed = toNumber(value);
  if (!parsed || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const normalizeScore = (value, fallback = 0) => {
  const parsed = toNumber(value);
  if (parsed === null) return fallback;
  return parsed;
};

const normalizeQuestionPayload = (item) => {
  const questionId = toNumber(
    item?.id ?? item?.questionId ?? item?.question_id,
  );

  return {
    questionId,
    question: String(item?.question ?? "").trim(),
    type:
      String(item?.type ?? "single")
        .trim()
        .toLowerCase() || "single",
    options: asJson(item?.options, []),
    score: normalizeScore(item?.score, 0),
    maxChoose: clampPositiveInt(item?.maxChoose ?? item?.max_choose, 1),
    correctAnswer: asJson(item?.correctAnswer ?? item?.correct_answer, []),
    gameShort: item?.game_short
      ? String(item.game_short).trim().toLowerCase()
      : null,
    bracketId:
      item?.bracket_id !== undefined && item?.bracket_id !== null
        ? String(item.bracket_id)
        : null,
    meta: asObject(item?.meta, {}),
    openTime: toIsoOrNull(item?.openTime ?? item?.open_time),
    closeTime: toIsoOrNull(item?.closeTime ?? item?.close_time),
  };
};

const computeAnswerScore = ({ question, selectedOptions }) => {
  const score = normalizeScore(question?.score, 0);
  if (score <= 0) return 0;

  const correct = normalizeOptions(
    question?.correct_answer ?? question?.correctAnswer,
  );
  if (correct.length === 0) return 0;

  const selected = normalizeOptions(selectedOptions);
  if (selected.length === 0) return 0;

  const maxChoose = clampPositiveInt(
    question?.max_choose ?? question?.maxChoose,
    Math.max(correct.length, 1),
  );

  if (correct.length <= 1 && maxChoose <= 1) {
    return selected[0] === correct[0] ? score : 0;
  }

  const correctSet = new Set(correct);
  const wrongCount = selected.filter((item) => !correctSet.has(item)).length;
  if (wrongCount > 0) return 0;

  const hitCount = selected.filter((item) => correctSet.has(item)).length;
  return Math.min(hitCount, maxChoose) * score;
};

export const ensurePickemTables = async () => {
  if (ensurePickemTablesPromise) return ensurePickemTablesPromise;

  ensurePickemTablesPromise = (async () => {
    await pool.query(
      `
      CREATE TABLE IF NOT EXISTS pickem_challenges (
        id BIGSERIAL PRIMARY KEY,
        league_id TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
    );

    await pool.query(
      `
      CREATE TABLE IF NOT EXISTS pickem_questions (
        id BIGSERIAL PRIMARY KEY,
        challenge_id BIGINT NOT NULL REFERENCES pickem_challenges(id) ON DELETE CASCADE,
        question_id INT NOT NULL,
        question TEXT NOT NULL,
        type TEXT NOT NULL,
        options JSONB NOT NULL DEFAULT '[]'::jsonb,
        score NUMERIC(10,2) NOT NULL DEFAULT 0,
        max_choose INT NOT NULL DEFAULT 1,
        correct_answer JSONB NOT NULL DEFAULT '[]'::jsonb,
        meta JSONB NOT NULL DEFAULT '{}'::jsonb,
        game_short TEXT NULL,
        bracket_id TEXT NULL,
        open_time TIMESTAMPTZ NULL,
        close_time TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (challenge_id, question_id)
      )
      `,
    );

    await pool.query(
      `
      ALTER TABLE pickem_questions
      ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb
      `,
    );

    await pool.query(
      `
      CREATE TABLE IF NOT EXISTS pickem_responses (
        id BIGSERIAL PRIMARY KEY,
        league_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
        total_score NUMERIC(10,2) NOT NULL DEFAULT 0,
        last_update TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (league_id, user_id)
      )
      `,
    );

    await pool.query(
      `
      CREATE TABLE IF NOT EXISTS pickem_answers (
        id BIGSERIAL PRIMARY KEY,
        response_id BIGINT NOT NULL REFERENCES pickem_responses(id) ON DELETE CASCADE,
        question_id INT NOT NULL,
        selected_options JSONB NOT NULL DEFAULT '[]'::jsonb,
        open_time TIMESTAMPTZ NULL,
        close_time TIMESTAMPTZ NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (response_id, question_id)
      )
      `,
    );

    await pool.query(
      `
      CREATE INDEX IF NOT EXISTS idx_pickem_questions_league
      ON pickem_questions(challenge_id, game_short, type)
      `,
    );

    await pool.query(
      `
      CREATE INDEX IF NOT EXISTS idx_pickem_responses_league
      ON pickem_responses(league_id, total_score DESC, last_update ASC)
      `,
    );

    await pool.query(
      `
      CREATE INDEX IF NOT EXISTS idx_pickem_answers_response
      ON pickem_answers(response_id, question_id)
      `,
    );
  })().catch((error) => {
    ensurePickemTablesPromise = null;
    throw error;
  });

  return ensurePickemTablesPromise;
};

export const ensurePickemChallenge = async (leagueId) => {
  const normalizedLeagueId = String(leagueId ?? "").trim();
  if (!normalizedLeagueId) return null;

  const { rows } = await pool.query(
    `
    INSERT INTO pickem_challenges (league_id, updated_at)
    VALUES ($1, NOW())
    ON CONFLICT (league_id)
    DO UPDATE SET updated_at = NOW()
    RETURNING id, league_id
    `,
    [normalizedLeagueId],
  );

  return rows[0] ?? null;
};

export const upsertPickemQuestions = async ({ leagueId, questions }) => {
  const challenge = await ensurePickemChallenge(leagueId);
  if (!challenge) return [];

  const updated = [];

  for (const item of questions) {
    const normalized = normalizeQuestionPayload(item);

    if (!normalized.questionId || !normalized.question) {
      continue;
    }

    const { rows } = await pool.query(
      `
      INSERT INTO pickem_questions (
        challenge_id,
        question_id,
        question,
        type,
        options,
        score,
        max_choose,
        correct_answer,
        meta,
        game_short,
        bracket_id,
        open_time,
        close_time,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13, NOW())
      ON CONFLICT (challenge_id, question_id)
      DO UPDATE SET
        question = EXCLUDED.question,
        type = EXCLUDED.type,
        options = EXCLUDED.options,
        score = EXCLUDED.score,
        max_choose = EXCLUDED.max_choose,
        correct_answer = EXCLUDED.correct_answer,
        meta = EXCLUDED.meta,
        game_short = EXCLUDED.game_short,
        bracket_id = EXCLUDED.bracket_id,
        open_time = EXCLUDED.open_time,
        close_time = EXCLUDED.close_time,
        updated_at = NOW()
      RETURNING question_id
      `,
      [
        challenge.id,
        normalized.questionId,
        normalized.question,
        normalized.type,
        JSON.stringify(normalized.options ?? []),
        normalized.score,
        normalized.maxChoose,
        JSON.stringify(normalized.correctAnswer ?? []),
        JSON.stringify(normalized.meta ?? {}),
        normalized.gameShort,
        normalized.bracketId,
        normalized.openTime,
        normalized.closeTime,
      ],
    );

    if (rows[0]) {
      updated.push(rows[0]);
    }
  }

  return updated;
};

export const getPickemQuestionsByLeague = async (leagueId) => {
  const normalizedLeagueId = String(leagueId ?? "").trim();
  if (!normalizedLeagueId) return [];

  const { rows } = await pool.query(
    `
    SELECT
      q.question_id,
      q.question,
      q.type,
      q.options,
      q.score,
      q.max_choose,
      q.correct_answer,
      q.meta,
      q.game_short,
      q.bracket_id,
      q.open_time,
      q.close_time
    FROM pickem_questions q
    JOIN pickem_challenges c ON c.id = q.challenge_id
    WHERE c.league_id = $1
    ORDER BY q.question_id ASC
    `,
    [normalizedLeagueId],
  );

  return rows;
};

export const upsertPickemResponse = async ({
  leagueId,
  userId,
  userMeta,
  answers,
}) => {
  const normalizedLeagueId = String(leagueId ?? "").trim();
  const normalizedUserId = String(userId ?? "").trim();

  if (!normalizedLeagueId || !normalizedUserId) return null;

  const { rows } = await pool.query(
    `
    INSERT INTO pickem_responses (league_id, user_id, user_meta, updated_at)
    VALUES ($1, $2, $3::jsonb, NOW())
    ON CONFLICT (league_id, user_id)
    DO UPDATE SET
      user_meta = EXCLUDED.user_meta,
      updated_at = NOW()
    RETURNING id
    `,
    [normalizedLeagueId, normalizedUserId, JSON.stringify(userMeta ?? {})],
  );

  const responseId = rows[0]?.id;
  if (!responseId) return null;

  for (const answer of answers) {
    const questionId = toNumber(answer?.questionId ?? answer?.question_id);
    if (!questionId) continue;

    const selectedOptions = asJson(
      answer?.selectedOptions ?? answer?.selected_options,
      [],
    );
    const openTime = toIsoOrNull(answer?.openTime ?? answer?.open_time);
    const closeTime = toIsoOrNull(answer?.closeTime ?? answer?.close_time);

    await pool.query(
      `
      INSERT INTO pickem_answers (
        response_id,
        question_id,
        selected_options,
        open_time,
        close_time,
        updated_at
      )
      VALUES ($1, $2, $3::jsonb, $4, $5, NOW())
      ON CONFLICT (response_id, question_id)
      DO UPDATE SET
        selected_options = EXCLUDED.selected_options,
        open_time = EXCLUDED.open_time,
        close_time = EXCLUDED.close_time,
        updated_at = NOW()
      `,
      [
        responseId,
        questionId,
        JSON.stringify(selectedOptions),
        openTime,
        closeTime,
      ],
    );
  }

  return responseId;
};

export const gradePickemLeague = async (leagueId) => {
  const questions = await getPickemQuestionsByLeague(leagueId);
  const questionMap = new Map(questions.map((q) => [Number(q.question_id), q]));

  const { rows } = await pool.query(
    `
    SELECT
      r.id AS response_id,
      a.question_id,
      a.selected_options,
      a.updated_at
    FROM pickem_responses r
    LEFT JOIN pickem_answers a ON a.response_id = r.id
    WHERE r.league_id = $1
    ORDER BY r.id ASC, a.question_id ASC
    `,
    [String(leagueId ?? "").trim()],
  );

  const grouped = new Map();
  for (const row of rows) {
    const key = Number(row.response_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  for (const [responseId, answerRows] of grouped.entries()) {
    let totalScore = 0;
    let latestUpdate = null;

    for (const answer of answerRows) {
      if (!answer?.question_id) continue;

      const question = questionMap.get(Number(answer.question_id));
      if (!question) continue;

      totalScore += computeAnswerScore({
        question,
        selectedOptions: answer.selected_options,
      });

      const updatedAt = answer.updated_at ? new Date(answer.updated_at) : null;
      if (
        updatedAt &&
        !Number.isNaN(updatedAt.getTime()) &&
        (!latestUpdate || updatedAt.getTime() > latestUpdate.getTime())
      ) {
        latestUpdate = updatedAt;
      }
    }

    await pool.query(
      `
      UPDATE pickem_responses
      SET total_score = $1,
          last_update = $2,
          updated_at = NOW()
      WHERE id = $3
      `,
      [
        totalScore,
        latestUpdate ? latestUpdate.toISOString() : null,
        responseId,
      ],
    );
  }

  return {
    totalQuestions: questions.length,
    totalResponses: grouped.size,
  };
};

export const getPickemAnswersByLeagueAndUser = async ({ leagueId, userId }) => {
  const normalizedLeagueId = String(leagueId ?? "").trim();
  const normalizedUserId = String(userId ?? "").trim();

  if (!normalizedLeagueId || !normalizedUserId) return null;

  const { rows: responseRows } = await pool.query(
    `
    SELECT id, league_id, user_id, user_meta, total_score, last_update
    FROM pickem_responses
    WHERE league_id = $1 AND user_id = $2
    LIMIT 1
    `,
    [normalizedLeagueId, normalizedUserId],
  );

  const response = responseRows[0] ?? null;
  if (!response) return null;

  const { rows: answerRows } = await pool.query(
    `
    SELECT question_id, selected_options, open_time, close_time, updated_at
    FROM pickem_answers
    WHERE response_id = $1
    ORDER BY question_id ASC
    `,
    [response.id],
  );

  return {
    response,
    answers: answerRows,
  };
};

export const getPickemLeaderboardRows = async (leagueId) => {
  const normalizedLeagueId = String(leagueId ?? "").trim();

  const { rows } = await pool.query(
    `
    SELECT
      r.user_id,
      r.user_meta,
      r.total_score,
      r.last_update
    FROM pickem_responses r
    WHERE r.league_id = $1
    ORDER BY r.total_score DESC, r.last_update ASC NULLS LAST, r.user_id ASC
    `,
    [normalizedLeagueId],
  );

  return rows;
};

export const getUsersByIds = async (userIds) => {
  const numericUserIds = Array.from(
    new Set(
      (userIds ?? [])
        .map((value) => toNumber(value))
        .filter((value) => Number.isFinite(value)),
    ),
  );

  if (!numericUserIds.length) return new Map();

  const { rows } = await pool.query(
    `
    SELECT
      u.id,
      u.username,
      u.nickname,
      u.profile_picture,
      t.name AS team_name,
      t.logo_url AS team_logo
    FROM users u
    LEFT JOIN teams t ON t.id = u.team_id
    WHERE u.id = ANY($1::int[])
    `,
    [numericUserIds],
  );

  return new Map(rows.map((row) => [String(row.id), row]));
};

const normalizeText = (value) => String(value ?? "").trim();

const normalizeGameShort = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return "";
  if (normalized === "val" || normalized === "valorantv2") {
    return "valorant";
  }
  if (normalized === "leagueoflegends" || normalized === "league_of_legends") {
    return "lol";
  }
  if (normalized === "teamfighttactics" || normalized === "teamfight_tactics") {
    return "tft";
  }
  return normalized;
};

const uniqueStrings = (values) => {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const text = normalizeText(value);
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(text);
  }

  return result;
};

const buildTeamLabel = ({ id, name, shortName }) => {
  const fullName = normalizeText(name);
  const short = normalizeText(shortName);

  if (fullName && short && fullName.toLowerCase() !== short.toLowerCase()) {
    return `${fullName} (${short})`;
  }

  if (fullName) return fullName;
  if (short) return short;

  const teamId = toNumber(id);
  return teamId ? `Team #${teamId}` : "";
};

const buildPlayerLabel = ({ id, name }) => {
  const displayName = normalizeText(name);
  const userId = toNumber(id);

  if (displayName && userId) return `${displayName} (#${userId})`;
  if (displayName) return displayName;
  if (userId) return `Player #${userId}`;
  return "";
};

const getTournamentContext = async (tournamentId) => {
  const { rows } = await pool.query(
    `
    SELECT t.id, t.name, g.short_name AS game_short
    FROM tournaments t
    LEFT JOIN games g ON g.id = t.game_id
    WHERE t.id = $1
    LIMIT 1
    `,
    [tournamentId],
  );

  return rows[0] ?? null;
};

const getSeriesContext = async (seriesId) => {
  const { rows } = await pool.query(
    `
    SELECT id, slug, name
    FROM series
    WHERE id = $1
    LIMIT 1
    `,
    [seriesId],
  );

  return rows[0] ?? null;
};

const getSeriesTournaments = async (seriesId) => {
  const { rows } = await pool.query(
    `
    SELECT
      t.id,
      t.name,
      g.short_name AS game_short
    FROM tournaments t
    LEFT JOIN games g ON g.id = t.game_id
    WHERE t.series_id = $1
    ORDER BY t.id ASC
    `,
    [seriesId],
  );

  return rows;
};

const getSeriesTeamsByTournamentIds = async (tournamentIds) => {
  if (!Array.isArray(tournamentIds) || !tournamentIds.length) {
    return [];
  }

  const { rows } = await pool.query(
    `
    SELECT DISTINCT
      t.id,
      t.name,
      t.short_name
    FROM tournament_teams tt
    JOIN teams t ON t.id = tt.team_id
    WHERE tt.tournament_id = ANY($1::int[])
    ORDER BY t.name ASC, t.id ASC
    `,
    [tournamentIds],
  );

  return rows;
};

const getSeriesPlayersByTournamentIds = async (tournamentIds) => {
  if (!Array.isArray(tournamentIds) || !tournamentIds.length) {
    return [];
  }

  const { rows } = await pool.query(
    `
    SELECT DISTINCT
      u.id,
      COALESCE(
        NULLIF(TRIM(u.nickname), ''),
        NULLIF(TRIM(u.username), ''),
        CONCAT('Player ', u.id::text)
      ) AS display_name
    FROM tournament_teams tt
    JOIN tournament_team_players ttp ON ttp.tournament_team_id = tt.id
    JOIN users u ON u.id = ttp.user_id
    WHERE tt.tournament_id = ANY($1::int[])
    ORDER BY display_name ASC, u.id ASC
    `,
    [tournamentIds],
  );

  return rows;
};

const getTournamentTeams = async (tournamentId) => {
  const { rows } = await pool.query(
    `
    SELECT
      t.id,
      t.name,
      t.short_name,
      t.logo_url
    FROM tournament_teams tt
    JOIN teams t ON t.id = tt.team_id
    WHERE tt.tournament_id = $1
    ORDER BY tt.id ASC
    `,
    [tournamentId],
  );

  return rows;
};

const getTournamentPlayers = async (tournamentId) => {
  const { rows } = await pool.query(
    `
    SELECT DISTINCT
      u.id,
      COALESCE(
        NULLIF(TRIM(u.nickname), ''),
        NULLIF(TRIM(u.username), ''),
        CONCAT('Player ', u.id::text)
      ) AS display_name
    FROM tournament_teams tt
    JOIN tournament_team_players ttp ON ttp.tournament_team_id = tt.id
    JOIN users u ON u.id = ttp.user_id
    WHERE tt.tournament_id = $1
    ORDER BY display_name ASC, u.id ASC
    `,
    [tournamentId],
  );

  return rows;
};

const getTournamentBrackets = async (tournamentId) => {
  const { rows } = await pool.query(
    `
    SELECT
      b.id,
      b.name,
      b.stage,
      b.format_id,
      f.type AS format_type,
      f.has_losers_bracket
    FROM brackets b
    JOIN formats f ON f.id = b.format_id
    WHERE b.tournament_id = $1
    ORDER BY b.id ASC
    `,
    [tournamentId],
  );

  return rows;
};

const getMatchesByBracketIds = async (bracketIds) => {
  if (!Array.isArray(bracketIds) || bracketIds.length === 0) {
    return [];
  }

  const { rows } = await pool.query(
    `
    SELECT
      m.id,
      m.bracket_id,
      m.round_number,
      m.match_no,
      m.team_a_id,
      m.team_b_id,
      m.winner_team_id,
      m.status,
      t1.name AS team_a_name,
      t1.short_name AS team_a_short_name,
      t2.name AS team_b_name,
      t2.short_name AS team_b_short_name
    FROM matches m
    LEFT JOIN teams t1 ON t1.id = m.team_a_id
    LEFT JOIN teams t2 ON t2.id = m.team_b_id
    WHERE m.bracket_id = ANY($1::int[])
    ORDER BY m.bracket_id ASC, m.round_number ASC, m.match_no ASC, m.id ASC
    `,
    [bracketIds],
  );

  return rows;
};

const getTopTeamLabelsByPlacement = async (tournamentId, limit) => {
  if (!limit || limit <= 0) return [];

  try {
    const { rows } = await pool.query(
      `
      SELECT
        r.team_id,
        t.name,
        t.short_name
      FROM tournament_team_results r
      JOIN teams t ON t.id = r.team_id
      WHERE r.tournament_id = $1
        AND r.placement IS NOT NULL
      ORDER BY r.placement ASC, r.team_id ASC
      LIMIT $2
      `,
      [tournamentId, limit],
    );

    return uniqueStrings(
      rows.map((row) =>
        buildTeamLabel({
          id: row.team_id,
          name: row.name,
          shortName: row.short_name,
        }),
      ),
    );
  } catch {
    return [];
  }
};

const resolveBracketKind = (bracket) => {
  const formatType = normalizeText(bracket?.format_type).toLowerCase();

  if (formatType === "swiss") return "swiss";
  if (formatType !== "elimination") return null;

  return bracket?.has_losers_bracket ? "double" : "single";
};

const toBracketGroupLabel = (kind, stage) => {
  if (kind === "single") return "Single Elimination";

  if (kind === "double") {
    const normalizedStage = normalizeText(stage);
    if (normalizedStage) {
      return `Double Elimination (${normalizedStage})`;
    }
    return "Double Elimination";
  }

  return "Bracket";
};

const buildMatchWinnerQuestion = ({
  bracket,
  kind,
  match,
  gameShort,
  tournamentId,
  tournamentName,
}) => {
  const matchId = toNumber(match?.id);
  const bracketId = toNumber(bracket?.id);
  const teamAId = toNumber(match?.team_a_id);
  const teamBId = toNumber(match?.team_b_id);

  if (!matchId || !bracketId || !teamAId || !teamBId) return null;

  const teamAName = buildTeamLabel({
    id: teamAId,
    name: match?.team_a_name,
    shortName: match?.team_a_short_name,
  });
  const teamBName = buildTeamLabel({
    id: teamBId,
    name: match?.team_b_name,
    shortName: match?.team_b_short_name,
  });

  if (!teamAName || !teamBName) return null;

  const roundNumber = toNumber(match?.round_number) ?? 1;
  const matchNo = toNumber(match?.match_no) ?? 1;
  const winnerTeamId = toNumber(match?.winner_team_id);

  let correctAnswer = [];
  if (winnerTeamId === teamAId) correctAnswer = [teamAName];
  if (winnerTeamId === teamBId) correctAnswer = [teamBName];

  const sectionLabel = toBracketGroupLabel(kind, bracket?.stage);
  const tournamentLabel = normalizeText(tournamentName)
    ? `[${normalizeText(tournamentName)}] `
    : "";

  return {
    id: matchId,
    question: `${tournamentLabel}${sectionLabel} - Round ${roundNumber} Match ${matchNo}: Đội nào thắng?`,
    type: kind === "single" ? "single-elim-match" : "double-elim-match",
    options: [teamAName, teamBName],
    score: 1,
    maxChoose: 1,
    correctAnswer,
    game_short: gameShort || null,
    bracket_id: String(bracketId),
    meta: {
      section: kind === "single" ? "single-elim" : "double-elim",
      bracketId,
      bracketName: normalizeText(bracket?.name) || null,
      stage: normalizeText(bracket?.stage) || null,
      roundNumber,
      matchNo,
      matchId,
      tournamentId: toNumber(tournamentId),
      tournamentName: normalizeText(tournamentName) || null,
    },
  };
};

const SWISS_QUESTION_ID_BASE = 1000000000;

const getPropGameCode = (gameShort) => {
  const normalized = normalizeGameShort(gameShort);
  if (normalized === "valorant") return 11;
  if (normalized === "lol") return 12;
  if (normalized === "tft") return 13;
  return 19;
};

const buildPropQuestionId = ({ tournamentId, gameShort, index }) => {
  const safeTournamentId = Math.max(toNumber(tournamentId) ?? 0, 0) % 1000000;
  const safeIndex = Math.max(toNumber(index) ?? 0, 0);
  const base = getPropGameCode(gameShort) * 100000000;

  return -1 * (base + safeTournamentId * 100 + safeIndex);
};

const VALORANT_AGENT_OPTIONS = [
  "Jett",
  "Raze",
  "Omen",
  "Sova",
  "Viper",
  "Skye",
  "Killjoy",
  "Cypher",
  "Breach",
  "KAY/O",
  "Fade",
  "Gekko",
  "Iso",
  "Clove",
  "Tejo",
];

const createPropQuestion = ({
  questionId,
  question,
  type,
  options,
  gameShort,
  tournamentId,
  tournamentName,
  statKey,
  correctAnswer = [],
}) => ({
  id: questionId,
  question,
  type,
  options,
  score: 2,
  maxChoose: 1,
  correctAnswer,
  game_short: gameShort || null,
  bracket_id: null,
  meta: {
    section: "prop",
    statKey,
    tournamentId: toNumber(tournamentId),
    tournamentName: normalizeText(tournamentName) || null,
  },
});

const toTextOptions = (value) =>
  uniqueStrings(
    extractOptionTokens(value)
      .map((item) => normalizeText(item))
      .filter(Boolean),
  );

const keepCorrectAnswersWithinOptions = (correctAnswer, options) => {
  const normalizedOptionSet = new Set(
    (options ?? []).map((option) => normalizeText(option).toLowerCase()),
  );

  return toTextOptions(correctAnswer).filter((item) =>
    normalizedOptionSet.has(item.toLowerCase()),
  );
};

const applySeriesOptionPoolsToQuestion = ({
  question,
  seriesTeamOptions,
  seriesPlayerOptions,
}) => {
  if (!question || typeof question !== "object") return question;

  const section = normalizeText(question?.meta?.section).toLowerCase();
  const type = normalizeText(question?.type).toLowerCase();
  const statKey = normalizeText(question?.meta?.statKey).toLowerCase();

  let optionPool = null;

  if (section === "swiss" || type.includes("swiss")) {
    optionPool = seriesTeamOptions;
  } else if (section === "prop") {
    if (statKey === "most-picked-agent") {
      return question;
    }

    if (statKey === "champion" || type.includes("champion")) {
      optionPool = seriesTeamOptions;
    } else {
      optionPool =
        seriesPlayerOptions.length > 0 ? seriesPlayerOptions : seriesTeamOptions;
    }
  }

  if (!optionPool || optionPool.length === 0) {
    return question;
  }

  const maxChoose = clampPositiveInt(
    question?.maxChoose ?? question?.max_choose,
    1,
  );

  return {
    ...question,
    options: optionPool,
    maxChoose: Math.min(maxChoose, optionPool.length),
    correctAnswer: keepCorrectAnswersWithinOptions(
      question?.correctAnswer ?? question?.correct_answer ?? [],
      optionPool,
    ),
  };
};

export const generatePickemQuestionsForTournament = async ({
  leagueId,
  tournamentId,
  gameShort,
}) => {
  const normalizedLeagueId = normalizeText(leagueId);
  const normalizedTournamentId = toNumber(tournamentId);

  if (!normalizedLeagueId || !normalizedTournamentId) {
    return {
      leagueId: normalizedLeagueId,
      tournamentId: normalizedTournamentId,
      gameShort: normalizeGameShort(gameShort),
      questions: [],
      summary: {
        total: 0,
        singleMatchQuestions: 0,
        doubleMatchQuestions: 0,
        swissQuestions: 0,
        propQuestions: 0,
      },
    };
  }

  const tournament = await getTournamentContext(normalizedTournamentId);
  if (!tournament) {
    return {
      leagueId: normalizedLeagueId,
      tournamentId: normalizedTournamentId,
      gameShort: normalizeGameShort(gameShort),
      questions: [],
      summary: {
        total: 0,
        singleMatchQuestions: 0,
        doubleMatchQuestions: 0,
        swissQuestions: 0,
        propQuestions: 0,
      },
    };
  }

  const resolvedGameShort =
    normalizeGameShort(gameShort) || normalizeGameShort(tournament.game_short);
  const normalizedTournamentName = normalizeText(tournament.name);
  const tournamentLabel = normalizedTournamentName
    ? `[${normalizedTournamentName}] `
    : "";

  const [teams, players, brackets, topEightTeams] = await Promise.all([
    getTournamentTeams(normalizedTournamentId),
    getTournamentPlayers(normalizedTournamentId),
    getTournamentBrackets(normalizedTournamentId),
    getTopTeamLabelsByPlacement(normalizedTournamentId, 8),
  ]);

  const teamOptions = uniqueStrings(
    teams.map((team) =>
      buildTeamLabel({
        id: team.id,
        name: team.name,
        shortName: team.short_name,
      }),
    ),
  );

  const playerOptions = uniqueStrings(
    players.map((player) =>
      buildPlayerLabel({ id: player.id, name: player.display_name }),
    ),
  );

  const bracketIds = brackets
    .map((bracket) => toNumber(bracket.id))
    .filter((id) => Number.isFinite(id));

  const matches = await getMatchesByBracketIds(bracketIds);
  const matchesByBracket = new Map();
  for (const match of matches) {
    const bracketId = toNumber(match?.bracket_id);
    if (!bracketId) continue;
    if (!matchesByBracket.has(bracketId)) matchesByBracket.set(bracketId, []);
    matchesByBracket.get(bracketId).push(match);
  }

  const generatedQuestions = [];
  const summary = {
    total: 0,
    singleMatchQuestions: 0,
    doubleMatchQuestions: 0,
    swissQuestions: 0,
    propQuestions: 0,
  };

  for (const bracket of brackets) {
    const bracketId = toNumber(bracket.id);
    if (!bracketId) continue;

    const kind = resolveBracketKind(bracket);
    if (kind === "single" || kind === "double") {
      const bracketMatches = matchesByBracket.get(bracketId) ?? [];
      for (const match of bracketMatches) {
        const question = buildMatchWinnerQuestion({
          bracket,
          kind,
          match,
          gameShort: resolvedGameShort,
          tournamentId: normalizedTournamentId,
          tournamentName: normalizedTournamentName,
        });

        if (!question) continue;
        generatedQuestions.push(question);

        if (kind === "single") summary.singleMatchQuestions += 1;
        if (kind === "double") summary.doubleMatchQuestions += 1;
      }
      continue;
    }

    if (kind === "swiss") {
      if (!teamOptions.length) continue;

      const expectedPickCount = teamOptions.length > 8 ? 8 : 4;
      const pickCount = Math.min(expectedPickCount, teamOptions.length);
      if (pickCount <= 0) continue;

      const correctAnswer =
        topEightTeams.length >= pickCount ? topEightTeams.slice(0, pickCount) : [];

      generatedQuestions.push({
        id: SWISS_QUESTION_ID_BASE + bracketId,
        question: `${tournamentLabel}Swiss: Chọn ${pickCount} đội đi tiếp`,
        type: "swiss-pick",
        options: teamOptions,
        score: 1,
        maxChoose: pickCount,
        correctAnswer,
        game_short: resolvedGameShort || null,
        bracket_id: String(bracketId),
        meta: {
          section: "swiss",
          bracketId,
          bracketName: normalizeText(bracket.name) || null,
          pickCount,
          tournamentId: normalizedTournamentId,
          tournamentName: normalizedTournamentName || null,
        },
      });

      summary.swissQuestions += 1;
    }
  }

  const playerOrTeamOptions =
    playerOptions.length > 0 ? playerOptions : teamOptions;

  if (resolvedGameShort === "valorant") {
    generatedQuestions.push(
      createPropQuestion({
        questionId: buildPropQuestionId({
          tournamentId: normalizedTournamentId,
          gameShort: resolvedGameShort,
          index: 1,
        }),
        question: `${tournamentLabel}Agent xuất hiện nhiều nhất giải là ai?`,
        type: "valorant-prop",
        options: VALORANT_AGENT_OPTIONS,
        gameShort: resolvedGameShort,
        tournamentId: normalizedTournamentId,
        tournamentName: normalizedTournamentName,
        statKey: "most-picked-agent",
      }),
    );

    if (playerOrTeamOptions.length > 0) {
      generatedQuestions.push(
        createPropQuestion({
          questionId: buildPropQuestionId({
            tournamentId: normalizedTournamentId,
            gameShort: resolvedGameShort,
            index: 2,
          }),
          question: `${tournamentLabel}Ai sẽ là MVP của giải Valorant?`,
          type: "valorant-prop",
          options: playerOrTeamOptions,
          gameShort: resolvedGameShort,
          tournamentId: normalizedTournamentId,
          tournamentName: normalizedTournamentName,
          statKey: "mvp",
        }),
      );

      generatedQuestions.push(
        createPropQuestion({
          questionId: buildPropQuestionId({
            tournamentId: normalizedTournamentId,
            gameShort: resolvedGameShort,
            index: 3,
          }),
          question: `${tournamentLabel}Ai có tổng kill nhiều nhất?`,
          type: "valorant-prop",
          options: playerOrTeamOptions,
          gameShort: resolvedGameShort,
          tournamentId: normalizedTournamentId,
          tournamentName: normalizedTournamentName,
          statKey: "most-kills",
        }),
      );

      generatedQuestions.push(
        createPropQuestion({
          questionId: buildPropQuestionId({
            tournamentId: normalizedTournamentId,
            gameShort: resolvedGameShort,
            index: 4,
          }),
          question: `${tournamentLabel}Ai có HS% cao nhất?`,
          type: "valorant-prop",
          options: playerOrTeamOptions,
          gameShort: resolvedGameShort,
          tournamentId: normalizedTournamentId,
          tournamentName: normalizedTournamentName,
          statKey: "highest-hs-percent",
        }),
      );
    }
  }

  if (resolvedGameShort === "lol") {
    if (playerOrTeamOptions.length > 0) {
      generatedQuestions.push(
        createPropQuestion({
          questionId: buildPropQuestionId({
            tournamentId: normalizedTournamentId,
            gameShort: resolvedGameShort,
            index: 1,
          }),
          question: `${tournamentLabel}Ai sẽ là MVP của giải LoL?`,
          type: "lol-prop",
          options: playerOrTeamOptions,
          gameShort: resolvedGameShort,
          tournamentId: normalizedTournamentId,
          tournamentName: normalizedTournamentName,
          statKey: "mvp",
        }),
      );

      generatedQuestions.push(
        createPropQuestion({
          questionId: buildPropQuestionId({
            tournamentId: normalizedTournamentId,
            gameShort: resolvedGameShort,
            index: 2,
          }),
          question: `${tournamentLabel}Ai có tổng mạng hạ gục cao nhất?`,
          type: "lol-prop",
          options: playerOrTeamOptions,
          gameShort: resolvedGameShort,
          tournamentId: normalizedTournamentId,
          tournamentName: normalizedTournamentName,
          statKey: "most-kills",
        }),
      );

      generatedQuestions.push(
        createPropQuestion({
          questionId: buildPropQuestionId({
            tournamentId: normalizedTournamentId,
            gameShort: resolvedGameShort,
            index: 3,
          }),
          question: `${tournamentLabel}Ai có KDA cao nhất?`,
          type: "lol-prop",
          options: playerOrTeamOptions,
          gameShort: resolvedGameShort,
          tournamentId: normalizedTournamentId,
          tournamentName: normalizedTournamentName,
          statKey: "highest-kda",
        }),
      );

      generatedQuestions.push(
        createPropQuestion({
          questionId: buildPropQuestionId({
            tournamentId: normalizedTournamentId,
            gameShort: resolvedGameShort,
            index: 4,
          }),
          question: `${tournamentLabel}Ai có tổng hỗ trợ cao nhất?`,
          type: "lol-prop",
          options: playerOrTeamOptions,
          gameShort: resolvedGameShort,
          tournamentId: normalizedTournamentId,
          tournamentName: normalizedTournamentName,
          statKey: "most-assists",
        }),
      );
    }
  }

  if (resolvedGameShort === "tft" && teamOptions.length > 0) {
    const champion = topEightTeams.length > 0 ? [topEightTeams[0]] : [];

    generatedQuestions.push(
      createPropQuestion({
        questionId: buildPropQuestionId({
          tournamentId: normalizedTournamentId,
          gameShort: resolvedGameShort,
          index: 1,
        }),
        question: `${tournamentLabel}Đội nào sẽ vô địch giải TFT?`,
        type: "tft-champion",
        options: teamOptions,
        gameShort: resolvedGameShort,
        tournamentId: normalizedTournamentId,
        tournamentName: normalizedTournamentName,
        statKey: "champion",
        correctAnswer: champion,
      }),
    );
  }

  summary.total = generatedQuestions.length;
  summary.propQuestions = Math.max(
    generatedQuestions.length -
      summary.singleMatchQuestions -
      summary.doubleMatchQuestions -
      summary.swissQuestions,
    0,
  );

  return {
    leagueId: normalizedLeagueId,
    tournamentId: normalizedTournamentId,
    gameShort: resolvedGameShort,
    questions: generatedQuestions,
    summary,
  };
};

export const generatePickemQuestionsForSeries = async ({
  leagueId,
  seriesId,
  gameShort,
}) => {
  const normalizedLeagueId = normalizeText(leagueId);
  const normalizedSeriesId = toNumber(seriesId);
  const requestedGameShort = normalizeGameShort(gameShort);

  if (!normalizedLeagueId || !normalizedSeriesId) {
    return {
      leagueId: normalizedLeagueId,
      seriesId: normalizedSeriesId,
      gameShort: requestedGameShort,
      questions: [],
      summary: {
        total: 0,
        tournaments: 0,
        singleMatchQuestions: 0,
        doubleMatchQuestions: 0,
        swissQuestions: 0,
        propQuestions: 0,
      },
    };
  }

  const series = await getSeriesContext(normalizedSeriesId);
  if (!series) {
    return {
      leagueId: normalizedLeagueId,
      seriesId: normalizedSeriesId,
      gameShort: requestedGameShort,
      questions: [],
      summary: {
        total: 0,
        tournaments: 0,
        singleMatchQuestions: 0,
        doubleMatchQuestions: 0,
        swissQuestions: 0,
        propQuestions: 0,
      },
    };
  }

  const seriesTournaments = await getSeriesTournaments(normalizedSeriesId);
  const selectedTournaments = seriesTournaments.filter((item) => {
    if (!requestedGameShort || requestedGameShort === "all") return true;
    const tournamentGame = normalizeGameShort(item?.game_short);
    return tournamentGame === requestedGameShort;
  });

  const selectedTournamentIds = selectedTournaments
    .map((item) => toNumber(item?.id))
    .filter((id) => Number.isFinite(id));

  const [seriesTeams, seriesPlayers] = await Promise.all([
    getSeriesTeamsByTournamentIds(selectedTournamentIds),
    getSeriesPlayersByTournamentIds(selectedTournamentIds),
  ]);

  const seriesTeamOptions = uniqueStrings(
    seriesTeams.map((team) =>
      buildTeamLabel({
        id: team.id,
        name: team.name,
        shortName: team.short_name,
      }),
    ),
  );

  const seriesPlayerOptions = uniqueStrings(
    seriesPlayers.map((player) =>
      buildPlayerLabel({
        id: player.id,
        name: player.display_name,
      }),
    ),
  );

  const allQuestions = [];
  const summary = {
    total: 0,
    tournaments: selectedTournaments.length,
    singleMatchQuestions: 0,
    doubleMatchQuestions: 0,
    swissQuestions: 0,
    propQuestions: 0,
  };

  for (const tournament of selectedTournaments) {
    const tournamentResult = await generatePickemQuestionsForTournament({
      leagueId: normalizedLeagueId,
      tournamentId: tournament.id,
      gameShort: normalizeGameShort(tournament.game_short),
    });

    if (Array.isArray(tournamentResult.questions)) {
      const patchedQuestions = tournamentResult.questions.map((question) =>
        applySeriesOptionPoolsToQuestion({
          question,
          seriesTeamOptions,
          seriesPlayerOptions,
        }),
      );

      allQuestions.push(...patchedQuestions);
    }

    summary.singleMatchQuestions += Number(
      tournamentResult.summary?.singleMatchQuestions ?? 0,
    );
    summary.doubleMatchQuestions += Number(
      tournamentResult.summary?.doubleMatchQuestions ?? 0,
    );
    summary.swissQuestions += Number(
      tournamentResult.summary?.swissQuestions ?? 0,
    );
    summary.propQuestions += Number(tournamentResult.summary?.propQuestions ?? 0);
  }

  const questionById = new Map();
  for (const question of allQuestions) {
    const questionId = toNumber(question?.id);
    if (!questionId) continue;
    questionById.set(questionId, question);
  }

  const dedupedQuestions = Array.from(questionById.values()).sort((a, b) =>
    Number(a.id) - Number(b.id),
  );

  summary.total = dedupedQuestions.length;

  return {
    leagueId: normalizedLeagueId,
    seriesId: normalizedSeriesId,
    seriesSlug: normalizeText(series.slug) || null,
    seriesName: normalizeText(series.name) || null,
    gameShort: requestedGameShort,
    questions: dedupedQuestions,
    summary,
  };
};
