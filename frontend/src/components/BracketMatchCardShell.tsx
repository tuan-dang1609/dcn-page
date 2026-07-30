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

const statusBadgeClass = (
  status?: string | null,
  dateScheduled?: string | null,
) => {
  const display = normalizeBracketMatchStatus(status, dateScheduled);
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
      className="flex shrink-0 items-center justify-between gap-2 bg-[#D1D5DB] px-2 text-[10px] font-extrabold uppercase leading-tight tracking-wide text-neutral-900"
      style={{ height: BRACKET_MATCH_TITLE_H }}
    >
      <span className="min-w-0 truncate">
        {formatBracketMatchDate(dateScheduled)}
      </span>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide ${statusBadgeClass(status, dateScheduled)}`}
      >
        {getBracketMatchStatusLabel(status, dateScheduled)}
      </span>
    </div>
    <div className="flex min-h-0 flex-1 flex-col divide-y divide-neutral-700">
      {children}
    </div>
    <div
      className="flex shrink-0 items-center justify-between gap-2 border-t border-neutral-700 bg-[#101010] px-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400"
      style={{ height: BRACKET_MATCH_FOOTER_H }}
    >
      <span className="min-w-0 truncate">{title}</span>
      
    </div>
  </div>
);
