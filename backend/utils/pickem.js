import { pool } from "./db.js";

let ensurePickemTablesPromise = null;

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeUserId = (value) => String(value ?? "").trim();

const asObject = (value, fallback = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  return value;
};

const normalizePickPayload = (value) => {
  const matchId = toNumber(value?.matchId ?? value?.match_id);
  const selectedTeamId = toNumber(
    value?.selectedTeamId ?? value?.selected_team_id,
  );

  if (!matchId || !selectedTeamId) return null;

  return {
    matchId,
    selectedTeamId,
  };
};

export const ensurePickemTables = async () => {
  if (ensurePickemTablesPromise) return ensurePickemTablesPromise;

  ensurePickemTablesPromise = (async () => {
    await pool.query(
      `
      CREATE TABLE IF NOT EXISTS pickem_bracket_submissions (
        id BIGSERIAL PRIMARY KEY,
        bracket_id BIGINT NOT NULL,
        user_id TEXT NOT NULL,
        user_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (bracket_id, user_id)
      )
      `,
    );

    await pool.query(
      `
      CREATE TABLE IF NOT EXISTS pickem_bracket_picks (
        id BIGSERIAL PRIMARY KEY,
        submission_id BIGINT NOT NULL REFERENCES pickem_bracket_submissions(id) ON DELETE CASCADE,
        bracket_id BIGINT NOT NULL,
        match_id BIGINT NOT NULL,
        selected_team_id BIGINT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (submission_id, match_id)
      )
      `,
    );

    await pool.query(
      `
      CREATE INDEX IF NOT EXISTS idx_pickem_bracket_submissions_lookup
      ON pickem_bracket_submissions(bracket_id, user_id)
      `,
    );

    await pool.query(
      `
      CREATE INDEX IF NOT EXISTS idx_pickem_bracket_picks_lookup
      ON pickem_bracket_picks(bracket_id, match_id)
      `,
    );
  })().catch((error) => {
    ensurePickemTablesPromise = null;
    throw error;
  });

  return ensurePickemTablesPromise;
};

export const getBracketById = async (bracketId) => {
  const normalizedBracketId = toNumber(bracketId);
  if (!normalizedBracketId) return null;

  const { rows } = await pool.query(
    `
    SELECT
      b.id,
      b.tournament_id,
      b.name,
      b.stage,
      b.status,
      b.format_id,
      f.name AS format_name,
      f.type AS format_type,
      f.has_losers_bracket
    FROM brackets b
    LEFT JOIN formats f ON f.id = b.format_id
    WHERE b.id = $1
    LIMIT 1
    `,
    [normalizedBracketId],
  );

  return rows[0] ?? null;
};

export const getMatchesByBracketId = async (bracketId) => {
  const normalizedBracketId = toNumber(bracketId);
  if (!normalizedBracketId) return [];

  const { rows } = await pool.query(
    `
    SELECT m.id,
           m.bracket_id,
           m.round_number,
           m.match_no,
           m.team_a_id,
           m.team_b_id,
           m.score_a,
           m.score_b,
           m.winner_team_id,
           m.status,
           json_build_object(
             'id', t1.id,
             'name', t1.name,
             'short_name', t1.short_name,
             'logo_url', t1.logo_url,
             'team_color_hex', t1.team_color_hex
           ) AS team_a,
           json_build_object(
             'id', t2.id,
             'name', t2.name,
             'short_name', t2.short_name,
             'logo_url', t2.logo_url,
             'team_color_hex', t2.team_color_hex
           ) AS team_b
    FROM matches m
    LEFT JOIN teams t1 ON t1.id = m.team_a_id
    LEFT JOIN teams t2 ON t2.id = m.team_b_id
    WHERE m.bracket_id = $1
    ORDER BY m.round_number ASC, m.match_no ASC, m.id ASC
    `,
    [normalizedBracketId],
  );

  return rows;
};

const resolveWinnerTeamIdFromMatch = (match) => {
  const winnerTeamId = toNumber(match?.winner_team_id);
  if (winnerTeamId) return winnerTeamId;

  const teamAId = toNumber(match?.team_a_id);
  const teamBId = toNumber(match?.team_b_id);
  const scoreA = toNumber(match?.score_a);
  const scoreB = toNumber(match?.score_b);

  if (!teamAId || !teamBId) return null;
  if (scoreA === null || scoreB === null) return null;

  if (scoreA > scoreB) return teamAId;
  if (scoreB > scoreA) return teamBId;
  return null;
};

const getPointsForRound = (roundNumber) => {
  const round = Math.max(1, toNumber(roundNumber) ?? 1);
  return 2 ** (round - 1);
};

export const evaluateBracketPicks = ({ matches, picks }) => {
  const matchById = new Map();
  (Array.isArray(matches) ? matches : []).forEach((match) => {
    const matchId = toNumber(match?.id);
    if (!matchId) return;
    matchById.set(matchId, match);
  });

  const evaluatedPicks = (Array.isArray(picks) ? picks : []).map((pick) => {
    const matchId = toNumber(pick?.matchId ?? pick?.match_id);
    const selectedTeamId = toNumber(
      pick?.selectedTeamId ?? pick?.selected_team_id,
    );

    if (!matchId || !selectedTeamId) {
      return {
        ...pick,
        isResolved: false,
        isCorrect: null,
        winnerTeamId: null,
        roundNumber: null,
        points: 0,
      };
    }

    const match = matchById.get(matchId);
    const winnerTeamId = match ? resolveWinnerTeamIdFromMatch(match) : null;
    const roundNumber = match ? toNumber(match.round_number) : null;
    const isResolved = Boolean(winnerTeamId);
    const isCorrect = isResolved ? selectedTeamId === winnerTeamId : null;
    const points = isCorrect ? getPointsForRound(roundNumber) : 0;

    return {
      ...pick,
      matchId,
      selectedTeamId,
      isResolved,
      isCorrect,
      winnerTeamId,
      roundNumber,
      points,
    };
  });

  const stats = evaluatedPicks.reduce(
    (acc, pick) => {
      const isResolved = Boolean(pick.isResolved);
      const isCorrect = pick.isCorrect === true;

      acc.totalPicks += 1;

      if (!isResolved) {
        acc.pendingPicks += 1;
        return acc;
      }

      acc.resolvedPicks += 1;

      if (isCorrect) {
        acc.correctPicks += 1;
        acc.totalPoints += toNumber(pick.points) ?? 0;
      } else {
        acc.wrongPicks += 1;
      }

      return acc;
    },
    {
      totalPicks: 0,
      resolvedPicks: 0,
      correctPicks: 0,
      wrongPicks: 0,
      pendingPicks: 0,
      totalPoints: 0,
    },
  );

  return {
    picks: evaluatedPicks,
    stats,
  };
};

const getValidMatchesByBracket = async (bracketId) => {
  const normalizedBracketId = toNumber(bracketId);
  if (!normalizedBracketId) {
    return {
      matchMap: new Map(),
      bracketTeamIds: new Set(),
    };
  }

  const { rows } = await pool.query(
    `
    SELECT id, team_a_id, team_b_id
    FROM matches
    WHERE bracket_id = $1
    `,
    [normalizedBracketId],
  );

  const matchMap = new Map();
  const bracketTeamIds = new Set();
  rows.forEach((row) => {
    const matchId = toNumber(row.id);
    if (!matchId) return;

    const teamAId = toNumber(row.team_a_id);
    const teamBId = toNumber(row.team_b_id);

    if (teamAId) bracketTeamIds.add(teamAId);
    if (teamBId) bracketTeamIds.add(teamBId);

    matchMap.set(matchId, {
      teamAId,
      teamBId,
    });
  });

  return {
    matchMap,
    bracketTeamIds,
  };
};

export const getUserBracketPicks = async ({ bracketId, userId }) => {
  const normalizedBracketId = toNumber(bracketId);
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedBracketId || !normalizedUserId) return null;

  const { rows } = await pool.query(
    `
    SELECT s.id AS submission_id,
           s.user_id,
           s.user_meta,
           s.updated_at AS submission_updated_at,
           p.match_id,
           p.selected_team_id,
           p.updated_at
    FROM pickem_bracket_submissions s
    LEFT JOIN pickem_bracket_picks p ON p.submission_id = s.id
    WHERE s.bracket_id = $1
      AND s.user_id = $2
    ORDER BY p.match_id ASC
    `,
    [normalizedBracketId, normalizedUserId],
  );

  if (!rows.length) return null;

  const first = rows[0];

  return {
    submissionId: Number(first.submission_id),
    bracketId: normalizedBracketId,
    userId: String(first.user_id),
    userMeta: asObject(first.user_meta, {}),
    updatedAt: first.submission_updated_at,
    picks: rows
      .filter((row) => toNumber(row.match_id))
      .map((row) => ({
        matchId: Number(row.match_id),
        selectedTeamId: Number(row.selected_team_id),
        updatedAt: row.updated_at,
      })),
  };
};

export const upsertUserBracketPicks = async ({
  bracketId,
  userId,
  userMeta,
  picks,
}) => {
  const normalizedBracketId = toNumber(bracketId);
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedBracketId || !normalizedUserId) return null;

  const { matchMap: validMatches, bracketTeamIds } =
    await getValidMatchesByBracket(normalizedBracketId);

  const uniqueByMatch = new Map();
  (Array.isArray(picks) ? picks : []).forEach((item) => {
    const normalized = normalizePickPayload(item);
    if (!normalized) return;

    const validMatch = validMatches.get(normalized.matchId);
    if (!validMatch) return;

    const isDirectMatchTeam =
      normalized.selectedTeamId === validMatch.teamAId ||
      normalized.selectedTeamId === validMatch.teamBId;

    const hasOpenSlot = !validMatch.teamAId || !validMatch.teamBId;
    const isBracketTeam = bracketTeamIds.has(normalized.selectedTeamId);
    const isValidTeam = isDirectMatchTeam || (hasOpenSlot && isBracketTeam);

    if (!isValidTeam) return;

    uniqueByMatch.set(normalized.matchId, normalized.selectedTeamId);
  });

  const sanitizedPicks = Array.from(uniqueByMatch.entries()).map(
    ([matchId, selectedTeamId]) => ({
      matchId,
      selectedTeamId,
    }),
  );

  const { rows } = await pool.query(
    `
    INSERT INTO pickem_bracket_submissions (
      bracket_id,
      user_id,
      user_meta,
      updated_at
    )
    VALUES ($1, $2, $3::jsonb, NOW())
    ON CONFLICT (bracket_id, user_id)
    DO UPDATE SET
      user_meta = EXCLUDED.user_meta,
      updated_at = NOW()
    RETURNING id
    `,
    [normalizedBracketId, normalizedUserId, JSON.stringify(userMeta ?? {})],
  );

  const submissionId = Number(rows[0]?.id ?? 0);
  if (!submissionId) return null;

  if (!sanitizedPicks.length) {
    await pool.query(
      `
      DELETE FROM pickem_bracket_picks
      WHERE submission_id = $1
      `,
      [submissionId],
    );
  } else {
    await pool.query(
      `
      DELETE FROM pickem_bracket_picks
      WHERE submission_id = $1
      `,
      [submissionId],
    );

    for (const pick of sanitizedPicks) {
      await pool.query(
        `
        INSERT INTO pickem_bracket_picks (
          submission_id,
          bracket_id,
          match_id,
          selected_team_id,
          updated_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (submission_id, match_id)
        DO UPDATE SET
          selected_team_id = EXCLUDED.selected_team_id,
          updated_at = NOW()
        `,
        [submissionId, normalizedBracketId, pick.matchId, pick.selectedTeamId],
      );
    }
  }

  await pool.query(
    `
    UPDATE pickem_bracket_submissions
    SET updated_at = NOW()
    WHERE id = $1
    `,
    [submissionId],
  );

  return getUserBracketPicks({
    bracketId: normalizedBracketId,
    userId: normalizedUserId,
  });
};

export const getBracketPickemData = async ({ bracketId, userId }) => {
  const normalizedBracketId = toNumber(bracketId);
  if (!normalizedBracketId) return null;

  const [bracket, matches] = await Promise.all([
    getBracketById(normalizedBracketId),
    getMatchesByBracketId(normalizedBracketId),
  ]);

  if (!bracket) return null;

  const myPicks = normalizeUserId(userId)
    ? await getUserBracketPicks({
        bracketId: normalizedBracketId,
        userId,
      })
    : null;

  const evaluatedMyPicks = myPicks
    ? evaluateBracketPicks({
        matches,
        picks: myPicks.picks,
      })
    : null;

  return {
    bracket,
    matches,
    myPicks: myPicks
      ? {
          ...myPicks,
          picks: evaluatedMyPicks?.picks ?? myPicks.picks,
          stats: evaluatedMyPicks?.stats,
        }
      : null,
  };
};
