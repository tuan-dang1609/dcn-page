import axios from "axios";
import { API_BASE } from "@/lib/apiBase";

/** Mã phòng giải đấu LMHT (Riot tournament-v5) — backend/controllers/tournaments/lolTournament.js. */

export interface LolMatchCode {
  /** null khi người xem không được thấy mã */
  code: string | null;
  game_no: number;
  mode: "live" | "stub";
  /** open = chờ đấu; played = đã có kết quả; review = BTC xem lại */
  status: "open" | "played" | "review";
  winner_team_id: number | string | null;
  /** Người thi đấu chưa liên kết LoL (không có puuid) — không vào được phòng */
  missing_user_ids: Array<number | string>;
  note: string | null;
  created_at: string;
}

export interface LolMatchCodes {
  mode: "live" | "stub";
  can_view: boolean;
  can_create: boolean;
  codes: LolMatchCode[];
}

export interface MyLolCode {
  code: string;
  game_no: number;
  match_id: number;
  team_a: { name: string; tag: string };
  team_b: { name: string; tag: string };
  link: string;
}

const auth = (token?: string | null) => (token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
const base = `${API_BASE}/api/lol-tournament`;

export const getLolMatchCodes = (matchId: number | string, token?: string | null) =>
  axios.get<{ data: LolMatchCodes }>(`${base}/matches/${matchId}`, auth(token));

export const createLolMatchCode = (matchId: number | string, token: string) =>
  axios.post<{ data: { code: string; game_no: number } }>(`${base}/matches/${matchId}/code`, {}, auth(token));

export const getMyLolCodes = (token: string) => axios.get<{ data: MyLolCode[] }>(`${base}/mine`, auth(token));
