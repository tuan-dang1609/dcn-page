import express from "express";
import { testConnection } from "./utils/db.js";
import logger from "./utils/logger.js";
import middleware from "./utils/middleware.js";
import userRouter from "./controllers/users.js";
import loginRouter from "./controllers/login.js";
import teamRouter from "./controllers/teams.js";
import cors from "cors";
const app = express();
app.use(cors());

(async () => {
  try {
    await testConnection();
    logger.info("connected to Postgres");
  } catch (err) {
    logger.error("error connecting to Postgres:", err.message);
  }
})();

app.use(express.static("dist"));
app.use(express.json());
app.use(middleware.requestLogger);
app.use(middleware.tokenExtractor);
app.use(middleware.userExtractor);
app.use("/api/users", userRouter);
app.use("/api/login", loginRouter);
app.use("/api/teams", teamRouter);
app.use(middleware.unknownEndpoint);
app.use(middleware.errorHandler);

export default app;
