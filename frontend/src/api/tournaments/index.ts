import axios from "axios";
import { tournamentsBaseUrl } from "./client";
import type {
  Bracket,
  DataEnvelope,
  Match,
  Tournament,
  TournamentBySlugResponse,
  TournamentPayload,
} from "./types";

let token: string | null = null;

const getAuthConfig = () =>
  token
    ? {
        headers: {
          Authorization: token,
        },
      }
    : {};

export const setTournamentToken = (nextToken: string | null) => {
  token = nextToken ? `Bearer ${nextToken}` : null;
};

export const getAllTournaments = () =>
  axios.get<Tournament[]>(tournamentsBaseUrl);

export const getTournamentBySlug = (game: string, slug: string) =>
  axios.get<TournamentBySlugResponse>(
    `${tournamentsBaseUrl}/by-slug/${game}/${slug}`,
  );

export const getBracketsByTournamentId = (tournamentId: number | string) =>
  axios.get<DataEnvelope<Bracket[]>>(
    `${tournamentsBaseUrl}/brackets/${tournamentId}`,
  );

export const getMatchesByBracketId = (bracketId: number | string) =>
  axios.get<DataEnvelope<Match[]>>(
    `${tournamentsBaseUrl}/matches/brackets/${bracketId}/matches`,
  );

export const getPreferredBracketIdByTournamentId = async (
  tournamentId: number | string,
) => {
  const response = await getBracketsByTournamentId(tournamentId);
  const brackets = response.data?.data ?? [];

  if (!brackets.length) return null;

  const mainBracket = brackets.find(
    (bracket) => String(bracket.stage || "").toLowerCase() === "main",
  );

  return mainBracket?.id ?? brackets[0]?.id ?? null;
};

export const getMatchesByTournamentSlug = async (
  game: string,
  slug: string,
) => {
  const tournamentResponse = await getTournamentBySlug(game, slug);
  const tournamentId = tournamentResponse.data?.info?.id;

  if (!tournamentId) {
    throw new Error("Không tìm thấy tournament_id từ slug");
  }

  const bracketId = await getPreferredBracketIdByTournamentId(tournamentId);

  if (!bracketId) {
    return {
      bracketId: null,
      matches: [] as Match[],
    };
  }

  const matchesResponse = await getMatchesByBracketId(bracketId);

  return {
    bracketId,
    matches: matchesResponse.data?.data ?? [],
  };
};

export const createTournament = (payload: TournamentPayload) =>
  axios.post(tournamentsBaseUrl, payload, getAuthConfig());

export const updateTournament = (
  id: number | string,
  payload: Partial<TournamentPayload>,
) => axios.patch(`${tournamentsBaseUrl}/${id}`, payload, getAuthConfig());

export type {
  Bracket,
  DataEnvelope,
  Match,
  Tournament,
  TournamentBySlugResponse,
  TournamentPayload,
};
