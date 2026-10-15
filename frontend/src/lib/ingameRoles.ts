/**
 * Vai trò trong game — khớp backend/utils/ingameRoles.js.
 * Valorant / LMHT bắt buộc chọn; Liên Quân không hỏi.
 */

export type RoleGame = "valorant" | "lol";

export const ROLE_LABELS: Record<string, string> = {
  // LMHT
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "ADC",
  support: "Support",
  fill: "Fill",
  // Valorant
  duelist: "Duelist",
  initiator: "Initiator",
  controller: "Controller",
  sentinel: "Sentinel",
  flex: "Flex",
};

export const roleLabel = (role?: string | null) => (role ? ROLE_LABELS[role] ?? role : "");

/** Vị trí trong đội + lựa chọn "chơi mọi vị trí". */
export const GAME_ROLE_OPTIONS: Record<RoleGame, { positions: string[]; any: string }> = {
  valorant: { positions: ["duelist", "initiator", "controller", "sentinel"], any: "flex" },
  lol: { positions: ["top", "jungle", "mid", "adc", "support"], any: "fill" },
};

/** Vai trò chọn được cho người chơi của game (rỗng nếu game không dùng vai trò). */
export const roleChoices = (game?: string | null): string[] => {
  const options = game ? GAME_ROLE_OPTIONS[game as RoleGame] : undefined;
  return options ? [...options.positions, options.any] : [];
};
