import axios from "axios";

export interface ValorantApiPlayerStats {
  multiKills?: number;
  acs?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  adr?: number;
  headshotPercentage?: number;
  firstDeaths?: number;
  firstKills?: number;
}

export interface ValorantApiPlayer {
  gameName: string;
  tagLine: string;
  teamId: string;
  characterName?: string;
  imgCharacter?: string;
  stats?: ValorantApiPlayerStats;
}

export interface ValorantApiTeam {
  teamId: string;
  roundsWon?: number;
  numPoints?: number;
}

export interface ValorantApiMatchInfo {
  mapName?: string;
  gameStartMillis?: number;
}

export interface ValorantApiMatchData {
  matchInfo?: ValorantApiMatchInfo;
  players?: ValorantApiPlayer[];
  teams?: ValorantApiTeam[];
}

export interface ValorantMatchDataResponse {
  source: string;
  matchData: ValorantApiMatchData;
}

const VALORANT_MATCH_BASE_URL =
  "/ext-api/bigtournament/api/auth/valorant/matchdata";

const API_KEY =
  typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_VALORANT_API_KEY ?? null)
    : null;

if (!API_KEY && typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.warn(
    "VITE_VALORANT_API_KEY is not set. Valorant match requests may fail.",
  );
}

export const getValorantMatchData = (matchId: string) =>
  axios.get<ValorantMatchDataResponse>(
    `${VALORANT_MATCH_BASE_URL}/${matchId}`,
    {
      params: API_KEY ? { api_key: API_KEY } : undefined,
    },
  );
