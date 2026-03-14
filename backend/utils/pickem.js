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

const flattenValue = (value) => {
  if (Array.isArray(value)) return value.flatMap((item) => flattenValue(item));
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => flattenValue(item));
  }
  return [value];
};

export const normalizeOptions = (value) => {
  const raw = flattenValue(asJson(value, []));
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
  const questionId = toNumber(item?.id ?? item?.questionId ?? item?.question_id);

  return {
    questionId,
    question: String(item?.question ?? "").trim(),
    type: String(item?.type ?? "single").trim().toLowerCase() || "single",
    options: asJson(item?.options, []),
    score: normalizeScore(item?.score, 0),
    maxChoose: clampPositiveInt(item?.maxChoose ?? item?.max_choose, 1),
    correctAnswer: asJson(
      item?.correctAnswer ?? item?.correct_answer,
      [],
    ),
    gameShort: item?.game_short ? String(item.game_short).trim().toLowerCase() : null,
    bracketId:
      item?.bracket_id !== undefined && item?.bracket_id !== null
        ? String(item.bracket_id)
        : null,
    openTime: toIsoOrNull(item?.openTime ?? item?.open_time),
    closeTime: toIsoOrNull(item?.closeTime ?? item?.close_time),
  };
};

const computeAnswerScore = ({ question, selectedOptions }) => {
  const score = normalizeScore(question?.score, 0);
  if (score <= 0) return 0;

  const correct = normalizeOptions(question?.correct_answer ?? question?.correctAnswer);
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
        game_short,
        bracket_id,
        open_time,
        close_time,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9, $10, $11, $12, NOW())
      ON CONFLICT (challenge_id, question_id)
      DO UPDATE SET
        question = EXCLUDED.question,
        type = EXCLUDED.type,
        options = EXCLUDED.options,
        score = EXCLUDED.score,
        max_choose = EXCLUDED.max_choose,
        correct_answer = EXCLUDED.correct_answer,
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

    const selectedOptions = asJson(answer?.selectedOptions ?? answer?.selected_options, []);
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
      [responseId, questionId, JSON.stringify(selectedOptions), openTime, closeTime],
    );
  }

  return responseId;
};

export const gradePickemLeague = async (leagueId) => {
  const questions = await getPickemQuestionsByLeague(leagueId);
  const questionMap = new Map(
    questions.map((q) => [Number(q.question_id), q]),
  );

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
      [totalScore, latestUpdate ? latestUpdate.toISOString() : null, responseId],
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
