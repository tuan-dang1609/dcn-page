import { pool } from "./db.js";

export const COMPACT_SIX_ROUND_SHAPE = "1:2,2:2,3:1,4:2,5:1,6:1,7:1";

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getCompactSixLoserTarget = (currentRound, currentMatchNo) => {
  const compactSixLoserMap = {
    "1-1": { round: 4, matchNo: 2, slot: "A" },
    "1-2": { round: 4, matchNo: 1, slot: "A" },
    "2-1": { round: 4, matchNo: 1, slot: "B" },
    "2-2": { round: 4, matchNo: 2, slot: "B" },
    "3-1": { round: 6, matchNo: 1, slot: "A" },
  };

  return compactSixLoserMap[`${currentRound}-${currentMatchNo}`] ?? null;
};

const getWinnerRoundsForBracket = async (bracketId, roundShape) => {
  const { rows: roundOneCountRows } = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM matches
    WHERE bracket_id = $1 AND round_number = 1
    `,
    [bracketId],
  );

  const roundOneMatchCount = Number(roundOneCountRows[0]?.total ?? 0);
  let winnerRounds =
    roundOneMatchCount > 0 ? Math.max(1, Math.log2(roundOneMatchCount * 2)) : 1;

  if (roundShape === COMPACT_SIX_ROUND_SHAPE) {
    winnerRounds = 3;
  }

  return winnerRounds;
};

export const propagateWinnerToNextMatch = async (updatedMatch, winnerTeamId) => {
  if (!updatedMatch?.next_match_id || !winnerTeamId) {
    return null;
  }

  const nextSlot = String(updatedMatch.next_slot || "").toUpperCase();
  if (!["A", "B"].includes(nextSlot)) {
    return null;
  }

  const isSlotA = nextSlot === "A";
  const teamField = isSlotA ? "team_a_id" : "team_b_id";
  const seedField = isSlotA ? "seed_a" : "seed_b";
  const winnerSeed =
    winnerTeamId === toNumber(updatedMatch.team_a_id)
      ? updatedMatch.seed_a
      : updatedMatch.seed_b;

  const { rows } = await pool.query(
    `
    UPDATE matches
    SET ${teamField} = $1,
        ${seedField} = $2
    WHERE id = $3
    RETURNING *
    `,
    [winnerTeamId, winnerSeed ?? null, updatedMatch.next_match_id],
  );

  return rows[0] ?? null;
};

export const propagateLoserToLoserBracket = async ({
  updatedMatch,
  winnerTeamId,
}) => {
  if (!updatedMatch || !winnerTeamId) {
    return null;
  }

  const teamAId = toNumber(updatedMatch.team_a_id);
  const teamBId = toNumber(updatedMatch.team_b_id);
  const winnerId = toNumber(winnerTeamId);

  if (!teamAId || !teamBId || !winnerId) {
    return null;
  }

  const loserTeamId =
    winnerId === teamAId ? teamBId : winnerId === teamBId ? teamAId : null;

  if (!loserTeamId) {
    return null;
  }

  const loserSeed =
    loserTeamId === teamAId ? updatedMatch.seed_a : updatedMatch.seed_b;

  const { rows: bracketRows } = await pool.query(
    `
    SELECT b.id, b.tournament_id, b.stage, b.format_id,
           f.type AS format_type, f.has_losers_bracket
    FROM brackets b
    JOIN formats f ON f.id = b.format_id
    WHERE b.id = $1
    LIMIT 1
    `,
    [updatedMatch.bracket_id],
  );

  if (bracketRows.length === 0) {
    return null;
  }

  const bracket = bracketRows[0];
  const isDoubleElimination =
    String(bracket.format_type || "") === "elimination" &&
    Boolean(bracket.has_losers_bracket);
  const bracketStage = String(bracket.stage || "main").toLowerCase();

  if (!isDoubleElimination || bracketStage === "losers") {
    return null;
  }

  const currentRound = toNumber(updatedMatch.round_number);
  const currentMatchNo = toNumber(updatedMatch.match_no);

  if (!currentRound || !currentMatchNo) {
    return null;
  }

  const { rows: roundShapeRows } = await pool.query(
    `
    SELECT round_number, COUNT(*)::int AS total
    FROM matches
    WHERE bracket_id = $1
    GROUP BY round_number
    ORDER BY round_number ASC
    `,
    [updatedMatch.bracket_id],
  );

  const roundShape = roundShapeRows
    .map((row) => `${Number(row.round_number)}:${Number(row.total)}`)
    .join(",");

  const isCompactSixSingleBracket = roundShape === COMPACT_SIX_ROUND_SHAPE;
  const winnerRounds = await getWinnerRoundsForBracket(
    updatedMatch.bracket_id,
    roundShape,
  );

  const { rows: lowerRoundRows } = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM matches
    WHERE bracket_id = $1
      AND round_number > $2
    `,
    [updatedMatch.bracket_id, winnerRounds],
  );

  const usesSingleBracketDoubleElim =
    Number(lowerRoundRows[0]?.total ?? 0) > 0;

  let loserBracketId = null;
  if (!usesSingleBracketDoubleElim) {
    const { rows: loserBracketRows } = await pool.query(
      `
      SELECT id
      FROM brackets
      WHERE tournament_id = $1
        AND format_id = $2
        AND LOWER(stage) = 'losers'
      ORDER BY id ASC
      LIMIT 1
      `,
      [bracket.tournament_id, bracket.format_id],
    );

    loserBracketId = toNumber(loserBracketRows[0]?.id);
  }

  let targetBracketId = loserBracketId;
  let targetRound = 1;
  let targetMatchNo = Math.ceil(currentMatchNo / 2);
  let preferredSlot = currentMatchNo % 2 === 1 ? "A" : "B";

  if (isCompactSixSingleBracket) {
    targetBracketId = toNumber(updatedMatch.bracket_id);

    const target = getCompactSixLoserTarget(currentRound, currentMatchNo);

    if (!target) {
      return null;
    }

    targetRound = target.round;
    targetMatchNo = target.matchNo;
    preferredSlot = target.slot;
  } else if (loserBracketId) {
    if (currentRound > 1) {
      targetRound = Math.max(1, currentRound * 2 - 2);
      targetMatchNo = currentMatchNo;
      preferredSlot = "B";
    }
  } else {
    if (currentRound > winnerRounds) {
      return null;
    }

    targetBracketId = toNumber(updatedMatch.bracket_id);
    const loserMainRounds = Math.max(1, 2 * (winnerRounds - 1));

    let targetLoserRoundIndex = 1;

    if (currentRound === 1) {
      targetLoserRoundIndex = 1;
      targetMatchNo = Math.ceil(currentMatchNo / 2);
      preferredSlot = currentMatchNo % 2 === 1 ? "A" : "B";
    } else if (currentRound < winnerRounds) {
      targetLoserRoundIndex = Math.max(2, currentRound * 2 - 2);
      targetMatchNo = currentMatchNo;
      preferredSlot = "B";
    } else {
      targetLoserRoundIndex = loserMainRounds;
      targetMatchNo = 1;
      preferredSlot = "B";
    }

    targetRound = winnerRounds + targetLoserRoundIndex;
  }

  if (!targetBracketId) {
    return null;
  }

  const { rows: targetRows } = await pool.query(
    `
    SELECT *
    FROM matches
    WHERE bracket_id = $1
      AND round_number = $2
      AND match_no = $3
    ORDER BY id ASC
    LIMIT 1
    `,
    [targetBracketId, targetRound, targetMatchNo],
  );

  if (targetRows.length === 0) {
    return null;
  }

  const target = targetRows[0];

  let slot = preferredSlot;
  if (
    (slot === "A" && toNumber(target.team_a_id)) ||
    (slot === "B" && toNumber(target.team_b_id))
  ) {
    if (!toNumber(target.team_a_id)) slot = "A";
    else if (!toNumber(target.team_b_id)) slot = "B";
    else return null;
  }

  const teamField = slot === "A" ? "team_a_id" : "team_b_id";
  const seedField = slot === "A" ? "seed_a" : "seed_b";

  const { rows } = await pool.query(
    `
    UPDATE matches
    SET ${teamField} = $1,
        ${seedField} = $2
    WHERE id = $3
    RETURNING *
    `,
    [loserTeamId, loserSeed ?? null, target.id],
  );

  return rows[0] ?? null;
};

export const applyMatchProgression = async ({
  updatedMatch,
  winnerTeamId,
  propagateWinner = true,
  propagateLoser = true,
}) => {
  let nextMatch = null;
  let loserNextMatch = null;

  if (propagateWinner && winnerTeamId) {
    nextMatch = await propagateWinnerToNextMatch(updatedMatch, winnerTeamId);
  }

  if (propagateLoser && winnerTeamId) {
    loserNextMatch = await propagateLoserToLoserBracket({
      updatedMatch,
      winnerTeamId,
    });
  }

  return { nextMatch, loserNextMatch };
};

export const repropagateDoubleElimLosers = async (bracketId) => {
  const normalizedBracketId = toNumber(bracketId);
  if (!normalizedBracketId) {
    throw new Error("bracket_id không hợp lệ");
  }

  const { rows: roundShapeRows } = await pool.query(
    `
    SELECT round_number, COUNT(*)::int AS total
    FROM matches
    WHERE bracket_id = $1
    GROUP BY round_number
    ORDER BY round_number ASC
    `,
    [normalizedBracketId],
  );

  const roundShape = roundShapeRows
    .map((row) => `${Number(row.round_number)}:${Number(row.total)}`)
    .join(",");

  const winnerRounds = await getWinnerRoundsForBracket(
    normalizedBracketId,
    roundShape,
  );

  const { rows: completedUpperMatches } = await pool.query(
    `
    SELECT *
    FROM matches
    WHERE bracket_id = $1
      AND round_number <= $2
      AND winner_team_id IS NOT NULL
      AND team_a_id IS NOT NULL
      AND team_b_id IS NOT NULL
      AND LOWER(COALESCE(status, '')) IN ('completed', 'complete')
    ORDER BY round_number ASC, match_no ASC, id ASC
    `,
    [normalizedBracketId, winnerRounds],
  );

  const results = [];

  for (const match of completedUpperMatches) {
    const loserNextMatch = await propagateLoserToLoserBracket({
      updatedMatch: match,
      winnerTeamId: match.winner_team_id,
    });

    results.push({
      source_match_id: match.id,
      round_number: match.round_number,
      match_no: match.match_no,
      winner_team_id: match.winner_team_id,
      propagated: Boolean(loserNextMatch),
      target_match_id: loserNextMatch?.id ?? null,
    });
  }

  return {
    bracket_id: normalizedBracketId,
    winner_rounds: winnerRounds,
    processed: results.length,
    propagated: results.filter((item) => item.propagated).length,
    results,
  };
};

export const resetBracketProgression = async (bracketId) => {
  const normalizedBracketId = toNumber(bracketId);
  if (!normalizedBracketId) {
    throw new Error("bracket_id không hợp lệ");
  }

  const { rows: roundShapeRows } = await pool.query(
    `
    SELECT round_number, COUNT(*)::int AS total
    FROM matches
    WHERE bracket_id = $1
    GROUP BY round_number
    ORDER BY round_number ASC
    `,
    [normalizedBracketId],
  );

  const roundShape = roundShapeRows
    .map((row) => `${Number(row.round_number)}:${Number(row.total)}`)
    .join(",");

  const winnerRounds = await getWinnerRoundsForBracket(
    normalizedBracketId,
    roundShape,
  );

  const { rows: clearedRows } = await pool.query(
    `
    UPDATE matches
    SET score_a = NULL,
        score_b = NULL,
        winner_team_id = NULL,
        status = 'scheduled',
        team_a_id = CASE WHEN round_number = 1 THEN team_a_id ELSE NULL END,
        team_b_id = CASE WHEN round_number = 1 THEN team_b_id ELSE NULL END,
        seed_a = CASE WHEN round_number = 1 THEN seed_a ELSE NULL END,
        seed_b = CASE WHEN round_number = 1 THEN seed_b ELSE NULL END
    WHERE bracket_id = $1
      AND round_number > 1
    RETURNING id
    `,
    [normalizedBracketId],
  );

  await pool.query(
    `
    UPDATE matches
    SET score_a = NULL,
        score_b = NULL,
        winner_team_id = NULL,
        status = 'scheduled'
    WHERE bracket_id = $1
      AND round_number = 1
    `,
    [normalizedBracketId],
  );

  await pool.query(
    `
    DELETE FROM match_games
    WHERE match_id IN (SELECT id FROM matches WHERE bracket_id = $1)
    `,
    [normalizedBracketId],
  );

  return {
    bracket_id: normalizedBracketId,
    winner_rounds: winnerRounds,
    cleared_matches: clearedRows.length,
  };
};

export const deleteBracketData = async (bracketId) => {
  const normalizedBracketId = toNumber(bracketId);
  if (!normalizedBracketId) {
    throw new Error("bracket_id không hợp lệ");
  }

  return pool.transaction(async (client) => {
    const deletedMatchGames = await client.query(
      `
      DELETE FROM match_games
      WHERE match_id IN (SELECT id FROM matches WHERE bracket_id = $1)
      RETURNING id
      `,
      [normalizedBracketId],
    );

    let deletedPickemPicks = { rows: [] };
    let deletedPickemSubmissions = { rows: [] };

    try {
      deletedPickemPicks = await client.query(
        "DELETE FROM pickem_bracket_picks WHERE bracket_id = $1 RETURNING id",
        [normalizedBracketId],
      );
    } catch {
      // optional table
    }

    try {
      deletedPickemSubmissions = await client.query(
        "DELETE FROM pickem_bracket_submissions WHERE bracket_id = $1 RETURNING id",
        [normalizedBracketId],
      );
    } catch {
      // optional table
    }

    const deletedMatches = await client.query(
      "DELETE FROM matches WHERE bracket_id = $1 RETURNING id",
      [normalizedBracketId],
    );

    const deletedBracket = await client.query(
      "DELETE FROM brackets WHERE id = $1 RETURNING id",
      [normalizedBracketId],
    );

    if ((deletedBracket.rows?.length ?? 0) === 0) {
      throw new Error("Bracket not found");
    }

    return {
      bracket_id: normalizedBracketId,
      deleted_matches: deletedMatches.rows?.length ?? 0,
      deleted_match_games: deletedMatchGames.rows?.length ?? 0,
      deleted_pickem_picks: deletedPickemPicks.rows?.length ?? 0,
      deleted_pickem_submissions: deletedPickemSubmissions.rows?.length ?? 0,
    };
  });
};
