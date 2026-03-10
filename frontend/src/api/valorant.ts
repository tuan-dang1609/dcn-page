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
  "https://bigtournament-1.onrender.com/api/auth/valorant/matchdata";

const valorantApiKeyFromVite =
  typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_VALORANT_API_KEY ?? null)
    : null;

const VALORANT_API_KEY = valorantApiKeyFromVite ?? "HoangTuan2004";

export const getValorantMatchData = (matchId: string) =>
  axios.get<ValorantMatchDataResponse>(
    `${VALORANT_MATCH_BASE_URL}/${matchId}`,
    {
      params: {
        api_key: VALORANT_API_KEY,
      },
    },
  );
