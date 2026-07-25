/** Normalize + fuzzy-match AOV/Liên Quân IGN → registered players. */

const toStr = (value) => String(value ?? "").trim();

export const normalizeAovIgn = (value) =>
  toStr(value)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/['"‘’“”`]/g, "")
    .toLowerCase()
    .replace(/[.\-_·•]+$/g, "")
    .replace(/\s+/g, "");

/** FPT.matcha / NTNU.EmMon / [TAG]name → core name without clan tag */
export const stripClanTag = (normalized) => {
  const raw = String(normalized ?? "").replace(/[.\-_·•]+$/g, "");
  if (!raw) return "";
  const noBracket = raw.replace(/^\[[^\]]*\]/, "");
  const parts = noBracket.split(/[.\-_·•]+/).filter(Boolean);
  if (parts.length >= 2 && parts[0].length <= 8) {
    return parts.slice(1).join("");
  }
  return noBracket;
};

const levenshtein = (a, b) => {
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

export const ignSimilarity = (a, b) => {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (!left || !right) return 0;
  if (left === right) return 1;
  const maxLen = Math.max(left.length, right.length);
  if (!maxLen) return 0;
  return 1 - levenshtein(left, right) / maxLen;
};

const playerAliases = (player) => {
  const list = [
    player?.nickname,
    player?.username,
    String(player?.riot_account ?? "").split("#")[0],
  ];
  return [...new Set(list.map(toStr).filter(Boolean))];
};

/**
 * @returns {{ player: object, score: number, alias: string } | null}
 */
export const matchAovIgnToPlayer = (
  ign,
  players,
  { minScore = 0.72 } = {},
) => {
  const raw = normalizeAovIgn(ign);
  const rawCore = stripClanTag(raw);
  if (!raw || !Array.isArray(players) || !players.length) return null;

  let best = null;

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

/**
 * 1–1 map AOV players → roster. Higher score wins; no duplicate users.
 * Rewrites `ign` to nickname/username when matched; keeps `matched_from_ign`.
 */
export const mapAovPlayersToRoster = (aovPlayers, rosterPlayers) => {
  const source = Array.isArray(aovPlayers) ? aovPlayers : [];
  const roster = Array.isArray(rosterPlayers) ? rosterPlayers : [];
  if (!source.length) return source;

  const scored = [];
  source.forEach((row, index) => {
    const ign = toStr(row?.matched_from_ign || row?.ign);
    const hit = matchAovIgnToPlayer(ign, roster);
    if (hit) scored.push({ index, ign, ...hit });
  });

  scored.sort((a, b) => b.score - a.score);

  const usedUsers = new Set();
  const usedIndices = new Set();
  const mapped = source.map((row) => ({ ...row }));

  for (const hit of scored) {
    const uid =
      hit.player?.user_id ??
      hit.player?.id ??
      hit.player?.username ??
      hit.alias;
    if (usedUsers.has(uid) || usedIndices.has(hit.index)) continue;

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
};

/** Điểm khớp 1 phía → roster (greedy 1–1). */
const scoreSideAgainstRoster = (players, roster, minScore = 0.72) => {
  const used = new Set();
  let total = 0;

  const scored = (Array.isArray(players) ? players : [])
    .map((row) => {
      const ign = toStr(row?.matched_from_ign || row?.ign);
      const hit = matchAovIgnToPlayer(ign, roster, { minScore });
      return hit ? { hit, score: hit.score } : null;
    })
    .filter((item) => Boolean(item));

  scored.sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0));

  for (const item of scored) {
    if (!item) continue;
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
export const assignAovPlayersAcrossTeams = ({
  bluePlayers,
  redPlayers,
  teamAPlayers,
  teamBPlayers,
  minScore = 0.72,
}) => {
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
    blue: mapAovPlayersToRoster(sideForA, teamA),
    red: mapAovPlayersToRoster(sideForB, teamB),
    swapped,
  };
};
