import { Elysia } from "elysia";
import { pool } from "../utils/db.js";
import middleware from "../utils/middleware.js";
import {
  GroupError,
  addMember,
  canManage,
  createInviteToken,
  getGroup,
  getManagerIds,
  getMemberRole,
  getUserOrgId,
  isAdmin,
  listMembers,
  notifyUsers,
  removeMember,
  toNumber,
  withTransaction,
} from "../utils/groups.js";

/**
 * Org (teams.kind = 'org') và đội lẻ (kind = 'squad'): xem, tạo org, xin vào, link mời,
 * duyệt / kick / rời / đổi vai trò / chuyển quyền sáng lập. Đội lẻ được tạo khi đăng ký giải
 * (controllers/tournaments/registrations.js).
 */
const groupRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Groups";

/** Bọc handler: GroupError → status + { error }. */
const handle = (fn) => async (ctx) => {
  try {
    return await fn(ctx);
  } catch (error) {
    if (error instanceof GroupError) {
      ctx.set.status = error.status;
      return { error: error.message };
    }
    // Vi phạm unique (vd. trùng tên org, 1 người 2 org) → 409
    if (error?.code === "23505") {
      ctx.set.status = 409;
      return { error: "Dữ liệu bị trùng (tên/tag đã có, hoặc đã là thành viên)" };
    }
    throw error;
  }
};

const requireUser = (user) => {
  if (!user) throw new GroupError(401, "Bạn cần đăng nhập");
};

const loadGroup = async (id, client) => {
  const group = await getGroup(toNumber(id), client);
  if (!group || (group.kind !== "org" && group.kind !== "squad")) {
    throw new GroupError(404, "Không tìm thấy org / đội");
  }
  return group;
};

const requireManager = async (group, user, client) => {
  requireUser(user);
  const role = await getMemberRole(group, user.id, client);
  if (!canManage(role, user)) throw new GroupError(403, "Bạn không có quyền quản lý nhóm này");
  return role;
};

const cleanText = (value, max) => String(value ?? "").trim().slice(0, max);

// ── Danh sách & chi tiết ──────────────────────────────────────────────

groupRouter.get(
  "/",
  handle(async ({ query, set }) => {
    const search = cleanText(query?.q, 64);
    const { rows } = await pool.query(
      `SELECT t.id, t.name, t.short_name, t.logo_url, t.team_color_hex, t.created_by,
              u.nickname AS founder_name,
              -- Tính cả người sáng lập khi họ không có dòng thành viên (khớp trang chi tiết)
              (SELECT COUNT(*)::int FROM org_members m WHERE m.org_id = t.id)
                + CASE WHEN EXISTS (
                    SELECT 1 FROM org_members m2 WHERE m2.org_id = t.id AND m2.user_id = t.created_by
                  ) THEN 0 ELSE 1 END AS member_count
       FROM teams t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.kind = 'org'
         AND ($1 = '' OR t.name ILIKE '%' || $1 || '%' OR t.short_name ILIKE '%' || $1 || '%')
       ORDER BY member_count DESC, t.name
       LIMIT 200`,
      [search],
    );
    set.status = 200;
    return { data: rows };
  }),
  { tags: [TAG], summary: "List orgs (search ?q=)" },
);

/** Org của tôi + đội lẻ tôi đang ở (giải chưa kết thúc). */
groupRouter.get(
  "/mine",
  handle(async ({ user, set }) => {
    requireUser(user);
    const { rows: orgs } = await pool.query(
      `SELECT t.id, t.name, t.short_name, t.logo_url, t.kind,
              CASE WHEN t.created_by = $1 THEN 'founder' ELSE m.role END AS role
       FROM teams t
       LEFT JOIN org_members m ON m.org_id = t.id AND m.user_id = $1
       WHERE t.kind = 'org' AND (m.user_id IS NOT NULL OR t.created_by = $1)
       ORDER BY (m.user_id IS NULL), t.name`,
      [user.id],
    );
    const { rows: squads } = await pool.query(
      `SELECT t.id, t.name, t.short_name, t.logo_url, t.kind, sm.role,
              t.squad_tournament_id AS tournament_id, tr.name AS tournament_name, tr.slug AS tournament_slug
       FROM squad_members sm
       JOIN teams t ON t.id = sm.squad_id
       LEFT JOIN tournaments tr ON tr.id = t.squad_tournament_id
       WHERE sm.user_id = $1 AND (tr.date_end IS NULL OR tr.date_end > NOW() - INTERVAL '7 days')
       ORDER BY tr.date_start DESC NULLS LAST`,
      [user.id],
    );
    set.status = 200;
    return { data: { orgs, squads } };
  }),
  { tags: [TAG], summary: "My org and active squads", security: [{ bearerAuth: [] }] },
);

groupRouter.get(
  "/:id",
  handle(async ({ params, user, set }) => {
    const group = await loadGroup(params.id);
    const members = await listMembers(group);
    const myRole = user ? await getMemberRole(group, user.id) : null;
    const manager = user ? canManage(myRole, user) : false;

    const { rows: tournaments } = await pool.query(
      `SELECT tt.id AS registration_id, tr.id, tr.name, tr.slug, tr.date_start, tr.date_end,
              tr.series_id, g.short_name AS game, tt.captain_user_id,
              (SELECT COUNT(*)::int FROM tournament_team_players p WHERE p.tournament_team_id = tt.id) AS roster_count
       FROM tournament_teams tt
       JOIN tournaments tr ON tr.id = tt.tournament_id
       LEFT JOIN games g ON g.id = tr.game_id
       WHERE tt.team_id = $1
       ORDER BY tr.date_start DESC NULLS LAST
       LIMIT 50`,
      [group.id],
    );

    let myRequest = null;
    let pendingRequests = [];
    let inviteLinks = [];
    if (user) {
      const { rows } = await pool.query(
        `SELECT id, status, created_at FROM team_join_requests
         WHERE team_id = $1 AND user_id = $2 AND status = 'pending'`,
        [group.id, user.id],
      );
      myRequest = rows[0] ?? null;
    }
    if (manager) {
      ({ rows: pendingRequests } = await pool.query(
        `SELECT r.id, r.user_id, r.message, r.created_at,
                u.username, u.nickname, u.profile_picture, u.riot_account
         FROM team_join_requests r JOIN users u ON u.id = r.user_id
         WHERE r.team_id = $1 AND r.status = 'pending'
         ORDER BY r.created_at`,
        [group.id],
      ));
      ({ rows: inviteLinks } = await pool.query(
        `SELECT id, token, expires_at, max_uses, used_count, created_at
         FROM team_invite_links
         WHERE team_id = $1 AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW())
           AND (max_uses IS NULL OR used_count < max_uses)
         ORDER BY created_at DESC`,
        [group.id],
      ));
    }

    set.status = 200;
    return {
      data: {
        ...group,
        members,
        tournaments,
        my_role: myRole,
        can_manage: manager,
        my_request: myRequest,
        pending_requests: pendingRequests,
        invite_links: inviteLinks,
      },
    };
  }),
  { tags: [TAG], summary: "Org / squad detail" },
);

// ── Tạo / sửa org ─────────────────────────────────────────────────────

groupRouter.post(
  "/",
  handle(async ({ body, user, set }) => {
    requireUser(user);
    const name = cleanText(body?.name, 64);
    const shortName = cleanText(body?.short_name, 16).toUpperCase();
    if (name.length < 2 || shortName.length < 2) {
      throw new GroupError(400, "Tên org và tag cần ít nhất 2 ký tự");
    }

    const org = await withTransaction(async (client) => {
      if (await getUserOrgId(user.id, client)) {
        throw new GroupError(409, "Bạn đang ở một org — cần rời org đó trước khi lập org mới");
      }
      const { rows } = await client.query(
        `INSERT INTO teams (name, short_name, logo_url, team_color_hex, created_by, kind)
         VALUES ($1, $2, $3, $4, $5, 'org')
         RETURNING id, name, short_name, logo_url, team_color_hex, created_by, kind`,
        [name, shortName, cleanText(body?.logo_url, 1000) || null, cleanText(body?.team_color_hex, 9) || null, user.id],
      );
      await addMember(rows[0], user.id, "founder", client);
      return rows[0];
    });

    set.status = 201;
    return { data: org };
  }),
  { tags: [TAG], summary: "Create org (founder = me)", security: [{ bearerAuth: [] }] },
);

groupRouter.put(
  "/:id",
  handle(async ({ params, body, user, set }) => {
    const group = await loadGroup(params.id);
    await requireManager(group, user);

    const updates = [];
    const values = [];
    const push = (column, value) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };
    if (body?.name !== undefined) {
      const name = cleanText(body.name, 64);
      if (name.length < 2) throw new GroupError(400, "Tên cần ít nhất 2 ký tự");
      push("name", name);
    }
    if (body?.short_name !== undefined) {
      const shortName = cleanText(body.short_name, 16).toUpperCase();
      if (shortName.length < 2) throw new GroupError(400, "Tag cần ít nhất 2 ký tự");
      push("short_name", shortName);
    }
    if (body?.logo_url !== undefined) push("logo_url", cleanText(body.logo_url, 1000) || null);
    if (body?.team_color_hex !== undefined) push("team_color_hex", cleanText(body.team_color_hex, 9) || null);
    if (!updates.length) throw new GroupError(400, "Không có gì để cập nhật");

    values.push(group.id);
    const { rows } = await pool.query(
      `UPDATE teams SET ${updates.join(", ")} WHERE id = $${values.length}
       RETURNING id, name, short_name, logo_url, team_color_hex, created_by, kind`,
      values,
    );
    set.status = 200;
    return { data: rows[0] };
  }),
  { tags: [TAG], summary: "Update org / squad info", security: [{ bearerAuth: [] }] },
);

// ── Xin gia nhập ──────────────────────────────────────────────────────

groupRouter.post(
  "/:id/join-requests",
  handle(async ({ params, body, user, set }) => {
    requireUser(user);
    const group = await loadGroup(params.id);
    if (await getMemberRole(group, user.id)) throw new GroupError(409, "Bạn đã ở trong nhóm này");
    if (group.kind === "org" && (await getUserOrgId(user.id))) {
      throw new GroupError(409, "Bạn đang ở một org khác — cần rời org đó trước");
    }

    const { rows } = await pool.query(
      `INSERT INTO team_join_requests (team_id, user_id, message)
       VALUES ($1, $2, $3)
       RETURNING id, status, created_at`,
      [group.id, user.id, cleanText(body?.message, 300) || null],
    );
    notifyUsers(await getManagerIds(group), {
      event: "join_request",
      group_id: group.id,
      user_id: user.id,
    });
    set.status = 201;
    return { data: rows[0] };
  }),
  { tags: [TAG], summary: "Request to join", security: [{ bearerAuth: [] }] },
);

groupRouter.delete(
  "/:id/join-requests/mine",
  handle(async ({ params, user, set }) => {
    requireUser(user);
    await pool.query(
      `UPDATE team_join_requests SET status = 'cancelled', decided_at = NOW()
       WHERE team_id = $1 AND user_id = $2 AND status = 'pending'`,
      [toNumber(params.id), user.id],
    );
    set.status = 200;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Cancel my join request", security: [{ bearerAuth: [] }] },
);

groupRouter.post(
  "/join-requests/:requestId/:decision",
  handle(async ({ params, user, set }) => {
    const decision = params.decision;
    if (decision !== "approve" && decision !== "decline") {
      throw new GroupError(400, "decision phải là approve hoặc decline");
    }

    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM team_join_requests WHERE id = $1 FOR UPDATE",
        [toNumber(params.requestId)],
      );
      const request = rows[0];
      if (!request || request.status !== "pending") {
        throw new GroupError(404, "Đơn không còn chờ duyệt");
      }
      const group = await loadGroup(request.team_id, client);
      await requireManager(group, user, client);

      if (decision === "approve") await addMember(group, toNumber(request.user_id), "member", client);
      await client.query(
        `UPDATE team_join_requests SET status = $1, decided_by = $2, decided_at = NOW() WHERE id = $3`,
        [decision === "approve" ? "approved" : "declined", user.id, request.id],
      );
      // Vào org rồi → huỷ các đơn xin vào org khác đang chờ
      if (decision === "approve" && group.kind === "org") {
        await client.query(
          `UPDATE team_join_requests r SET status = 'cancelled', decided_at = NOW()
           FROM teams t
           WHERE t.id = r.team_id AND t.kind = 'org' AND r.user_id = $1 AND r.status = 'pending'`,
          [request.user_id],
        );
      }
      return { group, userId: toNumber(request.user_id) };
    });

    notifyUsers([result.userId], {
      event: decision === "approve" ? "join_approved" : "join_declined",
      group_id: result.group.id,
    });
    set.status = 200;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Approve / decline join request", security: [{ bearerAuth: [] }] },
);

// ── Link mời ──────────────────────────────────────────────────────────

groupRouter.post(
  "/:id/invite-links",
  handle(async ({ params, body, user, set }) => {
    const group = await loadGroup(params.id);
    await requireManager(group, user);
    const hours = toNumber(body?.expires_in_hours);
    const maxUses = toNumber(body?.max_uses);
    const { rows } = await pool.query(
      `INSERT INTO team_invite_links (team_id, token, created_by, expires_at, max_uses)
       VALUES ($1, $2, $3, CASE WHEN $4::int IS NULL THEN NULL ELSE NOW() + ($4::int || ' hours')::interval END, $5)
       RETURNING id, token, expires_at, max_uses, used_count, created_at`,
      [group.id, createInviteToken(), user.id, hours && hours > 0 ? Math.min(hours, 24 * 30) : 72, maxUses && maxUses > 0 ? maxUses : null],
    );
    set.status = 201;
    return { data: rows[0] };
  }),
  { tags: [TAG], summary: "Create invite link (default 72h)", security: [{ bearerAuth: [] }] },
);

groupRouter.delete(
  "/:id/invite-links/:linkId",
  handle(async ({ params, user, set }) => {
    const group = await loadGroup(params.id);
    await requireManager(group, user);
    await pool.query(
      "UPDATE team_invite_links SET revoked_at = NOW() WHERE id = $1 AND team_id = $2",
      [toNumber(params.linkId), group.id],
    );
    set.status = 200;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Revoke invite link", security: [{ bearerAuth: [] }] },
);

const findActiveLink = async (token, client) => {
  const { rows } = await (client ?? pool).query(
    `SELECT * FROM team_invite_links
     WHERE token = $1 AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR used_count < max_uses)
     ${client ? "FOR UPDATE" : ""}`,
    [String(token ?? "")],
  );
  return rows[0] ?? null;
};

/** Xem trước link mời (không cần đăng nhập). */
groupRouter.get(
  "/invite/:token",
  handle(async ({ params, user, set }) => {
    const link = await findActiveLink(params.token);
    if (!link) throw new GroupError(404, "Link mời không tồn tại hoặc đã hết hạn");
    const group = await loadGroup(link.team_id);
    const members = await listMembers(group);
    set.status = 200;
    return {
      data: {
        group: { id: group.id, name: group.name, short_name: group.short_name, logo_url: group.logo_url, kind: group.kind },
        member_count: members.length,
        already_member: user ? Boolean(await getMemberRole(group, user.id)) : false,
        expires_at: link.expires_at,
      },
    };
  }),
  { tags: [TAG], summary: "Preview invite link" },
);

groupRouter.post(
  "/invite/:token/accept",
  handle(async ({ params, user, set }) => {
    requireUser(user);
    const group = await withTransaction(async (client) => {
      const link = await findActiveLink(params.token, client);
      if (!link) throw new GroupError(404, "Link mời không tồn tại hoặc đã hết hạn");
      const target = await loadGroup(link.team_id, client);
      if (await getMemberRole(target, user.id, client)) return target;
      await addMember(target, user.id, "member", client);
      await client.query("UPDATE team_invite_links SET used_count = used_count + 1 WHERE id = $1", [link.id]);
      return target;
    });
    notifyUsers(await getManagerIds(group), { event: "member_joined", group_id: group.id, user_id: user.id });
    set.status = 200;
    return { data: { id: group.id, kind: group.kind } };
  }),
  { tags: [TAG], summary: "Join via invite link", security: [{ bearerAuth: [] }] },
);

// ── Thành viên: vai trò / kick / rời / chuyển quyền ───────────────────

groupRouter.patch(
  "/:id/members/:userId",
  handle(async ({ params, body, user, set }) => {
    const group = await loadGroup(params.id);
    if (group.kind !== "org") throw new GroupError(400, "Chỉ org mới có vai trò lead");
    const myRole = await getMemberRole(group, user?.id);
    if (myRole !== "founder" && !isAdmin(user)) throw new GroupError(403, "Chỉ người sáng lập mới đổi vai trò");
    const role = body?.role;
    if (role !== "lead" && role !== "member") throw new GroupError(400, "role phải là lead hoặc member");
    const { rowCount } = await pool.query(
      "UPDATE org_members SET role = $1 WHERE org_id = $2 AND user_id = $3 AND role <> 'founder'",
      [role, group.id, toNumber(params.userId)],
    );
    if (!rowCount) throw new GroupError(404, "Không tìm thấy thành viên");
    set.status = 200;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Set org member role (founder only)", security: [{ bearerAuth: [] }] },
);

groupRouter.delete(
  "/:id/members/:userId",
  handle(async ({ params, user, set }) => {
    const group = await loadGroup(params.id);
    const myRole = await requireManager(group, user);
    const targetId = toNumber(params.userId);
    const targetRole = await getMemberRole(group, targetId);
    if (!targetRole) throw new GroupError(404, "Người này không ở trong nhóm");
    if (targetRole === "founder" || targetRole === "captain") {
      throw new GroupError(400, "Không thể kick người sáng lập / đội trưởng");
    }
    // Lead chỉ kick được member; founder / admin kick được cả lead
    if (targetRole === "lead" && myRole !== "founder" && !isAdmin(user)) {
      throw new GroupError(403, "Chỉ người sáng lập mới kick được lead");
    }
    await withTransaction((client) => removeMember(group, targetId, client));
    notifyUsers([targetId], { event: "member_removed", group_id: group.id });
    set.status = 200;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Kick member", security: [{ bearerAuth: [] }] },
);

groupRouter.post(
  "/:id/leave",
  handle(async ({ params, user, set }) => {
    requireUser(user);
    const group = await loadGroup(params.id);
    const role = await getMemberRole(group, user.id);
    if (!role) throw new GroupError(400, "Bạn không ở trong nhóm này");
    if (role === "founder" || role === "captain") {
      throw new GroupError(400, "Hãy chuyển quyền cho người khác trước khi rời");
    }
    await withTransaction((client) => removeMember(group, user.id, client));
    notifyUsers(await getManagerIds(group), { event: "member_left", group_id: group.id, user_id: user.id });
    set.status = 200;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Leave org / squad", security: [{ bearerAuth: [] }] },
);

groupRouter.post(
  "/:id/transfer",
  handle(async ({ params, body, user, set }) => {
    const group = await loadGroup(params.id);
    const myRole = await getMemberRole(group, user?.id);
    const isOwner = myRole === "founder" || myRole === "captain";
    if (!isOwner && !isAdmin(user)) throw new GroupError(403, "Chỉ người sáng lập / đội trưởng mới chuyển quyền");
    const targetId = toNumber(body?.user_id);
    if (!targetId || !(await getMemberRole(group, targetId))) {
      throw new GroupError(400, "Người nhận phải là thành viên của nhóm");
    }

    await withTransaction(async (client) => {
      const previousOwner = toNumber(group.created_by);
      await client.query("UPDATE teams SET created_by = $1 WHERE id = $2", [targetId, group.id]);
      if (group.kind === "org") {
        // Chủ cũ thành lead (vẫn ở org), chủ mới thành founder
        await client.query(
          "UPDATE org_members SET role = 'lead' WHERE org_id = $1 AND user_id = $2",
          [group.id, previousOwner],
        );
        await client.query(
          "UPDATE org_members SET role = 'founder' WHERE org_id = $1 AND user_id = $2",
          [group.id, targetId],
        );
      } else {
        await client.query(
          "UPDATE squad_members SET role = 'member' WHERE squad_id = $1 AND user_id = $2",
          [group.id, previousOwner],
        );
        await client.query(
          "UPDATE squad_members SET role = 'captain' WHERE squad_id = $1 AND user_id = $2",
          [group.id, targetId],
        );
        await client.query(
          "UPDATE tournament_teams SET captain_user_id = $1 WHERE team_id = $2",
          [targetId, group.id],
        );
      }
    });

    set.status = 200;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Transfer founder (org) / captain (squad)", security: [{ bearerAuth: [] }] },
);

groupRouter.delete(
  "/:id",
  handle(async ({ params, user, set }) => {
    const group = await loadGroup(params.id);
    const myRole = await getMemberRole(group, user?.id);
    if (myRole !== "founder" && myRole !== "captain" && !isAdmin(user)) {
      throw new GroupError(403, "Chỉ người sáng lập mới giải tán được");
    }
    // Có lịch sử thi đấu (đăng ký giải / điểm series) → không xoá để giữ lịch sử
    const { rows } = await pool.query(
      "SELECT 1 FROM tournament_teams WHERE team_id = $1 LIMIT 1",
      [group.id],
    );
    if (rows.length) {
      throw new GroupError(409, "Nhóm đã có lịch sử thi đấu — không thể giải tán (huỷ đăng ký giải trước nếu giải chưa diễn ra)");
    }
    await withTransaction(async (client) => {
      await client.query("UPDATE users SET team_id = NULL WHERE team_id = $1", [group.id]);
      await client.query("DELETE FROM teams WHERE id = $1", [group.id]);
    });
    set.status = 200;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Disband org / squad (no history only)", security: [{ bearerAuth: [] }] },
);

export default groupRouter;
