import { createContext, useContext, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
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
  BRACKET_ROW_SPLIT_CLASS,
  BRACKET_SCORE_CELL_CLASS,
  formatBracketSideScore,
  getBracketMatchCardHeight,
  getBracketRowStateClass,
  getSwissColumnRoundTitle,
  isBracketMatchCompletedStatus,
  isBanPickOpenStatus,
} from "@/components/bracketTheme";
import { BracketMatchCardShell } from "@/components/BracketMatchCardShell";
import { MatchResultTrigger } from "@/components/MatchPanel";
import MobileBracket from "@/components/MobileBracket";
import { useIsMobile } from "@/hooks/use-mobile";

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
  dateScheduled?: string | null;
  /** Phòng ban/pick đang mở (chờ / đang chạy). */
  banPickOpen?: boolean;
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

const CARD_W = 252;
const ROW_H = 42;
const CARD_H = getBracketMatchCardHeight(ROW_H);
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
  if (!isBracketMatchCompletedStatus(match.status)) return null;
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

  if (!isBracketMatchCompletedStatus(match.status)) return false;

  const winner = resolveMatchWinnerTeamId(match);
  if (winner !== null) return true;

  return match.s1 !== null && match.s2 !== null;
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
    if (isBracketMatchCompletedStatus(match.status)) {
      if (winnerTeamId) {
        if (toNumber((match as any)?.team_a?.id) === winnerTeamId) winner = p1;
        else if (toNumber((match as any)?.team_b?.id) === winnerTeamId)
          winner = p2;
        else winner = getTeamLabel(winnerTeamId, teamNameById);
      } else if (scoreA !== null && scoreB !== null) {
        if (scoreA > scoreB) winner = p1;
        if (scoreB > scoreA) winner = p2;
      }
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
      dateScheduled: match.date_scheduled ?? null,
      banPickOpen: isBanPickOpenStatus(match.ban_pick_status),
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
  dateScheduled: null,
});

const PlayerRow = ({
  teamId,
  logoUrl,
  name,
  score,
  otherScore,
  isWinner,
  isLoser = false,
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
  isLoser?: boolean;
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

  const isTbd = !isHoverableTeamId(teamId);
  const stateToneCls = getBracketRowStateClass({
    isHoveredTeam,
    pickState,
    isWinner,
    isLoser,
    isTbd,
  });

  const hoverCls = bracketRowHoverClass(hasHover, isHoveredTeam);
  const scoreToneCls =
    pickState || isHoveredTeam
      ? ""
      : isWinner
        ? "text-[#F2F0EB]"
        : "text-[#9A9893]";

  return (
    <div
      className={`${BRACKET_ROW_SPLIT_CLASS} ${canPick ? "cursor-pointer" : "cursor-default"} ${stateToneCls} ${hoverCls}`}
      // Chia đều chiều cao hộp: tâm giữa 2 hàng khớp đường nối
      style={{ flex: "1 1 0" }}
      onClick={() => {
        if (!canPick || !teamId) return;
        onPick(teamId);
      }}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm">
        {isTbd ? null : <BracketTeamIcon teamId={teamId} logoUrl={logoUrl} name={name} />}
        <span className="min-w-0 truncate">{name}</span>
      </span>
      <span className={`${BRACKET_SCORE_CELL_CLASS} ${scoreToneCls}`}>
        {isTbd ? "" : formatBracketSideScore(score, otherScore)}
      </span>
    </div>
  );
};

const MatchCard = ({
  match,
  hoveredTeamId,
  onHoverTeam,
  isInJourney,
  fluid = false,
}: {
  match: DisplayMatch;
  hoveredTeamId: number | null;
  onHoverTeam: (hover: BracketHover | null) => void;
  isInJourney: boolean;
  /** Mobile: thẻ giãn hết chiều ngang. */
  fluid?: boolean;
}) => {
  const {
    selectedTeamByMatchId,
    pickStatusByMatchId,
    onPickTeam,
    disableMatchLink,
  } = useContext(PickemContext);
  const hasHover = hoveredTeamId !== null;
  const cardHoverCls = bracketCardHoverClass(hasHover, isInJourney);
  const realMatchId = toNumber(match.routeMatchId);
  const selectedTeamId = realMatchId
    ? selectedTeamByMatchId?.[realMatchId]
    : null;
  const pickStatus = realMatchId
    ? pickStatusByMatchId?.[realMatchId]
    : undefined;
  const isMatchCompleted = isBracketMatchCompletedStatus(match.status);
  const officialWinnerTeamId = isMatchCompleted
    ? pickStatus?.winnerTeamId ??
      match.winnerTeamId ??
      (match.s1 !== null && match.s2 !== null
        ? match.s1 > match.s2
          ? match.teamAId
          : match.s2 > match.s1
            ? match.teamBId
            : null
        : null)
    : null;

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

  const content = (
    <>
      <PlayerRow
        teamId={match.teamAId}
        logoUrl={match.p1Logo}
        name={match.p1}
        score={match.s1}
        otherScore={match.s2}
        isWinner={isMatchCompleted && match.winner === match.p1}
        isLoser={isMatchCompleted && Boolean(match.winner) && match.winner !== match.p1}
        isSelected={selectedTeamId === match.teamAId}
        pickState={resolvePickState(match.teamAId)}
        isHoveredTeam={hoveredTeamId !== null && hoveredTeamId === match.teamAId}
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
        isWinner={isMatchCompleted && match.winner === match.p2}
        isLoser={isMatchCompleted && Boolean(match.winner) && match.winner !== match.p2}
        isSelected={selectedTeamId === match.teamBId}
        pickState={resolvePickState(match.teamBId)}
        isHoveredTeam={hoveredTeamId !== null && hoveredTeamId === match.teamBId}
        hasHover={hasHover}
        onPick={canPick ? handlePick : undefined}
        onHoverTeam={onHoverTeam}
        matchId={match.id}
        matchRound={match.round}
      />
    </>
  );

  const title = `Trận #${match.matchNo || match.id}`;

  if (disableMatchLink || canPick || !isMatchCompleted || !realMatchId) {
    return (
      <BracketMatchCardShell
        banPickMatchId={match.banPickOpen && !disableMatchLink ? realMatchId : null}
        title={title}
        status={match.status}
        dateScheduled={match.dateScheduled}
        className={`transition-all ${cardHoverCls}`}
        style={{ width: fluid ? "100%" : CARD_W, height: CARD_H }}
      >
        {content}
      </BracketMatchCardShell>
    );
  }

  return (
    <MatchResultTrigger
      matchId={realMatchId}
      ariaLabel={`Xem kết quả ${match.p1} – ${match.p2}`}
      className={cardHoverCls}
      style={{ width: fluid ? "100%" : CARD_W }}
    >
      <BracketMatchCardShell
        title={title}
        status={match.status}
        dateScheduled={match.dateScheduled}
        isClickable
        style={{ width: fluid ? "100%" : CARD_W, height: CARD_H }}
      >
        {content}
      </BracketMatchCardShell>
    </MatchResultTrigger>
  );
};

/** Cột "Lọt vào" / "Bị loại": tiêu đề kẻ trên, mỗi đội 1 hàng kèm thành tích, ô trống nét đứt. */
const TeamListCard = ({
  title,
  teams,
  slotCount,
  hoveredTeamId,
  onHoverTeam,
}: {
  title: string;
  teams: TeamProgress[];
  slotCount?: number;
  hoveredTeamId: number | null;
  onHoverTeam: (hover: BracketHover | null) => void;
  teamMaxRoundById?: Map<number, number>;
}) => {
  const hasHover = hoveredTeamId !== null;
  const total = slotCount ? Math.max(slotCount, teams.length) : teams.length;
  const tbdCount = Math.max(0, total - teams.length);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 border-t-2 border-[#F2F0EB] pt-1.5">
        <h3 className="m-0 text-[15px] font-extrabold">{title}</h3>
        {total ? (
          <span className="text-[13px] tabular-nums text-[#9A9893]">
            {teams.length}/{total}
          </span>
        ) : null}
      </div>
      <ol className="m-0 mt-1 list-none p-0">
        {teams.map((team) => (
          <li
            key={`${title}-${team.id}`}
            onMouseEnter={() => onHoverTeam({ teamId: team.id } as BracketHover)}
            onMouseLeave={() => onHoverTeam(null)}
            className={`flex min-h-10 items-center gap-2.5 border-b border-[#2C2B29] transition-opacity ${
              hasHover && hoveredTeamId !== team.id ? "opacity-40" : ""
            }`}
          >
            <BracketTeamIcon teamId={team.id} logoUrl={team.logoUrl} name={team.name} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{team.name}</span>
            <span className="shrink-0 text-[13px] tabular-nums text-[#9A9893]">
              {team.wins}–{team.losses}
            </span>
          </li>
        ))}
        {Array.from({ length: tbdCount }, (_, index) => (
          <li
            key={`${title}-tbd-${index}`}
            className="flex min-h-10 items-center border-b border-dashed border-[#2C2B29] text-sm text-[#8C8A85]"
          >
            —
          </li>
        ))}
      </ol>
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
  const isMobile = useIsMobile();
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
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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

  if (isMobile) {
    const mobileRounds = layout.map((column, colIndex) => ({
      key: `c${colIndex}`,
      title: getSwissColumnRoundTitle(colIndex),
      groups: column.map((label) => ({
        key: label,
        label: /^\d+-\d+$/.test(label) ? `Nhóm ${label.replace("-", "–")}` : label,
        matches: stageMatches.get(label) ?? [],
      })),
    }));
    return (
      <PickemContext.Provider
        value={{
          selectedTeamByMatchId,
          pickStatusByMatchId,
          onPickTeam,
          disableMatchLink,
        }}
      >
        <MobileBracket
          rounds={mobileRounds}
          getMatchKey={(match) => match.id}
          isMatchDone={(match) => isBracketMatchCompletedStatus(match.status)}
          renderMatch={(match) => (
            <MatchCard match={match} hoveredTeamId={null} onHoverTeam={() => {}} isInJourney fluid />
          )}
          footer={
            <div className="grid gap-6">
              <TeamListCard
                title="Lọt vào"
                teams={teamProgress.advanced}
                slotCount={outcomeSlotCount}
                hoveredTeamId={null}
                onHoverTeam={() => {}}
                teamMaxRoundById={teamMaxRoundById}
              />
              <TeamListCard
                title="Bị loại"
                teams={teamProgress.eliminated}
                slotCount={outcomeSlotCount}
                hoveredTeamId={null}
                onHoverTeam={() => {}}
                teamMaxRoundById={teamMaxRoundById}
              />
            </div>
          }
        />
      </PickemContext.Provider>
    );
  }

  /** "Thứ Năm, 9/10" — ngày sớm nhất trong vòng. */
  const formatRoundDate = (matches: DisplayMatch[]) => {
    const times = matches
      .map((match) => new Date(String(match.dateScheduled ?? "")).getTime())
      .filter((time) => Number.isFinite(time));
    if (!times.length) return null;
    const date = new Date(Math.min(...times));
    const weekday = date.toLocaleDateString("vi-VN", { weekday: "long" });
    return `${weekday.charAt(0).toLocaleUpperCase("vi-VN")}${weekday.slice(1)}, ${date.getDate()}/${date.getMonth() + 1}`;
  };

  /** Nhóm quyết định: thắng là lọt vào / thua là bị loại. */
  const poolStakes = (label: string) => {
    const parsed = /^(\d+)-(\d+)$/.exec(label);
    if (!parsed) return null;
    const wins = Number(parsed[1]);
    const losses = Number(parsed[2]);
    const canAdvance = wins === advanceWins - 1;
    const canBeOut = losses === eliminateLosses - 1;
    if (!canAdvance && !canBeOut) return null;
    return (
      <span className="text-[#9A9893]">
        {canAdvance ? (
          <>
            Thắng → <span className="font-bold text-[#F2F0EB]">lọt vào</span>
          </>
        ) : null}
        {canAdvance && canBeOut ? " · " : null}
        {canBeOut ? (
          <>
            Thua → <span className="font-bold text-[#FF4A3D]">bị loại</span>
          </>
        ) : null}
      </span>
    );
  };

  return (
    <PickemContext.Provider
      value={{
        selectedTeamByMatchId,
        pickStatusByMatchId,
        onPickTeam,
        disableMatchLink,
      }}
    >
      <div className="flex min-w-max items-start" style={{ gap: COL_GAP }}>
        {layout.map((column, colIndex) => {
          const columnMatches = column.flatMap((label) => stageMatches.get(label) ?? []);
          const roundDate = formatRoundDate(columnMatches);

          return (
            <section key={`col-${colIndex}`} className="shrink-0" style={{ width: CARD_W }}>
              <div className="border-t-2 border-[#F2F0EB] pt-1.5">
                <div className="text-[13px] font-bold">{getSwissColumnRoundTitle(colIndex)}</div>
                <div className="text-[13px] text-[#9A9893]">{roundDate ?? "Chưa có lịch"}</div>
              </div>

              <div className="mt-4 grid" style={{ gap: STAGE_GAP }}>
                {column.map((label) => {
                  const matches = stageMatches.get(label) ?? [];
                  const expectedCount =
                    expectedMatchesByLabel?.[label] ?? Math.max(1, matches.length);
                  const placeholderCount = Math.max(0, expectedCount - matches.length);
                  const dimmed =
                    hoveredTeamId !== null && teamStageLabels !== null && !teamStageLabels.has(label);
                  const isRecord = /^\d+-\d+$/.test(label);

                  return (
                    <div
                      key={label}
                      className={`transition-opacity duration-150 ${dimmed ? "opacity-30" : ""}`}
                    >
                      <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-[#2C2B29] pb-1.5 text-xs">
                        <span className="text-sm font-extrabold tabular-nums">
                          {isRecord ? label.replace("-", "–") : label}
                        </span>
                        {poolStakes(label)}
                      </div>
                      <div className="grid" style={{ gap: MATCH_GAP }}>
                        {matches.map((match) => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            hoveredTeamId={hoveredTeamId}
                            onHoverTeam={setHover}
                            isInJourney
                          />
                        ))}
                        {Array.from({ length: placeholderCount }, (_, index) => (
                          <div
                            key={`${label}-placeholder-${index}`}
                            className="flex items-center justify-center border border-dashed border-[#2C2B29] text-xs text-[#8C8A85]"
                            style={{ width: CARD_W, height: CARD_H }}
                          >
                            Chờ xếp cặp
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        <aside
          className="grid shrink-0 gap-8"
          style={{ width: CARD_W, marginLeft: SIDE_COL_GAP - COL_GAP }}
        >
          <TeamListCard
            title="Lọt vào"
            teams={teamProgress.advanced}
            slotCount={outcomeSlotCount}
            hoveredTeamId={hoveredTeamId}
            onHoverTeam={setHover}
          />
          <TeamListCard
            title="Bị loại"
            teams={teamProgress.eliminated}
            slotCount={outcomeSlotCount}
            hoveredTeamId={hoveredTeamId}
            onHoverTeam={setHover}
          />
        </aside>
      </div>
    </PickemContext.Provider>
  );
};

export default SwissBracket;
