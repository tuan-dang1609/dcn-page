import axios from "axios";

const apiBaseFromVite =
  typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_API_BASE_URL ?? null)
    : null;
const apiBaseFromBun =
  typeof import.meta !== "undefined"
    ? (import.meta.env?.BUN_PUBLIC_API_BASE_URL ?? null)
    : null;
const apiBaseFromProcess =
  typeof process !== "undefined"
    ? (process.env?.BUN_PUBLIC_API_BASE_URL ?? null)
    : null;

const API_BASE =
  apiBaseFromVite ??
  apiBaseFromBun ??
  apiBaseFromProcess ??
  "http://localhost:3000";

const seriesBaseUrl = `${API_BASE}/api/series`;

export interface SeriesTournamentResponse {
  id: string | number;
  name: string;
  short_name?: string;
  game_name?: string;
  icon_game_url?: string;
  format?: string;
  banner_url?: string;
  season?: number;
  date_start?: string;
  date_end?: string;
  register_start?: string;
  register_end?: string;
  check_in_start?: string;
  check_in_end?: string;
  created_by?: string | number;
  max_player_per_team?: number;
  max_participate?: number;
  registered_count: number;
}

export interface SeriesParticipatingTeamResponse {
  team_id: string | number;
  name: string;
  short_name?: string;
  logo_url?: string;
  team_color_hex?: string;
  created_by_name?: string;
  tournaments_joined?: number;
  tournament_ids?: Array<number | string>;
}

export interface SeriesInfoResponse {
  id: string | number;
  name: string;
  description?: string;
  totalprize?: string | number;
  banner_url?: string;
  all_tournaments: SeriesTournamentResponse[];
  participating_teams?: SeriesParticipatingTeamResponse[];
}

export interface SeriesByIdResponse {
  status: "success" | "error";
  info?: SeriesInfoResponse;
}

export const getSeriesById = (id: number | string) =>
  axios.get<SeriesByIdResponse>(`${seriesBaseUrl}/${id}`);
