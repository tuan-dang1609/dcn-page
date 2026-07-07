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

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

type RegisteredTeamRef = { id?: number | string };

/** Prefetch BXH, brackets, and all team rosters when tournament loads. */
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

    void Promise.all([
      queryClient.prefetchQuery({
        queryKey: tournamentLeaderboardQueryKey(id),
        queryFn: () => fetchTournamentLeaderboardEnvelope(id),
        staleTime: 60_000,
      }),
      queryClient.prefetchQuery({
        queryKey: tournamentBracketsQueryKey(id),
        queryFn: () => fetchNormalizedTournamentBrackets(id),
        staleTime: Number.POSITIVE_INFINITY,
      }),
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
