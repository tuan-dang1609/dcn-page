import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_BASE } from "@/lib/apiBase";
import { getRoundBanPick, type RoundBanPickPayload } from "@/api/banpick";

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

  useEffect(() => {
    if (!roundSlug) return;

    const socket = io(API_BASE, {
      path: "/socket.io",
      transports: ["polling", "websocket"],
      auth: token ? { token: `Bearer ${token}` } : {},
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
    });

    socket.on("banpick:state", (payload: RoundBanPickPayload) => {
      setSession(payload);
    });

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
    (eventName: string, payload: Record<string, unknown>) => {
      return new Promise<AckResponse>((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ ok: false, error: "Socket chưa kết nối" });
          return;
        }

        socket.emit(eventName, payload, (ack: AckResponse) => {
          if (ack?.ok && ack.data) {
            setSession(ack.data);
          }

          if (ack?.ok === false && ack?.error) {
            setError(ack.error);
          }

          resolve(ack ?? { ok: true });
        });
      });
    },
    [],
  );

  const selectMap = useCallback(
    async (mapId: string) => {
      if (!roundSlug) return;
      await emitWithAck("banpick:select_map", {
        round_slug: roundSlug,
        map_id: mapId,
      });
    },
    [emitWithAck, roundSlug],
  );

  const confirmAction = useCallback(async () => {
    if (!roundSlug) return;
    await emitWithAck("banpick:confirm_action", {
      round_slug: roundSlug,
    });
  }, [emitWithAck, roundSlug]);

  const selectSide = useCallback(
    async (side: "ATK" | "DEF") => {
      if (!roundSlug) return;
      await emitWithAck("banpick:select_side", {
        round_slug: roundSlug,
        side,
      });
    },
    [emitWithAck, roundSlug],
  );

  const reset = useCallback(async () => {
    if (!roundSlug) return;
    await emitWithAck("banpick:reset", {
      round_slug: roundSlug,
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
