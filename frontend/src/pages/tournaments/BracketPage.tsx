import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import {
  getBracketsByTournamentId,
  type Bracket,
} from "@/api/tournaments/index";
import SingleElimBracket from "@/components/BracketView";
import DoubleElimBracket from "@/components/DoubleElimBracket";
import SwissBracket from "@/components/SwissBracket";

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
    queryKey: ["tournament-brackets", tournament?.id],
    enabled: Boolean(tournament?.id),
    queryFn: async () => {
      const response = await getBracketsByTournamentId(tournament!.id!);
      const items = response.data?.data ?? [];

      return items
        .map((bracket) => ({
          ...bracket,
          id: toNumber(bracket.id),
          format_id: toNumber(bracket.format_id),
        }))
        .filter(
          (bracket): bracket is Bracket & { id: number; format_id: number } =>
            Number.isFinite(bracket.id) && Number.isFinite(bracket.format_id),
        );
    },
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

  const bracketGroups = useMemo(() => {
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

    return order.map((key) => {
      const items = [...(grouped.get(key) ?? [])].sort((a, b) => a.id - b.id);
      const title = (items[0]?.name || "").trim();

      return {
        key,
        items,
        isDuplicate: !key.startsWith("__single_") && items.length > 1,
        title,
      };
    });
  }, [brackets]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-heading">Nhánh đấu</h2>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">
          Đang tải danh sách bracket...
        </p>
      ) : null}

      {isError ? (
        <p className="text-sm text-destructive">
          Không tải được danh sách bracket.
        </p>
      ) : null}

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {bracketGroups.map((group) => {
          if (!group.isDuplicate) {
            const bracket = group.items[0];
            const isActive =
              (activeBracketId ?? brackets[0]?.id) === bracket.id;
            return (
              <button
                key={bracket.id}
                onClick={() => setActiveBracketId(bracket.id)}
                className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground neo-box-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {bracket.name || `Bracket ${bracket.id}`}
              </button>
            );
          }

          return (
            <div
              key={group.key}
              className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/40"
            >
              <span className="text-xs font-bold text-muted-foreground">
                {group.title}
              </span>
              <div className="flex items-center gap-1">
                {group.items.map((bracket, index) => {
                  const isActive =
                    (activeBracketId ?? brackets[0]?.id) === bracket.id;

                  return (
                    <button
                      key={bracket.id}
                      onClick={() => setActiveBracketId(bracket.id)}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground neo-box-sm"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {toBranchLabel(index)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {!isLoading && !brackets.length ? (
        <p className="text-md text-center text-foreground font-bold">
          Hiện giải đấu chưa bắt đầu, vui lòng quay lại sau.
        </p>
      ) : (
        <div className="p-6 overflow-x-auto">
          {selectedFormatId === 1 ? (
            <SingleElimBracket bracketId={selectedBracketId} />
          ) : null}

          {selectedFormatId === 2 ? (
            <DoubleElimBracket bracketId={selectedBracketId} />
          ) : null}

          {isSwissBracket ? (
            <SwissBracket bracketId={selectedBracketId} />
          ) : null}

          {selectedBracket &&
          selectedFormatId !== 1 &&
          selectedFormatId !== 2 &&
          !isSwissBracket ? (
            <p className="text-sm text-muted-foreground">
              Bracket này có format_id = {selectedFormatId ?? "-"}. Hiện tại chỉ
              hỗ trợ hiển thị Single Elimination, Double Elimination và Swiss.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default BracketPage;
