import { randomBytes } from "node:crypto";
import { pool } from "./db.js";
import { normalizeAovParsedPayload } from "./aovPayload.js";
import {
  applyParsedStatsToMatchGame,
  ensureAovStatsTables,
  findOrCreateMatchGame,
  getInfoGameIdColumnName,
} from "./aovMatchStatsDb.js";

let ensureStagingTablePromise = null;

export const isAovStagingMatchId = (value) =>
  /^aov:[a-z0-9_-]+$/i.test(String(value ?? "").trim());

/** Chấp nhận "aov:xxx" hoặc "xxx" nếu có trong staging. */
export const resolveAovStagingMatchId = async (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (isAovStagingMatchId(raw)) {
    const staged = await getStagedAovStats(raw);
    return staged ? raw : null;
  }

  const withPrefix = raw.toLowerCase().startsWith("aov:")
    ? raw
    : `aov:${raw}`;

  if (isAovStagingMatchId(withPrefix)) {
    const staged = await getStagedAovStats(withPrefix);
    if (staged) return withPrefix;
  }

  // Fallback: match_id trong DB đúng bằng raw
  const staged = await getStagedAovStats(raw);
  return staged?.match_id ?? null;
};

const generateStagingMatchId = () =>
  `aov:${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

export const ensureAovStagingTable = async () => {
  if (ensureStagingTablePromise) return ensureStagingTablePromise;

  ensureStagingTablePromise = pool
    .query(
      `
      CREATE TABLE IF NOT EXISTS public.aov_staged_stats (
        match_id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        linked_match_game_id INTEGER REFERENCES public.match_games(id) ON DELETE SET NULL,
        created_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        linked_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_aov_staged_stats_linked
        ON public.aov_staged_stats(linked_match_game_id);
      `,
    )
    .catch((error) => {
      ensureStagingTablePromise = null;
      throw error;
    });

  return ensureStagingTablePromise;
};

export const createStagedAovStats = async ({ rawPayload, userId }) => {
  await ensureAovStagingTable();

  const parsed = normalizeAovParsedPayload(rawPayload);
  if (!parsed.players.blue.length && !parsed.players.red.length) {
    throw new Error("Payload không có dữ liệu người chơi");
  }

  const matchId = generateStagingMatchId();
  const payload = {
    match_id: matchId,
    game: parsed.game,
    players: parsed.players,
  };

  await pool.query(
    `
    INSERT INTO public.aov_staged_stats (match_id, payload, created_by)
    VALUES ($1, $2::jsonb, $3)
    `,
    [matchId, JSON.stringify(payload), userId ?? null],
  );

  return { match_id: matchId, data: payload };
};

export const getStagedAovStats = async (matchId) => {
  await ensureAovStagingTable();

  const normalizedId = String(matchId ?? "").trim();
  if (!normalizedId) return null;

  const { rows } = await pool.query(
    `
    SELECT match_id, payload, linked_match_game_id, created_at, linked_at
    FROM public.aov_staged_stats
    WHERE match_id = $1
    LIMIT 1
    `,
    [normalizedId],
  );

  return rows[0] ?? null;
};

export const applyStagedAovStatsToMatchGame = async ({
  stagingMatchId,
  matchGameId,
  tournamentMatchId,
}) => {
  const normalizedId = String(stagingMatchId ?? "").trim();
  if (!isAovStagingMatchId(normalizedId)) {
    return { ok: false, error: "Không phải match_id AOV staging" };
  }

  const staged = await getStagedAovStats(normalizedId);
  if (!staged) {
    return { ok: false, error: `Không tìm thấy dữ liệu cho ${normalizedId}` };
  }

  await ensureAovStatsTables();

  const parsed = normalizeAovParsedPayload(staged.payload);
  if (!parsed.players.blue.length && !parsed.players.red.length) {
    return { ok: false, error: "Staging không có player stats" };
  }

  const result = await applyParsedStatsToMatchGame({
    matchGameId,
    matchId: tournamentMatchId,
    parsed,
    source: "aov_staging",
    preserveInfoGameId: true,
  });

  await pool.query(
    `
    UPDATE public.aov_staged_stats
    SET linked_match_game_id = $1,
        linked_at = NOW()
    WHERE match_id = $2
    `,
    [matchGameId, normalizedId],
  );

  return { ok: true, data: result };
};

export const tryApplyStagedAovStats = async ({
  infoGameId,
  matchGameId,
  tournamentMatchId,
}) => {
  const normalizedId = String(infoGameId ?? "").trim();
  if (!normalizedId) return null;

  try {
    const stagingMatchId = await resolveAovStagingMatchId(normalizedId);
    if (!stagingMatchId) {
      // Không phải AOV staging — bỏ qua im lặng (Valorant/LoL ID, …)
      if (!/^aov:/i.test(normalizedId) && normalizedId.length < 8) {
        return null;
      }
      // Có vẻ giống staging nhưng không tìm thấy
      if (/^aov:/i.test(normalizedId) || /^[a-z0-9]{8,}$/i.test(normalizedId)) {
        return {
          ok: false,
          error: `Không tìm thấy staging cho ${normalizedId}`,
        };
      }
      return null;
    }

    return await applyStagedAovStatsToMatchGame({
      stagingMatchId,
      matchGameId,
      tournamentMatchId,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Apply AOV staging failed",
    };
  }
};

/** Nếu đã dán aov:… / staging id (info_game_id hoặc room_id) mà chưa có player rows → áp lại từ staging. */
export const ensureMatchAovStatsFromStaging = async (matchId) => {
  await ensureAovStagingTable();
  await ensureAovStatsTables();

  const { rows: matchRows } = await pool.query(
    `
    SELECT room_id
    FROM matches
    WHERE id = $1
    LIMIT 1
    `,
    [matchId],
  );
  const roomId = String(matchRows[0]?.room_id ?? "").trim();
  const roomStagingId = roomId
    ? await resolveAovStagingMatchId(roomId)
    : null;

  const { rows: gameRows } = await pool.query(
    `
    SELECT
      mg.id,
      mg.game_no,
      COALESCE(
        to_jsonb(mg)->>'info_game_id',
        to_jsonb(mg)->>'external_match_id'
      ) AS info_game_id
    FROM match_games mg
    WHERE mg.match_id = $1
    ORDER BY mg.game_no ASC, mg.id ASC
    `,
    [matchId],
  );

  // Chưa có match_games nhưng room_id là staging → tạo game 1 rồi áp
  if (!gameRows.length && roomStagingId) {
    const created = await findOrCreateMatchGame({
      matchId: Number(matchId),
      gameNo: 1,
      aovGameId: null,
    });
    const createdId = Number(created?.id);
    if (createdId) {
      const applied = await tryApplyStagedAovStats({
        infoGameId: roomStagingId,
        matchGameId: createdId,
        tournamentMatchId: Number(matchId),
      });
      if (applied?.ok) {
        const infoCol = await getInfoGameIdColumnName();
        await pool.query(
          `UPDATE match_games SET ${infoCol} = $1 WHERE id = $2`,
          [roomStagingId, createdId],
        );

        // Dọn room_id bị autofill nhầm bằng staging id
        if (roomId) {
          await pool.query(
            `
            UPDATE matches
            SET room_id = NULL
            WHERE id = $1
              AND room_id IS NOT DISTINCT FROM $2
            `,
            [matchId, roomId],
          );
        }
      }
      return [
        {
          match_game_id: createdId,
          info_game_id: roomStagingId,
          source: "room_id",
          ...(applied ?? { ok: false, error: "skip" }),
        },
      ];
    }
  }

  const results = [];
  let roomStagingConsumed = false;

  for (const row of gameRows) {
    const infoGameId = String(row.info_game_id ?? "").trim();

    const { rows: countRows } = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM match_game_player_stats
      WHERE match_game_id = $1
      `,
      [row.id],
    );

    if (Number(countRows[0]?.total ?? 0) > 0) continue;

    let stagingMatchId = infoGameId
      ? await resolveAovStagingMatchId(infoGameId)
      : null;
    let fromRoom = false;

    // Fallback: room_id thường chứa staging của ván đầu chưa gắn info
    if (!stagingMatchId && roomStagingId && !roomStagingConsumed) {
      stagingMatchId = roomStagingId;
      roomStagingConsumed = true;
      fromRoom = true;
    }

    if (!stagingMatchId) continue;

    const applied = await tryApplyStagedAovStats({
      infoGameId: stagingMatchId,
      matchGameId: Number(row.id),
      tournamentMatchId: Number(matchId),
    });

    if (applied?.ok && (fromRoom || !infoGameId || /^pending-aov-/i.test(infoGameId))) {
      const infoCol = await getInfoGameIdColumnName();
      await pool.query(
        `UPDATE match_games SET ${infoCol} = $1 WHERE id = $2`,
        [stagingMatchId, row.id],
      );

      // Dọn room_id nếu trước đó bị autofill nhầm bằng staging id
      if (fromRoom && roomId) {
        const roomLooksLikeStaging =
          /^aov:/i.test(roomId) ||
          (roomStagingId &&
            (roomId === roomStagingId ||
              `aov:${roomId}` === roomStagingId ||
              roomId === roomStagingId.replace(/^aov:/i, "")));

        if (roomLooksLikeStaging) {
          await pool.query(
            `
            UPDATE matches
            SET room_id = NULL
            WHERE id = $1
              AND room_id IS NOT DISTINCT FROM $2
            `,
            [matchId, roomId],
          );
        }
      }
    }

    results.push({
      match_game_id: Number(row.id),
      info_game_id: stagingMatchId,
      source: fromRoom ? "room_id" : "info_game_id",
      ...(applied ?? { ok: false, error: "skip" }),
    });
  }

  return results;
};
