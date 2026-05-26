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
          const payload = JSON.parse(String(event.data)) as TeamInviteStreamPayload;

          if (payload.type === "ping") return;

          const targetUserId = Number(
            payload.invitee_id ?? payload.invite?.invitee_id,
          );

          if (!Number.isFinite(targetUserId) || targetUserId !== userId) {
            return;
          }

          onEvent(payload);
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
