import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import {
  fetchNormalizedTournamentBrackets,
  tournamentBracketsQueryKey,
} from "@/api/tournaments/queryFns";
import { type Bracket } from "@/api/tournaments/index";
import SingleElimBracket from "@/components/BracketView";
import DoubleElimBracket from "@/components/DoubleElimBracket";
import SwissBracket from "@/components/SwissBracket";
import RoundRobinBracket from "@/components/RoundRobinBracket";
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

  return (
    <div className={`space-y-5 ${TOURNAMENT_PAGE_BG_CLASS}`}>
      {isLoading ? (
        <PageLoader label="Đang tải danh sách bracket..." fullScreen={false} />
      ) : null}

      {isError ? (
        <p className="text-sm text-rose-400">
          Không tải được danh sách bracket.
        </p>
      ) : null}

      {bracketTabs.length ? (
        <>
          <div className={`hidden md:flex ${TOURNAMENT_TAB_ROW_CLASS}`}>
            {bracketTabs.map((tab) => (
              <TournamentTabCard
                key={tab.id}
                title={tab.title}
                isActive={resolvedActiveId === tab.id}
                onClick={() => setActiveBracketId(tab.id)}
              />
            ))}
          </div>

          <div className="md:hidden">
            <Select
              value={String(resolvedActiveId ?? "")}
              onValueChange={(value) => setActiveBracketId(Number(value))}
            >
              <SelectTrigger className="w-full border border-[#333] bg-[#141414] text-white">
                <SelectValue placeholder="Chọn bracket" />
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
        <p className="text-md text-center font-bold text-neutral-300">
          Hiện giải đấu chưa bắt đầu, vui lòng quay lại sau.
        </p>
      ) : (
        <div className="overflow-x-auto  pt-2">
          {selectedFormatId === 1 ? (
            <SingleElimBracket bracketId={selectedBracketId} />
          ) : null}

          {selectedFormatId === 2 ? (
            <DoubleElimBracket bracketId={selectedBracketId} />
          ) : null}

          {isSwissBracket ? (
            <SwissBracket bracketId={selectedBracketId} />
          ) : null}

          {isRoundRobinBracket ? (
            <RoundRobinBracket bracketId={selectedBracketId} />
          ) : null}

          {selectedBracket &&
          selectedFormatId !== 1 &&
          selectedFormatId !== 2 &&
          !isRoundRobinBracket &&
          !isSwissBracket ? (
            <p className="text-sm text-neutral-400">
              Bracket này có format_id = {selectedFormatId ?? "-"}. Hiện tại chỉ
              hỗ trợ hiển thị Single Elimination, Double Elimination, Round
              Robin và Swiss.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default BracketPage;
