import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import logger from "../utils/logger.js";
import { pool } from "../utils/db.js";
import {
  ensureBanPickTables,
  ensureSessionByRoundSlug,
  getBanPickSessionByRoundSlug,
  mutateBanPickSession,
  resolveUserTeamSlot,
  toBanPickPayload,
} from "../utils/banPick.js";

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

const ROOM_PREFIX = "banpick:round:";

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getRoomName = (roundSlug) => `${ROOM_PREFIX}${roundSlug}`;

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

const ensureSessionFromJoinPayload = async (payload) => {
  const roundSlug = String(payload?.round_slug ?? "")
    .trim()
    .toLowerCase();

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

const emitSessionState = ({ io, roundSlug, session, user, socket }) => {
  const viewerTeamSlot = resolveUserTeamSlot(user, session);
  const payload = toBanPickPayload(session, viewerTeamSlot);

  io.to(getRoomName(roundSlug)).emit("banpick:state", payload);

  if (socket) {
    socket.emit("banpick:self", {
      viewer_team_slot: viewerTeamSlot,
      can_act: Boolean(viewerTeamSlot),
      user_id: toNumber(user?.id),
    });
  }
};

export const registerBanPickSocket = async (httpServer) => {
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
    const user = await findUserByToken(token);

    socket.on("banpick:join", async (payload = {}, ack) => {
      const ensured = await ensureSessionFromJoinPayload(payload);

      if (!ensured.ok) {
        if (typeof ack === "function") {
          ack({ ok: false, error: ensured.error });
        }
        socket.emit("banpick:error", { message: ensured.error });
        return;
      }

      const roomName = getRoomName(ensured.roundSlug);
      socket.join(roomName);
      socket.data.roundSlug = ensured.roundSlug;

      emitSessionState({
        io,
        roundSlug: ensured.roundSlug,
        session: ensured.session,
        user,
        socket,
      });

      if (typeof ack === "function") {
        ack({
          ok: true,
          data: toBanPickPayload(
            ensured.session,
            resolveUserTeamSlot(user, ensured.session),
          ),
        });
      }
    });

    socket.on("banpick:select_map", async (payload = {}, ack) => {
      const roundSlug = String(
        payload?.round_slug ?? socket.data.roundSlug ?? "",
      ).trim();

      const result = await mutateBanPickSession({
        roundSlug,
        user,
        command: "select_map",
        mapId: payload?.map_id,
      });

      if (!result.ok) {
        if (typeof ack === "function") ack({ ok: false, error: result.error });
        socket.emit("banpick:error", { message: result.error });
        return;
      }

      emitSessionState({ io, roundSlug, session: result.session, user });
      if (typeof ack === "function") {
        ack({
          ok: true,
          data: toBanPickPayload(
            result.session,
            resolveUserTeamSlot(user, result.session),
          ),
        });
      }
    });

    socket.on("banpick:confirm_action", async (payload = {}, ack) => {
      const roundSlug = String(
        payload?.round_slug ?? socket.data.roundSlug ?? "",
      ).trim();

      const result = await mutateBanPickSession({
        roundSlug,
        user,
        command: "confirm_action",
      });

      if (!result.ok) {
        if (typeof ack === "function") ack({ ok: false, error: result.error });
        socket.emit("banpick:error", { message: result.error });
        return;
      }

      emitSessionState({ io, roundSlug, session: result.session, user });
      if (typeof ack === "function") {
        ack({
          ok: true,
          data: toBanPickPayload(
            result.session,
            resolveUserTeamSlot(user, result.session),
          ),
        });
      }
    });

    socket.on("banpick:select_side", async (payload = {}, ack) => {
      const roundSlug = String(
        payload?.round_slug ?? socket.data.roundSlug ?? "",
      ).trim();

      const result = await mutateBanPickSession({
        roundSlug,
        user,
        command: "select_side",
        side: payload?.side,
      });

      if (!result.ok) {
        if (typeof ack === "function") ack({ ok: false, error: result.error });
        socket.emit("banpick:error", { message: result.error });
        return;
      }

      emitSessionState({ io, roundSlug, session: result.session, user });
      if (typeof ack === "function") {
        ack({
          ok: true,
          data: toBanPickPayload(
            result.session,
            resolveUserTeamSlot(user, result.session),
          ),
        });
      }
    });

    socket.on("banpick:reset", async (payload = {}, ack) => {
      const roundSlug = String(
        payload?.round_slug ?? socket.data.roundSlug ?? "",
      ).trim();

      const result = await mutateBanPickSession({
        roundSlug,
        user,
        command: "reset",
      });

      if (!result.ok) {
        if (typeof ack === "function") ack({ ok: false, error: result.error });
        socket.emit("banpick:error", { message: result.error });
        return;
      }

      emitSessionState({ io, roundSlug, session: result.session, user });
      if (typeof ack === "function") {
        ack({
          ok: true,
          data: toBanPickPayload(
            result.session,
            resolveUserTeamSlot(user, result.session),
          ),
        });
      }
    });

    socket.on("banpick:sync", async (payload = {}, ack) => {
      const roundSlug = String(
        payload?.round_slug ?? socket.data.roundSlug ?? "",
      ).trim();
      const session = await getBanPickSessionByRoundSlug(roundSlug);

      if (!session) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Không tìm thấy phiên ban/pick" });
        }
        return;
      }

      const payloadData = toBanPickPayload(
        session,
        resolveUserTeamSlot(user, session),
      );

      socket.emit("banpick:state", payloadData);
      if (typeof ack === "function") {
        ack({ ok: true, data: payloadData });
      }
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
