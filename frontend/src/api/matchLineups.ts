import axios from "axios";
import { API_BASE } from "@/lib/apiBase";

/** Đội hình ra sân từng trận — backend/controllers/tournaments/matchLineups.js. */

export interface LineupPlayer {
  user_id: number | string;
  username: string;
  nickname: string | null;
  profile_picture: string | null;
  riot_account: string | null;
  ingame_role: string | null;
}

export interface LineupTeam {
  side: "team1" | "team2";
  team_id: number;
  registered: boolean;
  name?: string;
  short_name?: string;
  logo_url?: string | null;
  captain_user_id?: number | null;
  roster: LineupPlayer[];
  /** Người đã chọn — chỉ trả cho đội mình, hoặc khi đã khoá. */
  lineup: number[];
  lineup_set: boolean;
  can_edit: boolean;
}

export interface MatchLineups {
  match_id: number;
  game: string | null;
  /** Số người ra sân tối thiểu (tối đa = cả đội hình đăng ký). */
  starters: number;
  /** Không chốt trước hạn → thua với tỉ số forfeit_score–0 (null = giải không bật xử thua). */
  forfeit_score: number | null;
  locked: boolean;
  date_scheduled: string | null;
  /** Giờ mở chốt (giờ đấu − số phút BTC cài); null = mở ngay. */
  opens_at: string | null;
  /** Hạn chốt: Valorant = giờ trận − 10 phút (giờ trận = giờ ban/pick); game khác = giờ trận. */
  closes_at: string | null;
  not_open_yet: boolean;
  teams: LineupTeam[];
}

const auth = (token?: string | null) => (token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
const base = `${API_BASE}/api/match-lineups`;

export const getMatchLineups = (matchId: number | string, token?: string | null) =>
  axios.get<{ data: MatchLineups }>(`${base}/${matchId}`, auth(token));

export const saveMatchLineup = (
  matchId: number | string,
  teamId: number | string,
  userIds: Array<number | string>,
  token: string,
) => axios.put(`${base}/${matchId}/${teamId}`, { user_ids: userIds }, auth(token));

/** Huỷ chốt đội hình ra sân (về "chưa chốt"). */
export const clearMatchLineup = (matchId: number | string, teamId: number | string, token: string) =>
  axios.delete(`${base}/${matchId}/${teamId}`, auth(token));

export interface PendingLineup {
  match_id: number;
  team_id: number;
  date_scheduled: string;
  /** Hạn chốt (Valorant: giờ trận − 10 phút). */
  closes_at: string;
  team_a: { name: string; tag: string };
  team_b: { name: string; tag: string };
  link: string;
}

/** Trận sắp tới đội tôi cần chốt đội hình ra sân (dải thông báo). */
export const getMyPendingLineups = (token: string) =>
  axios.get<{ data: PendingLineup[] }>(`${base}/mine`, auth(token));
export interface LineupSettings {
  tournament_id: number;
  /** Mở chốt trước giờ đấu bao nhiêu phút; null = mở ngay khi có trận. */
  lineup_open_minutes: number | null;
  lineup_forfeit: boolean;
  /** false = DB chưa chạy docs/match_lineup_settings.sql */
  ready: boolean;
}

export const getLineupSettings = (tournamentId: number | string, token: string) =>
  axios.get<{ data: LineupSettings }>(`${base}/settings/${tournamentId}`, auth(token));

export const saveLineupSettings = (
  tournamentId: number | string,
  payload: { lineup_open_minutes: number | null; lineup_forfeit: boolean },
  token: string,
) => axios.put<{ data: LineupSettings }>(`${base}/settings/${tournamentId}`, payload, auth(token));