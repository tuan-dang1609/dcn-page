import axios from "axios";
import { apiUrl } from "@/lib/apiBase";

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

export const getTftMatchData = (matchId: string) =>
  axios.get<TftApiResponse>(
    apiUrl(
      `/api/tournaments/matches/external/tft/${encodeURIComponent(matchId)}`,
    ),
  );
