import { CheckCircle2 } from "lucide-react";

const Timeline = ({ tournament }) => {
  const formatDateTime = (value?: string) => {
    if (!value) return "--";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";

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

  return (
    <div>
      <h2 className="text-2xl mb-6 font-bold">Tiến Trình</h2>
      <div className="space-y-0">
        {tournament?.milestones.map((event, index) => (
          <div key={index} className="relative flex gap-4">
            <div className="flex flex-col items-center">
              <div className="bg-primary/10 border border-primary/30 rounded-full p-0.5 z-10">
                <CheckCircle2 className="w-5 h-5 text-primary" />
              </div>
              {index < tournament?.milestones.length - 1 && (
                <div className="w-px bg-border flex-1 min-h-[40px]" />
              )}
            </div>
            <div className="pb-6 flex-1">
              <p className="text-xs text-muted-foreground mb-1">{formatDateTime(event.milestone_time)}</p>
              <h3 className="font-semibold text-base">{event.title}</h3>
              {event.context && (
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{event.context}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;
