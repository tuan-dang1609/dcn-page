import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";
import {
  GroupError,
  canManage,
  getGroup,
  getManagerIds,
  getMemberRole,
  isAdmin,
  isRegistrationOpen,
  isUserInTournament,
  notifyUsers,
  rosterLimits,
  toNumber,
  withTransaction,
} from "../../utils/groups.js";
import {
  ANY_ROLE,
  GAME_ROLES,
  cleanRole,
  isPositionRole,
  isPreferenceRole,
  isTeamGame,
  rolesRequired,
} from "../../utils/ingameRoles.js";
import { formTeamsForTournament, isFormationFinal, loadTournamentWithGame, placeInSquad } from "../../utils/teamFinder.js";

/**
 * Tìm đội cho giải theo đội ngoài series (Valorant / LMHT / Liên Quân):
 *   - Đội lẻ mở tuyển: 'approval' (đội trưởng duyệt) hoặc 'open' (vào thẳng), kèm vị trí cần tìm.
 *   - Người chơi lẻ đăng ký chờ ghép (vai trò chính / phụ, sẵn sàng làm đội trưởng); đội trưởng mời được.
 *   - Hết hạn đăng ký → server tự ghép lần cuối (utils/teamFinder.js). BTC ghép sớm được bằng /form-now
 *     (không khoá giải: người dư vẫn chờ, tới hạn vẫn ghép tiếp).
 * Vai trò: bắt buộc với Valorant / LMHT, Liên Quân không hỏi.
 */
const teamFinderRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Team finder";

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
      return { error: "Đã có lời mời / đơn xin vào đang chờ với đội này" };
    }
    throw error;
  }
};

const requireUser = (user) => {
  if (!user) throw new GroupError(401, "Bạn cần đăng nhập");
};

const isStaff = (user, tournament) => isAdmin(user) || toNumber(tournament.created_by) === toNumber(user?.id);

const cleanText = (value, max) => String(value ?? "").trim().slice(0, max) || null;

const requireFinder = (tournament) => {
  if (tournament.series_id || tournament.registration_mode === "individual" || !isTeamGame(tournament.game)) {
    throw new GroupError(400, "Giải này không dùng tìm đội");
  }
};

/** Còn nhận người: trong hạn đăng ký và chưa ghép lần cuối. */
const requireAccepting = (tournament) => {
  if (isFormationFinal(tournament)) throw new GroupError(400, "Giải đã ghép đội xong — không nhận thêm");
  if (!isRegistrationOpen(tournament)) throw new GroupError(400, "Giải đã hết hạn đăng ký");
};

/** Vai trò người chơi chọn: Valorant / LMHT bắt buộc; Liên Quân bỏ qua. */
const requireRole = (tournament, value, { optional = false } = {}) => {
  if (!rolesRequired(tournament.game)) return null;
  const role = cleanRole(value);
  if (!role && optional) return null;
  if (!isPreferenceRole(tournament.game, role)) throw new GroupError(400, "Cần chọn vai trò trong game");
  return role;
};

/** Lượt đăng ký đội lẻ + giải + nhóm. */
const loadSquadEntry = async (registrationId, client, { lock = false } = {}) => {
  const { rows } = await (client ?? pool).query(
    `SELECT * FROM tournament_teams WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [toNumber(registrationId)],
  );
  const entry = rows[0];
  if (!entry) throw new GroupError(404, "Không tìm thấy đội");
  const group = await getGroup(entry.team_id, client);
  if (group?.kind !== "squad") throw new GroupError(400, "Chỉ đội lẻ mới mở tuyển công khai");
  const tournament = await loadTournamentWithGame(entry.tournament_id, client);
  requireFinder(tournament);
  return { entry, group, tournament };
};

/** Hết hạn đăng ký mà chưa ghép → ghép ngay (server có thể vừa thức dậy, chưa kịp quét). */
const formIfDue = async (tournament) => {
  if (isFormationFinal(tournament) || !tournament.register_end) return tournament;
  if (new Date(tournament.register_end).getTime() > Date.now()) return tournament;
  try {
    await formTeamsForTournament(tournament.id);
    return await loadTournamentWithGame(tournament.id);
  } catch {
    return tournament;
  }
};

// ── Tổng quan ────────────────────────────────────────────────────────

teamFinderRouter.get(
  "/:tournamentId",
  handle(async ({ params, user, set }) => {
    let tournament = await loadTournamentWithGame(toNumber(params.tournamentId));
    requireFinder(tournament);
    tournament = await formIfDue(tournament);
    const limits = rosterLimits(tournament);

    const { rows: teamRows } = await pool.query(
      `SELECT tt.id AS registration_id, tt.recruit_mode, tt.recruit_roles, tt.recruit_note, tt.accept_auto_fill,
              tt.captain_user_id, t.id AS team_id, t.name, t.short_name, t.logo_url,
              COALESCE(json_agg(json_build_object(
                'user_id', u.id, 'username', u.username, 'nickname', u.nickname,
                'profile_picture', u.profile_picture, 'ingame_role', p.ingame_role
              ) ORDER BY p.id) FILTER (WHERE u.id IS NOT NULL), '[]') AS roster
       FROM tournament_teams tt
       JOIN teams t ON t.id = tt.team_id AND t.kind = 'squad'
       LEFT JOIN tournament_team_players p ON p.tournament_team_id = tt.id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE tt.tournament_id = $1 AND tt.recruit_mode <> 'closed'
       GROUP BY tt.id, t.id
       ORDER BY tt.id`,
      [tournament.id],
    );
    const teams = teamRows
      .map((team) => ({ ...team, open_slots: Math.max(0, limits.max - team.roster.length) }))
      .filter((team) => team.open_slots > 0);

    let freeAgents = [];
    let me = null;
    if (user) {
      ({ rows: freeAgents } = await pool.query(
        `SELECT fa.user_id, fa.primary_role, fa.secondary_role, fa.can_captain, fa.note, fa.created_at,
                u.username, u.nickname, u.profile_picture, u.riot_account
         FROM tournament_free_agents fa JOIN users u ON u.id = fa.user_id
         WHERE fa.tournament_id = $1 AND fa.status = 'waiting'
         ORDER BY fa.created_at`,
        [tournament.id],
      ));

      const { rows: mine } = await pool.query(
        `SELECT status, primary_role, secondary_role, can_captain, note, placed_registration_id
         FROM tournament_free_agents WHERE tournament_id = $1 AND user_id = $2`,
        [tournament.id, user.id],
      );
      const { rows: requests } = await pool.query(
        `SELECT r.id, r.direction, r.ingame_role, r.message, r.created_at,
                tt.id AS registration_id, t.id AS team_id, t.name, t.short_name, t.logo_url
         FROM team_join_requests r
         JOIN teams t ON t.id = r.team_id AND t.kind = 'squad' AND t.squad_tournament_id = $1
         JOIN tournament_teams tt ON tt.team_id = t.id AND tt.tournament_id = $1
         WHERE r.user_id = $2 AND r.status = 'pending'
         ORDER BY r.created_at DESC`,
        [tournament.id, user.id],
      );
      // Đội lẻ tôi quản lý trong giải → mời người chơi lẻ, duyệt đơn
      const { rows: managed } = await pool.query(
        `SELECT tt.id AS registration_id, t.id AS team_id
         FROM tournament_teams tt
         JOIN teams t ON t.id = tt.team_id AND t.kind = 'squad'
         JOIN squad_members sm ON sm.squad_id = t.id AND sm.user_id = $2 AND sm.role = 'captain'
         WHERE tt.tournament_id = $1
         LIMIT 1`,
        [tournament.id, user.id],
      );
      let team = null;
      if (managed[0]) {
        const { rows: pending } = await pool.query(
          `SELECT r.id, r.user_id, r.direction, r.ingame_role, r.message, r.created_at,
                  u.username, u.nickname, u.profile_picture, u.riot_account
           FROM team_join_requests r JOIN users u ON u.id = r.user_id
           WHERE r.team_id = $1 AND r.status = 'pending'
           ORDER BY r.created_at`,
          [managed[0].team_id],
        );
        team = {
          registration_id: toNumber(managed[0].registration_id),
          team_id: toNumber(managed[0].team_id),
          requests: pending.filter((row) => row.direction === "request"),
          invited_user_ids: pending.filter((row) => row.direction === "invite").map((row) => toNumber(row.user_id)),
        };
      }
      const defaults = rolesRequired(tournament.game)
        ? (
            await pool.query(
              "SELECT primary_role, secondary_role FROM user_game_roles WHERE user_id = $1 AND game = $2",
              [user.id, tournament.game],
            )
          ).rows[0] ?? null
        : null;

      me = {
        free_agent: mine[0] ?? null,
        in_team: await isUserInTournament(user.id, tournament.id),
        requests: requests.filter((row) => row.direction === "request"),
        invites: requests.filter((row) => row.direction === "invite"),
        managed_team: team,
        default_roles: defaults,
      };
    }

    set.status = 200;
    return {
      data: {
        tournament: {
          id: toNumber(tournament.id),
          name: tournament.name,
          game: tournament.game,
          roles_required: rolesRequired(tournament.game),
          positions: GAME_ROLES[tournament.game] ?? [],
          any_role: ANY_ROLE[tournament.game] ?? null,
          is_open: isRegistrationOpen(tournament) && !isFormationFinal(tournament),
          register_end: tournament.register_end,
          team_formed_at: isFormationFinal(tournament) ? tournament.team_formed_at : null,
          roster_min: limits.min,
          roster_max: limits.max,
          can_form_now: Boolean(user && isStaff(user, tournament) && !isFormationFinal(tournament)),
        },
        teams,
        free_agents: freeAgents,
        me,
      },
    };
  }),
  { tags: [TAG], summary: "Recruiting teams, free agents and my status" },
);

// ── Người chơi lẻ ────────────────────────────────────────────────────

teamFinderRouter.post(
  "/:tournamentId/free-agent",
  handle(async ({ params, body, user, set }) => {
    requireUser(user);
    const tournament = await loadTournamentWithGame(toNumber(params.tournamentId));
    requireFinder(tournament);
    requireAccepting(tournament);
    if (await isUserInTournament(user.id, tournament.id)) throw new GroupError(409, "Bạn đã có đội trong giải này");

    const primary = requireRole(tournament, body?.primary_role);
    const secondary = requireRole(tournament, body?.secondary_role, { optional: true });
    const { rows } = await pool.query(
      `INSERT INTO tournament_free_agents (tournament_id, user_id, primary_role, secondary_role, can_captain, note)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tournament_id, user_id) DO UPDATE SET
         primary_role = EXCLUDED.primary_role, secondary_role = EXCLUDED.secondary_role,
         can_captain = EXCLUDED.can_captain, note = EXCLUDED.note,
         status = 'waiting', placed_registration_id = NULL, updated_at = NOW()
       RETURNING status, primary_role, secondary_role, can_captain, note`,
      [tournament.id, user.id, primary, secondary === primary ? null : secondary, Boolean(body?.can_captain), cleanText(body?.note, 200)],
    );
    // Lưu làm vai trò mặc định cho lần sau
    if (primary) {
      await pool.query(
        `INSERT INTO user_game_roles (user_id, game, primary_role, secondary_role) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, game) DO UPDATE SET
           primary_role = EXCLUDED.primary_role, secondary_role = EXCLUDED.secondary_role, updated_at = NOW()`,
        [user.id, tournament.game, primary, secondary],
      );
    }
    set.status = 200;
    return { data: rows[0] };
  }),
  { tags: [TAG], summary: "Join / update free agent pool", security: [{ bearerAuth: [] }] },
);

teamFinderRouter.delete(
  "/:tournamentId/free-agent",
  handle(async ({ params, user, set }) => {
    requireUser(user);
    const tournament = await loadTournamentWithGame(toNumber(params.tournamentId));
    requireAccepting(tournament);
    await pool.query(
      "DELETE FROM tournament_free_agents WHERE tournament_id = $1 AND user_id = $2 AND status = 'waiting'",
      [tournament.id, user.id],
    );
    set.status = 200;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Leave free agent pool", security: [{ bearerAuth: [] }] },
);

// ── Đội mở tuyển ─────────────────────────────────────────────────────

teamFinderRouter.put(
  "/recruit/:registrationId",
  handle(async ({ params, body, user, set }) => {
    requireUser(user);
    const { entry, group, tournament } = await loadSquadEntry(params.registrationId);
    const role = await getMemberRole(group, user.id);
    if (!canManage(role, user) && !isStaff(user, tournament)) throw new GroupError(403, "Chỉ đội trưởng mới đổi cách tuyển");
    requireAccepting(tournament);

    const mode = ["closed", "approval", "open"].includes(body?.recruit_mode) ? body.recruit_mode : "closed";
    const wanted = rolesRequired(tournament.game)
      ? [...new Set((Array.isArray(body?.recruit_roles) ? body.recruit_roles : []).map(cleanRole))].filter((value) =>
          isPositionRole(tournament.game, value),
        )
      : [];
    await pool.query(
      `UPDATE tournament_teams SET recruit_mode = $1, recruit_roles = $2, recruit_note = $3, accept_auto_fill = $4
       WHERE id = $5`,
      [mode, wanted, cleanText(body?.recruit_note, 200), Boolean(body?.accept_auto_fill), entry.id],
    );
    set.status = 200;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Set squad recruiting (closed / approval / open)", security: [{ bearerAuth: [] }] },
);

/** Xin vào đội đang tuyển: 'open' → vào thẳng; 'approval' → gửi đơn cho đội trưởng. */
teamFinderRouter.post(
  "/recruit/:registrationId/join",
  handle(async ({ params, body, user, set }) => {
    requireUser(user);
    const result = await withTransaction(async (client) => {
      const { entry, group, tournament } = await loadSquadEntry(params.registrationId, client, { lock: true });
      requireAccepting(tournament);
      if (entry.recruit_mode === "closed") throw new GroupError(400, "Đội này không mở tuyển");
      if (await isUserInTournament(user.id, tournament.id, {}, client)) throw new GroupError(409, "Bạn đã có đội trong giải này");
      const role = requireRole(tournament, body?.ingame_role);

      if (entry.recruit_mode === "open") {
        const { rows } = await client.query(
          "SELECT COUNT(*)::int AS n FROM tournament_team_players WHERE tournament_team_id = $1",
          [entry.id],
        );
        if (rows[0].n >= rosterLimits(tournament).max) throw new GroupError(409, "Đội đã đủ người");
        await placeInSquad({ registrationId: entry.id, group, tournament, userId: user.id, role }, client);
        return { group, joined: true };
      }
      await client.query(
        `INSERT INTO team_join_requests (team_id, user_id, message, ingame_role, direction)
         VALUES ($1, $2, $3, $4, 'request')`,
        [group.id, user.id, cleanText(body?.message, 300), role],
      );
      return { group, joined: false };
    });

    notifyUsers(await getManagerIds(result.group), {
      event: result.joined ? "member_joined" : "join_request",
      group_id: result.group.id,
      user_id: user.id,
    });
    set.status = 200;
    return { data: { joined: result.joined } };
  }),
  { tags: [TAG], summary: "Join (open) or request to join (approval) a recruiting squad", security: [{ bearerAuth: [] }] },
);

/** Đội trưởng mời 1 người chơi lẻ đang chờ ghép. */
teamFinderRouter.post(
  "/recruit/:registrationId/invite",
  handle(async ({ params, body, user, set }) => {
    requireUser(user);
    const { group, tournament } = await loadSquadEntry(params.registrationId);
    const role = await getMemberRole(group, user.id);
    if (!canManage(role, user)) throw new GroupError(403, "Chỉ đội trưởng mới mời được");
    requireAccepting(tournament);

    const targetId = toNumber(body?.user_id);
    const { rows } = await pool.query(
      `SELECT primary_role FROM tournament_free_agents
       WHERE tournament_id = $1 AND user_id = $2 AND status = 'waiting'`,
      [tournament.id, targetId],
    );
    if (!rows[0]) throw new GroupError(404, "Người này không còn chờ ghép đội");
    const proposed = isPreferenceRole(tournament.game, cleanRole(body?.ingame_role))
      ? cleanRole(body.ingame_role)
      : rows[0].primary_role;
    await pool.query(
      `INSERT INTO team_join_requests (team_id, user_id, ingame_role, direction, decided_by)
       VALUES ($1, $2, $3, 'invite', $4)`,
      [group.id, targetId, proposed ?? null, user.id],
    );
    notifyUsers([targetId], { event: "team_invite", group_id: group.id, tournament_id: toNumber(tournament.id) });
    set.status = 201;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Invite a free agent to my squad", security: [{ bearerAuth: [] }] },
);

/** Người chơi trả lời lời mời của đội trưởng. */
teamFinderRouter.post(
  "/invites/:requestId/:decision",
  handle(async ({ params, body, user, set }) => {
    requireUser(user);
    const decision = params.decision;
    if (decision !== "accept" && decision !== "decline") throw new GroupError(400, "decision phải là accept hoặc decline");

    const group = await withTransaction(async (client) => {
      const { rows } = await client.query("SELECT * FROM team_join_requests WHERE id = $1 FOR UPDATE", [
        toNumber(params.requestId),
      ]);
      const invite = rows[0];
      if (!invite || invite.direction !== "invite" || invite.status !== "pending" || toNumber(invite.user_id) !== toNumber(user.id)) {
        throw new GroupError(404, "Lời mời không còn hiệu lực");
      }
      const target = await getGroup(invite.team_id, client);
      if (decision === "accept") {
        const { rows: reg } = await client.query(
          "SELECT id FROM tournament_teams WHERE team_id = $1 AND tournament_id = $2",
          [target.id, target.squad_tournament_id],
        );
        const tournament = await loadTournamentWithGame(target.squad_tournament_id, client);
        requireAccepting(tournament);
        if (await isUserInTournament(user.id, tournament.id, {}, client)) throw new GroupError(409, "Bạn đã có đội trong giải này");
        const role = requireRole(tournament, body?.ingame_role ?? invite.ingame_role);
        await placeInSquad({ registrationId: toNumber(reg[0]?.id), group: target, tournament, userId: user.id, role }, client);
      }
      await client.query(
        "UPDATE team_join_requests SET status = $1, decided_at = NOW() WHERE id = $2",
        [decision === "accept" ? "approved" : "declined", invite.id],
      );
      return target;
    });

    notifyUsers(await getManagerIds(group), {
      event: decision === "accept" ? "member_joined" : "invite_declined",
      group_id: group.id,
      user_id: user.id,
    });
    set.status = 200;
    return { ok: true };
  }),
  { tags: [TAG], summary: "Accept / decline a squad invite", security: [{ bearerAuth: [] }] },
);

/** BTC ghép đội ngay (không chờ hết hạn đăng ký). */
teamFinderRouter.post(
  "/:tournamentId/form-now",
  handle(async ({ params, user, set }) => {
    requireUser(user);
    const tournament = await loadTournamentWithGame(toNumber(params.tournamentId));
    if (!isStaff(user, tournament)) throw new GroupError(403, "Chỉ BTC mới ghép đội được");
    requireFinder(tournament);
    if (isFormationFinal(tournament)) throw new GroupError(409, "Giải đã ghép đội xong");
    const summary = await formTeamsForTournament(tournament.id, { force: true });
    set.status = 200;
    return { data: summary };
  }),
  { tags: [TAG], summary: "Form teams now (staff)", security: [{ bearerAuth: [] }] },
);

export default teamFinderRouter;
