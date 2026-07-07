import axios from "axios";
import { API_BASE } from "@/lib/apiBase";
import { getAuthConfig } from "@/api/tournaments";

const matchesBaseUrl = `${API_BASE}/api/tournaments/matches`;

export type AovPlayerRow = {
  slot: number;
  ign: string;
  performance_score?: number | null;
  kills: number;
  deaths: number;
  assists: number;
  gold?: number | null;
};

export type AovParsedPayload = {
  game: {
    blue_kills: number;
    red_kills: number;
    duration_sec?: number | null;
    duration_mmss?: string | null;
    played_at?: string | null;
    winner_side: "blue" | "red";
  };
  players: {
    blue: AovPlayerRow[];
    red: AovPlayerRow[];
  };
};

export type AovStagingPayload = AovParsedPayload & {
  match_id?: string | null;
};

export type AovStagingResult = {
  match_id: string;
  data: AovStagingPayload;
};

export const generateAovStagingStats = (data: AovParsedPayload) =>
  axios.post<{ status: string; message: string; data: AovStagingResult }>(
    `${matchesBaseUrl}/aov/staging/generate`,
    { data },
    getAuthConfig(),
  );

export const getAovStagingStats = (matchId: string) =>
  axios.get(`${matchesBaseUrl}/aov/staging/${encodeURIComponent(matchId)}`, getAuthConfig());

export type AovMatchGamePlayer = {
  team_side: "blue" | "red";
  ign: string;
  performance_score?: number | null;
  kills: number;
  deaths: number;
  assists: number;
  gold?: number | null;
  slot_no?: number;
};

export type AovMatchGameStats = {
  match_game_id: number;
  match_id: number;
  game_no: number;
  info_game_id?: string | null;
  team_a_score?: number | null;
  team_b_score?: number | null;
  players: AovMatchGamePlayer[];
};

export const getAovMatchStats = (matchId: number | string) =>
  axios.get<{ status: string; data: AovMatchGameStats[] }>(
    `${matchesBaseUrl}/matches/${matchId}/aov/stats`,
  );
