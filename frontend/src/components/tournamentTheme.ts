/**
 * Shared tournament UI tokens — phong cách "bảng đấu in" (design/*.dc.html):
 * góc vuông, kẻ 1px, không nền xám; tab/nav đang chọn đảo màu.
 * Nền #0B0B0B · chữ #F2F0EB · phụ #9A9893 · kẻ #2C2B29 · nhấn #FF4A3D.
 */

export const TOURNAMENT_PAGE_BG_CLASS = "text-[#F2F0EB]";

export const TOURNAMENT_PAGE_TITLE_CLASS =
  "text-[22px] font-extrabold leading-tight tracking-[-0.01em] text-[#F2F0EB]";

export const TOURNAMENT_PAGE_HINT_CLASS =
  "text-xs leading-relaxed text-[#9A9893]";

export const TOURNAMENT_NAV_WRAPPER_CLASS =
  "w-full border border-[#F2F0EB] bg-[#0B0B0B]";

export const TOURNAMENT_NAV_LINK_BASE =
  "flex min-h-11 flex-1 items-center justify-center px-2 py-2 text-center text-sm font-semibold transition-colors [&+&]:border-l [&+&]:border-[#F2F0EB]";

export const TOURNAMENT_NAV_LINK_ACTIVE = "bg-[#F2F0EB] text-[#0B0B0B]";

export const TOURNAMENT_NAV_LINK_INACTIVE =
  "bg-transparent text-[#F2F0EB] hover:bg-[#F2F0EB]/5";

export const TOURNAMENT_SUBTAB_BASE =
  "min-h-11 px-4 py-2 text-sm font-semibold transition-colors border border-[#F2F0EB]";

export const TOURNAMENT_SUBTAB_ACTIVE = "bg-[#F2F0EB] text-[#0B0B0B]";

export const TOURNAMENT_SUBTAB_INACTIVE =
  "text-[#F2F0EB] hover:bg-[#F2F0EB]/5";

export const TOURNAMENT_SUBTAB_GROUP_CLASS = "flex items-center gap-0";

export const TOURNAMENT_TABLE_HEADER_CLASS =
  "h-10 bg-transparent px-2 text-xs font-normal text-[#9A9893] md:px-4";

/** Header row: chữ xám nhỏ, kẻ 2px màu chữ bên dưới — không nền. */
export const TOURNAMENT_TABLE_HEADER_ROW_CLASS =
  "border-b-2 border-[#F2F0EB] bg-transparent hover:bg-transparent data-[state=selected]:bg-transparent";

export const TOURNAMENT_TABLE_ROW_CLASS =
  "border-b border-[#2C2B29] bg-transparent text-[#F2F0EB]";

export const TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS =
  "border-b border-[#2C2B29] bg-transparent text-[#F2F0EB] transition-colors duration-150 hover:bg-[#F2F0EB]/5";

export const TOURNAMENT_TABLE_CELL_CLASS =
  "px-2 py-2.5 text-[13px] tabular-nums md:px-4 md:py-3 md:text-sm";

export const TOURNAMENT_PANEL_CLASS = "border border-[#2C2B29] bg-[#0B0B0B]";

/** Mobile: fit viewport. PC: keep wide table like reference. */
export const TOURNAMENT_TABLE_MIN_CLASS = "w-full min-w-0 md:min-w-[680px]";

export const DEFAULT_USER_AVATAR_URL =
  "https://nybmykdjtkjaatepkfog.supabase.co/storage/v1/object/public/image/users/default-avatar-icon-of-social-media-user-vector.jpg";

export const TOURNAMENT_TABLE_TAG_CLASS =
  "text-sm font-extrabold text-[#F2F0EB] whitespace-nowrap";

export const TOURNAMENT_TEAM_TAG_BADGE_CLASS =
  "inline-block py-1 text-sm font-extrabold text-[#F2F0EB]";

/** Tab chọn nhánh: các ô liền nhau trong 1 khung viền, ô đang chọn đảo màu. */
export const TOURNAMENT_TAB_CARD_BASE =
  "flex min-h-14 min-w-[148px] flex-col items-start justify-center gap-0.5 px-4 py-2 text-left transition-colors [&+&]:border-l [&+&]:border-[#F2F0EB]";

export const TOURNAMENT_TAB_CARD_ACTIVE = "bg-[#F2F0EB] text-[#0B0B0B]";

export const TOURNAMENT_TAB_CARD_INACTIVE =
  "bg-transparent text-[#F2F0EB] hover:bg-[#F2F0EB]/5";

export const TOURNAMENT_TAB_CARD_LABEL =
  "text-xs leading-tight text-current opacity-60";

export const TOURNAMENT_TAB_CARD_TITLE =
  "text-[15px] font-bold leading-snug text-current";

export const TOURNAMENT_TAB_ROW_CLASS =
  "flex flex-wrap border border-[#F2F0EB] w-fit max-w-full";

/** Normalize route/DB game slug for comparisons. */
export const normalizeGameSlug = (value?: string | null) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) return "";
  if (["valo", "val", "valorant"].includes(normalized)) return "valorant";
  if (["lol", "leagueoflegends", "league_of_legends"].includes(normalized))
    return "lol";
  if (["tft", "teamfighttactics", "teamfight_tactics"].includes(normalized))
    return "tft";
  if (["wildrift", "wr"].includes(normalized)) return "wildrift";

  return normalized;
};

/** Riot ID chỉ dùng cho game thuộc hệ sinh thái Riot. */
export const isRiotGameSlug = (value?: string | null) => {
  const key = normalizeGameSlug(value);
  return ["valorant", "lol", "tft", "wildrift"].includes(key);
};

/** BXH cá nhân (stats ván) hiện chỉ hỗ trợ Arena of Valor. */
export const isAovGameSlug = (value?: string | null) => {
  const key = normalizeGameSlug(value);
  return ["aov", "arenaofvalor", "arena_of_valor", "lienquan"].includes(key);
};

export const TOURNAMENT_MEMBER_ROW_CLASS =
  "flex items-center gap-3 border-0 border-b border-[#2C2B29] bg-transparent px-4 py-3 last:border-b-0";

export const TOURNAMENT_MEMBER_AVATAR_CLASS =
  "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden border border-[#2C2B29] bg-transparent text-xs font-bold text-[#9A9893] sm:h-12 sm:w-12";

export const TOURNAMENT_SECTION_META_CLASS = "mt-1 text-xs text-[#9A9893]";

export const TOURNAMENT_PANEL_TITLE_CLASS =
  "border-b-2 border-[#F2F0EB] px-4 py-2.5 text-[13px] font-bold text-[#F2F0EB]";

export const TOURNAMENT_INFO_ROW_CLASS =
  "flex items-center justify-between gap-4 border-b border-[#2C2B29] px-4 py-3 last:border-b-0";

export const TOURNAMENT_INFO_LABEL_CLASS = "shrink-0 text-xs text-[#9A9893]";

export const TOURNAMENT_INFO_VALUE_CLASS =
  "min-w-0 text-right text-sm font-semibold text-[#F2F0EB]";

export const TOURNAMENT_STAT_CARD_CLASS =
  "flex min-h-[84px] items-center gap-3 border-t border-[#F2F0EB] bg-transparent p-3 sm:min-h-[92px] sm:gap-4 sm:p-4";

export const TOURNAMENT_STAT_ICON_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center border border-[#2C2B29] bg-transparent sm:h-11 sm:w-11";

/** Match detail scoreboard — fixed width on large screens so teams stay grouped. */
export const MATCH_SCOREBOARD_WRAPPER_CLASS =
  "mx-auto w-full max-w-2xl px-4 md:px-6";

export const MATCH_ROSTER_PANEL_CLASS = TOURNAMENT_PANEL_CLASS;

export const MATCH_ROSTER_HEADER_CLASS =
  "flex items-center gap-2.5 border-b-2 border-[#F2F0EB] px-3 py-2.5";

export const MATCH_ROSTER_PLAYER_ROW_CLASS = TOURNAMENT_MEMBER_ROW_CLASS;

export const MATCH_ROSTER_AVATAR_CLASS = TOURNAMENT_MEMBER_AVATAR_CLASS;
