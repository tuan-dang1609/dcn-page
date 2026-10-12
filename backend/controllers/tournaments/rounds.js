import { Elysia } from "elysia";
import middleware from "../../utils/middleware.js";
import {
  buildRoundSlug,
  createBanPickSession,
  deleteBanPickSession,
  ensureBanPickTables,
  ensureSessionByRoundSlug,
  findBanPickSession,
  isBanPickAdmin,
  listOwnerBanPickSessions,
  mutateBanPickSession,
  resolveUserTeamSlot,
  settleBanPickSession,
  toBanPickPayload,
} from "../../utils/banPick.js";
import { pool } from "../../utils/db.js";
import {
  broadcastBanPick,
  registerBanPickSocket,
  resolveSocketUser,
} from "../../realtime/banPickHub.js";

const roundRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Round";
const STAFF_ROLE_IDS = new Set([1, 2, 3]);

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getMatchContextForSlug = async (matchId) => {
  const { rows } = await pool.query(
    `
    SELECT m.id,
           m.round_number,
           m.match_no,
           t.slug AS tournament_slug,
           t.created_by AS tournament_owner_id
    FROM matches m
    LEFT JOIN tournaments t ON t.id = m.tournament_id
    WHERE m.id = $1
    LIMIT 1
    `,
    [matchId],
  );

  return rows[0] ?? null;
};

const normalizeRoundSlug = ({ slug, matchContext }) => {
  const incoming = String(slug ?? "")
    .trim()
    .toLowerCase();

  if (incoming) return incoming;

  if (!matchContext) return "";

  return buildRoundSlug({
    tournamentSlug: matchContext.tournament_slug,
    roundNumber: matchContext.round_number,
    matchNo: matchContext.match_no,
    matchId: matchContext.id,
  });
};

/** Tạo/setup phòng: BTC (role 1–3) hoặc người tạo giải. */
const canManageMatch = (user, matchContext) =>
  Boolean(user) &&
  (STAFF_ROLE_IDS.has(toNumber(user.role_id)) ||
    toNumber(matchContext?.tournament_owner_id) === toNumber(user.id));

const toEnvelope = (session, user) => {
  const viewerTeamSlot = resolveUserTeamSlot(user, session);
  const viewerIsAdmin = isBanPickAdmin(user, session);
  return {
    data: toBanPickPayload(session, viewerTeamSlot, viewerIsAdmin),
    permissions: {
      can_act: Boolean(viewerTeamSlot),
      viewer_team_slot: viewerTeamSlot,
      is_admin: viewerIsAdmin,
    },
  };
};

roundRouter.onBeforeHandle(async () => {
  await ensureBanPickTables();
});

/** Phòng ban/pick đang chờ/chạy của chủ đội đang đăng nhập (dải báo toàn trang). */
roundRouter.get(
  "/ban-picks/mine",
  async ({ user, set }) => {
    if (!user) {
      set.status = 200;
      return { data: [] };
    }
    set.status = 200;
    return { data: await listOwnerBanPickSessions(user) };
  },
  {
    tags: [TAG],
    summary: "Open ban/pick rooms where the current user is a team owner",
    security: [{ bearerAuth: [] }],
  },
);

roundRouter.get(
  "/:round_slug/ban-pick",
  async ({ params, query, user, set }) => {
    // Chỉ đọc — phòng do BTC tạo (init/create), không tự tạo khi có người mở trang
    const found = await findBanPickSession({
      roundSlug: params.round_slug,
      matchId: query?.match_id,
    });
    const session = await settleBanPickSession(found);
    if (session && session !== found) void broadcastBanPick(session.match_id, session);

    if (!session) {
      set.status = 404;
      return { error: "Trận này chưa được BTC tạo phòng ban/pick" };
    }

    set.status = 200;
    return toEnvelope(session, user);
  },
  {
    tags: [TAG],
    summary: "Get ban/pick by round slug (fallback match_id)",
  },
);

const createOrInit = async ({ params, body, user, set }, { ensure }) => {
  const matchId = toNumber(body?.match_id);
  if (!matchId) {
    set.status = 400;
    return { error: "match_id không hợp lệ" };
  }

  const matchContext = await getMatchContextForSlug(matchId);
  if (!matchContext) {
    set.status = 404;
    return { error: "Không tìm thấy match" };
  }

  if (!canManageMatch(user, matchContext)) {
    set.status = 403;
    return { error: "Chỉ BTC mới được tạo phòng ban/pick" };
  }

  const roundSlug = normalizeRoundSlug({
    slug: params.round_slug,
    matchContext,
  });

  const input = {
    roundSlug,
    matchId,
    format: body?.format,
    countdownSeconds: body?.countdown_seconds,
  };
  const session = ensure
    ? await ensureSessionByRoundSlug(input)
    : await createBanPickSession(input);

  if (!session) {
    set.status = 500;
    return { error: "Không thể tạo phòng ban/pick" };
  }

  void broadcastBanPick(session.match_id, session);
  set.status = 201;
  return toEnvelope(session, user);
};

roundRouter.post(
  "/:round_slug/ban-pick/init",
  (ctx) => createOrInit(ctx, { ensure: true }),
  {
    tags: [TAG],
    summary: "Create (or reconfigure while waiting) the ban/pick room — does not start the timer",
    security: [{ bearerAuth: [] }],
  },
);

roundRouter.post(
  "/:round_slug/ban-pick/create",
  (ctx) => createOrInit(ctx, { ensure: false }),
  {
    tags: [TAG],
    summary: "Create new ban/pick room for match",
    security: [{ bearerAuth: [] }],
  },
);

roundRouter.delete(
  "/:round_slug/ban-pick",
  async ({ params, query, user, set }) => {
    const roleId = toNumber(user?.role_id);

    if (!user || !STAFF_ROLE_IDS.has(roleId)) {
      set.status = 403;
      return { error: "Bạn không có quyền xóa ban/pick" };
    }

    const matchId = toNumber(query?.match_id);

    const result = await deleteBanPickSession({
      roundSlug: params.round_slug,
      matchId,
    });

    if (!result.deleted) {
      set.status = 200;
      return {
        message: "Không có phiên ban/pick để xóa",
        data: null,
      };
    }

    void broadcastBanPick(result.session?.match_id ?? matchId, null);
    set.status = 200;
    return {
      message: "Đã xóa phiên ban/pick",
      data: result.session,
    };
  },
  {
    tags: [TAG],
    summary: "Delete ban/pick by round slug and optional match id",
    security: [{ bearerAuth: [] }],
  },
);

/**
 * Lệnh:
 *   chủ đội — act { map_id | side }, ready { ready }
 *   BTC     — start, skip (chọn ngẫu nhiên lượt hiện tại), reset, configure { config }
 */
roundRouter.post(
  "/:round_slug/ban-pick/action",
  async ({ params, body, user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Bạn cần đăng nhập" };
    }

    const command = String(body?.command ?? "").trim();
    if (!command) {
      set.status = 400;
      return { error: "Thiếu command" };
    }

    const result = await mutateBanPickSession({
      roundSlug: params.round_slug,
      matchId: toNumber(body?.match_id),
      user,
      command,
      mapId: body?.map_id,
      side: body?.side,
      ready: body?.ready,
      config: body?.config,
    });

    if (!result.ok) {
      set.status = result.status;
      return { error: result.error };
    }

    void broadcastBanPick(result.session.match_id, result.session);
    set.status = 200;
    return toEnvelope(result.session, user);
  },
  {
    tags: [TAG],
    summary: "Ban/pick commands (act, ready, start, skip, reset, configure)",
    security: [{ bearerAuth: [] }],
  },
);

/**
 * Realtime: ws …/round/ban-pick/stream?match_id=…&token=… (token tuỳ chọn).
 * Server gửi { type: "session", data } mỗi khi phòng đổi, { type: "not_created" } khi chưa có phòng.
 */
const socketCleanups = new Map();
const socketKey = (ws) => ws?.id ?? ws?.raw ?? ws;

roundRouter.ws("/ban-pick/stream", {
  open: async (ws) => {
    const url = (() => {
      try {
        return new URL(ws?.data?.request?.url ?? ws?.request?.url ?? "");
      } catch {
        return null;
      }
    })();
    const user = await resolveSocketUser(url?.searchParams.get("token"));
    const socket = { send: (frame) => ws.send(frame) };
    const cleanup = await registerBanPickSocket({
      socket,
      user,
      matchId: url?.searchParams.get("match_id"),
      roundSlug: url?.searchParams.get("round_slug"),
    });
    socketCleanups.set(socketKey(ws), cleanup);
  },
  close: (ws) => {
    socketCleanups.get(socketKey(ws))?.();
    socketCleanups.delete(socketKey(ws));
  },
  message: () => {
    // Client không gửi gì — thao tác vẫn qua POST /action
  },
});

export default roundRouter;
