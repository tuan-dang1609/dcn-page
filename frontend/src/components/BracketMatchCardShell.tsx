import type { CSSProperties, ReactNode } from "react";
import {
  BRACKET_CARD_CLASS,
  BRACKET_MATCH_FOOTER_H,
  BRACKET_MATCH_TITLE_H,
  formatBracketMatchDate,
  getBracketMatchStatusLabel,
  normalizeBracketMatchStatus,
} from "@/components/bracketTheme";

type BracketMatchCardShellProps = {
  title: string;
  status?: string | null;
  dateScheduled?: string | null;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

const statusBadgeClass = (status?: string | null) => {
  const display = normalizeBracketMatchStatus(status);
  if (display === "completed") {
    return "bg-neutral-300 text-neutral-900";
  }
  if (display === "ongoing") {
    return "bg-emerald-500 text-black";
  }
  return "bg-neutral-950 text-white";
};

export const BracketMatchCardShell = ({
  title,
  status,
  dateScheduled,
  children,
  className = "",
  style,
}: BracketMatchCardShellProps) => (
  <div
    className={`${BRACKET_CARD_CLASS} flex flex-col ${className}`}
    style={style}
  >
    <div
      className="flex shrink-0 items-center justify-between gap-2 bg-[#D1D5DB] px-2.5 text-[10px] font-extrabold uppercase leading-tight tracking-wider text-neutral-900"
      style={{ height: BRACKET_MATCH_TITLE_H }}
    >
      <span className="min-w-0 truncate">
        {formatBracketMatchDate(dateScheduled)}
      </span>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide ${statusBadgeClass(status)}`}
      >
        {getBracketMatchStatusLabel(status)}
      </span>
    </div>
    <div className="flex min-h-0 flex-1 flex-col divide-y divide-neutral-700">
      {children}
    </div>
    <div
      className="flex shrink-0 items-center justify-between gap-2 border-t border-neutral-700 bg-[#101010] px-2.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400"
      style={{ height: BRACKET_MATCH_FOOTER_H }}
    >
      <span className="min-w-0 truncate">{title}</span>
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-neutral-600 text-[9px] font-bold text-neutral-500"
        aria-hidden
      >
        i
      </span>
    </div>
  </div>
);
