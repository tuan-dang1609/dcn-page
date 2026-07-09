import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchNormalizedTournamentBrackets,
  fetchTournamentLeaderboardEnvelope,
  tournamentBracketsQueryKey,
  tournamentLeaderboardQueryKey,
} from "@/api/tournaments/queryFns";
import { getMatchesByBracketId } from "@/api/tournaments/index";

export type TournamentTab =
  | "overview"
  | "participants"
  | "bracket"
  | "leaderboard"
  | "rule";

const prefetchBracketMatches = async (
  queryClient: ReturnType<typeof useQueryClient>,
  tournamentId: number | string,
) => {
  const brackets = await queryClient.fetchQuery({
    queryKey: tournamentBracketsQueryKey(tournamentId),
    queryFn: () => fetchNormalizedTournamentBrackets(tournamentId),
    staleTime: Number.POSITIVE_INFINITY,
  });

  await Promise.all(
    brackets.map(async (bracket) => {
      const bracketId = bracket.id;
      if (!bracketId) return;

      const response = await getMatchesByBracketId(bracketId);
      const matches = response.data?.data ?? [];

      queryClient.setQueryData(["bracket-matches", bracketId], {
        bracketId,
        matches,
      });
      queryClient.setQueryData(["swiss-bracket-matches", bracketId], matches);
      queryClient.setQueryData(
        ["round-robin-bracket-matches", bracketId],
        matches,
      );
    }),
  );
};

/** Prefetch data for a specific tab — safe to call on nav hover. */
export const prefetchTournamentTab = (
  queryClient: ReturnType<typeof useQueryClient>,
  tournamentId: number | string,
  tab: TournamentTab,
) => {
  switch (tab) {
    case "leaderboard":
      void queryClient.prefetchQuery({
        queryKey: tournamentLeaderboardQueryKey(tournamentId),
        queryFn: () => fetchTournamentLeaderboardEnvelope(tournamentId),
        staleTime: 60_000,
      });
      break;
    case "bracket":
      void prefetchBracketMatches(queryClient, tournamentId);
      break;
    default:
      break;
  }
};

const scheduleIdle = (callback: () => void) => {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout: 4_000 });
    return () => window.cancelIdleCallback(id);
  }

  const id = window.setTimeout(callback, 2_500);
  return () => window.clearTimeout(id);
};

/**
 * Prefetch only what the active tab needs immediately.
 * Other tabs are warmed in the background when the browser is idle.
 */
export const useTournamentPrefetch = (
  tournamentId?: number | string | null,
  activeTab: TournamentTab = "overview",
) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (
      tournamentId === null ||
      tournamentId === undefined ||
      tournamentId === ""
    ) {
      return;
    }

    const id = tournamentId;

    if (activeTab === "bracket") {
      void prefetchBracketMatches(queryClient, id);
    } else if (activeTab === "leaderboard") {
      void queryClient.prefetchQuery({
        queryKey: tournamentLeaderboardQueryKey(id),
        queryFn: () => fetchTournamentLeaderboardEnvelope(id),
        staleTime: 60_000,
      });
    }

    const cancelIdle = scheduleIdle(() => {
      if (activeTab !== "leaderboard") {
        void queryClient.prefetchQuery({
          queryKey: tournamentLeaderboardQueryKey(id),
          queryFn: () => fetchTournamentLeaderboardEnvelope(id),
          staleTime: 60_000,
        });
      }

      if (activeTab !== "bracket") {
        void queryClient.prefetchQuery({
          queryKey: tournamentBracketsQueryKey(id),
          queryFn: () => fetchNormalizedTournamentBrackets(id),
          staleTime: Number.POSITIVE_INFINITY,
        });
      }
    });

    return cancelIdle;
  }, [queryClient, tournamentId, activeTab]);
};
