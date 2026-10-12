import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import {
  fetchNormalizedTournamentBrackets,
  tournamentBracketsQueryKey,
} from "@/api/tournaments/queryFns";
import { TournamentTabCard } from "@/components/TournamentTabCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TOURNAMENT_PAGE_BG_CLASS,
  TOURNAMENT_TAB_ROW_CLASS,
} from "@/components/tournamentTheme";
import PageLoader from "@/components/PageLoader";
import { MatchPanelProvider } from "@/components/MatchPanel";
import { getMatchesByBracketId } from "@/api/tournaments/index";
import { normalizeBracketMatchStatus } from "@/components/bracketTheme";
import { resolveActiveBracketId } from "@/lib/resolveActiveBracket";

const SingleElimBracket = lazy(() => import("@/components/BracketView"));
const DoubleElimBracket = lazy(() => import("@/components/DoubleElimBracket"));
const SwissBracket = lazy(() => import("@/components/SwissBracket"));
const RoundRobinBracket = lazy(() => import("@/components/RoundRobinBracket"));

type BracketOutletContext = {
  tournament?: {
    id?: number;
  };
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBranchLabel = (index: number) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const base = alphabet.length;
  let value = index;
  let result = "";

  do {
    result = alphabet[value % base] + result;
    value = Math.floor(value / base) - 1;
  } while (value >= 0);

  return `Nhánh ${result}`;
};

const BracketPage = () => {
  const { tournament } = useOutletContext<BracketOutletContext>();
  const [activeBracketId, setActiveBracketId] = useState<number | null>(null);
  const userPickedRef = useRef(false);

  const {
    data: brackets = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: tournamentBracketsQueryKey(tournament?.id),
    enabled: Boolean(tournament?.id),
    queryFn: async () =>
      fetchNormalizedTournamentBrackets(tournament!.id!),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!brackets.length || userPickedRef.current) return;

    const resolved = resolveActiveBracketId(brackets);
    if (resolved != null) {
      setActiveBracketId(resolved);
    }
  }, [brackets]);

  const selectBracket = (bracketId: number) => {
    userPickedRef.current = true;
    setActiveBracketId(bracketId);
  };

  const selectedBracket =
    brackets.find((bracket) => bracket.id === activeBracketId) ?? brackets[0];
  const selectedBracketId = selectedBracket?.id ?? null;
  const selectedFormatId = toNumber(selectedBracket?.format_id);
  const selectedFormatType = String(
    selectedBracket?.format_type || "",
  ).toLowerCase();
  const isSwissBracket = selectedFormatType === "swiss";
  const isRoundRobinBracket =
    selectedFormatType === "round_robin" || selectedFormatId === 3;

  const bracketTabs = useMemo(() => {
    const order: string[] = [];
    const grouped = new Map<string, typeof brackets>();

    brackets.forEach((bracket) => {
      const name = (bracket.name || "").trim();
      const formatPart = toNumber(bracket.format_id) ?? 0;
      const key = name
        ? `__group_${formatPart}_${name.toLowerCase()}`
        : `__single_${bracket.id}`;

      if (!grouped.has(key)) {
        grouped.set(key, []);
        order.push(key);
      }

      grouped.get(key)!.push(bracket);
    });

    return order.flatMap((key) => {
      const items = [...(grouped.get(key) ?? [])].sort((a, b) => a.id - b.id);
      const groupTitle = (items[0]?.name || "").trim();
      const isDuplicate = !key.startsWith("__single_") && items.length > 1;

      if (!isDuplicate) {
        const bracket = items[0];
        return [
          {
            id: bracket.id,
            title: bracket.name || `Bracket ${bracket.id}`,
          },
        ];
      }

      return items.map((bracket, index) => ({
        id: bracket.id,
        title: groupTitle
          ? `${groupTitle} · ${toBranchLabel(index)}`
          : toBranchLabel(index),
      }));
    });
  }, [brackets]);

  const resolvedActiveId = activeBracketId ?? brackets[0]?.id ?? null;

  // Dải "TRỰC TIẾP": trận đang diễn ra trong nhánh đang xem
  const { data: bracketMatches = [] } = useQuery({
    queryKey: ["bracket-live-strip", selectedBracketId],
    enabled: Boolean(selectedBracketId),
    queryFn: async () => {
      const response = await getMatchesByBracketId(selectedBracketId!);
      return response.data?.data ?? [];
    },
    refetchInterval: 30_000,
  });
  const liveMatches = bracketMatches.filter(
    (match) =>
      match.team_a_id &&
      match.team_b_id &&
      normalizeBracketMatchStatus(match.status, match.date_scheduled) ===
        "ongoing",
  );

  const bracketView = (() => {
    if (!selectedBracket) return null;

    if (selectedFormatId === 1) {
      return <SingleElimBracket bracketId={selectedBracketId} />;
    }

    if (selectedFormatId === 2) {
      return <DoubleElimBracket bracketId={selectedBracketId} />;
    }

    if (isSwissBracket) {
      return <SwissBracket bracketId={selectedBracketId} />;
    }

    if (isRoundRobinBracket) {
      return <RoundRobinBracket bracketId={selectedBracketId} />;
    }

    return (
      <p className="text-sm text-neutral-400">
        Bracket này có format_id = {selectedFormatId ?? "-"}. Hiện tại chỉ hỗ
        trợ hiển thị Single Elimination, Double Elimination, Round Robin và
        Swiss.
      </p>
    );
  })();

  return (
    <MatchPanelProvider>
      <div className={`space-y-6 ${TOURNAMENT_PAGE_BG_CLASS}`}>
        {isLoading ? (
          <PageLoader label="Đang tải nhánh đấu..." fullScreen={false} />
        ) : null}

        {isError ? (
          <p className="text-sm text-[#FF4A3D]">Không tải được nhánh đấu.</p>
        ) : null}

        {liveMatches.length ? (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-y border-b-[#2C2B29] border-t-[#F2F0EB] py-3 text-sm">
            <span className="font-bold tracking-[0.04em] text-[#FF4A3D]">
              TRỰC TIẾP
            </span>
            {liveMatches.map((match) => (
              <span key={match.id} className="tabular-nums">
                <strong>{match.team_a?.name ?? "TBD"}</strong>{" "}
                {match.score_a ?? 0} : {match.score_b ?? 0}{" "}
                <strong>{match.team_b?.name ?? "TBD"}</strong>
              </span>
            ))}
          </div>
        ) : null}

        {bracketTabs.length > 1 ? (
          <>
            <div className={`hidden md:flex ${TOURNAMENT_TAB_ROW_CLASS}`}>
              {bracketTabs.map((tab) => (
                <TournamentTabCard
                  key={tab.id}
                  title={tab.title}
                  isActive={resolvedActiveId === tab.id}
                  onClick={() => selectBracket(tab.id)}
                />
              ))}
            </div>

            <div className="md:hidden">
              <Select
                value={String(resolvedActiveId ?? "")}
                onValueChange={(value) => selectBracket(Number(value))}
              >
                <SelectTrigger className="h-11 w-full border border-[#F2F0EB] bg-[#0B0B0B] text-[#F2F0EB]">
                  <SelectValue placeholder="Chọn nhánh" />
                </SelectTrigger>
                <SelectContent>
                  {bracketTabs.map((tab) => (
                    <SelectItem key={tab.id} value={String(tab.id)}>
                      {tab.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        ) : null}

        {!isLoading && !brackets.length ? (
          <p className="border-t-2 border-[#F2F0EB] py-4 text-sm text-[#9A9893]">
            Nhánh đấu sẽ được công bố khi giải bắt đầu.
          </p>
        ) : (
          <div className="overflow-x-auto pb-2 pt-2">
            <Suspense
              fallback={
                <PageLoader label="Đang tải nhánh đấu..." fullScreen={false} />
              }
            >
              {bracketView}
            </Suspense>
          </div>
        )}
      </div>
    </MatchPanelProvider>
  );
};

export default BracketPage;
