import { Elysia } from "elysia";
import middleware from "../../utils/middleware.js";
import { pool } from "../../utils/db.js";
import { normalizeAovImportBatch } from "../../utils/aovPayload.js";
import {
  ensureAovStatsTables,
  getMatchGameStats,
  getMatchStatsByMatchId,
} from "../../utils/aovMatchStatsDb.js";
import {
  createStagedAovStats,
  ensureMatchAovStatsFromStaging,
  getStagedAovStats,
} from "../../utils/aovStagingDb.js";



const aovStatsRouter = new Elysia().derive(middleware.deriveAuthContext);

const TAG = "AOV Match Stats";

const allowedRoleIds = new Set([1, 2, 3]);



const toNumber = (value) => {

  if (value === null || value === undefined) return null;

  if (typeof value === "string" && value.trim() === "") return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;

};



const ensureOpsPermission = (user, set) => {

  if (!user) {

    set.status = 401;

    return { ok: false, error: { error: "Unauthorized" } };

  }



  if (!allowedRoleIds.has(Number(user.role_id))) {

    set.status = 403;

    return { ok: false, error: { error: "Không có quyền thao tác" } };

  }



  return { ok: true };

};



aovStatsRouter.onBeforeHandle(async () => {

  await ensureAovStatsTables();

});



aovStatsRouter.post(
  "/aov/staging/generate",
  async ({ body, set, user }) => {
    const permission = ensureOpsPermission(user, set);
    if (!permission.ok) return permission.error;

    const rawBody = body?.data ?? body;
    const batch = normalizeAovImportBatch(rawBody);

    if (!batch.length) {
      set.status = 400;
      return { error: "Payload không có dữ liệu người chơi" };
    }

    try {
      const items = [];
      for (const parsed of batch) {
        const result = await createStagedAovStats({
          rawPayload: parsed,
          userId: user?.id,
        });
        items.push(result);
      }

      set.status = 201;
      return {
        status: "success",
        message:
          items.length === 1
            ? "Đã tạo match_id. Dán vào Score Control (ô info_game_id)."
            : `Đã tạo ${items.length} match_id (mỗi ván một id). Dán lần lượt vào Game 1/2/… trên Score Control.`,
        data: {
          count: items.length,
          items,
          // tương thích client cũ: 1 ván → trả luôn object đầu
          ...(items.length === 1
            ? { match_id: items[0].match_id, data: items[0].data }
            : {}),
        },
      };
    } catch (error) {
      set.status = 500;
      return {
        error: error instanceof Error ? error.message : "Generate failed",
      };
    }
  },
  {
    tags: [TAG],
    summary: "Tạo match_id AOV (1 JSON = 1 ván, mảng = nhiều ván)",
  },
);



aovStatsRouter.get(

  "/aov/staging/:match_id",

  async ({ params, set, user }) => {

    const permission = ensureOpsPermission(user, set);

    if (!permission.ok) return permission.error;



    const matchId = String(params.match_id ?? "").trim();

    if (!matchId) {

      set.status = 400;

      return { error: "match_id không hợp lệ" };

    }



    const staged = await getStagedAovStats(matchId);

    if (!staged) {

      set.status = 404;

      return { error: "Không tìm thấy staged stats" };

    }



    set.status = 200;

    return { status: "success", data: staged };

  },

  {

    tags: [TAG],

    summary: "Xem staged stats theo match_id (aov:...)",

  },

);



aovStatsRouter.get(

  "/games/:match_game_id/stats",

  async ({ params, set }) => {

    const matchGameId = toNumber(params.match_game_id);



    if (!matchGameId) {

      set.status = 400;

      return { error: "match_game_id không hợp lệ" };

    }



    const data = await getMatchGameStats(matchGameId);

    if (!data) {

      set.status = 404;

      return { error: "Match game stats not found" };

    }



    set.status = 200;

    return { status: "success", data };

  },

  {

    tags: [TAG],

    summary: "Lấy stats theo match_game_id",

  },

);



aovStatsRouter.get(
  "/matches/:match_id/aov/stats",
  async ({ params, set }) => {
    const matchId = toNumber(params.match_id);

    if (!matchId) {
      set.status = 400;
      return { error: "match_id không hợp lệ" };
    }

    // Tự áp lại staging nếu đã dán aov:… mà chưa có player stats
    await ensureMatchAovStatsFromStaging(matchId);

    const data = await getMatchStatsByMatchId(matchId);

    // Series score từ bảng matches (Score Control) — không tính từ kill từng ván
    const { rows: matchRows } = await pool.query(
      `
      SELECT score_a, score_b, winner_team_id, status
      FROM matches
      WHERE id = $1
      LIMIT 1
      `,
      [matchId],
    );
    const matchRow = matchRows[0] ?? null;

    set.status = 200;
    return {
      status: "success",
      data,
      series: matchRow
        ? {
            score_a: toNumber(matchRow.score_a) ?? 0,
            score_b: toNumber(matchRow.score_b) ?? 0,
            winner_team_id: toNumber(matchRow.winner_team_id),
            status: matchRow.status ?? null,
          }
        : null,
    };
  },
  {
    tags: [TAG],
    summary: "Lấy tất cả ván AOV của một match series",
  },
);



export default aovStatsRouter;

