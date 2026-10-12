import type { CSSProperties, ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BRACKET_CARD_CLASS,
  BRACKET_INNER_CARD_CLASS,
  BRACKET_MATCH_TITLE_H,
  formatBracketMatchShortDate,
  normalizeBracketMatchStatus,
} from "@/components/bracketTheme";

type BracketMatchCardShellProps = {
  title: string;
  status?: string | null;
  dateScheduled?: string | null;
  /** Trận đã xong và bấm được để xem kết quả → hiện "Kết quả →". */
  isClickable?: boolean;
  /** Trận có phòng ban/pick đang mở → góc thẻ thành link "Ban/pick →" tới lobby. */
  banPickMatchId?: number | null;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * Thẻ trận kiểu "bảng đấu in" (design/Main.dc.html):
 * dòng nhãn phía trên (vòng + trạng thái), hộp viền 1px chứa 2 hàng đội.
 * Trận đang diễn ra: viền + chữ màu nhấn.
 */
export const BracketMatchCardShell = ({
  title,
  status,
  dateScheduled,
  isClickable = false,
  banPickMatchId,
  children,
  className = "",
  style,
}: BracketMatchCardShellProps) => {
  const { game, slug } = useParams();
  const display = normalizeBracketMatchStatus(status, dateScheduled);
  const isLive = display === "ongoing";
  const isDone = display === "completed";

  const statusText = isDone
    ? isClickable
      ? "Kết quả →"
      : "Kết thúc"
    : isLive
      ? "TRỰC TIẾP"
      : formatBracketMatchShortDate(dateScheduled);

  const statusClass = isLive
    ? "font-bold text-[#FF4A3D]"
    : isDone
      ? `text-[#F2F0EB] ${isClickable ? "underline underline-offset-[3px]" : ""}`
      : "text-[#9A9893]";

  return (
    <div className={`${BRACKET_CARD_CLASS} flex flex-col ${className}`} style={style}>
      <div
        className="flex shrink-0 items-start justify-between gap-2 text-xs tabular-nums"
        style={{ height: BRACKET_MATCH_TITLE_H }}
      >
        <span className="min-w-0 truncate font-bold text-[#F2F0EB]">{title}</span>
        {banPickMatchId && !isDone && game && slug ? (
          <Link
            to={`/tournament/${game}/${slug}/lobby/${banPickMatchId}`}
            onClick={(event) => event.stopPropagation()}
            className="shrink-0 font-bold text-[#FF4A3D] underline underline-offset-[3px]"
          >
            Ban/pick →
          </Link>
        ) : (
          <span className={`shrink-0 ${statusClass}`}>{statusText}</span>
        )}
      </div>
      <div
        className={`${BRACKET_INNER_CARD_CLASS} flex min-h-0 flex-1 flex-col divide-y divide-[#2C2B29] ${
          isLive ? "border-[#FF4A3D] outline outline-1 outline-[#FF4A3D]" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
};
