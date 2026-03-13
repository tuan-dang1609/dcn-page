import logger from "./utils/logger.js";
import app from "./app.js";
import config from "./utils/config.js";
import { registerBanPickSocket } from "./realtime/banPickSocket.js";

const resolveHttpServer = (listenResult: any) => {
  const appAny = app as any;
  const candidates = [
    listenResult?.server,
    listenResult,
    appAny?.server,
  ];

  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate.on === "function" &&
      typeof candidate.emit === "function"
    ) {
      return candidate;
    }
  }

  return null;
};

(async () => {
  try {
    const port = process.env.PORT ?? config.PORT ?? 3000;
    const listenResult = app.listen(port);
    logger.info(`Server running on port ${port}`);

    try {
      const httpServer = resolveHttpServer(listenResult);
      if (!httpServer) {
        logger.error(
          "[socket.io] Unable to initialize because no compatible HTTP server was found",
        );
      } else {
        await registerBanPickSocket(httpServer);
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
