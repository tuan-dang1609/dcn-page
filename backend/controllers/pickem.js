import { Elysia } from "elysia";
import {
  ensurePickemTables,
  getPickemAnswersByLeagueAndUser,
  getPickemLeaderboardRows,
  getPickemQuestionsByLeague,
  getUsersByIds,
  gradePickemLeague,
  upsertPickemQuestions,
  upsertPickemResponse,
} from "../utils/pickem.js";

const pickemRouter = new Elysia({ name: "Pickem" });
const TAG = "Pickem";

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBoolean = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
};

const asObject = (value, fallback = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  return value;
};

const getExpectedApiKey = () =>
  process.env.API_KEY_DCN || process.env.API_KEY || process.env.DCN_API_KEY;

const toTeamText = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const name = String(value.name ?? "").trim();
    return name || null;
  }
  return null;
};

const toTeamLogo = (value) => {
  if (!value || typeof value !== "object") return null;
  return (
    String(value.logoTeam ?? value.logo_url ?? value.logo ?? "").trim() || null
  );
};

const getUserIdCandidates = (rows) =>
  rows.map((row) => String(row.user_id ?? "").trim()).filter(Boolean);

const shapeLeaderboard = ({ rows, userMap }) => {
  const leaderboard = rows.map((row) => {
    const userId = String(row.user_id ?? "").trim();
    const userMeta = asObject(row.user_meta, {});
    const dbUser = userMap.get(userId) ?? null;

    const username =
      String(
        dbUser?.username ??
          userMeta.username ??
          userMeta.nickname ??
          userMeta.userId ??
          userId,
      ).trim() || userId;

    const nickname =
      String(dbUser?.nickname ?? userMeta.nickname ?? username).trim() ||
      username;

    const team =
      String(
        dbUser?.team_name ??
          userMeta.teamName ??
          toTeamText(userMeta.team) ??
          "",
      ).trim() || null;

    const logoTeam =
      String(
        dbUser?.team_logo ??
          userMeta.logoTeam ??
          toTeamLogo(userMeta.team) ??
          "",
      ).trim() || null;

    const img =
      String(
        dbUser?.profile_picture ??
          userMeta.img ??
          userMeta.profilePicture ??
          userMeta.profile_picture ??
          "",
      ).trim() || null;

    return {
      userId,
      username,
      nickname,
      team,
      logoTeam,
      img,
      Score: Number(row.total_score ?? 0),
      _lastUpdate: row.last_update
        ? new Date(row.last_update).getTime()
        : Number.MAX_SAFE_INTEGER,
    };
  });

  leaderboard.sort((a, b) => {
    if (b.Score !== a.Score) return b.Score - a.Score;
    if (a._lastUpdate !== b._lastUpdate) return a._lastUpdate - b._lastUpdate;
    return String(a.userId).localeCompare(String(b.userId));
  });

  return leaderboard.map(({ _lastUpdate, ...rest }) => rest);
};

pickemRouter.onBeforeHandle(async () => {
  await ensurePickemTables();
});

pickemRouter.onBeforeHandle(({ request, query, body, set }) => {
  if (request.method === "OPTIONS") return;

  const expected = getExpectedApiKey();
  if (!expected) return;

  const requestBody = asObject(body, {});
  const provided = String(
    request.headers.get("x-api-key") ??
      query?.api_key ??
      requestBody.api_key ??
      "",
  ).trim();

  if (!provided || provided !== expected) {
    set.status = 401;
    return { error: "Invalid API key" };
  }
});

pickemRouter.get(
  "/pickemscore/:league_id/leaderboard",
  async ({ params, set }) => {
    const leagueId = String(params.league_id ?? "").trim();
    if (!leagueId) {
      set.status = 400;
      return { error: "league_id is required" };
    }

    const rows = await getPickemLeaderboardRows(leagueId);
    const userMap = await getUsersByIds(getUserIdCandidates(rows));

    return {
      league_id: leagueId,
      leaderboard: shapeLeaderboard({ rows, userMap }),
    };
  },
  {
    tags: [TAG],
    summary: "Get Pickem leaderboard from stored response scores",
  },
);

pickemRouter.get(
  "/pickem/:league_id/leaderboard",
  async ({ params, set }) => {
    const leagueId = String(params.league_id ?? "").trim();
    if (!leagueId) {
      set.status = 400;
      return { error: "league_id is required" };
    }

    const rows = await getPickemLeaderboardRows(leagueId);
    const userMap = await getUsersByIds(getUserIdCandidates(rows));

    return {
      league_id: leagueId,
      leaderboard: shapeLeaderboard({ rows, userMap }),
    };
  },
  {
    tags: [TAG],
    summary: "Get Pickem leaderboard",
  },
);

pickemRouter.post(
  "/:scope/addquestion",
  async ({ params, body, set }) => {
    const leagueId = String(params.scope ?? "").trim();
    if (!leagueId) {
      set.status = 400;
      return { error: "league_id is required" };
    }

    const payload = Array.isArray(body) ? body : [body];
    const updatedQuestions = await upsertPickemQuestions({
      leagueId,
      questions: payload,
    });

    if (!updatedQuestions.length) {
      set.status = 400;
      return { error: "No valid questions to update" };
    }

    await gradePickemLeague(leagueId);

    set.status = 200;
    return {
      message: "Questions processed",
      league_id: leagueId,
      updatedQuestions,
    };
  },
  {
    tags: [TAG],
    summary: "Create or update Pickem questions",
  },
);

pickemRouter.get(
  "/:scope/:league_id/question/:type",
  async ({ params, set }) => {
    const leagueId = String(params.league_id ?? "").trim();
    if (!leagueId) {
      set.status = 400;
      return { error: "league_id is required" };
    }

    const gameShort = String(params.scope ?? "")
      .trim()
      .toLowerCase();
    const type = String(params.type ?? "")
      .trim()
      .toLowerCase();

    const includeAllGames = !gameShort || gameShort === "all";
    const includeAllTypes = !type || type === "all";

    const allQuestions = await getPickemQuestionsByLeague(leagueId);

    const filtered = allQuestions.filter((q) => {
      const gameMatch = includeAllGames
        ? true
        : String(q.game_short ?? "")
            .trim()
            .toLowerCase() === gameShort;

      const typeMatch = includeAllTypes
        ? true
        : String(q.type ?? "")
            .trim()
            .toLowerCase() === type;

      return gameMatch && typeMatch;
    });

    const sanitized = filtered.map((q) => ({
      id: Number(q.question_id),
      question: q.question,
      type: q.type,
      options: q.options ?? [],
      score: Number(q.score ?? 0),
      maxChoose: Number(q.max_choose ?? 1),
      correctAnswer: q.correct_answer ?? [],
      game_short: q.game_short,
      bracket_id: q.bracket_id,
      openTime: q.open_time,
      closeTime: q.close_time,
    }));

    const totalPoint = sanitized.reduce(
      (sum, q) => sum + (Number(q.maxChoose) || 0) * (Number(q.score) || 0),
      0,
    );

    const leagueScope = allQuestions.filter((q) =>
      includeAllTypes
        ? true
        : String(q.type ?? "")
            .trim()
            .toLowerCase() === type,
    );

    const totalPointAll = leagueScope.reduce(
      (sum, q) => sum + (Number(q.max_choose) || 0) * (Number(q.score) || 0),
      0,
    );

    return {
      league_id: leagueId,
      game_short: params.scope,
      type: params.type,
      count: sanitized.length,
      questions: sanitized,
      totalPoint,
      totalPointAll,
    };
  },
  {
    tags: [TAG],
    summary: "List Pickem questions by game and type",
  },
);

pickemRouter.post(
  "/:scope/submitPrediction",
  async ({ params, body, set }) => {
    const leagueId = String(params.scope ?? "").trim();
    const userId = String(body?.userId ?? "").trim();
    const answers = Array.isArray(body?.answers) ? body.answers : null;

    if (!leagueId || !userId || !answers) {
      set.status = 400;
      return {
        error: "league_id, userId and answers are required",
      };
    }

    const responseId = await upsertPickemResponse({
      leagueId,
      userId,
      userMeta: asObject(body?.user, {}),
      answers,
    });

    if (!responseId) {
      set.status = 500;
      return { error: "Cannot save prediction" };
    }

    await gradePickemLeague(leagueId);

    const answerData = await getPickemAnswersByLeagueAndUser({
      leagueId,
      userId,
    });

    return {
      success: true,
      message: "Prediction saved and regraded",
      data: {
        responseId,
        totalScore: Number(answerData?.response?.total_score ?? 0),
      },
    };
  },
  {
    tags: [TAG],
    summary: "Submit Pickem predictions",
  },
);

pickemRouter.get(
  "/:scope/myanswer",
  async ({ params, query, request, set }) => {
    const leagueId = String(params.scope ?? "").trim();
    const userId =
      String(query?.userId ?? request.headers.get("x-user-id") ?? "").trim() ||
      null;

    if (!leagueId || !userId) {
      set.status = 400;
      return { error: "league_id and userId are required" };
    }

    const includeLogs = parseBoolean(query?.includeLogs, true);
    const includeMeta = parseBoolean(query?.includeMeta, true);
    const questionIdFilter = toNumber(query?.questionId);

    const data = await getPickemAnswersByLeagueAndUser({ leagueId, userId });
    if (!data) {
      set.status = 404;
      return { error: "Prediction not found" };
    }

    const rawAnswers = Array.isArray(data.answers) ? data.answers : [];
    const selectedAnswers = questionIdFilter
      ? rawAnswers.filter((a) => Number(a.question_id) === questionIdFilter)
      : rawAnswers;

    let answers = selectedAnswers.map((ans) => ({
      questionId: Number(ans.question_id),
      selectedOptions: ans.selected_options,
      openTime: ans.open_time,
      closeTime: ans.close_time,
      updatedAt: ans.updated_at,
    }));

    if (includeMeta) {
      const questions = await getPickemQuestionsByLeague(leagueId);
      const questionMap = new Map(
        questions.map((q) => [Number(q.question_id), q]),
      );

      answers = answers.map((ans) => {
        const q = questionMap.get(Number(ans.questionId));
        if (!q) return ans;

        return {
          ...ans,
          question: q.question,
          type: q.type,
          options: q.options,
          score: Number(q.score ?? 0),
          maxChoose: Number(q.max_choose ?? 1),
          game_short: q.game_short,
          bracket_id: q.bracket_id,
        };
      });
    }

    const payload = {
      league_id: leagueId,
      userId,
      user: data.response.user_meta ?? {},
      totalScore: Number(data.response.total_score ?? 0),
      answers,
    };

    if (includeLogs) {
      return {
        ...payload,
        logs: [],
      };
    }

    return payload;
  },
  {
    tags: [TAG],
    summary: "Get current user Pickem answers",
  },
);

pickemRouter.get(
  "/:scope/pickem/:userid",
  async ({ params, query, set }) => {
    const leagueId = String(params.scope ?? "").trim();
    const userId = String(params.userid ?? "").trim();

    if (!leagueId || !userId) {
      set.status = 400;
      return { error: "league_id and userid are required" };
    }

    const includeLogs = parseBoolean(query?.includeLogs, true);
    const includeMeta = parseBoolean(query?.includeMeta, true);
    const questionIdFilter = toNumber(query?.questionId);

    const data = await getPickemAnswersByLeagueAndUser({ leagueId, userId });
    if (!data) {
      set.status = 404;
      return { error: "Prediction not found" };
    }

    const rawAnswers = Array.isArray(data.answers) ? data.answers : [];
    const selectedAnswers = questionIdFilter
      ? rawAnswers.filter((a) => Number(a.question_id) === questionIdFilter)
      : rawAnswers;

    let answers = selectedAnswers.map((ans) => ({
      questionId: Number(ans.question_id),
      selectedOptions: ans.selected_options,
      openTime: ans.open_time,
      closeTime: ans.close_time,
      updatedAt: ans.updated_at,
    }));

    if (includeMeta) {
      const questions = await getPickemQuestionsByLeague(leagueId);
      const questionMap = new Map(
        questions.map((q) => [Number(q.question_id), q]),
      );

      answers = answers.map((ans) => {
        const q = questionMap.get(Number(ans.questionId));
        if (!q) return ans;

        return {
          ...ans,
          question: q.question,
          type: q.type,
          options: q.options,
          score: Number(q.score ?? 0),
          maxChoose: Number(q.max_choose ?? 1),
          game_short: q.game_short,
          bracket_id: q.bracket_id,
        };
      });
    }

    const payload = {
      league_id: leagueId,
      userId,
      user: data.response.user_meta ?? {},
      totalScore: Number(data.response.total_score ?? 0),
      answers,
    };

    if (includeLogs) {
      return {
        ...payload,
        logs: [],
      };
    }

    return payload;
  },
  {
    tags: [TAG],
    summary: "Get any user Pickem answers",
  },
);

export default pickemRouter;
