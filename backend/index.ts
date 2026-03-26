import logger from "./utils/logger.js";
import app from "./app.js";
import config from "./utils/config.js";
import { registerBanPickSocket } from "./realtime/banPickSocket.js";

const isPromiseLike = (value: unknown): value is Promise<unknown> =>
  Boolean(value && typeof (value as { then?: unknown }).then === "function");

const resolveListenResult = async (listenResult: unknown) => {
  if (isPromiseLike(listenResult)) {
    return await listenResult;
  }

  return listenResult;
};

const resolveHttpServerCandidates = (listenResult: any) => {
  const appAny = app as any;
  const rawCandidates = [
    listenResult?.server?.server,
    listenResult?.server?.raw,
    listenResult?.server,
    listenResult?.raw,
    listenResult,
    appAny?.server?.server,
    appAny?.server?.raw,
    appAny?.server,
  ];

  const candidates: any[] = [];
  for (const candidate of rawCandidates) {
    if (!candidate) continue;
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates;
};

const describeCandidate = (candidate: any) => {
  if (!candidate) return "unknown";
  const ctor = candidate?.constructor?.name;
  return ctor ? String(ctor) : typeof candidate;
};

const describeCandidateCapabilities = (candidate: any) => ({
  hasOn: typeof candidate?.on === "function",
  hasEmit: typeof candidate?.emit === "function",
  hasRemoveListener: typeof candidate?.removeListener === "function",
  hasListen: typeof candidate?.listen === "function",
});

const tryRegisterBanPickSocket = async (listenResult: any) => {
  const candidates = resolveHttpServerCandidates(listenResult);
  if (candidates.length === 0) {
    logger.info(
      "[socket.io] Unable to initialize because no server candidate was found",
    );
    return false;
  }

  let lastError: unknown = null;
  let hasNonCompatibilityError = false;

  for (const candidate of candidates) {
    logger.info("[socket.io] probing candidate", {
      candidate: describeCandidate(candidate),
      capabilities: describeCandidateCapabilities(candidate),
    });

    try {
      await registerBanPickSocket(candidate);
      logger.info(
        `[socket.io] attached using server candidate: ${describeCandidate(candidate)}`,
      );
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isCompatibilityError = message.includes(
        "Incompatible HTTP server candidate",
      );

      if (!isCompatibilityError) {
        hasNonCompatibilityError = true;
        lastError = err;
        logger.error(
          `[socket.io] candidate ${describeCandidate(candidate)} failed:`,
          message,
        );
      } else {
        logger.info(
          `[socket.io] candidate ${describeCandidate(candidate)} skipped: ${message}`,
        );
      }
    }
  }

  if (hasNonCompatibilityError && lastError) {
    throw lastError;
  }

  return false;
};

(async () => {
  try {
    const port = process.env.PORT ?? config.PORT ?? 3000;
    const listenResult = await resolveListenResult(app.listen(port));
    logger.info(`Server running on port ${port}`);

    try {
      const attached = await tryRegisterBanPickSocket(listenResult);
      if (!attached) {
        logger.info(
          "[socket.io] Socket.IO unavailable on current runtime. Falling back to HTTP polling on frontend.",
        );
      }
    } catch (socketError) {
      logger.error(
        "[socket.io] Initialization failed:",
        socketError instanceof Error
          ? socketError.message
          : String(socketError),
      );
    }

    // Self-ping to keep Render (free-tier) instance from idling.
    // Render provides `PORT` env var; we ping public /alive endpoint.
    const selfUrl = "https://dcn-page.onrender.com/alive";
    setInterval(async () => {
      try {
        // global fetch is available in Bun; swallow errors silently.
        await fetch(selfUrl).catch(() => {});
      } catch (err) {
        // logger.warn doesn't exist, use error to avoid crashing
        logger.error(
          "self-ping failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }, 30_000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("error connecting to Postgres:", msg);
    process.exit(1);
  }
})();
