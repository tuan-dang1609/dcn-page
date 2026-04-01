import { Elysia } from "elysia";
import { randomInt } from "node:crypto";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";

const bracketRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Brackets";
const allowedRoleIds = new Set([1, 2, 3]);

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const doesTableExist = async (client, tableName) => {
  const { rows } = await client.query(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${tableName}`],
  );

  return Boolean(rows[0]?.exists);
};

const nextPowerOfTwo = (number) => {
  let value = 1;
  while (value < number) value *= 2;
  return value;
};

const buildSeedOrder = (size) => {
  if (size === 1) return [1];

  let order = [1, 2];
  while (order.length < size) {
    const nextSize = order.length * 2;
    const expanded = [];
    for (const seed of order) {
      expanded.push(seed, nextSize + 1 - seed);
    }
    order = expanded;
  }

  return order;
};

const ensureTournamentManagePermission = async (user, tournamentId, set) => {
  if (!user) {
    set.status = 401;
    return { ok: false, error: { error: "Unauthorized" } };
  }

  const { rows } = await pool.query(
    "SELECT id, created_by, format_id FROM tournaments WHERE id = $1",
    [tournamentId],
  );

  if (rows.length === 0) {
    set.status = 404;
    return { ok: false, error: { error: "Tournament not found" } };
  }

  const tournament = rows[0];
  const isOwner = Number(user.id) === Number(tournament.created_by);
  const hasRolePermission = allowedRoleIds.has(Number(user.role_id));

  if (!isOwner && !hasRolePermission) {
    set.status = 403;
    return {
      ok: false,
      error: { error: "Bạn không có quyền thao tác bracket của giải này" },
    };
  }

  return { ok: true, tournament };
};

const getTournamentTeamIds = async (tournamentId) => {
  const { rows } = await pool.query(
    "SELECT team_id FROM tournament_teams WHERE tournament_id = $1 ORDER BY id ASC",
    [tournamentId],
  );

  return rows.map((row) => Number(row.team_id)).filter(Number.isFinite);
};

const autoAdvanceSingleEliminationByes = async (bracketId) => {
  const { rows: matches } = await pool.query(
    `
    SELECT id, round_number, match_no, team_a_id, team_b_id, seed_a, seed_b,
           next_match_id, next_slot, winner_team_id, status
    FROM matches
    WHERE bracket_id = $1
    ORDER BY round_number ASC, match_no ASC
    `,
    [bracketId],
  );

  const byId = new Map(
    matches.map((match) => [Number(match.id), { ...match }]),
  );

  for (const match of matches) {
    const matchId = Number(match.id);
    const current = byId.get(matchId);
    if (!current) continue;

    const teamA = toNumber(current.team_a_id);
    const teamB = toNumber(current.team_b_id);
    const hasTeamA = teamA !== null;
    const hasTeamB = teamB !== null;

    if (!(hasTeamA ^ hasTeamB)) {
      continue;
    }

    const winnerTeamId = hasTeamA ? teamA : teamB;
    const winnerSeed = hasTeamA ? current.seed_a : current.seed_b;

    await pool.query(
      `
      UPDATE matches
      SET winner_team_id = $1,
          status = 'completed',
          score_a = CASE WHEN $2 THEN 1 ELSE 0 END,
          score_b = CASE WHEN $2 THEN 0 ELSE 1 END
      WHERE id = $3
      `,
      [winnerTeamId, hasTeamA, matchId],
    );

    if (current.next_match_id && current.next_slot) {
      const isSlotA = String(current.next_slot).toUpperCase() === "A";
      const teamField = isSlotA ? "team_a_id" : "team_b_id";
      const seedField = isSlotA ? "seed_a" : "seed_b";

      await pool.query(
        `
        UPDATE matches
        SET ${teamField} = $1,
            ${seedField} = $2
        WHERE id = $3
        `,
        [winnerTeamId, winnerSeed ?? null, current.next_match_id],
      );

      const next = byId.get(Number(current.next_match_id));
      if (next) {
        if (isSlotA) {
          next.team_a_id = winnerTeamId;
          next.seed_a = winnerSeed;
        } else {
          next.team_b_id = winnerTeamId;
          next.seed_b = winnerSeed;
        }
      }
    }
  }
};

const getFormatById = async (formatId) => {
  const { rows } = await pool.query(
    "SELECT id, name, type, has_losers_bracket FROM formats WHERE id = $1",
    [formatId],
  );
  return rows[0] ?? null;
};

const resolveParticipantTeamIds = async ({ tournamentId, teamIds }) => {
  const rawTeamIds = Array.isArray(teamIds)
    ? teamIds.map(toNumber).filter(Number.isFinite)
    : await getTournamentTeamIds(tournamentId);

  const uniqueTeamIds = [...new Set(rawTeamIds)];

  if (!Array.isArray(teamIds)) {
    return uniqueTeamIds;
  }

  if (uniqueTeamIds.length === 0) {
    return uniqueTeamIds;
  }

  const placeholders = uniqueTeamIds
    .map((_, index) => `$${index + 2}`)
    .join(", ");

  const { rows: validRows } = await pool.query(
    `SELECT team_id FROM tournament_teams WHERE tournament_id = $1 AND team_id IN (${placeholders})`,
    [tournamentId, ...uniqueTeamIds],
  );

  if (validRows.length !== uniqueTeamIds.length) {
    return null;
  }

  return uniqueTeamIds;
};

const createBracketRecord = async ({
  tournamentId,
  formatId,
  name = "Main Bracket",
  stage = "main",
  status = "scheduled",
}) => {
  const { rows } = await pool.query(
    `
    INSERT INTO brackets (tournament_id, format_id, name, stage, status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [tournamentId, formatId, name, stage, status],
  );

  return rows[0] ?? null;
};

const generateSingleEliminationMatches = async ({
  bracketId,
  tournamentId,
  teamIds,
  bestOf = 1,
  autoAdvanceByes = true,
}) => {
  const bracketSize = nextPowerOfTwo(teamIds.length);
  const totalRounds = Math.log2(bracketSize);
  const seedOrder = buildSeedOrder(bracketSize);

  const seedToTeamId = new Map();
  for (let index = 0; index < seedOrder.length; index += 1) {
    const seed = seedOrder[index];
    const teamId = teamIds[seed - 1] ?? null;
    seedToTeamId.set(seed, teamId);
  }

  const roundMatchIds = [];

  for (let round = 1; round <= totalRounds; round += 1) {
    const matchCount = bracketSize / 2 ** round;
    const currentRoundIds = [];

    for (let matchNo = 1; matchNo <= matchCount; matchNo += 1) {
      let teamAId = null;
      let teamBId = null;
      let seedA = null;
      let seedB = null;

      if (round === 1) {
        const firstRoundIndex = matchNo - 1;
        seedA = seedOrder[firstRoundIndex * 2] ?? null;
        seedB = seedOrder[firstRoundIndex * 2 + 1] ?? null;
        teamAId = seedA ? (seedToTeamId.get(seedA) ?? null) : null;
        teamBId = seedB ? (seedToTeamId.get(seedB) ?? null) : null;
      }

      const { rows: insertedRows } = await pool.query(
        `
        INSERT INTO matches (
          bracket_id,
          tournament_id,
          round_number,
          match_no,
          seed_a,
          seed_b,
          team_a_id,
          team_b_id,
          best_of,
          status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
        `,
        [
          bracketId,
          tournamentId,
          round,
          matchNo,
          seedA,
          seedB,
          teamAId,
          teamBId,
          bestOf,
          "scheduled",
        ],
      );

      currentRoundIds.push(Number(insertedRows[0]?.id));
    }

    roundMatchIds.push(currentRoundIds);
  }

  for (let round = 1; round <= totalRounds - 1; round += 1) {
    const currentRound = roundMatchIds[round - 1];
    const nextRound = roundMatchIds[round];

    for (let index = 0; index < currentRound.length; index += 1) {
      const currentMatchId = currentRound[index];
      const targetMatchId = nextRound[Math.floor(index / 2)];
      const nextSlot = index % 2 === 0 ? "A" : "B";

      await pool.query(
        `
        UPDATE matches
        SET next_match_id = $1, next_slot = $2
        WHERE id = $3
        `,
        [targetMatchId, nextSlot, currentMatchId],
      );
    }
  }

  if (autoAdvanceByes) {
    await autoAdvanceSingleEliminationByes(bracketId);
  }

  const { rows: matches } = await pool.query(
    `
    SELECT *
    FROM matches
    WHERE bracket_id = $1
    ORDER BY round_number ASC, match_no ASC, id ASC
    `,
    [bracketId],
  );

  return {
    matches,
    roundMatchIds,
    bracketSize,
    totalRounds,
  };
};

const generateCompactSixTeamDoubleEliminationMatches = async ({
  bracketId,
  tournamentId,
  teamIds,
  bestOf = 1,
}) => {
  if (!Array.isArray(teamIds) || teamIds.length !== 6) {
    return null;
  }

  const [seed1, seed2, seed3, seed4, seed5, seed6] = teamIds;

  const insertMatch = async ({
    round,
    matchNo,
    teamAId = null,
    teamBId = null,
    seedA = null,
    seedB = null,
  }) => {
    const { rows } = await pool.query(
      `
      INSERT INTO matches (
        bracket_id,
        tournament_id,
        round_number,
        match_no,
        seed_a,
        seed_b,
        team_a_id,
        team_b_id,
        best_of,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id
      `,
      [
        bracketId,
        tournamentId,
        round,
        matchNo,
        seedA,
        seedB,
        teamAId,
        teamBId,
        bestOf,
        "scheduled",
      ],
    );

    return Number(rows[0]?.id);
  };

  const matchIds = {
    r1m1: await insertMatch({
      round: 1,
      matchNo: 1,
      teamAId: seed3,
      teamBId: seed6,
      seedA: 3,
      seedB: 6,
    }),
    r1m2: await insertMatch({
      round: 1,
      matchNo: 2,
      teamAId: seed4,
      teamBId: seed5,
      seedA: 4,
      seedB: 5,
    }),
    r2m1: await insertMatch({
      round: 2,
      matchNo: 1,
      teamAId: seed1,
      teamBId: null,
      seedA: 1,
      seedB: null,
    }),
    r2m2: await insertMatch({
      round: 2,
      matchNo: 2,
      teamAId: seed2,
      teamBId: null,
      seedA: 2,
      seedB: null,
    }),
    r3m1: await insertMatch({ round: 3, matchNo: 1 }),
    r4m1: await insertMatch({ round: 4, matchNo: 1 }),
    r4m2: await insertMatch({ round: 4, matchNo: 2 }),
    r5m1: await insertMatch({ round: 5, matchNo: 1 }),
    r6m1: await insertMatch({ round: 6, matchNo: 1 }),
    r7m1: await insertMatch({ round: 7, matchNo: 1 }),
  };

  const links = [
    [matchIds.r1m1, matchIds.r2m1, "B"],
    [matchIds.r1m2, matchIds.r2m2, "B"],
    [matchIds.r2m1, matchIds.r3m1, "A"],
    [matchIds.r2m2, matchIds.r3m1, "B"],
    [matchIds.r3m1, matchIds.r7m1, "A"],

    [matchIds.r4m1, matchIds.r5m1, "A"],
    [matchIds.r4m2, matchIds.r5m1, "B"],
    [matchIds.r5m1, matchIds.r6m1, "B"],
    [matchIds.r6m1, matchIds.r7m1, "B"],
  ];

  for (const [fromMatchId, toMatchId, slot] of links) {
    await pool.query(
      `
      UPDATE matches
      SET next_match_id = $1, next_slot = $2
      WHERE id = $3
      `,
      [toMatchId, slot, fromMatchId],
    );
  }

  const { rows: matches } = await pool.query(
    `
    SELECT *
    FROM matches
    WHERE bracket_id = $1
    ORDER BY round_number ASC, match_no ASC, id ASC
    `,
    [bracketId],
  );

  return {
    matches,
    bracketSize: 6,
    winnerRounds: 3,
    loserRounds: 4,
    roundsTotal: 7,
  };
};

const shuffleArray = (items) => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const SWISS_STAGE_TEMPLATES = {
  8: [
    { label: "0-0", wins: 0, losses: 0, matches: 4 },
    { label: "1-0", wins: 1, losses: 0, matches: 2 },
    { label: "0-1", wins: 0, losses: 1, matches: 2 },
    { label: "1-1", wins: 1, losses: 1, matches: 2 },
  ],
  16: [
    { label: "0-0", wins: 0, losses: 0, matches: 8 },
    { label: "1-0", wins: 1, losses: 0, matches: 4 },
    { label: "0-1", wins: 0, losses: 1, matches: 4 },
    { label: "2-0", wins: 2, losses: 0, matches: 2 },
    { label: "0-2", wins: 0, losses: 2, matches: 2 },
    { label: "1-1", wins: 1, losses: 1, matches: 4 },
    { label: "2-1", wins: 2, losses: 1, matches: 3 },
    { label: "1-2", wins: 1, losses: 2, matches: 3 },
    { label: "2-2", wins: 2, losses: 2, matches: 3 },
  ],
};

const getSwissStageTemplate = (teamCount) =>
  SWISS_STAGE_TEMPLATES[teamCount] ?? null;

const getSwissQualificationRules = (teamCount) => {
  if (teamCount === 8) {
    return {
      advance_wins: 2,
      eliminate_losses: 2,
    };
  }

  if (teamCount === 16) {
    return {
      advance_wins: 3,
      eliminate_losses: 3,
    };
  }

  const fallback = Math.max(1, Math.ceil(Math.log2(Math.max(2, teamCount))));
  return {
    advance_wins: fallback,
    eliminate_losses: fallback,
  };
};

const SWISS_PAIR_PREREQUISITE_LABELS = {
  8: {
    "1-0": ["0-0"],
    "0-1": ["0-0"],
    "1-1": ["1-0", "0-1"],
  },
  16: {
    "1-0": ["0-0"],
    "0-1": ["0-0"],
    "2-0": ["1-0"],
    "0-2": ["0-1"],
    "1-1": ["1-0", "0-1"],
    "2-1": ["2-0", "1-1"],
    "1-2": ["1-1", "0-2"],
    "2-2": ["2-1", "1-2"],
  },
};

const getSwissRequiredRoundsForPairing = ({
  teamCount,
  targetRound,
  targetStage,
  swissTemplate,
}) => {
  if (!targetRound || targetRound <= 1) {
    return [];
  }

  const prerequisitesByLabel =
    SWISS_PAIR_PREREQUISITE_LABELS[teamCount] ?? null;
  if (!prerequisitesByLabel) {
    return Array.from({ length: targetRound - 1 }, (_, index) => index + 1);
  }

  const requiredLabels = prerequisitesByLabel[targetStage?.label] ?? null;
  if (!Array.isArray(requiredLabels) || requiredLabels.length === 0) {
    return Array.from({ length: targetRound - 1 }, (_, index) => index + 1);
  }

  const labelToRound = new Map(
    swissTemplate.map((stage, index) => [stage.label, index + 1]),
  );

  return requiredLabels
    .map((label) => Number(labelToRound.get(label)))
    .filter((roundNumber) => Number.isFinite(roundNumber));
};

const generateSwissMatches = async ({
  bracketId,
  tournamentId,
  teamIds,
  bestOf,
}) => {
  const swissTemplate = getSwissStageTemplate(teamIds.length);

  if (!swissTemplate) {
    throw new Error(
      "Swiss generate hiện chỉ hỗ trợ 8 hoặc 16 đội với template chuẩn",
    );
  }

  const shuffledTeamIds = shuffleArray(teamIds);

  for (let roundIndex = 0; roundIndex < swissTemplate.length; roundIndex += 1) {
    const stage = swissTemplate[roundIndex];
    const roundNumber = roundIndex + 1;

    for (let matchNo = 1; matchNo <= stage.matches; matchNo += 1) {
      let teamAId = null;
      let teamBId = null;

      if (roundNumber === 1) {
        const start = (matchNo - 1) * 2;
        teamAId = shuffledTeamIds[start] ?? null;
        teamBId = shuffledTeamIds[start + 1] ?? null;
      }

      await pool.query(
        `
        INSERT INTO matches (
          bracket_id,
          tournament_id,
          round_number,
          match_no,
          team_a_id,
          team_b_id,
          best_of,
          status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          bracketId,
          tournamentId,
          roundNumber,
          matchNo,
          teamAId,
          teamBId,
          bestOf,
          "scheduled",
        ],
      );
    }
  }
};

const compareSwissStandingDesc = (teamAId, teamBId, standingsByTeam) => {
  const standingA = standingsByTeam.get(teamAId) ?? {};
  const standingB = standingsByTeam.get(teamBId) ?? {};

  if ((standingB.points ?? 0) !== (standingA.points ?? 0)) {
    return (standingB.points ?? 0) - (standingA.points ?? 0);
  }

  if ((standingB.wins ?? 0) !== (standingA.wins ?? 0)) {
    return (standingB.wins ?? 0) - (standingA.wins ?? 0);
  }

  if ((standingB.buchholz ?? 0) !== (standingA.buchholz ?? 0)) {
    return (standingB.buchholz ?? 0) - (standingA.buchholz ?? 0);
  }

  return teamAId - teamBId;
};

const isSwissMatchResolved = (match) => {
  const teamAId = toNumber(match?.team_a_id);
  const teamBId = toNumber(match?.team_b_id);
  const winnerTeamId = toNumber(match?.winner_team_id);
  const scoreA = toNumber(match?.score_a);
  const scoreB = toNumber(match?.score_b);
  const status = String(match?.status || "").toLowerCase();

  if (teamAId === null && teamBId === null) {
    return true;
  }

  if ((teamAId === null) !== (teamBId === null)) {
    return true;
  }

  if (winnerTeamId !== null) {
    return true;
  }

  if (scoreA !== null && scoreB !== null && status === "completed") {
    return true;
  }

  return false;
};

const buildSwissStandings = ({ teamIds, matches, targetRound }) => {
  const standingsByTeam = new Map(
    teamIds.map((teamId) => [
      teamId,
      {
        team_id: teamId,
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
        byeCount: 0,
        buchholz: 0,
      },
    ]),
  );

  const playedOpponents = new Map(teamIds.map((teamId) => [teamId, new Set()]));

  for (const match of matches) {
    const roundNumber = toNumber(match?.round_number);
    if (roundNumber === null || roundNumber >= targetRound) {
      continue;
    }

    if (!isSwissMatchResolved(match)) {
      continue;
    }

    const teamAId = toNumber(match?.team_a_id);
    const teamBId = toNumber(match?.team_b_id);
    const winnerTeamId = toNumber(match?.winner_team_id);
    const scoreA = toNumber(match?.score_a);
    const scoreB = toNumber(match?.score_b);

    if (teamAId === null && teamBId === null) {
      continue;
    }

    if (teamAId !== null && teamBId === null) {
      const standingA = standingsByTeam.get(teamAId);
      if (standingA) {
        standingA.played += 1;
        standingA.wins += 1;
        standingA.points += 1;
        standingA.byeCount += 1;
      }
      continue;
    }

    if (teamBId !== null && teamAId === null) {
      const standingB = standingsByTeam.get(teamBId);
      if (standingB) {
        standingB.played += 1;
        standingB.wins += 1;
        standingB.points += 1;
        standingB.byeCount += 1;
      }
      continue;
    }

    const standingA = standingsByTeam.get(teamAId);
    const standingB = standingsByTeam.get(teamBId);

    if (!standingA || !standingB) {
      continue;
    }

    standingA.played += 1;
    standingB.played += 1;

    playedOpponents.get(teamAId)?.add(teamBId);
    playedOpponents.get(teamBId)?.add(teamAId);

    if (winnerTeamId === teamAId) {
      standingA.wins += 1;
      standingA.points += 1;
      standingB.losses += 1;
      continue;
    }

    if (winnerTeamId === teamBId) {
      standingB.wins += 1;
      standingB.points += 1;
      standingA.losses += 1;
      continue;
    }

    if (scoreA !== null && scoreB !== null && scoreA === scoreB) {
      standingA.draws += 1;
      standingB.draws += 1;
      standingA.points += 0.5;
      standingB.points += 0.5;
    }
  }

  for (const teamId of teamIds) {
    const standing = standingsByTeam.get(teamId);
    if (!standing) continue;

    const opponents = playedOpponents.get(teamId) ?? new Set();
    standing.buchholz = [...opponents].reduce((sum, opponentId) => {
      const opponent = standingsByTeam.get(opponentId);
      return sum + Number(opponent?.points ?? 0);
    }, 0);
  }

  return { standingsByTeam, playedOpponents };
};

const buildSwissTeamStatuses = ({ standingsByTeam, qualificationRules }) => {
  const advanceWins = Number(qualificationRules?.advance_wins ?? 0);
  const eliminateLosses = Number(qualificationRules?.eliminate_losses ?? 0);

  const statuses = [...standingsByTeam.values()].map((standing) => {
    const wins = Number(standing?.wins ?? 0);
    const losses = Number(standing?.losses ?? 0);

    let swiss_status = "pending";
    if (wins >= advanceWins) swiss_status = "advanced";
    else if (losses >= eliminateLosses) swiss_status = "eliminated";

    return {
      ...standing,
      swiss_status,
    };
  });

  return {
    statuses,
    advancedTeamIds: statuses
      .filter((item) => item.swiss_status === "advanced")
      .map((item) => Number(item.team_id)),
    eliminatedTeamIds: statuses
      .filter((item) => item.swiss_status === "eliminated")
      .map((item) => Number(item.team_id)),
  };
};

const findSwissPairsNoRematch = ({ orderedTeamIds, playedOpponents }) => {
  const solve = (remainingTeamIds) => {
    if (remainingTeamIds.length === 0) {
      return [];
    }

    const firstTeamId = remainingTeamIds[0];
    const candidates = shuffleArray(remainingTeamIds.slice(1));

    for (const candidateTeamId of candidates) {
      if (playedOpponents.get(firstTeamId)?.has(candidateTeamId)) {
        continue;
      }

      const nextRemaining = remainingTeamIds.filter(
        (teamId) => teamId !== firstTeamId && teamId !== candidateTeamId,
      );

      const tailPairs = solve(nextRemaining);
      if (tailPairs !== null) {
        return [[firstTeamId, candidateTeamId], ...tailPairs];
      }
    }

    return null;
  };

  return solve(orderedTeamIds);
};

const normalizePairKey = (pair) => {
  const a = Number(pair?.[0]);
  const b = Number(pair?.[1]);
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return `${min}-${max}`;
};

const normalizePairsSignature = (pairs) =>
  pairs
    .map(normalizePairKey)
    .sort((a, b) => a.localeCompare(b))
    .join("|");

const findRandomSwissPairsNoRematch = ({
  teamIds,
  playedOpponents,
  maxAttempts = 160,
}) => {
  const uniqueSolutions = new Map();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const randomizedTeamIds = shuffleArray(teamIds);
    const candidate = findSwissPairsNoRematch({
      orderedTeamIds: randomizedTeamIds,
      playedOpponents,
    });

    if (!candidate || candidate.length * 2 !== teamIds.length) {
      continue;
    }

    const signature = normalizePairsSignature(candidate);
    if (!uniqueSolutions.has(signature)) {
      uniqueSolutions.set(signature, candidate);
    }
  }

  const solutions = [...uniqueSolutions.values()];
  if (!solutions.length) {
    return null;
  }

  const randomSolutionIndex = randomInt(solutions.length);
  return solutions[randomSolutionIndex];
};

const generateRoundRobinMatches = async ({
  bracketId,
  tournamentId,
  teamIds,
  bestOf,
}) => {
  const teams = [...teamIds];
  const hasBye = teams.length % 2 === 1;

  if (hasBye) {
    teams.push(null);
  }

  const teamCount = teams.length;
  const rounds = teamCount - 1;
  const half = teamCount / 2;
  const rotation = [...teams];

  for (let round = 1; round <= rounds; round += 1) {
    let matchNo = 1;
    for (let index = 0; index < half; index += 1) {
      const home = rotation[index];
      const away = rotation[teamCount - 1 - index];

      if (home !== null && away !== null) {
        await pool.query(
          `
          INSERT INTO matches (
            bracket_id,
            tournament_id,
            round_number,
            match_no,
            team_a_id,
            team_b_id,
            best_of,
            status
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `,
          [
            bracketId,
            tournamentId,
            round,
            matchNo,
            home,
            away,
            bestOf,
            "scheduled",
          ],
        );
        matchNo += 1;
      }
    }

    const fixed = rotation[0];
    const rest = rotation.slice(1);
    rest.unshift(rest.pop());
    rotation.splice(0, rotation.length, fixed, ...rest);
  }
};

bracketRouter.get(
  "/:tournament_id",
  async ({ params, set }) => {
    const tournamentId = toNumber(params.tournament_id);

    if (!tournamentId) {
      set.status = 400;
      return { error: "tournament_id không hợp lệ" };
    }

    const { rows } = await pool.query(
      `
      SELECT b.*, f.name AS format_name, f.type AS format_type, f.has_losers_bracket
      FROM brackets b
      LEFT JOIN formats f ON f.id = b.format_id
      WHERE b.tournament_id = $1
      ORDER BY b.id ASC
      `,
      [tournamentId],
    );

    set.status = 200;
    return { data: rows };
  },
  {
    tags: [TAG],
    summary: "List brackets by tournament",
  },
);

bracketRouter.delete(
  "/:bracket_id",
  async ({ params, set, user }) => {
    const bracketId = toNumber(params.bracket_id);

    if (!bracketId) {
      set.status = 400;
      return { error: "bracket_id không hợp lệ" };
    }

    const { rows: bracketRows } = await pool.query(
      "SELECT id, tournament_id, name FROM brackets WHERE id = $1 LIMIT 1",
      [bracketId],
    );

    if (bracketRows.length === 0) {
      set.status = 404;
      return { error: "Bracket không tồn tại" };
    }

    const bracket = bracketRows[0];
    const tournamentId = Number(bracket.tournament_id);

    const permission = await ensureTournamentManagePermission(
      user,
      tournamentId,
      set,
    );
    if (!permission.ok) return permission.error;

    const BRACKET_NOT_FOUND_AFTER_DELETE = "BRACKET_NOT_FOUND_AFTER_DELETE";

    try {
      const result = await pool.transaction(async (client) => {
        let deletedMatchGames = 0;
        let deletedPickemPicks = 0;
        let deletedPickemSubmissions = 0;

        const hasMatchGamesTable = await doesTableExist(client, "match_games");
        const hasPickemPicksTable = await doesTableExist(
          client,
          "pickem_bracket_picks",
        );
        const hasPickemSubmissionsTable = await doesTableExist(
          client,
          "pickem_bracket_submissions",
        );

        if (hasMatchGamesTable) {
          const deletedMatchGamesResult = await client.query(
            `
            DELETE FROM match_games
            WHERE match_id IN (
              SELECT id FROM matches WHERE bracket_id = $1
            )
            RETURNING id
            `,
            [bracketId],
          );

          deletedMatchGames = deletedMatchGamesResult.rows?.length ?? 0;
        }

        if (hasPickemPicksTable) {
          const deletedPickemPicksResult = await client.query(
            "DELETE FROM pickem_bracket_picks WHERE bracket_id = $1 RETURNING id",
            [bracketId],
          );

          deletedPickemPicks = deletedPickemPicksResult.rows?.length ?? 0;
        }

        if (hasPickemSubmissionsTable) {
          const deletedPickemSubmissionsResult = await client.query(
            "DELETE FROM pickem_bracket_submissions WHERE bracket_id = $1 RETURNING id",
            [bracketId],
          );

          deletedPickemSubmissions =
            deletedPickemSubmissionsResult.rows?.length ?? 0;
        }

        const deletedMatchesResult = await client.query(
          "DELETE FROM matches WHERE bracket_id = $1 RETURNING id",
          [bracketId],
        );

        const deletedBracketResult = await client.query(
          "DELETE FROM brackets WHERE id = $1 RETURNING id",
          [bracketId],
        );

        if ((deletedBracketResult.rows?.length ?? 0) === 0) {
          const txError = new Error(BRACKET_NOT_FOUND_AFTER_DELETE);
          txError.code = BRACKET_NOT_FOUND_AFTER_DELETE;
          throw txError;
        }

        return {
          message: "Xóa bracket thành công",
          data: {
            bracket_id: bracketId,
            tournament_id: tournamentId,
            bracket_name: bracket.name ?? null,
            deleted_matches: deletedMatchesResult.rows?.length ?? 0,
            deleted_match_games: deletedMatchGames,
            deleted_pickem_picks: deletedPickemPicks,
            deleted_pickem_submissions: deletedPickemSubmissions,
          },
        };
      });

      set.status = 200;
      return result;
    } catch (error) {
      if (error?.code === BRACKET_NOT_FOUND_AFTER_DELETE) {
        set.status = 404;
        return { error: "Bracket không tồn tại" };
      }

      throw error;
    }
  },
  {
    tags: [TAG],
    summary: "Delete bracket and related records",
    security: [{ bearerAuth: [] }],
  },
);

bracketRouter.post(
  "/:tournament_id/single-elimination/generate",
  async ({ params, body, set, user }) => {
    const tournamentId = toNumber(params.tournament_id);

    if (!tournamentId) {
      set.status = 400;
      return { error: "tournament_id không hợp lệ" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      tournamentId,
      set,
    );
    if (!permission.ok) return permission.error;

    const formatId = toNumber(body?.format_id);
    if (!formatId) {
      set.status = 400;
      return { error: "Thiếu format_id" };
    }

    const { rows: formatRows } = await pool.query(
      "SELECT id, name, type, has_losers_bracket FROM formats WHERE id = $1",
      [formatId],
    );

    if (formatRows.length === 0) {
      set.status = 400;
      return { error: "format_id không tồn tại" };
    }

    const format = formatRows[0];
    const isSingleElimination =
      String(format.type || "") === "elimination" && !format.has_losers_bracket;

    if (!isSingleElimination) {
      set.status = 400;
      return {
        error:
          "Route này chỉ dùng cho single-elimination. Với double/swiss hãy tạo bracket trước rồi link slot thủ công.",
      };
    }

    const rawTeamIds = Array.isArray(body?.team_ids)
      ? body.team_ids.map(toNumber).filter(Number.isFinite)
      : await getTournamentTeamIds(tournamentId);

    const uniqueTeamIds = [...new Set(rawTeamIds)];

    if (uniqueTeamIds.length < 2) {
      set.status = 400;
      return { error: "Cần tối thiểu 2 đội để tạo bracket" };
    }

    if (Array.isArray(body?.team_ids)) {
      const { rows: validRows } = await pool.query(
        "SELECT team_id FROM tournament_teams WHERE tournament_id = $1 AND team_id IN (" +
          uniqueTeamIds.map((_, index) => `$${index + 2}`).join(", ") +
          ")",
        [tournamentId, ...uniqueTeamIds],
      );

      if (validRows.length !== uniqueTeamIds.length) {
        set.status = 400;
        return { error: "team_ids chứa đội không thuộc tournament này" };
      }
    }

    const existingBracketId = toNumber(body?.bracket_id);
    let bracketId = existingBracketId;

    if (existingBracketId) {
      const { rows: bracketRows } = await pool.query(
        "SELECT id, tournament_id FROM brackets WHERE id = $1",
        [existingBracketId],
      );

      if (
        bracketRows.length === 0 ||
        Number(bracketRows[0].tournament_id) !== tournamentId
      ) {
        set.status = 400;
        return { error: "bracket_id không hợp lệ cho tournament này" };
      }

      const { rows: existedMatches } = await pool.query(
        "SELECT id FROM matches WHERE bracket_id = $1 LIMIT 1",
        [existingBracketId],
      );

      if (existedMatches.length > 0) {
        set.status = 400;
        return { error: "Bracket đã có matches, không thể generate lại" };
      }
    } else {
      const { rows: createdRows } = await pool.query(
        `
        INSERT INTO brackets (tournament_id, format_id, name, stage, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [
          tournamentId,
          formatId,
          body?.name ?? "Main Bracket",
          body?.stage ?? "main",
          body?.status ?? "scheduled",
        ],
      );
      bracketId = Number(createdRows[0]?.id);
    }

    const bestOf = toNumber(body?.best_of) ?? 1;

    const { matches, bracketSize, totalRounds } =
      await generateSingleEliminationMatches({
        bracketId,
        tournamentId,
        teamIds: uniqueTeamIds,
        bestOf,
        autoAdvanceByes: true,
      });

    set.status = 201;
    return {
      message: "Tạo single-elimination bracket thành công",
      data: {
        bracket_id: bracketId,
        tournament_id: tournamentId,
        format: {
          id: format.id,
          name: format.name,
        },
        participant_count: uniqueTeamIds.length,
        bracket_size: bracketSize,
        rounds: totalRounds,
        matches,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Create + generate single-elimination bracket",
    security: [{ bearerAuth: [] }],
    detail: {
      parameters: [
        {
          name: "tournament_id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 100 },
          description: "ID giải đấu",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["format_id"],
              properties: {
                format_id: { type: "integer", example: 1 },
                team_ids: {
                  type: "array",
                  items: { type: "integer" },
                  example: [11, 22, 17, 21],
                },
                best_of: { type: "integer", example: 1 },
                bracket_id: { type: "integer", nullable: true, example: 206 },
                name: { type: "string", example: "Main Bracket" },
                stage: { type: "string", example: "main" },
                status: { type: "string", example: "scheduled" },
              },
            },
          },
        },
      },
    },
  },
);

bracketRouter.post(
  "/:tournament_id/double-elimination/generate",
  async ({ params, body, set, user }) => {
    const tournamentId = toNumber(params.tournament_id);

    if (!tournamentId) {
      set.status = 400;
      return { error: "tournament_id không hợp lệ" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      tournamentId,
      set,
    );
    if (!permission.ok) return permission.error;

    const formatId = toNumber(body?.format_id);
    if (!formatId) {
      set.status = 400;
      return { error: "Thiếu format_id" };
    }
    const format = await getFormatById(formatId);

    if (!format) {
      set.status = 400;
      return { error: "format_id không tồn tại" };
    }

    const isDoubleElimination =
      String(format.type || "") === "elimination" &&
      Boolean(format.has_losers_bracket);

    if (!isDoubleElimination) {
      set.status = 400;
      return { error: "Format hiện tại không phải double-elimination" };
    }

    const teamIds = await resolveParticipantTeamIds({
      tournamentId,
      teamIds: body?.team_ids,
    });

    if (teamIds === null) {
      set.status = 400;
      return { error: "team_ids chứa đội không thuộc tournament này" };
    }

    if (Array.isArray(body?.team_ids)) {
      const normalizedProvidedTeamIds = body.team_ids
        .map((id) => toNumber(id))
        .filter(Number.isFinite);

      const seenTeamIds = new Set();
      const duplicateTeamIds = [];
      for (const teamId of normalizedProvidedTeamIds) {
        if (seenTeamIds.has(teamId)) {
          duplicateTeamIds.push(teamId);
          continue;
        }
        seenTeamIds.add(teamId);
      }

      if (duplicateTeamIds.length > 0) {
        set.status = 400;
        return {
          error: `team_ids bị trùng: ${[...new Set(duplicateTeamIds)].join(", ")}. Cần ${[4, 6, 8].join("/")} đội khác nhau cho double-elimination.`,
        };
      }
    }

    if (!teamIds || teamIds.length < 2) {
      set.status = 400;
      return { error: "Cần tối thiểu 2 đội để tạo bracket" };
    }

    if (![4, 6, 8].includes(teamIds.length)) {
      set.status = 400;
      return {
        error:
          "Double-elimination hiện chỉ hỗ trợ 4, 6 hoặc 8 đội. Hãy truyền đúng team_ids hoặc cập nhật danh sách đội của giải.",
      };
    }

    const bestOf = toNumber(body?.best_of) ?? 1;

    const bracket = await createBracketRecord({
      tournamentId,
      formatId,
      name: body?.name ?? "Double Elimination Bracket",
      stage: body?.stage ?? "main",
      status: body?.status ?? "scheduled",
    });

    let bracketSize = 0;
    let winnerRounds = 0;
    let loserMainRounds = 0;
    let roundsTotal = 0;
    let roundMap = {};
    let note =
      "Double-elimination được tạo trong 1 bracket duy nhất. Hỗ trợ 4/6/8 đội; với 6 đội sẽ auto-advance bye ở nhánh trên.";

    if (teamIds.length === 6) {
      const compactSixResult =
        await generateCompactSixTeamDoubleEliminationMatches({
          bracketId: Number(bracket.id),
          tournamentId,
          teamIds,
          bestOf,
        });

      bracketSize = Number(compactSixResult?.bracketSize ?? 6);
      winnerRounds = Number(compactSixResult?.winnerRounds ?? 3);
      loserMainRounds = Number(compactSixResult?.loserRounds ?? 4);
      roundsTotal = Number(compactSixResult?.roundsTotal ?? 7);
      roundMap = {
        winner_rounds: {
          1: "Play-in nhánh trên",
          2: "Bán kết nhánh trên",
          3: "Chung kết nhánh trên",
        },
        loser_rounds: {
          4: "Loại 1",
          5: "Loại 2",
          6: "Chung kết nhánh thua",
          7: "Chung kết tổng",
        },
      };
      note =
        "Double-elimination 6 đội được tạo theo compact layout (2-2-1-2-1-1-1), khớp style bracket 6 đội ở frontend.";
    } else {
      const winnerResult = await generateSingleEliminationMatches({
        bracketId: Number(bracket.id),
        tournamentId,
        teamIds,
        bestOf,
        autoAdvanceByes: true,
      });

      winnerRounds = Number(winnerResult.totalRounds);
      bracketSize = Number(winnerResult.bracketSize);

      const loserTotalRounds = Math.max(1, 2 * (winnerRounds - 1)) + 1;
      loserMainRounds = loserTotalRounds - 1;
      roundsTotal = winnerRounds + loserTotalRounds;
      const loserRoundMatchIds = [];

      for (
        let loserRoundIndex = 1;
        loserRoundIndex <= loserMainRounds;
        loserRoundIndex += 1
      ) {
        const exponent = Math.floor((loserRoundIndex + 1) / 2) + 1;
        const matchCount = Math.max(1, bracketSize / 2 ** exponent);
        const currentRoundIds = [];
        const absoluteRoundNumber = winnerRounds + loserRoundIndex;

        for (let matchNo = 1; matchNo <= matchCount; matchNo += 1) {
          const { rows: insertedRows } = await pool.query(
            `
            INSERT INTO matches (
              bracket_id,
              tournament_id,
              round_number,
              match_no,
              best_of,
              status
            )
            VALUES ($1,$2,$3,$4,$5,$6)
            RETURNING id
            `,
            [
              Number(bracket.id),
              tournamentId,
              absoluteRoundNumber,
              matchNo,
              bestOf,
              "scheduled",
            ],
          );

          currentRoundIds.push(Number(insertedRows[0]?.id));
        }

        loserRoundMatchIds.push(currentRoundIds);
      }

      const { rows: grandFinalRows } = await pool.query(
        `
        INSERT INTO matches (
          bracket_id,
          tournament_id,
          round_number,
          match_no,
          best_of,
          status
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id
        `,
        [
          Number(bracket.id),
          tournamentId,
          winnerRounds + loserTotalRounds,
          1,
          bestOf,
          "scheduled",
        ],
      );
      const grandFinalMatchId = Number(grandFinalRows[0]?.id);

      for (let round = 1; round <= loserMainRounds - 1; round += 1) {
        const currentRound = loserRoundMatchIds[round - 1];
        const nextRound = loserRoundMatchIds[round];

        for (let index = 0; index < currentRound.length; index += 1) {
          const currentMatchId = currentRound[index];

          let targetMatchId = null;
          let nextSlot = "A";

          if (round % 2 === 1) {
            targetMatchId = nextRound[index] ?? null;
            nextSlot = "A";
          } else {
            targetMatchId = nextRound[Math.floor(index / 2)] ?? null;
            nextSlot = index % 2 === 0 ? "A" : "B";
          }

          if (!targetMatchId) continue;

          await pool.query(
            `
            UPDATE matches
            SET next_match_id = $1, next_slot = $2
            WHERE id = $3
            `,
            [targetMatchId, nextSlot, currentMatchId],
          );
        }
      }

      const lastLoserMainRound = loserRoundMatchIds[loserMainRounds - 1] ?? [];
      if (lastLoserMainRound[0] && grandFinalMatchId) {
        await pool.query(
          `
          UPDATE matches
          SET next_match_id = $1, next_slot = 'B'
          WHERE id = $2
          `,
          [grandFinalMatchId, lastLoserMainRound[0]],
        );
      }

      const winnerFinalMatchId =
        winnerResult.roundMatchIds[winnerRounds - 1]?.[0] ?? null;
      if (winnerFinalMatchId && grandFinalMatchId) {
        await pool.query(
          `
          UPDATE matches
          SET next_match_id = $1, next_slot = 'A'
          WHERE id = $2
          `,
          [grandFinalMatchId, winnerFinalMatchId],
        );
      }

      roundMap = {
        winner_rounds: {
          1: winnerRounds >= 3 ? "Tứ kết nhánh trên" : "Bán kết nhánh trên",
          2: "Bán kết nhánh trên",
          3: "Chung kết nhánh trên",
        },
        loser_rounds: {
          [winnerRounds + 1]: "Vòng loại 1",
          [winnerRounds + 2]: "Vòng loại 2",
          [winnerRounds + 3]: "Tranh hạng 4",
          [winnerRounds + 4]: "Tranh hạng 3",
          [winnerRounds + 5]: "Chung kết tổng",
        },
      };
    }

    const { rows: allMatches } = await pool.query(
      `
      SELECT m.id,
             m.bracket_id,
             m.round_number,
             m.match_no,
             m.team_a_id,
             m.team_b_id,
             m.seed_a,
             m.seed_b,
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
      [bracket.id],
    );

    set.status = 201;
    return {
      message: "Tạo double-elimination bracket thành công",
      data: {
        bracket_id: Number(bracket.id),
        tournament_id: tournamentId,
        format: {
          id: format.id,
          name: format.name,
        },
        participants: teamIds.length,
        bracket_size: bracketSize,
        winner_rounds: winnerRounds,
        loser_rounds: loserMainRounds,
        rounds_total: roundsTotal,
        matches: allMatches,
        round_map: roundMap,
        note,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Create + generate double-elimination brackets",
    security: [{ bearerAuth: [] }],
    detail: {
      parameters: [
        {
          name: "tournament_id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 100 },
          description: "ID giải đấu",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["format_id"],
              properties: {
                format_id: { type: "integer", example: 2 },
                team_ids: {
                  type: "array",
                  items: { type: "integer" },
                  example: [11, 22, 17, 21, 31, 32, 33, 34],
                },
                best_of: { type: "integer", example: 3 },
                name: { type: "string", example: "Double Elimination Bracket" },
                stage: { type: "string", example: "main" },
                status: { type: "string", example: "scheduled" },
              },
            },
          },
        },
      },
    },
  },
);

bracketRouter.post(
  "/:tournament_id/swiss/generate",
  async ({ params, body, set, user }) => {
    const tournamentId = toNumber(params.tournament_id);

    if (!tournamentId) {
      set.status = 400;
      return { error: "tournament_id không hợp lệ" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      tournamentId,
      set,
    );
    if (!permission.ok) return permission.error;

    const formatId = toNumber(body?.format_id);
    if (!formatId) {
      set.status = 400;
      return { error: "Thiếu format_id" };
    }
    const format = await getFormatById(formatId);

    if (!format) {
      set.status = 400;
      return { error: "format_id không tồn tại" };
    }

    if (String(format.type || "") !== "swiss") {
      set.status = 400;
      return { error: "Format hiện tại không phải swiss" };
    }

    const teamIds = await resolveParticipantTeamIds({
      tournamentId,
      teamIds: body?.team_ids,
    });

    if (teamIds === null) {
      set.status = 400;
      return { error: "team_ids chứa đội không thuộc tournament này" };
    }

    if (!teamIds || teamIds.length < 2) {
      set.status = 400;
      return { error: "Cần tối thiểu 2 đội để tạo swiss" };
    }

    const swissTemplate = getSwissStageTemplate(teamIds.length);
    if (!swissTemplate) {
      set.status = 400;
      return {
        error:
          "Swiss template hiện chỉ hỗ trợ 8 hoặc 16 đội để tạo đúng sườn nhánh thắng-thua.",
      };
    }

    const qualificationRules = getSwissQualificationRules(teamIds.length);

    const bestOf = toNumber(body?.best_of) ?? 1;

    const bracket = await createBracketRecord({
      tournamentId,
      formatId,
      name: body?.name ?? "Swiss Stage",
      stage: body?.stage ?? "main",
      status: body?.status ?? "scheduled",
    });

    await generateSwissMatches({
      bracketId: Number(bracket.id),
      tournamentId,
      teamIds,
      bestOf,
    });

    const { rows: matches } = await pool.query(
      `
      SELECT *
      FROM matches
      WHERE bracket_id = $1
      ORDER BY round_number ASC, match_no ASC, id ASC
      `,
      [bracket.id],
    );

    set.status = 201;
    return {
      message: "Tạo swiss bracket thành công",
      data: {
        bracket_id: Number(bracket.id),
        tournament_id: tournamentId,
        rounds: swissTemplate.length,
        participants: teamIds.length,
        qualification_rules: qualificationRules,
        stage_template: swissTemplate,
        matches,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Create + generate swiss bracket",
    security: [{ bearerAuth: [] }],
    detail: {
      parameters: [
        {
          name: "tournament_id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 100 },
          description: "ID giải đấu",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["format_id"],
              properties: {
                format_id: { type: "integer", example: 4 },
                team_ids: {
                  type: "array",
                  items: { type: "integer" },
                  example: [11, 22, 17, 21, 31, 32, 33, 34],
                },
                best_of: { type: "integer", example: 1 },
                name: { type: "string", example: "Swiss Stage" },
                stage: { type: "string", example: "main" },
                status: { type: "string", example: "scheduled" },
              },
            },
          },
        },
      },
    },
  },
);

bracketRouter.post(
  "/:tournament_id/swiss/:bracket_id/pair-next-round",
  async ({ params, body, set, user }) => {
    const tournamentId = toNumber(params.tournament_id);
    const bracketId = toNumber(params.bracket_id);

    if (!tournamentId) {
      set.status = 400;
      return { error: "tournament_id không hợp lệ" };
    }

    if (!bracketId) {
      set.status = 400;
      return { error: "bracket_id không hợp lệ" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      tournamentId,
      set,
    );
    if (!permission.ok) return permission.error;

    const { rows: bracketRows } = await pool.query(
      `
      SELECT b.id, b.tournament_id, b.format_id, f.type AS format_type
      FROM brackets b
      JOIN formats f ON f.id = b.format_id
      WHERE b.id = $1 AND b.tournament_id = $2
      LIMIT 1
      `,
      [bracketId, tournamentId],
    );

    if (bracketRows.length === 0) {
      set.status = 404;
      return { error: "Bracket không tồn tại trong tournament này" };
    }

    if (String(bracketRows[0].format_type || "") !== "swiss") {
      set.status = 400;
      return { error: "Bracket hiện tại không phải swiss" };
    }

    const { rows: allMatches } = await pool.query(
      `
      SELECT *
      FROM matches
      WHERE bracket_id = $1
      ORDER BY round_number ASC, match_no ASC, id ASC
      `,
      [bracketId],
    );

    if (!allMatches.length) {
      set.status = 400;
      return { error: "Bracket chưa có match để pair" };
    }

    const teamIdSet = new Set();
    for (const match of allMatches) {
      const teamAId = toNumber(match.team_a_id);
      const teamBId = toNumber(match.team_b_id);
      if (teamAId !== null) teamIdSet.add(teamAId);
      if (teamBId !== null) teamIdSet.add(teamBId);
    }

    const teamIds = [...teamIdSet];
    if (teamIds.length < 2) {
      set.status = 400;
      return { error: "Swiss cần tối thiểu 2 đội" };
    }

    const swissTemplate = getSwissStageTemplate(teamIds.length);
    if (!swissTemplate) {
      set.status = 400;
      return {
        error:
          "Bracket Swiss này không dùng template 8/16 đội nên không thể auto-pair theo nhánh score.",
      };
    }

    const qualificationRules = getSwissQualificationRules(teamIds.length);

    const maxTemplateRound = swissTemplate.length;

    const requestedRound = toNumber(body?.round_number);
    let targetRound = requestedRound;

    if (targetRound === null) {
      targetRound = null;
      for (
        let roundNumber = 2;
        roundNumber <= maxTemplateRound;
        roundNumber += 1
      ) {
        const roundMatches = allMatches.filter(
          (match) => toNumber(match.round_number) === roundNumber,
        );
        const hasEmptySlot = roundMatches.some(
          (match) =>
            toNumber(match.team_a_id) === null &&
            toNumber(match.team_b_id) === null,
        );

        if (hasEmptySlot) {
          targetRound = roundNumber;
          break;
        }
      }
    }

    if (!targetRound || targetRound <= 1 || targetRound > maxTemplateRound) {
      set.status = 400;
      return {
        error:
          "Không tìm thấy round hợp lệ để pair. Hãy truyền round_number > 1 hoặc kiểm tra bracket.",
      };
    }

    const targetStage = swissTemplate[targetRound - 1];
    if (!targetStage) {
      set.status = 400;
      return { error: "Round Swiss không tồn tại trong template hiện tại" };
    }

    const prerequisiteRounds = getSwissRequiredRoundsForPairing({
      teamCount: teamIds.length,
      targetRound,
      targetStage,
      swissTemplate,
    });
    const prerequisiteRoundSet = new Set(prerequisiteRounds);

    const unresolvedEarlierMatches = allMatches.filter((match) => {
      const roundNumber = toNumber(match.round_number);
      const hasTwoTeams =
        toNumber(match.team_a_id) !== null &&
        toNumber(match.team_b_id) !== null;

      if (
        !roundNumber ||
        !prerequisiteRoundSet.has(roundNumber) ||
        !hasTwoTeams
      ) {
        return false;
      }

      return !isSwissMatchResolved(match);
    });

    if (unresolvedEarlierMatches.length > 0) {
      set.status = 400;
      return {
        error: `Còn round trước chưa hoàn tất, không thể pair round ${targetRound}`,
      };
    }

    const { standingsByTeam, playedOpponents } = buildSwissStandings({
      teamIds,
      matches: allMatches,
      targetRound,
    });

    const swissClassification = buildSwissTeamStatuses({
      standingsByTeam,
      qualificationRules,
    });
    const statusByTeam = new Map(
      swissClassification.statuses.map((item) => [
        Number(item.team_id),
        item.swiss_status,
      ]),
    );

    const expectedParticipants = targetStage.matches * 2;
    const eligibleTeamIds = teamIds.filter((teamId) => {
      const standing = standingsByTeam.get(teamId);
      const status = statusByTeam.get(Number(teamId)) ?? "pending";
      return (
        Number(standing?.wins ?? 0) === targetStage.wins &&
        Number(standing?.losses ?? 0) === targetStage.losses &&
        status === "pending"
      );
    });

    if (eligibleTeamIds.length !== expectedParticipants) {
      set.status = 400;
      return {
        error: `Round ${targetRound} (${targetStage.label}) cần ${expectedParticipants} đội nhưng hiện có ${eligibleTeamIds.length}. Hãy kiểm tra kết quả các round trước.`,
      };
    }

    const pairs = findRandomSwissPairsNoRematch({
      teamIds: eligibleTeamIds,
      playedOpponents,
    });

    if (!pairs || pairs.length !== targetStage.matches) {
      set.status = 400;
      return {
        error:
          "Không thể xếp cặp round này mà vẫn đảm bảo random và không rematch.",
      };
    }

    const sourceBestOf =
      toNumber(body?.best_of) ?? toNumber(allMatches[0]?.best_of) ?? 1;

    const { rows: targetRoundRows } = await pool.query(
      `
      SELECT *
      FROM matches
      WHERE bracket_id = $1 AND round_number = $2
      ORDER BY match_no ASC, id ASC
      `,
      [bracketId, targetRound],
    );

    const lockedRoundMatches = targetRoundRows.filter((match) => {
      const status = String(match.status || "").toLowerCase();
      const teamAId = toNumber(match.team_a_id);
      const teamBId = toNumber(match.team_b_id);
      const winnerTeamId = toNumber(match.winner_team_id);
      const scoreA = toNumber(match.score_a);
      const scoreB = toNumber(match.score_b);
      const hasTwoTeams = teamAId !== null && teamBId !== null;
      const hasMeaningfulScore =
        (scoreA !== null && scoreA !== 0) || (scoreB !== null && scoreB !== 0);
      const isInProgressState = status.length > 0 && status !== "scheduled";

      if (!hasTwoTeams) {
        return false;
      }

      return (
        status === "completed" ||
        isInProgressState ||
        winnerTeamId !== null ||
        hasMeaningfulScore
      );
    });
    const hasLockedRoundData = lockedRoundMatches.length > 0;

    if (hasLockedRoundData) {
      set.status = 400;
      return {
        error:
          "Round mục tiêu đã có kết quả/điểm. Không thể auto-pair để tránh ghi đè dữ liệu.",
        details: lockedRoundMatches.map((match) => ({
          id: Number(match.id),
          round_number: Number(match.round_number),
          match_no: Number(match.match_no),
          team_a_id: toNumber(match.team_a_id),
          team_b_id: toNumber(match.team_b_id),
          score_a: toNumber(match.score_a),
          score_b: toNumber(match.score_b),
          winner_team_id: toNumber(match.winner_team_id),
          status: String(match.status || ""),
        })),
      };
    }

    if (targetRoundRows.length < targetStage.matches) {
      for (
        let matchNo = targetRoundRows.length + 1;
        matchNo <= targetStage.matches;
        matchNo += 1
      ) {
        await pool.query(
          `
          INSERT INTO matches (
            bracket_id,
            tournament_id,
            round_number,
            match_no,
            best_of,
            status
          )
          VALUES ($1,$2,$3,$4,$5,$6)
          `,
          [
            bracketId,
            tournamentId,
            targetRound,
            matchNo,
            sourceBestOf,
            "scheduled",
          ],
        );
      }
    }

    const { rows: targetRoundMatches } = await pool.query(
      `
      SELECT *
      FROM matches
      WHERE bracket_id = $1 AND round_number = $2
      ORDER BY match_no ASC, id ASC
      `,
      [bracketId, targetRound],
    );

    const usablePairMatches = targetRoundMatches.filter(
      (match) => toNumber(match.match_no) <= targetStage.matches,
    );

    if (usablePairMatches.length < targetStage.matches) {
      set.status = 500;
      return { error: "Không đủ match slot để cập nhật pairing" };
    }

    for (const match of usablePairMatches) {
      await pool.query(
        `
        UPDATE matches
        SET team_a_id = NULL,
            team_b_id = NULL,
            seed_a = NULL,
            seed_b = NULL,
            score_a = NULL,
            score_b = NULL,
            winner_team_id = NULL,
            status = 'scheduled'
        WHERE id = $1
        `,
        [match.id],
      );
    }

    const randomizedPairs = shuffleArray(pairs);

    for (let index = 0; index < randomizedPairs.length; index += 1) {
      const [teamAId, teamBId] = randomizedPairs[index];
      const targetMatch = usablePairMatches[index];

      await pool.query(
        `
        UPDATE matches
        SET team_a_id = $1,
            team_b_id = $2,
            score_a = NULL,
            score_b = NULL,
            winner_team_id = NULL,
            status = 'scheduled'
        WHERE id = $3
        `,
        [teamAId, teamBId, targetMatch.id],
      );
    }

    const { rows: pairedRoundMatches } = await pool.query(
      `
      SELECT *
      FROM matches
      WHERE bracket_id = $1 AND round_number = $2
      ORDER BY match_no ASC, id ASC
      `,
      [bracketId, targetRound],
    );

    set.status = 200;
    return {
      message: `Auto pair swiss round ${targetRound} thành công`,
      data: {
        bracket_id: bracketId,
        tournament_id: tournamentId,
        round: targetRound,
        stage_label: targetStage.label,
        qualification_rules: qualificationRules,
        pairs: randomizedPairs,
        standings: swissClassification.statuses.sort((a, b) =>
          compareSwissStandingDesc(a.team_id, b.team_id, standingsByTeam),
        ),
        advanced_team_ids: swissClassification.advancedTeamIds,
        eliminated_team_ids: swissClassification.eliminatedTeamIds,
        matches: pairedRoundMatches,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Auto pair next swiss round (no rematch)",
    security: [{ bearerAuth: [] }],
    detail: {
      parameters: [
        {
          name: "tournament_id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 100 },
          description: "ID giải đấu",
        },
        {
          name: "bracket_id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 500 },
          description: "ID bracket swiss",
        },
      ],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                round_number: { type: "integer", example: 2 },
                best_of: { type: "integer", example: 1 },
              },
            },
          },
        },
      },
    },
  },
);

bracketRouter.post(
  "/:tournament_id/round-robin/generate",
  async ({ params, body, set, user }) => {
    const tournamentId = toNumber(params.tournament_id);

    if (!tournamentId) {
      set.status = 400;
      return { error: "tournament_id không hợp lệ" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      tournamentId,
      set,
    );
    if (!permission.ok) return permission.error;

    const formatId = toNumber(body?.format_id);
    if (!formatId) {
      set.status = 400;
      return { error: "Thiếu format_id" };
    }
    const format = await getFormatById(formatId);

    if (!format) {
      set.status = 400;
      return { error: "format_id không tồn tại" };
    }

    if (String(format.type || "") !== "round_robin") {
      set.status = 400;
      return { error: "Format hiện tại không phải round robin" };
    }

    const teamIds = await resolveParticipantTeamIds({
      tournamentId,
      teamIds: body?.team_ids,
    });

    if (teamIds === null) {
      set.status = 400;
      return { error: "team_ids chứa đội không thuộc tournament này" };
    }

    if (!teamIds || teamIds.length < 2) {
      set.status = 400;
      return { error: "Cần tối thiểu 2 đội để tạo round robin" };
    }

    const bestOf = toNumber(body?.best_of) ?? 1;
    const bracket = await createBracketRecord({
      tournamentId,
      formatId,
      name: body?.name ?? "Group Stage",
      stage: body?.stage ?? "group",
      status: body?.status ?? "scheduled",
    });

    await generateRoundRobinMatches({
      bracketId: Number(bracket.id),
      tournamentId,
      teamIds,
      bestOf,
    });

    const { rows: matches } = await pool.query(
      `
      SELECT *
      FROM matches
      WHERE bracket_id = $1
      ORDER BY round_number ASC, match_no ASC, id ASC
      `,
      [bracket.id],
    );

    set.status = 201;
    return {
      message: "Tạo round robin bracket thành công",
      data: {
        bracket_id: Number(bracket.id),
        tournament_id: tournamentId,
        participants: teamIds.length,
        matches,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Create + generate round-robin bracket",
    security: [{ bearerAuth: [] }],
    detail: {
      parameters: [
        {
          name: "tournament_id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 100 },
          description: "ID giải đấu",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["format_id"],
              properties: {
                format_id: { type: "integer", example: 3 },
                team_ids: {
                  type: "array",
                  items: { type: "integer" },
                  example: [11, 22, 17, 21],
                },
                best_of: { type: "integer", example: 1 },
                name: { type: "string", example: "Group Stage" },
                stage: { type: "string", example: "group" },
                status: { type: "string", example: "scheduled" },
              },
            },
          },
        },
      },
    },
  },
);

bracketRouter.patch(
  "/matches/:match_id/link",
  async ({ params, body, set, user }) => {
    const matchId = toNumber(params.match_id);
    const nextMatchId = toNumber(body?.next_match_id);
    const nextSlot = String(body?.next_slot || "").toUpperCase();

    if (!matchId) {
      set.status = 400;
      return { error: "match_id không hợp lệ" };
    }

    const { rows: matchRows } = await pool.query(
      "SELECT id, tournament_id, bracket_id FROM matches WHERE id = $1",
      [matchId],
    );

    if (matchRows.length === 0) {
      set.status = 404;
      return { error: "Match not found" };
    }

    const currentMatch = matchRows[0];
    const permission = await ensureTournamentManagePermission(
      user,
      Number(currentMatch.tournament_id),
      set,
    );
    if (!permission.ok) return permission.error;

    if (nextMatchId === null) {
      const { rows } = await pool.query(
        `
        UPDATE matches
        SET next_match_id = NULL, next_slot = NULL
        WHERE id = $1
        RETURNING *
        `,
        [matchId],
      );

      set.status = 200;
      return {
        message: "Đã gỡ liên kết trận kế tiếp",
        data: rows[0] ?? null,
      };
    }

    if (!["A", "B"].includes(nextSlot)) {
      set.status = 400;
      return { error: "next_slot phải là A hoặc B" };
    }

    const { rows: nextRows } = await pool.query(
      "SELECT id, bracket_id FROM matches WHERE id = $1",
      [nextMatchId],
    );

    if (nextRows.length === 0) {
      set.status = 404;
      return { error: "next_match_id không tồn tại" };
    }

    if (Number(nextRows[0].bracket_id) !== Number(currentMatch.bracket_id)) {
      set.status = 400;
      return { error: "Chỉ được liên kết match trong cùng 1 bracket" };
    }

    const { rows } = await pool.query(
      `
      UPDATE matches
      SET next_match_id = $1, next_slot = $2
      WHERE id = $3
      RETURNING *
      `,
      [nextMatchId, nextSlot, matchId],
    );

    set.status = 200;
    return {
      message: "Cập nhật link next_slot thành công",
      data: rows[0] ?? null,
    };
  },
  {
    tags: [TAG],
    summary: "Link match to next slot (manual for double/swiss/custom)",
    security: [{ bearerAuth: [] }],
  },
);

export default bracketRouter;
