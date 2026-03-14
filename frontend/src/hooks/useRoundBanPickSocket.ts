import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_BASE } from "@/lib/apiBase";
import {
  getRoundBanPick,
  mutateRoundBanPick,
  type RoundBanPickActionInput,
  type RoundBanPickPayload,
} from "@/api/banpick";

interface UseRoundBanPickSocketParams {
  roundSlug?: string;
  matchId?: number | null;
  format?: string;
  token?: string | null;
}

interface AckResponse {
  ok?: boolean;
  error?: string;
  data?: RoundBanPickPayload;
}

const resolveErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;

  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object" &&
    "data" in error.response &&
    error.response.data &&
    typeof error.response.data === "object" &&
    "error" in error.response.data
  ) {
    const serverError = String(error.response.data.error ?? "").trim();
    if (serverError) return serverError;
  }

  return fallback;
};

export const useRoundBanPickSocket = ({
  roundSlug,
  matchId,
  format,
  token,
}: UseRoundBanPickSocketParams) => {
  const socketRef = useRef<Socket | null>(null);
  const [session, setSession] = useState<RoundBanPickPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerTeamSlot, setViewerTeamSlot] = useState<
    "team1" | "team2" | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (!roundSlug) {
        setSession(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await getRoundBanPick(roundSlug, {
          match_id: matchId ?? undefined,
          format,
        });

        if (cancelled) return;

        setSession(response.data?.data ?? null);
        setViewerTeamSlot(response.data?.permissions?.viewer_team_slot ?? null);
      } catch (err) {
        if (cancelled) return;

        const message =
          err instanceof Error
            ? err.message
            : "Không tải được dữ liệu ban/pick";

        setError(message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [roundSlug, matchId, format]);

  const runHttpFallback = useCallback(
    async (action: RoundBanPickActionInput): Promise<AckResponse> => {
      if (!roundSlug) {
        return { ok: false, error: "Thiếu round slug" };
      }

      if (!token) {
        const message = "Bạn cần đăng nhập để thao tác ban/pick";
        setError(message);
        return { ok: false, error: message };
      }

      try {
        const response = await mutateRoundBanPick(roundSlug, action, token);
        const payload = response.data?.data;

        if (payload) {
          setSession(payload);
          setError(null);
          return { ok: true, data: payload };
        }

        return { ok: true };
      } catch (err) {
        const message = resolveErrorMessage(err, "Thao tác ban/pick thất bại");
        setError(message);
        return { ok: false, error: message };
      }
    },
    [roundSlug, token],
  );

  useEffect(() => {
    if (!roundSlug) return;

    const socket = io(API_BASE, {
      path: "/socket.io",
      transports: ["polling", "websocket"],
      auth: token ? { token: `Bearer ${token}` } : {},
      reconnection: true,
      reconnectionAttempts: 4,
      reconnectionDelay: 1000,
      timeout: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      setError(null);

      socket.emit(
        "banpick:join",
        {
          round_slug: roundSlug,
          match_id: matchId ?? undefined,
          format,
        },
        (ack: AckResponse) => {
          if (ack?.ok && ack.data) {
            setSession(ack.data);
            setError(null);
          }

          if (ack?.ok === false && ack?.error) {
            setError(ack.error);
          }
        },
      );
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("connect_error", (err) => {
      setError(err?.message || "Kết nối realtime thất bại");

      const description = String(
        (err as { description?: unknown })?.description ?? "",
      ).toLowerCase();
      const message = String(err?.message ?? "").toLowerCase();

      // If server has no Socket.IO endpoint in this deployment, stop reconnect loop
      // and rely on HTTP fallback for mutating actions.
      if (
        message.includes("xhr poll error") ||
        message.includes("unknown endpoint") ||
        description.includes("unknown endpoint")
      ) {
        socket.disconnect();
      }
    });

    const onSessionPayload = (payload: RoundBanPickPayload) => {
      setSession(payload);
      setError(null);
    };

    socket.on("banpick:state", onSessionPayload);
    socket.on("banpick:update", onSessionPayload);

    socket.on("banpick:self", (payload) => {
      setViewerTeamSlot(payload?.viewer_team_slot ?? null);
    });

    socket.on("banpick:error", (payload) => {
      setError(String(payload?.message ?? "Lỗi thao tác ban/pick"));
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [roundSlug, matchId, format, token]);

  const emitWithAck = useCallback(
    async (
      eventName: string,
      payload: Record<string, unknown>,
      fallbackAction?: RoundBanPickActionInput,
    ) => {
      const socket = socketRef.current;

      if (!socket || !socket.connected) {
        if (fallbackAction) {
          return runHttpFallback(fallbackAction);
        }

        const message = "Socket chưa kết nối";
        setError(message);
        return { ok: false, error: message };
      }

      const ack = await new Promise<AckResponse>((resolve) => {
        socket.emit(eventName, payload, (socketAck: AckResponse) => {
          resolve(socketAck ?? { ok: true });
        });
      });

      if (ack?.ok && ack.data) {
        setSession(ack.data);
        setError(null);
      }

      if (ack?.ok === false && ack?.error) {
        setError(ack.error);
      }

      return ack;
    },
    [runHttpFallback],
  );

  const selectMap = useCallback(
    async (mapId: string) => {
      if (!roundSlug) return;
      await emitWithAck("banpick:select_map", {
        round_slug: roundSlug,
        map_id: mapId,
      }, {
        command: "select_map",
        map_id: mapId,
      });
    },
    [emitWithAck, roundSlug],
  );

  const confirmAction = useCallback(async () => {
    if (!roundSlug) return;
    await emitWithAck("banpick:confirm_action", {
      round_slug: roundSlug,
    }, {
      command: "confirm_action",
    });
  }, [emitWithAck, roundSlug]);

  const selectSide = useCallback(
    async (side: "ATK" | "DEF") => {
      if (!roundSlug) return;
      await emitWithAck("banpick:select_side", {
        round_slug: roundSlug,
        side,
      }, {
        command: "select_side",
        side,
      });
    },
    [emitWithAck, roundSlug],
  );

  const reset = useCallback(async () => {
    if (!roundSlug) return;
    await emitWithAck("banpick:reset", {
      round_slug: roundSlug,
    }, {
      command: "reset",
    });
  }, [emitWithAck, roundSlug]);

  const canAct = useMemo(() => Boolean(viewerTeamSlot), [viewerTeamSlot]);

  return {
    session,
    isLoading,
    isConnected,
    error,
    viewerTeamSlot,
    canAct,
    selectMap,
    confirmAction,
    selectSide,
    reset,
  };
};
