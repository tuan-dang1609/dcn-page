import { pool } from "./db.js";

const DEFAULT_POINT_RULES = [10, 7, 5, 4, 3, 2, 1, 0];

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

let rankingTablesReadyPromise = null;

const ensureRankingTables = async () => {
  if (rankingTablesReadyPromise) {
    return rankingTablesReadyPromise;
  }

  rankingTablesReadyPromise = (async () => {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS series_point_rules (
      id BIGSERIAL PRIMARY KEY,
      series_id BIGINT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
      placement SMALLINT NOT NULL CHECK (placement >= 1),
      points INT NOT NULL CHECK (points >= 0),
      UNIQUE (series_id, placement)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tournament_team_results (
      id BIGSERIAL PRIMARY KEY,
      tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      placement SMALLINT,
      placement_end SMALLINT,
      placement_label TEXT,
      points INT NOT NULL DEFAULT 0,
      wins INT NOT NULL DEFAULT 0,
      losses INT NOT NULL DEFAULT 0,
      is_final BOOLEAN NOT NULL DEFAULT FALSE,
      calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tournament_id, team_id)
    )
  `);

  await pool.query(`
    ALTER TABLE tournament_team_results
    ADD COLUMN IF NOT EXISTS placement_end SMALLINT
  `);

  await pool.query(`
    ALTER TABLE tournament_team_results
    ADD COLUMN IF NOT EXISTS placement_label TEXT
  `);

  await pool.query(`
    ALTER TABLE tournament_team_results
    ADD COLUMN IF NOT EXISTS elim_round INT
  `);

  await pool.query(`
    ALTER TABLE tournament_team_results
    ADD COLUMN IF NOT EXISTS elim_label TEXT
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ttr_tournament_place
      ON tournament_team_results (tournament_id, placement)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tournament_team_achievements (
      id BIGSERIAL PRIMARY KEY,
      tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tournament_id, team_id, code)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tta_tournament_team
      ON tournament_team_achievements (tournament_id, team_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS series_team_totals (
      series_id BIGINT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
      team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      total_points INT NOT NULL DEFAULT 0,
      tournaments_played INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (series_id, team_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tournament_ranking_brackets (
      tournament_id BIGINT PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
      bracket_id BIGINT NOT NULL REFERENCES brackets(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  })();

  return rankingTablesReadyPromise;
};

const getTournamentRankingBracketId = async (tournamentId) => {
  const normalizedTournamentId = toNumber(tournamentId);
  if (!normalizedTournamentId) return null;

  await ensureRankingTables();

  const { rows } = await pool.query(
    `
    SELECT trb.bracket_id
    FROM tournament_ranking_brackets trb
    WHERE trb.tournament_id = $1
    LIMIT 1
    `,
    [normalizedTournamentId],
  );

  return toNumber(rows[0]?.bracket_id);
};

const setTournamentRankingBracketId = async ({ tournamentId, bracketId }) => {
  const normalizedTournamentId = toNumber(tournamentId);
  const normalizedBracketId = toNumber(bracketId);

  if (!normalizedTournamentId) {
    throw new Error("tournament_id khong hop le");
  }

  await ensureRankingTables();

  if (!normalizedBracketId) {
    await pool.query(
      `DELETE FROM tournament_ranking_brackets WHERE tournament_id = $1`,
      [normalizedTournamentId],
    );

    return null;
  }

  const { rows: bracketRows } = await pool.query(
    `
    SELECT id
    FROM brackets
    WHERE id = $1 AND tournament_id = $2
    LIMIT 1
    `,
    [normalizedBracketId, normalizedTournamentId],
  );

  if (!bracketRows.length) {
    throw new Error("bracket_id khong thuoc tournament nay");
  }

  await pool.query(
    `
    INSERT INTO tournament_ranking_brackets (tournament_id, bracket_id, updated_at)
    VALUES ($1, $2, now())
    ON CONFLICT (tournament_id)
    DO UPDATE SET bracket_id = EXCLUDED.bracket_id, updated_at = now()
    `,
    [normalizedTournamentId, normalizedBracketId],
  );

  return normalizedBracketId;
};

const ensureDefaultSeriesPointRules = async (seriesId) => {
  if (!seriesId) return;

  for (let i = 0; i < DEFAULT_POINT_RULES.length; i += 1) {
    await pool.query(
      `
      INSERT INTO series_point_rules (series_id, placement, points)
      VALUES ($1, $2, $3)
      ON CONFLICT (series_id, placement) DO NOTHING
      `,
      [seriesId, i + 1, DEFAULT_POINT_RULES[i]],
    );
  }
};

const getSeriesPointMap = async (seriesId) => {
  const map = new Map();
  if (!seriesId) return map;

  const { rows } = await pool.query(
    `SELECT placement, points FROM series_point_rules WHERE series_id = $1`,
    [seriesId],
  );

  for (const row of rows) {
    const placement = toNumber(row.placement);
    const points = toNumber(row.points);
    if (placement && points !== null) {
      map.set(placement, points);
    }
  }

  return map;
};

const toPlacementLabel = (start, end) => {
  if (!start) return null;
  if (!end || end === start) return String(start);
  return `${start}-${end}`;
};

const buildTeamStats = ({ teamIds, matches }) => {
  const stats = new Map(
    teamIds.map((teamId) => [
      teamId,
      {
        team_id: teamId,
        wins: 0,
        losses: 0,
        played: 0,
        last_round: 0,
        opponents: new Set(),
        buchholz: 0,
      },
    ]),
  );

  for (const match of matches) {
    const teamA = toNumber(match.team_a_id);
    const teamB = toNumber(match.team_b_id);
    const winner = toNumber(match.winner_team_id);
    const roundNumber = toNumber(match.round_number) ?? 0;

    if (!teamA || !teamB || !winner) continue;

    const statA = stats.get(teamA);
    const statB = stats.get(teamB);
    if (!statA || !statB) continue;

    statA.played += 1;
    statB.played += 1;
    statA.last_round = Math.max(statA.last_round, roundNumber);
    statB.last_round = Math.max(statB.last_round, roundNumber);
    statA.opponents.add(teamB);
    statB.opponents.add(teamA);

    if (winner === teamA) {
      statA.wins += 1;
      statB.losses += 1;
    } else if (winner === teamB) {
      statB.wins += 1;
      statA.losses += 1;
    }
  }

  for (const stat of stats.values()) {
    stat.buchholz = [...stat.opponents].reduce((sum, opponentTeamId) => {
      const opponent = stats.get(opponentTeamId);
      return sum + Number(opponent?.wins ?? 0);
    }, 0);
  }

  return stats;
};

const sortCompletedMatches = (matches) =>
  matches
    .filter((match) => {
      const teamA = toNumber(match.team_a_id);
      const teamB = toNumber(match.team_b_id);
      const winner = toNumber(match.winner_team_id);
      return teamA && teamB && winner;
    })
    .slice()
    .sort((a, b) => {
      const roundDiff =
        (toNumber(a.round_number) ?? 0) - (toNumber(b.round_number) ?? 0);
      if (roundDiff !== 0) return roundDiff;

      const matchNoDiff =
        (toNumber(a.match_no) ?? 0) - (toNumber(b.match_no) ?? 0);
      if (matchNoDiff !== 0) return matchNoDiff;

      return (toNumber(a.id) ?? 0) - (toNumber(b.id) ?? 0);
    });

const FOUR_TEAM_ADVANCE_ROUND_SHAPE = "1:2,2:1,3:1,4:1";

const getMatchRoundShape = (matches) => {
  const countByRound = new Map();
  for (const match of matches) {
    const roundNumber = toNumber(match.round_number);
    if (!roundNumber) continue;
    countByRound.set(roundNumber, (countByRound.get(roundNumber) ?? 0) + 1);
  }
  return [...countByRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, count]) => `${round}:${count}`)
    .join(",");
};

const normalizeBracketStageLabel = (raw) => {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  const key = value.toLowerCase().replace(/[\s_-]+/g, "");
  const aliases = {
    playin: "Play-in",
    playins: "Play-in",
    playoff: "Play-off",
    playoffs: "Play-off",
    main: "Main",
    group: "Group",
    groups: "Group",
    swiss: "Swiss",
  };

  if (aliases[key]) return aliases[key];

  // Title-case nhẹ: "play in" → "Play In"
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
};

const getEliminationBranchLabel = (roundNumber, roundShape) => {
  if (roundShape === FOUR_TEAM_ADVANCE_ROUND_SHAPE) {
    const labels = {
      1: "Trận mở màn",
      2: "Nhánh thắng",
      3: "Nhánh thua",
      4: "Trận quyết định",
    };
    return labels[roundNumber] ?? `Vòng ${roundNumber}`;
  }
  return roundNumber ? `Vòng ${roundNumber}` : null;
};

const formatElimLabel = (bracketLabel, roundNumber, roundShape) => {
  const stage = normalizeBracketStageLabel(bracketLabel);
  const branch = getEliminationBranchLabel(roundNumber, roundShape);

  // Play-in / Play-off: ưu tiên tên vòng trong bracket (dễ đọc hơn "playin · …")
  if (stage === "Play-in" || stage === "Play-off") {
    if (branch) return `${stage} · ${branch}`;
    return stage;
  }

  if (stage && branch && stage.toLowerCase() !== branch.toLowerCase()) {
    return `${stage} · ${branch}`;
  }
  return stage || branch || null;
};

const resolveEliminationLossThreshold = ({
  hasLosersBracket,
  matches,
}) => {
  const roundShape = getMatchRoundShape(matches);
  // DE advance / double-elim: thua 1 trận chưa bị loại (còn nhánh thua / quyết định)
  if (roundShape === FOUR_TEAM_ADVANCE_ROUND_SHAPE) return 2;
  if (hasLosersBracket) return 2;
  return 1;
};

const buildEliminationRanking = ({
  teamIds,
  matches,
  eliminationLossThreshold,
  bracketLabel = null,
}) => {
  const completedMatches = sortCompletedMatches(matches);
  const stats = buildTeamStats({ teamIds, matches: completedMatches });
  const roundShape = getMatchRoundShape(matches);
  const lossThreshold = Math.max(1, Number(eliminationLossThreshold) || 1);

  const teamLosses = new Map(teamIds.map((teamId) => [teamId, 0]));
  const eliminatedTeams = new Set();
  const eliminatedByRound = new Map();
  const elimRoundByTeam = new Map();

  for (const match of completedMatches) {
    const roundNumber = toNumber(match.round_number) ?? 0;
    const teamA = toNumber(match.team_a_id);
    const teamB = toNumber(match.team_b_id);
    const winner = toNumber(match.winner_team_id);

    if (!teamA || !teamB || !winner) continue;

    const loser = winner === teamA ? teamB : winner === teamB ? teamA : null;
    if (!loser) continue;

    const nextLossCount = Number(teamLosses.get(loser) ?? 0) + 1;
    teamLosses.set(loser, nextLossCount);

    if (nextLossCount >= lossThreshold && !eliminatedTeams.has(loser)) {
      eliminatedTeams.add(loser);
      elimRoundByTeam.set(loser, roundNumber);

      if (!eliminatedByRound.has(roundNumber)) {
        eliminatedByRound.set(roundNumber, []);
      }

      eliminatedByRound.get(roundNumber).push(loser);
    }
  }

  const remainingTeamIds = teamIds.filter(
    (teamId) => !eliminatedTeams.has(teamId),
  );
  const isFinal =
    remainingTeamIds.length === 1 &&
    eliminatedTeams.size === teamIds.length - 1;

  // Gán hạng ngay khi bị loại (theo vòng), đội còn lại để null → UI hiện "-"
  const placementByTeam = new Map();
  const rounds = [...eliminatedByRound.keys()].sort((a, b) => a - b);
  let remaining = teamIds.length;

  for (const roundNumber of rounds) {
    const eliminatedInRound = [
      ...new Set(eliminatedByRound.get(roundNumber) ?? []),
    ];
    if (!eliminatedInRound.length) continue;

    const groupSize = eliminatedInRound.length;
    const placementStart = remaining - groupSize + 1;
    const placementEnd = remaining;
    const placementLabel = toPlacementLabel(placementStart, placementEnd);

    for (const teamId of eliminatedInRound) {
      const elimRound = elimRoundByTeam.get(teamId) ?? roundNumber;
      placementByTeam.set(teamId, {
        placement: placementStart,
        placement_end: placementEnd,
        placement_label: placementLabel,
        elim_round: elimRound,
        elim_label: formatElimLabel(bracketLabel, elimRound, roundShape),
      });
    }

    remaining -= groupSize;
  }

  if (isFinal && remainingTeamIds[0]) {
    placementByTeam.set(remainingTeamIds[0], {
      placement: 1,
      placement_end: 1,
      placement_label: "1",
      elim_round: null,
      elim_label: null,
    });
  }

  const rankings = teamIds
    .map((teamId) => {
      const stat = stats.get(teamId);
      const placement = placementByTeam.get(teamId) ?? {
        placement: null,
        placement_end: null,
        placement_label: null,
        elim_round: null,
        elim_label: null,
      };

      return {
        ...stat,
        ...placement,
      };
    })
    .sort((a, b) => {
      const aPlacement = toNumber(a.placement);
      const bPlacement = toNumber(b.placement);
      // Đội còn thi đấu (chưa có hạng) lên trước
      if (aPlacement === null && bPlacement !== null) return -1;
      if (aPlacement !== null && bPlacement === null) return 1;
      if (aPlacement !== null && bPlacement !== null && aPlacement !== bPlacement) {
        return aPlacement - bPlacement;
      }
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
      return a.team_id - b.team_id;
    });

  return {
    isFinal,
    rankings,
  };
};

const getSwissQualificationRules = (teamCount) => {
  if (teamCount === 8) {
    return { advance_wins: 2, eliminate_losses: 2 };
  }
  if (teamCount === 16) {
    return { advance_wins: 3, eliminate_losses: 3 };
  }
  const fallback = Math.max(1, Math.ceil(Math.log2(Math.max(2, teamCount))));
  return { advance_wins: fallback, eliminate_losses: fallback };
};

/** Swiss: hạng cặp khi đủ số trận thua loại; đội còn lại / đi tiếp → "-" */
const buildSwissRanking = ({ teamIds, matches }) => {
  const completedMatches = sortCompletedMatches(matches);
  const stats = buildTeamStats({ teamIds, matches: completedMatches });
  const { advance_wins: advanceWins, eliminate_losses: eliminateLosses } =
    getSwissQualificationRules(teamIds.length);

  const teamLosses = new Map(teamIds.map((teamId) => [teamId, 0]));
  const eliminatedTeams = new Set();
  const elimRoundByTeam = new Map();
  /** Group by wins-at-elim for tied bands like 9-12 */
  const eliminatedByWins = new Map();

  for (const match of completedMatches) {
    const roundNumber = toNumber(match.round_number) ?? 0;
    const teamA = toNumber(match.team_a_id);
    const teamB = toNumber(match.team_b_id);
    const winner = toNumber(match.winner_team_id);
    if (!teamA || !teamB || !winner) continue;

    const loser = winner === teamA ? teamB : winner === teamB ? teamA : null;
    if (!loser) continue;

    const nextLossCount = Number(teamLosses.get(loser) ?? 0) + 1;
    teamLosses.set(loser, nextLossCount);

    if (nextLossCount >= eliminateLosses && !eliminatedTeams.has(loser)) {
      eliminatedTeams.add(loser);
      elimRoundByTeam.set(loser, roundNumber);
      const winsAtElim = Number(stats.get(loser)?.wins ?? 0);
      if (!eliminatedByWins.has(winsAtElim)) {
        eliminatedByWins.set(winsAtElim, []);
      }
      eliminatedByWins.get(winsAtElim).push(loser);
    }
  }

  const matchesWithTwoTeams = matches.filter((match) => {
    const teamA = toNumber(match.team_a_id);
    const teamB = toNumber(match.team_b_id);
    return teamA && teamB;
  });

  const pendingOrAdvanced = teamIds.filter((id) => !eliminatedTeams.has(id));
  const allMatchesDone =
    matchesWithTwoTeams.length > 0 &&
    matchesWithTwoTeams.every((match) => toNumber(match.winner_team_id));
  const noPendingLeft = pendingOrAdvanced.every((teamId) => {
    const wins = Number(stats.get(teamId)?.wins ?? 0);
    return wins >= advanceWins;
  });
  const isFinal = allMatchesDone || (eliminatedTeams.size > 0 && noPendingLeft);

  const placementByTeam = new Map();
  let remaining = teamIds.length;

  // Worst elim bands first (fewest wins)
  const winBands = [...eliminatedByWins.keys()].sort((a, b) => a - b);
  for (const wins of winBands) {
    const group = [...new Set(eliminatedByWins.get(wins) ?? [])];
    if (!group.length) continue;
    const groupSize = group.length;
    const placementStart = remaining - groupSize + 1;
    const placementEnd = remaining;
    const placementLabel = toPlacementLabel(placementStart, placementEnd);
    for (const teamId of group) {
      const elimRound = elimRoundByTeam.get(teamId) ?? null;
      placementByTeam.set(teamId, {
        placement: placementStart,
        placement_end: placementEnd,
        placement_label: placementLabel,
        elim_round: elimRound,
        elim_label: elimRound
          ? formatElimLabel(null, elimRound, null)
          : "Swiss",
      });
    }
    remaining -= groupSize;
  }

  if (isFinal) {
    const survivors = pendingOrAdvanced
      .map((teamId) => stats.get(teamId))
      .filter(Boolean)
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (a.losses !== b.losses) return a.losses - b.losses;
        if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
        return a.team_id - b.team_id;
      });

    survivors.forEach((stat, index) => {
      const placement = index + 1;
      placementByTeam.set(stat.team_id, {
        placement,
        placement_end: placement,
        placement_label: String(placement),
        elim_round: null,
        elim_label: null,
      });
    });
  }

  const rankings = teamIds
    .map((teamId) => {
      const stat = stats.get(teamId);
      const placement = placementByTeam.get(teamId) ?? {
        placement: null,
        placement_end: null,
        placement_label: null,
        elim_round: null,
        elim_label: null,
      };
      return { ...stat, ...placement };
    })
    .sort((a, b) => {
      const aPlacement = toNumber(a.placement);
      const bPlacement = toNumber(b.placement);
      if (aPlacement === null && bPlacement !== null) return -1;
      if (aPlacement !== null && bPlacement === null) return 1;
      if (aPlacement !== null && bPlacement !== null && aPlacement !== bPlacement) {
        return aPlacement - bPlacement;
      }
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
      return a.team_id - b.team_id;
    });

  return { isFinal, rankings };
};

const buildStandingsRanking = ({ teamIds, matches }) => {
  const completedMatches = sortCompletedMatches(matches);
  const stats = buildTeamStats({ teamIds, matches: completedMatches });

  const matchesWithTwoTeams = matches.filter((match) => {
    const teamA = toNumber(match.team_a_id);
    const teamB = toNumber(match.team_b_id);
    return teamA && teamB;
  });

  const isFinal =
    matchesWithTwoTeams.length > 0 &&
    matchesWithTwoTeams.every((match) => toNumber(match.winner_team_id));

  const sorted = [...stats.values()].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    return a.team_id - b.team_id;
  });

  const rankings = sorted.map((item, index) => {
    if (!isFinal) {
      return {
        ...item,
        placement: null,
        placement_end: null,
        placement_label: null,
        elim_round: null,
        elim_label: null,
      };
    }

    const placement = index + 1;
    return {
      ...item,
      placement,
      placement_end: placement,
      placement_label: String(placement),
      elim_round: null,
      elim_label: null,
    };
  });

  return {
    isFinal,
    rankings,
  };
};

const getAchievementPayload = (item) => {
  const start = toNumber(item.placement);
  const end = toNumber(item.placement_end) ?? start;

  if (!start) return null;

  if (start === 1 && end === 1) {
    return {
      code: "CHAMPION",
      title: "Vo dich",
      description: "Doi dat hang 1 tai giai dau.",
    };
  }

  if (start === 2 && end === 2) {
    return {
      code: "RUNNER_UP",
      title: "A quan",
      description: "Doi dat hang 2 tai giai dau.",
    };
  }

  if (start === 3 && end === 3) {
    return {
      code: "THIRD_PLACE",
      title: "Hang 3",
      description: "Doi dat hang 3 tai giai dau.",
    };
  }

  if (start === 4 && end === 4) {
    return {
      code: "FOURTH_PLACE",
      title: "Hang 4",
      description: "Doi dat hang 4 tai giai dau.",
    };
  }

  if (start === end) {
    return {
      code: `PLACE_${start}`,
      title: `Hang ${start}`,
      description: `Doi dat hang ${start} tai giai dau.`,
    };
  }

  return {
    code: `TOP_${start}_${end}`,
    title: `Top ${start}-${end}`,
    description: `Doi dat top ${start}-${end} tai giai dau.`,
  };
};

const upsertTournamentResults = async ({
  tournamentId,
  rankings,
  pointMap,
  isFinal,
}) => {
  const teamIds = rankings
    .map((item) => toNumber(item.team_id))
    .filter(Number.isFinite);

  if (!teamIds.length) {
    await pool.query(
      "DELETE FROM tournament_team_results WHERE tournament_id = $1",
      [tournamentId],
    );
    return;
  }

  const placeholders = teamIds.map((_, index) => `$${index + 2}`).join(", ");
  await pool.query(
    `
    DELETE FROM tournament_team_results
    WHERE tournament_id = $1
      AND team_id NOT IN (${placeholders})
    `,
    [tournamentId, ...teamIds],
  );

  if (!rankings.length) return;

  const values = [];
  const rowPlaceholders = rankings.map((item, index) => {
    const placement = toNumber(item.placement);
    const placementEnd = toNumber(item.placement_end) ?? placement;
    const placementLabel = item.placement_label ?? null;
    const points = isFinal && placement ? (pointMap.get(placement) ?? 0) : 0;
    const elimRound = toNumber(item.elim_round);
    const elimLabel = item.elim_label ?? null;
    const offset = index * 10;

    values.push(
      item.team_id,
      placement,
      placementEnd,
      placementLabel,
      points,
      item.wins,
      item.losses,
      isFinal,
      elimRound,
      elimLabel,
    );

    return `($1, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`;
  });

  await pool.query(
    `
      INSERT INTO tournament_team_results (
        tournament_id,
        team_id,
        placement,
        placement_end,
        placement_label,
        points,
        wins,
        losses,
        is_final,
        elim_round,
        elim_label
      )
      VALUES ${rowPlaceholders.join(", ")}
      ON CONFLICT (tournament_id, team_id)
      DO UPDATE SET
        placement = EXCLUDED.placement,
        placement_end = EXCLUDED.placement_end,
        placement_label = EXCLUDED.placement_label,
        points = EXCLUDED.points,
        wins = EXCLUDED.wins,
        losses = EXCLUDED.losses,
        is_final = EXCLUDED.is_final,
        elim_round = EXCLUDED.elim_round,
        elim_label = EXCLUDED.elim_label,
        calculated_at = now()
    `,
    [tournamentId, ...values],
  );
};

const rebuildAchievements = async ({ tournamentId, rankings, isFinal }) => {
  await pool.query(
    "DELETE FROM tournament_team_achievements WHERE tournament_id = $1",
    [tournamentId],
  );

  if (!isFinal) return;

  const achievementRows = rankings
    .map((item) => {
      const payload = getAchievementPayload(item);
      if (!payload) return null;

      return {
        team_id: item.team_id,
        payload,
        meta: {
          placement_start: item.placement,
          placement_end: item.placement_end,
          placement_label: item.placement_label,
          wins: item.wins,
          losses: item.losses,
          played: item.played,
        },
      };
    })
    .filter(Boolean);

  if (!achievementRows.length) return;

  const values = [];
  const rowPlaceholders = achievementRows.map((row, index) => {
    const offset = index * 5;
    values.push(
      row.team_id,
      row.payload.code,
      row.payload.title,
      row.payload.description,
      JSON.stringify(row.meta),
    );
    return `($1, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}::jsonb)`;
  });

  await pool.query(
    `
      INSERT INTO tournament_team_achievements (
        tournament_id,
        team_id,
        code,
        title,
        description,
        meta
      )
      VALUES ${rowPlaceholders.join(", ")}
      ON CONFLICT (tournament_id, team_id, code) DO UPDATE
      SET title = EXCLUDED.title,
          description = EXCLUDED.description,
          meta = EXCLUDED.meta
    `,
    [tournamentId, ...values],
  );
};

const rebuildSeriesTotals = async (seriesId) => {
  if (!seriesId) return;

  await pool.query(
    `
    INSERT INTO series_team_totals (
      series_id,
      team_id,
      total_points,
      tournaments_played,
      updated_at
    )
    SELECT
      t.series_id,
      r.team_id,
      COALESCE(SUM(r.points), 0) AS total_points,
      COUNT(DISTINCT r.tournament_id) AS tournaments_played,
      now() AS updated_at
    FROM tournament_team_results r
    JOIN tournaments t ON t.id = r.tournament_id
    WHERE t.series_id = $1
    GROUP BY t.series_id, r.team_id
    ON CONFLICT (series_id, team_id)
    DO UPDATE SET
      total_points = EXCLUDED.total_points,
      tournaments_played = EXCLUDED.tournaments_played,
      updated_at = now()
    `,
    [seriesId],
  );

  await pool.query(
    `
    DELETE FROM series_team_totals st
    WHERE st.series_id = $1
      AND NOT EXISTS (
        SELECT 1
        FROM tournament_team_results r
        JOIN tournaments t ON t.id = r.tournament_id
        WHERE t.series_id = st.series_id
          AND r.team_id = st.team_id
      )
    `,
    [seriesId],
  );
};

export const recalculateTournamentResults = async (tournamentId) => {
  const normalizedTournamentId = toNumber(tournamentId);
  if (!normalizedTournamentId) {
    throw new Error("tournament_id khong hop le");
  }

  await ensureRankingTables();

  const { rows: tournamentRows } = await pool.query(
    `
    SELECT
      t.id,
      t.series_id,
      f.type AS format_type,
      COALESCE(f.has_losers_bracket, false) AS has_losers_bracket
    FROM tournaments t
    LEFT JOIN formats f ON f.id = t.format_id
    WHERE t.id = $1
    `,
    [normalizedTournamentId],
  );

  if (tournamentRows.length === 0) {
    throw new Error("Tournament not found");
  }

  const seriesId = toNumber(tournamentRows[0].series_id);
  const formatType = String(tournamentRows[0].format_type || "");
  const hasLosersBracket = Boolean(tournamentRows[0].has_losers_bracket);

  let rankingBracketId = await getTournamentRankingBracketId(
    normalizedTournamentId,
  );
  let bracketLabel = null;
  let bracketHasLosers = hasLosersBracket;

  if (rankingBracketId) {
    const { rows: bracketRows } = await pool.query(
      `
      SELECT
        b.id,
        b.name,
        b.stage,
        COALESCE(f.has_losers_bracket, false) AS has_losers_bracket
      FROM brackets b
      LEFT JOIN formats f ON f.id = b.format_id
      WHERE b.id = $1 AND b.tournament_id = $2
      LIMIT 1
      `,
      [rankingBracketId, normalizedTournamentId],
    );

    if (!bracketRows.length) {
      await setTournamentRankingBracketId({
        tournamentId: normalizedTournamentId,
        bracketId: null,
      });
      rankingBracketId = null;
    } else {
      const stage = String(bracketRows[0].stage ?? "").trim();
      const name = String(bracketRows[0].name ?? "").trim();
      // Ưu tiên name nếu stage chỉ là slug kiểu "playin"
      const stageNorm = normalizeBracketStageLabel(stage);
      const nameNorm = normalizeBracketStageLabel(name);
      bracketLabel =
        stageNorm === "Play-in" || stageNorm === "Play-off"
          ? stageNorm
          : nameNorm || stageNorm || name || stage || null;
      bracketHasLosers = Boolean(bracketRows[0].has_losers_bracket);
    }
  }

  await ensureDefaultSeriesPointRules(seriesId);

  const { rows: participantRows } = await pool.query(
    `
    SELECT DISTINCT team_id
    FROM tournament_teams
    WHERE tournament_id = $1
    ORDER BY team_id ASC
    `,
    [normalizedTournamentId],
  );

  const teamIds = participantRows
    .map((row) => toNumber(row.team_id))
    .filter(Number.isFinite);

  if (!teamIds.length) {
    await pool.query(
      "DELETE FROM tournament_team_results WHERE tournament_id = $1",
      [normalizedTournamentId],
    );
    await pool.query(
      "DELETE FROM tournament_team_achievements WHERE tournament_id = $1",
      [normalizedTournamentId],
    );
    await rebuildSeriesTotals(seriesId);

    return {
      tournament_id: normalizedTournamentId,
      series_id: seriesId,
      teams: 0,
      rankings: [],
      is_final: false,
    };
  }

  const matchesQuery = rankingBracketId
    ? {
        text: `
          SELECT id, round_number, match_no, team_a_id, team_b_id, winner_team_id, status, bracket_id
          FROM matches
          WHERE tournament_id = $1 AND bracket_id = $2
          ORDER BY round_number ASC, match_no ASC, id ASC
        `,
        params: [normalizedTournamentId, rankingBracketId],
      }
    : {
        text: `
          SELECT id, round_number, match_no, team_a_id, team_b_id, winner_team_id, status, bracket_id
          FROM matches
          WHERE tournament_id = $1
          ORDER BY round_number ASC, match_no ASC, id ASC
        `,
        params: [normalizedTournamentId],
      };

  const { rows: matchRows } = await pool.query(
    matchesQuery.text,
    matchesQuery.params,
  );

  if (!bracketLabel) {
    const bracketIdFromMatches = toNumber(matchRows[0]?.bracket_id);
    if (bracketIdFromMatches) {
      const { rows: labelRows } = await pool.query(
        `
        SELECT name, stage
        FROM brackets
        WHERE id = $1
        LIMIT 1
        `,
        [bracketIdFromMatches],
      );
      if (labelRows.length) {
        const stage = String(labelRows[0].stage ?? "").trim();
        const name = String(labelRows[0].name ?? "").trim();
        const stageNorm = normalizeBracketStageLabel(stage);
        const nameNorm = normalizeBracketStageLabel(name);
        bracketLabel =
          stageNorm === "Play-in" || stageNorm === "Play-off"
            ? stageNorm
            : nameNorm || stageNorm || name || stage || null;
      }
    }
  }

  const rankingResult =
    formatType === "elimination"
      ? buildEliminationRanking({
          teamIds,
          matches: matchRows,
          eliminationLossThreshold: resolveEliminationLossThreshold({
            hasLosersBracket: bracketHasLosers || hasLosersBracket,
            matches: matchRows,
          }),
          bracketLabel,
        })
      : formatType === "swiss"
        ? buildSwissRanking({
            teamIds,
            matches: matchRows,
          })
        : buildStandingsRanking({
            teamIds,
            matches: matchRows,
          });

  const { rankings, isFinal } = rankingResult;

  const pointMap = await getSeriesPointMap(seriesId);

  await upsertTournamentResults({
    tournamentId: normalizedTournamentId,
    rankings,
    pointMap,
    isFinal,
  });

  await rebuildAchievements({
    tournamentId: normalizedTournamentId,
    rankings,
    isFinal,
  });

  await rebuildSeriesTotals(seriesId);

  return {
    tournament_id: normalizedTournamentId,
    series_id: seriesId,
    format_type: formatType,
    has_losers_bracket: hasLosersBracket,
    ranking_bracket_id: rankingBracketId,
    teams: rankings.length,
    rankings,
    is_final: isFinal,
  };
};

const TOURNAMENT_RESULTS_SELECT = `
  SELECT
    r.tournament_id,
    r.team_id,
    r.placement,
    r.placement_end,
    r.placement_label,
    r.points,
    r.wins,
    r.losses,
    r.elim_round,
    r.elim_label,
    r.is_final,
    r.calculated_at,
    t.name,
    t.short_name,
    t.logo_url,
    t.team_color_hex
  FROM tournament_team_results r
  JOIN teams t ON t.id = r.team_id
  WHERE r.tournament_id = $1
  ORDER BY
    CASE WHEN r.placement IS NULL THEN 0 ELSE 1 END,
    r.placement ASC NULLS LAST,
    r.wins DESC,
    r.losses ASC,
    r.points DESC,
    t.id ASC
`;

/** Read cached BXH rows only — single SELECT, no schema migration. */
export const fetchTournamentResultsRows = async (tournamentId) => {
  const normalizedTournamentId = toNumber(tournamentId);
  if (!normalizedTournamentId) {
    throw new Error("tournament_id khong hop le");
  }

  const { rows } = await pool.query(TOURNAMENT_RESULTS_SELECT, [
    normalizedTournamentId,
  ]);
  return rows;
};

/** Lightweight read for GET /results — no ensureRankingTables(). */
export const readTournamentRankingBracketId = async (tournamentId) => {
  const normalizedTournamentId = toNumber(tournamentId);
  if (!normalizedTournamentId) return null;

  const { rows } = await pool.query(
    `
    SELECT bracket_id
    FROM tournament_ranking_brackets
    WHERE tournament_id = $1
    LIMIT 1
    `,
    [normalizedTournamentId],
  );

  return toNumber(rows[0]?.bracket_id);
};

/** Fire-and-forget recalc — dùng sau khi cập nhật score từ Score Control. */
export const scheduleTournamentResultsRecalculate = (tournamentId) => {
  const normalizedTournamentId = toNumber(tournamentId);
  if (!normalizedTournamentId) {
    return null;
  }

  return recalculateTournamentResults(normalizedTournamentId);
};

export {
  ensureRankingTables,
  ensureDefaultSeriesPointRules,
  getTournamentRankingBracketId,
  setTournamentRankingBracketId,
};
