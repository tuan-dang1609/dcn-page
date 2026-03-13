import logger from "./utils/logger.js";
import app from "./app.js";
import config from "./utils/config.js";
import { registerBanPickSocket } from "./realtime/banPickSocket.js";

const resolveHttpServerCandidates = (listenResult: any) => {
  const appAny = app as any;
  const rawCandidates = [
    appAny?.server?.server,
    appAny?.server,
    listenResult?.server,
    listenResult,
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

const tryRegisterBanPickSocket = async (listenResult: any) => {
  const candidates = resolveHttpServerCandidates(listenResult);
  if (candidates.length === 0) {
    logger.error(
      "[socket.io] Unable to initialize because no server candidate was found",
    );
    return false;
  }

  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      await registerBanPickSocket(candidate);
      logger.info(
        `[socket.io] attached using server candidate: ${describeCandidate(candidate)}`,
      );
      return true;
    } catch (err) {
      lastError = err;
      logger.error(
        `[socket.io] candidate ${describeCandidate(candidate)} failed:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  if (lastError) {
    throw lastError;
  }

  return false;
};

(async () => {
  try {
    const port = process.env.PORT ?? config.PORT ?? 3000;
    const listenResult = app.listen(port);
    logger.info(`Server running on port ${port}`);

    try {
      const attached = await tryRegisterBanPickSocket(listenResult);
      if (!attached) {
        logger.error(
          "[socket.io] Unable to initialize after trying all server candidates",
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
