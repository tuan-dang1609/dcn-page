import { Elysia } from "elysia";
import middleware from "../../utils/middleware.js";
import {
  buildRoundSlug,
  createBanPickSession,
  ensureBanPickTables,
  ensureSessionByRoundSlug,
  getBanPickSessionByRoundSlug,
  mutateBanPickSession,
  resolveUserTeamSlot,
  toBanPickPayload,
} from "../../utils/banPick.js";
import { pool } from "../../utils/db.js";
import { emitBanPickRoomState } from "../../realtime/banPickHub.js";

const roundRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Round";

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
           t.slug AS tournament_slug
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

roundRouter.onBeforeHandle(async () => {
  await ensureBanPickTables();
});

roundRouter.get(
  "/:round_slug/ban-pick",
  async ({ params, query, user, set }) => {
    const matchId = toNumber(query?.match_id);
    const format = query?.format;

    let session = await getBanPickSessionByRoundSlug(params.round_slug);

    if (!session && matchId) {
      const matchContext = await getMatchContextForSlug(matchId);
      if (!matchContext) {
        set.status = 404;
        return { error: "Không tìm thấy match" };
      }

      const normalizedRoundSlug = normalizeRoundSlug({
        slug: params.round_slug,
        matchContext,
      });

      session = await ensureSessionByRoundSlug({
        roundSlug: normalizedRoundSlug,
        matchId,
        format,
      });
    }

    if (!session) {
      set.status = 404;
      return {
        error:
          "Không tìm thấy ban/pick theo round slug. Truyền thêm match_id để khởi tạo",
      };
    }

    const viewerTeamSlot = resolveUserTeamSlot(user, session);

    set.status = 200;
    return {
      data: toBanPickPayload(session, viewerTeamSlot),
      permissions: {
        can_act: Boolean(viewerTeamSlot),
        viewer_team_slot: viewerTeamSlot,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Get ban/pick by round slug",
  },
);

roundRouter.post(
  "/:round_slug/ban-pick/init",
  async ({ params, body, set }) => {
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

    const roundSlug = normalizeRoundSlug({
      slug: params.round_slug,
      matchContext,
    });

    const session = await ensureSessionByRoundSlug({
      roundSlug,
      matchId,
      format: body?.format,
    });

    if (!session) {
      set.status = 500;
      return { error: "Không thể khởi tạo ban/pick" };
    }

    set.status = 201;
    return {
      data: toBanPickPayload(session, null),
    };
  },
  {
    tags: [TAG],
    summary: "Init ban/pick by round slug and match id",
  },
);

roundRouter.post(
  "/:round_slug/ban-pick/action",
  async ({ params, body, user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const command = String(body?.command ?? "").trim();
    if (!command) {
      set.status = 400;
      return { error: "Thiếu command" };
    }

    const result = await mutateBanPickSession({
      roundSlug: params.round_slug,
      user,
      command,
      mapId: body?.map_id,
      side: body?.side,
    });

    if (!result.ok) {
      set.status = result.status;
      return { error: result.error };
    }

    emitBanPickRoomState({
      roundSlug: result.session?.round_slug ?? params.round_slug,
      session: result.session,
    });

    const viewerTeamSlot = resolveUserTeamSlot(user, result.session);

    set.status = 200;
    return {
      data: toBanPickPayload(result.session, viewerTeamSlot),
    };
  },
  {
    tags: [TAG],
    summary: "Mutate ban/pick over HTTP fallback",
    security: [{ bearerAuth: [] }],
  },
);

roundRouter.post(
  "/:round_slug/ban-pick/create",
  async ({ params, body, set }) => {
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

    const roundSlug = normalizeRoundSlug({
      slug: params.round_slug,
      matchContext,
    });

    const session = await createBanPickSession({
      matchId,
      roundSlug,
      format: body?.format,
    });

    if (!session) {
      set.status = 500;
      return { error: "Không thể tạo phiên ban/pick" };
    }

    set.status = 201;
    return {
      data: toBanPickPayload(session, null),
    };
  },
  {
    tags: [TAG],
    summary: "Create new ban/pick session for match",
  },
);

export default roundRouter;
