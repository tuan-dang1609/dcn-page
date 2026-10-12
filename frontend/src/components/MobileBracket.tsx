import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Nhánh đấu trên mobile (< 768px): thay canvas kéo ngang bằng
 *   [Nhánh thắng | Nhánh thua | Chung kết]   ← chỉ khi có nhiều nhánh
 *   [Tứ kết] [Bán kết] [Chung kết] …         ← vòng, cuộn ngang
 *   danh sách trận của vòng, thẻ giãn hết chiều ngang
 * Mặc định mở vòng đang diễn ra (vòng đầu tiên còn trận chưa xong).
 */

export type MobileBracketGroup<T> = {
  key: string;
  /** Tiêu đề nhóm trong vòng (Swiss: "1-0", "0-1"…). */
  label?: string;
  aside?: ReactNode;
  matches: T[];
};

export type MobileBracketRound<T> = {
  key: string;
  /** Nhánh (Nhánh thắng / Nhánh thua / Chung kết) — để trống nếu nhánh đơn. */
  section?: string;
  title: string;
  /** Tên đầy đủ cho nút vòng trước/sau (tab dùng tên ngắn). */
  fullTitle?: string;
  meta?: string;
  groups: MobileBracketGroup<T>[];
};

type Props<T> = {
  rounds: MobileBracketRound<T>[];
  renderMatch: (match: T, round: MobileBracketRound<T>) => ReactNode;
  getMatchKey: (match: T) => string | number;
  /** Trận đã xong → để chọn vòng mặc định. */
  isMatchDone: (match: T) => boolean;
  /** Nội dung thêm dưới danh sách (Swiss: đội lọt vào / bị loại). */
  footer?: ReactNode;
};

const TAB_BASE =
  "flex min-h-11 shrink-0 items-center whitespace-nowrap px-3.5 text-sm font-bold";
const TAB_ON = "bg-[#F2F0EB] text-[#0B0B0B]";
const TAB_OFF = "border border-[#2C2B29] text-[#F2F0EB]";

const MobileBracket = <T,>({ rounds, renderMatch, getMatchKey, isMatchDone, footer }: Props<T>) => {
  const sections = useMemo(
    () => Array.from(new Set(rounds.map((round) => round.section).filter(Boolean))) as string[],
    [rounds],
  );

  const defaultKey = useMemo(() => {
    const current = rounds.find((round) =>
      round.groups.some((group) => group.matches.some((match) => !isMatchDone(match))),
    );
    return (current ?? rounds[rounds.length - 1])?.key ?? "";
  }, [rounds, isMatchDone]);

  const [selectedKey, setSelectedKey] = useState(defaultKey);
  const selected = rounds.find((round) => round.key === selectedKey) ?? rounds[0];

  // Dữ liệu đổi (đổi bracket) mà vòng đang chọn không còn → về vòng mặc định
  useEffect(() => {
    if (!rounds.some((round) => round.key === selectedKey)) setSelectedKey(defaultKey);
  }, [defaultKey, rounds, selectedKey]);

  const activeSection = selected?.section;
  const visibleRounds = sections.length > 1
    ? rounds.filter((round) => round.section === activeSection)
    : rounds;

  // Giữ tab vòng đang chọn trong tầm nhìn
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    tabRefs.current.get(selected?.key ?? "")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected?.key]);

  if (!selected) return null;

  const index = rounds.indexOf(selected);
  const prev = rounds[index - 1];
  const next = rounds[index + 1];

  return (
    <div className="text-[#F2F0EB]">
      {sections.length > 1 ? (
        <div className="grid border border-[#2C2B29]" style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}>
          {sections.map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => {
                const first =
                  rounds.find(
                    (round) =>
                      round.section === section &&
                      round.groups.some((group) => group.matches.some((match) => !isMatchDone(match))),
                  ) ?? rounds.filter((round) => round.section === section).at(-1);
                if (first) setSelectedKey(first.key);
              }}
              className={`min-h-11 truncate px-2 text-sm font-bold ${
                section === activeSection ? TAB_ON : "text-[#F2F0EB]"
              }`}
            >
              {section}
            </button>
          ))}
        </div>
      ) : null}

      <div className="-mx-4 mt-2 flex gap-1 overflow-x-auto px-4 pb-1">
        {visibleRounds.map((round) => (
          <button
            key={round.key}
            ref={(node) => {
              if (node) tabRefs.current.set(round.key, node);
              else tabRefs.current.delete(round.key);
            }}
            type="button"
            onClick={() => setSelectedKey(round.key)}
            className={`${TAB_BASE} ${round.key === selected.key ? TAB_ON : TAB_OFF}`}
          >
            {round.title}
          </button>
        ))}
      </div>

      <div className="mt-4 border-t-2 border-[#F2F0EB] pt-2">
        <div className="text-[15px] font-extrabold">
          {selected.section && sections.length > 1 ? `${selected.section} · ` : ""}
          {selected.title}
        </div>
        {selected.meta ? <div className="text-[13px] text-[#9A9893]">{selected.meta}</div> : null}
      </div>

      <div className="mt-3 grid gap-5">
        {selected.groups.map((group) => (
          <div key={group.key}>
            {group.label ? (
              <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-[#9A9893]">
                <span>{group.label}</span>
                {group.aside}
              </div>
            ) : null}
            <div className="grid gap-3">
              {group.matches.map((match) => (
                <div key={getMatchKey(match)}>{renderMatch(match, selected)}</div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {prev || next ? (
        <div className="mt-6 grid grid-cols-2 gap-2">
          {prev ? (
            <button
              type="button"
              onClick={() => setSelectedKey(prev.key)}
              className={`${TAB_BASE} ${TAB_OFF} justify-start truncate`}
            >
              ← {prev.fullTitle ?? prev.title}
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button
              type="button"
              onClick={() => setSelectedKey(next.key)}
              className={`${TAB_BASE} ${TAB_OFF} justify-end truncate`}
            >
              {next.fullTitle ?? next.title} →
            </button>
          ) : null}
        </div>
      ) : null}

      {footer ? <div className="mt-8">{footer}</div> : null}
    </div>
  );
};

export default MobileBracket;
