import { useEffect } from "react";
import { API_BASE } from "@/lib/apiBase";

export interface TeamInviteStreamPayload {
  type?: string;
  event_id?: string;
  event_name?: string;
  invitee_id?: number | string;
  inviter_id?: number | string;
  invite?: {
    id?: number;
    team_id?: number;
    inviter_id?: number;
    invitee_id?: number;
    status?: string;
    created_at?: string;
    updated_at?: string;
  };
}

interface UseTeamInviteStreamParams {
  enabled: boolean;
  token: string | null;
  userId: number | null;
  onEvent: (payload: TeamInviteStreamPayload) => void;
}

export const useTeamInviteStream = ({
  enabled,
  token,
  userId,
  onEvent,
}: UseTeamInviteStreamParams) => {
  useEffect(() => {
    if (!enabled || !token || !Number.isFinite(userId ?? NaN)) return;

    let closed = false;
    let retryTimer: number | null = null;
    let socket: WebSocket | null = null;

    const connect = () => {
      const endpoint = new URL(`${API_BASE}/api/team-invites/stream`);
      endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
      endpoint.searchParams.set("token", token);

      const nextSocket = new WebSocket(endpoint.toString());
      socket = nextSocket;

      nextSocket.onmessage = (event) => {
        try {
          const payload = JSON.parse(
            String(event.data),
          ) as TeamInviteStreamPayload;

          if (payload.type === "ping") return;

          const targetInviteeId = Number(
            payload.invitee_id ?? payload.invite?.invitee_id,
          );
          const targetInviterId = Number(
            payload.inviter_id ?? payload.invite?.inviter_id,
          );

          const isForInvitee =
            Number.isFinite(targetInviteeId) && targetInviteeId === userId;
          const isForInviter =
            Number.isFinite(targetInviterId) && targetInviterId === userId;

          const targetUserId = Number(
            payload.user_id ?? payload.user?.id ?? NaN,
          );
          const targetUserIds = Array.isArray(payload.user_ids)
            ? payload.user_ids.map(Number).filter(Number.isFinite)
            : [];

          const isForUser =
            Number.isFinite(targetUserId) && targetUserId === userId;
          const isForUserInList =
            targetUserIds.length > 0 &&
            targetUserIds.includes(userId as number);

          if (!isForInvitee && !isForInviter && !isForUser && !isForUserInList)
            return;

          try {
            // If this payload indicates a membership change or an invite accepted,
            // also emit a global event so components that don't use the hook
            // directly can react (e.g., TournamentRegistration, ProfilePage).
            const isMembershipChange =
              payload.type === "team_membership_changed";
            const isInviteUpdated = payload.type === "invite_updated";
            const inviteAccepted = Boolean(
              isInviteUpdated &&
              (payload.invite?.status === "accepted" ||
                (typeof payload.event_name === "string" &&
                  payload.event_name.includes("accept"))),
            );

            if (isMembershipChange || inviteAccepted) {
              try {
                window.dispatchEvent(
                  new CustomEvent("team:members-updated", { detail: payload }),
                );
              } catch {
                // ignore dispatch errors in older browsers
              }
            }

            onEvent(payload);
          } catch {
            // Ignore errors from onEvent handlers.
          }
        } catch {
          // Ignore malformed frames.
        }
      };

      nextSocket.onopen = () => {
        if (retryTimer) {
          window.clearTimeout(retryTimer);
          retryTimer = null;
        }
      };

      nextSocket.onerror = () => {
        // Let onclose handle reconnects.
      };

      nextSocket.onclose = (event) => {
        if (closed) return;

        if (event.code === 4401 || event.code === 4403 || event.code === 1008) {
          return;
        }

        retryTimer = window.setTimeout(connect, 1500);
      };
    };

    connect();

    return () => {
      closed = true;

      if (retryTimer) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }

      socket?.close();
    };
  }, [enabled, token, userId, onEvent]);
};
