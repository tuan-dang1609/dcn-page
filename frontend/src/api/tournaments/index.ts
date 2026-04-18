import axios from "axios";
import { tournamentsBaseUrl } from "./client";
import type {
  Bracket,
  DataEnvelope,
  Match,
  TournamentTeamPlayersResponse,
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

export const deleteBracket = (bracketId: number | string) =>
  axios.delete<{
    data: {
      bracket_id: number;
      tournament_id: number;
      deleted_matches: number;
      deleted_match_games: number;
      deleted_pickem_picks: number;
      deleted_pickem_submissions: number;
    };
  }>(`${tournamentsBaseUrl}/brackets/${bracketId}`, getAuthConfig());

export const getMatchesByBracketId = (bracketId: number | string) =>
  axios.get<DataEnvelope<Match[]>>(
    `${tournamentsBaseUrl}/matches/brackets/${bracketId}/matches`,
  );

export const getTournamentTeamPlayers = (tournamentTeamId: number | string) =>
  axios.get<TournamentTeamPlayersResponse>(
    `${tournamentsBaseUrl}/team/players/${tournamentTeamId}`,
  );

export interface TournamentTeamRecord {
  id: number;
  team_id: number;
  name?: string | null;
  short_name?: string | null;
  logo_url?: string | null;
  team_color_hex?: string | null;
  nickname?: string | null;
  created_by?: string | null;
  isCheckedIn?: boolean;
}

export const getTournamentTeams = (tournamentId: number | string) =>
  axios.get<{ total: number; teams: TournamentTeamRecord[] }>(
    `${tournamentsBaseUrl}/teams/${tournamentId}`,
  );

export const getMatchesByTournamentId = async (
  tournamentId: number | string,
) => {
  const preferredBracketId =
    await getPreferredBracketIdByTournamentId(tournamentId);

  if (!preferredBracketId) {
    return {
      bracketId: null,
      matches: [] as Match[],
    };
  }

  const matchesResponse = await getMatchesByBracketId(preferredBracketId);

  return {
    bracketId: preferredBracketId,
    matches: matchesResponse.data?.data ?? [],
  };
};

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
  axios.get<DataEnvelope<RankGame[]>>(
    `${tournamentsBaseUrl}/requirements/ranks`,
  );

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

export const updateMatchSchedule = (
  matchId: number | string,
  payload: { date_scheduled?: string | null },
) =>
  axios.patch(
    `${tournamentsBaseUrl}/matches/matches/${matchId}/schedule`,
    payload,
    getAuthConfig(),
  );

export const updateMatchRoomId = (
  matchId: number | string,
  payload: { room_id: string | null },
) =>
  axios.patch(
    `${tournamentsBaseUrl}/matches/matches/${matchId}/room-id`,
    payload,
    getAuthConfig(),
  );

export const deleteMatchBanPick = (matchId: number | string) =>
  axios.delete(
    `${tournamentsBaseUrl}/matches/matches/${matchId}/ban-pick`,
    getAuthConfig(),
  );

export interface MatchGameIdRecord {
  id: number;
  match_id: number;
  room_id?: string | null;
  game_no?: number | null;
  game_id?: number | null;
  game_short_name?: string | null;
  info_game_id?: string | null;
  external_provider?: string | null;
  resolved_provider?: string | null;
  route_template?: string | null;
  route_preview?: string | null;
  played_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UpsertMatchGameIdPayload {
  match_id_info?: string;
  info_game_id?: string;
  game_id?: number;
  external_provider?: string | null;
  game_no?: number;
  room_id?: string | null;
}

export interface UpdateMatchGameIdPayload {
  match_id_info?: string | null;
  info_game_id?: string | null;
  game_id?: number;
  external_provider?: string | null;
  game_no?: number;
  room_id?: string | null;
}

export const getMatchGameIds = (matchId: number | string) =>
  axios.get<DataEnvelope<MatchGameIdRecord[]>>(
    `${tournamentsBaseUrl}/matches/matches/${matchId}/game-ids`,
    getAuthConfig(),
  );

export const createMatchGameId = (
  matchId: number | string,
  payload: UpsertMatchGameIdPayload,
) =>
  axios.post<{ data: MatchGameIdRecord }>(
    `${tournamentsBaseUrl}/matches/matches/${matchId}/game-ids`,
    payload,
    getAuthConfig(),
  );

export const updateMatchGameId = (
  matchId: number | string,
  gameIdRowId: number | string,
  payload: UpdateMatchGameIdPayload,
) =>
  axios.patch<{ data: MatchGameIdRecord }>(
    `${tournamentsBaseUrl}/matches/matches/${matchId}/game-ids/${gameIdRowId}`,
    payload,
    getAuthConfig(),
  );

export const deleteMatchGameId = (
  matchId: number | string,
  gameIdRowId: number | string,
) =>
  axios.delete<{ data: { id: number } }>(
    `${tournamentsBaseUrl}/matches/matches/${matchId}/game-ids/${gameIdRowId}`,
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

export interface TournamentTeamResult {
  tournament_id: number;
  team_id: number;
  placement: number | null;
  placement_end?: number | null;
  placement_label?: string | null;
  points: number;
  wins: number;
  losses: number;
  is_final: boolean;
  calculated_at: string;
  name?: string;
  short_name?: string;
  logo_url?: string;
  team_color_hex?: string;
}

export interface TournamentTeamAchievement {
  tournament_id: number;
  team_id: number;
  placement?: number | null;
  placement_end?: number | null;
  placement_label?: string | null;
  code: string;
  title: string;
  description?: string;
  meta?: Record<string, unknown>;
  created_at: string;
  name?: string;
  short_name?: string;
  logo_url?: string;
  team_color_hex?: string;
}

export interface TournamentRankingBracketInfo {
  tournament_id: number;
  ranking_bracket_id: number | null;
  bracket?: {
    id: number;
    tournament_id: number;
    name?: string;
    stage?: string;
    status?: string;
    format_id?: number;
  } | null;
}

export interface RankingBracketEnvelope {
  data: TournamentRankingBracketInfo;
}

export interface TournamentResultEnvelope {
  ranking_bracket_id?: number | null;
  data: TournamentTeamResult[];
}

export interface TournamentAchievementEnvelope {
  ranking_bracket_id?: number | null;
  data: TournamentTeamAchievement[];
}

export const getTournamentResults = (tournamentId: number | string) =>
  axios.get<TournamentResultEnvelope>(
    `${tournamentsBaseUrl}/${tournamentId}/results`,
  );

export const getTournamentAchievements = (tournamentId: number | string) =>
  axios.get<TournamentAchievementEnvelope>(
    `${tournamentsBaseUrl}/${tournamentId}/achievements`,
  );

export const getTournamentRankingBracket = (tournamentId: number | string) =>
  axios.get<RankingBracketEnvelope>(
    `${tournamentsBaseUrl}/${tournamentId}/ranking-bracket`,
  );

export const setTournamentRankingBracket = (
  tournamentId: number | string,
  bracketId: number | null,
) =>
  axios.patch(
    `${tournamentsBaseUrl}/${tournamentId}/ranking-bracket`,
    { bracket_id: bracketId },
    getAuthConfig(),
  );

export const recalculateTournamentResultsById = (
  tournamentId: number | string,
) =>
  axios.post(
    `${tournamentsBaseUrl}/${tournamentId}/recalculate-results`,
    {},
    getAuthConfig(),
  );

export type {
  Bracket,
  DataEnvelope,
  Match,
  TournamentTeamPlayersResponse,
  Tournament,
  TournamentBySlugResponse,
  TournamentPayload,
};
