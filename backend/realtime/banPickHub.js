import jwt from "jsonwebtoken";
import { pool } from "../utils/db.js";
import {
  findBanPickSession,
  isBanPickAdmin,
  resolveUserTeamSlot,
  settleBanPickSession,
  toBanPickPayload,
} from "../utils/banPick.js";

/**
 * Realtime ban/pick: người xem mở 1 WebSocket theo match_id, server đẩy trạng thái mỗi khi phòng đổi
 * (thao tác, tạo phòng, làm lại, hết giờ). Hết giờ được server tự hẹn — không cần ai tải trang.
 *
 * Lưu ý: hub nằm trong bộ nhớ 1 tiến trình. Chạy nhiều instance backend thì cần pub/sub chung
 * (vd. Postgres LISTEN/NOTIFY) — client vẫn tự gọi API dự phòng nên không bị kẹt.
 */

const socketsByMatchId = new Map();
const timeoutByMatchId = new Map();
let heartbeatTimer = null;

const toNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const send = (socket, payload) => {
  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
};

const getJwtSecret = () => process.env.SECRET ?? process.env.JWT_SECRET ?? "dev-secret";

/** Token tuỳ chọn (?token=): khán giả không đăng nhập vẫn xem realtime được. */
export const resolveSocketUser = async (token) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const userId = toNumber(decoded?.id);
    if (!userId) return null;
    const { rows } = await pool.query(
      "SELECT id, username, role_id, team_id FROM users WHERE id = $1",
      [userId],
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
};

const payloadFor = (session, user) =>
  toBanPickPayload(session, resolveUserTeamSlot(user, session), isBanPickAdmin(user, session));

const startHeartbeat = () => {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    for (const [matchId, entries] of socketsByMatchId) {
      for (const entry of [...entries]) {
        if (!send(entry.socket, { type: "ping" })) entries.delete(entry);
      }
      if (!entries.size) socketsByMatchId.delete(matchId);
    }
    if (!socketsByMatchId.size) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }, 25000);
};

/** Hẹn giờ hết lượt: tới hạn → server chọn ngẫu nhiên (settle) rồi đẩy cho mọi người. */
const scheduleTimeout = (session) => {
  const matchId = toNumber(session?.match_id);
  if (!matchId) return;

  clearTimeout(timeoutByMatchId.get(matchId));
  timeoutByMatchId.delete(matchId);

  if (session.state?.status !== "running" || !session.turn_started_at) return;
  if (!socketsByMatchId.get(matchId)?.size) return;

  const limit = Number(session.turn_time_limit_seconds) || 30;
  const deadline = new Date(session.turn_started_at).getTime() + limit * 1000;
  const delay = Math.max(0, deadline - Date.now()) + 250;

  timeoutByMatchId.set(
    matchId,
    setTimeout(async () => {
      timeoutByMatchId.delete(matchId);
      try {
        const fresh = await findBanPickSession({ matchId });
        const settled = await settleBanPickSession(fresh);
        await broadcastBanPick(matchId, settled);
      } catch {
        // Lần thao tác / tải trang kế tiếp vẫn xử lý hết giờ
      }
    }, delay),
  );
};

/** Đẩy trạng thái mới (mỗi người nhận payload theo quyền của mình) và hẹn lại giờ. */
export const broadcastBanPick = async (matchId, session) => {
  const id = toNumber(matchId ?? session?.match_id);
  if (!id) return;
  const entries = socketsByMatchId.get(id);
  if (entries?.size) {
    for (const entry of [...entries]) {
      const ok = session
        ? send(entry.socket, { type: "session", data: payloadFor(session, entry.user) })
        : send(entry.socket, { type: "not_created" });
      if (!ok) entries.delete(entry);
    }
  }
  if (session) scheduleTimeout(session);
};

export const registerBanPickSocket = async ({ socket, user, matchId, roundSlug }) => {
  const session = await settleBanPickSession(await findBanPickSession({ roundSlug, matchId }));
  const id = toNumber(session?.match_id) ?? toNumber(matchId);
  if (!id) {
    send(socket, { type: "not_created" });
    return () => {};
  }

  const entry = { socket, user };
  if (!socketsByMatchId.has(id)) socketsByMatchId.set(id, new Set());
  socketsByMatchId.get(id).add(entry);
  startHeartbeat();

  send(socket, session ? { type: "session", data: payloadFor(session, user) } : { type: "not_created" });
  if (session) scheduleTimeout(session);

  return () => {
    const entries = socketsByMatchId.get(id);
    entries?.delete(entry);
    if (entries && !entries.size) {
      socketsByMatchId.delete(id);
      clearTimeout(timeoutByMatchId.get(id));
      timeoutByMatchId.delete(id);
    }
  };
};
