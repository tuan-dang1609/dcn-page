import axios from "axios";
import { API_BASE } from "@/lib/apiBase";

/**
 * Ban/pick Valorant (backend/utils/banPick.js, state.version = 2).
 * status: waiting (đã tạo phòng, chưa chạy giờ) → running → done.
 */
export type BanPickStatus = "waiting" | "running" | "done";
export type BanPickPhase = "waiting" | "ban_pick" | "side_select" | "complete";
export type TeamSlot = "team1" | "team2";
export type Side = "ATK" | "DEF";
export type BanPickFormat = "BO1" | "BO3" | "BO5";
export type DeciderRule = "lastActor" | "other";
export type BanPickStepKind = "ban" | "pick" | "side";

export interface BanPickStep {
  kind: BanPickStepKind;
  team: TeamSlot;
}

export interface BanPickMapState {
  mapId: string;
  status: "available" | "banned" | "picked" | "decider";
  actionBy?: TeamSlot;
  actionType?: "ban" | "pick";
  /** Thứ tự thi đấu (map đã chọn / quyết định). */
  order?: number;
  side?: { team1: Side; team2: Side };
  sideChosenBy?: TeamSlot;
  /** Cấm/chọn do hết giờ hoặc BTC bỏ qua lượt. */
  random?: boolean;
  sideRandom?: boolean;
}

export interface BanPickLogEntry {
  step: number;
  mapId: string;
  action: "ban" | "pick" | "side_select" | string;
  team: TeamSlot;
  side?: Side;
  random?: boolean;
}

export interface BanPickState {
  version?: number;
  status: BanPickStatus;
  phase: BanPickPhase;
  maps: BanPickMapState[];
  steps: BanPickStep[];
  stepIndex: number;
  format: BanPickFormat;
  teamNames: { team1: string; team2: string };
  actionLog: BanPickLogEntry[];
}

export interface RoundBanPickPayload {
  id: number;
  round_slug: string;
  match_id: number;
  tournament_id: number | null;
  room_id: string | null;
  match_status?: string | null;
  round_number: number | null;
  match_no: number | null;
  status: BanPickStatus;
  phase: BanPickPhase;
  format: BanPickFormat;
  first_team: TeamSlot;
  decider_rule: DeciderRule;
  ready: Record<TeamSlot, boolean>;
  steps: BanPickStep[];
  step_index: number;
  turn_time_limit_seconds: number;
  turn_started_at: string | null;
  turn_deadline_at: string | null;
  turn_remaining_seconds: number | null;
  /** Giờ server lúc trả về — để bù lệch đồng hồ máy người xem. */
  server_time: string;
  current_step: number;
  side_select_map_id: string | null;
  side_select_team: TeamSlot | null;
  current_action: { type: BanPickStepKind; team: TeamSlot } | null;
  team_a: { id: number | null; name: string };
  team_b: { id: number | null; name: string };
  map_pool: Array<{ map_code: string; map_name: string; image_url: string }>;
  state: BanPickState;
  viewer_team_slot: TeamSlot | null;
  viewer_is_admin: boolean;
}

export interface RoundBanPickEnvelope {
  data: RoundBanPickPayload;
  permissions: {
    can_act: boolean;
    viewer_team_slot: TeamSlot | null;
    is_admin: boolean;
  };
}

interface RoundBanPickInitInput {
  match_id: number | string;
  format?: BanPickFormat;
  countdown_seconds?: number;
}

export type RoundBanPickActionInput = { match_id?: number | string } & (
  | { command: "act"; map_id?: string; side?: Side }
  | { command: "ready"; ready: boolean }
  | { command: "start" | "skip" | "reset" }
  | {
      command: "configure";
      config: {
        format?: BanPickFormat;
        countdown_seconds?: number;
        first_team?: TeamSlot;
        decider_rule?: DeciderRule;
      };
    }
);

const authHeaders = (token?: string | null) =>
  token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;

export const getRoundBanPick = (
  roundSlug: string,
  query?: { match_id?: number | string },
  token?: string | null,
) => {
  const params = new URLSearchParams();
  if (query?.match_id !== undefined) params.set("match_id", String(query.match_id));
  params.set("_ts", String(Date.now()));

  return axios.get<RoundBanPickEnvelope>(
    `${API_BASE}/api/tournaments/round/${roundSlug}/ban-pick?${params}`,
    authHeaders(token),
  );
};

export const mutateRoundBanPick = (
  roundSlug: string,
  payload: RoundBanPickActionInput,
  token?: string | null,
) =>
  axios.post<RoundBanPickEnvelope>(
    `${API_BASE}/api/tournaments/round/${roundSlug}/ban-pick/action`,
    payload,
    authHeaders(token),
  );

/** BTC tạo phòng (chưa chạy giờ). Gọi lại khi phòng còn chờ → cập nhật thể thức / thời gian. */
export const initRoundBanPick = (
  roundSlug: string,
  payload: RoundBanPickInitInput,
  token?: string | null,
) =>
  axios.post<RoundBanPickEnvelope>(
    `${API_BASE}/api/tournaments/round/${roundSlug}/ban-pick/init`,
    payload,
    authHeaders(token),
  );

export const deleteRoundBanPick = (
  roundSlug: string,
  query?: { match_id?: number | string },
  token?: string | null,
) => {
  const params = new URLSearchParams();
  if (query?.match_id !== undefined) params.set("match_id", String(query.match_id));
  const qs = params.toString();

  return axios.delete(
    `${API_BASE}/api/tournaments/round/${roundSlug}/ban-pick${qs ? `?${qs}` : ""}`,
    authHeaders(token),
  );
};

/** Phòng ban/pick chưa xong mà người đăng nhập là chủ đội (dải báo toàn trang). */
export interface MyBanPickRoom {
  match_id: number;
  status: BanPickStatus;
  format: BanPickFormat;
  tournament_name: string | null;
  team_a: { id: number | null; name: string };
  team_b: { id: number | null; name: string };
  viewer_team_slot: TeamSlot | null;
  ready: Record<TeamSlot, boolean>;
  current_action: { type: BanPickStepKind; team: TeamSlot } | null;
  side_select_map_id: string | null;
  turn_deadline_at: string | null;
  turn_time_limit_seconds: number;
  server_time: string;
  /** Đường dẫn vào phòng (lobby của giải hoặc /round/:slug). */
  link: string;
}

export const getMyBanPicks = (token: string) =>
  axios.get<{ data: MyBanPickRoom[] }>(
    `${API_BASE}/api/tournaments/round/ban-picks/mine?_ts=${Date.now()}`,
    authHeaders(token),
  );
