import logger from "./utils/logger.js";
import app from "./app.js";
import config from "./utils/config.js";

const isPromiseLike = (value: unknown): value is Promise<unknown> =>
  Boolean(value && typeof (value as { then?: unknown }).then === "function");

const resolveListenResult = async (listenResult: unknown) => {
  if (isPromiseLike(listenResult)) {
    return await listenResult;
  }

  return listenResult;
};

(async () => {
  try {
    const port = process.env.PORT ?? config.PORT ?? 3000;
    const listenResult = await resolveListenResult(app.listen(port));
    logger.info(`Server running on port ${port}`);

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
