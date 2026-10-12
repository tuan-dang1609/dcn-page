import { formatShortDateTime } from "@/lib/tournamentFormat";

type Milestone = {
  milestone_time?: string;
  title?: string;
  context?: string;
};

type TimelineProps = {
  tournament?: {
    milestones?: Milestone[];
  } | null;
};

const timeOf = (value?: string) => {
  const time = new Date(String(value ?? "")).getTime();
  return Number.isFinite(time) ? time : null;
};

/**
 * Lịch trình dạng bảng in: cột ngày giờ bên trái, nội dung bên phải.
 * Mốc đã qua chữ xám; mốc kế tiếp có nhãn "Tiếp theo" màu nhấn.
 */
const Timeline = ({ tournament }: TimelineProps) => {
  const milestones = tournament?.milestones ?? [];
  const now = Date.now();
  const nextIndex = milestones.findIndex((event) => {
    const time = timeOf(event.milestone_time);
    return time !== null && time >= now;
  });

  return (
    <section>
      <h2 className="m-0 text-[22px] font-extrabold leading-[1.3] tracking-[-0.01em]">
        Lịch trình
      </h2>

      {!milestones.length ? (
        <p className="mt-3 border-t-2 border-[#F2F0EB] py-4 text-sm text-[#9A9893]">
          Ban tổ chức chưa công bố lịch trình.
        </p>
      ) : (
        <ol className="m-0 mt-3 list-none border-t-2 border-[#F2F0EB] p-0">
          {milestones.map((event, index) => {
            const time = timeOf(event.milestone_time);
            const isPast = time !== null && time < now;
            const isNext = index === nextIndex;

            return (
              <li
                key={`${event.title ?? "milestone"}-${index}`}
                className="grid grid-cols-[112px_minmax(0,1fr)] gap-4 border-b border-[#2C2B29] py-3 md:grid-cols-[176px_minmax(0,1fr)] md:gap-6"
              >
                <time
                  dateTime={event.milestone_time}
                  className="pt-px text-[13px] tabular-nums text-[#9A9893]"
                >
                  {formatShortDateTime(event.milestone_time)}
                </time>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <h3
                      className={`m-0 text-[15px] font-bold leading-snug ${
                        isPast ? "text-[#9A9893]" : ""
                      }`}
                    >
                      {event.title ?? "—"}
                    </h3>
                    {isNext ? (
                      <span className="text-xs font-bold tracking-[0.04em] text-[#FF4A3D]">
                        TIẾP THEO
                      </span>
                    ) : null}
                  </div>
                  {event.context ? (
                    <p className="m-0 mt-1 text-[13px] leading-relaxed text-[#9A9893]">
                      {event.context}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};

export default Timeline;
