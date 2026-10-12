import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  getRoundBanPick,
  mutateRoundBanPick,
  type RoundBanPickActionInput,
  type RoundBanPickEnvelope,
  type RoundBanPickPayload,
} from "@/api/banpick";
import { API_BASE } from "@/lib/apiBase";

/**
 * Phòng ban/pick realtime:
 * - WebSocket …/round/ban-pick/stream: server đẩy trạng thái mỗi khi phòng đổi (kể cả hết giờ).
 * - Mất kết nối → tự gọi API 1,5 giây/lần tới khi nối lại (thử lại sau 1s, 2s, 4s… tối đa 15s).
 * - Đang nối socket vẫn gọi API 30 giây/lần để chắc chắn không lệch.
 */

const FALLBACK_POLL_MS = 1500;
const SAFETY_POLL_MS = 30000;

const errorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const serverError = String(
      (error.response?.data as { error?: unknown } | undefined)?.error ?? "",
    ).trim();
    if (serverError) return serverError;
  }
  return error instanceof Error ? error.message : fallback;
};

const toEnvelope = (data: RoundBanPickPayload): RoundBanPickEnvelope => ({
  data,
  permissions: {
    can_act: Boolean(data.viewer_team_slot),
    viewer_team_slot: data.viewer_team_slot,
    is_admin: Boolean(data.viewer_is_admin),
  },
});

type Params = {
  roundSlug?: string;
  matchId?: number | null;
  token?: string | null;
  enabled?: boolean;
};

export const useBanPickRoom = ({ roundSlug, matchId, token, enabled = true }: Params) => {
  const [envelope, setEnvelope] = useState<RoundBanPickEnvelope | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notCreated, setNotCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isLive, setIsLive] = useState(false);
  /** Lệch giờ server − máy người xem (ms). */
  const [clockOffset, setClockOffset] = useState(0);
  const inFlight = useRef(false);

  const apply = useCallback((next: RoundBanPickEnvelope) => {
    setEnvelope(next);
    setNotCreated(false);
    setError(null);
    setIsLoading(false);
    const serverMs = Date.parse(next.data?.server_time ?? "");
    if (Number.isFinite(serverMs)) setClockOffset(serverMs - Date.now());
  }, []);

  const markNotCreated = useCallback(() => {
    setEnvelope(null);
    setNotCreated(true);
    setError(null);
    setIsLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!roundSlug || inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await getRoundBanPick(roundSlug, { match_id: matchId ?? undefined }, token);
      apply(response.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) markNotCreated();
      else setError(errorMessage(err, "Không tải được dữ liệu ban/pick"));
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  }, [apply, markNotCreated, matchId, roundSlug, token]);

  // Lần tải đầu (và khi đổi trận / tài khoản)
  useEffect(() => {
    if (!enabled || !roundSlug) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void refresh();
  }, [enabled, refresh, roundSlug]);

  // WebSocket
  useEffect(() => {
    if (!enabled || (!matchId && !roundSlug)) return;

    let socket: WebSocket | null = null;
    let retryTimer: number | null = null;
    let attempt = 0;
    let disposed = false;

    const connect = () => {
      const url = new URL(`${API_BASE}/api/tournaments/round/ban-pick/stream`, window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      if (matchId) url.searchParams.set("match_id", String(matchId));
      if (roundSlug) url.searchParams.set("round_slug", roundSlug);
      if (token) url.searchParams.set("token", token);

      socket = new WebSocket(url.toString());
      socket.onopen = () => {
        attempt = 0;
        setIsLive(true);
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as
            | { type: "session"; data: RoundBanPickPayload }
            | { type: "not_created" | "ping" };
          if (message.type === "session") apply(toEnvelope(message.data));
          else if (message.type === "not_created") markNotCreated();
        } catch {
          // bỏ qua khung lỗi
        }
      };
      socket.onclose = () => {
        setIsLive(false);
        if (disposed) return;
        const delay = Math.min(15000, 1000 * 2 ** attempt);
        attempt += 1;
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      socket?.close();
      setIsLive(false);
    };
  }, [apply, enabled, markNotCreated, matchId, roundSlug, token]);

  const isDone = envelope?.data?.status === "done";

  // Dự phòng: socket rớt → gọi API nhanh; socket ổn → thỉnh thoảng đối chiếu
  useEffect(() => {
    if (!enabled || !roundSlug || isDone) return;
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const id = window.setInterval(tick, isLive ? SAFETY_POLL_MS : FALLBACK_POLL_MS);
    if (!isLive) {
      window.addEventListener("focus", tick);
      document.addEventListener("visibilitychange", tick);
    }
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, isDone, isLive, refresh, roundSlug]);

  const send = useCallback(
    async (payload: RoundBanPickActionInput) => {
      if (!roundSlug) return false;
      setIsSending(true);
      setActionError(null);
      try {
        const response = await mutateRoundBanPick(
          roundSlug,
          { ...payload, match_id: matchId ?? undefined },
          token,
        );
        apply(response.data);
        return true;
      } catch (err) {
        setActionError(errorMessage(err, "Không gửi được thao tác"));
        void refresh();
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [apply, matchId, refresh, roundSlug, token],
  );

  const session: RoundBanPickPayload | null = envelope?.data ?? null;

  return {
    session,
    viewerSlot: envelope?.permissions?.viewer_team_slot ?? null,
    isAdmin: Boolean(envelope?.permissions?.is_admin),
    isLoading,
    notCreated,
    error,
    actionError,
    isSending,
    /** Đang nhận realtime qua WebSocket. */
    isLive,
    clockOffset,
    refresh,
    send,
  };
};

export type BanPickRoom = ReturnType<typeof useBanPickRoom>;
