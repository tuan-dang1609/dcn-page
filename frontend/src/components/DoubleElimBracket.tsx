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
import { BracketTeamIcon } from "@/components/BracketTeamIcon";
import {
  FOUR_TEAM_ADVANCE_ROUND_SHAPE,
  formatDoubleElimMatchFooterTitle,
  getDoubleElimRoundTitle,
} from "@/components/double-elim/roundLabels";
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
  normalizeTeamColorHex,
} from "@/components/bracketHover";
import {
  buildBracketColumnLayout,
  getSegmentRange,
  RoundConnector,
} from "@/components/bracketConnectors";
import {
  BRACKET_CARD_CLASS,
  BRACKET_MATCH_TITLE_H,
  BRACKET_ROW_BASE_CLASS,
  formatBracketSideScore,
  getBracketMatchCardHeight,
  getMatchCardConnectorY,
  getBracketRowStateClass,
} from "@/components/bracketTheme";
import { BracketMatchCardShell } from "@/components/BracketMatchCardShell";

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
  dateScheduled?: string | null;
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
  p1Color?: string | null;
  p2Color?: string | null;
  s1: number | null;
  s2: number | null;
  winner: string | null;
};

const CARD_W = 272;
const ROW_H = 46;
const ROW_BLOCK_H = ROW_H * 2;
const CARD_H = getBracketMatchCardHeight(ROW_H);
const CONN_W = 48;
const ROUND_GAP = 24;
const HEADER_H = 0;

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

const COMPACT_SIX_ROUND_SHAPE = "1:2,2:2,3:1,4:2,5:1,6:1,7:1";

const getCompactSixLoserTarget = (match: DisplayMatch) => {
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

  return compactSixLoserMap[`${match.round}-${match.matchNo}`] ?? null;
};

const getFourTeamAdvanceLoserTarget = (
  match: Pick<DisplayMatch, "round" | "matchNo">,
) => {
  const map: Record<
    string,
    { round: number; matchNo: number; slot: "A" | "B" }
  > = {
    // Opening losers → lower bracket
    "1-1": { round: 3, matchNo: 1, slot: "A" },
    "1-2": { round: 3, matchNo: 1, slot: "B" },
    // Upper final loser → decider slot B (slot A = winner nhánh thua)
    "2-1": { round: 4, matchNo: 1, slot: "B" },
  };

  return map[`${match.round}-${match.matchNo}`] ?? null;
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

  if (roundShape === FOUR_TEAM_ADVANCE_ROUND_SHAPE) {
    return getFourTeamAdvanceLoserTarget(match);
  }

  const isCompactSixSingleBracket = roundShape === COMPACT_SIX_ROUND_SHAPE;

  if (isCompactSixSingleBracket) {
    return getCompactSixLoserTarget(match);
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
    { name: string; logoUrl: string | null; color: string | null }
  >();

  matches.forEach((match) => {
    projectedById.set(match.id, { ...match });

    if (match.teamAId) {
      teamInfoById.set(match.teamAId, {
        name: match.p1,
        logoUrl: match.p1Logo ?? null,
        color: match.p1Color ?? null,
      });
    }

    if (match.teamBId) {
      teamInfoById.set(match.teamBId, {
        name: match.p2,
        logoUrl: match.p2Logo ?? null,
        color: match.p2Color ?? null,
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
  const roundShape = getRoundShape(projectedMatches);
  const isCompactSixSingleBracket = roundShape === COMPACT_SIX_ROUND_SHAPE;
  const isFourTeamAdvance = roundShape === FOUR_TEAM_ADVANCE_ROUND_SHAPE;
  const winnerRounds = isCompactSixSingleBracket
    ? 3
    : isFourTeamAdvance
      ? 2
      : roundOneMatchCount > 0
        ? Math.max(1, Math.log2(roundOneMatchCount * 2))
        : 1;
  const loserMainRounds = isCompactSixSingleBracket
    ? 4
    : isFourTeamAdvance
      ? 2
      : Math.max(1, 2 * (winnerRounds - 1));

  const applyTeamToSlot = (
    target: DisplayMatch,
    preferredSlot: "A" | "B",
    teamId: number,
    options?: { allowFallback?: boolean },
  ) => {
    const winnerInfo = teamInfoById.get(teamId);

    const canUseSlot = (slot: "A" | "B") => {
      if (slot === "A") return !target.teamAId || target.teamAId === teamId;
      return !target.teamBId || target.teamBId === teamId;
    };

    let slot = preferredSlot;
    if (!canUseSlot(slot)) {
      if (options?.allowFallback) {
        slot = slot === "A" ? "B" : "A";
      }

      if (!canUseSlot(slot)) return;
    }

    if (slot === "A") {
      target.teamAId = teamId;
      target.p1 = winnerInfo?.name ?? `Đội #${teamId}`;
      target.p1Logo = winnerInfo?.logoUrl ?? null;
      target.p1Color = winnerInfo?.color ?? null;
      return;
    }

    target.teamBId = teamId;
    target.p2 = winnerInfo?.name ?? `Đội #${teamId}`;
    target.p2Logo = winnerInfo?.logoUrl ?? null;
    target.p2Color = winnerInfo?.color ?? null;
  };

  projectedMatches.forEach((source) => {
    const winnerTeamId = getResolvedWinnerTeamId(source, selectedTeamByMatchId);
    if (!winnerTeamId) return;

    const winnerInfo = teamInfoById.get(winnerTeamId);
    if (!winnerInfo) {
      teamInfoById.set(winnerTeamId, {
        name: `Đội #${winnerTeamId}`,
        logoUrl: null,
        color: null,
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

    applyTeamToSlot(targetMatch, loserTarget.slot, loserTeamId, {
      allowFallback: true,
    });
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
  teamId?: number | null;
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

const AdvancesSlot = ({
  teamName,
  logoUrl,
  teamId,
  hoveredTeamId,
  onHoverTeam,
}: {
  teamName: string;
  logoUrl?: string | null;
  teamId?: number | null;
  hoveredTeamId: number | null;
  onHoverTeam: (hover: BracketHover | null) => void;
}) => {
  const hasHover = hoveredTeamId !== null;
  const isHovered = Boolean(teamId && hoveredTeamId === teamId);
  const hoverCls = bracketRowHoverClass(hasHover, isHovered);

  return (
    <div
      className={`${BRACKET_CARD_CLASS} flex flex-col overflow-hidden`}
      style={{ width: CARD_W, height: BRACKET_MATCH_TITLE_H + ROW_H }}
    >
      <div
        className="flex shrink-0 items-center justify-center bg-[#D1D5DB] px-2.5 text-[10px] font-extrabold leading-tight tracking-wider text-neutral-900"
        style={{ height: BRACKET_MATCH_TITLE_H }}
      >
        Đi tiếp
      </div>
      <div
        className={`${BRACKET_ROW_BASE_CLASS} ${isHoverableTeamId(teamId) ? "cursor-pointer" : "cursor-default"} bg-[#141414] text-neutral-100 ${hoverCls}`}
        style={{ height: ROW_H }}
        onMouseEnter={() =>
          onHoverTeam(
            isHoverableTeamId(teamId)
              ? { teamId: teamId!, matchId: -1, round: 99 }
              : null,
          )
        }
        onMouseLeave={() => onHoverTeam(null)}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm font-semibold">
          <BracketTeamIcon teamId={teamId} logoUrl={logoUrl} />
          {teamName || "TBD"}
        </span>
      </div>
    </div>
  );
};

const MatchCard = ({
  match,
  roundTitle,
  hoveredTeamId,
  onHoverTeam,
  isInJourney,
}: {
  match: DisplayMatch;
  roundTitle: string;
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

  if (!match.routeMatchId || disableMatchLink || canPick || !isMatchCompleted) {
    return (
      <BracketMatchCardShell
        title={roundTitle}
        status={match.status}
        dateScheduled={match.dateScheduled}
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
        status={match.status}
        dateScheduled={match.dateScheduled}
        style={{ width: CARD_W, height: CARD_H }}
      >
        {content}
      </BracketMatchCardShell>
    </Link>
  );
};

const ElbowConnector = ({
  fromX,
  fromY,
  toX,
  toY,
  hasHover,
  active,
  activeStroke,
}: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  hasHover: boolean;
  active: boolean;
  /** Khi hover hành trình: ưu tiên màu đội nếu có */
  activeStroke?: string | null;
}) => {
  const strokePad = 4;
  const left = Math.min(fromX, toX);
  const right = Math.max(fromX, toX);
  const top = Math.min(fromY, toY);
  const bottom = Math.max(fromY, toY);

  const width = right - left + strokePad * 2;
  const height = bottom - top + strokePad * 2;

  const sX = fromX - left + strokePad;
  const sY = fromY - top + strokePad;
  const eX = toX - left + strokePad;
  const eY = toY - top + strokePad;
  const midX = (sX + eX) / 2;

  // Đường ngang thuần: tránh V=0 làm stroke bị clip / trông nhạt
  const path =
    Math.abs(fromY - toY) < 0.5
      ? `M ${sX} ${sY} H ${eX}`
      : `M ${sX} ${sY} H ${midX} V ${eY} H ${eX}`;
  const hiStroke = activeStroke || BRACKET_CONN_ACTIVE_STROKE;

  return (
    <svg
      width={width}
      height={height}
      className="pointer-events-none absolute overflow-visible"
      style={{ left: left - strokePad, top: top - strokePad }}
    >
      {/* Base chỉ hiện khi chưa active — tránh gạch xám nằm dưới path xanh */}
      {!active ? (
        <path
          d={path}
          fill="none"
          stroke={BRACKET_CONN_BASE_STROKE}
          strokeWidth={2}
          opacity={hasHover ? BRACKET_CONN_DIM_OPACITY : 1}
        />
      ) : (
        <path
          d={path}
          fill="none"
          stroke={hiStroke}
          strokeWidth={3}
        />
      )}
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

  const strokePad = 4;
  const allYs = [...fromYs, toY];
  const left = Math.min(fromX, toX);
  const right = Math.max(fromX, toX);
  const top = Math.min(...allYs);
  const bottom = Math.max(...allYs);

  const width = right - left + strokePad * 2;
  const height = bottom - top + strokePad * 2;

  const sX = fromX - left + strokePad;
  const eX = toX - left + strokePad;
  const midX = (sX + eX) / 2;
  const normFromYs = fromYs.map((y) => y - top + strokePad);
  const normToY = toY - top + strokePad;

  const baseOpacity = hasHover ? BRACKET_CONN_DIM_OPACITY : 1;
  const activeYs = normFromYs.filter((_, index) => activeFrom[index]);
  const trunkMin = Math.min(...normFromYs, normToY);
  const trunkMax = Math.max(...normFromYs, normToY);

  return (
    <svg
      width={width}
      height={height}
      className="pointer-events-none absolute overflow-visible"
      style={{ left: left - strokePad, top: top - strokePad }}
    >
      {/* Luôn vẽ đủ khung: nhánh inactive + trunk — tránh mất nhánh khi hover */}
      {normFromYs.map((y, index) =>
        activeFrom[index] ? null : (
          <line
            key={`base-merge-in-${index}`}
            x1={sX}
            y1={y}
            x2={midX}
            y2={y}
            stroke={BRACKET_CONN_BASE_STROKE}
            strokeWidth={2}
            opacity={baseOpacity}
          />
        ),
      )}

      <line
        x1={midX}
        y1={trunkMin}
        x2={midX}
        y2={trunkMax}
        stroke={BRACKET_CONN_BASE_STROKE}
        strokeWidth={2}
        opacity={baseOpacity}
      />

      {/* Đoạn ngang vào card: bỏ base khi active để không bị gạch xám dưới xanh */}
      {!activeOutput ? (
        <line
          x1={midX}
          y1={normToY}
          x2={eX}
          y2={normToY}
          stroke={BRACKET_CONN_BASE_STROKE}
          strokeWidth={2}
          opacity={baseOpacity}
        />
      ) : null}

      {activeYs.length ? (
        <>
          {activeYs.map((y, idx) => (
            <line
              key={`active-merge-in-${idx}`}
              x1={sX}
              y1={y}
              x2={midX}
              y2={y}
              stroke={BRACKET_CONN_ACTIVE_STROKE}
              strokeWidth={3}
            />
          ))}
          {activeOutput ? (
            <>
              <line
                x1={midX}
                y1={Math.min(normToY, ...activeYs)}
                x2={midX}
                y2={Math.max(normToY, ...activeYs)}
                stroke={BRACKET_CONN_ACTIVE_STROKE}
                strokeWidth={3}
              />
              <line
                x1={midX}
                y1={normToY}
                x2={eX}
                y2={normToY}
                stroke={BRACKET_CONN_ACTIVE_STROKE}
                strokeWidth={3}
              />
            </>
          ) : null}
        </>
      ) : null}
    </svg>
  );
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
  const [hover, setHover] = useState<BracketHover | null>(null);
  const hoveredTeamId = hover?.teamId ?? null;

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
          dateScheduled: match.date_scheduled ?? null,
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
          p1Color: normalizeTeamColorHex(match.team_a?.team_color_hex),
          p2Color: normalizeTeamColorHex(match.team_b?.team_color_hex),
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

  const journeySet = useMemo(
    () => getTeamJourneyMatchIds(displayMatches, hoveredTeamId),
    [hoveredTeamId, displayMatches],
  );

  const matchProgressOrder = useMemo(
    () => buildMatchProgressOrder(displayMatches),
    [displayMatches],
  );

  const isPathActive = (
    source: Pick<DisplayMatch, "id" | "round">,
    dest: Pick<DisplayMatch, "id" | "round">,
  ) =>
    isJourneyConnectorActive(
      journeySet,
      source,
      dest,
      matchProgressOrder,
    );

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

  const fourTeamAdvanceSpecial = useMemo(() => {
    if (rounds.length < 4) return null;

    const roundShape = getRoundShape(displayMatches);
    if (roundShape !== FOUR_TEAM_ADVANCE_ROUND_SHAPE) return null;

    const byRound = new Map(rounds);
    const r1 = (byRound.get(1) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r2 = (byRound.get(2) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r3 = (byRound.get(3) ?? []).sort((a, b) => a.matchNo - b.matchNo);
    const r4 = (byRound.get(4) ?? []).sort((a, b) => a.matchNo - b.matchNo);

    if (
      r1.length !== 2 ||
      r2.length !== 1 ||
      r3.length !== 1 ||
      r4.length !== 1
    ) {
      return null;
    }

    return {
      match1A: r1[0],
      match1B: r1[1],
      upperFinal: r2[0],
      lowerRound: r3[0],
      decider: r4[0],
    };
  }, [rounds, displayMatches]);

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

  const layout = useMemo(
    () =>
      buildBracketColumnLayout({
        columns: rounds.map(([, matches]) => matches),
        cardH: CARD_H,
        roundGap: ROUND_GAP,
        cardW: CARD_W,
        connW: CONN_W,
        headerH: HEADER_H,
      }),
    [rounds],
  );

  if (isLoading) {
    return <p className="text-sm text-[#EEEEEE]">Ă„Âang tĂ¡ÂºÂ£i bracket...</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        KhÄ‚Â´ng tĂ¡ÂºÂ£i Ă„â€˜Ă†Â°Ă¡Â»Â£c dĂ¡Â»Â¯ liĂ¡Â»â€¡u double elimination.
      </p>
    );
  }

  if (!rounds.length) {
    return (
      <p className="text-sm text-[#EEEEEE]">Chưa có trận trong bracket này.</p>
    );
  }

  const totalRounds = rounds.length;
  const firstRoundMatchCount = rounds[0]?.[1]?.length ?? 0;
  const isAdvanceMode = Boolean(fourTeamAdvanceSpecial);
  const getMatchTitle = (match: DisplayMatch) =>
    formatDoubleElimMatchFooterTitle(
      getDoubleElimRoundTitle(
        match.round,
        totalRounds,
        firstRoundMatchCount,
        teamCount || inferredTeamCount,
        { isAdvanceMode },
      ),
      match.matchNo,
    );

  if (fourTeamAdvanceSpecial) {
    const x1 = 0;
    const x2 = CARD_W + 72;
    const x3 = x2 + CARD_W + 72;

    const y1A = 0;
    const y1B = CARD_H + 56;
    const y2 = (y1A + y1B + CARD_H) / 2 - CARD_H / 2;

    const y3 = y1B + CARD_H + 96;
    const y4 = y3;

    const outX1 = x1 + CARD_W;
    const outX2 = x2 + CARD_W;
    const inX2 = x2;
    const inX3 = x3;

    const c1A = getMatchCardConnectorY(y1A + HEADER_H, ROW_H);
    const c1B = getMatchCardConnectorY(y1B + HEADER_H, ROW_H);
    const c2 = getMatchCardConnectorY(y2 + HEADER_H, ROW_H);
    const c3 = getMatchCardConnectorY(y3 + HEADER_H, ROW_H);
    const c4 = getMatchCardConnectorY(y4 + HEADER_H, ROW_H);

    const totalW = x3 + CARD_W;
    const advanceSlotH = BRACKET_MATCH_TITLE_H + ROW_H;
    const advanceAnchorY = BRACKET_MATCH_TITLE_H + ROW_H / 2;
    // Align team-row center of Advances with match connector Y
    const yAdvanceUpper = c2 - advanceAnchorY;
    const yAdvanceLower = c4 - advanceAnchorY;
    const totalH =
      Math.max(y3 + CARD_H + HEADER_H, yAdvanceLower + advanceSlotH) + 16;

    const resolveAdvanceTeam = (match: DisplayMatch) => {
      const winnerId = getResolvedWinnerTeamId(
        match,
        selectedTeamByMatchId,
      );
      if (!winnerId) {
        return {
          teamId: null as number | null,
          name: "TBD",
          logoUrl: null as string | null,
          color: null as string | null,
        };
      }
      if (winnerId === match.teamAId) {
        return {
          teamId: match.teamAId,
          name: match.p1,
          logoUrl: match.p1Logo ?? null,
          color: match.p1Color ?? null,
        };
      }
      if (winnerId === match.teamBId) {
        return {
          teamId: match.teamBId,
          name: match.p2,
          logoUrl: match.p2Logo ?? null,
          color: match.p2Color ?? null,
        };
      }
      return {
        teamId: winnerId,
        name: `Đội #${winnerId}`,
        logoUrl: null,
        color: null,
      };
    };

    const upperAdvance = resolveAdvanceTeam(fourTeamAdvanceSpecial.upperFinal);
    const lowerAdvance = resolveAdvanceTeam(fourTeamAdvanceSpecial.decider);

    const isAdvanceLineActive = (
      teamId: number | null,
      sourceMatchId: number,
    ) =>
      Boolean(
        teamId &&
          hoveredTeamId === teamId &&
          journeySet?.has(sourceMatchId),
      );

    return withPickemContext(
      <div className="space-y-3">
        <div className="relative" style={{ width: totalW, height: totalH }}>
          <div className="absolute" style={{ left: x1, top: y1A + HEADER_H }}>
            <MatchCard
              match={fourTeamAdvanceSpecial.match1A}
              roundTitle={getMatchTitle(fourTeamAdvanceSpecial.match1A)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet ||
                journeySet.has(fourTeamAdvanceSpecial.match1A.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y1B + HEADER_H }}>
            <MatchCard
              match={fourTeamAdvanceSpecial.match1B}
              roundTitle={getMatchTitle(fourTeamAdvanceSpecial.match1B)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet ||
                journeySet.has(fourTeamAdvanceSpecial.match1B.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x2, top: y2 + HEADER_H }}>
            <MatchCard
              match={fourTeamAdvanceSpecial.upperFinal}
              roundTitle={getMatchTitle(fourTeamAdvanceSpecial.upperFinal)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet ||
                journeySet.has(fourTeamAdvanceSpecial.upperFinal.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x3, top: yAdvanceUpper }}>
            <AdvancesSlot
              teamName={upperAdvance.name}
              logoUrl={upperAdvance.logoUrl}
              teamId={upperAdvance.teamId}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
            />
          </div>

          <div className="absolute" style={{ left: x1, top: y3 + HEADER_H }}>
            <MatchCard
              match={fourTeamAdvanceSpecial.lowerRound}
              roundTitle={getMatchTitle(fourTeamAdvanceSpecial.lowerRound)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet ||
                journeySet.has(fourTeamAdvanceSpecial.lowerRound.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x2, top: y4 + HEADER_H }}>
            <MatchCard
              match={fourTeamAdvanceSpecial.decider}
              roundTitle={getMatchTitle(fourTeamAdvanceSpecial.decider)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet ||
                journeySet.has(fourTeamAdvanceSpecial.decider.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x3, top: yAdvanceLower }}>
            <AdvancesSlot
              teamName={lowerAdvance.name}
              logoUrl={lowerAdvance.logoUrl}
              teamId={lowerAdvance.teamId}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
            />
          </div>

          <MergeConnector
            fromX={outX1}
            fromYs={[c1A, c1B]}
            toX={inX2}
            toY={c2}
            hasHover={hoveredTeamId !== null}
            activeFrom={[
              isPathActive(
                fourTeamAdvanceSpecial.match1A,
                fourTeamAdvanceSpecial.upperFinal,
              ),
              isPathActive(
                fourTeamAdvanceSpecial.match1B,
                fourTeamAdvanceSpecial.upperFinal,
              ),
            ]}
            activeOutput={
              isPathActive(
                fourTeamAdvanceSpecial.match1A,
                fourTeamAdvanceSpecial.upperFinal,
              ) ||
              isPathActive(
                fourTeamAdvanceSpecial.match1B,
                fourTeamAdvanceSpecial.upperFinal,
              )
            }
          />
          <ElbowConnector
            fromX={outX2}
            fromY={c2}
            toX={inX3}
            toY={c2}
            hasHover={hoveredTeamId !== null}
            active={isAdvanceLineActive(
              upperAdvance.teamId,
              fourTeamAdvanceSpecial.upperFinal.id,
            )}
            activeStroke={upperAdvance.color}
          />
          <ElbowConnector
            fromX={outX1}
            fromY={c3}
            toX={inX2}
            toY={c4}
            hasHover={hoveredTeamId !== null}
            active={isPathActive(
              fourTeamAdvanceSpecial.lowerRound,
              fourTeamAdvanceSpecial.decider,
            )}
          />
          <ElbowConnector
            fromX={outX2}
            fromY={c4}
            toX={inX3}
            toY={c4}
            hasHover={hoveredTeamId !== null}
            active={isAdvanceLineActive(
              lowerAdvance.teamId,
              fourTeamAdvanceSpecial.decider.id,
            )}
            activeStroke={lowerAdvance.color}
          />
        </div>
      </div>,
    );
  }

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

    const c1A = getMatchCardConnectorY(y1A + HEADER_H, ROW_H);
    const c1B = getMatchCardConnectorY(y1B + HEADER_H, ROW_H);
    const c1C = getMatchCardConnectorY(y1C + HEADER_H, ROW_H);
    const c1D = getMatchCardConnectorY(y1D + HEADER_H, ROW_H);
    const c2A = getMatchCardConnectorY(y2A + HEADER_H, ROW_H);
    const c2B = getMatchCardConnectorY(y2B + HEADER_H, ROW_H);
    const c3 = getMatchCardConnectorY(y3 + HEADER_H, ROW_H);
    const c4A = getMatchCardConnectorY(y4A + HEADER_H, ROW_H);
    const c4B = getMatchCardConnectorY(y4B + HEADER_H, ROW_H);
    const c5A = getMatchCardConnectorY(y5A + HEADER_H, ROW_H);
    const c5B = getMatchCardConnectorY(y5B + HEADER_H, ROW_H);
    const c6 = getMatchCardConnectorY(y6 + HEADER_H, ROW_H);
    const c7 = getMatchCardConnectorY(y7 + HEADER_H, ROW_H);
    const c8 = getMatchCardConnectorY(y8 + HEADER_H, ROW_H);

    return withPickemContext(
      <div className="space-y-3">
        <div className="relative" style={{ width: totalW, height: totalH }}>

          <div className="absolute" style={{ left: x1, top: y1A + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r1[0]}
              roundTitle={getMatchTitle(eightTeamSpecial.r1[0])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r1[0].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y1B + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r1[1]}
              roundTitle={getMatchTitle(eightTeamSpecial.r1[1])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r1[1].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y1C + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r1[2]}
              roundTitle={getMatchTitle(eightTeamSpecial.r1[2])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r1[2].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y1D + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r1[3]}
              roundTitle={getMatchTitle(eightTeamSpecial.r1[3])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r1[3].id)
              }
            />
          </div>

          <div className="absolute" style={{ left: x2, top: y2A + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r2[0]}
              roundTitle={getMatchTitle(eightTeamSpecial.r2[0])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r2[0].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x2, top: y2B + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r2[1]}
              roundTitle={getMatchTitle(eightTeamSpecial.r2[1])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r2[1].id)
              }
            />
          </div>

          <div className="absolute" style={{ left: x4, top: y3 + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r3}
              roundTitle={getMatchTitle(eightTeamSpecial.r3)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r3.id)
              }
            />
          </div>

          <div className="absolute" style={{ left: x1, top: y4A + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r4[0]}
              roundTitle={getMatchTitle(eightTeamSpecial.r4[0])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r4[0].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y4B + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r4[1]}
              roundTitle={getMatchTitle(eightTeamSpecial.r4[1])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r4[1].id)
              }
            />
          </div>

          <div className="absolute" style={{ left: x2, top: y5A + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r5[0]}
              roundTitle={getMatchTitle(eightTeamSpecial.r5[0])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r5[0].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x2, top: y5B + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r5[1]}
              roundTitle={getMatchTitle(eightTeamSpecial.r5[1])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r5[1].id)
              }
            />
          </div>

          <div className="absolute" style={{ left: x3, top: y6 + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r6}
              roundTitle={getMatchTitle(eightTeamSpecial.r6)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r6.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x4, top: y7 + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r7}
              roundTitle={getMatchTitle(eightTeamSpecial.r7)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(eightTeamSpecial.r7.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x5, top: y8 + HEADER_H }}>
            <MatchCard
              match={eightTeamSpecial.r8}
              roundTitle={getMatchTitle(eightTeamSpecial.r8)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
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
            hasHover={hoveredTeamId !== null}
            active={isPathActive(
              eightTeamSpecial.r1[0],
              eightTeamSpecial.r2[0],
            )}
          />
          <ElbowConnector
            fromX={x1 + CARD_W}
            fromY={c1B}
            toX={x2}
            toY={c2A}
            hasHover={hoveredTeamId !== null}
            active={isPathActive(
              eightTeamSpecial.r1[1],
              eightTeamSpecial.r2[0],
            )}
          />
          <ElbowConnector
            fromX={x1 + CARD_W}
            fromY={c1C}
            toX={x2}
            toY={c2B}
            hasHover={hoveredTeamId !== null}
            active={isPathActive(
              eightTeamSpecial.r1[2],
              eightTeamSpecial.r2[1],
            )}
          />
          <ElbowConnector
            fromX={x1 + CARD_W}
            fromY={c1D}
            toX={x2}
            toY={c2B}
            hasHover={hoveredTeamId !== null}
            active={isPathActive(
              eightTeamSpecial.r1[3],
              eightTeamSpecial.r2[1],
            )}
          />

          <MergeConnector
            fromX={x2 + CARD_W}
            fromYs={[c2A, c2B]}
            toX={x4}
            toY={c3}
            hasHover={hoveredTeamId !== null}
            activeFrom={[
              isPathActive(
                eightTeamSpecial.r2[0],
                eightTeamSpecial.r3,
              ),
              isPathActive(
                eightTeamSpecial.r2[1],
                eightTeamSpecial.r3,
              ),
            ]}
            activeOutput={
              isPathActive(eightTeamSpecial.r2[0], eightTeamSpecial.r3) ||
              isPathActive(eightTeamSpecial.r2[1], eightTeamSpecial.r3)
            }
          />

          <ElbowConnector
            fromX={x1 + CARD_W}
            fromY={c4A}
            toX={x2}
            toY={c5A}
            hasHover={hoveredTeamId !== null}
            active={isPathActive(
              eightTeamSpecial.r4[0],
              eightTeamSpecial.r5[0],
            )}
          />
          <ElbowConnector
            fromX={x1 + CARD_W}
            fromY={c4B}
            toX={x2}
            toY={c5B}
            hasHover={hoveredTeamId !== null}
            active={isPathActive(
              eightTeamSpecial.r4[1],
              eightTeamSpecial.r5[1],
            )}
          />

          <MergeConnector
            fromX={x2 + CARD_W}
            fromYs={[c5A, c5B]}
            toX={x3}
            toY={c6}
            hasHover={hoveredTeamId !== null}
            activeFrom={[
              isPathActive(
                eightTeamSpecial.r5[0],
                eightTeamSpecial.r6,
              ),
              isPathActive(
                eightTeamSpecial.r5[1],
                eightTeamSpecial.r6,
              ),
            ]}
            activeOutput={
              isPathActive(eightTeamSpecial.r5[0], eightTeamSpecial.r6) ||
              isPathActive(eightTeamSpecial.r5[1], eightTeamSpecial.r6)
            }
          />

          <ElbowConnector
            fromX={x3 + CARD_W}
            fromY={c6}
            toX={x4}
            toY={c7}
            hasHover={hoveredTeamId !== null}
            active={isPathActive(eightTeamSpecial.r6, eightTeamSpecial.r7)}
          />

          <MergeConnector
            fromX={x4 + CARD_W}
            fromYs={[c3, c7]}
            toX={x5}
            toY={c8}
            hasHover={hoveredTeamId !== null}
            activeFrom={[
              isPathActive(eightTeamSpecial.r3, eightTeamSpecial.r8),
              isPathActive(eightTeamSpecial.r7, eightTeamSpecial.r8),
            ]}
            activeOutput={
              isPathActive(eightTeamSpecial.r3, eightTeamSpecial.r8) ||
              isPathActive(eightTeamSpecial.r7, eightTeamSpecial.r8)
            }
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

    const c1A = getMatchCardConnectorY(y1A + HEADER_H, ROW_H);
    const c1B = getMatchCardConnectorY(y1B + HEADER_H, ROW_H);
    const c2A = getMatchCardConnectorY(y2A + HEADER_H, ROW_H);
    const c2B = getMatchCardConnectorY(y2B + HEADER_H, ROW_H);
    const c3 = getMatchCardConnectorY(y3 + HEADER_H, ROW_H);
    const c4A = getMatchCardConnectorY(y4A + HEADER_H, ROW_H);
    const c4B = getMatchCardConnectorY(y4B + HEADER_H, ROW_H);
    const c5 = getMatchCardConnectorY(y5 + HEADER_H, ROW_H);
    const c6 = getMatchCardConnectorY(y6 + HEADER_H, ROW_H);
    const c7 = getMatchCardConnectorY(y7 + HEADER_H, ROW_H);

    return withPickemContext(
      <div className="space-y-3">
        <div className="relative" style={{ width: totalW, height: totalH }}>

          <div className="absolute" style={{ left: x1, top: y1A + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r1[0]}
              roundTitle={getMatchTitle(sixTeamSpecial.r1[0])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(sixTeamSpecial.r1[0].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y1B + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r1[1]}
              roundTitle={getMatchTitle(sixTeamSpecial.r1[1])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(sixTeamSpecial.r1[1].id)
              }
            />
          </div>

          <div className="absolute" style={{ left: x2, top: y2A + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r2[0]}
              roundTitle={getMatchTitle(sixTeamSpecial.r2[0])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(sixTeamSpecial.r2[0].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x2, top: y2B + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r2[1]}
              roundTitle={getMatchTitle(sixTeamSpecial.r2[1])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(sixTeamSpecial.r2[1].id)
              }
            />
          </div>

          <div className="absolute" style={{ left: x4, top: y3 + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r3}
              roundTitle={getMatchTitle(sixTeamSpecial.r3)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={!journeySet || journeySet.has(sixTeamSpecial.r3.id)}
            />
          </div>

          <div className="absolute" style={{ left: x1, top: y4A + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r4[0]}
              roundTitle={getMatchTitle(sixTeamSpecial.r4[0])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(sixTeamSpecial.r4[0].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y4B + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r4[1]}
              roundTitle={getMatchTitle(sixTeamSpecial.r4[1])}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(sixTeamSpecial.r4[1].id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x2, top: y5 + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r5}
              roundTitle={getMatchTitle(sixTeamSpecial.r5)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={!journeySet || journeySet.has(sixTeamSpecial.r5.id)}
            />
          </div>
          <div className="absolute" style={{ left: x4, top: y6 + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r6}
              roundTitle={getMatchTitle(sixTeamSpecial.r6)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={!journeySet || journeySet.has(sixTeamSpecial.r6.id)}
            />
          </div>
          <div className="absolute" style={{ left: x5, top: y7 + HEADER_H }}>
            <MatchCard
              match={sixTeamSpecial.r7}
              roundTitle={getMatchTitle(sixTeamSpecial.r7)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={!journeySet || journeySet.has(sixTeamSpecial.r7.id)}
            />
          </div>

          <ElbowConnector
            fromX={x1 + CARD_W}
            fromY={c1A}
            toX={x2}
            toY={c2A}
            hasHover={hoveredTeamId !== null}
            active={isPathActive(sixTeamSpecial.r1[0], sixTeamSpecial.r2[0])}
          />
          <ElbowConnector
            fromX={x1 + CARD_W}
            fromY={c1B}
            toX={x2}
            toY={c2B}
            hasHover={hoveredTeamId !== null}
            active={isPathActive(sixTeamSpecial.r1[1], sixTeamSpecial.r2[1])}
          />

          <MergeConnector
            fromX={x2 + CARD_W}
            fromYs={[c2A, c2B]}
            toX={x4}
            toY={c3}
            hasHover={hoveredTeamId !== null}
            activeFrom={[
              isPathActive(sixTeamSpecial.r2[0], sixTeamSpecial.r3),
              isPathActive(sixTeamSpecial.r2[1], sixTeamSpecial.r3),
            ]}
            activeOutput={
              isPathActive(sixTeamSpecial.r2[0], sixTeamSpecial.r3) ||
              isPathActive(sixTeamSpecial.r2[1], sixTeamSpecial.r3)
            }
          />

          <MergeConnector
            fromX={x1 + CARD_W}
            fromYs={[c4A, c4B]}
            toX={x2}
            toY={c5}
            hasHover={hoveredTeamId !== null}
            activeFrom={[
              isPathActive(sixTeamSpecial.r4[0], sixTeamSpecial.r5),
              isPathActive(sixTeamSpecial.r4[1], sixTeamSpecial.r5),
            ]}
            activeOutput={
              isPathActive(sixTeamSpecial.r4[0], sixTeamSpecial.r5) ||
              isPathActive(sixTeamSpecial.r4[1], sixTeamSpecial.r5)
            }
          />
          <ElbowConnector
            fromX={x2 + CARD_W}
            fromY={c5}
            toX={x4}
            toY={c6}
            hasHover={hoveredTeamId !== null}
            active={isPathActive(sixTeamSpecial.r5, sixTeamSpecial.r6)}
          />
          <MergeConnector
            fromX={x4 + CARD_W}
            fromYs={[c3, c6]}
            toX={x5}
            toY={c7}
            hasHover={hoveredTeamId !== null}
            activeFrom={[
              isPathActive(sixTeamSpecial.r3, sixTeamSpecial.r7),
              isPathActive(sixTeamSpecial.r6, sixTeamSpecial.r7),
            ]}
            activeOutput={
              isPathActive(sixTeamSpecial.r3, sixTeamSpecial.r7) ||
              isPathActive(sixTeamSpecial.r6, sixTeamSpecial.r7)
            }
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

    const c1A = getMatchCardConnectorY(y1A + HEADER_H, ROW_H);
    const c1B = getMatchCardConnectorY(y1B + HEADER_H, ROW_H);
    const c2 = getMatchCardConnectorY(y2 + HEADER_H, ROW_H);
    const c3 = getMatchCardConnectorY(y3 + HEADER_H, ROW_H);
    const c4 = getMatchCardConnectorY(y4 + HEADER_H, ROW_H);
    const c5 = getMatchCardConnectorY(y5 + HEADER_H, ROW_H);

    return withPickemContext(
      <div className="space-y-3">
        <div className="relative" style={{ width: totalW, height: totalH }}>

          <div className="absolute" style={{ left: x1, top: y1A + HEADER_H }}>
            <MatchCard
              match={fourTeamSpecial.match1A}
              roundTitle={getMatchTitle(fourTeamSpecial.match1A)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(fourTeamSpecial.match1A.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y1B + HEADER_H }}>
            <MatchCard
              match={fourTeamSpecial.match1B}
              roundTitle={getMatchTitle(fourTeamSpecial.match1B)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(fourTeamSpecial.match1B.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x2, top: y2 + HEADER_H }}>
            <MatchCard
              match={fourTeamSpecial.match2}
              roundTitle={getMatchTitle(fourTeamSpecial.match2)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(fourTeamSpecial.match2.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x1, top: y3 + HEADER_H }}>
            <MatchCard
              match={fourTeamSpecial.match3}
              roundTitle={getMatchTitle(fourTeamSpecial.match3)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(fourTeamSpecial.match3.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x2, top: y4 + HEADER_H }}>
            <MatchCard
              match={fourTeamSpecial.match4}
              roundTitle={getMatchTitle(fourTeamSpecial.match4)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
              isInJourney={
                !journeySet || journeySet.has(fourTeamSpecial.match4.id)
              }
            />
          </div>
          <div className="absolute" style={{ left: x5, top: y5 + HEADER_H }}>
            <MatchCard
              match={fourTeamSpecial.match5}
              roundTitle={getMatchTitle(fourTeamSpecial.match5)}
              hoveredTeamId={hoveredTeamId}
              onHoverTeam={setHover}
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
            hasHover={hoveredTeamId !== null}
            active={isPathActive(
              fourTeamSpecial.match1A,
              fourTeamSpecial.match2,
            )}
          />
          <ElbowConnector
            fromX={outX1}
            fromY={c1B}
            toX={inX2}
            toY={c2}
            hasHover={hoveredTeamId !== null}
            active={isPathActive(
              fourTeamSpecial.match1B,
              fourTeamSpecial.match2,
            )}
          />
          <ElbowConnector
            fromX={outX1}
            fromY={c3}
            toX={inX2}
            toY={c4}
            hasHover={hoveredTeamId !== null}
            active={isPathActive(
              fourTeamSpecial.match3,
              fourTeamSpecial.match4,
            )}
          />
          <MergeConnector
            fromX={outX2}
            fromYs={[c2, c4]}
            toX={inX5}
            toY={c5}
            hasHover={hoveredTeamId !== null}
            activeFrom={[
              isPathActive(
                fourTeamSpecial.match2,
                fourTeamSpecial.match5,
              ),
              isPathActive(
                fourTeamSpecial.match4,
                fourTeamSpecial.match5,
              ),
            ]}
            activeOutput={
              isPathActive(fourTeamSpecial.match2, fourTeamSpecial.match5) ||
              isPathActive(fourTeamSpecial.match4, fourTeamSpecial.match5)
            }
          />
        </div>
      </div>,
    );
  }

  if (!layout) {
    return (
      <p className="text-sm text-[#EEEEEE]">KhÄ‚Â´ng thĂ¡Â»Æ’ dĂ¡Â»Â±ng layout bracket.</p>
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

          return (
            <div key={`col-${colIndex}`}>
              {matches.map((match, matchIndex) => (
                <div
                  key={match.id}
                  className="absolute"
                  style={{
                    left: colLeft,
                    top: layout.tops[colIndex][matchIndex],
                  }}
                >
                  <MatchCard
                    match={match}
                    roundTitle={getMatchTitle(match)}
                    hoveredTeamId={hoveredTeamId}
                    onHoverTeam={setHover}
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
                      .map((top) => getMatchCardConnectorY(top, ROW_H));
                    const outY = getMatchCardConnectorY(
                      layout.tops[colIndex + 1][nextIndex],
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
                              layout.columns[colIndex][start + localIndex];
                            const destMatch =
                              layout.columns[colIndex + 1][nextIndex];
                            return isPathActive(sourceMatch, destMatch)
                              ? localIndex
                              : -1;
                          })
                          .filter((index) => index >= 0)}
                        activeOutput={inYs.some((_, localIndex) => {
                          const sourceMatch =
                            layout.columns[colIndex][start + localIndex];
                          const destMatch =
                            layout.columns[colIndex + 1][nextIndex];
                          return isPathActive(sourceMatch, destMatch);
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
    </div>,
  );
};

export default DoubleElimBracket;
