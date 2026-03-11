import logger from "./utils/logger.js";
import app from "./app.js";
import config from "./utils/config.js";

(async () => {
  try {
    const port = process.env.PORT ?? config.PORT ?? 3000;
    app.listen(port, () => {
      logger.info(`Server running on port ${port}`);

      // Self-ping to keep Render (free-tier) instance from idling.
      // Render provides `PORT` env var; we ping localhost to generate activity.
      const selfUrl = `http://127.0.0.1:${port}/alive`;
      setInterval(async () => {
        try {
          // global fetch is available in Bun; swallow errors silently.
          await fetch(selfUrl).catch(() => {});
        } catch (err) {
          // logger.warn doesn't exist, use error to avoid crashing
          logger.error("self-ping failed:", err instanceof Error ? err.message : String(err));
        }
      }, 30_000);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("error connecting to Postgres:", msg);
    process.exit(1);
  }
})();
