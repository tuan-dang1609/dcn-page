import logger from "./utils/logger.js";
import app from "./app.js";
import config from "./utils/config.js";
(async () => {
  try {
    app.listen(config.PORT, () => {
      logger.info(`Server running on port ${config.PORT}`);
    });
  } catch (err) {
    logger.error("error connecting to Postgres:", err.message);
    process.exit(1);
  }
})();
