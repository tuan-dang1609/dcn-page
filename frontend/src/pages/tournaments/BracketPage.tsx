import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import {
  getBracketsByTournamentId,
  type Bracket,
} from "@/api/tournaments/index";
import SingleElimBracket from "@/components/BracketView";

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
      <div className="flex gap-2">
        {brackets.map((bracket) => {
          const isActive = (activeBracketId ?? brackets[0]?.id) === bracket.id;
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
        })}
      </div>

      <div className="neo-box bg-card p-6 overflow-x-auto">
        {!isLoading && !brackets.length ? (
          <p className="text-sm text-muted-foreground">Chưa có bracket nào.</p>
        ) : null}

        {selectedFormatId === 1 ? (
          <SingleElimBracket bracketId={selectedBracketId} />
        ) : null}

        {selectedBracket && selectedFormatId !== 1 ? (
          <p className="text-sm text-muted-foreground">
            Bracket này có format_id = {selectedFormatId ?? "-"}. Hiện tại chỉ
            hỗ trợ hiển thị Single Elimination (format_id = 1).
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default BracketPage;
