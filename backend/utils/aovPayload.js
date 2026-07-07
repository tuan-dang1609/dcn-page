const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDurationToSeconds = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return toNumber(raw);

  return Number(match[1]) * 60 + Number(match[2]);
};

const normalizePlayer = (player, slotFallback) => {
  const slot = toNumber(player?.slot) ?? slotFallback;
  return {
    slot,
    ign: String(player?.ign ?? player?.name ?? "").trim(),
    performance_score: toNumber(player?.performance_score ?? player?.score),
    kills: toNumber(player?.kills) ?? 0,
    deaths: toNumber(player?.deaths) ?? 0,
    assists: toNumber(player?.assists) ?? 0,
    gold: toNumber(player?.gold ?? player?.money),
  };
};

export const extractAovImportMeta = (raw) => ({
  match_id: toNumber(raw?.match_id),
  game_no: toNumber(raw?.game_no),
});

export const normalizeAovParsedPayload = (raw) => {
  const game = raw?.game ?? {};
  const players = raw?.players ?? {};

  const blueKills = toNumber(game.blue_kills ?? game.blue_score) ?? 0;
  const redKills = toNumber(game.red_kills ?? game.red_score) ?? 0;

  let winnerSide = String(game.winner_side ?? "").trim().toLowerCase();
  if (!["blue", "red"].includes(winnerSide)) {
    if (blueKills > redKills) winnerSide = "blue";
    else if (redKills > blueKills) winnerSide = "red";
    else winnerSide = "blue";
  }

  const durationSec =
    parseDurationToSeconds(game.duration_sec) ??
    parseDurationToSeconds(game.duration) ??
    parseDurationToSeconds(game.duration_mmss);

  const normalizeSide = (sidePlayers) => {
    const list = Array.isArray(sidePlayers) ? sidePlayers : [];
    return list
      .map((player, index) => normalizePlayer(player, index + 1))
      .filter((player) => player.ign)
      .slice(0, 5);
  };

  return {
    game: {
      blue_kills: blueKills,
      red_kills: redKills,
      duration_sec: durationSec,
      played_at: game.played_at ? String(game.played_at) : null,
      winner_side: winnerSide,
    },
    players: {
      blue: normalizeSide(players.blue),
      red: normalizeSide(players.red),
    },
  };
};
