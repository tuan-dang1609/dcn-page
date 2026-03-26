import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import logger from "../utils/logger.js";
import { pool } from "../utils/db.js";
import {
  ensureBanPickTables,
  ensureSessionByRoundSlug,
  mutateBanPickSession,
  resolveUserTeamSlot,
  toBanPickPayload,
} from "../utils/banPick.js";
import {
  emitBanPickRoomState,
  emitBanPickViewerContext,
  getBanPickMatchRoomName,
  getBanPickRoomName,
  setBanPickSocketServer,
} from "./banPickHub.js";

const normalizeOrigin = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();

const parseOriginList = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "https://dcnpagetest.vercel.app",
  "https://dcn-page.vercel.app",
  "https://dcn-page.onrender.com",
  process.env.FRONTEND_URL,
  process.env.FRONTEND_ORIGIN,
];

const allowedOriginSet = new Set(
  [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...parseOriginList(process.env.CORS_ALLOWED_ORIGINS),
  ]
    .map(normalizeOrigin)
    .filter(Boolean),
);

const isAllowedOrigin = (origin) => {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (allowedOriginSet.has(normalized)) return true;

  // Allow Vercel preview deployments.
  return (
    normalized.startsWith("https://") && normalized.endsWith(".vercel.app")
  );
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeRoundSlug = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const resolveRoundSlug = (payload, socket) =>
  normalizeRoundSlug(payload?.round_slug ?? socket.data.roundSlug ?? "");

const normalizeToken = (rawToken) => {
  if (!rawToken) return null;
  const str = String(rawToken).trim();
  if (!str) return null;

  const match = str.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? str;
};

const readTokenFromSocket = (socket) => {
  const fromAuth = normalizeToken(socket.handshake?.auth?.token);
  if (fromAuth) return fromAuth;

  const fromHeader = normalizeToken(
    socket.handshake?.headers?.authorization ??
      socket.handshake?.headers?.Authorization,
  );

  return fromHeader;
};

const findUserByToken = async (token) => {
  const normalized = normalizeToken(token);
  if (!normalized) return null;

  const secret = process.env.SECRET ?? process.env.JWT_SECRET ?? "dev-secret";

  let decoded = null;
  try {
    decoded = jwt.verify(normalized, secret);
  } catch {
    return null;
  }

  const userId = toNumber(decoded?.id);
  if (!userId) return null;

  const { rows } = await pool.query(
    "SELECT id, username, role_id, team_id FROM users WHERE id = $1",
    [userId],
  );

  return rows[0] ?? null;
};

const isCompatibleHttpServer = (candidate) =>
  Boolean(
    candidate &&
    typeof candidate.on === "function" &&
    typeof candidate.emit === "function" &&
    typeof candidate.removeListener === "function",
  );

const ackError = (ack, error) => {
  if (typeof ack === "function") {
    ack({ ok: false, error });
  }
};

const ackSuccess = (ack, data) => {
  if (typeof ack === "function") {
    ack({ ok: true, data });
  }
};

const emitActionError = ({ socket, ack, error }) => {
  ackError(ack, error);
  socket.emit("banpick:error", { message: error });
};

const ensureSessionFromJoinPayload = async (payload) => {
  const roundSlug = normalizeRoundSlug(payload?.round_slug);

  if (!roundSlug) {
    return { ok: false, error: "Thiếu round_slug" };
  }

  const matchId = toNumber(payload?.match_id);
  const session = await ensureSessionByRoundSlug({
    roundSlug,
    matchId,
    format: payload?.format,
  });

  if (!session) {
    return {
      ok: false,
      error: "Không tìm thấy phiên ban/pick. Hãy truyền match_id để khởi tạo",
    };
  }

  return {
    ok: true,
    roundSlug,
    session,
  };
};

const emitSessionState = ({ roundSlug, session, user, socket }) => {
  const viewerTeamSlot = resolveUserTeamSlot(user, session);
  emitBanPickRoomState({ roundSlug, session });

  if (socket) {
    socket.emit("banpick:state", toBanPickPayload(session, viewerTeamSlot));
    emitBanPickViewerContext({
      socket,
      viewerTeamSlot,
      userId: user?.id,
    });
  }
};

const mutateAndEmit = async ({
  roundSlug,
  matchId,
  user,
  command,
  mapId,
  side,
  socket,
  ack,
}) => {
  const result = await mutateBanPickSession({
    roundSlug,
    matchId,
    user,
    command,
    mapId,
    side,
  });

  if (!result.ok) {
    emitActionError({ socket, ack, error: result.error });
    return result;
  }

  emitSessionState({ roundSlug, session: result.session, user, socket });
  ackSuccess(
    ack,
    toBanPickPayload(result.session, resolveUserTeamSlot(user, result.session)),
  );

  return result;
};

export const registerBanPickSocket = async (httpServer) => {
  if (!isCompatibleHttpServer(httpServer)) {
    throw new Error(
      "Incompatible HTTP server candidate for Socket.IO attachment",
    );
  }

  const io = new Server(httpServer, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    cors: {
      origin: (origin, callback) => {
        if (!origin || isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }

        logger.error("[socket.io] CORS blocked", { origin });
        callback(new Error("CORS blocked"));
      },
      credentials: true,
    },
  });

  const attachedHttpServer = io.httpServer ?? io.engine?.httpServer ?? null;
  if (!attachedHttpServer) {
    try {
      io.close();
    } catch {
      // Ignore close errors when attachment did not happen.
    }

    throw new Error(
      "Socket.IO initialized without attaching to an HTTP server",
    );
  }

  setBanPickSocketServer(io);

  try {
    await ensureBanPickTables();
  } catch (err) {
    logger.error("[socket.io] ensureBanPickTables failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    // Keep Socket.IO online even if schema bootstrap fails,
    // so clients don't receive 404 unknown endpoint.
  }

  io.on("connection", async (socket) => {
    const token = readTokenFromSocket(socket);
    let user = null;

    try {
      user = await findUserByToken(token);
    } catch (err) {
      logger.error("[socket.io] Unable to resolve user from token", {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    socket.on("banpick:join", async (payload = {}, ack) => {
      const ensured = await ensureSessionFromJoinPayload(payload);

      if (!ensured.ok) {
        emitActionError({ socket, ack, error: ensured.error });
        return;
      }

      const roundRoomName = getBanPickRoomName(ensured.roundSlug);
      socket.join(roundRoomName);

      const matchRoomName = getBanPickMatchRoomName(ensured.session?.match_id);
      if (matchRoomName) {
        socket.join(matchRoomName);
      }

      socket.data.roundSlug = ensured.roundSlug;
      socket.data.matchId = toNumber(ensured.session?.match_id);

      emitSessionState({
        roundSlug: ensured.roundSlug,
        session: ensured.session,
        user,
        socket,
      });

      ackSuccess(
        ack,
        toBanPickPayload(
          ensured.session,
          resolveUserTeamSlot(user, ensured.session),
        ),
      );
    });

    socket.on("banpick:select_map", async (payload = {}, ack) => {
      const roundSlug = resolveRoundSlug(payload, socket);
      const matchId = toNumber(payload?.match_id ?? socket.data.matchId);
      await mutateAndEmit({
        roundSlug,
        matchId,
        user,
        command: "select_map",
        mapId: payload?.map_id,
        socket,
        ack,
      });
    });

    socket.on("banpick:confirm_action", async (payload = {}, ack) => {
      const roundSlug = resolveRoundSlug(payload, socket);
      const matchId = toNumber(payload?.match_id ?? socket.data.matchId);
      await mutateAndEmit({
        roundSlug,
        matchId,
        user,
        command: "confirm_action",
        socket,
        ack,
      });
    });

    socket.on("banpick:select_side", async (payload = {}, ack) => {
      const roundSlug = resolveRoundSlug(payload, socket);
      const matchId = toNumber(payload?.match_id ?? socket.data.matchId);
      await mutateAndEmit({
        roundSlug,
        matchId,
        user,
        command: "select_side",
        side: payload?.side,
        socket,
        ack,
      });
    });

    socket.on("banpick:reset", async (payload = {}, ack) => {
      const roundSlug = resolveRoundSlug(payload, socket);
      const matchId = toNumber(payload?.match_id ?? socket.data.matchId);
      await mutateAndEmit({
        roundSlug,
        matchId,
        user,
        command: "reset",
        socket,
        ack,
      });
    });
  });

  if (io.engine && typeof io.engine.on === "function") {
    io.engine.on("connection_error", (error) => {
      logger.error("[socket.io] connection error", {
        code: error.code,
        message: error.message,
      });
    });
  } else {
    logger.info(
      "[socket.io] engine hook is unavailable in this runtime; skip connection_error listener",
    );
  }

  logger.info("[socket.io] Ban/Pick realtime initialized");
  return io;
};
