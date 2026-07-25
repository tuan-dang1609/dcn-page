/** Normalize + fuzzy-match AOV/Liên Quân IGN → registered players. */

export type AovMatchablePlayer = {
  user_id?: number | string | null;
  id?: number | string | null;
  username?: string | null;
  nickname?: string | null;
  riot_account?: string | null;
  profile_picture?: string | null;
};

export type AovIgnMatchHit = {
  player: AovMatchablePlayer;
  score: number;
  alias: string;
};

type AovIgnRow = {
  ign?: string | null;
  matched_from_ign?: string | null;
};

const toStr = (value: unknown) => String(value ?? "").trim();

export const normalizeAovIgn = (value: unknown) =>
  toStr(value)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/['"‘’“”`]/g, "")
    .toLowerCase()
    .replace(/[.\-_·•]+$/g, "")
    .replace(/\s+/g, "");

export const stripClanTag = (normalized: string) => {
  const raw = String(normalized ?? "").replace(/[.\-_·•]+$/g, "");
  if (!raw) return "";
  const noBracket = raw.replace(/^\[[^\]]*\]/, "");
  const parts = noBracket.split(/[.\-_·•]+/).filter(Boolean);
  if (parts.length >= 2 && parts[0].length <= 8) {
    return parts.slice(1).join("");
  }
  return noBracket;
};

const levenshtein = (a: string, b: string) => {
  const s = String(a ?? "");
  const t = String(b ?? "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const prev = new Array(t.length + 1);
  const curr = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j += 1) prev[j] = j;

  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j += 1) prev[j] = curr[j];
  }
  return prev[t.length];
};

export const ignSimilarity = (a: string, b: string) => {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (!left || !right) return 0;
  if (left === right) return 1;
  const maxLen = Math.max(left.length, right.length);
  if (!maxLen) return 0;
  return 1 - levenshtein(left, right) / maxLen;
};

const playerAliases = (player: AovMatchablePlayer) => {
  const list = [
    player?.nickname,
    player?.username,
    String(player?.riot_account ?? "").split("#")[0],
  ];
  return [...new Set(list.map(toStr).filter(Boolean))];
};

export const matchAovIgnToPlayer = (
  ign: unknown,
  players: AovMatchablePlayer[] | undefined,
  options?: { minScore?: number },
): AovIgnMatchHit | null => {
  const minScore = options?.minScore ?? 0.72;
  const raw = normalizeAovIgn(ign);
  const rawCore = stripClanTag(raw);
  if (!raw || !players?.length) return null;

  let best: AovIgnMatchHit | null = null;

  for (const player of players) {
    for (const alias of playerAliases(player)) {
      const n = normalizeAovIgn(alias);
      const nCore = stripClanTag(n);
      if (!n) continue;

      let score = 0;
      if (n === raw || nCore === raw || n === rawCore || nCore === rawCore) {
        score = 1;
      } else if (
        (n.length >= 3 && raw.includes(n)) ||
        (raw.length >= 3 && n.includes(raw)) ||
        (nCore.length >= 3 && rawCore.includes(nCore)) ||
        (rawCore.length >= 3 && nCore.includes(rawCore))
      ) {
        score = Math.max(
          0.86,
          ignSimilarity(n, raw),
          ignSimilarity(nCore, rawCore),
        );
      } else {
        score = Math.max(ignSimilarity(n, raw), ignSimilarity(nCore, rawCore));
      }

      if (!best || score > best.score) {
        best = { player, score, alias };
      }
    }
  }

  if (best && best.score >= minScore) return best;
  return null;
};

export function mapAovPlayersToRoster<T extends AovIgnRow>(
  aovPlayers: T[],
  rosterPlayers: AovMatchablePlayer[] | undefined,
): Array<
  T & {
    matched_from_ign?: string | null;
    matched_user_id?: number | string | null;
    match_score?: number;
  }
> {
  const source = Array.isArray(aovPlayers) ? aovPlayers : [];
  const roster = Array.isArray(rosterPlayers) ? rosterPlayers : [];
  if (!source.length) return source;

  const scored: Array<AovIgnMatchHit & { index: number; ign: string }> = [];
  source.forEach((row, index) => {
    const ign = toStr(row?.matched_from_ign || row?.ign);
    const hit = matchAovIgnToPlayer(ign, roster);
    if (hit) scored.push({ index, ign, ...hit });
  });

  scored.sort((a, b) => b.score - a.score);

  const usedUsers = new Set<string | number>();
  const usedIndices = new Set<number>();
  const mapped = source.map((row) => ({ ...row }));

  for (const hit of scored) {
    const uid =
      hit.player?.user_id ??
      hit.player?.id ??
      hit.player?.username ??
      hit.alias;
    if (uid == null || usedUsers.has(uid) || usedIndices.has(hit.index)) {
      continue;
    }

    usedUsers.add(uid);
    usedIndices.add(hit.index);

    const display =
      toStr(hit.player?.nickname) ||
      toStr(hit.player?.username) ||
      mapped[hit.index].ign;

    mapped[hit.index] = {
      ...mapped[hit.index],
      ign: display,
      matched_from_ign: hit.ign || source[hit.index]?.ign || null,
      matched_user_id: hit.player?.user_id ?? hit.player?.id ?? null,
      match_score: Number(hit.score.toFixed(3)),
    };
  }

  return mapped;
}

const scoreSideAgainstRoster = (
  players: AovIgnRow[],
  roster: AovMatchablePlayer[],
  minScore: number,
) => {
  const used = new Set<string>();
  let total = 0;

  const scored: Array<{ hit: AovIgnMatchHit; score: number }> = [];
  for (const row of players) {
    const ign = toStr(row?.matched_from_ign || row?.ign);
    const hit = matchAovIgnToPlayer(ign, roster, { minScore });
    if (hit) scored.push({ hit, score: hit.score });
  }

  scored.sort((a, b) => b.score - a.score);

  for (const item of scored) {
    const uid = String(
      item.hit.player?.user_id ??
        item.hit.player?.id ??
        item.hit.player?.username ??
        item.hit.alias,
    );
    if (used.has(uid)) continue;
    used.add(uid);
    total += item.score;
  }

  return { total };
};

/**
 * Gán người chơi 2 phía vào đúng team A/B.
 * Giữ nguyên cả phía (5v5) — chỉ đảo cả side nếu đổi màu trong game.
 */
export function assignAovPlayersAcrossTeams<T extends AovIgnRow>(params: {
  bluePlayers: T[];
  redPlayers: T[];
  teamAPlayers: AovMatchablePlayer[] | undefined;
  teamBPlayers: AovMatchablePlayer[] | undefined;
  minScore?: number;
}): { blue: T[]; red: T[]; swapped: boolean } {
  const {
    bluePlayers,
    redPlayers,
    teamAPlayers,
    teamBPlayers,
    minScore = 0.72,
  } = params;

  const blue = Array.isArray(bluePlayers) ? bluePlayers : [];
  const red = Array.isArray(redPlayers) ? redPlayers : [];
  const teamA = Array.isArray(teamAPlayers) ? teamAPlayers : [];
  const teamB = Array.isArray(teamBPlayers) ? teamBPlayers : [];

  const normal =
    scoreSideAgainstRoster(blue, teamA, minScore).total +
    scoreSideAgainstRoster(red, teamB, minScore).total;
  const swappedScore =
    scoreSideAgainstRoster(blue, teamB, minScore).total +
    scoreSideAgainstRoster(red, teamA, minScore).total;

  const swapped = swappedScore > normal + 0.35;
  const sideForA = swapped ? red : blue;
  const sideForB = swapped ? blue : red;

  return {
    blue: mapAovPlayersToRoster(sideForA, teamA) as T[],
    red: mapAovPlayersToRoster(sideForB, teamB) as T[],
    swapped,
  };
}
