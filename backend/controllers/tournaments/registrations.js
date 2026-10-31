import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";
import {
  GroupError,
  addMember,
  canManage,
  getGroup,
  getMemberRole,
  getUserOrgId,
  isAdmin,
  isRegistrationOpen,
  isUserInTournament,
  listMembers,
  markFreeAgentsPlaced,
  rosterLimits,
  toNumber,
  withTransaction,
} from "../../utils/groups.js";
import { rolesRequired } from "../../utils/ingameRoles.js";
import { isFormationFinal, loadTournamentWithGame } from "../../utils/teamFinder.js";

/**
 * Đăng ký giải theo đội (registration_mode = 'org'), 1 lệnh duy nhất:
 *   - Giải thuộc series: chỉ org. Người đăng ký: founder / lead của org.
 *   - Giải lẻ: org (founder / lead) hoặc tạo đội lẻ mới cho riêng giải này (ai cũng được, là đội trưởng).
 * Đội hình chọn từ thành viên org / đội lẻ; mỗi người chỉ ở 1 đội trong 1 giải.
 * captain_user_id = đội trưởng của lượt đăng ký này — người ban/pick và check-in.
 * Giải cá nhân (registration_mode = 'individual', TFT) vẫn dùng /api/tournaments/teams/:id/register-solo.
 */
const registrationRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Registrations";

const handle = (fn) => async (ctx) => {
  try {
    return await fn(ctx);
  } catch (error) {
    if (error instanceof GroupError) {
      ctx.set.status = error.status;
      return { error: error.message };
    }
    if (error?.code === "23505") {
      ctx.set.status = 409;
      return { error: "Đã đăng ký hoặc tên đội bị trùng trong giải này" };
    }
    throw error;
  }
};

const loadTournament = (tournamentId, client) => loadTournamentWithGame(tournamentId, client);

const isStaffOfTournament = (user, tournament) =>
  isAdmin(user) || toNumber(tournament.created_by) === toNumber(user?.id);

const requireOpen = (tournament, user) => {
  if (!isRegistrationOpen(tournament) && !isStaffOfTournament(user, tournament)) {
    throw new GroupError(400, "Ngoài thời gian đăng ký");
  }
};

const uniqueIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(toNumber).filter(Boolean))];


/** Kiểm tra đội hình: thuộc nhóm, đủ số lượng, không trùng đội khác trong giải, đội trưởng nằm trong đội hình. */
const validateRoster = async ({ group, tournament, playerIds, captainId, requireMin }, client) => {
  const { min, max } = rosterLimits(tournament);
  if (playerIds.length > max) throw new GroupError(400, `Đội hình tối đa ${max} người`);
  if (requireMin && playerIds.length < min) throw new GroupError(400, `Đội hình cần ít nhất ${min} người`);
  if (!captainId || !playerIds.includes(captainId)) {
    throw new GroupError(400, "Đội trưởng phải nằm trong đội hình");
  }

  const memberIds = new Set((await listMembers(group, client)).map((member) => toNumber(member.user_id)));
  const outsiders = playerIds.filter((id) => !memberIds.has(id));
  if (outsiders.length) throw new GroupError(400, "Có người trong đội hình không thuộc org / đội này");

  for (const id of playerIds) {
    if (await isUserInTournament(id, tournament.id, { excludeGroupId: group.id }, client)) {
      throw new GroupError(409, "Có người trong đội hình đã ở một đội khác trong giải này");
    }
  }
};

/**
 * Ghi đội hình. Vai trò trong game không chọn ở đây — chỉ chọn khi xin vào đội / ghép ngẫu nhiên;
 * người đã có vai trò (vào qua tìm đội) được giữ nguyên khi đội trưởng sửa đội hình.
 */
const writeRoster = async (registrationId, tournamentId, playerIds, client) => {
  const { rows: previous } = await client.query(
    "SELECT user_id, ingame_role FROM tournament_team_players WHERE tournament_team_id = $1",
    [registrationId],
  );
  const roles = new Map(previous.map((row) => [toNumber(row.user_id), row.ingame_role]));
  await client.query("DELETE FROM tournament_team_players WHERE tournament_team_id = $1", [registrationId]);
  for (const id of playerIds) {
    await client.query(
      "INSERT INTO tournament_team_players (tournament_team_id, user_id, ingame_role) VALUES ($1, $2, $3)",
      [registrationId, id, roles.get(id) ?? null],
    );
  }
  // Có đội rồi → rời danh sách chờ ghép
  await markFreeAgentsPlaced(tournamentId, playerIds, registrationId, client);
};

/** Tìm đội / ghép đội chỉ cho giải lẻ (ngoài series) của game đồng đội. */
const teamFinderInfo = (tournament) => ({
  game: tournament.game,
  roles_required: rolesRequired(tournament.game),
  team_finder: !tournament.series_id && ["valorant", "lol", "aov"].includes(tournament.game),
  team_formed_at: isFormationFinal(tournament) ? tournament.team_formed_at : null,
});

/** Lựa chọn đăng ký của tôi cho 1 giải: org tôi quản lý (kèm thành viên), đăng ký hiện có của tôi. */
registrationRouter.get(
  "/options/:tournamentId",
  handle(async ({ params, user, set }) => {
    const tournament = await loadTournament(toNumber(params.tournamentId));
    const limits = rosterLimits(tournament);
    const base = {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        in_series: Boolean(tournament.series_id),
        registration_mode: tournament.registration_mode,
        is_open: isRegistrationOpen(tournament),
        register_end: tournament.register_end,
        roster_min: limits.min,
        roster_max: limits.max,
        ...teamFinderInfo(tournament),
      },
    };
    if (!user) {
      set.status = 200;
      return { data: { ...base, org: null, my_registrations: [] } };
    }

    // Org tôi thuộc (hoặc sáng lập) + vai trò
    const orgId =
      (await getUserOrgId(user.id)) ??
      toNumber(
        (await pool.query("SELECT id FROM teams WHERE kind = 'org' AND created_by = $1 ORDER BY id LIMIT 1", [user.id]))
          .rows[0]?.id,
      );
    let org = null;
    if (orgId) {
      const group = await getGroup(orgId);
      const role = await getMemberRole(group, user.id);
      const { rows } = await pool.query(
        "SELECT id FROM tournament_teams WHERE tournament_id = $1 AND team_id = $2",
        [tournament.id, group.id],
      );
      org = {
        id: group.id,
        name: group.name,
        short_name: group.short_name,
        logo_url: group.logo_url,
        my_role: role,
        can_register: canManage(role, user),
        registration_id: toNumber(rows[0]?.id),
        members: canManage(role, user) ? await listMembers(group) : [],
      };
    }

    // Các lượt đăng ký giải này có tôi (trong đội hình, hoặc đội lẻ tôi ở)
    const { rows: mine } = await pool.query(
      `SELECT DISTINCT tt.id AS registration_id, t.id AS team_id, t.name, t.short_name, t.logo_url, t.kind,
              tt.captain_user_id
       FROM tournament_teams tt
       JOIN teams t ON t.id = tt.team_id
       LEFT JOIN tournament_team_players p ON p.tournament_team_id = tt.id AND p.user_id = $2
       LEFT JOIN squad_members sm ON sm.squad_id = t.id AND sm.user_id = $2
       WHERE tt.tournament_id = $1 AND (p.user_id IS NOT NULL OR sm.user_id IS NOT NULL OR tt.captain_user_id = $2)`,
      [tournament.id, user.id],
    );

    set.status = 200;
    return { data: { ...base, org, my_registrations: mine } };
  }),
  { tags: [TAG], summary: "Registration options for current user" },
);

/** Chi tiết 1 lượt đăng ký (đội hình + thành viên có thể chọn nếu tôi quản lý). */
registrationRouter.get(
  "/entry/:registrationId",
  handle(async ({ params, user, set }) => {
    const { rows } = await pool.query(
      `SELECT tt.id, tt.tournament_id, tt.team_id, tt.captain_user_id,
              tt.recruit_mode, tt.recruit_roles, tt.recruit_note, tt.accept_auto_fill
       FROM tournament_teams tt WHERE tt.id = $1`,
      [toNumber(params.registrationId)],
    );
    const entry = rows[0];
    if (!entry) throw new GroupError(404, "Không tìm thấy lượt đăng ký");
    const tournament = await loadTournament(entry.tournament_id);
    const group = await getGroup(entry.team_id);
    const role = user ? await getMemberRole(group, user.id) : null;
    const manageable = user ? canManage(role, user) || isStaffOfTournament(user, tournament) : false;

    // Đội lẻ: thành viên = đội hình. Đồng bộ đội cũ (trước đây phải tick tay) — tối đa số người của giải.
    if (group.kind === "squad") {
      await pool.query(
        `INSERT INTO tournament_team_players (tournament_team_id, user_id)
         SELECT $1, sm.user_id FROM squad_members sm
         WHERE sm.squad_id = $2
           AND NOT EXISTS (SELECT 1 FROM tournament_team_players p WHERE p.tournament_team_id = $1 AND p.user_id = sm.user_id)
         ORDER BY sm.joined_at
         LIMIT GREATEST(0, $3 - (SELECT COUNT(*) FROM tournament_team_players WHERE tournament_team_id = $1))
         ON CONFLICT (tournament_team_id, user_id) DO NOTHING`,
        [entry.id, group.id, rosterLimits(tournament).max],
      );
    }

    const { rows: roster } = await pool.query(
      `SELECT u.id AS user_id, u.username, u.nickname, u.profile_picture, u.riot_account, p.ingame_role
       FROM tournament_team_players p JOIN users u ON u.id = p.user_id
       WHERE p.tournament_team_id = $1 ORDER BY p.id`,
      [entry.id],
    );
    set.status = 200;
    return {
      data: {
        ...entry,
        team: { id: group.id, name: group.name, short_name: group.short_name, logo_url: group.logo_url, kind: group.kind },
        roster,
        can_manage: manageable,
        members: manageable ? await listMembers(group) : [],
        roster_min: rosterLimits(tournament).min,
        roster_max: rosterLimits(tournament).max,
        is_open: isRegistrationOpen(tournament),
        ...teamFinderInfo(tournament),
      },
    };
  }),
  { tags: [TAG], summary: "Registration entry detail" },
);

/**
 * Đăng ký:
 *   { kind: "org", org_id, player_ids: [...], captain_user_id }
 *   { kind: "squad", squad: { name, short_name, logo_url } }   ← tạo đội lẻ, tôi là đội trưởng;
 *                                                                thành viên vào sau qua link mời / xin vào / tìm đội
 */
registrationRouter.post(
  "/:tournamentId",
  handle(async ({ params, body, user, set }) => {
    if (!user) throw new GroupError(401, "Bạn cần đăng nhập");
    const tournamentId = toNumber(params.tournamentId);

    const result = await withTransaction(async (client) => {
      const tournament = await loadTournament(tournamentId, client);
      if (tournament.registration_mode === "individual") {
        throw new GroupError(400, "Giải này đăng ký cá nhân");
      }
      requireOpen(tournament, user);

      const maxTeams = toNumber(tournament.max_participate);
      if (maxTeams) {
        const { rows } = await client.query(
          "SELECT COUNT(*)::int AS n FROM tournament_teams WHERE tournament_id = $1",
          [tournament.id],
        );
        if (rows[0].n >= maxTeams) throw new GroupError(409, "Giải đã đủ số đội");
      }

      if (body?.kind === "squad") {
        if (tournament.series_id) throw new GroupError(400, "Giải thuộc series chỉ nhận org");
        const name = String(body?.squad?.name ?? "").trim().slice(0, 64);
        const shortName = String(body?.squad?.short_name ?? "").trim().slice(0, 16).toUpperCase();
        if (name.length < 2 || shortName.length < 2) {
          throw new GroupError(400, "Tên đội và tag cần ít nhất 2 ký tự");
        }
        if (await isUserInTournament(user.id, tournament.id, {}, client)) {
          throw new GroupError(409, "Bạn đã ở một đội khác trong giải này");
        }
        const { rows: created } = await client.query(
          `INSERT INTO teams (name, short_name, logo_url, team_color_hex, created_by, kind, squad_tournament_id)
           VALUES ($1, $2, $3, NULL, $4, 'squad', $5)
           RETURNING id, name, short_name, logo_url, created_by, kind, squad_tournament_id`,
          [name, shortName, String(body?.squad?.logo_url ?? "").trim() || null, user.id, tournament.id],
        );
        const squad = created[0];
        await addMember(squad, user.id, "captain", client);
        const { rows: reg } = await client.query(
          `INSERT INTO tournament_teams (team_id, tournament_id, captain_user_id)
           VALUES ($1, $2, $3) RETURNING id`,
          [squad.id, tournament.id, user.id],
        );
        await writeRoster(reg[0].id, tournament.id, [user.id], client);
        return { registration_id: reg[0].id, team_id: squad.id, kind: "squad" };
      }

      // Org
      const group = await getGroup(toNumber(body?.org_id), client);
      if (!group || group.kind !== "org") throw new GroupError(400, "Org không hợp lệ");
      const role = await getMemberRole(group, user.id, client);
      if (!canManage(role, user)) throw new GroupError(403, "Chỉ người sáng lập / lead của org mới đăng ký được");

      const playerIds = uniqueIds(body?.player_ids);
      const captainId = toNumber(body?.captain_user_id);
      await validateRoster({ group, tournament, playerIds, captainId, requireMin: true }, client);

      const { rows: reg } = await client.query(
        `INSERT INTO tournament_teams (team_id, tournament_id, captain_user_id)
         VALUES ($1, $2, $3) RETURNING id`,
        [group.id, tournament.id, captainId],
      );
      await writeRoster(reg[0].id, tournament.id, playerIds, client);
      return { registration_id: reg[0].id, team_id: group.id, kind: "org" };
    });

    set.status = 201;
    return { data: result };
  }),
  { tags: [TAG], summary: "Register org or create squad for a tournament", security: [{ bearerAuth: [] }] },
);

/** Cập nhật đội hình / đội trưởng: quản lý org, đội trưởng đội lẻ, BTC. Trong hạn đăng ký (BTC thì luôn được). */
registrationRouter.put(
  "/entry/:registrationId",
  handle(async ({ params, body, user, set }) => {
    if (!user) throw new GroupError(401, "Bạn cần đăng nhập");
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM tournament_teams WHERE id = $1 FOR UPDATE",
        [toNumber(params.registrationId)],
      );
      const entry = rows[0];
      if (!entry) throw new GroupError(404, "Không tìm thấy lượt đăng ký");
      const tournament = await loadTournament(entry.tournament_id, client);
      const group = await getGroup(entry.team_id, client);
      const role = await getMemberRole(group, user.id, client);
      if (!canManage(role, user) && !isStaffOfTournament(user, tournament)) {
        throw new GroupError(403, "Bạn không có quyền sửa đội hình này");
      }
      requireOpen(tournament, user);

      const playerIds = uniqueIds(body?.player_ids);
      const captainId = toNumber(body?.captain_user_id) ?? toNumber(entry.captain_user_id);
      await validateRoster(
        { group, tournament, playerIds, captainId, requireMin: group.kind === "org" },
        client,
      );
      await writeRoster(entry.id, tournament.id, playerIds, client);
      await client.query("UPDATE tournament_teams SET captain_user_id = $1 WHERE id = $2", [captainId, entry.id]);
      // Đội lẻ: đội trưởng giải = đội trưởng đội
      if (group.kind === "squad" && captainId !== toNumber(group.created_by)) {
        await client.query("UPDATE teams SET created_by = $1 WHERE id = $2", [captainId, group.id]);
        await client.query("UPDATE squad_members SET role = 'member' WHERE squad_id = $1", [group.id]);
        await client.query(
          "UPDATE squad_members SET role = 'captain' WHERE squad_id = $1 AND user_id = $2",
          [group.id, captainId],
        );
      }
    });
    set.status = 200;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Update roster / captain", security: [{ bearerAuth: [] }] },
);

/** Rút đăng ký (trong hạn; BTC luôn được). Đội lẻ bị xoá luôn vì chỉ dùng cho giải này. */
registrationRouter.delete(
  "/entry/:registrationId",
  handle(async ({ params, user, set }) => {
    if (!user) throw new GroupError(401, "Bạn cần đăng nhập");
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM tournament_teams WHERE id = $1 FOR UPDATE",
        [toNumber(params.registrationId)],
      );
      const entry = rows[0];
      if (!entry) throw new GroupError(404, "Không tìm thấy lượt đăng ký");
      const tournament = await loadTournament(entry.tournament_id, client);
      const group = await getGroup(entry.team_id, client);
      const role = await getMemberRole(group, user.id, client);
      const owner = role === "founder" || role === "lead" || role === "captain";
      if (!owner && !isStaffOfTournament(user, tournament)) {
        throw new GroupError(403, "Bạn không có quyền rút đăng ký");
      }
      requireOpen(tournament, user);
      // Người vào đội qua tìm đội → quay lại danh sách chờ ghép (nếu giải chưa ghép)
      if (!isFormationFinal(tournament)) {
        await client.query(
          `UPDATE tournament_free_agents SET status = 'waiting', placed_registration_id = NULL, updated_at = NOW()
           WHERE placed_registration_id = $1 AND user_id <> $2`,
          [entry.id, user.id],
        );
      }
      await client.query("DELETE FROM tournament_teams WHERE id = $1", [entry.id]);
      if (group.kind === "squad") await client.query("DELETE FROM teams WHERE id = $1", [group.id]);
    });
    set.status = 200;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Withdraw registration", security: [{ bearerAuth: [] }] },
);

export default registrationRouter;
