import { createContext, useContext, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  getMatchesByBracketId,
  type Match as ApiMatch,
} from "@/api/tournaments/index";
import { TOURNAMENT_LOGO } from "@/data/tournament";

type SwissBracketProps = {
  bracketId?: number | null;
  selectedTeamByMatchId?: Record<number, number>;
  onPickTeam?: (matchId: number, teamId: number) => void;
  disableMatchLink?: boolean;
  tournamentRegistered?: RegisteredTeam[];
};

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
  centerY: number;
  leftX: number;
  rightX: number;
};

type TeamProgress = {
  id: number;
  name: string;
  logoUrl: string | null;
  wins: number;
  losses: number;
  state: "advanced" | "eliminated" | "pending";
};

const CARD_W = 232;
const ROW_H = 36;
const CARD_H = ROW_H * 2;
const STAGE_TITLE_H = 26;
const STAGE_PAD_X = 12;
const STAGE_PAD_Y = 10;
const MATCH_GAP = 12;
const STAGE_GAP = 24;
const CONNECTOR_W = 54;
const COL_GAP = 42;

const STAGE_W = CARD_W + STAGE_PAD_X * 2;

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
  if (match.winnerTeamId !== null) return match.winnerTeamId;
  if (match.s1 !== null && match.s2 !== null) {
    if (match.s1 > match.s2) return match.teamAId;
    if (match.s2 > match.s1) return match.teamBId;
  }
  return null;
};

const isResolvedSwissMatch = (match: DisplayMatch) => {
  const winner = resolveMatchWinnerTeamId(match);
  if (winner !== null) return true;

  return (
    match.s1 !== null &&
    match.s2 !== null &&
    String(match.status || "").toLowerCase() === "completed"
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
    const winnerTeamId = toNumber(match.winner_team_id);

    const p1 =
      (match as any)?.team_a?.name ?? getTeamLabel(teamAId, teamNameById);
    const p2 =
      (match as any)?.team_b?.name ?? getTeamLabel(teamBId, teamNameById);
    const p1Logo = (match as any)?.team_a?.logo_url ?? null;
    const p2Logo = (match as any)?.team_b?.logo_url ?? null;

    let winner: string | null = null;
    if (winnerTeamId !== null) {
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

const getLayoutForRounds = (roundCount: number) => {
  if (roundCount === 4) {
    return {
      labels: SWISS_LABELS_8,
      layout: SWISS_LAYOUT_8,
      relations: SWISS_RELATIONS_8,
      advanceWins: 2,
      eliminateLosses: 2,
    };
  }

  if (roundCount === 9) {
    return {
      labels: SWISS_LABELS_16,
      layout: SWISS_LAYOUT_16,
      relations: SWISS_RELATIONS_16,
      advanceWins: 3,
      eliminateLosses: 3,
    };
  }

  const labels = Array.from(
    { length: roundCount },
    (_, index) => `R${index + 1}`,
  );
  const layout = labels.map((label) => [label]);
  const fallback = Math.max(1, Math.ceil(Math.log2(Math.max(2, roundCount))));

  return {
    labels,
    layout,
    relations: [] as Array<{ from: string[]; to: string }>,
    advanceWins: fallback,
    eliminateLosses: fallback,
  };
};

const getStageHeight = (matchCount: number) => {
  const cardsHeight =
    matchCount * CARD_H + Math.max(0, matchCount - 1) * MATCH_GAP;
  return STAGE_TITLE_H + STAGE_PAD_Y * 2 + cardsHeight;
};

const StageConnectorSingle = ({
  x1,
  x2,
  y1,
  y2,
  hasHover,
  active,
}: {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  hasHover: boolean;
  active: boolean;
}) => {
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const width = x2 - x1;
  const height = bottom - top + 2;
  const bendX = Math.max(8, Math.min(width - 8, Math.floor(width * 0.45)));
  const nY1 = y1 - top + 1;
  const nY2 = y2 - top + 1;

  return (
    <svg
      width={width}
      height={height}
      className="absolute"
      style={{ left: x1, top }}
    >
      <polyline
        points={`0,${nY1} ${bendX},${nY1} ${bendX},${nY2} ${width},${nY2}`}
        stroke="white"
        strokeOpacity={hasHover ? 0.28 : 1}
        strokeWidth={2}
        fill="none"
        strokeLinejoin="miter"
      />
      {active ? (
        <polyline
          points={`0,${nY1} ${bendX},${nY1} ${bendX},${nY2} ${width},${nY2}`}
          stroke="hsl(var(--primary))"
          strokeWidth={3}
          fill="none"
          strokeLinejoin="miter"
        />
      ) : null}
    </svg>
  );
};

const StageConnectorMerge = ({
  x1,
  x2,
  yTop,
  yBottom,
  yOut,
  hasHover,
  activeInputIndexes,
  activeOutput,
}: {
  x1: number;
  x2: number;
  yTop: number;
  yBottom: number;
  yOut: number;
  hasHover: boolean;
  activeInputIndexes: number[];
  activeOutput: boolean;
}) => {
  const top = Math.min(yTop, yBottom, yOut);
  const bottom = Math.max(yTop, yBottom, yOut);
  const width = x2 - x1;
  const height = bottom - top + 2;
  const joinX = Math.floor(width * 0.35);
  const bendX = Math.max(joinX + 8, Math.floor(width * 0.7));
  const outX = width;

  const nTop = yTop - top + 1;
  const nBottom = yBottom - top + 1;
  const nOut = yOut - top + 1;
  const nJoin = (nTop + nBottom) / 2;
  const sourceYs = [nTop, nBottom];
  const activeYs = activeInputIndexes
    .filter((index) => index >= 0 && index < sourceYs.length)
    .map((index) => sourceYs[index]);

  return (
    <svg
      width={width}
      height={height}
      className="absolute"
      style={{ left: x1, top }}
    >
      <line
        x1={0}
        y1={nTop}
        x2={joinX}
        y2={nTop}
        stroke="white"
        strokeOpacity={hasHover ? 0.28 : 1}
        strokeWidth={2}
      />
      <line
        x1={0}
        y1={nBottom}
        x2={joinX}
        y2={nBottom}
        stroke="white"
        strokeOpacity={hasHover ? 0.28 : 1}
        strokeWidth={2}
      />
      <line
        x1={joinX}
        y1={Math.min(nTop, nBottom)}
        x2={joinX}
        y2={Math.max(nTop, nBottom)}
        stroke="white"
        strokeOpacity={hasHover ? 0.28 : 1}
        strokeWidth={2}
      />
      <polyline
        points={`${joinX},${nJoin} ${bendX},${nJoin} ${bendX},${nOut} ${outX},${nOut}`}
        stroke="white"
        strokeOpacity={hasHover ? 0.28 : 1}
        strokeWidth={2}
        fill="none"
        strokeLinejoin="miter"
      />
      {activeOutput && activeYs.length ? (
        <>
          {activeYs.map((y, index) => (
            <line
              key={`active-merge-in-${index}`}
              x1={0}
              y1={y}
              x2={joinX}
              y2={y}
              stroke="hsl(var(--primary))"
              strokeWidth={3}
            />
          ))}
          <line
            x1={joinX}
            y1={Math.min(nOut, ...activeYs)}
            x2={joinX}
            y2={Math.max(nOut, ...activeYs)}
            stroke="hsl(var(--primary))"
            strokeWidth={3}
          />
          <polyline
            points={`${joinX},${nOut} ${bendX},${nOut} ${bendX},${nOut} ${outX},${nOut}`}
            stroke="hsl(var(--primary))"
            strokeWidth={3}
            fill="none"
            strokeLinejoin="miter"
          />
        </>
      ) : null}
    </svg>
  );
};

const PlayerRow = ({
  teamId,
  logoUrl,
  name,
  score,
  isWinner,
  isSelected,
  isHoveredTeam,
  hasHover,
  isTop,
  onPick,
  onHoverTeam,
}: {
  teamId: number | null;
  logoUrl?: string | null;
  name: string;
  score: number | null;
  isWinner: boolean;
  isSelected?: boolean;
  isHoveredTeam: boolean;
  hasHover: boolean;
  isTop?: boolean;
  onPick?: (teamId: number) => void;
  onHoverTeam: (teamId: number | null) => void;
}) => {
  const canPick =
    typeof onPick === "function" && Number.isFinite(Number(teamId));

  const bg = hasHover
    ? isHoveredTeam
      ? "bg-primary text-primary-foreground"
      : "bg-card"
    : isSelected
      ? "bg-primary/25"
      : isWinner
        ? "bg-primary/20"
        : "bg-card";

  const textClass = hasHover
    ? isHoveredTeam
      ? "font-bold"
      : "text-muted-foreground"
    : isWinner
      ? "font-semibold"
      : "";

  return (
    <div
      className={`flex items-center justify-between px-3 transition-colors duration-150 ${canPick ? "cursor-pointer" : "cursor-default"} ${bg} ${textClass} ${isSelected ? "ring-1 ring-primary/60" : ""} ${isTop ? "border-b border-border/40" : ""}`}
      style={{ height: ROW_H }}
      onMouseEnter={() => onHoverTeam(teamId)}
      onMouseLeave={() => onHoverTeam(null)}
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
        {score ?? "-"}
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
  onHoverTeam: (teamId: number | null) => void;
  isInJourney: boolean;
}) => {
  const { selectedTeamByMatchId, onPickTeam, disableMatchLink } =
    useContext(PickemContext);
  const hasHover = hoveredTeamId !== null;
  const faded = hasHover && !isInJourney;
  const { game, slug } = useParams();
  const matchParam = match.routeMatchId ? String(match.routeMatchId) : null;
  const selectedTeamId = selectedTeamByMatchId?.[match.routeMatchId];

  const handlePick = (teamId: number) => {
    if (!onPickTeam) return;
    onPickTeam(match.routeMatchId, teamId);
  };

  const canPick = Boolean(onPickTeam && match.routeMatchId > 0);

  const content = (
    <>
      <PlayerRow
        teamId={match.teamAId}
        logoUrl={match.p1Logo}
        name={match.p1}
        score={match.s1}
        isWinner={match.winner === match.p1}
        isSelected={selectedTeamId === match.teamAId}
        isHoveredTeam={hoveredTeamId === match.teamAId}
        hasHover={hasHover}
        isTop
        onPick={canPick ? handlePick : undefined}
        onHoverTeam={onHoverTeam}
      />
      <PlayerRow
        teamId={match.teamBId}
        logoUrl={match.p2Logo}
        name={match.p2}
        score={match.s2}
        isWinner={match.winner === match.p2}
        isSelected={selectedTeamId === match.teamBId}
        isHoveredTeam={hoveredTeamId === match.teamBId}
        hasHover={hasHover}
        onPick={canPick ? handlePick : undefined}
        onHoverTeam={onHoverTeam}
      />
    </>
  );

  if (disableMatchLink || canPick) {
    return (
      <div
        className={`block neo-box-sm overflow-hidden transition-all ${faded ? "opacity-40" : "opacity-100"}`}
        style={{ width: CARD_W, height: CARD_H }}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      to={`/tournament/${game ?? ""}/${slug ?? ""}/match/${matchParam}`}
      className={`block neo-box-sm overflow-hidden hover:ring-1 hover:ring-primary/50 transition-all ${faded ? "opacity-40" : "opacity-100"}`}
      style={{ width: CARD_W, height: CARD_H }}
    >
      {content}
    </Link>
  );
};

const TeamListCard = ({
  title,
  teams,
  tone,
  hoveredTeamId,
  onHoverTeam,
}: {
  title: string;
  teams: TeamProgress[];
  tone: "advanced" | "eliminated";
  hoveredTeamId: number | null;
  onHoverTeam: (teamId: number | null) => void;
}) => {
  const toneClass =
    tone === "advanced"
      ? "text-emerald-300 border-emerald-400/30"
      : "text-rose-300 border-rose-400/30";

  const hasHover = hoveredTeamId !== null;

  return (
    <div
      className={`neo-box-sm bg-card/50 border ${toneClass} p-3 flex flex-col w-full`}
    >
      <p className="text-sm font-bold uppercase tracking-wide mb-2">
        {title} ({teams.length})
      </p>
      <div className="space-y-1.5 flex-1 min-h-0 overflow-auto pr-1">
        {teams.length ? (
          teams.map((team) => (
            <div
              key={`${title}-${team.id}`}
              className={`flex items-center justify-between text-xs rounded-sm px-1 py-0.5 transition-colors duration-150 cursor-default ${hasHover ? (hoveredTeamId === team.id ? "bg-primary/20" : "opacity-50") : ""}`}
              onMouseEnter={() => onHoverTeam(team.id)}
              onMouseLeave={() => onHoverTeam(null)}
            >
              <span className="flex items-center gap-2 min-w-0">
                <img
                  src={team.logoUrl || TOURNAMENT_LOGO}
                  alt=""
                  className="w-4 h-4 rounded-sm"
                />
                <span className="truncate">{team.name}</span>
              </span>
              <span className="font-semibold ml-2 whitespace-nowrap">
                {team.wins}-{team.losses}
              </span>
            </div>
          ))
        ) : (
          <p className="text-xstext-[#EEEEEE]">Chưa có đội.</p>
        )}
      </div>
    </div>
  );
};

const SwissBracket = ({
  bracketId,
  selectedTeamByMatchId,
  onPickTeam,
  disableMatchLink,
  tournamentRegistered,
}: SwissBracketProps) => {
  const outletContext = useOutletContext<BracketOutletContext | undefined>();
  const tournament = outletContext?.tournament;
  const [hoveredTeamId, setHoveredTeamId] = useState<number | null>(null);

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

  const rounds = useMemo(
    () =>
      Array.from(new Set(displayMatches.map((match) => match.round))).sort(
        (a, b) => a - b,
      ),
    [displayMatches],
  );

  const { labels, layout, relations, advanceWins, eliminateLosses } = useMemo(
    () => getLayoutForRounds(rounds.length),
    [rounds.length],
  );

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
    const columnHeights = layout.map((column) => {
      const stageHeights = column.reduce((sum, label) => {
        const matches = stageMatches.get(label) ?? [];
        return sum + getStageHeight(Math.max(1, matches.length));
      }, 0);
      return stageHeights + Math.max(0, column.length - 1) * STAGE_GAP;
    });

    const contentHeight = Math.max(0, ...columnHeights);
    const colStride = STAGE_W + CONNECTOR_W + COL_GAP;

    layout.forEach((column, colIndex) => {
      const columnTop = (contentHeight - columnHeights[colIndex]) / 2;
      const x = colIndex * colStride;
      let cursorY = columnTop;

      column.forEach((label) => {
        const matches = stageMatches.get(label) ?? [];
        const stageHeight = getStageHeight(Math.max(1, matches.length));

        stageMetrics.set(label, {
          x,
          y: cursorY,
          width: STAGE_W,
          height: stageHeight,
          centerY: cursorY + stageHeight / 2,
          leftX: x,
          rightX: x + STAGE_W,
        });

        cursorY += stageHeight + STAGE_GAP;
      });
    });

    const contentWidth =
      layout.length * STAGE_W +
      Math.max(0, layout.length - 1) * (CONNECTOR_W + COL_GAP);

    return {
      stageMetrics,
      contentHeight,
      contentWidth,
    };
  }, [layout, stageMatches]);

  const connectors = useMemo(() => {
    return relations
      .map((relation) => {
        const target = layoutInfo.stageMetrics.get(relation.to);
        const sources = relation.from
          .map((label) => ({
            label,
            metrics: layoutInfo.stageMetrics.get(label),
          }))
          .filter((entry) => Boolean(entry.metrics)) as Array<{
          label: string;
          metrics: StageMetrics;
        }>;

        if (!target || !sources.length) return null;

        if (sources.length === 1) {
          const source = sources[0];
          return {
            key: `single-${relation.from.join("-")}-${relation.to}`,
            type: "single" as const,
            fromLabel: source.label,
            toLabel: relation.to,
            x1: source.metrics.rightX,
            x2: target.leftX,
            y1: source.metrics.centerY,
            y2: target.centerY,
          };
        }

        if (sources.length >= 2) {
          const sortedSources = [...sources].sort(
            (a, b) => a.metrics.centerY - b.metrics.centerY,
          );
          return {
            key: `merge-${relation.from.join("-")}-${relation.to}`,
            type: "merge" as const,
            sourceLabels: sortedSources.map((source) => source.label),
            toLabel: relation.to,
            x1: sortedSources[0].metrics.rightX,
            x2: target.leftX,
            yTop: sortedSources[0].metrics.centerY,
            yBottom: sortedSources[sortedSources.length - 1].metrics.centerY,
            yOut: target.centerY,
          };
        }

        return null;
      })
      .filter(Boolean) as Array<
      | {
          key: string;
          type: "single";
          fromLabel: string;
          toLabel: string;
          x1: number;
          x2: number;
          y1: number;
          y2: number;
        }
      | {
          key: string;
          type: "merge";
          sourceLabels: string[];
          toLabel: string;
          x1: number;
          x2: number;
          yTop: number;
          yBottom: number;
          yOut: number;
        }
    >;
  }, [relations, layoutInfo]);

  const journeyMatchIds = useMemo(() => {
    if (hoveredTeamId === null) return null;

    return new Set(
      displayMatches
        .filter(
          (match) =>
            match.teamAId === hoveredTeamId || match.teamBId === hoveredTeamId,
        )
        .map((match) => match.id),
    );
  }, [displayMatches, hoveredTeamId]);

  const journeyStageLabels = useMemo(() => {
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
      if (!match.teamAId || !match.teamBId) continue;

      const winnerTeamId = resolveMatchWinnerTeamId(match);
      if (!winnerTeamId) continue;

      const loserTeamId =
        winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;

      const winner = teamMap.get(winnerTeamId);
      const loser = teamMap.get(loserTeamId);

      if (winner) winner.wins += 1;
      if (loser) loser.losses += 1;
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
        onPickTeam,
        disableMatchLink,
      }}
    >
      <div className="w-full overflow-x-auto">
        <div className="flex items-start gap-4 min-w-max">
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

              const matches = stageMatches.get(label) ?? [];
              const renderMatches = matches.length
                ? matches
                : [
                    {
                      id: -1,
                      routeMatchId: -1,
                      round: 0,
                      matchNo: 0,
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
                    } as DisplayMatch,
                  ];

              return (
                <div
                  key={label}
                  className="absolute neo-box-sm bg-card/50 border border-border/60"
                  style={{
                    left: metrics.x,
                    top: metrics.y,
                    width: STAGE_W,
                    height: metrics.height,
                    padding: `${STAGE_PAD_Y}px ${STAGE_PAD_X}px`,
                  }}
                >
                  <div className="h-6 flex items-center justify-center text-xs font-bold tracking-wider uppercase text-primary">
                    {label}
                  </div>

                  <div className="space-y-3">
                    {renderMatches.map((match) =>
                      match.routeMatchId > 0 ? (
                        <MatchCard
                          key={match.id}
                          match={match}
                          hoveredTeamId={hoveredTeamId}
                          onHoverTeam={setHoveredTeamId}
                          isInJourney={
                            !journeyMatchIds || journeyMatchIds.has(match.id)
                          }
                        />
                      ) : (
                        <div
                          key={`${label}-placeholder`}
                          className="neo-box-sm bg-card/40"
                          style={{ width: CARD_W, height: CARD_H }}
                        />
                      ),
                    )}
                  </div>
                </div>
              );
            })}

            {connectors.map((connector) =>
              connector.type === "single" ? (
                <StageConnectorSingle
                  key={connector.key}
                  x1={connector.x1}
                  x2={connector.x2}
                  y1={connector.y1}
                  y2={connector.y2}
                  hasHover={hoveredTeamId !== null}
                  active={Boolean(
                    journeyStageLabels &&
                    journeyStageLabels.has(connector.fromLabel) &&
                    journeyStageLabels.has(connector.toLabel),
                  )}
                />
              ) : (
                <StageConnectorMerge
                  key={connector.key}
                  x1={connector.x1}
                  x2={connector.x2}
                  yTop={connector.yTop}
                  yBottom={connector.yBottom}
                  yOut={connector.yOut}
                  hasHover={hoveredTeamId !== null}
                  activeInputIndexes={
                    journeyStageLabels
                      ? connector.sourceLabels
                          .map((label, index) =>
                            journeyStageLabels.has(label) ? index : -1,
                          )
                          .filter((index) => index !== -1)
                      : []
                  }
                  activeOutput={Boolean(
                    journeyStageLabels &&
                    connector.sourceLabels.some((label) =>
                      journeyStageLabels.has(label),
                    ) &&
                    journeyStageLabels.has(connector.toLabel),
                  )}
                />
              ),
            )}
          </div>

          <div
            className="shrink-0 flex flex-col items-start justify-center"
            style={{
              width: STAGE_W,
              height: layoutInfo.contentHeight,
              gap: STAGE_GAP,
            }}
          >
            <div className="min-h-0 w-full">
              <TeamListCard
                title="Đi tiếp"
                teams={teamProgress.advanced}
                tone="advanced"
                hoveredTeamId={hoveredTeamId}
                onHoverTeam={setHoveredTeamId}
              />
            </div>
            <div className="min-h-0 w-full">
              <TeamListCard
                title="Bị loại"
                teams={teamProgress.eliminated}
                tone="eliminated"
                hoveredTeamId={hoveredTeamId}
                onHoverTeam={setHoveredTeamId}
              />
            </div>
          </div>
        </div>
      </div>
    </PickemContext.Provider>
  );
};

export default SwissBracket;
