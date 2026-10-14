import axios from "axios";
import { API_BASE } from "@/lib/apiBase";
import { getAuthConfig } from "@/api/tournaments";

const matchesBaseUrl = `${API_BASE}/api/tournaments/matches`;

export type AovPlayerRow = {
  slot: number;
  ign: string;
  performance_score?: number | null;
  /** null = chưa đọc được (vd. đọc ảnh lỗi) — phải sửa trước khi Generate. */
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  gold?: number | null;
  /** Tên đọc từ ảnh khi ign đã được thay bằng tên người đăng ký. */
  matched_from_ign?: string;
  matched_user_id?: number | string | null;
};

export type AovParsedPayload = {
  game: {
    blue_kills: number;
    red_kills: number;
    duration_sec?: number | null;
    duration_mmss?: string | null;
    played_at?: string | null;
    /** null = chưa xác định — phải chọn trước khi Generate. */
    winner_side: "blue" | "red" | null;
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

export type AovStagingBatchResult = {
  count: number;
  items: AovStagingResult[];
  /** Có khi chỉ 1 ván (tương thích cũ) */
  match_id?: string;
  data?: AovStagingPayload;
};

export const generateAovStagingStats = (
  data: AovParsedPayload | AovParsedPayload[],
) =>
  axios.post<{ status: string; message: string; data: AovStagingBatchResult }>(
    `${matchesBaseUrl}/aov/staging/generate`,
    { data },
    getAuthConfig(),
  );

export type AovUsernameMatch = {
  name: string;
  username: string | null;
  user_id: number | null;
  nickname: string | null;
  score: number;
  matched: boolean;
};

/** Ghép tên đọc từ ảnh với username tài khoản đã đăng ký (mỗi ván ghép 1–1). */
export const matchAovUsernames = (games: Array<{ blue: string[]; red: string[] }>) =>
  axios.post<{ data: Array<{ blue: AovUsernameMatch[]; red: AovUsernameMatch[] }> }>(
    `${matchesBaseUrl}/aov/match-usernames`,
    { games },
    getAuthConfig(),
  );

export const getAovStagingStats = (matchId: string) =>
  axios.get(`${matchesBaseUrl}/aov/staging/${encodeURIComponent(matchId)}`, getAuthConfig());

export type AovMatchGamePlayer = {
  team_side: "blue" | "red";
  ign: string;
  matched_from_ign?: string | null;
  performance_score?: number | null;
  kills: number;
  deaths: number;
  assists: number;
  gold?: number | null;
  slot_no?: number;
};

export type AovGameMeta = {
  blue_kills?: number | null;
  red_kills?: number | null;
  duration_sec?: number | null;
  played_at?: string | null;
  winner_side?: "blue" | "red" | null;
};

export type AovMatchGameStats = {
  match_game_id: number;
  match_id: number;
  game_no: number;
  info_game_id?: string | null;
  team_a_score?: number | null;
  team_b_score?: number | null;
  winner_team_id?: number | null;
  aov?: AovGameMeta | null;
  players: AovMatchGamePlayer[];
};

export type AovMatchSeriesScore = {
  score_a: number;
  score_b: number;
  winner_team_id?: number | null;
  status?: string | null;
};

export const getAovMatchStats = (matchId: number | string) =>
  axios.get<{
    status: string;
    data: AovMatchGameStats[];
    series?: AovMatchSeriesScore | null;
  }>(`${matchesBaseUrl}/matches/${matchId}/aov/stats`);
