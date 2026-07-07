import { randomBytes } from "node:crypto";
import { pool } from "./db.js";
import { normalizeAovParsedPayload } from "./aovPayload.js";
import {
  applyParsedStatsToMatchGame,
  ensureAovStatsTables,
} from "./aovMatchStatsDb.js";

let ensureStagingTablePromise = null;

export const isAovStagingMatchId = (value) =>
  /^aov:[a-z0-9_-]+$/i.test(String(value ?? "").trim());

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
  if (!isAovStagingMatchId(normalizedId)) return null;

  return applyStagedAovStatsToMatchGame({
    stagingMatchId: normalizedId,
    matchGameId,
    tournamentMatchId,
  });
};
