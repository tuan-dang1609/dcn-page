import axios from "axios";
import { API_BASE } from "@/lib/apiBase";

/** Tìm đội (giải theo đội ngoài series) — backend/controllers/tournaments/teamFinder.js. */

export type RecruitMode = "closed" | "approval" | "open";

export interface FinderPlayer {
  user_id: number | string;
  username: string;
  nickname: string | null;
  profile_picture: string | null;
  riot_account?: string | null;
}

export interface RecruitingTeam {
  registration_id: number | string;
  team_id: number | string;
  name: string;
  short_name: string;
  logo_url: string | null;
  recruit_mode: RecruitMode;
  recruit_roles: string[];
  recruit_note: string | null;
  accept_auto_fill: boolean;
  captain_user_id: number | string | null;
  roster: Array<FinderPlayer & { ingame_role: string | null }>;
  open_slots: number;
}

export interface FreeAgent extends FinderPlayer {
  primary_role: string | null;
  secondary_role: string | null;
  can_captain: boolean;
  note: string | null;
  created_at: string;
}

export interface FinderRequest {
  id: number | string;
  direction: "request" | "invite";
  ingame_role: string | null;
  message: string | null;
  created_at: string;
  registration_id: number | string;
  team_id: number | string;
  name: string;
  short_name: string;
  logo_url: string | null;
}

export interface TeamFinderOverview {
  tournament: {
    id: number;
    name: string;
    game: string | null;
    roles_required: boolean;
    positions: string[];
    any_role: string | null;
    is_open: boolean;
    register_end: string | null;
    team_formed_at: string | null;
    roster_min: number;
    roster_max: number;
    can_form_now: boolean;
  };
  teams: RecruitingTeam[];
  free_agents: FreeAgent[];
  me: {
    free_agent: {
      status: "waiting" | "placed" | "unplaced";
      primary_role: string | null;
      secondary_role: string | null;
      can_captain: boolean;
      note: string | null;
    } | null;
    in_team: boolean;
    requests: FinderRequest[];
    invites: FinderRequest[];
    managed_team: {
      registration_id: number;
      team_id: number;
      requests: Array<FinderPlayer & { id: number | string; ingame_role: string | null; message: string | null }>;
      invited_user_ids: number[];
    } | null;
    default_roles: { primary_role: string | null; secondary_role: string | null } | null;
  } | null;
}

const auth = (token?: string | null) => (token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
const base = `${API_BASE}/api/team-finder`;

export const getTeamFinder = (tournamentId: number | string, token?: string | null) =>
  axios.get<{ data: TeamFinderOverview }>(`${base}/${tournamentId}`, auth(token));

export const joinFreeAgents = (
  tournamentId: number | string,
  payload: { primary_role: string | null; secondary_role: string | null; can_captain: boolean; note?: string },
  token: string,
) => axios.post(`${base}/${tournamentId}/free-agent`, payload, auth(token));

export const leaveFreeAgents = (tournamentId: number | string, token: string) =>
  axios.delete(`${base}/${tournamentId}/free-agent`, auth(token));

export const setRecruiting = (
  registrationId: number | string,
  payload: { recruit_mode: RecruitMode; recruit_roles: string[]; recruit_note?: string; accept_auto_fill: boolean },
  token: string,
) => axios.put(`${base}/recruit/${registrationId}`, payload, auth(token));

export const joinRecruitingTeam = (
  registrationId: number | string,
  payload: { ingame_role: string | null; message?: string },
  token: string,
) => axios.post<{ data: { joined: boolean } }>(`${base}/recruit/${registrationId}/join`, payload, auth(token));

export const inviteFreeAgent = (registrationId: number | string, userId: number | string, token: string) =>
  axios.post(`${base}/recruit/${registrationId}/invite`, { user_id: userId }, auth(token));

export const answerTeamInvite = (requestId: number | string, decision: "accept" | "decline", token: string) =>
  axios.post(`${base}/invites/${requestId}/${decision}`, {}, auth(token));

export const formTeamsNow = (tournamentId: number | string, token: string) =>
  axios.post<{
    data: {
      final: boolean;
      created: unknown[];
      filled: unknown[];
      unplaced: number[];
      still_waiting: number[];
    } | null;
  }>(`${base}/${tournamentId}/form-now`, {}, auth(token));
