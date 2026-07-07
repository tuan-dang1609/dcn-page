import { Elysia } from "elysia";

import middleware from "../../utils/middleware.js";

import { normalizeAovParsedPayload } from "../../utils/aovPayload.js";

import {

  ensureAovStatsTables,

  getMatchGameStats,

  getMatchStatsByMatchId,

} from "../../utils/aovMatchStatsDb.js";

import {

  createStagedAovStats,

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

    const parsed = normalizeAovParsedPayload(rawBody);



    if (!parsed.players.blue.length && !parsed.players.red.length) {

      set.status = 400;

      return { error: "Payload không có dữ liệu người chơi" };

    }



    try {

      const result = await createStagedAovStats({

        rawPayload: parsed,

        userId: user?.id,

      });



      set.status = 201;

      return {

        status: "success",

        message:

          "Đã tạo match_id. Dán match_id này vào Score Control (ô info_game_id).",

        data: result,

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

    summary: "Tạo match_id AOV + lưu stats tạm (gắn trận ở Score Control)",

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



    const data = await getMatchStatsByMatchId(matchId);

    set.status = 200;

    return { status: "success", data };

  },

  {

    tags: [TAG],

    summary: "Lấy tất cả ván AOV của một match series",

  },

);



export default aovStatsRouter;

