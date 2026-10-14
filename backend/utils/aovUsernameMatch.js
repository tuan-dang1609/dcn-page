import { pool } from "./db.js";

/**
 * Ghép tên đọc từ ảnh tổng kết Liên Quân (OCR) với tài khoản đã đăng ký → trả USERNAME.
 *
 * Dữ liệu thật: nickname = IGN trong game (πWA, єαɢℓє•єує, AnhLạyCácEm), username = "<tag đội>_<tên>"
 * (klw_piwa, klw_eagle_eye, 5nd_anhlay). Nên so tên OCR với cả nickname, username và username bỏ tag.
 *
 * OCR hay sai 1–2 ký tự / ký tự trang trí → so theo số ký tự trùng:
 *   - chuẩn hoá: bỏ dấu, quy đổi chữ trông giống Latin (ε→e, ᴀ→a, ø→o…), chữ thường, chỉ giữ chữ + số;
 *   - điểm = trung bình (khoảng cách sửa chữ, số ký tự chung / độ dài dài hơn); chứa nhau (≥4 ký tự) → ≥ 0.85.
 * 2 lượt:
 *   1. Toàn hệ thống, ngưỡng cao (0.75) — tránh khớp nhầm tên chưa đăng ký (vd. "Diadia." ≠ "dsada").
 *   2. Mỗi bên (xanh / đỏ): nếu ≥ 2 người đã khớp cùng 1 đội (team_id), tên còn lại chỉ so với người
 *      cùng đội đó, ngưỡng thấp hơn (0.45) — vd. "TWA" (OCR của πWA) → klw_piwa.
 * Không ghép theo loại trừ: đội có thể đăng ký người không ra sân và dùng người dự bị chưa đăng ký.
 * Mỗi ván ghép 1–1: một tài khoản không bị dùng 2 lần.
 */

export const GLOBAL_MIN_SCORE = 0.75;
export const TEAM_MIN_SCORE = 0.45;

const HOMOGLYPHS = {
  α: "a", β: "b", ε: "e", η: "n", ι: "i", κ: "k", ν: "v", ο: "o", π: "n", ρ: "p", τ: "t", υ: "u", χ: "x", ω: "w",
  а: "a", в: "b", е: "e", є: "e", з: "3", и: "u", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", ї: "i", і: "i",
  ø: "o", ð: "d", þ: "p", ß: "b", ł: "l", ℓ: "l",
  ᴀ: "a", ʙ: "b", ᴄ: "c", ᴅ: "d", ᴇ: "e", ɢ: "g", ʜ: "h", ɪ: "i", ᴊ: "j", ᴋ: "k", ʟ: "l", ᴍ: "m", ɴ: "n", ᴏ: "o", ᴘ: "p", ʀ: "r", ᴛ: "t", ᴜ: "u", ᴠ: "v", ᴡ: "w", ʏ: "y", ᴢ: "z",
};

export const normalizeName = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .split("")
    .map((ch) => HOMOGLYPHS[ch] ?? ch)
    .join("")
    .replace(/[^\p{L}\p{N}]+/gu, "");

/** "NTNU.EmMon" / "klw_ntnu_emmon" → bỏ tiền tố tag ngắn ở đầu. */
const withoutTag = (value) => {
  const parts = String(value ?? "").split(/[.\-_·•\s]+/).filter(Boolean);
  return parts.length >= 2 && parts[0].length <= 6 ? normalizeName(parts.slice(1).join("")) : normalizeName(value);
};

const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= b.length; j += 1) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[b.length];
};

const commonChars = (a, b) => {
  const counts = new Map();
  for (const ch of a) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let common = 0;
  for (const ch of b) {
    const left = counts.get(ch) ?? 0;
    if (left > 0) {
      common += 1;
      counts.set(ch, left - 1);
    }
  }
  return common;
};

const pairScore = (a, b) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  const score = ((1 - levenshtein(a, b) / maxLen) + commonChars(a, b) / maxLen) / 2;
  // Tên ngắn là phần ĐẦU / CUỐI của tên dài (vd. "anhlaycacem" bắt đầu bằng "anhlay") → gần như chắc cùng người.
  // Nằm giữa thì không tính ("diadia" trong "quendiadiaroi" là người khác).
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const affix = shorter.length >= 4 && (longer.startsWith(shorter) || longer.endsWith(shorter));
  return affix ? Math.max(score, 0.85) : score;
};

const userAliases = (user) =>
  [...new Set([user.nickname, user.username].map((value) => String(value ?? "").trim()).filter(Boolean))];

/** Độ giống tên OCR ↔ tài khoản (0–1), lấy alias khớp nhất (nickname / username / username bỏ tag). */
export const userSimilarity = (ocr, user) => {
  const ocrFull = normalizeName(ocr);
  const ocrCore = withoutTag(ocr);
  let best = 0;
  for (const alias of userAliases(user)) {
    const full = normalizeName(alias);
    const core = withoutTag(alias);
    best = Math.max(best, pairScore(ocrFull, full), pairScore(ocrCore, core), pairScore(ocrFull, core), pairScore(ocrCore, full));
  }
  return best;
};

const emptyResult = (name) => ({ name, username: null, user_id: null, nickname: null, score: 0, matched: false });

/** Ghép tham lam (điểm cao nhận trước), 1 tài khoản 1 lần. */
const greedyAssign = (names, indexes, users, minScore, result, usedUsers) => {
  const pairs = [];
  for (const index of indexes) {
    if (!String(names[index] ?? "").trim() || result[index].matched) continue;
    for (const user of users) {
      if (usedUsers.has(String(user.id))) continue;
      const score = userSimilarity(names[index], user);
      if (score >= minScore) pairs.push({ index, user, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  for (const pair of pairs) {
    if (result[pair.index].matched || usedUsers.has(String(pair.user.id))) continue;
    usedUsers.add(String(pair.user.id));
    result[pair.index] = {
      name: names[pair.index],
      username: pair.user.username,
      user_id: Number(pair.user.id),
      nickname: pair.user.nickname ?? null,
      score: Math.round(pair.score * 1000) / 1000,
      matched: true,
    };
  }
};

/**
 * Ghép 1 ván. blue / red: tên đọc được (tối đa 5 mỗi bên). users: [{ id, username, nickname, team_id }].
 * Trả { blue: Result[], red: Result[] } cùng thứ tự.
 */
export const matchGameToUsers = ({ blue, red }, users) => {
  const names = [...blue, ...red];
  const sides = { blue: blue.map((_, i) => i), red: red.map((_, i) => blue.length + i) };
  const result = names.map(emptyResult);
  const usedUsers = new Set();
  const userById = new Map(users.map((user) => [String(user.id), user]));

  // Lượt 1: toàn hệ thống, ngưỡng cao
  greedyAssign(names, names.map((_, i) => i), users, GLOBAL_MIN_SCORE, result, usedUsers);

  // Lượt 2: trong đội chiếm đa số của mỗi bên
  for (const indexes of Object.values(sides)) {
    const teamCounts = new Map();
    for (const index of indexes) {
      const teamId = result[index].matched ? userById.get(String(result[index].user_id))?.team_id : null;
      if (teamId !== null && teamId !== undefined) teamCounts.set(String(teamId), (teamCounts.get(String(teamId)) ?? 0) + 1);
    }
    const [teamId, count] = [...teamCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (!teamId || count < 2) continue;
    const teammates = users.filter((user) => String(user.team_id) === teamId);
    greedyAssign(names, indexes, teammates, TEAM_MIN_SCORE, result, usedUsers);
  }

  return { blue: result.slice(0, blue.length), red: result.slice(blue.length) };
};

/** Tài khoản có username (để ghép). */
export const loadMatchableUsers = async () => {
  const { rows } = await pool.query(
    `SELECT id, username, nickname, team_id
     FROM users
     WHERE username IS NOT NULL AND TRIM(username) <> ''`,
  );
  return rows;
};
