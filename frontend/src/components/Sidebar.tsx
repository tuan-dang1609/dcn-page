import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import {
  TOURNAMENT_INFO_LABEL_CLASS,
  TOURNAMENT_INFO_ROW_CLASS,
  TOURNAMENT_INFO_VALUE_CLASS,
  TOURNAMENT_PANEL_CLASS,
  TOURNAMENT_PANEL_TITLE_CLASS,
} from "@/components/tournamentTheme";

type SidebarProps = {
  tournament?: {
    registered_count?: number;
    max_participate?: number;
    requirement?: {
      rank_min?: string;
      rank_max?: string;
      device?: string | string[];
      discord?: boolean;
    };
    prizes?: Array<{
      id?: number | string;
      place_label?: string;
      place_order?: number;
      prize?: string;
      amount?: string | number;
    }>;
  };
  isLoading?: boolean;
};

const Sidebar = ({ tournament, isLoading = false }: SidebarProps) => {
  const registeredCount = Number(tournament?.registered_count ?? 0);
  const maxParticipate = Number(tournament?.max_participate ?? 0);
  const requirement = tournament?.requirement ?? {};
  const rankLabel = (() => {
    const min = String(requirement?.rank_min ?? "").trim();
    const max = String(requirement?.rank_max ?? "").trim();
    if (!min || !max || min === "--" || max === "--") return "Tất cả rank";
    return `${min} → ${max}`;
  })();

  const progressPercent =
    maxParticipate > 0
      ? Math.min(100, Math.max(0, (registeredCount / maxParticipate) * 100))
      : 0;

  const prizeItems = Array.isArray(tournament?.prizes)
    ? tournament.prizes.map((item) => ({
        key: String(item?.id ?? item?.place_label ?? item?.place_order ?? ""),
        place: item?.place_label ?? "—",
        prize: String(item?.prize ?? item?.amount ?? "—"),
      }))
    : [];

  const deviceLabel = Array.isArray(requirement?.device)
    ? requirement.device.join(", ")
    : (requirement?.device ?? "—");

  return (
    <aside className="space-y-4">
      <div className={`overflow-hidden ${TOURNAMENT_PANEL_CLASS}`}>
        <div className="flex items-center justify-between gap-3 border-b border-neutral-700 bg-[#1a1a1a] px-4 py-3">
          <span className="text-xs font-extrabold uppercase tracking-widest text-neutral-400">
            Đăng ký
          </span>
          <Link
            to="participants"
            className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-300 transition-colors hover:text-white"
          >
            Xem danh sách
          </Link>
        </div>

        <div className="px-4 py-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-extrabold tabular-nums text-white">
                {isLoading
                  ? "…"
                  : `${tournament?.registered_count ?? "—"}`}
                <span className="text-base font-bold text-neutral-500">
                  {" "}
                  / {tournament?.max_participate ?? "—"}
                </span>
              </p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Đội đã đăng ký
              </p>
            </div>
            <span className="text-sm font-extrabold tabular-nums text-neutral-400">
              {isLoading ? "…" : `${Math.round(progressPercent)}%`}
            </span>
          </div>

          <div className="mt-3 h-1.5 w-full bg-neutral-800">
            <div
              className="h-full bg-neutral-400 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className={`overflow-hidden ${TOURNAMENT_PANEL_CLASS}`}>
        <div className={TOURNAMENT_PANEL_TITLE_CLASS}>Yêu cầu tham gia</div>
        <div>
          <div className={TOURNAMENT_INFO_ROW_CLASS}>
            <span className={TOURNAMENT_INFO_LABEL_CLASS}>Rank</span>
            <span className={TOURNAMENT_INFO_VALUE_CLASS}>{rankLabel}</span>
          </div>
          <div className={TOURNAMENT_INFO_ROW_CLASS}>
            <span className={TOURNAMENT_INFO_LABEL_CLASS}>Trường</span>
            <span className={TOURNAMENT_INFO_VALUE_CLASS}>Tất cả</span>
          </div>
          <div className={TOURNAMENT_INFO_ROW_CLASS}>
            <span className={TOURNAMENT_INFO_LABEL_CLASS}>Thiết bị</span>
            <span className={TOURNAMENT_INFO_VALUE_CLASS}>{deviceLabel}</span>
          </div>
          <div className={TOURNAMENT_INFO_ROW_CLASS}>
            <span className={TOURNAMENT_INFO_LABEL_CLASS}>Discord PN</span>
            <span
              className={`${TOURNAMENT_INFO_VALUE_CLASS} ${
                requirement?.discord ? "text-emerald-300" : "text-neutral-400"
              }`}
            >
              {requirement?.discord ? "Bắt buộc" : "Không"}
            </span>
          </div>
        </div>
      </div>

      <div className={`overflow-hidden ${TOURNAMENT_PANEL_CLASS}`}>
        <div className={TOURNAMENT_PANEL_TITLE_CLASS}>Giải thưởng</div>
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-neutral-500">Đang tải…</p>
        ) : prizeItems.length ? (
          <div>
            {prizeItems.map((item) => (
              <div key={item.key} className={TOURNAMENT_INFO_ROW_CLASS}>
                <span className="text-sm font-bold text-white">{item.place}</span>
                <span className="text-sm font-bold text-neutral-300">
                  {item.prize}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-neutral-500">
            Chưa cập nhật giải thưởng.
          </p>
        )}
      </div>

      <div className={`overflow-hidden ${TOURNAMENT_PANEL_CLASS}`}>
        <div className={TOURNAMENT_PANEL_TITLE_CLASS}>Liên hệ</div>
        <div>
          <div className={TOURNAMENT_INFO_ROW_CLASS}>
            <span className={TOURNAMENT_INFO_LABEL_CLASS}>Facebook</span>
            <a
              href="#"
              className={`${TOURNAMENT_INFO_VALUE_CLASS} inline-flex items-center gap-1 text-neutral-200 transition-colors hover:text-white`}
            >
              Dong Chuyen Nghiep
              <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
            </a>
          </div>
          <div className={TOURNAMENT_INFO_ROW_CLASS}>
            <span className={TOURNAMENT_INFO_LABEL_CLASS}>Discord</span>
            <a
              href="#"
              className={`${TOURNAMENT_INFO_VALUE_CLASS} inline-flex items-center gap-1 text-neutral-200 transition-colors hover:text-white`}
            >
              THPT Phú Nhuận
              <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
