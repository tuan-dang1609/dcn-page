import { useCallback, useEffect, useMemo, useState } from "react";
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
  /** When false, only fetch once on mount — no 2s polling. */
  pollEnabled?: boolean;
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
  pollEnabled = true,
}: UseRoundBanPickSocketParams) => {
  const [session, setSession] = useState<RoundBanPickPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerTeamSlot, setViewerTeamSlot] = useState<
    "team1" | "team2" | null
  >(null);

  const syncSessionFromHttp = useCallback(async () => {
    if (!roundSlug) return null;

    const response = await getRoundBanPick(
      roundSlug,
      {
        match_id: matchId ?? undefined,
        format,
        cache_bust: Date.now(),
      },
      token,
    );

    const payload = response.data?.data ?? null;
    setSession(payload);
    setViewerTeamSlot(response.data?.permissions?.viewer_team_slot ?? null);

    if (payload) {
      setError(null);
    }

    return payload;
  }, [roundSlug, matchId, format, token]);

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
        if (cancelled) return;
        await syncSessionFromHttp();
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
  }, [roundSlug, syncSessionFromHttp]);

  useEffect(() => {
    if (!roundSlug || !pollEnabled) return;
    if (
      session?.phase === "complete" ||
      session?.state?.phase === "complete"
    ) {
      return;
    }

    let disposed = false;
    let inFlight = false;

    const pollOnce = async () => {
      if (disposed || inFlight) return;
      inFlight = true;

      try {
        const payload = await syncSessionFromHttp();
        if (
          payload?.phase === "complete" ||
          payload?.state?.phase === "complete"
        ) {
          disposed = true;
        }
      } catch {
        // Ignore transient polling failures; next tick can recover.
      } finally {
        inFlight = false;
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void pollOnce();
      }
    }, 2000);

    const onFocus = () => {
      void pollOnce();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void pollOnce();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [roundSlug, pollEnabled, session?.phase, session?.state?.phase, syncSessionFromHttp]);

  const emitWithAck = useCallback(
    async (
      _eventName: string,
      payload: Record<string, unknown>,
      fallbackAction?: RoundBanPickActionInput,
    ) => {
      if (!roundSlug) {
        return { ok: false, error: "Thiếu round slug" };
      }

      if (!token) {
        const message = "Bạn cần đăng nhập để thao tác ban/pick";
        setError(message);
        return { ok: false, error: message };
      }

      const action = fallbackAction ?? (payload as RoundBanPickActionInput);

      try {
        const response = await mutateRoundBanPick(roundSlug, action, token);
        const nextPayload = response.data?.data ?? null;

        if (nextPayload) {
          setSession(nextPayload);
          setViewerTeamSlot(nextPayload.viewer_team_slot ?? null);
        }

        try {
          await syncSessionFromHttp();
        } catch {
          // Keep local payload if sync fails.
        }

        setError(null);
        return nextPayload ? { ok: true, data: nextPayload } : { ok: true };
      } catch (err) {
        const message = resolveErrorMessage(err, "Thao tác ban/pick thất bại");
        setError(message);
        return { ok: false, error: message };
      }
    },
    [roundSlug, token, syncSessionFromHttp],
  );

  const selectMap = useCallback(
    async (mapId: string) => {
      if (!roundSlug) return;
      await emitWithAck(
        "banpick:select_map",
        {
          round_slug: roundSlug,
          map_id: mapId,
          match_id: matchId ?? undefined,
        },
        {
          command: "select_map",
          map_id: mapId,
          match_id: matchId ?? undefined,
        },
      );
    },
    [emitWithAck, matchId, roundSlug],
  );

  const confirmAction = useCallback(async () => {
    if (!roundSlug) return;
    await emitWithAck(
      "banpick:confirm_action",
      {
        round_slug: roundSlug,
        match_id: matchId ?? undefined,
      },
      {
        command: "confirm_action",
        match_id: matchId ?? undefined,
      },
    );
  }, [emitWithAck, matchId, roundSlug]);

  const selectSide = useCallback(
    async (side: "ATK" | "DEF") => {
      if (!roundSlug) return;
      await emitWithAck(
        "banpick:select_side",
        {
          round_slug: roundSlug,
          side,
          match_id: matchId ?? undefined,
        },
        {
          command: "select_side",
          side,
          match_id: matchId ?? undefined,
        },
      );
    },
    [emitWithAck, matchId, roundSlug],
  );

  const reset = useCallback(async () => {
    if (!roundSlug) return;
    await emitWithAck(
      "banpick:reset",
      {
        round_slug: roundSlug,
        match_id: matchId ?? undefined,
      },
      {
        command: "reset",
        match_id: matchId ?? undefined,
      },
    );
  }, [emitWithAck, matchId, roundSlug]);

  const canAct = useMemo(() => Boolean(viewerTeamSlot), [viewerTeamSlot]);

  return {
    session,
    isLoading,
    error,
    viewerTeamSlot,
    canAct,
    selectMap,
    confirmAction,
    selectSide,
    reset,
  };
};
