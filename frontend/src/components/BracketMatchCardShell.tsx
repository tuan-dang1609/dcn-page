import type { CSSProperties, ReactNode } from "react";
import {
  BRACKET_CARD_CLASS,
  BRACKET_MATCH_TITLE_CLASS,
} from "@/components/bracketTheme";

type BracketMatchCardShellProps = {
  title: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export const BracketMatchCardShell = ({
  title,
  children,
  className = "",
  style,
}: BracketMatchCardShellProps) => (
  <div
    className={`${BRACKET_CARD_CLASS} flex flex-col ${className}`}
    style={style}
  >
    <div className={`${BRACKET_MATCH_TITLE_CLASS} shrink-0`}>
      <span className="truncate px-1">{title}</span>
    </div>
    <div className="flex min-h-0 flex-1 flex-col divide-y divide-neutral-700">
      {children}
    </div>
  </div>
);
