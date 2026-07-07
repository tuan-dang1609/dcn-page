import {
  getBracketsByTournamentId,
  getTournamentResults,
  getTournamentTeamPlayers,
  type Bracket,
} from "@/api/tournaments/index";

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const tournamentLeaderboardQueryKey = (tournamentId?: number | string) =>
  ["tournament-leaderboard", tournamentId] as const;

export const tournamentBracketsQueryKey = (tournamentId?: number | string) =>
  ["tournament-brackets", tournamentId] as const;

export const tournamentTeamPlayersQueryKey = (
  tournamentTeamId?: number | string,
) => ["tournament-team-players", tournamentTeamId] as const;

export const fetchTournamentTeamPlayers = async (
  tournamentTeamId: number | string,
) => {
  const response = await getTournamentTeamPlayers(tournamentTeamId);
  return response.data;
};

export const fetchTournamentLeaderboardEnvelope = async (
  tournamentId: number | string,
) => {
  const response = await getTournamentResults(tournamentId);
  return response.data;
};

export const fetchNormalizedTournamentBrackets = async (
  tournamentId: number | string,
) => {
  const response = await getBracketsByTournamentId(tournamentId);
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
};
