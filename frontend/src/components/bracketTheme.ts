export const BRACKET_BG_CLASS = "";

export const BRACKET_MATCH_TITLE_H = 32;

export const getCardCenterY = (top: number, cardH: number): number =>
  top + cardH / 2;

/** Connector anchor: vertical center of the team rows (below the gray title bar). */
export const getMatchCardConnectorY = (top: number, rowH: number): number =>
  top + BRACKET_MATCH_TITLE_H + rowH;

export const getBracketMatchCardHeight = (rowH: number): number =>
  BRACKET_MATCH_TITLE_H + rowH * 2;

export const BRACKET_INNER_CARD_CLASS =
  "box-border block overflow-hidden border border-neutral-600 bg-[#141414]";

export const BRACKET_CARD_CLASS =
  "box-border block overflow-hidden border border-neutral-600 bg-[#141414]";

export const BRACKET_ROW_BASE_CLASS =
  "flex shrink-0 items-center justify-between px-4 transition-all duration-150";

export const BRACKET_ROW_DEFAULT_CLASS = "bg-[#141414] text-neutral-100";

export const BRACKET_ROW_WINNER_CLASS =
  "bg-emerald-950/40 text-emerald-100 font-semibold border-l-[3px] border-l-emerald-400";

export const BRACKET_ROW_SELECTED_CLASS =
  "bg-neutral-900 text-white font-semibold border-l-[3px] border-l-neutral-400";

export const BRACKET_ROW_CORRECT_CLASS =
  "bg-emerald-950/40 text-emerald-100 font-semibold border-l-[3px] border-l-emerald-400";

export const BRACKET_ROW_WRONG_CLASS =
  "bg-rose-950/40 text-rose-100 font-semibold border-l-[3px] border-l-rose-400";

export const BRACKET_MATCH_TITLE_CLASS =
  "flex h-8 shrink-0 items-center justify-center bg-[#D1D5DB] px-2 text-[10px] font-extrabold uppercase leading-tight tracking-wider text-neutral-900";

export const BRACKET_HEADER_CLASS =
  "bg-[#D1D5DB] px-4 py-2 text-xs font-extrabold uppercase tracking-widest text-neutral-900 text-center";

export const BRACKET_STAGE_HEADER_CLASS =
  "flex h-8 shrink-0 items-center justify-between bg-[#D1D5DB] px-3 text-[11px] font-extrabold uppercase tracking-widest text-neutral-900";

export const BRACKET_STAGE_WRAPPER_CLASS =
  "overflow-hidden border border-neutral-600 bg-[#141414] box-border";

export const BRACKET_OUTCOME_DOT_CLASS = "h-2.5 w-2.5 shrink-0";

export const BRACKET_OUTCOME_DOT_COLORS = {
  win: "bg-emerald-500",
  loss: "bg-rose-500",
  pending: "bg-neutral-500",
} as const;

export const BRACKET_SIDE_TITLE_CLASS =
  "text-sm font-extrabold uppercase tracking-widest text-white";

export const BRACKET_SIDE_TEAM_ROW_CLASS =
  "flex h-11 items-center gap-2 border border-neutral-600 bg-[#141414] px-3 transition-all duration-150";

export const BRACKET_TEAM_ICON_CLASS =
  "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden ";

export const getBracketRowStateClass = ({
  isHoveredTeam,
  pickState,
  isWinner,
}: {
  isHoveredTeam: boolean;
  pickState?: "selected" | "correct" | "wrong" | null;
  isWinner: boolean;
}): string => {
  if (isHoveredTeam) return "bg-[#1c1c1c] text-white";
  if (pickState === "correct") return BRACKET_ROW_CORRECT_CLASS;
  if (pickState === "wrong") return BRACKET_ROW_WRONG_CLASS;
  if (pickState === "selected") return BRACKET_ROW_SELECTED_CLASS;
  if (isWinner) return BRACKET_ROW_WINNER_CLASS;
  return BRACKET_ROW_DEFAULT_CLASS;
};

export const parseSwissRecordLabel = (
  label: string,
): { wins: number; losses: number } | null => {
  const match = /^(\d+)-(\d+)$/.exec(label.trim());
  if (!match) return null;
  return { wins: Number(match[1]), losses: Number(match[2]) };
};

export const buildSwissOutcomeDots = (
  label: string,
  advanceWins: number,
  eliminateLosses: number,
): Array<"win" | "loss" | "pending"> => {
  const totalSlots = Math.max(1, advanceWins + eliminateLosses - 1);
  const record = parseSwissRecordLabel(label);

  if (!record) {
    return Array.from({ length: totalSlots }, () => "pending" as const);
  }

  const dots: Array<"win" | "loss" | "pending"> = [
    ...Array.from({ length: record.wins }, () => "win" as const),
    ...Array.from({ length: record.losses }, () => "loss" as const),
  ];

  while (dots.length < totalSlots) dots.push("pending");
  return dots.slice(0, totalSlots);
};

export const getSwissColumnRoundTitle = (colIndex: number): string =>
  `Vòng ${colIndex + 1}`;

export const getSwissStageRoundTitle = (
  label: string,
  layout: string[][],
  matches: { round: number }[],
): string => {
  if (label.startsWith("R") && matches.length) {
    return `Vòng ${matches[0].round}`;
  }

  const colIndex = layout.findIndex((column) => column.includes(label));
  if (colIndex >= 0) return `Vòng ${colIndex + 1}`;

  return label;
};
