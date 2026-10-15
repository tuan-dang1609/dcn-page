import logger from "./logger.js";
import { pool } from "./db.js";
import {
  GroupError,
  addMember,
  isUserInTournament,
  markFreeAgentsPlaced,
  notifyUsers,
  rosterLimits,
  toNumber,
  withTransaction,
} from "./groups.js";
import { ANY_ROLE, GAME_ROLES, gameKeyOf } from "./ingameRoles.js";
import { planTeamFormation } from "./teamFormation.js";

/**
 * Tìm đội (giải theo đội, ngoài series): xếp người vào đội hình kèm vai trò, và tự ghép đội khi hết hạn đăng ký.
 * Xem docs/team_finder_migration.sql + utils/teamFormation.js.
 */

const query = (client, sql, params) => (client ?? pool).query(sql, params);

/** Giải + game (valorant / lol / aov…). */
export const loadTournamentWithGame = async (tournamentId, client, { lock = false } = {}) => {
  const { rows } = await query(
    client,
    `SELECT t.id, t.name, t.slug, t.series_id, t.registration_mode, t.register_start, t.register_end,
            t.date_start, t.max_player_per_team, t.max_participate, t.created_by, t.team_formed_at,
            g.short_name AS game_short_name
     FROM tournaments t LEFT JOIN games g ON g.id = t.game_id
     WHERE t.id = $1 ${lock ? "FOR UPDATE OF t" : ""}`,
    [tournamentId],
  );
  if (!rows[0]) throw new GroupError(404, "Không tìm thấy giải");
  return { ...rows[0], game: gameKeyOf(rows[0].game_short_name) };
};

/**
 * Cho 1 người vào đội lẻ của lượt đăng ký (thành viên đội lẻ = đội hình thi đấu) kèm vai trò.
 * Đội đủ người → addMember báo lỗi 409.
 */
export const placeInSquad = async ({ registrationId, group, tournament, userId, role, memberRole = "member" }, client) => {
  // Đội lẻ: addMember đã đưa vào đội hình (và chặn khi đủ người) → chỉ ghi vai trò
  await addMember(group, userId, memberRole, client);
  await query(
    client,
    `INSERT INTO tournament_team_players (tournament_team_id, user_id, ingame_role) VALUES ($1, $2, $3)
     ON CONFLICT (tournament_team_id, user_id) DO UPDATE SET ingame_role = COALESCE(EXCLUDED.ingame_role, tournament_team_players.ingame_role)`,
    [registrationId, userId, role ?? null],
  );
  await markFreeAgentsPlaced(tournament.id, [userId], registrationId, client);
  // Đơn xin vào / lời mời của các đội khác trong giải → huỷ
  await query(
    client,
    `UPDATE team_join_requests r SET status = 'cancelled', decided_at = NOW()
     FROM teams t
     WHERE t.id = r.team_id AND t.kind = 'squad' AND t.squad_tournament_id = $1
       AND r.user_id = $2 AND r.status = 'pending' AND r.team_id <> $3`,
    [tournament.id, userId, group.id],
  );
};

/** Tên đội ghép tự động chưa trùng trong giải: "Đội ngẫu nhiên 1", tag RND1… */
const nextAutoNames = async (tournamentId, count, client) => {
  const { rows } = await query(
    client,
    "SELECT lower(name) AS name FROM teams WHERE kind = 'squad' AND squad_tournament_id = $1",
    [tournamentId],
  );
  const taken = new Set(rows.map((row) => row.name));
  const names = [];
  for (let k = 1; names.length < count; k += 1) {
    const name = `Đội ngẫu nhiên ${k}`;
    if (!taken.has(name.toLowerCase())) names.push({ name, short_name: `RND${k}` });
  }
  return names;
};

const isDue = (tournament) =>
  Boolean(tournament.register_end) && new Date(tournament.register_end).getTime() <= Date.now();

/**
 * Đã ghép lần cuối (lúc / sau hạn đăng ký) → không nhận thêm người chờ ghép.
 * team_formed_at trước hạn (BTC bấm ghép sớm ở bản cũ) không tính là đã chốt.
 */
export const isFormationFinal = (tournament) =>
  Boolean(tournament.team_formed_at) &&
  (!tournament.register_end || new Date(tournament.team_formed_at) >= new Date(tournament.register_end));

/**
 * Ghép đội cho 1 giải.
 *   - Hết hạn đăng ký: ghép lần cuối (1 lần — tournaments.team_formed_at), người dư → 'unplaced'.
 *   - force trước hạn (BTC "Ghép đội ngay"): chỉ ghép những người đang chờ, người dư VẪN chờ,
 *     giải vẫn nhận đăng ký và tới hạn vẫn tự ghép lần cuối.
 * Trả tóm tắt, hoặc null nếu không cần / đã chốt.
 */
export const formTeamsForTournament = async (tournamentId, { force = false } = {}) => {
  const summary = await withTransaction(async (client) => {
    const tournament = await loadTournamentWithGame(tournamentId, client, { lock: true });
    if (isFormationFinal(tournament)) return null;
    const due = isDue(tournament);
    if (!force && !due) return null;

    const { rows: waiting } = await client.query(
      `SELECT user_id, primary_role, secondary_role, can_captain
       FROM tournament_free_agents
       WHERE tournament_id = $1 AND status = 'waiting'
       ORDER BY created_at, id`,
      [tournament.id],
    );
    // Ai đã có đội bằng đường khác → bỏ khỏi danh sách chờ
    const agents = [];
    const alreadyIn = [];
    for (const agent of waiting) {
      if (await isUserInTournament(agent.user_id, tournament.id, {}, client)) alreadyIn.push(toNumber(agent.user_id));
      else agents.push({ ...agent, user_id: toNumber(agent.user_id) });
    }
    await markFreeAgentsPlaced(tournament.id, alreadyIn, null, client);

    const { min: teamSize } = rosterLimits(tournament);
    const { rows: openTeams } = await client.query(
      `SELECT tt.id AS registration_id, tt.team_id, tt.recruit_roles,
              COALESCE(array_agg(p.ingame_role) FILTER (WHERE p.ingame_role IS NOT NULL), '{}') AS roles,
              COUNT(p.user_id)::int AS size
       FROM tournament_teams tt
       JOIN teams t ON t.id = tt.team_id AND t.kind = 'squad'
       LEFT JOIN tournament_team_players p ON p.tournament_team_id = tt.id
       WHERE tt.tournament_id = $1 AND tt.accept_auto_fill
       GROUP BY tt.id`,
      [tournament.id],
    );
    const { rows: countRows } = await client.query(
      "SELECT COUNT(*)::int AS n FROM tournament_teams WHERE tournament_id = $1",
      [tournament.id],
    );
    const maxTeams = toNumber(tournament.max_participate);

    const plan = planTeamFormation({
      agents,
      teams: openTeams.map((team) => ({
        registration_id: toNumber(team.registration_id),
        size: team.size,
        roles: team.roles,
        wanted: team.recruit_roles,
      })),
      teamSize,
      positions: GAME_ROLES[tournament.game] ?? [],
      anyRole: ANY_ROLE[tournament.game] ?? null,
      maxNewTeams: maxTeams ? Math.max(0, maxTeams - countRows[0].n) : Infinity,
    });

    const teamById = new Map(openTeams.map((team) => [toNumber(team.registration_id), team]));
    for (const fill of plan.fills) {
      const team = teamById.get(fill.registration_id);
      const group = { id: team.team_id, kind: "squad", squad_tournament_id: tournament.id };
      for (const member of fill.members) {
        await placeInSquad({ registrationId: fill.registration_id, group, tournament, userId: member.user_id, role: member.role }, client);
      }
    }

    const names = await nextAutoNames(tournament.id, plan.newTeams.length, client);
    const created = [];
    for (const [index, team] of plan.newTeams.entries()) {
      const { rows: inserted } = await client.query(
        `INSERT INTO teams (name, short_name, logo_url, team_color_hex, created_by, kind, squad_tournament_id)
         VALUES ($1, $2, NULL, NULL, $3, 'squad', $4) RETURNING id, kind, squad_tournament_id, created_by`,
        [names[index].name, names[index].short_name, team.captain_user_id, tournament.id],
      );
      const group = inserted[0];
      const { rows: reg } = await client.query(
        `INSERT INTO tournament_teams (team_id, tournament_id, captain_user_id) VALUES ($1, $2, $3) RETURNING id`,
        [group.id, tournament.id, team.captain_user_id],
      );
      const registrationId = toNumber(reg[0].id);
      for (const member of team.members) {
        await placeInSquad(
          {
            registrationId,
            group,
            tournament,
            userId: member.user_id,
            role: member.role,
            memberRole: member.user_id === team.captain_user_id ? "captain" : "member",
          },
          client,
        );
      }
      created.push({ registration_id: registrationId, team_id: toNumber(group.id), ...team });
    }

    // Ghép sớm: người dư vẫn chờ, chưa chốt
    if (due) {
      if (plan.unplaced.length) {
        await client.query(
          `UPDATE tournament_free_agents SET status = 'unplaced', updated_at = NOW()
           WHERE tournament_id = $1 AND user_id = ANY($2::bigint[]) AND status = 'waiting'`,
          [tournament.id, plan.unplaced],
        );
      }
      await client.query("UPDATE tournaments SET team_formed_at = NOW() WHERE id = $1", [tournament.id]);
    }

    return {
      tournament_id: toNumber(tournament.id),
      final: due,
      filled: plan.fills,
      created,
      unplaced: due ? plan.unplaced : [],
      still_waiting: due ? [] : plan.unplaced,
    };
  });

  if (summary) {
    const placed = [...summary.filled.flatMap((fill) => fill.members), ...summary.created.flatMap((team) => team.members)];
    notifyUsers(
      placed.map((member) => member.user_id),
      { event: "team_formed", tournament_id: summary.tournament_id },
    );
    notifyUsers(summary.unplaced, { event: "team_unplaced", tournament_id: summary.tournament_id });
    logger.info(
      `team formation t=${summary.tournament_id}: lấp ${summary.filled.length} đội, tạo ${summary.created.length} đội, ${summary.unplaced.length} người chưa có đội`,
    );
  }
  return summary;
};

/** Các giải đã hết hạn đăng ký mà còn người chờ ghép. */
export const sweepTeamFormation = async () => {
  const { rows } = await pool.query(
    `SELECT DISTINCT t.id
     FROM tournaments t
     JOIN tournament_free_agents fa ON fa.tournament_id = t.id AND fa.status = 'waiting'
     WHERE t.register_end IS NOT NULL AND t.register_end <= NOW()
       AND (t.team_formed_at IS NULL OR t.team_formed_at < t.register_end)`,
  );
  for (const row of rows) {
    try {
      await formTeamsForTournament(toNumber(row.id));
    } catch (error) {
      logger.error(`team formation t=${row.id} lỗi:`, error instanceof Error ? error.message : String(error));
    }
  }
};

let sweeper = null;
let sweeping = false;

/** Kiểm tra mỗi phút (server Render ngủ thì lần mở trang giải kế tiếp cũng tự ghép — xem controller). */
export const startTeamFormationSweeper = (intervalMs = 60_000) => {
  if (sweeper) return;
  const tick = async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      await sweepTeamFormation();
    } catch (error) {
      // Chưa chạy migration (thiếu bảng) → bỏ qua, không làm sập server
      if (error?.code !== "42P01" && error?.code !== "42703") {
        logger.error("team formation sweep lỗi:", error instanceof Error ? error.message : String(error));
      }
    } finally {
      sweeping = false;
    }
  };
  sweeper = setInterval(() => void tick(), intervalMs);
  void tick();
};
