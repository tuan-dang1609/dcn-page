/**
 * Vai trò trong game cho giải theo đội. Giữ khớp với frontend/src/lib/ingameRoles.ts.
 *   - Valorant / LMHT: bắt buộc chọn vai trò (đội hình, xin vào đội, đăng ký tìm đội).
 *   - Liên Quân: không hỏi vai trò.
 * "flex" / "fill" = chơi được mọi vị trí (dùng cho vai trò chính / phụ của người chơi lẻ, không phải 1 vị trí trong đội).
 */

const GAME_ALIASES = {
  val: "valorant",
  valorant: "valorant",
  lol: "lol",
  leagueoflegends: "lol",
  aov: "aov",
  arenaofvalor: "aov",
  lienquan: "aov",
  tft: "tft",
};

/** Vị trí trong đội (mỗi đội ghép tự động có đủ mỗi vị trí 1 người). */
export const GAME_ROLES = {
  valorant: ["duelist", "initiator", "controller", "sentinel"],
  lol: ["top", "jungle", "mid", "adc", "support"],
};

/** Vai trò "chơi được hết". */
export const ANY_ROLE = { valorant: "flex", lol: "fill" };

export const gameKeyOf = (shortName) =>
  GAME_ALIASES[String(shortName ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "")] ?? null;

export const rolesRequired = (game) => Boolean(GAME_ROLES[game]);

/** Game đồng đội dùng được tìm đội / ghép đội. */
export const isTeamGame = (game) => game === "valorant" || game === "lol" || game === "aov";

/** Vị trí hợp lệ trong đội hình (không gồm flex/fill). */
export const isPositionRole = (game, role) => Boolean(GAME_ROLES[game]?.includes(role));

/** Vai trò hợp lệ cho người chơi (vị trí hoặc flex/fill). */
export const isPreferenceRole = (game, role) => isPositionRole(game, role) || (ANY_ROLE[game] && ANY_ROLE[game] === role);

export const cleanRole = (value) => {
  const role = String(value ?? "").trim().toLowerCase();
  return role || null;
};
