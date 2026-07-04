import { createContext, useContext, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  getMatchesByBracketId,
  type Match as ApiMatch,
} from "@/api/tournaments/index";
import { BracketTeamIcon } from "@/components/BracketTeamIcon";
import {
  BRACKET_CONN_ACTIVE_STROKE,
  BRACKET_CONN_BASE_STROKE,
  BRACKET_CONN_DIM_OPACITY,
  bracketCardHoverClass,
  bracketRowHoverClass,
  type BracketHover,
  buildMatchProgressOrder,
  getTeamJourneyMatchIds,
  isHoverableTeamId,
  isJourneyConnectorActive,
} from "@/components/bracketHover";
import {
  buildBracketColumnLayout,
  getSegmentRange,
  RoundConnector,
} from "@/components/bracketConnectors";
import {
  BRACKET_ROW_BASE_CLASS,
  getBracketMatchCardHeight,
  getMatchCardConnectorY,
  getBracketRowStateClass,
} from "@/components/bracketTheme";
import { BracketMatchCardShell } from "@/components/BracketMatchCardShell";

const CARD_W = 268;
const ROW_H = 44;
const ROW_BLOCK_H = ROW_H * 2;
const CARD_H = getBracketMatchCardHeight(ROW_H);
const CONN_W = 48;
const QF_GAP = 24;
const QF_PAIR_GAP = 56;
const HEADER_H = 0;

const qfPairH = 2 * CARD_H + QF_GAP;
const qfTops = [
  0,
  CARD_H + QF_GAP,
  qfPairH + QF_PAIR_GAP,
  qfPairH + QF_PAIR_GAP + CARD_H + QF_GAP,
];

const sfTops = [
  (qfTops[0] + qfTops[1] + CARD_H) / 2 - CARD_H / 2,
  (qfTops[2] + qfTops[3] + CARD_H) / 2 - CARD_H / 2,
];

const finalTop = (sfTops[0] + sfTops[1] + CARD_H) / 2 - CARD_H / 2;
const totalH = qfTops[3] + CARD_H;

type BracketOutletContext = {
  tournament?: {
    id?: number;
    registered?: RegisteredTeam[];
  };
};

type RegisteredTeam = {
  id?: number | string;
  team_id?: number | string;
  name?: string;
  short_name?: string;
};

type SingleElimBracketProps = {
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
  status: string;
  round: number;
  matchNo: number;
  nextMatchId: number | null;
  nextSlot: "A" | "B" | null;
  p1: string;
  p2: string;
  s1: number | null;
  s2: number | null;
  winner: string | null;
  p1Logo: string | null;
  p2Logo: string | null;
  teamAId: number | null;
  teamBId: number | null;
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toSlot = (value: unknown): "A" | "B" | null => {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "A" || normalized === "B") return normalized;
  return null;
};

const getTeamLabel = (
  teamId: number | null,
  teamNameById: Record<number, string>,
) => {
  if (!teamId) return "TBD";
  return teamNameById[teamId] || `${teamId}`;
};

const toDisplayMatches = (
  apiMatches: ApiMatch[],
  teamNameById: Record<number, string>,
): DisplayMatch[] => {
  if (!apiMatches.length) return [];

  const sorted = [...apiMatches].sort((a, b) => {
    const rDiff = (a.round_number ?? 0) - (b.round_number ?? 0);
    if (rDiff !== 0) return rDiff;
    const mDiff = (a.match_no ?? 0) - (b.match_no ?? 0);
    if (mDiff !== 0) return mDiff;
    return a.id - b.id;
  });

  return sorted
    .map((match) => {
      const matchId = toNumber(match.id);
      if (!matchId) return null;

      const teamAId = toNumber(match.team_a_id);
      const teamBId = toNumber(match.team_b_id);
      const scoreA = toNumber(match.score_a);
      const scoreB = toNumber(match.score_b);
      const winnerTeamId = toNumber(
        (match as ApiMatch & { winner_team_id?: unknown }).winner_team_id,
      );

      // Prefer names provided by embedded team objects from API, fallback to tournament registered map
      const p1Name =
        (match as any)?.team_a?.name ?? getTeamLabel(teamAId, teamNameById);
      const p2Name =
        (match as any)?.team_b?.name ?? getTeamLabel(teamBId, teamNameById);
      const p1Logo = (match as any)?.team_a?.logo_url ?? null;
      const p2Logo = (match as any)?.team_b?.logo_url ?? null;

      let winner: string | null = null;
      if (winnerTeamId) {
        // if winnerTeamId matches embedded team, use embedded name
        if ((match as any)?.team_a?.id === winnerTeamId)
          winner =
            (match as any)?.team_a?.name ?? getTeamLabel(teamAId, teamNameById);
        else if ((match as any)?.team_b?.id === winnerTeamId)
          winner =
            (match as any)?.team_b?.name ?? getTeamLabel(teamBId, teamNameById);
        else winner = getTeamLabel(winnerTeamId, teamNameById);
      } else if (scoreA !== null && scoreB !== null) {
        if (scoreA > scoreB && teamAId) winner = p1Name;
        if (scoreB > scoreA && teamBId) winner = p2Name;
      }

      return {
        id: matchId,
        routeMatchId: matchId,
        status: String(match.status ?? "").trim(),
        round: Number(match.round_number ?? 0),
        matchNo: Number(match.match_no ?? 0),
        nextMatchId: toNumber(match.next_match_id),
        nextSlot: toSlot(match.next_slot),
        teamAId,
        teamBId,
        p1: p1Name,
        p2: p2Name,
        p1Logo,
        p2Logo,
        s1: scoreA,
        s2: scoreB,
        winner,
      };
    })
    .filter((match): match is DisplayMatch => match !== null);
};

const getResolvedWinnerTeamId = (
  match: DisplayMatch,
  selectedTeamByMatchId?: Record<number, number>,
) => {
  const pickedTeamId = match.routeMatchId
    ? toNumber(selectedTeamByMatchId?.[match.routeMatchId])
    : null;

  if (
    pickedTeamId &&
    (pickedTeamId === match.teamAId || pickedTeamId === match.teamBId)
  ) {
    return pickedTeamId;
  }

  if (
    match.teamAId &&
    match.teamBId &&
    match.s1 !== null &&
    match.s2 !== null
  ) {
    if (match.s1 > match.s2) return match.teamAId;
    if (match.s2 > match.s1) return match.teamBId;
  }

  if (match.winner === match.p1 && match.teamAId) return match.teamAId;
  if (match.winner === match.p2 && match.teamBId) return match.teamBId;

  return null;
};

const projectSingleElimMatches = ({
  matches,
  selectedTeamByMatchId,
}: {
  matches: DisplayMatch[];
  selectedTeamByMatchId?: Record<number, number>;
}) => {
  const projectedById = new Map<number, DisplayMatch>();
  const teamInfoById = new Map<
    number,
    { name: string; logoUrl: string | null }
  >();

  matches.forEach((match) => {
    projectedById.set(match.id, { ...match });

    if (match.teamAId) {
      teamInfoById.set(match.teamAId, {
        name: match.p1,
        logoUrl: match.p1Logo ?? null,
      });
    }

    if (match.teamBId) {
      teamInfoById.set(match.teamBId, {
        name: match.p2,
        logoUrl: match.p2Logo ?? null,
      });
    }
  });

  const sortedByRound = [...projectedById.values()].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    if (a.matchNo !== b.matchNo) return a.matchNo - b.matchNo;
    return a.id - b.id;
  });

  const applyTeamToSlot = (
    target: DisplayMatch,
    slot: "A" | "B",
    teamId: number,
  ) => {
    const winnerInfo = teamInfoById.get(teamId);

    if (slot === "A") {
      target.teamAId = teamId;
      target.p1 = winnerInfo?.name ?? `Team #${teamId}`;
      target.p1Logo = winnerInfo?.logoUrl ?? null;
      return;
    }

    target.teamBId = teamId;
    target.p2 = winnerInfo?.name ?? `Team #${teamId}`;
    target.p2Logo = winnerInfo?.logoUrl ?? null;
  };

  sortedByRound.forEach((source) => {
    const winnerTeamId = getResolvedWinnerTeamId(source, selectedTeamByMatchId);
    if (!winnerTeamId || !source.nextMatchId) return;

    const target = projectedById.get(source.nextMatchId);
    if (!target) return;

    const slot = source.nextSlot ?? (source.matchNo % 2 === 1 ? "A" : "B");
    applyTeamToSlot(target, slot, winnerTeamId);
  });

  projectedById.forEach((match) => {
    const winnerTeamId = getResolvedWinnerTeamId(match, selectedTeamByMatchId);

    if (winnerTeamId !== null && winnerTeamId === match.teamAId) {
      match.winner = match.p1;
      return;
    }

    if (winnerTeamId !== null && winnerTeamId === match.teamBId) {
      match.winner = match.p2;
      return;
    }

    match.winner = null;
  });

  return [...projectedById.values()].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    if (a.matchNo !== b.matchNo) return a.matchNo - b.matchNo;
    return a.id - b.id;
  });
};

const getSingleElimRoundTitle = (
  roundIndex: number,
  totalRounds: number,
  roundValue: number,
) => {
  if (totalRounds <= 1) return "Chung kết";
  if (roundIndex === totalRounds) return "Chung kết";
  if (roundIndex === totalRounds - 1) return "Bán kết";
  if (roundIndex === totalRounds - 2) return "Tứ kết";
  return `Vòng ${roundValue}`;
};

interface PlayerRowProps {
  teamId?: number | null;
  logo_url?: string | null;
  name: string;
  score: number | null;
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
}

const PlayerRow = ({
  teamId,
  logo_url,
  name,
  score,
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
}: PlayerRowProps) => {
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
        <BracketTeamIcon teamId={teamId} logoUrl={logo_url} />
        {name}
      </span>
      <span className="text-sm font-bold ml-2 w-6 text-right tabular-nums">
        {score !== null ? score : "-"}
      </span>
    </div>
  );
};

const MatchCard = ({
  match,
  roundTitle,
  hoveredTeamId,
  onHoverTeam,
  isInJourney = true,
}: {
  match: DisplayMatch;
  roundTitle: string;
  hoveredTeamId: number | null;
  onHoverTeam: (hover: BracketHover | null) => void;
  isInJourney?: boolean;
}) => {
  const {
    selectedTeamByMatchId,
    pickStatusByMatchId,
    onPickTeam,
    disableMatchLink,
  } = useContext(PickemContext);
  const {
    p1,
    p2,
    p1Logo,
    p2Logo,
    s1,
    s2,
    winner,
    routeMatchId,
    teamAId,
    teamBId,
  } = match;
  const hasHover = hoveredTeamId !== null;
  const cardHoverCls = bracketCardHoverClass(hasHover, isInJourney);
  const { game, slug } = useParams();
  const matchParam = routeMatchId ? String(routeMatchId) : null;
  const realMatchId = toNumber(routeMatchId);
  const selectedTeamId = realMatchId
    ? selectedTeamByMatchId?.[realMatchId]
    : null;
  const pickStatus = realMatchId
    ? pickStatusByMatchId?.[realMatchId]
    : undefined;
  const officialWinnerTeamId =
    pickStatus?.winnerTeamId ??
    (s1 !== null && s2 !== null
      ? s1 > s2
        ? teamAId
        : s2 > s1
          ? teamBId
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

  const canPick = Boolean(onPickTeam && realMatchId);
  const isMatchCompleted = ["complete", "completed"].includes(
    String(match.status ?? "")
      .trim()
      .toLowerCase(),
  );

  const content = (
    <>
      <PlayerRow
        teamId={teamAId}
        logo_url={p1Logo}
        name={p1}
        score={s1}
        isWinner={winner === p1}
        isSelected={selectedTeamId === teamAId}
        pickState={resolvePickState(teamAId)}
        isHoveredTeam={hoveredTeamId === teamAId}
        hasHover={hasHover}
        isTop
        onPick={canPick ? handlePick : undefined}
        onHoverTeam={onHoverTeam}
        matchId={match.id}
        matchRound={match.round}
      />
      <PlayerRow
        teamId={teamBId}
        logo_url={p2Logo}
        name={p2}
        score={s2}
        isWinner={winner === p2}
        isSelected={selectedTeamId === teamBId}
        pickState={resolvePickState(teamBId)}
        isHoveredTeam={hoveredTeamId === teamBId}
        hasHover={hasHover}
        onPick={canPick ? handlePick : undefined}
        onHoverTeam={onHoverTeam}
        matchId={match.id}
        matchRound={match.round}
      />
    </>
  );

  if (!routeMatchId || disableMatchLink || canPick || !isMatchCompleted) {
    return (
      <BracketMatchCardShell
        title={roundTitle}
        className={`transition-opacity duration-150 ${cardHoverCls}`}
        style={{ width: CARD_W, height: CARD_H }}
      >
        {content}
      </BracketMatchCardShell>
    );
  }

  return (
    <Link
      to={`/tournament/${game ?? ""}/${slug ?? ""}/match/${matchParam}`}
      className={`block transition-all hover:outline hover:outline-1 hover:outline-white/20 ${cardHoverCls}`}
      style={{ width: CARD_W }}
    >
      <BracketMatchCardShell
        title={roundTitle}
        style={{ width: CARD_W, height: CARD_H }}
      >
        {content}
      </BracketMatchCardShell>
    </Link>
  );
};

const Connector = ({
  y1,
  y2,
  outY,
  hasHover,
  activeFrom,
  hasOutput,
}: {
  y1: number;
  y2: number;
  outY: number;
  hasHover: boolean;
  activeFrom: "top" | "bottom" | null;
  hasOutput: boolean;
}) => {
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const svgTop = Math.min(top, outY);
  const svgBottom = Math.max(bottom, outY);
  const svgH = svgBottom - svgTop + 2;

  const lY1 = y1 - svgTop + 1;
  const lY2 = y2 - svgTop + 1;
  const lOut = outY - svgTop + 1;
  const midX = CONN_W / 2;
  const baseOpacity = hasHover ? BRACKET_CONN_DIM_OPACITY : 1;
  const baseStroke = BRACKET_CONN_BASE_STROKE;
  const hiStroke = BRACKET_CONN_ACTIVE_STROKE;

  const fromY =
    activeFrom === "top" ? lY1 : activeFrom === "bottom" ? lY2 : null;

  return (
    <svg
      width={CONN_W}
      height={svgH}
      className="pointer-events-none absolute transition-opacity duration-150"
      style={{ top: svgTop + HEADER_H, left: 0 }}
    >
      <line
        x1={0}
        y1={lY1}
        x2={midX}
        y2={lY1}
        stroke={baseStroke}
        strokeWidth={2}
        opacity={baseOpacity}
      />
      <line
        x1={0}
        y1={lY2}
        x2={midX}
        y2={lY2}
        stroke={baseStroke}
        strokeWidth={2}
        opacity={baseOpacity}
      />
      <line
        x1={midX}
        y1={Math.min(lY1, lY2, lOut)}
        x2={midX}
        y2={Math.max(lY1, lY2, lOut)}
        stroke={baseStroke}
        strokeWidth={2}
        opacity={baseOpacity}
      />
      <line
        x1={midX}
        y1={lOut}
        x2={CONN_W}
        y2={lOut}
        stroke={baseStroke}
        strokeWidth={2}
        opacity={baseOpacity}
      />

      {fromY !== null ? (
        <>
          <line
            x1={0}
            y1={fromY}
            x2={midX}
            y2={fromY}
            stroke={hiStroke}
            strokeWidth={3}
          />
          {hasOutput ? (
            <>
              <line
                x1={midX}
                y1={fromY}
                x2={midX}
                y2={lOut}
                stroke={hiStroke}
                strokeWidth={3}
              />
              <line
                x1={midX}
                y1={lOut}
                x2={CONN_W}
                y2={lOut}
                stroke={hiStroke}
                strokeWidth={3}
              />
            </>
          ) : null}
        </>
      ) : null}
    </svg>
  );
};

const SingleElimBracket = ({
  bracketId,
  selectedTeamByMatchId,
  pickStatusByMatchId,
  onPickTeam,
  disableMatchLink,
  tournamentRegistered,
}: SingleElimBracketProps) => {
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
    queryKey: ["bracket-matches", bracketId],
    enabled: Boolean(bracketId),
    queryFn: async () => {
      if (!bracketId) {
        return {
          bracketId: null,
          matches: [] as ApiMatch[],
        };
      }

      const response = await getMatchesByBracketId(bracketId);
      return {
        bracketId,
        matches: response.data?.data ?? [],
      };
    },
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const singleElimMatches = useMemo(
    () => toDisplayMatches(data?.matches ?? [], teamNameById),
    [data?.matches, teamNameById],
  );

  const projectedMatches = useMemo(
    () =>
      projectSingleElimMatches({
        matches: singleElimMatches,
        selectedTeamByMatchId,
      }),
    [singleElimMatches, selectedTeamByMatchId],
  );

  const roundGroups = useMemo(
    () =>
      Array.from(
        projectedMatches.reduce((map, match) => {
          if (!map.has(match.round)) {
            map.set(match.round, [] as DisplayMatch[]);
          }

          map.get(match.round)!.push(match);
          return map;
        }, new Map<number, DisplayMatch[]>()),
      )
        .sort((a, b) => a[0] - b[0])
        .map(([round, matches]) => ({
          round,
          matches: [...matches].sort((a, b) => {
            if (a.matchNo !== b.matchNo) return a.matchNo - b.matchNo;
            return a.id - b.id;
          }),
        })),
    [projectedMatches],
  );

  const isClassicFourTeam =
    roundGroups.length === 2 &&
    roundGroups[0].matches.length === 2 &&
    roundGroups[1].matches.length === 1;

  const isClassicEightTeam =
    roundGroups.length === 3 &&
    roundGroups[0].matches.length === 4 &&
    roundGroups[1].matches.length === 2 &&
    roundGroups[2].matches.length === 1;

  const useClassicLayout = isClassicFourTeam || isClassicEightTeam;

  const roundMatchMap = useMemo(() => {
    const map = new Map<string, DisplayMatch>();
    projectedMatches.forEach((match) => {
      map.set(`${match.round}-${match.matchNo}`, match);
    });
    return map;
  }, [projectedMatches]);

  const journeySet = useMemo(
    () => getTeamJourneyMatchIds(projectedMatches, hoveredTeamId),
    [hoveredTeamId, projectedMatches],
  );

  const matchProgressOrder = useMemo(
    () => buildMatchProgressOrder(projectedMatches),
    [projectedMatches],
  );

  const genericLayout = useMemo(
    () =>
      buildBracketColumnLayout({
        columns: roundGroups.map((group) => group.matches),
        cardH: CARD_H,
        roundGap: QF_GAP,
        cardW: CARD_W,
        connW: CONN_W,
        headerH: HEADER_H,
      }),
    [roundGroups],
  );

  const getMatchOrPlaceholder = (
    round: number,
    matchNo: number,
  ): DisplayMatch => {
    const existing = roundMatchMap.get(`${round}-${matchNo}`);
    if (existing) return existing;

    return {
      id: -(round * 1000 + matchNo),
      routeMatchId: 0,
      round,
      matchNo,
      nextMatchId: null,
      nextSlot: null,
      teamAId: null,
      teamBId: null,
      p1: "TBD",
      p2: "TBD",
      p1Logo: null,
      p2Logo: null,
      s1: null,
      s2: null,
      winner: null,
      status: "scheduled",
    };
  };

  if (isLoading) {
    return <p className="text-sm text-[#EEEEEE]">Đang tải bracket...</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Không tải được dữ liệu bracket.
      </p>
    );
  }

  if (!projectedMatches.length) {
    return (
      <p className="text-sm text-[#EEEEEE]">Chưa có match trong bracket này.</p>
    );
  }

  if (!useClassicLayout) {
    if (!genericLayout) {
      return (
        <p className="text-sm text-[#EEEEEE]">Không thể dựng layout bracket.</p>
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
        <div
          className="relative"
          style={{
            width: genericLayout.totalW,
            height: genericLayout.totalH,
          }}
        >
          {genericLayout.columns.map((matches, colIndex) => {
            const colLeft = colIndex * (CARD_W + CONN_W);

            return (
              <div key={`round-col-${colIndex}`}>
                {matches.map((match, matchIndex) => (
                  <div
                    key={match.id}
                    className="absolute"
                    style={{
                      left: colLeft,
                      top: genericLayout.tops[colIndex][matchIndex],
                    }}
                  >
                    <MatchCard
                      match={match}
                      roundTitle={getSingleElimRoundTitle(
                        colIndex + 1,
                        roundGroups.length,
                        match.round,
                      )}
                      hoveredTeamId={hoveredTeamId}
                      onHoverTeam={setHover}
                      isInJourney={!journeySet || journeySet.has(match.id)}
                    />
                  </div>
                ))}

                {colIndex < genericLayout.columns.length - 1 ? (
                  <div
                    className="absolute"
                    style={{
                      left: colLeft + CARD_W,
                      width: CONN_W,
                      top: 0,
                      height: genericLayout.totalH,
                    }}
                  >
                    {genericLayout.columns[colIndex + 1].map((_, nextIndex) => {
                      const prevCount = genericLayout.columns[colIndex].length;
                      const currCount =
                        genericLayout.columns[colIndex + 1].length;
                      const { start, end } = getSegmentRange(
                        prevCount,
                        currCount,
                        nextIndex,
                      );

                      const inYs = genericLayout.tops[colIndex]
                        .slice(start, end + 1)
                        .map((top) => getMatchCardConnectorY(top, ROW_H));
                      const outY = getMatchCardConnectorY(
                        genericLayout.tops[colIndex + 1][nextIndex],
                        ROW_H,
                      );

                      return (
                        <RoundConnector
                          key={`conn-${colIndex}-${nextIndex}`}
                          connW={CONN_W}
                          headerH={HEADER_H}
                          inYs={inYs}
                          outY={outY}
                          hasHover={hoveredTeamId !== null}
                          activeInputIndexes={inYs
                            .map((_, localIndex) => {
                              const sourceMatch =
                                genericLayout.columns[colIndex][
                                  start + localIndex
                                ];
                              const destMatch =
                                genericLayout.columns[colIndex + 1][nextIndex];
                              return isJourneyConnectorActive(
                                journeySet,
                                sourceMatch,
                                destMatch,
                                matchProgressOrder,
                              )
                                ? localIndex
                                : -1;
                            })
                            .filter((index) => index >= 0)}
                          activeOutput={inYs.some((_, localIndex) => {
                            const sourceMatch =
                              genericLayout.columns[colIndex][
                                start + localIndex
                              ];
                            const destMatch =
                              genericLayout.columns[colIndex + 1][nextIndex];
                            return isJourneyConnectorActive(
                              journeySet,
                              sourceMatch,
                              destMatch,
                              matchProgressOrder,
                            );
                          })}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </PickemContext.Provider>
    );
  }

  const classicRounds = roundGroups.map((group) => group.round);
  const firstRound = classicRounds[0] ?? 1;
  const secondRound = classicRounds[1] ?? firstRound + 1;
  const thirdRound = classicRounds[2] ?? secondRound + 1;

  const classicConnectors = isClassicFourTeam
    ? [
        {
          fromTop: getMatchOrPlaceholder(firstRound, 1),
          fromBottom: getMatchOrPlaceholder(firstRound, 2),
          to: getMatchOrPlaceholder(secondRound, 1),
        },
      ]
    : [
        {
          fromTop: getMatchOrPlaceholder(firstRound, 1),
          fromBottom: getMatchOrPlaceholder(firstRound, 2),
          to: getMatchOrPlaceholder(secondRound, 1),
        },
        {
          fromTop: getMatchOrPlaceholder(firstRound, 3),
          fromBottom: getMatchOrPlaceholder(firstRound, 4),
          to: getMatchOrPlaceholder(secondRound, 2),
        },
        {
          fromTop: getMatchOrPlaceholder(secondRound, 1),
          fromBottom: getMatchOrPlaceholder(secondRound, 2),
          to: getMatchOrPlaceholder(thirdRound, 1),
        },
      ];

  const getConnState = (
    i: number,
  ): { activeFrom: "top" | "bottom" | null; hasOutput: boolean } => {
    if (!journeySet) {
      return { activeFrom: null, hasOutput: false };
    }

    const pair = classicConnectors[i];
    if (!pair) return { activeFrom: null, hasOutput: false };

    const topActive = isJourneyConnectorActive(
      journeySet,
      pair.fromTop,
      pair.to,
      matchProgressOrder,
    );
    const bottomActive = isJourneyConnectorActive(
      journeySet,
      pair.fromBottom,
      pair.to,
      matchProgressOrder,
    );
    const activeFrom = topActive
      ? "top"
      : bottomActive
        ? "bottom"
        : null;

    return {
      activeFrom,
      hasOutput: topActive || bottomActive,
    };
  };

  const col1 = CARD_W;
  const col2 = CARD_W + CONN_W;
  const col3 = 2 * CARD_W + CONN_W;
  const col4 = 2 * CARD_W + 2 * CONN_W;
  const totalW = isClassicFourTeam
    ? 2 * CARD_W + CONN_W
    : 3 * CARD_W + 2 * CONN_W;

  const sfTops4 = [0, CARD_H + QF_PAIR_GAP];
  const finalTop4 = (sfTops4[0] + sfTops4[1] + CARD_H) / 2 - CARD_H / 2;
  const totalH4 = sfTops4[1] + CARD_H;

  // Connector exits from midpoint between two player rows = center of card
  const qfMids = qfTops.map((t) => getMatchCardConnectorY(t, ROW_H));
  const sfMids = sfTops.map((t) => getMatchCardConnectorY(t, ROW_H));
  const finalMid = getMatchCardConnectorY(finalTop, ROW_H);
  const sfMids4 = sfTops4.map((t) => getMatchCardConnectorY(t, ROW_H));
  const finalMid4 = getMatchCardConnectorY(finalTop4, ROW_H);

  const roundTitleForMatch = (match: DisplayMatch) => {
    const roundIndex = classicRounds.indexOf(match.round) + 1;
    return getSingleElimRoundTitle(
      roundIndex > 0 ? roundIndex : 1,
      classicRounds.length,
      match.round,
    );
  };

  if (isClassicFourTeam) {
    return (
      <PickemContext.Provider
        value={{
          selectedTeamByMatchId,
          pickStatusByMatchId,
          onPickTeam,
          disableMatchLink,
        }}
      >
        <div
          className="relative"
          style={{ width: totalW, height: totalH4 }}
        >
          {[1, 2].map((_, i) => (
            <div
              key={`semi-${i + 1}`}
              className="absolute"
              style={{ left: 0, top: sfTops4[i] }}
            >
              <MatchCard
                match={getMatchOrPlaceholder(firstRound, i + 1)}
                roundTitle={roundTitleForMatch(
                  getMatchOrPlaceholder(firstRound, i + 1),
                )}
                hoveredTeamId={hoveredTeamId}
                onHoverTeam={setHover}
                isInJourney={
                  !journeySet ||
                  journeySet.has(getMatchOrPlaceholder(firstRound, i + 1).id)
                }
              />
            </div>
          ))}

          <div
            className="absolute"
            style={{
              left: col1,
              width: CONN_W,
              top: 0,
              height: totalH4,
            }}
          >
            <Connector
              y1={sfMids4[0]}
              y2={sfMids4[1]}
              outY={finalMid4}
              hasHover={hoveredTeamId !== null}
              activeFrom={getConnState(0).activeFrom}
              hasOutput={getConnState(0).hasOutput}
            />
          </div>

          <div
            className="absolute"
            style={{ left: col2, top: finalTop4 }}
          >
            <MatchCard
              match={getMatchOrPlaceholder(secondRound, 1)}
              roundTitle={roundTitleForMatch(
                getMatchOrPlaceholder(secondRound, 1),
              )}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet ||
                journeySet.has(getMatchOrPlaceholder(secondRound, 1).id)
              }
            />
          </div>
        </div>
      </PickemContext.Provider>
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
      <div
        className="relative"
        style={{ width: totalW, height: totalH }}
      >
        {[1, 2, 3, 4].map((_, i) => (
          <div
            key={`qf-${i + 1}`}
            className="absolute"
            style={{ left: 0, top: qfTops[i] }}
          >
            <MatchCard
              match={getMatchOrPlaceholder(firstRound, i + 1)}
              roundTitle={roundTitleForMatch(
                getMatchOrPlaceholder(firstRound, i + 1),
              )}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet ||
                journeySet.has(getMatchOrPlaceholder(firstRound, i + 1).id)
              }
            />
          </div>
        ))}

        <div
          className="absolute"
          style={{
            left: col1,
            width: CONN_W,
            top: 0,
            height: totalH,
          }}
        >
          <Connector
            y1={qfMids[0]}
            y2={qfMids[1]}
            outY={sfMids[0]}
            hasHover={hoveredTeamId !== null}
            activeFrom={getConnState(0).activeFrom}
            hasOutput={getConnState(0).hasOutput}
          />
          <Connector
            y1={qfMids[2]}
            y2={qfMids[3]}
            outY={sfMids[1]}
            hasHover={hoveredTeamId !== null}
            activeFrom={getConnState(1).activeFrom}
            hasOutput={getConnState(1).hasOutput}
          />
        </div>

        {[5, 6].map((_, i) => (
          <div
            key={`sf-${i + 1}`}
            className="absolute"
            style={{ left: col2, top: sfTops[i] }}
          >
            <MatchCard
              match={getMatchOrPlaceholder(secondRound, i + 1)}
              roundTitle={roundTitleForMatch(
                getMatchOrPlaceholder(secondRound, i + 1),
              )}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet ||
                journeySet.has(getMatchOrPlaceholder(secondRound, i + 1).id)
              }
            />
          </div>
        ))}

        <div
          className="absolute"
          style={{
            left: col3,
            width: CONN_W,
            top: 0,
            height: totalH,
          }}
        >
          <Connector
            y1={sfMids[0]}
            y2={sfMids[1]}
            outY={finalMid}
            hasHover={hoveredTeamId !== null}
            activeFrom={getConnState(2).activeFrom}
            hasOutput={getConnState(2).hasOutput}
          />
        </div>

        <div className="absolute" style={{ left: col4, top: finalTop }}>
          <MatchCard
            match={getMatchOrPlaceholder(thirdRound, 1)}
            roundTitle={roundTitleForMatch(
              getMatchOrPlaceholder(thirdRound, 1),
            )}
            hoveredTeamId={hoveredTeamId}
            onHoverTeam={setHover}
            isInJourney={
              !journeySet ||
              journeySet.has(getMatchOrPlaceholder(thirdRound, 1).id)
            }
          />
        </div>
      </div>
    </PickemContext.Provider>
  );
};

export default SingleElimBracket;
