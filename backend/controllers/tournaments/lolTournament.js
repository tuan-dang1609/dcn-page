import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import logger from "../../utils/logger.js";
import middleware from "../../utils/middleware.js";
import { toNumber } from "../../utils/groups.js";
import {
  autoCreateLolCodes,
  canSeeMatchCodes,
  createLolCodeForGame,
  handleLolCallback,
  listMatchCodes,
  listMyOpenCodes,
  lolTournamentMode,
  pollLolCodes,
} from "../../utils/lolTournament.js";

/**
 * Mã phòng giải đấu LMHT (utils/lolTournament.js):
 *   POST /callback                — Riot gọi khi ván xong (không cần đăng nhập; kết quả lấy lại từ Riot)
 *   GET  /mine                    — mã đang mở của trận tôi thi đấu / quản lý (dải thông báo)
 *   GET  /matches/:matchId        — mã các ván của trận (người thi đấu, quản lý 2 đội, BTC)
 *   POST /matches/:matchId/code   — BTC tạo mã ván kế tiếp ngay (không chờ hạn chốt)
 */
const lolTournamentRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "LoL tournament codes";
const STAFF_ROLE_IDS = new Set([1, 2, 3]);

const isStaffOfMatch = async (user, matchId) => {
  if (!user) return false;
  if (STAFF_ROLE_IDS.has(toNumber(user.role_id))) return true;
  const { rows } = await pool.query(
    `SELECT t.created_by FROM matches m LEFT JOIN brackets b ON b.id = m.bracket_id
     JOIN tournaments t ON t.id = COALESCE(m.tournament_id, b.tournament_id) WHERE m.id = $1`,
    [matchId],
  );
  return toNumber(rows[0]?.created_by) === toNumber(user.id);
};

lolTournamentRouter.post(
  "/callback",
  async ({ body, set }) => {
    // Trả 200 ngay cho Riot; xử lý sau
    void handleLolCallback(body).catch((error) =>
      logger.error("[lol-tournament] callback lỗi:", error instanceof Error ? error.message : String(error)),
    );
    set.status = 200;
    return { ok: true };
  },
  { tags: [TAG], summary: "Riot tournament callback (game finished)" },
);

lolTournamentRouter.get(
  "/mine",
  async ({ user, set }) => {
    set.status = 200;
    return { data: user ? await listMyOpenCodes(user.id) : [] };
  },
  { tags: [TAG], summary: "My open LoL tournament codes", security: [{ bearerAuth: [] }] },
);

lolTournamentRouter.get(
  "/matches/:matchId",
  async ({ params, user, set }) => {
    const matchId = toNumber(params.matchId);
    if (!matchId) {
      set.status = 400;
      return { error: "match_id không hợp lệ" };
    }
    // Server ngủ lỡ giờ tạo mã / lỡ callback → làm ngay khi có người mở trang trận
    await autoCreateLolCodes({ matchId }).catch(() => {});
    await pollLolCodes({ matchId }).catch(() => {});

    const staff = await isStaffOfMatch(user, matchId);
    const allowed = staff || (user ? await canSeeMatchCodes(user.id, matchId) : false);
    const codes = await listMatchCodes(matchId);
    set.status = 200;
    return {
      data: {
        mode: lolTournamentMode(),
        can_view: allowed,
        can_create: staff,
        // Người ngoài: chỉ biết ván nào đã có mã, không thấy mã
        codes: codes.map((row) => ({ ...row, code: allowed ? row.code : null })),
      },
    };
  },
  { tags: [TAG], summary: "Tournament codes of a match" },
);

lolTournamentRouter.post(
  "/matches/:matchId/code",
  async ({ params, user, set }) => {
    const matchId = toNumber(params.matchId);
    if (!(await isStaffOfMatch(user, matchId))) {
      set.status = 403;
      return { error: "Chỉ BTC mới tạo mã được" };
    }
    const { rows } = await pool.query("SELECT score_a, score_b FROM matches WHERE id = $1", [matchId]);
    if (!rows[0]) {
      set.status = 404;
      return { error: "Không tìm thấy trận" };
    }
    try {
      const gameNo = (toNumber(rows[0].score_a) ?? 0) + (toNumber(rows[0].score_b) ?? 0) + 1;
      const code = await createLolCodeForGame(matchId, gameNo);
      set.status = 201;
      return { data: { code, game_no: gameNo } };
    } catch (error) {
      set.status = error?.status && error.status < 500 ? 400 : 502;
      return { error: error instanceof Error ? error.message : "Không tạo được mã" };
    }
  },
  { tags: [TAG], summary: "Create tournament code for next game now (staff)", security: [{ bearerAuth: [] }] },
);

export default lolTournamentRouter;
