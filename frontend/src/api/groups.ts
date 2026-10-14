import axios from "axios";
import { API_BASE } from "@/lib/apiBase";

/**
 * Org (kind "org") và đội lẻ (kind "squad") — backend/controllers/groups.js.
 * Đăng ký giải theo đội — backend/controllers/tournaments/registrations.js.
 */

export type GroupKind = "org" | "squad";
export type GroupRole = "founder" | "lead" | "member" | "captain";

export interface GroupMember {
  user_id: number | string;
  role: GroupRole;
  joined_at: string | null;
  username: string;
  nickname: string | null;
  profile_picture: string | null;
  riot_account: string | null;
}

export interface GroupSummary {
  id: number | string;
  name: string;
  short_name: string;
  logo_url: string | null;
  team_color_hex?: string | null;
  created_by?: number | string;
  founder_name?: string | null;
  member_count?: number;
}

export interface GroupTournament {
  registration_id: number | string;
  id: number | string;
  name: string;
  slug: string | null;
  date_start: string | null;
  date_end: string | null;
  series_id: number | string | null;
  game: string | null;
  captain_user_id: number | string | null;
  roster_count: number;
}

export interface JoinRequest {
  id: number | string;
  user_id: number | string;
  message: string | null;
  created_at: string;
  username: string;
  nickname: string | null;
  profile_picture: string | null;
  riot_account: string | null;
}

export interface InviteLink {
  id: number | string;
  token: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  created_at: string;
}

export interface GroupDetail extends GroupSummary {
  kind: GroupKind;
  squad_tournament_id: number | string | null;
  members: GroupMember[];
  tournaments: GroupTournament[];
  my_role: GroupRole | null;
  can_manage: boolean;
  my_request: { id: number | string; status: string; created_at: string } | null;
  pending_requests: JoinRequest[];
  invite_links: InviteLink[];
}

export interface MyGroups {
  orgs: Array<GroupSummary & { kind: "org"; role: GroupRole }>;
  squads: Array<
    GroupSummary & {
      kind: "squad";
      role: GroupRole;
      tournament_id: number | string;
      tournament_name: string | null;
      tournament_slug: string | null;
    }
  >;
}

export interface InvitePreview {
  group: { id: number | string; name: string; short_name: string; logo_url: string | null; kind: GroupKind };
  member_count: number;
  already_member: boolean;
  expires_at: string | null;
}

export interface RegistrationOptions {
  tournament: {
    id: number | string;
    name: string;
    in_series: boolean;
    registration_mode: string;
    is_open: boolean;
    register_end: string | null;
    roster_min: number;
    roster_max: number;
  };
  org: (GroupSummary & {
    my_role: GroupRole | null;
    can_register: boolean;
    registration_id: number | null;
    members: GroupMember[];
  }) | null;
  my_registrations: Array<{
    registration_id: number | string;
    team_id: number | string;
    name: string;
    short_name: string;
    logo_url: string | null;
    kind: GroupKind;
    captain_user_id: number | string | null;
  }>;
}

export interface RegistrationEntry {
  id: number | string;
  tournament_id: number | string;
  team_id: number | string;
  captain_user_id: number | string | null;
  team: { id: number | string; name: string; short_name: string; logo_url: string | null; kind: GroupKind };
  roster: Array<Pick<GroupMember, "user_id" | "username" | "nickname" | "profile_picture" | "riot_account">>;
  can_manage: boolean;
  members: GroupMember[];
  roster_min: number;
  roster_max: number;
  is_open: boolean;
}

const auth = (token?: string | null) =>
  token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;

const base = `${API_BASE}/api/groups`;

export const listOrgs = (q = "") =>
  axios.get<{ data: GroupSummary[] }>(`${base}?q=${encodeURIComponent(q)}`);
export const getMyGroups = (token: string) => axios.get<{ data: MyGroups }>(`${base}/mine`, auth(token));
export const getGroupDetail = (id: number | string, token?: string | null) =>
  axios.get<{ data: GroupDetail }>(`${base}/${id}`, auth(token));
export const createOrg = (
  payload: { name: string; short_name: string; logo_url?: string | null; team_color_hex?: string | null },
  token: string,
) => axios.post<{ data: GroupSummary }>(base, payload, auth(token));
export const updateGroup = (
  id: number | string,
  payload: Partial<{ name: string; short_name: string; logo_url: string | null; team_color_hex: string | null }>,
  token: string,
) => axios.put(`${base}/${id}`, payload, auth(token));
export const requestToJoin = (id: number | string, message: string, token: string) =>
  axios.post(`${base}/${id}/join-requests`, { message }, auth(token));
export const cancelJoinRequest = (id: number | string, token: string) =>
  axios.delete(`${base}/${id}/join-requests/mine`, auth(token));
export const decideJoinRequest = (requestId: number | string, decision: "approve" | "decline", token: string) =>
  axios.post(`${base}/join-requests/${requestId}/${decision}`, {}, auth(token));
export const createInviteLink = (id: number | string, token: string, expiresInHours = 72) =>
  axios.post<{ data: InviteLink }>(`${base}/${id}/invite-links`, { expires_in_hours: expiresInHours }, auth(token));
export const revokeInviteLink = (id: number | string, linkId: number | string, token: string) =>
  axios.delete(`${base}/${id}/invite-links/${linkId}`, auth(token));
export const getInvitePreview = (inviteToken: string, token?: string | null) =>
  axios.get<{ data: InvitePreview }>(`${base}/invite/${encodeURIComponent(inviteToken)}`, auth(token));
export const acceptInvite = (inviteToken: string, token: string) =>
  axios.post<{ data: { id: number | string; kind: GroupKind } }>(
    `${base}/invite/${encodeURIComponent(inviteToken)}/accept`,
    {},
    auth(token),
  );
export const setMemberRole = (id: number | string, userId: number | string, role: "lead" | "member", token: string) =>
  axios.patch(`${base}/${id}/members/${userId}`, { role }, auth(token));
export const kickMember = (id: number | string, userId: number | string, token: string) =>
  axios.delete(`${base}/${id}/members/${userId}`, auth(token));
export const leaveGroup = (id: number | string, token: string) =>
  axios.post(`${base}/${id}/leave`, {}, auth(token));
export const transferGroup = (id: number | string, userId: number | string, token: string) =>
  axios.post(`${base}/${id}/transfer`, { user_id: userId }, auth(token));
export const disbandGroup = (id: number | string, token: string) => axios.delete(`${base}/${id}`, auth(token));

const regBase = `${API_BASE}/api/registrations`;

export const getRegistrationOptions = (tournamentId: number | string, token?: string | null) =>
  axios.get<{ data: RegistrationOptions }>(`${regBase}/options/${tournamentId}`, auth(token));
export const getRegistrationEntry = (registrationId: number | string, token?: string | null) =>
  axios.get<{ data: RegistrationEntry }>(`${regBase}/entry/${registrationId}`, auth(token));
export const registerOrg = (
  tournamentId: number | string,
  payload: { org_id: number | string; player_ids: Array<number | string>; captain_user_id: number | string },
  token: string,
) => axios.post(`${regBase}/${tournamentId}`, { kind: "org", ...payload }, auth(token));
export const registerSquad = (
  tournamentId: number | string,
  squad: { name: string; short_name: string; logo_url?: string | null },
  token: string,
) =>
  axios.post<{ data: { registration_id: number | string; team_id: number | string } }>(
    `${regBase}/${tournamentId}`,
    { kind: "squad", squad },
    auth(token),
  );
export const updateRegistration = (
  registrationId: number | string,
  payload: { player_ids: Array<number | string>; captain_user_id: number | string },
  token: string,
) => axios.put(`${regBase}/entry/${registrationId}`, payload, auth(token));
export const withdrawRegistration = (registrationId: number | string, token: string) =>
  axios.delete(`${regBase}/entry/${registrationId}`, auth(token));

/** Lỗi từ backend ({ error }) → câu hiển thị. */
export const apiErrorMessage = (error: unknown, fallback = "Có lỗi xảy ra") => {
  if (axios.isAxiosError(error)) {
    const message = String((error.response?.data as { error?: unknown } | undefined)?.error ?? "").trim();
    if (message) return message;
  }
  return error instanceof Error ? error.message : fallback;
};

export const ROLE_LABEL: Record<GroupRole, string> = {
  founder: "Sáng lập",
  lead: "Lead",
  member: "Thành viên",
  captain: "Đội trưởng",
};

export const inviteUrl = (inviteToken: string) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/join/${inviteToken}`;

export const memberName = (member: { nickname?: string | null; username: string }) =>
  member.nickname || member.username;
