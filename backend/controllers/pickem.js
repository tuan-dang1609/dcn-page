import { Elysia } from "elysia";
import {
  evaluateBracketPicks,
  ensurePickemTables,
  getBracketById,
  getBracketPickemData,
  getMatchesByBracketId,
  getUserBracketPicks,
  upsertUserBracketPicks,
} from "../utils/pickem.js";

const pickemRouter = new Elysia({ name: "Pickem" });
const TAG = "Pickem";

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeUserId = (value) => String(value ?? "").trim();

const asObject = (value, fallback = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  return value;
};

const resolveUserId = ({ query, request }) =>
  normalizeUserId(query?.userId ?? request.headers.get("x-user-id") ?? "");

pickemRouter.onBeforeHandle(async () => {
  await ensurePickemTables();
});

pickemRouter.get(
  "/bracket/:bracket_id",
  async ({ params, query, request, set }) => {
    const bracketId = toNumber(params.bracket_id);
    if (!bracketId) {
      set.status = 400;
      return { error: "bracket_id is required" };
    }

    const userId = resolveUserId({ query, request });
    const data = await getBracketPickemData({
      bracketId,
      userId: userId || null,
    });

    if (!data) {
      set.status = 404;
      return { error: "Bracket not found" };
    }

    return {
      bracket: data.bracket,
      matches: data.matches,
      myPicks: data.myPicks,
      totalMatches: data.matches.length,
    };
  },
  {
    tags: [TAG],
    summary: "Get bracket pickem data by bracket_id",
  },
);

pickemRouter.get(
  "/bracket/:bracket_id/my-picks",
  async ({ params, query, request, set }) => {
    const bracketId = toNumber(params.bracket_id);
    if (!bracketId) {
      set.status = 400;
      return { error: "bracket_id is required" };
    }

    const userId = resolveUserId({ query, request });
    if (!userId) {
      set.status = 400;
      return { error: "userId is required" };
    }

    const bracket = await getBracketById(bracketId);
    if (!bracket) {
      set.status = 404;
      return { error: "Bracket not found" };
    }

    const [myPicks, matches] = await Promise.all([
      getUserBracketPicks({ bracketId, userId }),
      getMatchesByBracketId(bracketId),
    ]);

    const evaluated = evaluateBracketPicks({
      matches,
      picks: myPicks?.picks ?? [],
    });

    return {
      bracket_id: bracketId,
      userId,
      user: myPicks?.userMeta ?? {},
      picks: evaluated.picks,
      stats: evaluated.stats,
      updatedAt: myPicks?.updatedAt ?? null,
    };
  },
  {
    tags: [TAG],
    summary: "Get current user picks by bracket_id",
  },
);

pickemRouter.post(
  "/bracket/:bracket_id/picks",
  async ({ params, body, set }) => {
    const bracketId = toNumber(params.bracket_id);
    if (!bracketId) {
      set.status = 400;
      return { error: "bracket_id is required" };
    }

    const userId = normalizeUserId(body?.userId);
    if (!userId) {
      set.status = 400;
      return { error: "userId is required" };
    }

    const bracket = await getBracketById(bracketId);
    if (!bracket) {
      set.status = 404;
      return { error: "Bracket not found" };
    }

    const saved = await upsertUserBracketPicks({
      bracketId,
      userId,
      userMeta: asObject(body?.user, {}),
      picks: Array.isArray(body?.picks) ? body.picks : [],
    });

    if (!saved) {
      set.status = 500;
      return { error: "Cannot save picks" };
    }

    return {
      success: true,
      message: "Picks saved",
      data: {
        bracketId,
        userId,
        picks: saved.picks,
        count: saved.picks.length,
        updatedAt: saved.updatedAt,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Save user picks by bracket_id",
  },
);

export default pickemRouter;
