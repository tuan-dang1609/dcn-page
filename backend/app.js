import { Elysia } from "elysia";
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
import seriesRouter from "./controllers/series.js";

const serializeQuery = (query = {}) => {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null) {
          params.append(key, String(item));
        }
      });
      return;
    }

    params.append(key, String(value));
  });

  return params.toString();
};

const allowedOrigins = [
  "http://localhost:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
];

const buildCorsHeaders = (origin) => ({
  "access-control-allow-origin": origin,
  "access-control-allow-credentials": "true",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization",
  vary: "Origin",
});

const app = new Elysia()
  .get("/sso/login-riot", ({ request }) => {
    const nextUrl = new URL("/api/users/riot/login", request.url);
    return Response.redirect(nextUrl.toString(), 302);
  })
  // Legacy Riot callback support for existing Riot Portal redirect registrations.
  .get("/oauth2-callback", ({ query, request }) => {
    const queryString = serializeQuery(query);
    const nextPath = queryString
      ? `/api/users/riot/callback?${queryString}`
      : "/api/users/riot/callback";

    return Response.redirect(new URL(nextPath, request.url).toString(), 302);
  })
  .onRequest(({ request, set }) => {
    const origin = request.headers.get("origin");

    if (!origin || !allowedOrigins.includes(origin)) return;

    set.headers = {
      ...(set.headers ?? {}),
      ...buildCorsHeaders(origin),
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(origin),
      });
    }
  })
  .onAfterHandle(({ request, response, set }) => {
    const origin = request.headers.get("origin");
    const pathname = new URL(request.url).pathname;

    if (!origin || !allowedOrigins.includes(origin)) return;
    if (!pathname.startsWith("/api")) return;

    const headers = new Headers(
      response instanceof Response
        ? response.headers
        : { "content-type": "application/json" },
    );

    Object.entries(buildCorsHeaders(origin)).forEach(([key, value]) => {
      headers.set(key, value);
    });

    if (response instanceof Response) {
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }

    return new Response(JSON.stringify(response), {
      status: Number(set.status) || 200,
      headers,
    });
  })
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
  .group("/api/series", (app) => app.use(seriesRouter))
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
