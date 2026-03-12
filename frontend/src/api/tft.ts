import axios from "axios";

export interface TftApiParticipant {
  puuid?: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  placement?: number;
}

export interface TftApiInfo {
  participants?: TftApiParticipant[];
}

export interface TftApiResponse {
  info?: TftApiInfo;
  data?: {
    info?: TftApiInfo;
  };
}

const TFT_MATCH_BASE_URL = "/ext-api/bigtournament/api/tft/match";

export const getTftMatchData = (matchId: string) =>
  axios.get<TftApiResponse>(`${TFT_MATCH_BASE_URL}/${matchId}`);
