import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import swagger from "@elysiajs/swagger";
import { testConnection } from "./utils/db.js";
import logger from "./utils/logger.js";
import middleware from "./utils/middleware.js";

import userRouter from "./controllers/users.js";
import loginRouter from "./controllers/login.js";
import milestoneRouter from "./controllers/tournaments/milestones.js";
import teamRouter from "./controllers/teams.js";
import tournamentRouter from "./controllers/tournaments/tournament.js";
import ruleRouter from "./controllers/tournaments/rules.js";
import requirementRouter from "./controllers/tournaments/requirements.js";
import teamTourRoute from "./controllers/tournaments/tournament_team.js";
import playerTourRoute from "./controllers/tournaments/tournament_team_player.js";
import matchRouter from "./controllers/tournaments/matches.js";
import bracketRouter from "./controllers/tournaments/brackets.js";

const app = new Elysia()
  .use(cors())
  .use(
    swagger({
      path: "/docs",
      provider: "swagger-ui",
      documentation: {
        security: [{ bearerAuth: [] }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
            },
          },
        },
      },
    }),
  )
  .use(middleware.requestLogger)
  // Prefix đặt tập trung tại app.js
  .group("/api/users", (app) => app.use(userRouter))
  .group("/api/login", (app) => app.use(loginRouter))
  .group("/api/teams", (app) => app.use(teamRouter))
  .group("/api/tournaments", (app) => app.use(tournamentRouter))
  .group("/api/tournaments/milestones", (app) => app.use(milestoneRouter))
  .group("/api/tournaments/rules", (app) => app.use(ruleRouter))
  .group("/api/tournaments/requirements", (app) => app.use(requirementRouter))
  .group("/api/tournaments/teams", (app) => app.use(teamTourRoute))
  .group("/api/tournaments/team/players", (app) => app.use(playerTourRoute))
  .group("/api/tournaments/brackets", (app) => app.use(bracketRouter))
  .group("/api/tournaments/matches", (app) => app.use(matchRouter))
  .use(middleware.unknownEndpoint)
  .use(middleware.errorHandler);

(async () => {
  try {
    await testConnection();
    logger.info("connected to Postgres");
  } catch (err) {
    logger.error("error connecting to Postgres:", err.message);
  }
})();

export default app;
