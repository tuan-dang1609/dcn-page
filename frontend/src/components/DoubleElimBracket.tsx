import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext } from "react-router-dom";
import {
  getMatchesByBracketId,
  type Match as ApiMatch,
} from "@/api/tournaments/index";
import { TOURNAMENT_LOGO } from "@/data/tournament";
import { getMockDoubleElimMatches } from "@/components/double-elim/mockApi";
import { getDoubleElimRoundTitle } from "@/components/double-elim/roundLabels";

type DoubleElimBracketProps = {
  bracketId?: number | null;
};

type BracketOutletContext = {
  tournament?: {
    registered?: Array<{
      id?: number | string;
      team_id?: number | string;
      name?: string;
      short_name?: string;
      logo_url?: string;
    }>;
  };
};

type DisplayMatch = {
  id: number;
  routeMatchId?: number;
  round: number;
  matchNo: number;
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

const ModeButtons = ({
  mockMode,
  setMockMode,
}: {
  mockMode: "off" | "6" | "8";
  setMockMode: (mode: "off" | "6" | "8") => void;
}) => {
  const buttonClass = (active: boolean) =>
    `px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
      active
        ? "bg-primary text-primary-foreground neo-box-sm"
        : "bg-muted text-muted-foreground hover:bg-muted/80"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => setMockMode("off")}
        className={buttonClass(mockMode === "off")}
      >
        Dữ liệu thật
      </button>
      <button
        onClick={() => setMockMode("6")}
        className={buttonClass(mockMode === "6")}
      >
        Mock 6 đội
      </button>
      <button
        onClick={() => setMockMode("8")}
        className={buttonClass(mockMode === "8")}
      >
        Mock 8 đội
      </button>
    </div>
  );
};

const PlayerRow = ({
  logoUrl,
  name,
  score,
  isWinner,
  isHoveredPlayer,
  hasHover,
  isTop,
  onHover,
}: {
  logoUrl?: string | null;
  name: string;
  score: number | null;
  isWinner: boolean;
  isHoveredPlayer: boolean;
  hasHover: boolean;
  isTop?: boolean;
  onHover: (player: string | null) => void;
}) => {
  const bg = hasHover
    ? isHoveredPlayer
      ? "bg-primary text-primary-foreground"
      : "bg-card"
    : isWinner
      ? "bg-primary/20"
      : "bg-card";

  const textCls = hasHover
    ? isHoveredPlayer
      ? "font-bold"
      : "text-muted-foreground"
    : isWinner
      ? "font-semibold"
      : "";

  return (
    <div
      className={`flex items-center justify-between px-3 transition-colors duration-150 cursor-default ${bg} ${textCls} ${isTop ? "border-b border-border/40" : ""}`}
      style={{ height: ROW_H }}
      onMouseEnter={() => onHover(name)}
      onMouseLeave={() => onHover(null)}
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
  const hasHover = hoveredPlayer !== null;

  const content = (
    <>
      <PlayerRow
        logoUrl={match.p1Logo}
        name={match.p1}
        score={match.s1}
        isWinner={match.winner === match.p1}
        isHoveredPlayer={hoveredPlayer === match.p1}
        hasHover={hasHover}
        isTop
        onHover={onHover}
      />
      <PlayerRow
        logoUrl={match.p2Logo}
        name={match.p2}
        score={match.s2}
        isWinner={match.winner === match.p2}
        isHoveredPlayer={hoveredPlayer === match.p2}
        hasHover={hasHover}
        onHover={onHover}
      />
    </>
  );

  const faded = hasHover && !isInJourney;

  if (!match.routeMatchId) {
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
      to={`${match.routeMatchId}`}
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
        stroke="hsl(var(--border))"
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
          stroke="hsl(var(--border))"
          strokeWidth={2}
          opacity={hasHover ? 0.25 : 1}
        />
      ))}

      <line
        x1={midX}
        y1={Math.min(...normFromYs)}
        x2={midX}
        y2={Math.max(...normFromYs)}
        stroke="hsl(var(--border))"
        strokeWidth={2}
        opacity={hasHover ? 0.25 : 1}
      />
      <line
        x1={midX}
        y1={normToY}
        x2={eX}
        y2={normToY}
        stroke="hsl(var(--border))"
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

const DoubleElimBracket = ({ bracketId }: DoubleElimBracketProps) => {
  const { tournament } = useOutletContext<BracketOutletContext>();
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null);
  const [mockMode, setMockMode] = useState<"off" | "6" | "8">("off");

  const registeredTeams = tournament?.registered ?? [];
  const actualTeamCount = registeredTeams.length;

  const selectedMockTeamCount =
    mockMode === "6" ? 6 : mockMode === "8" ? 8 : null;
  const useMockDoubleElim = selectedMockTeamCount !== null;

  const teamCount = selectedMockTeamCount ?? actualTeamCount;

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
    queryKey: [
      "double-bracket-matches",
      bracketId,
      actualTeamCount,
      useMockDoubleElim,
      selectedMockTeamCount,
    ],
    enabled: Boolean(bracketId) || useMockDoubleElim,
    queryFn: async () => {
      if (useMockDoubleElim) {
        return getMockDoubleElimMatches({
          bracketId: bracketId ?? 999,
          teamCount: selectedMockTeamCount ?? 8,
          registeredTeams,
        });
      }

      if (!bracketId) return [] as ApiMatch[];
      const response = await getMatchesByBracketId(bracketId);
      return response.data?.data ?? [];
    },
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const displayMatches = useMemo<DisplayMatch[]>(() => {
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
        const winnerTeamId = toNumber(match.winner_team_id);

        const p1 = match.team_a?.name ?? getTeamLabel(teamAId, teamNameById);
        const p2 = match.team_b?.name ?? getTeamLabel(teamBId, teamNameById);

        let winner: string | null = null;
        if (winnerTeamId !== null) {
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
          round: Number(match.round_number ?? 0),
          matchNo: Number(match.match_no ?? 0),
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
    if (teamCount !== 8 || rounds.length < 8) return null;

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
  }, [rounds, teamCount]);

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
    return <p className="text-sm text-muted-foreground">Đang tải bracket...</p>;
  }

  if (isError) {
    return (
      <div className="space-y-3">
        <ModeButtons mockMode={mockMode} setMockMode={setMockMode} />
        <p className="text-sm text-destructive">
          Không tải được dữ liệu double elimination.
        </p>
      </div>
    );
  }

  if (!rounds.length) {
    return (
      <div className="space-y-3">
        <ModeButtons mockMode={mockMode} setMockMode={setMockMode} />
        <p className="text-sm text-muted-foreground">
          Chưa có match trong bracket này.
        </p>
      </div>
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

    return (
      <div className="space-y-3">
        <ModeButtons mockMode={mockMode} setMockMode={setMockMode} />

        <div className="relative" style={{ width: totalW, height: totalH }}>
          <div
            className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider"
            style={{ left: x1, width: CARD_W, textAlign: "center", top: 0 }}
          >
            {getDoubleElimRoundTitle(
              1,
              totalRounds,
              firstRoundMatchCount,
              teamCount,
            )}
          </div>
          <div
            className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider"
            style={{ left: x2, width: CARD_W, textAlign: "center", top: 0 }}
          >
            {getDoubleElimRoundTitle(
              2,
              totalRounds,
              firstRoundMatchCount,
              teamCount,
            )}
          </div>
          <div
            className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider"
            style={{ left: x4, width: CARD_W, textAlign: "center", top: 0 }}
          >
            {getDoubleElimRoundTitle(
              3,
              totalRounds,
              firstRoundMatchCount,
              teamCount,
            )}
          </div>

          <div
            className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider"
            style={{
              left: x1,
              width: CARD_W,
              textAlign: "center",
              top: y4A - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(
              4,
              totalRounds,
              firstRoundMatchCount,
              teamCount,
            )}
          </div>
          <div
            className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider"
            style={{
              left: x2,
              width: CARD_W,
              textAlign: "center",
              top: y5A - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(
              5,
              totalRounds,
              firstRoundMatchCount,
              teamCount,
            )}
          </div>
          <div
            className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider"
            style={{
              left: x3,
              width: CARD_W,
              textAlign: "center",
              top: y6 - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(
              6,
              totalRounds,
              firstRoundMatchCount,
              teamCount,
            )}
          </div>
          <div
            className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider"
            style={{
              left: x4,
              width: CARD_W,
              textAlign: "center",
              top: y7 - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(
              7,
              totalRounds,
              firstRoundMatchCount,
              teamCount,
            )}
          </div>
          <div
            className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider"
            style={{
              left: x5,
              width: CARD_W,
              textAlign: "center",
              top: y8 - 28 + HEADER_H,
            }}
          >
            {getDoubleElimRoundTitle(
              8,
              totalRounds,
              firstRoundMatchCount,
              teamCount,
            )}
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
      </div>
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

    return (
      <div className="space-y-3">
        <ModeButtons mockMode={mockMode} setMockMode={setMockMode} />

        <div className="relative" style={{ width: totalW, height: totalH }}>
          <div
            className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider"
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
            className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider"
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
            className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider"
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
            className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider"
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
            className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider"
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
      </div>
    );
  }

  if (!layout) {
    return (
      <p className="text-sm text-muted-foreground">
        Không thể dựng layout bracket.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ModeButtons mockMode={mockMode} setMockMode={setMockMode} />
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
                className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider"
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
    </div>
  );
};

export default DoubleElimBracket;
