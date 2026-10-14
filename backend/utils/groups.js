import crypto from "node:crypto";
import { pool } from "./db.js";
import { broadcastToUsers } from "../realtime/teamInviteStreamHub.js";

/**
 * "Nhóm" = org (teams.kind = 'org') hoặc đội lẻ (teams.kind = 'squad'), xem docs/org_squad_migration.sql.
 *
 *   Org    — 1 người tối đa 1 org (org_members.user_id unique). Vai trò founder / lead / member.
 *            Người sáng lập = teams.created_by (kể cả khi không có dòng trong org_members).
 *            users.team_id được giữ đồng bộ cho code cũ.
 *   Đội lẻ — chỉ cho 1 giải ngoài series (squad_tournament_id). Vai trò captain / member.
 *            1 người không được ở 2 đội trong cùng 1 giải.
 */

export const ADMIN_ROLE_IDS = new Set([1, 2]);

export const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Lỗi nghiệp vụ có mã HTTP — controller trả { error } với status này. */
export class GroupError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const isAdmin = (user) => ADMIN_ROLE_IDS.has(toNumber(user?.role_id));

const query = (client, sql, params) => (client ?? pool).query(sql, params);

export const getGroup = async (groupId, client) => {
  const { rows } = await query(
    client,
    `SELECT id, name, short_name, logo_url, team_color_hex, created_by, created_at,
            kind, squad_tournament_id
     FROM teams WHERE id = $1`,
    [groupId],
  );
  return rows[0] ?? null;
};

/** Vai trò của user trong nhóm: org → founder | lead | member; đội lẻ → captain | member; null nếu không thuộc. */
export const getMemberRole = async (group, userId, client) => {
  const id = toNumber(userId);
  if (!group || !id) return null;
  if (group.kind === "org") {
    if (toNumber(group.created_by) === id) return "founder";
    const { rows } = await query(
      client,
      "SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2",
      [group.id, id],
    );
    return rows[0]?.role ?? null;
  }
  if (group.kind === "squad") {
    const { rows } = await query(
      client,
      "SELECT role FROM squad_members WHERE squad_id = $1 AND user_id = $2",
      [group.id, id],
    );
    return rows[0]?.role ?? null;
  }
  return null;
};

/** Quản lý nhóm (duyệt đơn, kick, link mời, đăng ký giải): founder/lead của org, captain đội lẻ, admin. */
export const canManage = (role, user) =>
  isAdmin(user) || role === "founder" || role === "lead" || role === "captain";

export const listMembers = async (group, client) => {
  const table = group.kind === "org" ? "org_members" : "squad_members";
  const key = group.kind === "org" ? "org_id" : "squad_id";
  const { rows } = await query(
    client,
    `SELECT m.user_id, m.role, m.joined_at,
            u.username, u.nickname, u.profile_picture, u.riot_account
     FROM ${table} m
     JOIN users u ON u.id = m.user_id
     WHERE m.${key} = $1
     ORDER BY CASE m.role WHEN 'founder' THEN 0 WHEN 'captain' THEN 0 WHEN 'lead' THEN 1 ELSE 2 END,
              m.joined_at`,
    [group.id],
  );
  // Người sáng lập org không có dòng thành viên (vd. org admin tạo thử) → vẫn hiện ở đầu
  if (group.kind === "org" && !rows.some((row) => toNumber(row.user_id) === toNumber(group.created_by))) {
    const { rows: founder } = await query(
      client,
      `SELECT id AS user_id, 'founder' AS role, NULL AS joined_at,
              username, nickname, profile_picture, riot_account
       FROM users WHERE id = $1`,
      [group.created_by],
    );
    return [...founder, ...rows];
  }
  return rows;
};

/** Org hiện tại của user (nếu có). */
export const getUserOrgId = async (userId, client) => {
  const { rows } = await query(client, "SELECT org_id FROM org_members WHERE user_id = $1", [userId]);
  return toNumber(rows[0]?.org_id);
};

/** User đã ở 1 đội (đội lẻ khác, hoặc đội hình đã đăng ký) trong giải này chưa. */
export const isUserInTournament = async (userId, tournamentId, { excludeGroupId } = {}, client) => {
  const { rows } = await query(
    client,
    `SELECT 1
     FROM tournament_team_players p
     JOIN tournament_teams tt ON tt.id = p.tournament_team_id
     WHERE p.user_id = $1 AND tt.tournament_id = $2 AND ($3::bigint IS NULL OR tt.team_id <> $3)
     UNION ALL
     SELECT 1
     FROM squad_members sm
     JOIN teams t ON t.id = sm.squad_id
     WHERE sm.user_id = $1 AND t.squad_tournament_id = $2 AND ($3::bigint IS NULL OR t.id <> $3)
     LIMIT 1`,
    [userId, tournamentId, excludeGroupId ?? null],
  );
  return rows.length > 0;
};

/** Thêm thành viên (đã kiểm tra quyền ở ngoài). Org: 1 người 1 org; đội lẻ: không trùng giải. */
export const addMember = async (group, userId, role, client) => {
  if (group.kind === "org") {
    const currentOrg = await getUserOrgId(userId, client);
    if (currentOrg && currentOrg !== toNumber(group.id)) {
      throw new GroupError(409, "Người này đang ở một org khác — cần rời org đó trước");
    }
    await query(
      client,
      `INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (org_id, user_id) DO NOTHING`,
      [group.id, userId, role],
    );
    await query(client, "UPDATE users SET team_id = $1 WHERE id = $2", [group.id, userId]);
    return;
  }

  if (await isUserInTournament(userId, group.squad_tournament_id, { excludeGroupId: group.id }, client)) {
    throw new GroupError(409, "Người này đã ở một đội khác trong giải này");
  }
  await query(
    client,
    `INSERT INTO squad_members (squad_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (squad_id, user_id) DO NOTHING`,
    [group.id, userId, role],
  );
};

/** Bỏ thành viên khỏi nhóm + khỏi đội hình các giải CHƯA bắt đầu của nhóm. */
export const removeMember = async (group, userId, client) => {
  if (group.kind === "org") {
    await query(client, "DELETE FROM org_members WHERE org_id = $1 AND user_id = $2", [group.id, userId]);
    await query(client, "UPDATE users SET team_id = NULL WHERE id = $1 AND team_id = $2", [userId, group.id]);
  } else {
    await query(client, "DELETE FROM squad_members WHERE squad_id = $1 AND user_id = $2", [group.id, userId]);
  }
  await query(
    client,
    `DELETE FROM tournament_team_players p
     USING tournament_teams tt, tournaments t
     WHERE p.tournament_team_id = tt.id AND t.id = tt.tournament_id
       AND tt.team_id = $1 AND p.user_id = $2
       AND (t.date_start IS NULL OR t.date_start > NOW())`,
    [group.id, userId],
  );
  // Đội trưởng bị bỏ → để trống, quản lý chỉ định lại
  await query(
    client,
    `UPDATE tournament_teams SET captain_user_id = NULL
     WHERE team_id = $1 AND captain_user_id = $2`,
    [group.id, userId],
  );
};

export const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

/** Người cần được báo khi nhóm đổi (quản lý + người liên quan). */
export const getManagerIds = async (group, client) => {
  const ids = new Set([toNumber(group.created_by)]);
  const table = group.kind === "org" ? "org_members" : "squad_members";
  const key = group.kind === "org" ? "org_id" : "squad_id";
  const { rows } = await query(
    client,
    `SELECT user_id FROM ${table} WHERE ${key} = $1 AND role IN ('founder', 'lead', 'captain')`,
    [group.id],
  );
  rows.forEach((row) => ids.add(toNumber(row.user_id)));
  return [...ids].filter(Boolean);
};

/** Đẩy sự kiện qua WebSocket sẵn có (/api/team-invites/stream). */
export const notifyUsers = (userIds, payload) => {
  try {
    // user_ids: hook useTeamInviteStream ở frontend chỉ nhận khung có id người dùng hiện tại
    broadcastToUsers({ type: "group", ...payload, user_ids: userIds }, userIds);
  } catch {
    // realtime chỉ là phụ — không chặn thao tác
  }
};

export const createInviteToken = () => crypto.randomBytes(18).toString("base64url");
