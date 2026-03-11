import { Elysia } from "elysia";
import logger from "./logger.js";
import { pool } from "./db.js";
import jwt from "jsonwebtoken";
export const requestLogger = new Elysia({ name: "request-logger" }).onRequest(
  ({ request }) => {
    const url = new URL(request.url);
    logger.info("Method:", request.method);
    logger.info("Path:  ", url.pathname);
    logger.info("---");
  },
);

export const deriveAuthContext = async ({ request }) => {
  const auth = request.headers.get("authorization");

  const match = auth?.match(/^Bearer\s+(.+)$/i);
  let token = match?.[1]?.trim() ?? null;

  // Use DEFAULT_AUTH_TOKEN if no Authorization header provided.
  // You can set DEFAULT_AUTH_TOKEN in env, otherwise it falls back to the hardcoded token below.
  const DEFAULT_AUTH_TOKEN = process.env.DEFAULT_AUTH_TOKEN ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IkJlYWNvbiIsImlkIjoiNiIsImlhdCI6MTc3MzA0MDUwNiwiZXhwIjoxNzgzODQwNTA2fQ.WbMVxhy3lojNkWCmkpXnZLm1qTgI4jZDq1Lo8zpHu6E";

  if (!token) {
    token = DEFAULT_AUTH_TOKEN ?? null;
  }

  if (!token) return { token: null, user: null, authError: "NO_TOKEN" };
  const secret =
    process.env.SECRET ?? process.env.JWT_SECRET ?? "dev-secret";
  const decoded = jwt.verify(token, secret);

  const userId = Number(decoded?.id);
  if (!Number.isFinite(userId)) {
    return { token, user: null, authError: "BAD_ID" };
  }

  const { rows } = await pool.query(
    "SELECT id, username, role_id, team_id FROM users WHERE id = $1",
    [userId],
  );

  return { token, user: rows[0] ?? null, authError: null };
};

export const authContext = new Elysia({ name: "auth-context" }).derive(
  deriveAuthContext,
);
export const unknownEndpoint = new Elysia({ name: "unknown-endpoint" }).all(
  "*",
  ({ set }) => {
    set.status = 404;
    return { error: "unknown endpoint" };
  },
);

export const errorHandler = new Elysia({ name: "error-handler" }).onError(
  ({ error, set }) => {
    logger.error(error?.message);

    if (error?.name === "CastError") {
      set.status = 400;
      return { error: "malformatted id" };
    }

    if (error?.name === "ValidationError") {
      set.status = 400;
      return { error: error.message };
    }

    if (error?.name === "JsonWebTokenError") {
      set.status = 401;
      return { error: "token invalid" };
    }

    if (error?.name === "TokenExpiredError") {
      set.status = 401;
      return { error: "token expired" };
    }

    set.status = 500;
    return { error: "internal server error" };
  },
);

export default {
  deriveAuthContext,
  requestLogger,
  authContext,
  unknownEndpoint,
  errorHandler,
};
