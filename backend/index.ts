import logger from "./utils/logger.js";
import app from "./app.js";
import config from "./utils/config.js";

(async () => {
  try {
    const port = process.env.PORT ?? config.PORT ?? 3000;
    app.listen(port, () => {
      logger.info(`Server running on port ${port}`);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("error connecting to Postgres:", msg);
    process.exit(1);
  }
})();
