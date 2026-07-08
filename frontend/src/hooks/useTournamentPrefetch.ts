import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchNormalizedTournamentBrackets,
  fetchTournamentLeaderboardEnvelope,
  fetchTournamentTeamPlayers,
  tournamentBracketsQueryKey,
  tournamentLeaderboardQueryKey,
  tournamentTeamPlayersQueryKey,
} from "@/api/tournaments/queryFns";
import { getMatchesByBracketId } from "@/api/tournaments/index";

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

type RegisteredTeamRef = { id?: number | string };

/**
 * Warm every tournament sub-resource in parallel the moment the tournament
 * loads: leaderboard, brackets, all team rosters, and every bracket's matches.
 * Bracket matches are fetched once per bracket and seeded into all the query
 * keys the bracket views read from, so navigating between tabs is instant.
 */
export const useTournamentPrefetch = (
  tournamentId?: number | string | null,
  registeredTeams?: RegisteredTeamRef[] | null,
) => {
  const queryClient = useQueryClient();

  const registeredTeamIds = useMemo(() => {
    const ids = (registeredTeams ?? [])
      .map((team) => toNumber(team.id))
      .filter((id): id is number => id !== null);
    return Array.from(new Set(ids)).sort((a, b) => a - b);
  }, [registeredTeams]);

  const registeredTeamIdsKey = registeredTeamIds.join(",");

  useEffect(() => {
    if (
      tournamentId === null ||
      tournamentId === undefined ||
      tournamentId === ""
    ) {
      return;
    }

    const id = tournamentId;

    const prefetchBracketMatches = async () => {
      const brackets = await queryClient.fetchQuery({
        queryKey: tournamentBracketsQueryKey(id),
        queryFn: () => fetchNormalizedTournamentBrackets(id),
        staleTime: Number.POSITIVE_INFINITY,
      });

      await Promise.all(
        brackets.map(async (bracket) => {
          const bracketId = bracket.id;
          if (!bracketId) return;

          const response = await getMatchesByBracketId(bracketId);
          const matches = response.data?.data ?? [];

          // Seed every key variant the bracket views consume.
          queryClient.setQueryData(["bracket-matches", bracketId], {
            bracketId,
            matches,
          });
          queryClient.setQueryData(
            ["swiss-bracket-matches", bracketId],
            matches,
          );
          queryClient.setQueryData(
            ["round-robin-bracket-matches", bracketId],
            matches,
          );
        }),
      );
    };

    void Promise.all([
      queryClient.prefetchQuery({
        queryKey: tournamentLeaderboardQueryKey(id),
        queryFn: () => fetchTournamentLeaderboardEnvelope(id),
        staleTime: 60_000,
      }),
      prefetchBracketMatches(),
      ...registeredTeamIds.map((teamId) =>
        queryClient.prefetchQuery({
          queryKey: tournamentTeamPlayersQueryKey(teamId),
          queryFn: () => fetchTournamentTeamPlayers(teamId),
          staleTime: 60_000,
        }),
      ),
    ]);
  }, [queryClient, tournamentId, registeredTeamIdsKey, registeredTeamIds]);
};
