import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  getMatchesByBracketId,
  type Match as ApiMatch,
} from "@/api/tournaments/index";
import { TOURNAMENT_LOGO } from "@/data/tournament";
import { getDoubleElimRoundTitle } from "@/components/double-elim/roundLabels";

type DoubleElimBracketProps = {
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
  logo_url?: string;
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
  routeMatchId?: number;
  status?: string;
  round: number;
  matchNo: number;
  nextMatchId: number | null;
  nextSlot: "A" | "B" | null;
  teamAId: number | null;
  teamBId: number | null;
  p1: string;
  p2: string;
  p1Logo?: string | null;
  p2Logo?: string | null;
  s1: number | null;
  s2: number | null;
  winner: string | null;
};

const CARD_W = 240;
const ROW_H = 36;
const CARD_H = ROW_H * 2;
const CONN_W = 48;
const ROUND_GAP = 24;
const HEADER_H = 28;

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

const toSlot = (value: unknown): "A" | "B" | null => {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "A" || normalized === "B") return normalized;
  return null;
};

const getResolvedWinnerTeamId = (
  match: DisplayMatch,
  selectedTeamByMatchId?: Record<number, number>,
) => {
  const pickedTeamId = match.routeMatchId
    ? toNumber(selectedTeamByMatchId?.[match.routeMatchId])
    : null;

  if (pickedTeamId) {
    const canUsePickedTeam =
      pickedTeamId === match.teamAId ||
      pickedTeamId === match.teamBId ||
      !match.teamAId ||
      !match.teamBId;

    if (canUsePickedTeam) return pickedTeamId;
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

const getResolvedLoserTeamId = (
  match: DisplayMatch,
  winnerTeamId: number | null,
) => {
  if (!winnerTeamId || !match.teamAId || !match.teamBId) return null;
  if (winnerTeamId === match.teamAId) return match.teamBId;
  if (winnerTeamId === match.teamBId) return match.teamAId;
  return null;
};

const getRoundShape = (matches: DisplayMatch[]) => {
  const countByRound = new Map<number, number>();

  matches.forEach((match) => {
    countByRound.set(match.round, (countByRound.get(match.round) ?? 0) + 1);
  });

  return [...countByRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, count]) => `${round}:${count}`)
    .join(",");
};

const getCompactSingleLoserTarget = ({
  match,
  winnerRounds,
  loserMainRounds,
  roundShape,
}: {
  match: DisplayMatch;
  winnerRounds: number;
  loserMainRounds: number;
  roundShape: string;
}) => {
  const currentRound = match.round;
  const currentMatchNo = match.matchNo;

  if (!currentRound || !currentMatchNo) return null;

  const isCompactSixSingleBracket =
    roundShape === "1:2,2:2,3:1,4:2,5:1,6:1,7:1";

  if (isCompactSixSingleBracket) {
    const compactSixLoserMap: Record<
      string,
      { round: number; matchNo: number; slot: "A" | "B" }
    > = {
      "1-1": { round: 4, matchNo: 2, slot: "A" },
      "1-2": { round: 4, matchNo: 1, slot: "A" },
      "2-1": { round: 4, matchNo: 1, slot: "B" },
      "2-2": { round: 4, matchNo: 2, slot: "B" },
      "3-1": { round: 6, matchNo: 1, slot: "A" },
    };

    return compactSixLoserMap[`${currentRound}-${currentMatchNo}`] ?? null;
  }

  if (currentRound > winnerRounds) return null;

  let targetLoserRoundIndex = 1;
  let targetMatchNo = 1;
  let preferredSlot: "A" | "B" = "A";

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

  return {
    round: winnerRounds + targetLoserRoundIndex,
    matchNo: targetMatchNo,
    slot: preferredSlot,
  };
};

const projectDoubleElimMatches = ({
  matches,
  selectedTeamByMatchId,
}: {
  matches: DisplayMatch[];
  selectedTeamByMatchId?: Record<number, number>;
}) => {
  if (!selectedTeamByMatchId || !Object.keys(selectedTeamByMatchId).length) {
    return matches;
  }

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

  const byRoundMatchNo = new Map<string, DisplayMatch>();
  projectedById.forEach((match) => {
    byRoundMatchNo.set(`${match.round}-${match.matchNo}`, match);
  });

  const projectedMatches = [...projectedById.values()].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    if (a.matchNo !== b.matchNo) return a.matchNo - b.matchNo;
    return a.id - b.id;
  });

  const roundOneMatchCount = projectedMatches.filter(
    (match) => match.round === 1,
  ).length;
  const winnerRounds =
    roundOneMatchCount > 0 ? Math.max(1, Math.log2(roundOneMatchCount * 2)) : 1;
  const loserMainRounds = Math.max(1, 2 * (winnerRounds - 1));
  const roundShape = getRoundShape(projectedMatches);

  const applyTeamToSlot = (
    target: DisplayMatch,
    slot: "A" | "B",
    teamId: number,
  ) => {
    const winnerInfo = teamInfoById.get(teamId);

    if (slot === "A") {
      if (target.teamAId && target.teamAId !== teamId) return;
      target.teamAId = teamId;
      target.p1 = winnerInfo?.name ?? `Team #${teamId}`;
      target.p1Logo = winnerInfo?.logoUrl ?? null;
      return;
    }

    if (target.teamBId && target.teamBId !== teamId) return;
    target.teamBId = teamId;
    target.p2 = winnerInfo?.name ?? `Team #${teamId}`;
    target.p2Logo = winnerInfo?.logoUrl ?? null;
  };

  projectedMatches.forEach((source) => {
    const winnerTeamId = getResolvedWinnerTeamId(source, selectedTeamByMatchId);
    if (!winnerTeamId) return;

    const winnerInfo = teamInfoById.get(winnerTeamId);
    if (!winnerInfo) {
      teamInfoById.set(winnerTeamId, {
        name: `Team #${winnerTeamId}`,
        logoUrl: null,
      });
    }

    if (source.nextMatchId && source.nextSlot) {
      const winnerTarget = projectedById.get(source.nextMatchId);
      if (winnerTarget) {
        applyTeamToSlot(winnerTarget, source.nextSlot, winnerTeamId);
      }
    }

    const loserTeamId = getResolvedLoserTeamId(source, winnerTeamId);
    if (!loserTeamId) return;

    const loserTarget = getCompactSingleLoserTarget({
      match: source,
      winnerRounds,
      loserMainRounds,
      roundShape,
    });

    if (!loserTarget) return;

    const targetMatch = byRoundMatchNo.get(
      `${loserTarget.round}-${loserTarget.matchNo}`,
    );

    if (!targetMatch) return;

    applyTeamToSlot(targetMatch, loserTarget.slot, loserTeamId);
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

const PlayerRow = ({
  teamId,
  logoUrl,
  name,
  score,
  isWinner,
  isSelected,
  pickState,
  isHoveredPlayer,
  hasHover,
  isTop,
  onPick,
  onHover,
}: {
  teamId?: number | null;
  logoUrl?: string | null;
  name: string;
  score: number | null;
  isWinner: boolean;
  isSelected?: boolean;
  pickState?: PickVisualState | null;
  isHoveredPlayer: boolean;
  hasHover: boolean;
  isTop?: boolean;
  onPick?: (teamId: number) => void;
  onHover: (player: string | null) => void;
}) => {
  const canPick =
    typeof onPick === "function" && Number.isFinite(Number(teamId));

  const stateToneCls =
    pickState === "correct"
      ? "bg-emerald-500/20 text-emerald-100 font-semibold"
      : pickState === "wrong"
        ? "bg-rose-500/20 text-rose-100 font-semibold"
        : pickState === "selected"
          ? "bg-amber-500/20 text-amber-100 font-semibold"
          : isWinner
            ? "bg-primary/20 font-semibold"
            : "bg-card";

  const hoverCls = hasHover
    ? isHoveredPlayer
      ? "brightness-110"
      : "text-muted-foreground"
    : "";

  return (
    <div
      className={`flex items-center justify-between px-3 transition-colors duration-150 ${canPick ? "cursor-pointer" : "cursor-default"} ${stateToneCls} ${hoverCls} ${isTop ? "border-b border-border/40" : ""}`}
      style={{ height: ROW_H }}
      onMouseEnter={() => onHover(name)}
      onMouseLeave={() => onHover(null)}
      onClick={() => {
        if (!canPick || !teamId) return;
        onPick(teamId);
      }}
    >
      <span className="flex items-center gap-2 text-sm truncate flex-1">
        <img
          src={logoUrl || TOURNAMENT_LOGO}
          alt=""
          className="w-6 h-6 rounded-sm"
        />
        {name}
      </span>
      <span className="text-sm font-bold ml-2 w-6 text-right">
        {score !== null ? score : "-"}
      </span>
    </div>
  );
};

const MatchCard = ({
  match,
  hoveredPlayer,
  onHover,
  isInJourney,
}: {
  match: DisplayMatch;
  hoveredPlayer: string | null;
  onHover: (player: string | null) => void;
  isInJourney: boolean;
}) => {
  const {
    selectedTeamByMatchId,
    pickStatusByMatchId,
    onPickTeam,
    disableMatchLink,
  } = useContext(PickemContext);
  const hasHover = hoveredPlayer !== null;
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

  const canPick = Boolean(onPickTeam && realMatchId);
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
        isWinner={match.winner === match.p1}
        isSelected={selectedTeamId === match.teamAId}
        pickState={resolvePickState(match.teamAId)}
        isHoveredPlayer={hoveredPlayer === match.p1}
        hasHover={hasHover}
        isTop
        onPick={canPick ? handlePick : undefined}
        onHover={onHover}
      />
      <PlayerRow
        teamId={match.teamBId}
        logoUrl={match.p2Logo}
        name={match.p2}
        score={match.s2}
        isWinner={match.winner === match.p2}
        isSelected={selectedTeamId === match.teamBId}
        pickState={resolvePickState(match.teamBId)}
        isHoveredPlayer={hoveredPlayer === match.p2}
        hasHover={hasHover}
        onPick={canPick ? handlePick : undefined}
        onHover={onHover}
      />
    </>
  );

  const faded = hasHover && !isInJourney;

  if (!match.routeMatchId || disableMatchLink || canPick || !isMatchCompleted) {
    return (
      <div
        className={`block neo-box-sm overflow-hidden transition-opacity duration-150 ${faded ? "opacity-40" : "opacity-100"}`}
        style={{ width: CARD_W }}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      to={`/tournament/${game ?? ""}/${slug ?? ""}/match/${matchParam}`}
      className={`block neo-box-sm overflow-hidden hover:ring-1 hover:ring-primary/50 transition-all ${faded ? "opacity-40" : "opacity-100"}`}
      style={{ width: CARD_W }}
    >
      {content}
    </Link>
  );
};

const RoundConnector = ({
  inYs,
  outY,
  hasHover,
  activeInputIndexes,
  activeOutput,
}: {
  inYs: number[];
  outY: number;
  hasHover: boolean;
  activeInputIndexes: number[];
  activeOutput: boolean;
}) => {
  if (!inYs.length) return null;

  const top = Math.min(...inYs, outY);
  const bottom = Math.max(...inYs, outY);
  const svgTop = top;
  const svgHeight = bottom - top + 2;
  const midX = CONN_W / 2;
  const baseStroke = "white";
  const hiStroke = "hsl(var(--primary))";
  const baseOpacity = hasHover ? 0.25 : 1;

  const normalizedInYs = inYs.map((y) => y - svgTop + 1);
  const normalizedOutY = outY - svgTop + 1;

  const activeYs = activeInputIndexes
    .filter((index) => index >= 0 && index < normalizedInYs.length)
    .map((index) => normalizedInYs[index]);

  return (
    <svg
      width={CONN_W}
      height={svgHeight}
      className="absolute"
      style={{ top: svgTop + HEADER_H, left: 0 }}
    >
      {normalizedInYs.map((y, index) => (
        <line
          key={`base-in-${index}`}
          x1={0}
          y1={y}
          x2={midX}
          y2={y}
          stroke={baseStroke}
          strokeWidth={2}
          opacity={baseOpacity}
        />
      ))}

      <line
        x1={midX}
        y1={Math.min(...normalizedInYs)}
        x2={midX}
        y2={Math.max(...normalizedInYs)}
        stroke={baseStroke}
        strokeWidth={2}
        opacity={baseOpacity}
      />

      <line
        x1={midX}
        y1={normalizedOutY}
        x2={CONN_W}
        y2={normalizedOutY}
        stroke={baseStroke}
        strokeWidth={2}
        opacity={baseOpacity}
      />

      {activeOutput && activeYs.length ? (
        <>
          {activeYs.map((y, idx) => (
            <line
              key={`active-in-${idx}`}
              x1={0}
              y1={y}
              x2={midX}
              y2={y}
              stroke={hiStroke}
              strokeWidth={3}
            />
          ))}
          <line
            x1={midX}
            y1={Math.min(normalizedOutY, ...activeYs)}
            x2={midX}
            y2={Math.max(normalizedOutY, ...activeYs)}
            stroke={hiStroke}
            strokeWidth={3}
          />
          <line
            x1={midX}
            y1={normalizedOutY}
            x2={CONN_W}
            y2={normalizedOutY}
            stroke={hiStroke}
            strokeWidth={3}
          />
        </>
      ) : null}
    </svg>
  );
};

const ElbowConnector = ({
  fromX,
  fromY,
  toX,
  toY,
  hasHover,
  active,
}: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  hasHover: boolean;
  active: boolean;
}) => {
  const left = Math.min(fromX, toX);
  const right = Math.max(fromX, toX);
  const top = Math.min(fromY, toY);
  const bottom = Math.max(fromY, toY);

  const width = right - left + 2;
  const height = bottom - top + 2;

  const sX = fromX - left + 1;
  const sY = fromY - top + 1;
  const eX = toX - left + 1;
  const eY = toY - top + 1;
  const midX = (sX + eX) / 2;

  const path = `M ${sX} ${sY} H ${midX} V ${eY} H ${eX}`;

  return (
    <svg
      width={width}
      height={height}
      className="absolute"
      style={{ left, top }}
    >
      <path
        d={path}
        fill="none"
        stroke="white"
        strokeWidth={2}
        opacity={hasHover ? 0.25 : 1}
      />
      {active ? (
        <path
          d={path}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={3}
        />
      ) : null}
    </svg>
  );
};

const MergeConnector = ({
  fromX,
  fromYs,
  toX,
  toY,
  hasHover,
  activeFrom,
  activeOutput,
}: {
  fromX: number;
  fromYs: number[];
  toX: number;
  toY: number;
  hasHover: boolean;
  activeFrom: boolean[];
  activeOutput: boolean;
}) => {
  if (!fromYs.length) return null;

  const allYs = [...fromYs, toY];
  const left = Math.min(fromX, toX);
  const right = Math.max(fromX, toX);
  const top = Math.min(...allYs);
  const bottom = Math.max(...allYs);

  const width = right - left + 2;
  const height = bottom - top + 2;

  const sX = fromX - left + 1;
  const eX = toX - left + 1;
  const midX = (sX + eX) / 2;
  const normFromYs = fromYs.map((y) => y - top + 1);
  const normToY = toY - top + 1;

  const activeYs = normFromYs.filter((_, index) => activeFrom[index]);

  return (
    <svg
      width={width}
      height={height}
      className="absolute"
      style={{ left, top }}
    >
      {normFromYs.map((y, index) => (
        <line
          key={`base-merge-in-${index}`}
          x1={sX}
          y1={y}
          x2={midX}
          y2={y}
          stroke="white"
          strokeWidth={2}
          opacity={hasHover ? 0.25 : 1}
        />
      ))}

      <line
        x1={midX}
        y1={Math.min(...normFromYs)}
        x2={midX}
        y2={Math.max(...normFromYs)}
        stroke="white"
        strokeWidth={2}
        opacity={hasHover ? 0.25 : 1}
      />
      <line
        x1={midX}
        y1={normToY}
        x2={eX}
        y2={normToY}
        stroke="white"
        strokeWidth={2}
        opacity={hasHover ? 0.25 : 1}
      />

      {activeOutput && activeYs.length ? (
        <>
          {activeYs.map((y, idx) => (
            <line
              key={`active-merge-in-${idx}`}
              x1={sX}
              y1={y}
              x2={midX}
              y2={y}
              stroke="hsl(var(--primary))"
              strokeWidth={3}
            />
          ))}
          <line
            x1={midX}
            y1={Math.min(normToY, ...activeYs)}
            x2={midX}
            y2={Math.max(normToY, ...activeYs)}
            stroke="hsl(var(--primary))"
            strokeWidth={3}
          />
          <line
            x1={midX}
            y1={normToY}
            x2={eX}
            y2={normToY}
            stroke="hsl(var(--primary))"
            strokeWidth={3}
          />
        </>
      ) : null}
    </svg>
  );
};

const getSegmentRange = (
  prevCount: number,
  currCount: number,
  currIndex: number,
) => {
  const start = Math.floor((currIndex * prevCount) / currCount);
  const end = Math.max(
    start,
    Math.floor(((currIndex + 1) * prevCount) / currCount) - 1,
  );
  return { start, end };
};

const DoubleElimBracket = ({
  bracketId,
  selectedTeamByMatchId,
  pickStatusByMatchId,
  onPickTeam,
  disableMatchLink,
  tournamentRegistered,
}: DoubleElimBracketProps) => {
  const outletContext = useOutletContext<BracketOutletContext | undefined>();
  const tournament = outletContext?.tournament;
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null);

  const withPickemContext = (content: ReactNode) => (
    <PickemContext.Provider
      value={{
        selectedTeamByMatchId,
        pickStatusByMatchId,
        onPickTeam,
        disableMatchLink,
      }}
    >
      {content}
    </PickemContext.Provider>
  );

  const registeredTeams = tournamentRegistered ?? tournament?.registered ?? [];
  const actualTeamCount = registeredTeams.length;
  const teamCount = actualTeamCount;

  const teamNameById = useMemo(() => {
    const map: Record<number, string> = {};
    registeredTeams.forEach((team) => {
      const teamId = toNumber(team.team_id ?? team.id);
      if (!teamId) return;
      map[teamId] = team.name || team.short_name || `${teamId}`;
    });
    return map;
  }, [registeredTeams]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["double-bracket-matches", bracketId, actualTeamCount],
    enabled: Boolean(bracketId),
    queryFn: async () => {
      if (!bracketId) return [] as ApiMatch[];
      const response = await getMatchesByBracketId(bracketId);
      return response.data?.data ?? [];
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const baseDisplayMatches = useMemo<DisplayMatch[]>(() => {
    const matches = data ?? [];

    return [...matches]
      .sort((a, b) => {
        const rd = (a.round_number ?? 0) - (b.round_number ?? 0);
        if (rd !== 0) return rd;
        const md = (a.match_no ?? 0) - (b.match_no ?? 0);
        if (md !== 0) return md;
        return a.id - b.id;
      })
      .map((match) => {
        const teamAId = toNumber(match.team_a_id);
        const teamBId = toNumber(match.team_b_id);
        const scoreA = toNumber(match.score_a);
        const scoreB = toNumber(match.score_b);
        const rawWinnerTeamId = toNumber(match.winner_team_id);
        const winnerTeamId =
          rawWinnerTeamId !== null && rawWinnerTeamId > 0
            ? rawWinnerTeamId
            : null;

        const p1 = match.team_a?.name ?? getTeamLabel(teamAId, teamNameById);
        const p2 = match.team_b?.name ?? getTeamLabel(teamBId, teamNameById);

        let winner: string | null = null;
        if (winnerTeamId) {
          if (toNumber(match.team_a?.id) === winnerTeamId) winner = p1;
          else if (toNumber(match.team_b?.id) === winnerTeamId) winner = p2;
          else winner = getTeamLabel(winnerTeamId, teamNameById);
        } else if (scoreA !== null && scoreB !== null) {
          if (scoreA > scoreB) winner = p1;
          if (scoreB > scoreA) winner = p2;
        }

        return {
          id: Number(match.id),
          routeMatchId: Number(match.id),
          status: String(match.status ?? "").trim(),
          round: Number(match.round_number ?? 0),
          matchNo: Number(match.match_no ?? 0),
          nextMatchId: toNumber(match.next_match_id),
          nextSlot: toSlot(match.next_slot),
          teamAId,
          teamBId,
          p1,
          p2,
          p1Logo: match.team_a?.logo_url ?? null,
          p2Logo: match.team_b?.logo_url ?? null,
          s1: scoreA,
          s2: scoreB,
          winner,
        };
      });
  }, [data, teamNameById]);

  const displayMatches = useMemo(
    () =>
      projectDoubleElimMatches({
        matches: baseDisplayMatches,
        selectedTeamByMatchId,
      }),
    [baseDisplayMatches, selectedTeamByMatchId],
  );

  const inferredTeamCount = useMemo(() => {
    const teamIds = new Set<number>();
    for (const match of displayMatches) {
      if (match.teamAId !== null) teamIds.add(match.teamAId);
      if (match.teamBId !== null) teamIds.add(match.teamBId);
    }
    return teamIds.size;
  }, [displayMatches]);

  const rounds = useMemo(() => {
    const grouped = new Map<number, DisplayMatch[]>();
    displayMatches.forEach((match) => {
      const list = grouped.get(match.round) ?? [];
      list.push(match);
      grouped.set(match.round, list);
    });
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]);
  }, [displayMatches]);

  const journeySet = useMemo(() => {
    if (!hoveredPlayer) return null;
    return new Set(
      displayMatches
        .filter(
          (match) => match.p1 === hoveredPlayer || match.p2 === hoveredPlayer,
        )
        .map((match) => match.id),
    );
  }, [hoveredPlayer, displayMatches]);

  const fourTeamSpecial = useMemo(() => {
    if (rounds.length < 5) return null;

    const roundSizes = rounds.map(([, matches]) => matches.length);
    const matchesFourTeamShape =
      roundSizes[0] === 2 &&
      roundSizes[1] === 1 &&
      roundSizes[2] === 1 &&
      roundSizes[3] === 1 &&
      roundSizes[4] === 1;

    if (!matchesFourTeamShape) return null;

    const [r1, r2, r3, r4, r5] = rounds.slice(0, 5).map(([round]) => round);

    const r1Matches = (rounds.find(([round]) => round === r1)?.[1] ?? []).sort(
      (a, b) => a.matchNo - b.matchNo,
    );

    if (r1Matches.length !== 2) return null;

    const match2 = rounds.find(([round]) => round === r2)?.[1]?.[0];
    const match3 = rounds.find(([round]) => round === r3)?.[1]?.[0];
    const match4 = rounds.find(([round]) => round === r4)?.[1]?.[0];
    const match5 = rounds.find(([round]) => round === r5)?.[1]?.[0];

    if (!match2 || !match3 || !match4 || !match5) return null;

    return {
      r1,
      r2,
      r3,
      r4,
      r5,
      match1A: r1Matches[0],
      match1B: r1Matches[1],
      match2,
      match3,
      match4,
      match5,
    };
  }, [rounds]);

  const eightTeamSpecial = useMemo(() => {
    const likelyEightTeamBracket = inferredTeamCount >= 7;
    if (!likelyEightTeamBracket) return null;
    if (rounds.length < 8) return null;

    const byRound = new Map(rounds);
    const r1 = (byRound.get(1) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r2 = (byRound.get(2) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r3 = (byRound.get(3) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r4 = (byRound.get(4) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r5 = (byRound.get(5) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r6 = (byRound.get(6) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r7 = (byRound.get(7) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r8 = (byRound.get(8) ?? []).sort((a, b) => a.matchNo - b.matchNo);

    if (
      r1.length !== 4 ||
      r2.length !== 2 ||
      r3.length !== 1 ||
      r4.length !== 2 ||
      r5.length !== 2 ||
      r6.length !== 1 ||
      r7.length !== 1 ||
      r8.length !== 1
    ) {
      return null;
    }

    return {
      r1,
      r2,
      r3: r3[0],
      r4,
      r5,
      r6: r6[0],
      r7: r7[0],
      r8: r8[0],
    };
  }, [rounds, inferredTeamCount]);

  const sixTeamSpecial = useMemo(() => {
    const likelySixTeamBracket =
      inferredTeamCount > 0 && inferredTeamCount <= 6;
    if (!likelySixTeamBracket) return null;
    if (rounds.length < 7) return null;

    const byRound = new Map(rounds);
    const r1 = (byRound.get(1) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r2 = (byRound.get(2) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r3 = (byRound.get(3) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r4 = (byRound.get(4) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r5 = (byRound.get(5) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r6 = (byRound.get(6) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r7 = (byRound.get(7) ?? []).sort((a, b) => a.matchNo - b.matchNo);

    if (
      r1.length !== 2 ||
      r2.length !== 2 ||
      r3.length !== 1 ||
      r4.length !== 2 ||
      r5.length !== 1 ||
      r6.length !== 1 ||
      r7.length !== 1
    ) {
      return null;
    }

    return {
      r1,
      r2,
      r3: r3[0],
      r4,
      r5: r5[0],
      r6: r6[0],
      r7: r7[0],
    };
  }, [rounds, inferredTeamCount]);

  const layout = useMemo(() => {
    if (!rounds.length) return null;

    const columns = rounds.map(([, matches]) => matches);
    const tops: number[][] = [];

    tops.push(columns[0].map((_, index) => index * (CARD_H + ROUND_GAP)));

    for (let col = 1; col < columns.length; col += 1) {
      const prevTops = tops[col - 1];
      const prevCount = prevTops.length;
      const currCount = columns[col].length;
      const currentTops: number[] = [];

      for (let i = 0; i < currCount; i += 1) {
        const { start, end } = getSegmentRange(prevCount, currCount, i);
        const segmentCenters = prevTops
          .slice(start, end + 1)
          .map((top) => top + CARD_H / 2);
        const avgCenter =
          segmentCenters.reduce((sum, value) => sum + value, 0) /
          segmentCenters.length;
        currentTops.push(avgCenter - CARD_H / 2);
      }

      tops.push(currentTops);
    }

    const minTop = Math.min(...tops.flat());
    if (minTop < 0) {
      for (let c = 0; c < tops.length; c += 1) {
        tops[c] = tops[c].map((top) => top - minTop);
      }
    }

    const maxBottom = Math.max(
      ...tops.flatMap((columnTops) => columnTops.map((top) => top + CARD_H)),
    );
    const totalW = columns.length * CARD_W + (columns.length - 1) * CONN_W;

    return {
      columns,
      tops,
      totalW,
      totalH: maxBottom + HEADER_H,
    };
  }, [rounds]);

  if (isLoading) {
    return <p className="text-smtext-[#EEEEEE]">Đang tải bracket...</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Không tải được dữ liệu double elimination.
      </p>
    );
  }

  if (!rounds.length) {
    return (
      <p className="text-smtext-[#EEEEEE]">Chưa có match trong bracket này.</p>
    );
  }

  const totalRounds = rounds.length;
  const firstRoundMatchCount = rounds[0]?.[1]?.length ?? 0;

  if (eightTeamSpecial) {
    const x1 = 0;
    const x2 = x1 + CARD_W + 72;
    const x3 = x2 + CARD_W + 72;
    const x4 = x3 + CARD_W + 72;
    const x5 = x4 + CARD_W + 72;

    const y1A = 0;
    const y1B = CARD_H + 28;
    const pairBlock = 2 * CARD_H + 28;
    const y1C = pairBlock + 72;
    const y1D = y1C + CARD_H + 28;

    const y2A = (y1A + y1B + CARD_H) / 2 - CARD_H / 2;
    const y2B = (y1C + y1D + CARD_H) / 2 - CARD_H / 2;
    const y3 = (y2A + y2B + CARD_H) / 2 - CARD_H / 2;

    const lowerBase = y1D + CARD_H + 120;
    const y4A = lowerBase;
    const y4B = lowerBase + CARD_H + 42;
    const y5A = y4A;
    const y5B = y4B;

    const y6 = (y5A + y5B + CARD_H) / 2 - CARD_H / 2;
    const y7 = y6;
    const y8 = (y3 + y7 + CARD_H) / 2 - CARD_H / 2;

    const totalW = x5 + CARD_W;
    const totalH = y4B + CARD_H + HEADER_H + 24;

    const c1A = y1A + HEADER_H + CARD_H / 2;
    const c1B = y1B + HEADER_H + CARD_H / 2;
    const c1C = y1C + HEADER_H + CARD_H / 2;
    const c1D = y1D + HEADER_H + CARD_H / 2;
    const c2A = y2A + HEADER_H + CARD_H / 2;
    const c2B = y2B + HEADER_H + CARD_H / 2;
    const c3 = y3 + HEADER_H + CARD_H / 2;
    const c4A = y4A + HEADER_H + CARD_H / 2;
    const c4B = y4B + HEADER_H + CARD_H / 2;
    const c5A = y5A + HEADER_H + CARD_H / 2;
    const c5B = y5B + HEADER_H + CARD_H / 2;
    const c6 = y6 + HEADER_H + CARD_H / 2;
    const c7 = y7 + HEADER_H + CARD_H / 2;
    const c8 = y8 + HEADER_H + CARD_H / 2;

    return withPickemContext(
      <div className="space-y-3">
        <div className="relative" style={{ width: totalW, height: totalH }}>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{ left: x1, width: CARD_W, textAlign: "center", top: 0 }}
          >
            {getDoubleElimRoundTitle(1, totalRounds, firstRoundMatchCount, 8)}
          </div>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{ left: x2, width: CARD_W, textAlign: "center", top: 0 }}
          >
            {getDoubleElimRoundTitle(2, totalRounds, firstRoundMatchCount, 8)}
          </div>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{ left: x4, width: CARD_W, textAlign: "center", top: 0 }}
          >
            {getDoubleElimRoundTitle(3, totalRounds, firstRoundMatchCount, 8)}
          </div>

          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{
              left: x1,
              width: CARD_W,
              textAlign: "center",
              top: y4A - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(4, totalRounds, firstRoundMatchCount, 8)}
          </div>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{
              left: x2,
              width: CARD_W,
              textAlign: "center",
              top: y5A - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(5, totalRounds, firstRoundMatchCount, 8)}
          </div>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{
              left: x3,
              width: CARD_W,
              textAlign: "center",
              top: y6 - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(6, totalRounds, firstRoundMatchCount, 8)}
          </div>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{
              left: x4,
              width: CARD_W,
              textAlign: "center",
              top: y7 - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(7, totalRounds, firstRoundMatchCount, 8)}
          </div>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{
              left: x5,
              width: CARD_W,
              textAlign: "center",
              top: y8 - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(8, totalRounds, firstRoundMatchCount, 8)}
          </div>

          <div className="absolute" style={{ left: x1, top: y1A + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r1[0]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r1[0].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y1B + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r1[1]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r1[1].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y1C + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r1[2]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r1[2].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y1D + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r1[3]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r1[3].id)
              }
            />
          </div>

          <div className="absolute" style={{ left: x2, top: y2A + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r2[0]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r2[0].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x2, top: y2B + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r2[1]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r2[1].id)
              }
            />
          </div>

          <div className="absolute" style={{ left: x4, top: y3 + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r3}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r3.id)
              }
            />
          </div>

          <div className="absolute" style={{ left: x1, top: y4A + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r4[0]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r4[0].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y4B + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r4[1]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r4[1].id)
              }
            />
          </div>

          <div className="absolute" style={{ left: x2, top: y5A + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r5[0]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r5[0].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x2, top: y5B + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r5[1]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r5[1].id)
              }
            />
          </div>

          <div className="absolute" style={{ left: x3, top: y6 + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r6}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r6.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x4, top: y7 + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r7}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r7.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x5, top: y8 + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r8}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r8.id)
              }
            />
          </div>

          <ElbowConnector
            fromX={x1 + CARD_W}
            fromY={c1A}
            toX={x2}
            toY={c2A}
            hasHover={hoveredPlayer !== null}
            active={Boolean(
              journeySet &&
              journeySet.has(eightTeamSpecial.r1[0].id) &&
              journeySet.has(eightTeamSpecial.r2[0].id),
            )}
          />
          <ElbowConnector
            fromX={x1 + CARD_W}
            fromY={c1B}
            toX={x2}
            toY={c2A}
            hasHover={hoveredPlayer !== null}
            active={Boolean(
              journeySet &&
              journeySet.has(eightTeamSpecial.r1[1].id) &&
              journeySet.has(eightTeamSpecial.r2[0].id),
            )}
          />
          <ElbowConnector
            fromX={x1 + CARD_W}
            fromY={c1C}
            toX={x2}
            toY={c2B}
            hasHover={hoveredPlayer !== null}
            active={Boolean(
              journeySet &&
              journeySet.has(eightTeamSpecial.r1[2].id) &&
              journeySet.has(eightTeamSpecial.r2[1].id),
            )}
          />
          <ElbowConnector
            fromX={x1 + CARD_W}
            fromY={c1D}
            toX={x2}
            toY={c2B}
            hasHover={hoveredPlayer !== null}
            active={Boolean(
              journeySet &&
              journeySet.has(eightTeamSpecial.r1[3].id) &&
              journeySet.has(eightTeamSpecial.r2[1].id),
            )}
          />

          <MergeConnector
            fromX={x2 + CARD_W}
            fromYs={[c2A, c2B]}
            toX={x4}
            toY={c3}
            hasHover={hoveredPlayer !== null}
            activeFrom={[
              Boolean(journeySet && journeySet.has(eightTeamSpecial.r2[0].id)),
              Boolean(journeySet && journeySet.has(eightTeamSpecial.r2[1].id)),
            ]}
            activeOutput={Boolean(
              journeySet && journeySet.has(eightTeamSpecial.r3.id),
            )}
          />

          <ElbowConnector
            fromX={x1 + CARD_W}
            fromY={c4A}
            toX={x2}
            toY={c5A}
            hasHover={hoveredPlayer !== null}
            active={Boolean(
              journeySet &&
              journeySet.has(eightTeamSpecial.r4[0].id) &&
              journeySet.has(eightTeamSpecial.r5[0].id),
            )}
          />
          <ElbowConnector
            fromX={x1 + CARD_W}
            fromY={c4B}
            toX={x2}
            toY={c5B}
            hasHover={hoveredPlayer !== null}
            active={Boolean(
              journeySet &&
              journeySet.has(eightTeamSpecial.r4[1].id) &&
              journeySet.has(eightTeamSpecial.r5[1].id),
            )}
          />

          <MergeConnector
            fromX={x2 + CARD_W}
            fromYs={[c5A, c5B]}
            toX={x3}
            toY={c6}
            hasHover={hoveredPlayer !== null}
            activeFrom={[
              Boolean(journeySet && journeySet.has(eightTeamSpecial.r5[0].id)),
              Boolean(journeySet && journeySet.has(eightTeamSpecial.r5[1].id)),
            ]}
            activeOutput={Boolean(
              journeySet && journeySet.has(eightTeamSpecial.r6.id),
            )}
          />

          <ElbowConnector
            fromX={x3 + CARD_W}
            fromY={c6}
            toX={x4}
            toY={c7}
            hasHover={hoveredPlayer !== null}
            active={Boolean(
              journeySet &&
              journeySet.has(eightTeamSpecial.r6.id) &&
              journeySet.has(eightTeamSpecial.r7.id),
            )}
          />

          <MergeConnector
            fromX={x4 + CARD_W}
            fromYs={[c3, c7]}
            toX={x5}
            toY={c8}
            hasHover={hoveredPlayer !== null}
            activeFrom={[
              Boolean(journeySet && journeySet.has(eightTeamSpecial.r3.id)),
              Boolean(journeySet && journeySet.has(eightTeamSpecial.r7.id)),
            ]}
            activeOutput={Boolean(
              journeySet && journeySet.has(eightTeamSpecial.r8.id),
            )}
          />
        </div>
      </div>,
    );
  }

  if (sixTeamSpecial) {
    const x1 = 0;
    const x2 = x1 + CARD_W + 72;
    const x3 = x2 + CARD_W + 72;
    const x4 = x3 + CARD_W + 72;
    const x5 = x4 + CARD_W + 72;

    const y1A = 0;
    const y1B = CARD_H + 40;

    const y2A = y1A;
    const y2B = y1B;
    const y3 = (y2A + y2B + CARD_H) / 2 - CARD_H / 2;

    const lowerBase = y1B + CARD_H + 120;
    const y4A = lowerBase;
    const y4B = lowerBase + CARD_H + 40;
    const y5 = (y4A + y4B + CARD_H) / 2 - CARD_H / 2;
    const y6 = y5;
    const y7 = (y3 + y6 + CARD_H) / 2 - CARD_H / 2;

    const totalW = x5 + CARD_W;
    const totalH = y4B + CARD_H + HEADER_H + 24;

    const c1A = y1A + HEADER_H + CARD_H / 2;
    const c1B = y1B + HEADER_H + CARD_H / 2;
    const c2A = y2A + HEADER_H + CARD_H / 2;
    const c2B = y2B + HEADER_H + CARD_H / 2;
    const c3 = y3 + HEADER_H + CARD_H / 2;
    const c4A = y4A + HEADER_H + CARD_H / 2;
    const c4B = y4B + HEADER_H + CARD_H / 2;
    const c5 = y5 + HEADER_H + CARD_H / 2;
    const c6 = y6 + HEADER_H + CARD_H / 2;
    const c7 = y7 + HEADER_H + CARD_H / 2;

    return withPickemContext(
      <div className="space-y-3">
        <div className="relative" style={{ width: totalW, height: totalH }}>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{ left: x1, width: CARD_W, textAlign: "center", top: 0 }}
          >
            {getDoubleElimRoundTitle(1, totalRounds, firstRoundMatchCount, 6)}
          </div>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{ left: x2, width: CARD_W, textAlign: "center", top: 0 }}
          >
            {getDoubleElimRoundTitle(2, totalRounds, firstRoundMatchCount, 6)}
          </div>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{ left: x4, width: CARD_W, textAlign: "center", top: 0 }}
          >
            {getDoubleElimRoundTitle(3, totalRounds, firstRoundMatchCount, 6)}
          </div>

          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{
              left: x1,
              width: CARD_W,
              textAlign: "center",
              top: y4A - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(4, totalRounds, firstRoundMatchCount, 6)}
          </div>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{
              left: x5,
              width: CARD_W,
              textAlign: "center",
              top: y7 - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(7, totalRounds, firstRoundMatchCount, 6)}
          </div>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{
              left: x4,
              width: CARD_W,
              textAlign: "center",
              top: y6 - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(6, totalRounds, firstRoundMatchCount, 6)}
          </div>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{
              left: x2,
              width: CARD_W,
              textAlign: "center",
              top: y5 - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(5, totalRounds, firstRoundMatchCount, 6)}
          </div>

          <div className="absolute" style={{ left: x1, top: y1A + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r1[0]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(sixTeamSpecial.r1[0].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y1B + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r1[1]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(sixTeamSpecial.r1[1].id)
              }
            />
          </div>

          <div className="absolute" style={{ left: x2, top: y2A + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r2[0]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(sixTeamSpecial.r2[0].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x2, top: y2B + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r2[1]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(sixTeamSpecial.r2[1].id)
              }
            />
          </div>

          <div className="absolute" style={{ left: x4, top: y3 + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r3}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={!journeySet || journeySet.has(sixTeamSpecial.r3.id)}
            />
          </div>

          <div className="absolute" style={{ left: x1, top: y4A + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r4[0]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(sixTeamSpecial.r4[0].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y4B + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r4[1]}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(sixTeamSpecial.r4[1].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x2, top: y5 + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r5}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={!journeySet || journeySet.has(sixTeamSpecial.r5.id)}
            />
          </div>
          <div className="absolute" style={{ left: x4, top: y6 + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r6}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={!journeySet || journeySet.has(sixTeamSpecial.r6.id)}
            />
          </div>
          <div className="absolute" style={{ left: x5, top: y7 + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r7}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={!journeySet || journeySet.has(sixTeamSpecial.r7.id)}
            />
          </div>

          <ElbowConnector
            fromX={x1 + CARD_W}
            fromY={c1A}
            toX={x2}
            toY={c2A}
            hasHover={hoveredPlayer !== null}
            active={Boolean(
              journeySet &&
              journeySet.has(sixTeamSpecial.r1[0].id) &&
              journeySet.has(sixTeamSpecial.r2[0].id),
            )}
          />
          <ElbowConnector
            fromX={x1 + CARD_W}
            fromY={c1B}
            toX={x2}
            toY={c2B}
            hasHover={hoveredPlayer !== null}
            active={Boolean(
              journeySet &&
              journeySet.has(sixTeamSpecial.r1[1].id) &&
              journeySet.has(sixTeamSpecial.r2[1].id),
            )}
          />

          <MergeConnector
            fromX={x2 + CARD_W}
            fromYs={[c2A, c2B]}
            toX={x4}
            toY={c3}
            hasHover={hoveredPlayer !== null}
            activeFrom={[
              Boolean(journeySet && journeySet.has(sixTeamSpecial.r2[0].id)),
              Boolean(journeySet && journeySet.has(sixTeamSpecial.r2[1].id)),
            ]}
            activeOutput={Boolean(
              journeySet && journeySet.has(sixTeamSpecial.r3.id),
            )}
          />

          <MergeConnector
            fromX={x1 + CARD_W}
            fromYs={[c4A, c4B]}
            toX={x2}
            toY={c5}
            hasHover={hoveredPlayer !== null}
            activeFrom={[
              Boolean(journeySet && journeySet.has(sixTeamSpecial.r4[0].id)),
              Boolean(journeySet && journeySet.has(sixTeamSpecial.r4[1].id)),
            ]}
            activeOutput={Boolean(
              journeySet && journeySet.has(sixTeamSpecial.r5.id),
            )}
          />
          <ElbowConnector
            fromX={x2 + CARD_W}
            fromY={c5}
            toX={x4}
            toY={c6}
            hasHover={hoveredPlayer !== null}
            active={Boolean(
              journeySet &&
              journeySet.has(sixTeamSpecial.r5.id) &&
              journeySet.has(sixTeamSpecial.r6.id),
            )}
          />
          <MergeConnector
            fromX={x4 + CARD_W}
            fromYs={[c3, c6]}
            toX={x5}
            toY={c7}
            hasHover={hoveredPlayer !== null}
            activeFrom={[
              Boolean(journeySet && journeySet.has(sixTeamSpecial.r3.id)),
              Boolean(journeySet && journeySet.has(sixTeamSpecial.r6.id)),
            ]}
            activeOutput={Boolean(
              journeySet && journeySet.has(sixTeamSpecial.r7.id),
            )}
          />
        </div>
      </div>,
    );
  }

  if (fourTeamSpecial) {
    const x1 = 0;
    const x2 = CARD_W + 72;
    const x5 = x2 + CARD_W + 72;

    const y1A = 0;
    const y1B = CARD_H + 68;
    const y2 = (y1A + y1B + CARD_H) / 2 - CARD_H / 2;

    const y3 = y1B + CARD_H + 92;
    const y4 = y3;
    const y5 = (y2 + y4 + CARD_H) / 2 - CARD_H / 2;

    const totalW = x5 + CARD_W;
    const totalH = y3 + CARD_H + HEADER_H + 16;

    const outX1 = x1 + CARD_W;
    const outX2 = x2 + CARD_W;

    const inX2 = x2;
    const inX5 = x5;

    const c1A = y1A + HEADER_H + CARD_H / 2;
    const c1B = y1B + HEADER_H + CARD_H / 2;
    const c2 = y2 + HEADER_H + CARD_H / 2;
    const c3 = y3 + HEADER_H + CARD_H / 2;
    const c4 = y4 + HEADER_H + CARD_H / 2;
    const c5 = y5 + HEADER_H + CARD_H / 2;

    return withPickemContext(
      <div className="space-y-3">
        <div className="relative" style={{ width: totalW, height: totalH }}>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{ left: x1, width: CARD_W, textAlign: "center", top: 0 }}
          >
            {getDoubleElimRoundTitle(
              fourTeamSpecial.r1,
              totalRounds,
              firstRoundMatchCount,
              teamCount,
            )}
          </div>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{ left: x2, width: CARD_W, textAlign: "center", top: 0 }}
          >
            {getDoubleElimRoundTitle(
              fourTeamSpecial.r2,
              totalRounds,
              firstRoundMatchCount,
              teamCount,
            )}
          </div>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{ left: x5, width: CARD_W, textAlign: "center", top: 0 }}
          >
            {getDoubleElimRoundTitle(
              fourTeamSpecial.r5,
              totalRounds,
              firstRoundMatchCount,
              teamCount,
            )}
          </div>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{
              left: x1,
              width: CARD_W,
              textAlign: "center",
              top: y3 - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(
              fourTeamSpecial.r3,
              totalRounds,
              firstRoundMatchCount,
              teamCount,
            )}
          </div>
          <div
            className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
            style={{
              left: x2,
              width: CARD_W,
              textAlign: "center",
              top: y4 - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(
              fourTeamSpecial.r4,
              totalRounds,
              firstRoundMatchCount,
              teamCount,
            )}
          </div>

          <div className="absolute" style={{ left: x1, top: y1A + HEADER_H }}>
            <MatchCard
              match={fourTeamSpecial.match1A}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(fourTeamSpecial.match1A.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y1B + HEADER_H }}>
            <MatchCard
              match={fourTeamSpecial.match1B}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(fourTeamSpecial.match1B.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x2, top: y2 + HEADER_H }}>
            <MatchCard
              match={fourTeamSpecial.match2}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(fourTeamSpecial.match2.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y3 + HEADER_H }}>
            <MatchCard
              match={fourTeamSpecial.match3}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(fourTeamSpecial.match3.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x2, top: y4 + HEADER_H }}>
            <MatchCard
              match={fourTeamSpecial.match4}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(fourTeamSpecial.match4.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x5, top: y5 + HEADER_H }}>
            <MatchCard
              match={fourTeamSpecial.match5}
              hoveredPlayer={hoveredPlayer}
              onHover={setHoveredPlayer}
              isInJourney={
                !journeySet || journeySet.has(fourTeamSpecial.match5.id)
              }
            />
          </div>

          <ElbowConnector
            fromX={outX1}
            fromY={c1A}
            toX={inX2}
            toY={c2}
            hasHover={hoveredPlayer !== null}
            active={Boolean(
              journeySet &&
              journeySet.has(fourTeamSpecial.match1A.id) &&
              journeySet.has(fourTeamSpecial.match2.id),
            )}
          />
          <ElbowConnector
            fromX={outX1}
            fromY={c1B}
            toX={inX2}
            toY={c2}
            hasHover={hoveredPlayer !== null}
            active={Boolean(
              journeySet &&
              journeySet.has(fourTeamSpecial.match1B.id) &&
              journeySet.has(fourTeamSpecial.match2.id),
            )}
          />
          <ElbowConnector
            fromX={outX1}
            fromY={c3}
            toX={inX2}
            toY={c4}
            hasHover={hoveredPlayer !== null}
            active={Boolean(
              journeySet &&
              journeySet.has(fourTeamSpecial.match3.id) &&
              journeySet.has(fourTeamSpecial.match4.id),
            )}
          />
          <MergeConnector
            fromX={outX2}
            fromYs={[c2, c4]}
            toX={inX5}
            toY={c5}
            hasHover={hoveredPlayer !== null}
            activeFrom={[
              Boolean(journeySet && journeySet.has(fourTeamSpecial.match2.id)),
              Boolean(journeySet && journeySet.has(fourTeamSpecial.match4.id)),
            ]}
            activeOutput={Boolean(
              journeySet && journeySet.has(fourTeamSpecial.match5.id),
            )}
          />
        </div>
      </div>,
    );
  }

  if (!layout) {
    return (
      <p className="text-smtext-[#EEEEEE]">Không thể dựng layout bracket.</p>
    );
  }

  return withPickemContext(
    <div className="space-y-3">
      <div
        className="relative"
        style={{ width: layout.totalW, height: layout.totalH }}
      >
        {layout.columns.map((matches, colIndex) => {
          const colLeft = colIndex * (CARD_W + CONN_W);
          const roundNumber = rounds[colIndex]?.[0] ?? colIndex + 1;
          const roundLabel = getDoubleElimRoundTitle(
            roundNumber,
            totalRounds,
            firstRoundMatchCount,
            teamCount,
          );

          return (
            <div key={`col-${colIndex}`}>
              <div
                className="absolute text-xs font-boldtext-[#EEEEEE] uppercase tracking-wider"
                style={{
                  left: colLeft,
                  width: CARD_W,
                  textAlign: "center",
                  top: 0,
                }}
              >
                {roundLabel}
              </div>

              {matches.map((match, matchIndex) => (
                <div
                  key={match.id}
                  className="absolute"
                  style={{
                    left: colLeft,
                    top: layout.tops[colIndex][matchIndex] + HEADER_H,
                  }}
                >
                  <MatchCard
                    match={match}
                    hoveredPlayer={hoveredPlayer}
                    onHover={setHoveredPlayer}
                    isInJourney={!journeySet || journeySet.has(match.id)}
                  />
                </div>
              ))}

              {colIndex < layout.columns.length - 1 ? (
                <div
                  className="absolute"
                  style={{
                    left: colLeft + CARD_W,
                    width: CONN_W,
                    top: 0,
                    height: layout.totalH,
                  }}
                >
                  {layout.columns[colIndex + 1].map((_, nextIndex) => {
                    const prevCount = layout.columns[colIndex].length;
                    const currCount = layout.columns[colIndex + 1].length;
                    const { start, end } = getSegmentRange(
                      prevCount,
                      currCount,
                      nextIndex,
                    );

                    const inYs = layout.tops[colIndex]
                      .slice(start, end + 1)
                      .map((top) => top + CARD_H / 2);
                    const outY =
                      layout.tops[colIndex + 1][nextIndex] + CARD_H / 2;

                    return (
                      <RoundConnector
                        key={`conn-${colIndex}-${nextIndex}`}
                        inYs={inYs}
                        outY={outY}
                        hasHover={hoveredPlayer !== null}
                        activeInputIndexes={inYs
                          .map((_, localIndex) => {
                            const sourceMatch =
                              layout.columns[colIndex][start + localIndex];
                            return journeySet?.has(sourceMatch.id)
                              ? localIndex
                              : -1;
                          })
                          .filter((index) => index >= 0)}
                        activeOutput={Boolean(
                          journeySet &&
                          journeySet.has(
                            layout.columns[colIndex + 1][nextIndex].id,
                          ),
                        )}
                      />
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>,
  );
};

export default DoubleElimBracket;
