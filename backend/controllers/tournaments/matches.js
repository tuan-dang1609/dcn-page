import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";
import logger from "../../utils/logger.js";
import { deleteBanPickSession } from "../../utils/banPick.js";
import { recalculateTournamentResults } from "../../utils/tournamentRanking.js";

const matchRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Matches";
const allowedRoleIds = new Set([1, 2, 3]);
const providerAliases = {
  val: "valorant",
  valorant: "valorant",
  valorantv2: "valorant",
  lol: "lol",
  leagueoflegends: "lol",
  league_of_legends: "lol",
  tft: "tft",
  teamfighttactics: "tft",
  teamfight_tactics: "tft",
};

const gameProviderRouteTemplates = {
  valorant:
    "https://bigtournament-1.onrender.com/api/auth/valorant/matchdata/valorant/match/:matchId",
  lol: "https://bigtournament-1.onrender.com/api/lol/match/:matchId",
  tft: "https://bigtournament-1.onrender.com/api/tft/match/:matchId",
};

let matchGamesInfoIdColumnCache = null;
let matchGamesHasGameIdColumnCache = null;
let ensureMatchRoomIdColumnPromise = null;

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const ensureMatchRoomIdColumn = async () => {
  if (ensureMatchRoomIdColumnPromise) {
    return ensureMatchRoomIdColumnPromise;
  }

  ensureMatchRoomIdColumnPromise = pool
    .query(
      `
      ALTER TABLE matches
      ADD COLUMN IF NOT EXISTS room_id TEXT NULL
      `,
    )
    .catch((error) => {
      ensureMatchRoomIdColumnPromise = null;
      throw error;
    });

  return ensureMatchRoomIdColumnPromise;
};

matchRouter.onBeforeHandle(async () => {
  await ensureMatchRoomIdColumn();
});

const normalizePayloadArray = (body, key) => {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.[key])) return body[key];
  if (body && typeof body === "object") return [body];
  return [];
};

const ensureTournamentManagePermission = async (user, tournamentId, set) => {
  if (!user) {
    set.status = 401;
    return { ok: false, error: { error: "Unauthorized" } };
  }

  const { rows } = await pool.query(
    "SELECT id, created_by FROM tournaments WHERE id = $1",
    [tournamentId],
  );

  if (rows.length === 0) {
    set.status = 404;
    return { ok: false, error: { error: "Tournament not found" } };
  }

  const isOwner = Number(user.id) === Number(rows[0].created_by);
  const hasRolePermission = allowedRoleIds.has(Number(user.role_id));

  if (!isOwner && !hasRolePermission) {
    set.status = 403;
    return {
      ok: false,
      error: { error: "Bạn không có quyền thao tác bracket của giải này" },
    };
  }

  return { ok: true };
};

const getMatchById = async (matchId) => {
  const { rows } = await pool.query("SELECT * FROM matches WHERE id = $1", [
    matchId,
  ]);
  return rows[0] ?? null;
};

const normalizeProvider = (value) => {
  if (value === null || value === undefined) return null;

  const rawCandidates = Array.isArray(value)
    ? value
    : String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  for (const candidate of rawCandidates) {
    const key = String(candidate).trim().toLowerCase();
    const normalized = providerAliases[key] ?? null;
    if (normalized) return normalized;
  }

  return null;
};

const buildProviderRouteTemplate = (provider) =>
  gameProviderRouteTemplates[provider] ?? null;

const buildProviderRoutePreview = (provider, infoGameId) => {
  const template = buildProviderRouteTemplate(provider);
  if (!template) return null;
  if (!infoGameId) return template;
  return template.replace(":matchId", String(infoGameId));
};

const getGameIdByProvider = async (provider) => {
  if (!provider) return null;

  const providerKey = String(provider).trim().toLowerCase();
  const providerAliasesToTry = [providerKey];

  if (providerKey === "valorant") providerAliasesToTry.push("val");
  if (providerKey === "lol") providerAliasesToTry.push("leagueoflegends");
  if (providerKey === "tft") providerAliasesToTry.push("teamfighttactics");

  const aliasesCsv = Array.from(
    new Set(
      providerAliasesToTry
        .map((item) =>
          String(item ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ).join(",");

  if (!aliasesCsv) return null;

  const { rows } = await pool.query(
    `
    SELECT id, short_name
    FROM games
    WHERE LOWER(short_name) IN (
      SELECT provider
      FROM UNNEST(regexp_split_to_array($1, E'\\s*,\\s*')) AS provider
    )
       OR LOWER(name) IN (
      SELECT provider
      FROM UNNEST(regexp_split_to_array($1, E'\\s*,\\s*')) AS provider
    )
    ORDER BY id ASC
    LIMIT 1
    `,
    [aliasesCsv],
  );

  return rows[0]?.id ? Number(rows[0].id) : null;
};

const resolveRequestedGameId = async ({ body, fallbackGameId }) => {
  const explicitGameId = toNumber(body?.game_id);
  if (explicitGameId) return explicitGameId;

  const requestedProvider = normalizeProvider(
    body?.external_provider ?? body?.provider ?? body?.game_short_name,
  );

  if (requestedProvider) {
    const mappedGameId = await getGameIdByProvider(requestedProvider);
    if (mappedGameId) return mappedGameId;
  }

  return toNumber(fallbackGameId);
};

const getMatchWithGameContext = async (matchId) => {
  const { rows } = await pool.query(
    `
    SELECT m.*,
           g.id AS tournament_game_id,
           g.short_name AS game_short_name
    FROM matches m
    LEFT JOIN tournaments t ON t.id = m.tournament_id
    LEFT JOIN games g ON g.id = t.game_id
    WHERE m.id = $1
    LIMIT 1
    `,
    [matchId],
  );

  return rows[0] ?? null;
};

const getMatchGamesHasGameIdColumn = async () => {
  if (matchGamesHasGameIdColumnCache !== null) {
    return matchGamesHasGameIdColumnCache;
  }

  const { rows } = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'match_games'
      AND column_name = 'game_id'
    LIMIT 1
    `,
  );

  matchGamesHasGameIdColumnCache = rows.length > 0;
  return matchGamesHasGameIdColumnCache;
};

const getInfoGameIdColumnName = async () => {
  if (matchGamesInfoIdColumnCache) {
    return matchGamesInfoIdColumnCache;
  }

  const { rows } = await pool.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'match_games'
      AND column_name IN ('info_game_id', 'external_match_id')
    `,
  );

  const columns = new Set(rows.map((row) => String(row.column_name)));

  if (columns.has("info_game_id")) {
    matchGamesInfoIdColumnCache = "info_game_id";
    return matchGamesInfoIdColumnCache;
  }

  if (columns.has("external_match_id")) {
    matchGamesInfoIdColumnCache = "external_match_id";
    return matchGamesInfoIdColumnCache;
  }

  throw new Error(
    "match_games table must include either info_game_id or external_match_id",
  );
};

const formatGameIdRowResponse = (row, fallbackProvider) => {
  const providerFromRow = normalizeProvider(row.game_short_name);
  const provider = providerFromRow ?? fallbackProvider ?? null;
  const infoGameId = row.info_game_id ?? null;

  return {
    ...row,
    game_id: toNumber(row.game_id),
    resolved_provider: provider,
    route_template: buildProviderRouteTemplate(provider),
    route_preview: buildProviderRoutePreview(provider, infoGameId),
  };
};

const getMatchGameRowById = async ({
  gameRowId,
  infoGameIdColumn,
  hasGameIdColumn,
}) => {
  // Keep response shape stable across schema variants to avoid cached-plan type mismatches.
  void infoGameIdColumn;
  void hasGameIdColumn;

  const { rows } = await pool.query(
    `
    SELECT mg.id,
           mg.match_id,
           (to_jsonb(mg)->>'game_id')::bigint AS game_id,
           COALESCE(
             to_jsonb(mg)->>'info_game_id',
             to_jsonb(mg)->>'external_match_id'
           ) AS info_game_id,
           g.short_name AS game_short_name,
           mg.created_at
    FROM match_games mg
    LEFT JOIN games g ON g.id = (to_jsonb(mg)->>'game_id')::bigint
    WHERE mg.id = $1
    LIMIT 1
    `,
    [gameRowId],
  );

  return rows[0] ?? null;
};

const propagateLoserToLoserBracket = async ({ updatedMatch, winnerTeamId }) => {
  if (!updatedMatch || !winnerTeamId) {
    return null;
  }

  const teamAId = toNumber(updatedMatch.team_a_id);
  const teamBId = toNumber(updatedMatch.team_b_id);
  const winnerId = toNumber(winnerTeamId);

  if (!teamAId || !teamBId || !winnerId) {
    return null;
  }

  const loserTeamId =
    winnerId === teamAId ? teamBId : winnerId === teamBId ? teamAId : null;

  if (!loserTeamId) {
    return null;
  }

  const loserSeed =
    loserTeamId === teamAId ? updatedMatch.seed_a : updatedMatch.seed_b;

  const { rows: bracketRows } = await pool.query(
    `
    SELECT b.id, b.tournament_id, b.stage, b.format_id,
           f.type AS format_type, f.has_losers_bracket
    FROM brackets b
    JOIN formats f ON f.id = b.format_id
    WHERE b.id = $1
    LIMIT 1
    `,
    [updatedMatch.bracket_id],
  );

  if (bracketRows.length === 0) {
    return null;
  }

  const bracket = bracketRows[0];
  const isDoubleElimination =
    String(bracket.format_type || "") === "elimination" &&
    Boolean(bracket.has_losers_bracket);
  const isWinnerBracket = String(bracket.stage || "").toLowerCase() === "main";

  if (!isDoubleElimination || !isWinnerBracket) {
    return null;
  }

  const currentRound = toNumber(updatedMatch.round_number);
  const currentMatchNo = toNumber(updatedMatch.match_no);

  if (!currentRound || !currentMatchNo) {
    return null;
  }

  const { rows: roundOneCountRows } = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM matches
    WHERE bracket_id = $1 AND round_number = 1
    `,
    [updatedMatch.bracket_id],
  );

  const roundOneMatchCount = Number(roundOneCountRows[0]?.total ?? 0);
  const winnerRounds =
    roundOneMatchCount > 0 ? Math.max(1, Math.log2(roundOneMatchCount * 2)) : 1;

  const { rows: loserBracketRows } = await pool.query(
    `
    SELECT id
    FROM brackets
    WHERE tournament_id = $1
      AND format_id = $2
      AND LOWER(stage) = 'losers'
    ORDER BY id ASC
    LIMIT 1
    `,
    [bracket.tournament_id, bracket.format_id],
  );

  const loserBracketId = toNumber(loserBracketRows[0]?.id);

  const { rows: roundShapeRows } = await pool.query(
    `
    SELECT round_number, COUNT(*)::int AS total
    FROM matches
    WHERE bracket_id = $1
    GROUP BY round_number
    ORDER BY round_number ASC
    `,
    [updatedMatch.bracket_id],
  );

  const roundShape = roundShapeRows
    .map((row) => `${Number(row.round_number)}:${Number(row.total)}`)
    .join(",");

  const isCompactSixSingleBracket =
    !loserBracketId && roundShape === "1:2,2:2,3:1,4:2,5:1,6:1,7:1";

  let targetBracketId = loserBracketId;
  let targetRound = 1;
  let targetMatchNo = Math.ceil(currentMatchNo / 2);
  let preferredSlot = currentMatchNo % 2 === 1 ? "A" : "B";

  if (isCompactSixSingleBracket) {
    targetBracketId = toNumber(updatedMatch.bracket_id);

    const compactSixLoserMap = {
      "1-1": { round: 4, matchNo: 2, slot: "A" },
      "1-2": { round: 4, matchNo: 1, slot: "A" },
      "2-1": { round: 4, matchNo: 1, slot: "B" },
      "2-2": { round: 4, matchNo: 2, slot: "B" },
      "3-1": { round: 6, matchNo: 1, slot: "A" },
    };

    const key = `${currentRound}-${currentMatchNo}`;
    const target = compactSixLoserMap[key];

    if (!target) {
      return null;
    }

    targetRound = target.round;
    targetMatchNo = target.matchNo;
    preferredSlot = target.slot;
  } else if (loserBracketId) {
    if (currentRound > 1) {
      targetRound = Math.max(1, currentRound * 2 - 2);
      targetMatchNo = currentMatchNo;
      preferredSlot = "B";
    }
  } else {
    // Single-bracket double elimination mode
    if (currentRound > winnerRounds) {
      return null;
    }

    targetBracketId = toNumber(updatedMatch.bracket_id);
    const loserMainRounds = Math.max(1, 2 * (winnerRounds - 1));

    let targetLoserRoundIndex = 1;

    if (currentRound === 1) {
      targetLoserRoundIndex = 1;
      targetMatchNo = Math.ceil(currentMatchNo / 2);
      preferredSlot = currentMatchNo % 2 === 1 ? "A" : "B";
    } else if (currentRound < winnerRounds) {
      targetLoserRoundIndex = Math.max(2, currentRound * 2 - 2);
      targetMatchNo = currentMatchNo;
      preferredSlot = "B";
    } else {
      targetLoserRoundIndex = loserMainRounds;
      targetMatchNo = 1;
      preferredSlot = "B";
    }

    targetRound = winnerRounds + targetLoserRoundIndex;
  }

  if (!targetBracketId) {
    return null;
  }

  const { rows: targetRows } = await pool.query(
    `
    SELECT *
    FROM matches
    WHERE bracket_id = $1
      AND round_number = $2
      AND match_no = $3
    ORDER BY id ASC
    LIMIT 1
    `,
    [targetBracketId, targetRound, targetMatchNo],
  );

  if (targetRows.length === 0) {
    return null;
  }

  const target = targetRows[0];

  let slot = preferredSlot;
  if (
    (slot === "A" && toNumber(target.team_a_id)) ||
    (slot === "B" && toNumber(target.team_b_id))
  ) {
    if (!toNumber(target.team_a_id)) slot = "A";
    else if (!toNumber(target.team_b_id)) slot = "B";
    else return null;
  }

  const teamField = slot === "A" ? "team_a_id" : "team_b_id";
  const seedField = slot === "A" ? "seed_a" : "seed_b";

  const { rows } = await pool.query(
    `
    UPDATE matches
    SET ${teamField} = $1,
        ${seedField} = $2
    WHERE id = $3
    RETURNING *
    `,
    [loserTeamId, loserSeed ?? null, target.id],
  );

  return rows[0] ?? null;
};

matchRouter.get(
  "/brackets/:bracket_id/matches",
  async ({ params, set }) => {
    const bracketId = toNumber(params.bracket_id);

    if (!bracketId) {
      set.status = 400;
      return { error: "bracket_id không hợp lệ" };
    }

    const { rows } = await pool.query(
      `
      SELECT m.id,
             m.bracket_id,
             m.round_number,
             m.match_no,
              m.room_id,
              m.date_scheduled,
              (to_jsonb(m)->>'room_id') AS room_id,
              t.slug AS tournament_slug,
              g.short_name AS tournament_game_short_name,
              m.ban_pick_id,
              bp.turn_time_limit_seconds AS ban_pick_countdown_seconds,
             m.team_a_id,
             m.team_b_id,
              m.next_match_id,
              m.next_slot,
             m.seed_a,
             m.seed_b,
             m.score_a,
             m.score_b,
             m.winner_team_id,
             m.status,
             json_build_object(
               'id', t1.id,
               'name', t1.name,
               'short_name', t1.short_name,
               'logo_url', t1.logo_url,
               'team_color_hex', t1.team_color_hex
             ) AS team_a,
             json_build_object(
               'id', t2.id,
               'name', t2.name,
               'short_name', t2.short_name,
               'logo_url', t2.logo_url,
               'team_color_hex', t2.team_color_hex
             ) AS team_b
      FROM matches m
      LEFT JOIN brackets b ON b.id = m.bracket_id
      LEFT JOIN tournaments t ON t.id = b.tournament_id
      LEFT JOIN games g ON g.id = t.game_id
      LEFT JOIN ban_picks bp ON bp.match_id = m.id
      LEFT JOIN teams t1 ON t1.id = m.team_a_id
      LEFT JOIN teams t2 ON t2.id = m.team_b_id
      WHERE m.bracket_id = $1
      ORDER BY m.round_number ASC, m.match_no ASC, m.id ASC
      `,
      [bracketId],
    );

    set.status = 200;
    return { data: rows };
  },
  {
    tags: [TAG],
    summary: "List matches by bracket",
  },
);

matchRouter.get(
  "/matches/:match_id/games",
  async ({ params, set }) => {
    const matchId = toNumber(params.match_id);

    if (!matchId) {
      set.status = 400;
      return { error: "match_id không hợp lệ" };
    }

    const { rows: games } = await pool.query(
      `
      SELECT *
      FROM match_games
      WHERE match_id = $1
      ORDER BY game_no ASC, id ASC
      `,
      [matchId],
    );

    set.status = 200;
    return { data: games };
  },
  {
    tags: [TAG],
    summary: "List games of a match",
  },
);

matchRouter.get(
  "/matches/:match_id/game-ids",
  async ({ params, set }) => {
    const matchId = toNumber(params.match_id);

    if (!matchId) {
      set.status = 400;
      return { error: "match_id không hợp lệ" };
    }

    const match = await getMatchWithGameContext(matchId);
    if (!match) {
      set.status = 404;
      return { error: "Match not found" };
    }

    const fallbackProvider = normalizeProvider(match.game_short_name);

    const { rows } = await pool.query(
      `
      SELECT mg.id,
             mg.match_id,
             (to_jsonb(mg)->>'game_id')::bigint AS game_id,
             COALESCE(
               to_jsonb(mg)->>'info_game_id',
               to_jsonb(mg)->>'external_match_id'
             ) AS info_game_id,
             g.short_name AS game_short_name,
             mg.created_at
      FROM match_games mg
      LEFT JOIN games g ON g.id = (to_jsonb(mg)->>'game_id')::bigint
      WHERE mg.match_id = $1
      ORDER BY (to_jsonb(mg)->>'game_id')::bigint ASC NULLS LAST, mg.id ASC
      `,
      [matchId],
    );

    const data = rows.map((row) =>
      formatGameIdRowResponse(row, fallbackProvider),
    );

    set.status = 200;
    return { data };
  },
  {
    tags: [TAG],
    summary: "List info_game_id entries by match",
  },
);

matchRouter.post(
  "/matches/:match_id/game-ids",
  async ({ params, body, set, user }) => {
    const matchId = toNumber(params.match_id);

    if (!matchId) {
      set.status = 400;
      return { error: "match_id không hợp lệ" };
    }

    const match = await getMatchWithGameContext(matchId);
    if (!match) {
      set.status = 404;
      return { error: "Match not found" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      Number(match.tournament_id),
      set,
    );
    if (!permission.ok) return permission.error;

    const infoGameIdRaw =
      body?.match_id_info ?? body?.info_game_id ?? body?.external_match_id;
    const infoGameId =
      infoGameIdRaw === null || infoGameIdRaw === undefined
        ? null
        : String(infoGameIdRaw).trim();
    const roomIdRaw = body?.room_id ?? body?.roomId ?? body?.lobby_id;
    const roomIdFromPayload =
      roomIdRaw === null || roomIdRaw === undefined
        ? null
        : String(roomIdRaw).trim();

    if (!infoGameId) {
      set.status = 400;
      return { error: "match_id_info (info_game_id) không được để trống" };
    }

    const fallbackProvider = normalizeProvider(match.game_short_name);

    const infoGameIdColumn = await getInfoGameIdColumnName();
    const hasGameIdColumn = await getMatchGamesHasGameIdColumn();
    const gameNoCandidate = toNumber(body?.game_no);
    const resolvedGameId = await resolveRequestedGameId({
      body,
      fallbackGameId: match.tournament_game_id,
    });

    if (hasGameIdColumn && !resolvedGameId) {
      set.status = 400;
      return { error: "Không xác định được game_id cho match_game" };
    }

    let gameNo = gameNoCandidate;
    if (!gameNo) {
      const { rows: maxRows } = await pool.query(
        "SELECT COALESCE(MAX(game_no), 0) AS max_game_no FROM match_games WHERE match_id = $1",
        [matchId],
      );
      gameNo = Number(maxRows[0]?.max_game_no ?? 0) + 1;
    }

    const insertSql = hasGameIdColumn
      ? `
      INSERT INTO match_games (
        match_id,
        game_no,
        ${infoGameIdColumn},
        game_id
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `
      : `
      INSERT INTO match_games (
        match_id,
        game_no,
        ${infoGameIdColumn}
      )
      VALUES ($1, $2, $3)
      RETURNING id
      `;

    const insertParams = hasGameIdColumn
      ? [matchId, gameNo, infoGameId, resolvedGameId]
      : [matchId, gameNo, infoGameId];

    const { rows } = await pool.query(insertSql, insertParams);
    const createdId = rows[0]?.id;
    const item = await getMatchGameRowById({
      gameRowId: createdId,
      infoGameIdColumn,
      hasGameIdColumn,
    });

    if (!item) {
      set.status = 500;
      return { error: "Không thể đọc dữ liệu game vừa tạo" };
    }

    const existingRoomId = String(match.room_id ?? "").trim();
    const shouldAutofillRoomId = !existingRoomId && gameNo === 1;
    const roomIdToPersist =
      roomIdFromPayload || (shouldAutofillRoomId ? infoGameId : null);

    let effectiveRoomId = existingRoomId || null;

    if (roomIdToPersist) {
      const normalizedRoomId = String(roomIdToPersist).trim();

      if (normalizedRoomId) {
        await pool.query(
          `
          UPDATE matches
          SET room_id = $1
          WHERE id = $2
          `,
          [normalizedRoomId, matchId],
        );

        effectiveRoomId = normalizedRoomId;
      }
    }

    set.status = 201;
    return {
      message: "Thêm info_game_id thành công",
      data: {
        ...formatGameIdRowResponse(item, fallbackProvider),
        room_id: effectiveRoomId,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Create info_game_id entry for a match",
    security: [{ bearerAuth: [] }],
  },
);

matchRouter.patch(
  "/matches/:match_id/game-ids/:game_id",
  async ({ params, body, set, user }) => {
    const matchId = toNumber(params.match_id);
    const gameRowId = toNumber(params.game_id);

    if (!matchId || !gameRowId) {
      set.status = 400;
      return { error: "match_id hoặc game_id không hợp lệ" };
    }

    const match = await getMatchWithGameContext(matchId);
    if (!match) {
      set.status = 404;
      return { error: "Match not found" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      Number(match.tournament_id),
      set,
    );
    if (!permission.ok) return permission.error;

    const infoGameIdColumn = await getInfoGameIdColumnName();
    const hasGameIdColumn = await getMatchGamesHasGameIdColumn();

    const { rows: existedRows } = await pool.query(
      "SELECT id, match_id FROM match_games WHERE id = $1 LIMIT 1",
      [gameRowId],
    );
    const existed = existedRows[0] ?? null;

    if (!existed || Number(existed.match_id) !== matchId) {
      set.status = 404;
      return { error: "Không tìm thấy game id trong match này" };
    }

    const updates = [];
    const values = [];
    const shouldUpdateRoomId =
      body?.room_id !== undefined ||
      body?.roomId !== undefined ||
      body?.lobby_id !== undefined;

    if (shouldUpdateRoomId) {
      const nextRoomIdRaw = body?.room_id ?? body?.roomId ?? body?.lobby_id;
      const nextRoomId =
        nextRoomIdRaw === null || nextRoomIdRaw === undefined
          ? null
          : String(nextRoomIdRaw).trim() || null;

      await pool.query(
        `
        UPDATE matches
        SET room_id = $1
        WHERE id = $2
        `,
        [nextRoomId, matchId],
      );
    }

    if (
      body?.match_id_info !== undefined ||
      body?.info_game_id !== undefined ||
      body?.external_match_id !== undefined
    ) {
      const nextInfoGameIdRaw =
        body?.match_id_info ?? body?.info_game_id ?? body?.external_match_id;
      const nextInfoGameId =
        nextInfoGameIdRaw === null || nextInfoGameIdRaw === undefined
          ? null
          : String(nextInfoGameIdRaw).trim();

      values.push(nextInfoGameId || null);
      updates.push(`${infoGameIdColumn} = $${values.length}`);
    }

    if (body?.game_no !== undefined) {
      const nextGameNo = toNumber(body?.game_no);
      if (!nextGameNo) {
        set.status = 400;
        return { error: "game_no không hợp lệ" };
      }
      values.push(nextGameNo);
      updates.push(`game_no = $${values.length}`);
    }

    if (
      hasGameIdColumn &&
      (body?.game_id !== undefined ||
        body?.external_provider !== undefined ||
        body?.provider !== undefined ||
        body?.game_short_name !== undefined)
    ) {
      const nextGameId = await resolveRequestedGameId({
        body,
        fallbackGameId: match.tournament_game_id,
      });

      if (!nextGameId) {
        set.status = 400;
        return { error: "game_id không hợp lệ" };
      }

      values.push(nextGameId);
      updates.push(`game_id = $${values.length}`);
    }

    if (!updates.length && !shouldUpdateRoomId) {
      set.status = 400;
      return { error: "Không có dữ liệu để cập nhật" };
    }

    let updatedId = gameRowId;

    if (updates.length) {
      values.push(gameRowId);

      const { rows } = await pool.query(
        `
        UPDATE match_games
        SET ${updates.join(", ")}
        WHERE id = $${values.length}
        RETURNING id
        `,
        values,
      );

      updatedId = rows[0]?.id;
    }

    const item = await getMatchGameRowById({
      gameRowId: updatedId,
      infoGameIdColumn,
      hasGameIdColumn,
    });

    if (!item) {
      set.status = 500;
      return { error: "Không thể đọc dữ liệu game vừa cập nhật" };
    }
    const fallbackProvider = normalizeProvider(match.game_short_name);

    const { rows: roomRows } = await pool.query(
      "SELECT room_id FROM matches WHERE id = $1 LIMIT 1",
      [matchId],
    );
    const currentRoomId = roomRows[0]?.room_id ?? null;

    set.status = 200;
    return {
      message: "Cập nhật info_game_id thành công",
      data: {
        ...formatGameIdRowResponse(item, fallbackProvider),
        room_id: currentRoomId,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Update info_game_id entry",
    security: [{ bearerAuth: [] }],
  },
);

matchRouter.delete(
  "/matches/:match_id/game-ids/:game_id",
  async ({ params, set, user }) => {
    const matchId = toNumber(params.match_id);
    const gameRowId = toNumber(params.game_id);

    if (!matchId || !gameRowId) {
      set.status = 400;
      return { error: "match_id hoặc game_id không hợp lệ" };
    }

    const match = await getMatchWithGameContext(matchId);
    if (!match) {
      set.status = 404;
      return { error: "Match not found" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      Number(match.tournament_id),
      set,
    );
    if (!permission.ok) return permission.error;

    const { rows: existedRows } = await pool.query(
      "SELECT id, match_id FROM match_games WHERE id = $1 LIMIT 1",
      [gameRowId],
    );
    const existed = existedRows[0] ?? null;

    if (!existed || Number(existed.match_id) !== matchId) {
      set.status = 404;
      return { error: "Không tìm thấy game id trong match này" };
    }

    await pool.query("DELETE FROM match_games WHERE id = $1", [gameRowId]);

    set.status = 200;
    return {
      message: "Xóa info_game_id thành công",
      data: { id: gameRowId },
    };
  },
  {
    tags: [TAG],
    summary: "Delete info_game_id entry",
    security: [{ bearerAuth: [] }],
  },
);

matchRouter.patch(
  "/matches/:match_id/room-id",
  async ({ params, body, set, user }) => {
    const matchId = toNumber(params.match_id);

    if (!matchId) {
      set.status = 400;
      return { error: "match_id không hợp lệ" };
    }

    const match = await getMatchById(matchId);
    if (!match) {
      set.status = 404;
      return { error: "Match not found" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      Number(match.tournament_id),
      set,
    );
    if (!permission.ok) return permission.error;

    const hasRoomIdValue =
      body?.room_id !== undefined ||
      body?.roomId !== undefined ||
      body?.lobby_id !== undefined;

    if (!hasRoomIdValue) {
      set.status = 400;
      return { error: "room_id là bắt buộc" };
    }

    const nextRoomIdRaw = body?.room_id ?? body?.roomId ?? body?.lobby_id;
    const nextRoomId =
      nextRoomIdRaw === null || nextRoomIdRaw === undefined
        ? null
        : String(nextRoomIdRaw).trim() || null;

    const { rows } = await pool.query(
      `
      UPDATE matches
      SET room_id = $1
      WHERE id = $2
      RETURNING *
      `,
      [nextRoomId, matchId],
    );

    set.status = 200;
    return {
      message: "Cập nhật room_id thành công",
      data: {
        match: rows[0] ?? null,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Update match room_id",
    security: [{ bearerAuth: [] }],
  },
);

matchRouter.patch(
  "/matches/:match_id/schedule",
  async ({ params, body, set, user }) => {
    const matchId = toNumber(params.match_id);

    if (!matchId) {
      set.status = 400;
      return { error: "match_id không hợp lệ" };
    }

    const match = await getMatchById(matchId);
    if (!match) {
      set.status = 404;
      return { error: "Match not found" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      Number(match.tournament_id),
      set,
    );
    if (!permission.ok) return permission.error;

    const dateRaw = body?.date_scheduled;

    if (dateRaw === undefined) {
      set.status = 400;
      return { error: "date_scheduled là bắt buộc" };
    }

    let nextDateScheduled = null;

    if (dateRaw !== null && String(dateRaw).trim() !== "") {
      const parsed = new Date(String(dateRaw));
      if (Number.isNaN(parsed.getTime())) {
        set.status = 400;
        return { error: "date_scheduled không hợp lệ" };
      }

      nextDateScheduled = parsed.toISOString();
    }

    const { rows } = await pool.query(
      `
      UPDATE matches
      SET date_scheduled = $1
      WHERE id = $2
      RETURNING *
      `,
      [nextDateScheduled, matchId],
    );

    set.status = 200;
    return {
      message: "Cập nhật lịch trận đấu thành công",
      data: {
        match: rows[0] ?? null,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Update match schedule datetime",
    security: [{ bearerAuth: [] }],
  },
);

matchRouter.patch(
  "/matches/:match_id/room-id",
  async ({ params, body, set, user }) => {
    await ensureMatchRoomIdColumn();

    const matchId = toNumber(params.match_id);

    if (!matchId) {
      set.status = 400;
      return { error: "match_id không hợp lệ" };
    }

    const match = await getMatchById(matchId);
    if (!match) {
      set.status = 404;
      return { error: "Match not found" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      Number(match.tournament_id),
      set,
    );
    if (!permission.ok) return permission.error;

    if (body?.room_id === undefined) {
      set.status = 400;
      return { error: "room_id là bắt buộc" };
    }

    const normalizedRoomIdRaw =
      body?.room_id === null ? "" : String(body.room_id).trim();
    const nextRoomId = normalizedRoomIdRaw || null;

    if (nextRoomId && nextRoomId.length > 255) {
      set.status = 400;
      return { error: "room_id không được vượt quá 255 ký tự" };
    }

    const { rows } = await pool.query(
      `
      UPDATE matches
      SET room_id = $1
      WHERE id = $2
      RETURNING *
      `,
      [nextRoomId, matchId],
    );

    set.status = 200;
    return {
      message: "Cập nhật room_id thành công",
      data: {
        match: rows[0] ?? null,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Update match room_id",
    security: [{ bearerAuth: [] }],
  },
);

matchRouter.delete(
  "/matches/:match_id/ban-pick",
  async ({ params, set, user }) => {
    const matchId = toNumber(params.match_id);

    if (!matchId) {
      set.status = 400;
      return { error: "match_id không hợp lệ" };
    }

    const match = await getMatchById(matchId);
    if (!match) {
      set.status = 404;
      return { error: "Match not found" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      Number(match.tournament_id),
      set,
    );
    if (!permission.ok) return permission.error;

    const result = await deleteBanPickSession({
      matchId,
    });

    if (!result.deleted) {
      set.status = 200;
      return {
        message: "Không có phiên ban/pick để xóa",
        data: null,
      };
    }

    set.status = 200;
    return {
      message: "Đã xóa phiên ban/pick",
      data: result.session,
    };
  },
  {
    tags: [TAG],
    summary: "Delete ban/pick by match_id",
    security: [{ bearerAuth: [] }],
  },
);

matchRouter.patch(
  "/matches/:match_id/score",
  async ({ params, body, set, user }) => {
    const matchId = toNumber(params.match_id);
    const scoreA = toNumber(body?.score_a);
    const scoreB = toNumber(body?.score_b);

    if (!matchId) {
      set.status = 400;
      return { error: "match_id không hợp lệ" };
    }

    if (scoreA === null || scoreB === null) {
      set.status = 400;
      return { error: "score_a và score_b phải là số" };
    }

    const match = await getMatchById(matchId);

    if (!match) {
      set.status = 404;
      return { error: "Match not found" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      Number(match.tournament_id),
      set,
    );

    if (!permission.ok) return permission.error;

    let winnerTeamId = toNumber(body?.winner_team_id);
    if (winnerTeamId === null) {
      if (scoreA > scoreB) winnerTeamId = toNumber(match.team_a_id);
      else if (scoreB > scoreA) winnerTeamId = toNumber(match.team_b_id);
      else winnerTeamId = null;
    }

    const hasRoomIdValue =
      body?.room_id !== undefined ||
      body?.roomId !== undefined ||
      body?.lobby_id !== undefined;
    const nextRoomIdRaw = body?.room_id ?? body?.roomId ?? body?.lobby_id;
    const nextRoomId = hasRoomIdValue
      ? nextRoomIdRaw === null || nextRoomIdRaw === undefined
        ? null
        : String(nextRoomIdRaw).trim() || null
      : String(match.room_id ?? "").trim() || null;

    const status = body?.status ?? "completed";

    const { rows: updatedRows } = await pool.query(
      `
      UPDATE matches
      SET score_a = $1,
          score_b = $2,
          winner_team_id = $3,
          status = $4,
          room_id = $5
      WHERE id = $6
      RETURNING *
      `,
      [scoreA, scoreB, winnerTeamId, status, nextRoomId, matchId],
    );

    const updatedMatch = updatedRows[0] ?? null;

    let nextMatch = null;
    let loserNextMatch = null;
    const shouldPropagateWinner = body?.propagate_winner !== false;
    const shouldPropagateLoser = body?.propagate_loser !== false;

    if (
      shouldPropagateWinner &&
      updatedMatch?.next_match_id &&
      winnerTeamId &&
      ["A", "B"].includes(String(updatedMatch.next_slot || "").toUpperCase())
    ) {
      const isSlotA = String(updatedMatch.next_slot).toUpperCase() === "A";
      const teamField = isSlotA ? "team_a_id" : "team_b_id";
      const seedField = isSlotA ? "seed_a" : "seed_b";
      const winnerSeed =
        winnerTeamId === toNumber(updatedMatch.team_a_id)
          ? updatedMatch.seed_a
          : updatedMatch.seed_b;

      const { rows: nextRows } = await pool.query(
        `
        UPDATE matches
        SET ${teamField} = $1, ${seedField} = $2
        WHERE id = $3
        RETURNING *
        `,
        [winnerTeamId, winnerSeed ?? null, updatedMatch.next_match_id],
      );

      nextMatch = nextRows[0] ?? null;
    }

    if (shouldPropagateLoser) {
      loserNextMatch = await propagateLoserToLoserBracket({
        updatedMatch,
        winnerTeamId,
      });
    }

    let rankingSync = { ok: true };
    try {
      await recalculateTournamentResults(Number(match.tournament_id));
    } catch (error) {
      logger.error("[ranking-sync] Failed to recalculate tournament results", {
        tournament_id: Number(match.tournament_id),
        match_id: matchId,
        error: error instanceof Error ? error.message : String(error),
      });
      rankingSync = {
        ok: false,
        error:
          "Score da cap nhat, nhung khong dong bo duoc bang xep hang tu dong",
      };
    }

    set.status = 200;
    return {
      message: "Cập nhật điểm trận đấu thành công",
      data: {
        match: updatedMatch,
        next_match: nextMatch,
        loser_next_match: loserNextMatch,
        ranking_sync: rankingSync,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Update match score (bracket mode)",
    security: [{ bearerAuth: [] }],
    detail: {
      parameters: [
        {
          name: "match_id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 6 },
          description: "ID trận đấu",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["score_a", "score_b"],
              properties: {
                score_a: { type: "integer", example: 2 },
                score_b: { type: "integer", example: 0 },
                winner_team_id: {
                  type: "integer",
                  nullable: true,
                  example: 11,
                },
                status: { type: "string", example: "completed" },
                room_id: {
                  type: "string",
                  nullable: true,
                  example: "FACEIT-ROOM-123456",
                },
                propagate_winner: { type: "boolean", example: true },
                propagate_loser: { type: "boolean", example: true },
              },
            },
            examples: {
              autoWinner: {
                value: {
                  score_a: 2,
                  score_b: 0,
                },
              },
              manualWinner: {
                value: {
                  score_a: 1,
                  score_b: 1,
                  winner_team_id: 11,
                  status: "completed",
                  propagate_winner: true,
                  propagate_loser: true,
                },
              },
            },
          },
        },
      },
    },
  },
);

matchRouter.post(
  "/matches/:match_id/games",
  async ({ params, body, set, user }) => {
    const matchId = toNumber(params.match_id);

    if (!matchId) {
      set.status = 400;
      return { error: "match_id không hợp lệ" };
    }

    const payload = normalizePayloadArray(body, "games");

    if (!payload.length) {
      set.status = 400;
      return { error: "Body không được rỗng" };
    }

    const match = await getMatchById(matchId);
    if (!match) {
      set.status = 404;
      return { error: "Match not found" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      Number(match.tournament_id),
      set,
    );

    if (!permission.ok) return permission.error;

    const { rows: maxRows } = await pool.query(
      "SELECT COALESCE(MAX(game_no), 0) AS max_game_no FROM match_games WHERE match_id = $1",
      [matchId],
    );

    let nextGameNo = Number(maxRows[0]?.max_game_no ?? 0);
    const insertedGames = [];

    for (const item of payload) {
      const scoreA = toNumber(item?.team_a_score);
      const scoreB = toNumber(item?.team_b_score);

      if (scoreA === null || scoreB === null) {
        set.status = 400;
        return { error: "Mỗi game phải có team_a_score và team_b_score" };
      }

      const gameNo = toNumber(item?.game_no) ?? nextGameNo + 1;
      nextGameNo = Math.max(nextGameNo, gameNo);

      let winnerTeamId = toNumber(item?.winner_team_id);
      if (winnerTeamId === null) {
        if (scoreA > scoreB) winnerTeamId = toNumber(match.team_a_id);
        else if (scoreB > scoreA) winnerTeamId = toNumber(match.team_b_id);
        else winnerTeamId = null;
      }

      const { rows } = await pool.query(
        `
        INSERT INTO match_games (
          match_id,
          game_no,
          team_a_score,
          team_b_score,
          winner_team_id,
          played_at,
          external_provider,
          external_match_id,
          payload
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *
        `,
        [
          matchId,
          gameNo,
          scoreA,
          scoreB,
          winnerTeamId,
          item?.played_at ?? null,
          item?.external_provider ?? null,
          item?.external_match_id ?? null,
          item?.payload ?? {},
        ],
      );

      insertedGames.push(rows[0]);
    }

    const { rows: totalRows } = await pool.query(
      `
      SELECT COALESCE(SUM(team_a_score), 0) AS total_a,
             COALESCE(SUM(team_b_score), 0) AS total_b
      FROM match_games
      WHERE match_id = $1
      `,
      [matchId],
    );

    const totalA = Number(totalRows[0]?.total_a ?? 0);
    const totalB = Number(totalRows[0]?.total_b ?? 0);

    let winnerTeamId = null;
    if (totalA > totalB) winnerTeamId = toNumber(match.team_a_id);
    if (totalB > totalA) winnerTeamId = toNumber(match.team_b_id);

    const { rows: matchRows } = await pool.query(
      `
      UPDATE matches
      SET score_a = $1,
          score_b = $2,
          winner_team_id = $3,
          status = $4
      WHERE id = $5
      RETURNING *
      `,
      [totalA, totalB, winnerTeamId, "completed", matchId],
    );

    set.status = 201;
    return {
      message: "Thêm game cho match thành công",
      data: {
        games: insertedGames,
        match: matchRows[0] ?? null,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Create games for a bracket match (no match_id in body)",
    security: [{ bearerAuth: [] }],
  },
);

export default matchRouter;
