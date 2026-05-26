import { Elysia } from "elysia";
import jwt from "jsonwebtoken";
import { pool } from "../utils/db.js";
import middleware from "../utils/middleware.js";
import {
  broadcastTeamInvitePayload,
  registerTeamInviteSocket,
  closeTeamInviteSocket,
} from "../realtime/teamInviteStreamHub.js";
import logger from "../utils/logger.js";

const teamInvitesRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "TeamInvites";
const allowedRoleIds = new Set([1, 2, 3]);
const socketStateByConnection = new WeakMap();
const realtimeInstanceId =
  process.env.REALTIME_INSTANCE_ID ??
  `instance-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const toNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const isMissingTeamInvitesTableError = (error) => {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "42P01",
  );
};

const hasTeamInvitesTable = async () => {
  const { rows } = await pool.query(
    "SELECT to_regclass('public.team_invites') AS table_name",
  );

  return Boolean(rows[0]?.table_name);
};

const getJwtSecret = () =>
  process.env.SECRET ?? process.env.JWT_SECRET ?? "dev-secret";

const resolveUserFromToken = async (token) => {
  if (!token) return null;

  const decoded = jwt.verify(token, getJwtSecret());
  const userId = toNumber(decoded?.id);

  if (!userId) return null;

  const { rows } = await pool.query(
    "SELECT id, username, role_id, team_id FROM users WHERE id = $1",
    [userId],
  );

  return rows[0] ?? null;
};

const extractSocketToken = (ws) => {
  const requestUrl = ws?.request?.url ?? ws?.data?.request?.url ?? null;

  if (!requestUrl) return null;

  try {
    return new URL(requestUrl).searchParams.get("token");
  } catch {
    return null;
  }
};

const createSocketAdapter = (ws) => ({
  send(payload) {
    const frame = typeof payload === "string" ? payload : String(payload);

    if (typeof ws?.send === "function") {
      ws.send(frame);
      return;
    }

    if (ws?.raw && typeof ws.raw.send === "function") {
      ws.raw.send(frame);
    }
  },
});

const closeSocket = (ws, code, reason) => {
  try {
    if (typeof ws?.close === "function") {
      ws.close(code, reason);
      return;
    }

    if (ws?.raw && typeof ws.raw.close === "function") {
      ws.raw.close(code, reason);
    }
  } catch {
    // ignore close failures
  }
};

const startTeamInviteBroadcast = (payload, logLabel) => {
  broadcastTeamInvitePayload(payload);

  logger.info(`[team_invites] websocket broadcast ${logLabel}`, {
    eventId: payload?.event_id ?? "unknown",
    inviteId: payload?.invite?.id ?? null,
    inviteeId: payload?.invitee_id ?? payload?.invite?.invitee_id ?? null,
  });
};

const getTeamManageAccess = async (teamId, user, set) => {
  const userId = toNumber(user?.id);
  const roleId = toNumber(user?.role_id);

  if (!userId) {
    set.status = 401;
    return { ok: false, error: { error: "Unauthorized" } };
  }

  const { rows } = await pool.query(
    "SELECT id, created_by FROM teams WHERE id = $1",
    [teamId],
  );

  if (rows.length === 0) {
    set.status = 404;
    return { ok: false, error: { error: "Team not found" } };
  }

  const team = rows[0];
  const isOwner = Number(team.created_by) === userId;

  if (!isOwner && !allowedRoleIds.has(roleId)) {
    set.status = 403;
    return { ok: false, error: { error: "Bạn không có quyền mời thành viên" } };
  }

  return { ok: true, team };
};

teamInvitesRouter.get(
  "/me",
  async ({ user, set }) => {
    const userId = toNumber(user?.id);

    logger.info("[team_invites] GET /me", {
      userId,
      hasUser: Boolean(user),
    });

    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    if (!(await hasTeamInvitesTable())) {
      set.status = 200;
      return { invites: [] };
    }

    try {
      const { rows } = await pool.query(
        `SELECT
         ti.id,
         ti.team_id,
         ti.inviter_id,
         ti.invitee_id,
         ti.status,
         ti.created_at,
         ti.updated_at,
         t.name AS team_name,
         t.short_name AS team_short_name,
         t.logo_url AS team_logo_url,
         inviter.username AS inviter_username,
         inviter.nickname AS inviter_nickname
       FROM team_invites ti
       JOIN teams t ON t.id = ti.team_id
       JOIN users inviter ON inviter.id = ti.inviter_id
       WHERE ti.invitee_id = $1
         AND ti.status = 'pending'
       ORDER BY ti.created_at DESC`,
        [userId],
      );

      logger.info("[team_invites] GET /me result", {
        userId,
        inviteCount: rows.length,
        inviteIds: rows.map((invite) => invite.id),
      });

      set.status = 200;
      return { invites: rows };
    } catch (error) {
      if (isMissingTeamInvitesTableError(error)) {
        logger.info("[team_invites] GET /me missing table", { userId });
        set.status = 200;
        return { invites: [] };
      }

      logger.error("[team_invites] GET /me error", {
        userId,
        message: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  },
  { tags: [TAG], summary: "List my team invites" },
);

teamInvitesRouter.ws(
  "/stream",
  {
    open: async (ws) => {
      try {
        const token = extractSocketToken(ws);
        const user = await resolveUserFromToken(token);

        if (!user?.id) {
          closeSocket(ws, 4401, "Unauthorized");
          return;
        }

        const userId = Number(user.id);
        const socket = createSocketAdapter(ws);
        const cleanup = registerTeamInviteSocket(userId, socket);

        socketStateByConnection.set(ws, { userId, cleanup });

        logger.info("[team_invites] websocket stream connected", {
          userId,
        });
      } catch (error) {
        logger.error("[team_invites] websocket open error", {
          message: error instanceof Error ? error.message : String(error),
        });
        closeSocket(ws, 4401, "Unauthorized");
      }
    },
    close: (ws) => {
      const state = socketStateByConnection.get(ws) ?? null;
      const userId = state?.userId ?? null;
      const cleanup = state?.cleanup;

      if (typeof cleanup === "function") {
        cleanup();
      } else if (Number.isFinite(Number(userId))) {
        closeTeamInviteSocket(Number(userId), createSocketAdapter(ws));
      }

      socketStateByConnection.delete(ws);

      logger.info("[team_invites] websocket stream disconnected", {
        userId: Number.isFinite(Number(userId)) ? Number(userId) : null,
      });
    },
    message: () => {
      // Client does not need to send anything for team invites.
    },
  },
  { tags: [TAG], summary: "Stream team invite updates" },
);

teamInvitesRouter.get(
  "/teams/:team_id",
  async ({ params, user, set }) => {
    const teamId = toNumber(params.team_id);

    if (!teamId) {
      set.status = 400;
      return { error: "Team id không hợp lệ" };
    }

    if (!(await hasTeamInvitesTable())) {
      set.status = 200;
      return { invites: [] };
    }

    const access = await getTeamManageAccess(teamId, user, set);
    if (!access.ok) return access.error;

    try {
      const { rows } = await pool.query(
        `SELECT
         ti.id,
         ti.team_id,
         ti.inviter_id,
         ti.invitee_id,
         ti.status,
         ti.created_at,
         ti.updated_at,
         invitee.username AS invitee_username,
         invitee.nickname AS invitee_nickname,
         invitee.profile_picture AS invitee_profile_picture,
         invitee.team_id AS invitee_team_id,
         inviter.username AS inviter_username,
         inviter.nickname AS inviter_nickname
       FROM team_invites ti
       JOIN users invitee ON invitee.id = ti.invitee_id
       JOIN users inviter ON inviter.id = ti.inviter_id
       WHERE ti.team_id = $1
         AND ti.status = 'pending'
       ORDER BY ti.created_at DESC`,
        [teamId],
      );

      set.status = 200;
      return { invites: rows };
    } catch (error) {
      if (isMissingTeamInvitesTableError(error)) {
        set.status = 200;
        return { invites: [] };
      }

      throw error;
    }
  },
  { tags: [TAG], summary: "List team invites" },
);

teamInvitesRouter.post(
  "/teams/:team_id",
  async ({ params, body, user, set }) => {
    const teamId = toNumber(params.team_id);
    const inviteeId = toNumber(body?.invitee_id);

    if (!teamId) {
      set.status = 400;
      return { error: "Team id không hợp lệ" };
    }

    if (!inviteeId) {
      set.status = 400;
      return { error: "invitee_id không hợp lệ" };
    }

    const access = await getTeamManageAccess(teamId, user, set);
    if (!access.ok) return access.error;

    if (!(await hasTeamInvitesTable())) {
      set.status = 503;
      return {
        error:
          "Hệ thống mời team chưa được khởi tạo. Vui lòng chạy migration team_invites_schema.sql.",
      };
    }

    const inviterId = toNumber(user?.id);

    if (inviteeId === inviterId) {
      set.status = 400;
      return { error: "Không thể mời chính mình" };
    }

    try {
      const { rows: userRows } = await pool.query(
        "SELECT id, username, team_id FROM users WHERE id = $1",
        [inviteeId],
      );

      if (userRows.length === 0) {
        set.status = 404;
        return { error: "Không tìm thấy người chơi" };
      }

      const invitee = userRows[0];

      if (Number(invitee.team_id) === teamId) {
        set.status = 409;
        return { error: "Người chơi đã ở trong team này" };
      }

      const { rows: pendingRows } = await pool.query(
        `SELECT id FROM team_invites
         WHERE team_id = $1
           AND invitee_id = $2
           AND status = 'pending'
         LIMIT 1`,
        [teamId, inviteeId],
      );

      if (pendingRows.length > 0) {
        set.status = 409;
        return { error: "Người chơi này đã có lời mời đang chờ" };
      }

      const { rows } = await pool.query(
        `INSERT INTO team_invites (team_id, inviter_id, invitee_id, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id, team_id, inviter_id, invitee_id, status, created_at, updated_at`,
        [teamId, inviterId, inviteeId],
      );

      const invite = rows[0] ?? null;
      if (invite) {
        startTeamInviteBroadcast(
          {
            event_id: `invite:${invite.id}:${Date.now()}`,
            type: "invite_created",
            invite,
            inviter_id: inviterId,
            invitee_id: inviteeId,
            origin_instance_id: realtimeInstanceId,
            ts: new Date().toISOString(),
          },
          "invite_created",
        );
      }

      set.status = 201;
      return { invite };
    } catch (error) {
      if (isMissingTeamInvitesTableError(error)) {
        set.status = 503;
        return {
          error:
            "Hệ thống mời team chưa được khởi tạo. Vui lòng chạy migration team_invites_schema.sql.",
        };
      }

      throw error;
    }
  },
  { tags: [TAG], summary: "Create team invite" },
);

teamInvitesRouter.post(
  "/:invite_id/accept",
  async ({ params, user, set }) => {
    if (!(await hasTeamInvitesTable())) {
      set.status = 503;
      return {
        error:
          "Hệ thống mời team chưa được khởi tạo. Vui lòng chạy migration team_invites_schema.sql.",
      };
    }

    const inviteId = toNumber(params.invite_id);
    const userId = toNumber(user?.id);

    if (!inviteId) {
      set.status = 400;
      return { error: "Invite id không hợp lệ" };
    }

    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    try {
      const { rows: inviteRows } = await pool.query(
        `SELECT id, team_id, inviter_id, invitee_id, status
         FROM team_invites
         WHERE id = $1 AND invitee_id = $2
         LIMIT 1`,
        [inviteId, userId],
      );

      if (inviteRows.length === 0) {
        set.status = 404;
        return { error: "Không tìm thấy lời mời" };
      }

      const invite = inviteRows[0];

      if (invite.status !== "pending") {
        set.status = 409;
        return { error: "Lời mời này không còn hợp lệ" };
      }

      const { rows: userRows } = await pool.query(
        "SELECT id, team_id FROM users WHERE id = $1 FOR UPDATE",
        [userId],
      );

      if (userRows.length === 0) {
        set.status = 404;
        return { error: "Không tìm thấy người dùng" };
      }

      const currentTeamId = userRows[0].team_id;

      if (currentTeamId && Number(currentTeamId) !== Number(invite.team_id)) {
        set.status = 409;
        return { error: "Bạn đang ở team khác, hãy rời team hiện tại trước" };
      }

      await pool.query("UPDATE users SET team_id = $1 WHERE id = $2", [
        invite.team_id,
        userId,
      ]);

      await pool.query(
        `UPDATE team_invites
         SET status = 'accepted', updated_at = NOW()
         WHERE id = $1`,
        [inviteId],
      );

      startTeamInviteBroadcast(
        {
          event_id: `invite_accepted:${inviteId}:${Date.now()}`,
          type: "invite_updated",
          event_name: "team-invites:accepted",
          invite: { ...invite, status: "accepted" },
          inviter_id: invite.inviter_id,
          invitee_id: userId,
          origin_instance_id: realtimeInstanceId,
          ts: new Date().toISOString(),
        },
        "invite_accepted",
      );

      set.status = 200;
      return { success: true, team_id: invite.team_id };
    } catch (error) {
      if (isMissingTeamInvitesTableError(error)) {
        set.status = 503;
        return {
          error:
            "Hệ thống mời team chưa được khởi tạo. Vui lòng chạy migration team_invites_schema.sql.",
        };
      }

      throw error;
    }
  },
  { tags: [TAG], summary: "Accept team invite" },
);

teamInvitesRouter.post(
  "/:invite_id/decline",
  async ({ params, user, set }) => {
    if (!(await hasTeamInvitesTable())) {
      set.status = 503;
      return {
        error:
          "Hệ thống mời team chưa được khởi tạo. Vui lòng chạy migration team_invites_schema.sql.",
      };
    }

    const inviteId = toNumber(params.invite_id);
    const userId = toNumber(user?.id);

    if (!inviteId) {
      set.status = 400;
      return { error: "Invite id không hợp lệ" };
    }

    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    try {
      const { rows: inviteRows } = await pool.query(
        `SELECT id, status, inviter_id
         FROM team_invites
         WHERE id = $1 AND invitee_id = $2
         LIMIT 1`,
        [inviteId, userId],
      );

      if (inviteRows.length === 0) {
        set.status = 404;
        return { error: "Không tìm thấy lời mời" };
      }

      const invite = inviteRows[0];

      if (invite.status !== "pending") {
        set.status = 409;
        return { error: "Lời mời này không còn hợp lệ" };
      }

      await pool.query(
        `UPDATE team_invites
         SET status = 'declined', updated_at = NOW()
         WHERE id = $1`,
        [inviteId],
      );

      startTeamInviteBroadcast(
        {
          event_id: `invite_declined:${inviteId}:${Date.now()}`,
          type: "invite_updated",
          event_name: "team-invites:changed",
          invite: { ...invite, status: "declined" },
          inviter_id: invite.inviter_id,
          invitee_id: userId,
          origin_instance_id: realtimeInstanceId,
          ts: new Date().toISOString(),
        },
        "invite_declined",
      );

      set.status = 200;
      return { success: true };
    } catch (error) {
      if (isMissingTeamInvitesTableError(error)) {
        set.status = 503;
        return {
          error:
            "Hệ thống mời team chưa được khởi tạo. Vui lòng chạy migration team_invites_schema.sql.",
        };
      }

      throw error;
    }
  },
  { tags: [TAG], summary: "Decline team invite" },
);

teamInvitesRouter.delete(
  "/:invite_id",
  async ({ params, user, set }) => {
    if (!(await hasTeamInvitesTable())) {
      set.status = 503;
      return {
        error:
          "Hệ thống mời team chưa được khởi tạo. Vui lòng chạy migration team_invites_schema.sql.",
      };
    }

    const inviteId = toNumber(params.invite_id);
    const userId = toNumber(user?.id);

    if (!inviteId) {
      set.status = 400;
      return { error: "Invite id không hợp lệ" };
    }

    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    try {
      const { rows: inviteRows } = await pool.query(
        `SELECT ti.id, ti.team_id, ti.inviter_id, ti.status, t.created_by
         FROM team_invites ti
         JOIN teams t ON t.id = ti.team_id
         WHERE ti.id = $1
         LIMIT 1`,
        [inviteId],
      );

      if (inviteRows.length === 0) {
        set.status = 404;
        return { error: "Không tìm thấy lời mời" };
      }

      const invite = inviteRows[0];
      const isOwner = Number(invite.created_by) === userId;
      const isInviter = Number(invite.inviter_id) === userId;

      if (!isOwner && !isInviter) {
        set.status = 403;
        return { error: "Bạn không có quyền hủy lời mời này" };
      }

      if (invite.status !== "pending") {
        set.status = 409;
        return { error: "Lời mời này không còn pending" };
      }

      await pool.query(
        `UPDATE team_invites
         SET status = 'revoked', updated_at = NOW()
         WHERE id = $1`,
        [inviteId],
      );

      startTeamInviteBroadcast(
        {
          event_id: `invite_revoked:${inviteId}:${Date.now()}`,
          type: "invite_updated",
          event_name: "team-invites:changed",
          invite: { ...invite, status: "revoked" },
          inviter_id: userId,
          invitee_id: invite.invitee_id,
          origin_instance_id: realtimeInstanceId,
          ts: new Date().toISOString(),
        },
        "invite_revoked",
      );

      set.status = 200;
      return { success: true };
    } catch (error) {
      if (isMissingTeamInvitesTableError(error)) {
        set.status = 503;
        return {
          error:
            "Hệ thống mời team chưa được khởi tạo. Vui lòng chạy migration team_invites_schema.sql.",
        };
      }

      throw error;
    }
  },
  { tags: [TAG], summary: "Revoke team invite" },
);

export default teamInvitesRouter;
