import axios from "axios";
import { API_BASE } from "@/lib/apiBase";

export type BanPickPhase = "ban_pick" | "side_select" | "complete";
export type TeamSlot = "team1" | "team2";
export type Side = "ATK" | "DEF";

export interface BanPickMapState {
  mapId: string;
  status: "available" | "banned" | "picked" | "decider";
  actionBy?: TeamSlot;
  actionType?: "ban" | "pick";
  side?: { team1: Side; team2: Side };
  sideChosenBy?: TeamSlot;
}

export interface BanPickState {
  maps: BanPickMapState[];
  currentStep: number;
  format: "BO1" | "BO3" | "BO5";
  teamNames: { team1: string; team2: string };
  phase: BanPickPhase;
  selectedMapId: string | null;
  sideSelectMapId: string | null;
  sideSelectTeam: TeamSlot | null;
  actionLog: Array<{
    step: number;
    mapId: string;
    action: string;
    team: TeamSlot;
    side?: Side;
  }>;
}

export interface RoundBanPickPayload {
  id: number;
  round_slug: string;
  match_id: number;
  tournament_id: number | null;
  round_number: number | null;
  match_no: number | null;
  status: string;
  phase: BanPickPhase;
  format: "BO1" | "BO3" | "BO5";
  current_step: number;
  selected_map_id: string | null;
  side_select_map_id: string | null;
  side_select_team: TeamSlot | null;
  current_action: { type: "ban" | "pick"; team: TeamSlot } | null;
  team_a: { id: number | null; name: string };
  team_b: { id: number | null; name: string };
  map_pool: Array<{ map_code: string; map_name: string; image_url: string }>;
  state: BanPickState;
  viewer_team_slot: TeamSlot | null;
}

interface RoundBanPickEnvelope {
  data: RoundBanPickPayload;
  permissions: {
    can_act: boolean;
    viewer_team_slot: TeamSlot | null;
  };
}

export const getRoundBanPick = (
  roundSlug: string,
  query?: { match_id?: number | string; format?: string },
) => {
  const params = new URLSearchParams();

  if (query?.match_id !== undefined) {
    params.set("match_id", String(query.match_id));
  }

  if (query?.format) {
    params.set("format", query.format);
  }

  const qs = params.toString();
  const suffix = qs ? `?${qs}` : "";

  return axios.get<RoundBanPickEnvelope>(
    `${API_BASE}/api/tournaments/round/${roundSlug}/ban-pick${suffix}`,
  );
};
