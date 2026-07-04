import { ExternalLink, Check } from "lucide-react";
import { Link } from "react-router-dom";

const Sidebar = ({ tournament, isLoading }) => {
  const profilePicture = tournament?.created_by?.profile_picture;
  const registeredCount = Number(tournament?.registered_count ?? 0);
  const maxParticipate = Number(tournament?.max_participate ?? 0);
  const requirement = tournament?.requirement ?? {};
  const rankMin = requirement?.rank_min ?? "--";
  const rankMax = requirement?.rank_max ?? "--";
  const progressPercent =
    maxParticipate > 0
      ? Math.min(100, Math.max(0, (registeredCount / maxParticipate) * 100))
      : 0;

  const prizeItems = Array.isArray(tournament?.prizes)
    ? tournament.prizes.map((item) => ({
        key: String(item?.id ?? item?.place_label ?? item?.place_order ?? ""),
        place: item?.place_label ?? "--",
        prize: String(item?.prize ?? item?.amount ?? "--"),
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Players */}
      <div className="rounded-lg bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Người chơi</h3>
          <Link to="participants">
            <button className=" font-bold text-sm hover:underline">
              XEM TẤT CẢ
            </button>
          </Link>
        </div>
        <div className="bg-background p-4 flex items-center gap-3">
          {/* Circular progress ring with centered avatar/check */}
          <div
            className="rounded-full"
            style={{
              padding: 3,
              background: `conic-gradient(hsl(var(--primary)) ${progressPercent}%, hsl(var(--muted)) ${progressPercent}% 100%)`,
            }}
          >
            <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-[#2b2b2b] flex items-center justify-center">
                <Check className="w-4 h-4 text-primary font-bold" />
              </div>
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
      <div className="rounded-lg bg-card p-5">
        <h3 className="text-xl font-heading mb-4">Yêu cầu</h3>
        <div className="space-y-0 divide-y-2 divide-border">
          <div className="flex justify-between py-3">
            <span className="text-muted-foreground">Mức rank</span>
            <span className="font-bold">
              {rankMin} → {rankMax}
            </span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-muted-foreground">Trường</span>
            <span className="font-bold">Tất cả</span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-muted-foreground">Thiết bị</span>
            <span className="font-bold">
              {Array.isArray(requirement?.device)
                ? requirement.device.join(", ")
                : (requirement?.device ?? "--")}
            </span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-muted-foreground">Vào Discord PN</span>
            <span className="font-bold text-success">
              {requirement?.discord ? "Có" : "Không"}
            </span>
          </div>
        </div>
      </div>

      {/* Social Info */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-lg font-bold mb-4">Thông tin</h3>
        <div className="space-y-0 divide-y divide-border">
          <div className="flex justify-between items-center py-3">
            <span className="text-muted-foreground text-sm">Facebook</span>
            <a
              href="#"
              className="font-semibold text-primary text-sm flex items-center gap-1 hover:underline"
            >
              Dong Chuyen Nghiep <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex justify-between items-center py-3">
            <span className="text-muted-foreground text-sm">Discord</span>
            <a
              href="#"
              className="font-semibold text-primary text-sm flex items-center gap-1 hover:underline"
            >
              THPT Phú Nhuận <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-lg font-bold mb-4">Giải thưởng</h3>
        <div className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">...</p>
          ) : prizeItems.length ? (
            prizeItems.map((item) => (
              <div
                key={item.key}
                className="bg-muted/30 border border-border rounded-lg p-3 flex justify-between items-center"
              >
                <span className="font-semibold text-sm">{item.place}</span>
                <span className="font-semibold text-primary text-sm">
                  {item.prize}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Chưa cập nhật giải thưởng
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
