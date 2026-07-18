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

    // Keep Render free-tier awake while this process is running.
    // External cron (.github/workflows/keepalive.yml) is still required after spin-down.
    const selfUrl =
      process.env.RENDER_EXTERNAL_URL
        ? `${String(process.env.RENDER_EXTERNAL_URL).replace(/\/+$/, "")}/alive`
        : process.env.BACKEND_ALIVE_URL ||
          "https://dcn-page.onrender.com/alive";

    const pingAlive = async () => {
      try {
        await fetch(selfUrl).catch(() => {});
      } catch (err) {
        logger.error(
          "self-ping failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    };

    void pingAlive();
    setInterval(pingAlive, 30_000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("error connecting to Postgres:", msg);
    process.exit(1);
  }
})();
