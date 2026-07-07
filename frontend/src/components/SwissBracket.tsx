import { createContext, useContext, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  getMatchesByBracketId,
  type Match as ApiMatch,
} from "@/api/tournaments/index";
import { BracketTeamIcon } from "@/components/BracketTeamIcon";
import {
  bracketCardHoverClass,
  bracketRowHoverClass,
  type BracketHover,
  isHoverableTeamId,
} from "@/components/bracketHover";
import {
  BRACKET_INNER_CARD_CLASS,
  BRACKET_OUTCOME_DOT_CLASS,
  BRACKET_OUTCOME_DOT_COLORS,
  BRACKET_ROW_BASE_CLASS,
  BRACKET_SIDE_TEAM_ROW_CLASS,
  BRACKET_SIDE_TITLE_CLASS,
  BRACKET_STAGE_HEADER_CLASS,
  BRACKET_STAGE_WRAPPER_CLASS,
  buildSwissOutcomeDots,
  formatBracketSideScore,
  getBracketRowStateClass,
  getSwissColumnRoundTitle,
} from "@/components/bracketTheme";

type SwissBracketProps = {
  bracketId?: number | null;
  selectedTeamByMatchId?: Record<number, number>;
  pickStatusByMatchId?: Record<number, PickStatus>;
  onPickTeam?: (matchId: number, teamId: number) => void;
  disableMatchLink?: boolean;
  tournamentRegistered?: RegisteredTeam[];
};

type PickStatus = {
  isResolved?: boolean;
  isCorrect?: boolean | null;
  winnerTeamId?: number | null;
};

type PickVisualState = "selected" | "correct" | "wrong";

type RegisteredTeam = {
  id?: number | string;
  team_id?: number | string;
  name?: string;
  short_name?: string;
};

type BracketOutletContext = {
  tournament?: {
    registered?: RegisteredTeam[];
  };
};

type PickemContextValue = {
  selectedTeamByMatchId?: Record<number, number>;
  pickStatusByMatchId?: Record<number, PickStatus>;
  onPickTeam?: (matchId: number, teamId: number) => void;
  disableMatchLink?: boolean;
};

const PickemContext = createContext<PickemContextValue>({});

type DisplayMatch = {
  id: number;
  routeMatchId: number;
  round: number;
  matchNo: number;
  teamAId: number | null;
  teamBId: number | null;
  winnerTeamId: number | null;
  p1: string;
  p2: string;
  p1Logo?: string | null;
  p2Logo?: string | null;
  s1: number | null;
  s2: number | null;
  winner: string | null;
  status: string;
};

type StageMetrics = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TeamProgress = {
  id: number;
  name: string;
  logoUrl: string | null;
  wins: number;
  losses: number;
  state: "advanced" | "eliminated" | "pending";
};

const CARD_W = 268;
const ROW_H = 44;
const CARD_H = ROW_H * 2;
const STAGE_HEADER_H = 32;
const STAGE_HEADER_GAP = 12;
const MATCH_GAP = 10;
const STAGE_GAP = 24;
const COL_GAP = 42;
const SIDE_COL_GAP = 72;

const STAGE_W = CARD_W;

const SWISS_LABELS_8 = ["0-0", "1-0", "0-1", "1-1"];
const SWISS_LABELS_16 = [
  "0-0",
  "1-0",
  "0-1",
  "2-0",
  "0-2",
  "1-1",
  "2-1",
  "1-2",
  "2-2",
];

const SWISS_LAYOUT_8 = [["0-0"], ["1-0", "0-1"], ["1-1"]];
const SWISS_LAYOUT_16 = [
  ["0-0"],
  ["1-0", "0-1"],
  ["2-0", "1-1", "0-2"],
  ["2-1", "1-2"],
  ["2-2"],
];

const SWISS_RELATIONS_8 = [
  { from: ["0-0"], to: "1-0" },
  { from: ["0-0"], to: "0-1" },
  { from: ["1-0", "0-1"], to: "1-1" },
];

const SWISS_RELATIONS_16 = [
  { from: ["0-0"], to: "1-0" },
  { from: ["0-0"], to: "0-1" },
  { from: ["1-0"], to: "2-0" },
  { from: ["1-0"], to: "1-1" },
  { from: ["0-1"], to: "1-1" },
  { from: ["0-1"], to: "0-2" },
  { from: ["2-0", "1-1"], to: "2-1" },
  { from: ["0-2", "1-1"], to: "1-2" },
  { from: ["2-1", "1-2"], to: "2-2" },
];

const SWISS_EXPECTED_MATCHES_8: Record<string, number> = {
  "0-0": 4,
  "1-0": 2,
  "0-1": 2,
  "1-1": 2,
};

const SWISS_EXPECTED_MATCHES_16: Record<string, number> = {
  "0-0": 8,
  "1-0": 4,
  "0-1": 4,
  "2-0": 2,
  "0-2": 2,
  "1-1": 4,
  "2-1": 3,
  "1-2": 3,
  "2-2": 3,
};

const getSwissExpectedMatchesByLabel = (
  labels: string[],
): Record<string, number> | null => {
  if (labels.length === 4 && labels.every((l) => SWISS_LABELS_8.includes(l))) {
    return SWISS_EXPECTED_MATCHES_8;
  }
  if (
    labels.length === 9 &&
    labels.every((l) => SWISS_LABELS_16.includes(l))
  ) {
    return SWISS_EXPECTED_MATCHES_16;
  }
  return null;
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getTeamLabel = (
  teamId: number | null,
  teamNameById: Record<number, string>,
) => {
  if (!teamId) return "TBD";
  return teamNameById[teamId] || `${teamId}`;
};

const resolveMatchWinnerTeamId = (match: DisplayMatch) => {
  if (match.winnerTeamId !== null && match.winnerTeamId > 0)
    return match.winnerTeamId;
  if (match.teamAId !== null && match.teamBId === null) return match.teamAId;
  if (match.teamBId !== null && match.teamAId === null) return match.teamBId;
  if (match.s1 !== null && match.s2 !== null) {
    if (match.s1 > match.s2) return match.teamAId;
    if (match.s2 > match.s1) return match.teamBId;
  }
  return null;
};

const isResolvedSwissMatch = (match: DisplayMatch) => {
  if (match.teamAId === null && match.teamBId === null) return true;

  const winner = resolveMatchWinnerTeamId(match);
  if (winner !== null) return true;

  return (
    match.s1 !== null &&
    match.s2 !== null &&
    ["complete", "completed"].includes(
      String(match.status || "").toLowerCase(),
    )
  );
};

const toDisplayMatches = (
  apiMatches: ApiMatch[],
  teamNameById: Record<number, string>,
): DisplayMatch[] => {
  const sorted = [...apiMatches].sort((a, b) => {
    const rDiff = (a.round_number ?? 0) - (b.round_number ?? 0);
    if (rDiff !== 0) return rDiff;
    const mDiff = (a.match_no ?? 0) - (b.match_no ?? 0);
    if (mDiff !== 0) return mDiff;
    return (a.id ?? 0) - (b.id ?? 0);
  });

  return sorted.map((match) => {
    const teamAId = toNumber(match.team_a_id);
    const teamBId = toNumber(match.team_b_id);
    const scoreA = toNumber(match.score_a);
    const scoreB = toNumber(match.score_b);
    const rawWinnerTeamId = toNumber(match.winner_team_id);
    const winnerTeamId =
      rawWinnerTeamId !== null && rawWinnerTeamId > 0 ? rawWinnerTeamId : null;

    const p1 =
      (match as any)?.team_a?.name ?? getTeamLabel(teamAId, teamNameById);
    const p2 =
      (match as any)?.team_b?.name ?? getTeamLabel(teamBId, teamNameById);
    const p1Logo = (match as any)?.team_a?.logo_url ?? null;
    const p2Logo = (match as any)?.team_b?.logo_url ?? null;

    let winner: string | null = null;
    if (winnerTeamId) {
      if (toNumber((match as any)?.team_a?.id) === winnerTeamId) winner = p1;
      else if (toNumber((match as any)?.team_b?.id) === winnerTeamId)
        winner = p2;
      else winner = getTeamLabel(winnerTeamId, teamNameById);
    } else if (scoreA !== null && scoreB !== null) {
      if (scoreA > scoreB) winner = p1;
      if (scoreB > scoreA) winner = p2;
    }

    return {
      id: Number(match.id),
      routeMatchId: Number(match.id),
      round: Number(match.round_number ?? 0),
      matchNo: Number(match.match_no ?? 0),
      teamAId,
      teamBId,
      winnerTeamId,
      p1,
      p2,
      p1Logo,
      p2Logo,
      s1: scoreA,
      s2: scoreB,
      winner,
      status: String(match.status || "scheduled"),
    };
  });
};

const getLayoutForRounds = (
  rounds: number[],
  matchCountByRound: Map<number, number>,
) => {
  const roundCounts = rounds.map(
    (round) => matchCountByRound.get(round) ?? 0,
  );

  const isEightSwissPattern =
    roundCounts.length >= 4 &&
    roundCounts.slice(0, 4).join(",") === "4,2,2,2";
  const isSixteenSwissPattern =
    roundCounts.length >= 9 &&
    roundCounts.slice(0, 9).join(",") === "8,4,4,2,2,4,3,3,3";

  if (isEightSwissPattern) {
    const extraLabels = rounds.slice(4).map((round) => `R${round}`);

    return {
      labels: [...SWISS_LABELS_8, ...extraLabels],
      layout: [...SWISS_LAYOUT_8, ...extraLabels.map((label) => [label])],
      relations: SWISS_RELATIONS_8,
      advanceWins: 2,
      eliminateLosses: 2,
    };
  }

  if (isSixteenSwissPattern) {
    const extraLabels = rounds.slice(9).map((round) => `R${round}`);

    return {
      labels: [...SWISS_LABELS_16, ...extraLabels],
      layout: [...SWISS_LAYOUT_16, ...extraLabels.map((label) => [label])],
      relations: SWISS_RELATIONS_16,
      advanceWins: 3,
      eliminateLosses: 3,
    };
  }

  if (roundCounts.length === 4) {
    return {
      labels: SWISS_LABELS_8,
      layout: SWISS_LAYOUT_8,
      relations: SWISS_RELATIONS_8,
      advanceWins: 2,
      eliminateLosses: 2,
    };
  }

  if (roundCounts.length === 9) {
    return {
      labels: SWISS_LABELS_16,
      layout: SWISS_LAYOUT_16,
      relations: SWISS_RELATIONS_16,
      advanceWins: 3,
      eliminateLosses: 3,
    };
  }

  const labels = rounds.map((round) => `R${round}`);
  const layout = labels.map((label) => [label]);
  const fallback = Math.max(
    1,
    Math.ceil(Math.log2(Math.max(2, rounds.length))),
  );

  return {
    labels,
    layout,
    relations: [] as Array<{ from: string[]; to: string }>,
    advanceWins: fallback,
    eliminateLosses: fallback,
  };
};

const getStageHeight = (matchCount: number) =>
  matchCount * CARD_H + Math.max(0, matchCount - 1) * MATCH_GAP;

const getStageWrapperHeight = (matchCount: number) =>
  STAGE_HEADER_H + STAGE_HEADER_GAP + getStageHeight(Math.max(1, matchCount));

const getColumnHeight = (
  labels: string[],
  stageMatches: Map<string, DisplayMatch[]>,
  expectedMatchesByLabel: Record<string, number> | null,
) => {
  const stagesHeight = labels.reduce((sum, label) => {
    const matches = stageMatches.get(label) ?? [];
    const expected = expectedMatchesByLabel?.[label];
    const matchCount = expected ?? Math.max(1, matches.length);
    return sum + getStageWrapperHeight(matchCount);
  }, 0);

  return stagesHeight + Math.max(0, labels.length - 1) * STAGE_GAP;
};

const createTbdPlaceholder = (label: string, index: number): DisplayMatch => ({
  id: -(index + 1),
  routeMatchId: -1,
  round: 0,
  matchNo: index,
  teamAId: null,
  teamBId: null,
  winnerTeamId: null,
  p1: "TBD",
  p2: "TBD",
  p1Logo: null,
  p2Logo: null,
  s1: null,
  s2: null,
  winner: null,
  status: "scheduled",
});

const PlayerRow = ({
  teamId,
  logoUrl,
  name,
  score,
  otherScore,
  isWinner,
  isSelected,
  pickState,
  isHoveredTeam,
  hasHover,
  isTop,
  onPick,
  onHoverTeam,
  matchId,
  matchRound,
}: {
  teamId: number | null;
  logoUrl?: string | null;
  name: string;
  score: number | null;
  otherScore: number | null;
  isWinner: boolean;
  isSelected?: boolean;
  pickState?: PickVisualState | null;
  isHoveredTeam: boolean;
  hasHover: boolean;
  isTop?: boolean;
  onPick?: (teamId: number) => void;
  onHoverTeam: (hover: BracketHover | null) => void;
  matchId: number;
  matchRound: number;
}) => {
  const canPick =
    typeof onPick === "function" && Number.isFinite(Number(teamId));

  const stateToneCls = getBracketRowStateClass({
    isHoveredTeam,
    pickState,
    isWinner,
  });

  const hoverCls = bracketRowHoverClass(hasHover, isHoveredTeam);

  return (
    <div
      className={`${BRACKET_ROW_BASE_CLASS} ${canPick || isHoverableTeamId(teamId) ? "cursor-pointer" : "cursor-default"} ${stateToneCls} ${hoverCls}`}
      style={{ height: ROW_H }}
      onMouseEnter={() =>
        onHoverTeam(
          isHoverableTeamId(teamId)
            ? { teamId, matchId, round: matchRound }
            : null,
        )
      }
      onMouseLeave={() => onHoverTeam(null)}
      onClick={() => {
        if (!canPick || !teamId) return;
        onPick(teamId);
      }}
    >
      <span className="flex items-center gap-2 text-sm truncate flex-1">
        <BracketTeamIcon teamId={teamId} logoUrl={logoUrl} />
        {name}
      </span>
      <span className="text-sm font-bold ml-2 w-6 text-right tabular-nums">
        {formatBracketSideScore(score, otherScore)}
      </span>
    </div>
  );
};

const MatchCard = ({
  match,
  hoveredTeamId,
  onHoverTeam,
  isInJourney,
}: {
  match: DisplayMatch;
  hoveredTeamId: number | null;
  onHoverTeam: (hover: BracketHover | null) => void;
  isInJourney: boolean;
}) => {
  const {
    selectedTeamByMatchId,
    pickStatusByMatchId,
    onPickTeam,
    disableMatchLink,
  } = useContext(PickemContext);
  const hasHover = hoveredTeamId !== null;
  const cardHoverCls = bracketCardHoverClass(hasHover, isInJourney);
  const { game, slug } = useParams();
  const matchParam = match.routeMatchId ? String(match.routeMatchId) : null;
  const realMatchId = toNumber(match.routeMatchId);
  const selectedTeamId = realMatchId
    ? selectedTeamByMatchId?.[realMatchId]
    : null;
  const pickStatus = realMatchId
    ? pickStatusByMatchId?.[realMatchId]
    : undefined;
  const officialWinnerTeamId =
    pickStatus?.winnerTeamId ??
    match.winnerTeamId ??
    (match.s1 !== null && match.s2 !== null
      ? match.s1 > match.s2
        ? match.teamAId
        : match.s2 > match.s1
          ? match.teamBId
          : null
      : null);

  const resolvePickState = (teamId: number | null): PickVisualState | null => {
    if (!teamId || selectedTeamId !== teamId) return null;

    if (typeof pickStatus?.isCorrect === "boolean") {
      return pickStatus.isCorrect ? "correct" : "wrong";
    }

    if (pickStatus?.isResolved || officialWinnerTeamId) {
      if (!officialWinnerTeamId) return "selected";
      return officialWinnerTeamId === selectedTeamId ? "correct" : "wrong";
    }

    return "selected";
  };

  const handlePick = (teamId: number) => {
    if (!onPickTeam || !realMatchId) return;
    onPickTeam(realMatchId, teamId);
  };

  const canPick = Boolean(onPickTeam && realMatchId && realMatchId > 0);
  const isMatchCompleted = ["complete", "completed"].includes(
    String(match.status ?? "")
      .trim()
      .toLowerCase(),
  );

  const content = (
    <>
      <PlayerRow
        teamId={match.teamAId}
        logoUrl={match.p1Logo}
        name={match.p1}
        score={match.s1}
        otherScore={match.s2}
        isWinner={match.winner === match.p1}
        isSelected={selectedTeamId === match.teamAId}
        pickState={resolvePickState(match.teamAId)}
        isHoveredTeam={hoveredTeamId === match.teamAId}
        hasHover={hasHover}
        isTop
        onPick={canPick ? handlePick : undefined}
        onHoverTeam={onHoverTeam}
        matchId={match.id}
        matchRound={match.round}
      />
      <PlayerRow
        teamId={match.teamBId}
        logoUrl={match.p2Logo}
        name={match.p2}
        score={match.s2}
        otherScore={match.s1}
        isWinner={match.winner === match.p2}
        isSelected={selectedTeamId === match.teamBId}
        pickState={resolvePickState(match.teamBId)}
        isHoveredTeam={hoveredTeamId === match.teamBId}
        hasHover={hasHover}
        onPick={canPick ? handlePick : undefined}
        onHoverTeam={onHoverTeam}
        matchId={match.id}
        matchRound={match.round}
      />
    </>
  );

  if (disableMatchLink || canPick || !isMatchCompleted) {
    return (
      <div
        className={`${BRACKET_INNER_CARD_CLASS} flex flex-col divide-y divide-neutral-700 transition-all ${cardHoverCls}`}
        style={{ width: CARD_W, height: CARD_H }}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      to={`/tournament/${game ?? ""}/${slug ?? ""}/match/${matchParam}`}
      className={`${BRACKET_INNER_CARD_CLASS} flex flex-col divide-y divide-neutral-700 hover:outline hover:outline-1 hover:outline-white/20 transition-all ${cardHoverCls}`}
      style={{ width: CARD_W, height: CARD_H }}
    >
      {content}
    </Link>
  );
};

const TeamListCard = ({
  title,
  teams,
  slotCount,
  hoveredTeamId,
  onHoverTeam,
  teamMaxRoundById,
}: {
  title: string;
  teams: TeamProgress[];
  slotCount?: number;
  hoveredTeamId: number | null;
  onHoverTeam: (hover: BracketHover | null) => void;
  teamMaxRoundById: Map<number, number>;
}) => {
  const hasHover = hoveredTeamId !== null;
  const tbdCount = slotCount
    ? Math.max(0, slotCount - teams.length)
    : teams.length
      ? 0
      : 1;

  return (
    <div className="space-y-3">
      <h3 className={BRACKET_SIDE_TITLE_CLASS}>{title}</h3>
      <div className="space-y-2">
        {teams.map((team) => (
          <div
            key={`${title}-${team.id}`}
            className={`${BRACKET_SIDE_TEAM_ROW_CLASS} ${
              hasHover
                ? hoveredTeamId === team.id
                  ? "border-neutral-500 text-white"
                  : "opacity-55 text-neutral-400"
                : "text-neutral-200"
            }`}
            onMouseEnter={() =>
              onHoverTeam({
                teamId: team.id,
                matchId: team.id,
                round: teamMaxRoundById.get(team.id) ?? Number.MAX_SAFE_INTEGER,
              })
            }
            onMouseLeave={() => onHoverTeam(null)}
          >
            <BracketTeamIcon teamId={team.id} logoUrl={team.logoUrl} />
            <span className="truncate text-sm">{team.name}</span>
          </div>
        ))}
        {Array.from({ length: tbdCount }, (_, index) => (
          <div
            key={`${title}-tbd-${index}`}
            className={`${BRACKET_SIDE_TEAM_ROW_CLASS} text-neutral-500`}
          >
            <BracketTeamIcon teamId={null} />
            <span className="text-sm">TBD</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const SwissBracket = ({
  bracketId,
  selectedTeamByMatchId,
  pickStatusByMatchId,
  onPickTeam,
  disableMatchLink,
  tournamentRegistered,
}: SwissBracketProps) => {
  const outletContext = useOutletContext<BracketOutletContext | undefined>();
  const tournament = outletContext?.tournament;
  const [hover, setHover] = useState<BracketHover | null>(null);
  const hoveredTeamId = hover?.teamId ?? null;

  const registeredTeams = tournamentRegistered ?? tournament?.registered ?? [];

  const teamNameById = useMemo(() => {
    const map: Record<number, string> = {};
    registeredTeams.forEach((team) => {
      const teamId = toNumber(team.team_id ?? team.id);
      if (!teamId) return;
      map[teamId] = team.name || team.short_name || `Team #${teamId}`;
    });
    return map;
  }, [registeredTeams]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["swiss-bracket-matches", bracketId],
    enabled: Boolean(bracketId),
    queryFn: async () => {
      if (!bracketId) return [] as ApiMatch[];
      const response = await getMatchesByBracketId(bracketId);
      return response.data?.data ?? [];
    },
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const displayMatches = useMemo(
    () => toDisplayMatches(data ?? [], teamNameById),
    [data, teamNameById],
  );

  const matchCountByRound = useMemo(() => {
    const map = new Map<number, number>();

    displayMatches.forEach((match) => {
      if (match.round <= 0) return;
      map.set(match.round, (map.get(match.round) ?? 0) + 1);
    });

    return map;
  }, [displayMatches]);

  const rounds = useMemo(
    () => [...matchCountByRound.keys()].sort((a, b) => a - b),
    [matchCountByRound],
  );

  const { labels, layout, advanceWins, eliminateLosses } = useMemo(
    () => getLayoutForRounds(rounds, matchCountByRound),
    [rounds, matchCountByRound],
  );

  const expectedMatchesByLabel = useMemo(
    () => getSwissExpectedMatchesByLabel(labels),
    [labels],
  );

  const teamCount = useMemo(() => {
    const firstRound = rounds[0];
    const firstRoundMatches = firstRound
      ? (matchCountByRound.get(firstRound) ?? 0)
      : 0;
    if (firstRoundMatches > 0) return firstRoundMatches * 2;
    if (registeredTeams.length > 0) return registeredTeams.length;
    return expectedMatchesByLabel?.["0-0"]
      ? expectedMatchesByLabel["0-0"] * 2
      : 8;
  }, [
    rounds,
    matchCountByRound,
    registeredTeams.length,
    expectedMatchesByLabel,
  ]);

  const outcomeSlotCount = teamCount / 2;

  const stageMatches = useMemo(() => {
    const stageByRound = new Map<number, string>();
    rounds.forEach((round, index) => {
      stageByRound.set(round, labels[index] ?? `R${round}`);
    });

    const grouped = new Map<string, DisplayMatch[]>();
    displayMatches.forEach((match) => {
      const stage = stageByRound.get(match.round) ?? `R${match.round}`;
      if (!grouped.has(stage)) grouped.set(stage, []);
      grouped.get(stage)!.push(match);
    });

    grouped.forEach((matches) =>
      matches.sort((a, b) => (a.matchNo ?? 0) - (b.matchNo ?? 0)),
    );

    return grouped;
  }, [displayMatches, rounds, labels]);

  const layoutInfo = useMemo(() => {
    const stageMetrics = new Map<string, StageMetrics>();
    const columnHeights = layout.map((column) =>
      getColumnHeight(column, stageMatches, expectedMatchesByLabel),
    );

    const contentHeight = Math.max(0, ...columnHeights);
    const colStride = STAGE_W + COL_GAP;

    layout.forEach((column, colIndex) => {
      const x = colIndex * colStride;
      let cursorY = 0;

      column.forEach((label) => {
        const matches = stageMatches.get(label) ?? [];
        const expected = expectedMatchesByLabel?.[label];
        const matchCount = expected ?? Math.max(1, matches.length);
        const wrapperHeight = getStageWrapperHeight(matchCount);

        stageMetrics.set(label, {
          x,
          y: cursorY,
          width: STAGE_W,
          height: wrapperHeight,
        });

        cursorY += wrapperHeight + STAGE_GAP;
      });
    });

    const contentWidth =
      layout.length * STAGE_W +
      Math.max(0, layout.length - 1) * COL_GAP;

    return {
      stageMetrics,
      contentHeight,
      contentWidth,
    };
  }, [layout, stageMatches, expectedMatchesByLabel]);

  const teamStageLabels = useMemo(() => {
    if (hoveredTeamId === null) return null;

    const labels = new Set<string>();
    stageMatches.forEach((matches, label) => {
      const exists = matches.some(
        (match) =>
          match.teamAId === hoveredTeamId || match.teamBId === hoveredTeamId,
      );
      if (exists) labels.add(label);
    });

    return labels;
  }, [hoveredTeamId, stageMatches]);

  const teamMaxRoundById = useMemo(() => {
    const map = new Map<number, number>();
    displayMatches.forEach((match) => {
      const update = (teamId: number | null) => {
        if (!teamId) return;
        map.set(teamId, Math.max(map.get(teamId) ?? 0, match.round));
      };
      update(match.teamAId);
      update(match.teamBId);
    });
    return map;
  }, [displayMatches]);

  const teamProgress = useMemo(() => {
    const teamMap = new Map<number, TeamProgress>();

    const ensureTeam = (id: number, name: string, logoUrl: string | null) => {
      if (!teamMap.has(id)) {
        teamMap.set(id, {
          id,
          name,
          logoUrl,
          wins: 0,
          losses: 0,
          state: "pending",
        });
      }
      return teamMap.get(id)!;
    };

    displayMatches.forEach((match) => {
      if (match.teamAId)
        ensureTeam(match.teamAId, match.p1, match.p1Logo ?? null);
      if (match.teamBId)
        ensureTeam(match.teamBId, match.p2, match.p2Logo ?? null);
    });

    for (const match of displayMatches) {
      if (!isResolvedSwissMatch(match)) continue;

      const winnerTeamId = resolveMatchWinnerTeamId(match);
      if (!winnerTeamId) continue;

      const hasTeamA = match.teamAId !== null;
      const hasTeamB = match.teamBId !== null;

      if (hasTeamA && hasTeamB) {
        const loserTeamId =
          winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;

        const winner = teamMap.get(winnerTeamId);
        const loser = teamMap.get(loserTeamId);

        if (winner) winner.wins += 1;
        if (loser) loser.losses += 1;
      } else {
        const winner = teamMap.get(winnerTeamId);
        if (winner) winner.wins += 1;
      }
    }

    const teams = [...teamMap.values()];
    teams.forEach((team) => {
      if (team.wins >= advanceWins) team.state = "advanced";
      else if (team.losses >= eliminateLosses) team.state = "eliminated";
      else team.state = "pending";
    });

    teams.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      return a.name.localeCompare(b.name);
    });

    return {
      advanced: teams.filter((team) => team.state === "advanced"),
      eliminated: teams.filter((team) => team.state === "eliminated"),
      pending: teams.filter((team) => team.state === "pending"),
    };
  }, [displayMatches, advanceWins, eliminateLosses]);

  if (isLoading) {
    return <p className="text-smtext-[#EEEEEE]">Dang tai Swiss bracket...</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Khong tai duoc du lieu Swiss bracket.
      </p>
    );
  }

  if (!displayMatches.length) {
    return (
      <p className="text-smtext-[#EEEEEE]">
        Chua co match trong Swiss bracket nay.
      </p>
    );
  }

  return (
    <PickemContext.Provider
      value={{
        selectedTeamByMatchId,
        pickStatusByMatchId,
        onPickTeam,
        disableMatchLink,
      }}
    >
      <div className="w-full">
        <div className="flex items-start min-w-max">
          <div
            className="relative shrink-0"
            style={{
              width: layoutInfo.contentWidth,
              height: layoutInfo.contentHeight,
            }}
          >
            {layout.flat().map((label) => {
              const metrics = layoutInfo.stageMetrics.get(label);
              if (!metrics) return null;

              const colIndex = layout.findIndex((column) =>
                column.includes(label),
              );
              const matches = stageMatches.get(label) ?? [];
              const expectedCount =
                expectedMatchesByLabel?.[label] ??
                Math.max(1, matches.length);
              const stageTitle = getSwissColumnRoundTitle(colIndex);
              const outcomeDots = buildSwissOutcomeDots(
                label,
                advanceWins,
                eliminateLosses,
              );
              const renderMatches =
                matches.length >= expectedCount
                  ? matches
                  : [
                      ...matches,
                      ...Array.from(
                        { length: expectedCount - matches.length },
                        (_, index) => createTbdPlaceholder(label, index),
                      ),
                    ];

              return (
                <div
                  key={label}
                  className={`absolute flex flex-col overflow-hidden ${BRACKET_STAGE_WRAPPER_CLASS} transition-opacity duration-150 ${bracketCardHoverClass(hoveredTeamId !== null, !teamStageLabels || teamStageLabels.has(label))}`}
                  style={{
                    left: metrics.x,
                    top: metrics.y,
                    width: metrics.width,
                    height: metrics.height,
                  }}
                >
                  <div className={BRACKET_STAGE_HEADER_CLASS}>
                    <span>{stageTitle}</span>
                    <div className="flex items-center gap-1">
                      {outcomeDots.map((tone, index) => (
                        <span
                          key={`${label}-dot-${index}`}
                          className={`${BRACKET_OUTCOME_DOT_CLASS} ${BRACKET_OUTCOME_DOT_COLORS[tone]}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                    style={{ gap: MATCH_GAP, marginTop: STAGE_HEADER_GAP }}
                  >
                    {renderMatches.map((match, index) =>
                      match.routeMatchId > 0 ? (
                        <MatchCard
                          key={match.id}
                          match={match}
                          hoveredTeamId={hoveredTeamId}
                          onHoverTeam={setHover}
                          isInJourney
                        />
                      ) : (
                        <div
                          key={`${label}-placeholder-${index}`}
                          className="border border-neutral-600 bg-[#141414]"
                          style={{ width: CARD_W, height: CARD_H }}
                        />
                      ),
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="shrink-0 flex flex-col items-start justify-center"
            style={{
              width: STAGE_W,
              gap: STAGE_GAP,
              marginLeft: SIDE_COL_GAP,
            }}
          >
            <div className="w-full">
              <TeamListCard
                title="LỌT VÀO"
                teams={teamProgress.advanced}
                slotCount={outcomeSlotCount}
                hoveredTeamId={hoveredTeamId}
                onHoverTeam={setHover}
                teamMaxRoundById={teamMaxRoundById}
              />
            </div>
            <div className="w-full">
              <TeamListCard
                title="BỊ LOẠI"
                teams={teamProgress.eliminated}
                slotCount={outcomeSlotCount}
                hoveredTeamId={hoveredTeamId}
                onHoverTeam={setHover}
                teamMaxRoundById={teamMaxRoundById}
              />
            </div>
          </div>
        </div>
      </div>
    </PickemContext.Provider>
  );
};

export default SwissBracket;
