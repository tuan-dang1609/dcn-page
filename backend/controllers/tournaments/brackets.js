import { Elysia } from "elysia";
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

const generateSwissMatches = async ({
  bracketId,
  tournamentId,
  teamIds,
  rounds,
  bestOf,
}) => {
  const sortedTeamIds = [...teamIds];
  const teamCount = sortedTeamIds.length;
  const pairPerRound = Math.floor(teamCount / 2);

  for (let round = 1; round <= rounds; round += 1) {
    for (let matchNo = 1; matchNo <= pairPerRound; matchNo += 1) {
      let teamAId = null;
      let teamBId = null;

      if (round === 1) {
        const firstIndex = matchNo - 1;
        const secondIndex = firstIndex + pairPerRound;
        teamAId = sortedTeamIds[firstIndex] ?? null;
        teamBId = sortedTeamIds[secondIndex] ?? null;
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
          round,
          matchNo,
          teamAId,
          teamBId,
          bestOf,
          "scheduled",
        ],
      );
    }
  }

  if (teamCount % 2 === 1) {
    await pool.query(
      `
      INSERT INTO matches (
        bracket_id,
        tournament_id,
        round_number,
        match_no,
        team_a_id,
        team_b_id,
        score_a,
        score_b,
        best_of,
        winner_team_id,
        status
      )
      VALUES ($1,$2,1,$3,$4,NULL,1,0,$5,$4,'completed')
      `,
      [
        bracketId,
        tournamentId,
        pairPerRound + 1,
        sortedTeamIds[teamCount - 1],
        bestOf,
      ],
    );
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

const compareSwissStandingAsc = (teamAId, teamBId, standingsByTeam) => {
  const standingA = standingsByTeam.get(teamAId) ?? {};
  const standingB = standingsByTeam.get(teamBId) ?? {};

  if ((standingA.points ?? 0) !== (standingB.points ?? 0)) {
    return (standingA.points ?? 0) - (standingB.points ?? 0);
  }

  if ((standingA.byeCount ?? 0) !== (standingB.byeCount ?? 0)) {
    return (standingA.byeCount ?? 0) - (standingB.byeCount ?? 0);
  }

  if ((standingA.buchholz ?? 0) !== (standingB.buchholz ?? 0)) {
    return (standingA.buchholz ?? 0) - (standingB.buchholz ?? 0);
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

const pickSwissByeTeam = ({ orderedTeamIds, standingsByTeam }) => {
  const neverHadBye = orderedTeamIds.filter(
    (teamId) => Number(standingsByTeam.get(teamId)?.byeCount ?? 0) === 0,
  );
  const candidatePool = neverHadBye.length ? neverHadBye : orderedTeamIds;
  const sorted = [...candidatePool].sort((a, b) =>
    compareSwissStandingAsc(a, b, standingsByTeam),
  );
  return sorted[0] ?? null;
};

const findSwissPairsNoRematch = ({ orderedTeamIds, standingsByTeam, playedOpponents }) => {
  const solve = (remainingTeamIds) => {
    if (remainingTeamIds.length === 0) {
      return [];
    }

    const firstTeamId = remainingTeamIds[0];
    const candidates = remainingTeamIds
      .slice(1)
      .map((teamId) => ({
        teamId,
        pointGap: Math.abs(
          Number(standingsByTeam.get(firstTeamId)?.points ?? 0) -
            Number(standingsByTeam.get(teamId)?.points ?? 0),
        ),
      }))
      .sort((a, b) => {
        if (a.pointGap !== b.pointGap) {
          return a.pointGap - b.pointGap;
        }
        return compareSwissStandingDesc(a.teamId, b.teamId, standingsByTeam);
      });

    for (const candidate of candidates) {
      if (playedOpponents.get(firstTeamId)?.has(candidate.teamId)) {
        continue;
      }

      const nextRemaining = remainingTeamIds.filter(
        (teamId) => teamId !== firstTeamId && teamId !== candidate.teamId,
      );

      const tailPairs = solve(nextRemaining);
      if (tailPairs !== null) {
        return [[firstTeamId, candidate.teamId], ...tailPairs];
      }
    }

    return null;
  };

  return solve(orderedTeamIds);
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

    if (!teamIds || teamIds.length < 2) {
      set.status = 400;
      return { error: "Cần tối thiểu 2 đội để tạo bracket" };
    }

    const bestOf = toNumber(body?.best_of) ?? 1;

    const winnerBracket = await createBracketRecord({
      tournamentId,
      formatId,
      name: body?.winner_bracket_name ?? "Winner Bracket",
      stage: "main",
      status: body?.status ?? "scheduled",
    });

    const loserBracket = await createBracketRecord({
      tournamentId,
      formatId,
      name: body?.loser_bracket_name ?? "Loser Bracket",
      stage: "losers",
      status: body?.status ?? "scheduled",
    });

    const winnerResult = await generateSingleEliminationMatches({
      bracketId: Number(winnerBracket.id),
      tournamentId,
      teamIds,
      bestOf,
      autoAdvanceByes: true,
    });

    const loserRounds = Math.max(1, 2 * (winnerResult.totalRounds - 1));

    for (let round = 1; round <= loserRounds; round += 1) {
      const power = Math.ceil(round / 2) + 1;
      const matchCount = Math.max(1, winnerResult.bracketSize / 2 ** power);

      for (let matchNo = 1; matchNo <= matchCount; matchNo += 1) {
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
            Number(loserBracket.id),
            tournamentId,
            round,
            matchNo,
            bestOf,
            "scheduled",
          ],
        );
      }
    }

    const { rows: winnerMatches } = await pool.query(
      `
      SELECT *
      FROM matches
      WHERE bracket_id = $1
      ORDER BY round_number ASC, match_no ASC, id ASC
      `,
      [winnerBracket.id],
    );

    const { rows: loserMatches } = await pool.query(
      `
      SELECT *
      FROM matches
      WHERE bracket_id = $1
      ORDER BY round_number ASC, match_no ASC, id ASC
      `,
      [loserBracket.id],
    );

    set.status = 201;
    return {
      message: "Tạo double-elimination bracket thành công",
      data: {
        tournament_id: tournamentId,
        format: {
          id: format.id,
          name: format.name,
        },
        participants: teamIds.length,
        winner_bracket: {
          id: Number(winnerBracket.id),
          matches: winnerMatches,
        },
        loser_bracket: {
          id: Number(loserBracket.id),
          matches: loserMatches,
        },
        note: "Schema matches hiện chỉ có next_match_id/next_slot cho 1 nhánh, nên nhánh thua sẽ cần link thủ công bằng route PATCH /brackets/matches/:match_id/link.",
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
                winner_bracket_name: {
                  type: "string",
                  example: "Winner Bracket",
                },
                loser_bracket_name: {
                  type: "string",
                  example: "Loser Bracket",
                },
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

    const rounds =
      toNumber(body?.rounds) ??
      Math.max(1, Math.ceil(Math.log2(teamIds.length)));
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
      rounds,
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
        rounds,
        participants: teamIds.length,
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
                rounds: { type: "integer", example: 3 },
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

    const requestedRound = toNumber(body?.round_number);
    let targetRound = requestedRound;

    if (targetRound === null) {
      const roundNumbers = [
        ...new Set(
          allMatches
            .map((match) => toNumber(match.round_number))
            .filter(Number.isFinite),
        ),
      ].sort((a, b) => a - b);

      targetRound =
        roundNumbers.find((roundNumber) => {
          if (roundNumber <= 1) return false;
          const roundMatches = allMatches.filter(
            (match) => toNumber(match.round_number) === roundNumber,
          );
          return roundMatches.some(
            (match) =>
              toNumber(match.team_a_id) === null &&
              toNumber(match.team_b_id) === null,
          );
        }) ?? null;
    }

    if (!targetRound || targetRound <= 1) {
      set.status = 400;
      return {
        error:
          "Không tìm thấy round hợp lệ để pair. Hãy truyền round_number > 1 hoặc kiểm tra bracket.",
      };
    }

    const previousRoundMatches = allMatches.filter(
      (match) => toNumber(match.round_number) === targetRound - 1,
    );

    if (!previousRoundMatches.length) {
      set.status = 400;
      return { error: `Không có dữ liệu round ${targetRound - 1} để tính cặp` };
    }

    const unresolvedPreviousRound = previousRoundMatches.find(
      (match) => !isSwissMatchResolved(match),
    );

    if (unresolvedPreviousRound) {
      set.status = 400;
      return {
        error: `Round ${targetRound - 1} chưa hoàn tất, không thể pair round ${targetRound}`,
      };
    }

    const { standingsByTeam, playedOpponents } = buildSwissStandings({
      teamIds,
      matches: allMatches,
      targetRound,
    });

    const orderedTeamIds = [...teamIds].sort((a, b) =>
      compareSwissStandingDesc(a, b, standingsByTeam),
    );

    let byeTeamId = null;
    let teamIdsForPairing = [...orderedTeamIds];
    if (teamIdsForPairing.length % 2 === 1) {
      byeTeamId = pickSwissByeTeam({
        orderedTeamIds: teamIdsForPairing,
        standingsByTeam,
      });
      teamIdsForPairing = teamIdsForPairing.filter((teamId) => teamId !== byeTeamId);
    }

    const pairs = findSwissPairsNoRematch({
      orderedTeamIds: teamIdsForPairing,
      standingsByTeam,
      playedOpponents,
    });

    if (!pairs) {
      set.status = 400;
      return {
        error:
          "Không thể xếp cặp round này mà vẫn đảm bảo không rematch. Giảm số round hoặc điều chỉnh kết quả trước đó.",
      };
    }

    const pairPerRound = Math.floor(teamIds.length / 2);
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

      return status === "completed" || isInProgressState || winnerTeamId !== null || hasMeaningfulScore;
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

    if (targetRoundRows.length < pairPerRound) {
      for (let matchNo = targetRoundRows.length + 1; matchNo <= pairPerRound; matchNo += 1) {
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
          [bracketId, tournamentId, targetRound, matchNo, sourceBestOf, "scheduled"],
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
      (match) => toNumber(match.match_no) <= pairPerRound,
    );

    if (usablePairMatches.length < pairPerRound) {
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

    for (let index = 0; index < pairs.length; index += 1) {
      const [teamAId, teamBId] = pairs[index];
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

    if (byeTeamId !== null) {
      const byeMatchNo = pairPerRound + 1;
      const existingByeMatch = targetRoundMatches.find(
        (match) => toNumber(match.match_no) === byeMatchNo,
      );

      if (existingByeMatch) {
        await pool.query(
          `
          UPDATE matches
          SET team_a_id = $1,
              team_b_id = NULL,
              score_a = 1,
              score_b = 0,
              winner_team_id = $1,
              status = 'completed'
          WHERE id = $2
          `,
          [byeTeamId, existingByeMatch.id],
        );
      } else {
        await pool.query(
          `
          INSERT INTO matches (
            bracket_id,
            tournament_id,
            round_number,
            match_no,
            team_a_id,
            team_b_id,
            score_a,
            score_b,
            best_of,
            winner_team_id,
            status
          )
          VALUES ($1,$2,$3,$4,$5,NULL,1,0,$6,$5,'completed')
          `,
          [bracketId, tournamentId, targetRound, byeMatchNo, byeTeamId, sourceBestOf],
        );
      }
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
        bye_team_id: byeTeamId,
        pairs,
        standings: [...standingsByTeam.values()].sort((a, b) =>
          compareSwissStandingDesc(a.team_id, b.team_id, standingsByTeam),
        ),
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
