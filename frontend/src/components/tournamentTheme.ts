/** Shared tournament UI tokens — flat, square, dark palette (not pickem). */

export const TOURNAMENT_PAGE_BG_CLASS = " text-neutral-200";

export const TOURNAMENT_PAGE_TITLE_CLASS =
  "text-xl font-extrabold uppercase tracking-widest text-white";

export const TOURNAMENT_NAV_WRAPPER_CLASS =
  "w-full border border-neutral-700 bg-[#141414]";

export const TOURNAMENT_NAV_LINK_BASE =
  "flex min-h-9 flex-1 items-center justify-center px-2 py-2 text-center text-xs font-extrabold uppercase tracking-wide transition-colors";

export const TOURNAMENT_NAV_LINK_ACTIVE =
  "bg-[#2d2d2d] text-white";

export const TOURNAMENT_NAV_LINK_INACTIVE =
  "bg-transparent text-neutral-400 hover:bg-neutral-900 hover:text-white";

export const TOURNAMENT_SUBTAB_BASE =
  "px-4 py-2 text-xs font-extrabold uppercase tracking-wide transition-colors border border-neutral-700";

export const TOURNAMENT_SUBTAB_ACTIVE =
  "bg-[#2d2d2d] text-white border-neutral-600";

export const TOURNAMENT_SUBTAB_INACTIVE =
  " text-neutral-400 hover:bg-neutral-900 hover:text-white";

export const TOURNAMENT_SUBTAB_GROUP_CLASS =
  "flex items-center gap-2 border border-neutral-700  px-2 py-1";

export const TOURNAMENT_TABLE_HEADER_CLASS =
  "bg-[#D1D5DB] text-neutral-900 text-xs font-extrabold uppercase tracking-widest";

/** Header row: override TableRow default hover so header stays flat gray. */
export const TOURNAMENT_TABLE_HEADER_ROW_CLASS =
  "border-b border-neutral-600 bg-[#D1D5DB] hover:bg-[#D1D5DB] data-[state=selected]:bg-[#D1D5DB]";

export const TOURNAMENT_TABLE_ROW_CLASS =
  "border-b border-neutral-800 bg-[#141414] text-neutral-200";

export const TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS =
  "border-b border-neutral-800 bg-[#141414] text-neutral-200 transition-colors duration-150 hover:bg-[#1c1c1c]";

export const TOURNAMENT_PANEL_CLASS =
  "border border-neutral-700 bg-[#141414]";

export const TOURNAMENT_TABLE_MIN_CLASS = "w-full min-w-[680px]";

export const TOURNAMENT_TABLE_TAG_CLASS =
  "text-sm font-extrabold uppercase tracking-widest text-white whitespace-nowrap";

export const TOURNAMENT_TEAM_TAG_BADGE_CLASS =
  "inline-block py-1 text-sm font-extrabold uppercase tracking-widest text-white";

/** Card-style tab (label + title), matches reference bracket nav */
export const TOURNAMENT_TAB_CARD_BASE =
  "flex min-w-[148px] flex-col items-start gap-1 rounded-sm border border-[#333] px-4 py-3 text-left transition-colors";

export const TOURNAMENT_TAB_CARD_ACTIVE = "bg-[#1a1a1a] border-[#333]";

export const TOURNAMENT_TAB_CARD_INACTIVE =
  "bg-transparent hover:bg-[#111111]";

export const TOURNAMENT_TAB_CARD_LABEL =
  "text-[10px] font-bold uppercase leading-tight tracking-wider text-neutral-500";

export const TOURNAMENT_TAB_CARD_TITLE =
  "text-[15px] font-bold leading-snug text-white";

export const TOURNAMENT_TAB_ROW_CLASS = "flex flex-wrap gap-2";

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

export const TOURNAMENT_MEMBER_ROW_CLASS =
  "flex items-center gap-3 border-0 border-b border-neutral-800 bg-[#141414] px-4 py-3 last:border-b-0";

export const TOURNAMENT_MEMBER_AVATAR_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border border-neutral-600 bg-[#2d2d2d] text-xs font-bold uppercase text-neutral-200";

export const TOURNAMENT_SECTION_META_CLASS =
  "mt-1 text-xs font-bold uppercase tracking-wider text-neutral-500";

export const TOURNAMENT_PANEL_TITLE_CLASS =
  "px-4 py-3 text-xs font-extrabold uppercase tracking-widest text-neutral-400 border-b border-neutral-700 bg-[#1a1a1a]";

export const TOURNAMENT_INFO_ROW_CLASS =
  "flex items-center justify-between gap-4 border-b border-neutral-800 px-4 py-3.5 last:border-b-0";

export const TOURNAMENT_INFO_LABEL_CLASS =
  "shrink-0 text-xs font-extrabold uppercase tracking-wider text-neutral-500";

export const TOURNAMENT_INFO_VALUE_CLASS =
  "min-w-0 text-right text-sm font-bold text-neutral-100";

export const TOURNAMENT_STAT_CARD_CLASS =
  "flex min-h-[84px] items-center gap-3 border border-neutral-700 bg-[#141414] p-3 sm:min-h-[92px] sm:gap-4 sm:p-4";

export const TOURNAMENT_STAT_ICON_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center border border-neutral-600 bg-[#2d2d2d] sm:h-11 sm:w-11";
