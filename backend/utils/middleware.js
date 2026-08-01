import { Elysia } from "elysia";
import logger from "./logger.js";
import { pool } from "./db.js";
import jwt from "jsonwebtoken";

const extractErrorReason = (response) => {
  if (response == null) return null;
  if (typeof response === "string") {
    const trimmed = response.trim();
    return trimmed || null;
  }

  if (typeof response === "object" && !(response instanceof Response)) {
    if (typeof response.error === "string" && response.error.trim()) {
      return response.error.trim();
    }
    if (typeof response.message === "string" && response.message.trim()) {
      return response.message.trim();
    }
    try {
      return JSON.stringify(response);
    } catch {
      return String(response);
    }
  }

  return null;
};

const resolveStatus = (set, response) => {
  const statusFromSet = Number(set.status);
  if (Number.isFinite(statusFromSet)) return statusFromSet;

  if (response instanceof Response) {
    const statusFromResponse = Number(response.status);
    if (Number.isFinite(statusFromResponse)) return statusFromResponse;
  }

  return 200;
};

const resolveErrorReason = async (response) => {
  const direct = extractErrorReason(response);
  if (direct) return direct;

  if (!(response instanceof Response)) return null;

  try {
    const data = await response.clone().json();
    return extractErrorReason(data);
  } catch {
    try {
      const text = (await response.clone().text())?.trim();
      return text || null;
    } catch {
      return null;
    }
  }
};

export const requestLogger = new Elysia({ name: "request-logger" })
  .onRequest(({ request }) => {
    const url = new URL(request.url);
    logger.info("Method:", request.method);
    logger.info("Path:  ", url.pathname);
  })
  .onAfterHandle(async ({ set, response }) => {
    const status = resolveStatus(set, response);

    if (status >= 400) {
      const reason = await resolveErrorReason(response);
      logger.error("Status:", status);
      logger.error("Error: ", reason || "unknown error");
    }

    logger.info("---");
  });

export const deriveAuthContext = async ({ request }) => {
  const auth = request.headers.get("authorization");

  const match = auth?.match(/^Bearer\s+(.+)$/i);
  let token = match?.[1]?.trim() ?? null;

  // Use DEFAULT_AUTH_TOKEN only if explicitly provided via env.
  // Do NOT fall back to a hardcoded token; requests without Authorization should be unauthenticated.
  const DEFAULT_AUTH_TOKEN = process.env.DEFAULT_AUTH_TOKEN ?? null;

  if (!token) {
    token = DEFAULT_AUTH_TOKEN;
  }

  if (!token) return { token: null, user: null, authError: "NO_TOKEN" };
  const secret = process.env.SECRET ?? process.env.JWT_SECRET ?? "dev-secret";
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
  ({ request, error, set, code }) => {
    const url = new URL(request.url);

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
    // Fallback log for unexpected throws (onAfterHandle may still also log Status/Error).
    logger.error("Method:", request.method);
    logger.error("Path:  ", url.pathname);
    logger.error("Status:", 500);
    logger.error("Code:  ", code || error?.name || "Error");
    logger.error("Error: ", error?.message || String(error));
    if (error?.stack) logger.error(error.stack);
    logger.error("---");

    return {
      error: error?.message || "internal server error",
    };
  },
);

export default {
  deriveAuthContext,
  requestLogger,
  authContext,
  unknownEndpoint,
  errorHandler,
};
