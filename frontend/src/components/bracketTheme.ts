export const BRACKET_BG_CLASS = "";

/** Dòng nhãn phía trên khung trận: mã/vòng bên trái, trạng thái bên phải. */
export const BRACKET_MATCH_TITLE_H = 22;
/** Canvas không có footer — trạng thái nằm trên dòng nhãn. */
export const BRACKET_MATCH_FOOTER_H = 0;

export type BracketMatchDisplayStatus =
  | "upcoming"
  | "ongoing"
  | "completed";

export const getCardCenterY = (top: number, cardH: number): number =>
  top + cardH / 2;

/** Connector anchor: vertical center of the team rows (below the gray title bar). */
export const getMatchCardConnectorY = (top: number, rowH: number): number =>
  top + BRACKET_MATCH_TITLE_H + rowH;

export const getBracketMatchCardHeight = (rowH: number): number =>
  BRACKET_MATCH_TITLE_H + rowH * 2 + BRACKET_MATCH_FOOTER_H;

export const isBracketMatchCompletedStatus = (
  status?: string | null,
): boolean => {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();
  return ["complete", "completed", "done", "finished"].includes(normalized);
};

export const isBracketMatchOngoingStatus = (
  status?: string | null,
): boolean => {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();
  return ["ongoing", "live", "in_progress", "in-progress", "playing"].includes(
    normalized,
  );
};

const hasReachedScheduledTime = (dateScheduled?: string | null): boolean => {
  const raw = String(dateScheduled ?? "").trim();
  if (!raw) return false;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() <= Date.now();
};

export const normalizeBracketMatchStatus = (
  status?: string | null,
  dateScheduled?: string | null,
): BracketMatchDisplayStatus => {
  if (isBracketMatchCompletedStatus(status)) {
    return "completed";
  }

  if (isBracketMatchOngoingStatus(status)) {
    return "ongoing";
  }

  // Tới giờ trận → hiện ĐANG DIỄN RA (kể cả DB còn scheduled)
  if (hasReachedScheduledTime(dateScheduled)) {
    return "ongoing";
  }

  return "upcoming";
};

export const getBracketMatchStatusLabel = (
  status?: string | null,
  dateScheduled?: string | null,
): string => {
  const display = normalizeBracketMatchStatus(status, dateScheduled);
  if (display === "completed") return "ĐÃ KẾT THÚC";
  if (display === "ongoing") return "ĐANG DIỄN RA";
  return "SẮP DIỄN RA";
};

export const formatBracketMatchDate = (
  dateScheduled?: string | null,
): string => {
  const raw = String(dateScheduled ?? "").trim();
  if (!raw) return "CHƯA CÓ";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "CHƯA CÓ";

  const weekday = parsed
    .toLocaleDateString("vi-VN", { weekday: "short" })
    .toUpperCase();
  const day = parsed.getDate();
  const month = parsed
    .toLocaleDateString("vi-VN", { month: "short" })
    .toUpperCase();
  const time = parsed.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${weekday}, ${day} ${month} - ${time}`;
};

/** Ngắn gọn cho dòng nhãn thẻ trận: "T5, 9/10 · 18:00". */
export const formatBracketMatchShortDate = (
  dateScheduled?: string | null,
): string => {
  const raw = String(dateScheduled ?? "").trim();
  if (!raw) return "Chưa có lịch";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "Chưa có lịch";

  const weekday = parsed.toLocaleDateString("vi-VN", { weekday: "short" });
  const time = parsed.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${weekday}, ${parsed.getDate()}/${parsed.getMonth() + 1} · ${time}`;
};

/* Palette canvas: nền #0B0B0B, chữ #F2F0EB, phụ #9A9893, chờ #8C8A85, kẻ #2C2B29, nhấn #FF4A3D */

/** Khung ngoài của thẻ trận (chứa dòng nhãn + hộp đội). */
export const BRACKET_CARD_CLASS = "box-border block";

/** Hộp chứa 2 hàng đội: viền 1px màu chữ, góc vuông. */
export const BRACKET_INNER_CARD_CLASS =
  "box-border overflow-hidden border border-[#F2F0EB] bg-[#0B0B0B]";

export const BRACKET_ROW_BASE_CLASS =
  "flex shrink-0 items-center justify-between px-3 transition-colors duration-150";

/** Hàng đội có ô tỉ số kẻ riêng bên phải (dùng với BRACKET_SCORE_CELL_CLASS). */
export const BRACKET_ROW_SPLIT_CLASS =
  "flex min-h-0 items-stretch justify-between pl-2.5 transition-colors duration-150";

export const BRACKET_ROW_DEFAULT_CLASS = "bg-[#0B0B0B] text-[#F2F0EB]";

export const BRACKET_ROW_WINNER_CLASS =
  "bg-[#0B0B0B] text-[#F2F0EB] font-bold";

export const BRACKET_ROW_LOSER_CLASS = "bg-[#0B0B0B] text-[#9A9893]";

/** Ô trống / TBD: chữ nghiêng màu chờ. */
export const BRACKET_ROW_TBD_CLASS = "bg-[#0B0B0B] text-[#8C8A85] italic";

/** Pick'em: đội đang chọn — đảo màu như "tab đang chọn" trên canvas. */
export const BRACKET_ROW_SELECTED_CLASS =
  "bg-[#F2F0EB] text-[#0B0B0B] font-bold";

export const BRACKET_ROW_CORRECT_CLASS =
  "bg-emerald-950/40 text-emerald-100 font-bold";

export const BRACKET_ROW_WRONG_CLASS =
  "bg-rose-950/40 text-rose-100 font-bold";

/** Ô tỉ số bên phải mỗi hàng, ngăn bằng 1 đường kẻ. */
export const BRACKET_SCORE_CELL_CLASS =
  "flex w-9 shrink-0 items-center justify-center border-l border-[#2C2B29] text-sm font-bold tabular-nums";

export const BRACKET_MATCH_TITLE_CLASS =
  "flex h-[28px] shrink-0 items-center border-t-2 border-[#F2F0EB] pt-1 text-[13px] font-bold leading-tight text-[#F2F0EB]";

export const BRACKET_HEADER_CLASS =
  "border-t-2 border-[#F2F0EB] pt-1.5 text-[13px] font-bold text-[#F2F0EB]";

export const BRACKET_STAGE_HEADER_CLASS =
  "flex h-9 shrink-0 items-center justify-between border-b border-[#F2F0EB] px-3 text-[13px] font-bold text-[#F2F0EB]";

export const BRACKET_STAGE_WRAPPER_CLASS =
  "overflow-hidden border border-[#2C2B29] bg-[#0B0B0B] box-border";

export const BRACKET_OUTCOME_DOT_CLASS = "h-2.5 w-2.5 shrink-0";

export const BRACKET_OUTCOME_DOT_COLORS = {
  win: "bg-emerald-500",
  loss: "bg-rose-500",
  pending: "bg-neutral-500",
} as const;

export const BRACKET_SIDE_TITLE_CLASS =
  "text-[22px] font-extrabold leading-tight tracking-[-0.01em] text-[#F2F0EB]";

export const BRACKET_SIDE_TEAM_ROW_CLASS =
  "flex h-11 items-center gap-2 border border-[#F2F0EB] bg-[#0B0B0B] px-3 transition-colors duration-150";

export const BRACKET_TEAM_ICON_CLASS =
  "flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden ";

export const getBracketRowStateClass = ({
  isHoveredTeam,
  pickState,
  isWinner,
  isLoser = false,
  isTbd = false,
}: {
  isHoveredTeam: boolean;
  pickState?: "selected" | "correct" | "wrong" | null;
  isWinner: boolean;
  isLoser?: boolean;
  isTbd?: boolean;
}): string => {
  if (isHoveredTeam) return BRACKET_ROW_SELECTED_CLASS;
  if (pickState === "correct") return BRACKET_ROW_CORRECT_CLASS;
  if (pickState === "wrong") return BRACKET_ROW_WRONG_CLASS;
  if (pickState === "selected") return BRACKET_ROW_SELECTED_CLASS;
  if (isTbd) return BRACKET_ROW_TBD_CLASS;
  if (isWinner) return BRACKET_ROW_WINNER_CLASS;
  if (isLoser) return BRACKET_ROW_LOSER_CLASS;
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

export const formatBracketSideScore = (
  score: number | null,
  otherScore: number | null,
): string => {
  if (score === null) return "-";
  if (score === 0 && otherScore === 0) return "-";
  return String(score);
};

export const formatBracketMatchScores = (
  s1: number | null,
  s2: number | null,
): { left: string; right: string } => {
  if (s1 === 0 && s2 === 0) return { left: "-", right: "-" };
  return {
    left: s1 !== null ? String(s1) : "-",
    right: s2 !== null ? String(s2) : "-",
  };
};

/** Phòng ban/pick của trận đang mở (ban_picks.status; "active" = phiên luồng cũ chưa xong). */
export const isBanPickOpenStatus = (status?: string | null): boolean =>
  ["waiting", "running", "active"].includes(String(status ?? "").trim().toLowerCase());
