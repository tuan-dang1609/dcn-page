import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";

const matchRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Matches";
const allowedRoleIds = new Set([1, 2, 3]);

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

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

  if (loserBracketRows.length === 0) {
    return null;
  }

  const loserBracketId = toNumber(loserBracketRows[0].id);
  if (!loserBracketId) {
    return null;
  }

  let targetRound = 1;
  let targetMatchNo = Math.ceil(currentMatchNo / 2);
  let preferredSlot = currentMatchNo % 2 === 1 ? "A" : "B";

  if (currentRound > 1) {
    targetRound = Math.max(1, currentRound * 2 - 2);
    targetMatchNo = currentMatchNo;
    preferredSlot = "B";
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
    [loserBracketId, targetRound, targetMatchNo],
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
             m.team_a_id,
             m.team_b_id,
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

    const status = body?.status ?? "completed";

    const { rows: updatedRows } = await pool.query(
      `
      UPDATE matches
      SET score_a = $1, score_b = $2, winner_team_id = $3, status = $4
      WHERE id = $5
      RETURNING *
      `,
      [scoreA, scoreB, winnerTeamId, status, matchId],
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

    set.status = 200;
    return {
      message: "Cập nhật điểm trận đấu thành công",
      data: {
        match: updatedMatch,
        next_match: nextMatch,
        loser_next_match: loserNextMatch,
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
