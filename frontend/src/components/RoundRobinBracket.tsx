import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  getMatchesByBracketId,
  type Match as ApiMatch,
} from "@/api/tournaments/index";
import { TOURNAMENT_LOGO } from "@/data/tournament";

type RoundRobinBracketProps = {
  bracketId?: number | null;
  tournamentRegistered?: RegisteredTeam[];
};

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

type DisplayMatch = {
  id: number;
  round: number;
  matchNo: number;
  bestOf: number | null;
  p1: string;
  p2: string;
  p1Logo: string | null;
  p2Logo: string | null;
  teamAId: number | null;
  teamBId: number | null;
  s1: number | null;
  s2: number | null;
  winner: string | null;
  status: string;
};

type TeamStanding = {
  teamId: number;
  name: string;
  logoUrl: string | null;
  played: number;
  wins: number;
  losses: number;
  buchholz: number;
};

const CARD_W = 240;
const ROW_H = 36;
const CARD_H = ROW_H * 2;

const BRACKET_CARD_CLASS =
  "block overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 shadow-lg";
const BRACKET_ROW_BASE_CLASS =
  "flex items-center justify-between px-3 transition-colors duration-150 border-b border-neutral-800";

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

const toDisplayMatches = (
  apiMatches: ApiMatch[],
  teamNameById: Record<number, string>,
): DisplayMatch[] => {
  return [...apiMatches]
    .sort((a, b) => {
      const rDiff = (a.round_number ?? 0) - (b.round_number ?? 0);
      if (rDiff !== 0) return rDiff;
      const mDiff = (a.match_no ?? 0) - (b.match_no ?? 0);
      if (mDiff !== 0) return mDiff;
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
        round: Number(match.round_number ?? 0),
        matchNo: Number(match.match_no ?? 0),
        bestOf: toNumber((match as { best_of?: unknown }).best_of),
        p1,
        p2,
        p1Logo: match.team_a?.logo_url ?? null,
        p2Logo: match.team_b?.logo_url ?? null,
        teamAId,
        teamBId,
        s1: scoreA,
        s2: scoreB,
        winner,
        status: String(match.status ?? "scheduled"),
      };
    });
};

const getRoundLabel = (
  roundNumber: number,
  _legSplit: number,
  _hasReturnLeg: boolean,
) => {
  return `Ngày ${roundNumber}`;
};

const resolveMatchWinnerTeamId = (match: DisplayMatch) => {
  if (match.teamAId !== null && match.teamBId === null) return match.teamAId;
  if (match.teamBId !== null && match.teamAId === null) return match.teamBId;

  if (match.s1 !== null && match.s2 !== null) {
    if (match.s1 > match.s2) return match.teamAId;
    if (match.s2 > match.s1) return match.teamBId;
  }

  return null;
};

const buildStandings = ({
  matches,
  teamNameById,
}: {
  matches: DisplayMatch[];
  teamNameById: Record<number, string>;
}) => {
  const stats = new Map<number, TeamStanding & { opponents: Set<number> }>();

  const ensureTeam = (teamId: number | null, fallbackName?: string) => {
    if (!teamId) return null;

    const current = stats.get(teamId);
    if (current) return current;

    const next = {
      teamId,
      name: fallbackName ?? teamNameById[teamId] ?? `Team #${teamId}`,
      logoUrl: null as string | null,
      played: 0,
      wins: 0,
      losses: 0,
      buchholz: 0,
      opponents: new Set<number>(),
    };

    stats.set(teamId, next);
    return next;
  };

  matches.forEach((match) => {
    const teamA = ensureTeam(match.teamAId, match.p1);
    const teamB = ensureTeam(match.teamBId, match.p2);

    if (!teamA || !teamB) return;

    if (match.s1 === null || match.s2 === null) return;

    teamA.played += 1;
    teamB.played += 1;
    teamA.opponents.add(teamB.teamId);
    teamB.opponents.add(teamA.teamId);

    const winnerTeamId = resolveMatchWinnerTeamId(match);
    if (winnerTeamId === match.teamAId) {
      teamA.wins += 1;
      teamB.losses += 1;
      return;
    }

    if (winnerTeamId === match.teamBId) {
      teamB.wins += 1;
      teamA.losses += 1;
    }
  });

  for (const standing of stats.values()) {
    standing.buchholz = [...standing.opponents].reduce((sum, opponentId) => {
      const opponent = stats.get(opponentId);
      return sum + Number(opponent?.wins ?? 0);
    }, 0);
  }

  return [...stats.values()].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    return a.teamId - b.teamId;
  });
};

const MatchRow = ({ match, legSplit }: { match: DisplayMatch; legSplit: number }) => {
  const { game, slug } = useParams();
  const matchParam = String(match.id);
  const isCompleted = ["complete", "completed"].includes(
    String(match.status).trim().toLowerCase(),
  );

  const rowTone = (isWinner: boolean) =>
    isWinner
      ? "bg-amber-900/20 text-amber-100 font-semibold border-l-4 border-l-amber-300"
      : "bg-neutral-900 text-neutral-300";

  const boLabel = match.bestOf ? `BO${match.bestOf}` : "BO1";

  const content = (
    <div className="flex min-h-14 items-center gap-3 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <img
          src={match.p1Logo || TOURNAMENT_LOGO}
          alt=""
          className="h-6 w-6 rounded-sm shrink-0"
        />
        <span
          className={`min-w-0 truncate text-sm ${match.winner === match.p1 ? "font-semibold text-[#EEEEEE]" : "text-[#EEEEEE]/85"}`}
        >
          {match.p1}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1">
        <span className="w-8 text-right text-sm font-bold text-[#EEEEEE] tabular-nums">
          {match.s1 !== null ? match.s1 : "-"}
        </span>
        <span className="text-xs text-muted-foreground">-</span>
        <span className="w-8 text-left text-sm font-bold text-[#EEEEEE] tabular-nums">
          {match.s2 !== null ? match.s2 : "-"}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span
          className={`min-w-0 truncate text-sm text-right ${match.winner === match.p2 ? "font-semibold text-[#EEEEEE]" : "text-[#EEEEEE]/85"}`}
        >
          {match.p2}
        </span>
        <img
          src={match.p2Logo || TOURNAMENT_LOGO}
          alt=""
          className="h-6 w-6 rounded-sm shrink-0"
        />
      </div>

      <div className="flex w-14 shrink-0 items-center justify-end">
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {boLabel}
        </span>
      </div>
    </div>
  );

  if (!isCompleted) {
    return (
      <div className={BRACKET_CARD_CLASS} style={{ width: "100%" }}>
        {content}
      </div>
    );
  }

  return (
    <Link
      to={`/tournament/${game ?? ""}/${slug ?? ""}/match/${matchParam}`}
      className={`${BRACKET_CARD_CLASS} hover:ring-1 hover:ring-white/40 transition-all`}
      style={{ width: "100%" }}
    >
      {content}
    </Link>
  );
};

const RoundRobinBracket = ({
  bracketId,
  tournamentRegistered,
}: RoundRobinBracketProps) => {
  const outletContext = useOutletContext<BracketOutletContext | undefined>();
  const tournament = outletContext?.tournament;
  const [hoveredRound, setHoveredRound] = useState<number | null>(null);

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
    queryKey: ["round-robin-bracket-matches", bracketId],
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

  const matches = useMemo(
    () => toDisplayMatches(data ?? [], teamNameById),
    [data, teamNameById],
  );

  const hasReturnLeg = useMemo(() => {
    const pairCounts = new Map<string, number>();

    matches.forEach((match) => {
      if (!match.teamAId || !match.teamBId) return;
      const low = Math.min(match.teamAId, match.teamBId);
      const high = Math.max(match.teamAId, match.teamBId);
      const key = `${low}-${high}`;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    });

    return [...pairCounts.values()].some((count) => count > 1);
  }, [matches]);

  const roundGroups = useMemo(() => {
    const grouped = new Map<number, DisplayMatch[]>();
    matches.forEach((match) => {
      const list = grouped.get(match.round) ?? [];
      list.push(match);
      grouped.set(match.round, list);
    });

    return [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, items]) => ({
        round,
        items: [...items].sort((a, b) => {
          if (a.matchNo !== b.matchNo) return a.matchNo - b.matchNo;
          return a.id - b.id;
        }),
      }));
  }, [matches]);

  const standings = useMemo(
    () => buildStandings({ matches, teamNameById }),
    [matches, teamNameById],
  );

  const totalRounds = roundGroups.length;
  const legSplit = hasReturnLeg ? Math.ceil(totalRounds / 2) : totalRounds;

  if (isLoading) {
    return <p className="text-sm text-[#EEEEEE]">Đang tải bracket...</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">Không tải được dữ liệu bracket.</p>
    );
  }

  if (!roundGroups.length) {
    return <p className="text-sm text-[#EEEEEE]">Chưa có match trong bracket này.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-bold text-[#EEEEEE]">Round Robin</h3>
          <p className="text-xs text-muted-foreground">
            {hasReturnLeg
              ? "Hệ thống đang hiển thị đủ lượt đi và lượt về."
              : "Hệ thống đang hiển thị 1 lượt thi đấu."}
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {hasReturnLeg
            ? `${totalRounds} vòng · ${legSplit} vòng lượt đi, ${totalRounds - legSplit} vòng lượt về`
            : `${totalRounds} vòng · 1 lượt`}
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-[#EEEEEE]">
              Bảng xếp hạng tổng
            </h4>
            <p className="text-xs text-muted-foreground">
              Xếp theo số trận thắng, ít thua hơn và Buchholz.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {standings.length} đội
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="border-b border-border px-3 py-2">Hạng</th>
                <th className="border-b border-border px-3 py-2">Đội</th>
                <th className="border-b border-border px-3 py-2 text-center">Đã đấu</th>
                <th className="border-b border-border px-3 py-2 text-center">Thắng</th>
                <th className="border-b border-border px-3 py-2 text-center">Thua</th>
                <th className="border-b border-border px-3 py-2 text-center">Buchholz</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((standing, index) => (
                <tr key={standing.teamId} className="hover:bg-muted/40 transition-colors">
                  <td className="border-b border-border px-3 py-2 font-bold text-[#EEEEEE]">
                    {index + 1}
                  </td>
                  <td className="border-b border-border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <img
                        src={standing.logoUrl || TOURNAMENT_LOGO}
                        alt=""
                        className="h-5 w-5 rounded-sm"
                      />
                      <span className="font-medium text-[#EEEEEE]">
                        {standing.name}
                      </span>
                    </div>
                  </td>
                  <td className="border-b border-border px-3 py-2 text-center text-muted-foreground">
                    {standing.played}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-center text-emerald-300 font-semibold">
                    {standing.wins}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-center text-rose-300 font-semibold">
                    {standing.losses}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-center text-muted-foreground">
                    {standing.buchholz}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="space-y-5">
        {roundGroups.map((group) => (
          <section
            key={group.round}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
            onMouseEnter={() => setHoveredRound(group.round)}
            onMouseLeave={() => setHoveredRound(null)}
          >
            <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
              <h4 className="text-sm font-bold uppercase tracking-wider text-[#EEEEEE]">
                {getRoundLabel(group.round, legSplit, hasReturnLeg)}
              </h4>
              <span className="text-xs text-muted-foreground">
                {group.items.length} trận
              </span>
            </div>

            <div className="space-y-2">
              {group.items.map((match) => (
                <div
                  key={match.id}
                  className={
                    hoveredRound !== null && hoveredRound !== group.round
                      ? "opacity-60"
                      : ""
                  }
                >
                  <MatchRow match={match} legSplit={legSplit} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default RoundRobinBracket;