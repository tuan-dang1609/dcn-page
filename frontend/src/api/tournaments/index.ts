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

export interface MilestonePayload {
  id?: number;
  title: string;
  context: string;
  milestone_time?: string | null;
}

export const createMilestones = (
  tournamentId: number | string,
  payload: MilestonePayload[] | { milestones: MilestonePayload[] },
) =>
  axios.post(
    `${tournamentsBaseUrl}/milestones/${tournamentId}`,
    payload,
    getAuthConfig(),
  );

export const syncMilestones = (
  tournamentId: number | string,
  payload: MilestonePayload[] | { milestones: MilestonePayload[] },
) =>
  axios.patch(
    `${tournamentsBaseUrl}/milestones/${tournamentId}`,
    payload,
    getAuthConfig(),
  );

export interface RulePayload {
  id?: number;
  title: string;
  content: string;
}

export const createRules = (
  tournamentId: number | string,
  payload: RulePayload[] | { rules: RulePayload[] },
) =>
  axios.post(
    `${tournamentsBaseUrl}/rules/${tournamentId}`,
    payload,
    getAuthConfig(),
  );

export const syncRules = (
  tournamentId: number | string,
  payload: RulePayload[] | { rules: RulePayload[] },
) =>
  axios.patch(
    `${tournamentsBaseUrl}/rules/${tournamentId}`,
    payload,
    getAuthConfig(),
  );

export interface RequirementPayload {
  rank_min: number;
  rank_max: number;
  devices?: string[];
  discord?: boolean;
}

export interface RankGame {
  id: number;
  name: string;
}

export const getRankGames = () =>
  axios.get<DataEnvelope<RankGame[]>>(`${tournamentsBaseUrl}/requirements/ranks`);

export const createRequirements = (
  tournamentId: number | string,
  payload: RequirementPayload,
) =>
  axios.post(
    `${tournamentsBaseUrl}/requirements/${tournamentId}`,
    payload,
    getAuthConfig(),
  );

export const updateRequirements = (
  tournamentId: number | string,
  payload: Partial<RequirementPayload>,
) =>
  axios.patch(
    `${tournamentsBaseUrl}/requirements/${tournamentId}`,
    payload,
    getAuthConfig(),
  );

export type BracketType =
  | "single-elimination"
  | "double-elimination"
  | "swiss"
  | "round-robin";

export interface GenerateBracketPayload {
  format_id: number;
  team_ids?: number[];
  best_of?: number;
  name?: string;
  stage?: string;
  status?: string;
}

const bracketGeneratePathByType: Record<BracketType, string> = {
  "single-elimination": "single-elimination/generate",
  "double-elimination": "double-elimination/generate",
  swiss: "swiss/generate",
  "round-robin": "round-robin/generate",
};

export const generateBracket = (
  tournamentId: number | string,
  type: BracketType,
  payload: GenerateBracketPayload,
) =>
  axios.post(
    `${tournamentsBaseUrl}/brackets/${tournamentId}/${bracketGeneratePathByType[type]}`,
    payload,
    getAuthConfig(),
  );

export interface UpdateMatchScorePayload {
  score_a: number;
  score_b: number;
  winner_team_id?: number | null;
  status?: string;
  propagate_winner?: boolean;
  propagate_loser?: boolean;
}

export const updateMatchScore = (
  matchId: number | string,
  payload: UpdateMatchScorePayload,
) =>
  axios.patch(
    `${tournamentsBaseUrl}/matches/matches/${matchId}/score`,
    payload,
    getAuthConfig(),
  );

export interface PairSwissNextRoundPayload {
  round_number?: number;
}

export const pairSwissNextRound = (
  tournamentId: number | string,
  bracketId: number | string,
  payload?: PairSwissNextRoundPayload,
) =>
  axios.post(
    `${tournamentsBaseUrl}/brackets/${tournamentId}/swiss/${bracketId}/pair-next-round`,
    payload ?? {},
    getAuthConfig(),
  );

export type {
  Bracket,
  DataEnvelope,
  Match,
  Tournament,
  TournamentBySlugResponse,
  TournamentPayload,
};
