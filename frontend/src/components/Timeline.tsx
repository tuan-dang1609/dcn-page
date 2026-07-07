import {
  TOURNAMENT_PAGE_TITLE_CLASS,
  TOURNAMENT_PANEL_CLASS,
} from "@/components/tournamentTheme";

type Milestone = {
  milestone_time?: string;
  title?: string;
  context?: string;
};

type TimelineProps = {
  tournament?: {
    milestones?: Milestone[];
  };
};

const formatDateTime = (value?: string) => {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
};

const Timeline = ({ tournament }: TimelineProps) => {
  const milestones = tournament?.milestones ?? [];

  return (
    <section className="space-y-4">
      <h2 className={TOURNAMENT_PAGE_TITLE_CLASS}>Tiến trình</h2>

      <div className={`overflow-hidden ${TOURNAMENT_PANEL_CLASS}`}>
        {!milestones.length ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            Chưa có mốc thời gian cho giải này.
          </p>
        ) : (
          <div className="divide-y divide-neutral-800">
            {milestones.map((event, index) => (
              <div
                key={`${event.title ?? "milestone"}-${index}`}
                className="flex gap-4 px-4 py-4"
              >
                <div className="flex w-8 shrink-0 flex-col items-center pt-0.5">
                  <span className="text-[11px] font-extrabold tabular-nums text-neutral-500">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {index < milestones.length - 1 ? (
                    <span className="mt-1 w-px flex-1 bg-neutral-700" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1 pb-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                    {formatDateTime(event.milestone_time)}
                  </p>
                  <h3 className="mt-1 text-sm font-bold text-white">
                    {event.title ?? "—"}
                  </h3>
                  {event.context ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
                      {event.context}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default Timeline;
