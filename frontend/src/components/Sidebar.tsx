import { ExternalLink } from "lucide-react";

const Sidebar = ({ tournament, isLoading }) => {
  const profilePicture = tournament?.created_by?.profile_picture;
  const registeredCount = Number(tournament?.registered_count ?? 0);
  const maxParticipate = Number(tournament?.max_participate ?? 0);
  const progressPercent =
    maxParticipate > 0
      ? Math.min(100, Math.max(0, (registeredCount / maxParticipate) * 100))
      : 0;

  return (
    <div className="space-y-6">
      {/* Players */}
      <div className="neo-box bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-heading">Người chơi</h3>
          <button className="text-secondary font-bold text-sm hover:underline">
            XEM TẤT CẢ
          </button>
        </div>
        <div className="neo-box-sm bg-background p-4 flex items-center gap-3">
          <div
            className="p-[2px] rounded-full"
            style={{
              background: `conic-gradient(hsl(var(--warning)) ${progressPercent}%, hsl(var(--muted)) ${progressPercent}% 100%)`,
            }}
          >
            <div className="w-9 h-9 rounded-full bg-card flex items-center justify-center">
              {profilePicture ? (
                <img
                  src={profilePicture}
                  alt="Player avatar"
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-foreground/20" />
              )}
            </div>
          </div>
          <span className="font-bold text-lg">
            {isLoading
              ? "..."
              : `${tournament?.registered_count ?? "--"} / ${tournament?.max_participate ?? "--"}`}
          </span>
        </div>
      </div>

      {/* Requirements */}
      <div className="neo-box bg-card p-5">
        <h3 className="text-xl font-heading mb-4">Yêu cầu</h3>
        <div className="space-y-0 divide-y-2 divide-border">
          <div className="flex justify-between py-3">
            <span className="text-muted-foreground">Mức rank</span>
            <span className="font-bold">
              {tournament?.requirement.rank_min} →{" "}
              {tournament?.requirement.rank_max}
            </span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-muted-foreground">Trường</span>
            <span className="font-bold">Tất cả</span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-muted-foreground">Thiết bị</span>
            <span className="font-bold">
              {Array.isArray(tournament?.requirement?.device)
                ? tournament!.requirement!.device.join(", ")
                : (tournament?.requirement?.device ?? "--")}
            </span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-muted-foreground">Vào Discord PN</span>
            <span className="font-bold text-success">
              {tournament?.requirement.discord ? "Có" : "Không"}
            </span>
          </div>
        </div>
      </div>

      {/* Social Info */}
      <div className="neo-box bg-card p-5">
        <h3 className="text-xl font-heading mb-4">Thông tin</h3>
        <div className="space-y-0 divide-y-2 divide-border">
          <div className="flex justify-between items-center py-3">
            <span className="text-muted-foreground">Facebook</span>
            <a
              href="#"
              className="font-bold text-secondary flex items-center gap-1 hover:underline"
            >
              Dong Chuyen Nghiep <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex justify-between items-center py-3">
            <span className="text-muted-foreground">Discord</span>
            <a
              href="#"
              className="font-bold text-accent flex items-center gap-1 hover:underline"
            >
              THPT Phú Nhuận <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Prizes */}
      <div className="neo-box bg-card p-5">
        <h3 className="text-xl font-heading mb-4">Giải thưởng</h3>
        <div className="space-y-3">
          {[
            { place: "🥇 1st", prize: "1 Slot GF", color: "bg-primary" },
            { place: "🥈 2nd", prize: "1 Slot GF", color: "bg-muted" },
            { place: "🥉 3rd", prize: "1 Slot GF", color: "bg-warning" },
            { place: "4th", prize: "1 Slot GF", color: "bg-card" },
          ].map((item) => (
            <div
              key={item.place}
              className={`${item.color} neo-box-sm p-3 flex justify-between items-center`}
            >
              <span className="font-bold">{item.place}</span>
              <span className="font-bold text-secondary">{item.prize}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
