import axios from "axios";
import { API_BASE } from "@/lib/apiBase";

const teamInvitesBaseUrl = `${API_BASE}/api/team-invites`;

const withAuthHeaders = (token?: string | null) =>
  token
    ? {
        withCredentials: true,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    : {
        withCredentials: true,
      };

export interface TeamInviteRecord {
  id: number;
  team_id: number;
  inviter_id: number;
  invitee_id: number;
  status: "pending" | "accepted" | "declined" | "revoked" | string;
  created_at: string;
  updated_at: string;
  team_name?: string;
  team_short_name?: string;
  team_logo_url?: string | null;
  inviter_username?: string;
  inviter_nickname?: string | null;
  invitee_username?: string;
  invitee_nickname?: string | null;
  invitee_profile_picture?: string | null;
  invitee_team_id?: number | null;
}

export const getMyTeamInvites = (token?: string | null) =>
  axios.get<{ invites?: TeamInviteRecord[] }>(
    `${teamInvitesBaseUrl}/me`,
    withAuthHeaders(token),
  );

export const getTeamInvites = (
  teamId: number | string,
  token?: string | null,
) =>
  axios.get<{ invites?: TeamInviteRecord[] }>(
    `${teamInvitesBaseUrl}/teams/${teamId}`,
    withAuthHeaders(token),
  );

export const sendTeamInvite = (
  teamId: number | string,
  inviteeId: number | string,
  token?: string | null,
) =>
  axios.post(
    `${teamInvitesBaseUrl}/teams/${teamId}`,
    { invitee_id: inviteeId },
    withAuthHeaders(token),
  );

export const acceptTeamInvite = (
  inviteId: number | string,
  token?: string | null,
) =>
  axios.post(
    `${teamInvitesBaseUrl}/${inviteId}/accept`,
    undefined,
    withAuthHeaders(token),
  );

export const declineTeamInvite = (
  inviteId: number | string,
  token?: string | null,
) =>
  axios.post(
    `${teamInvitesBaseUrl}/${inviteId}/decline`,
    undefined,
    withAuthHeaders(token),
  );

export const revokeTeamInvite = (
  inviteId: number | string,
  token?: string | null,
) => axios.delete(`${teamInvitesBaseUrl}/${inviteId}`, withAuthHeaders(token));
