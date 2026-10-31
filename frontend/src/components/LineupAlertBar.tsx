import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { getMyPendingLineups } from "@/api/matchLineups";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Dải báo trên cùng mọi trang (cùng kiểu BanPickAlertBar) cho đội trưởng có trận sắp tới chưa chốt đội hình ra sân:
 *   ● Chốt đội hình ra sân · SMA – SMB · 21:00 15/10        [Chốt ngay]
 * Giai đoạn này kết thúc khi BTC mở phòng ban/pick (lúc đó dải ban/pick thay chỗ).
 * Ẩn khi đang ở chính trang trận đó. Kiểm tra 60 giây/lần.
 */

const formatTime = (value: string) =>
  new Date(value).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

const LineupAlertBar = () => {
  const { user, token } = useAuth();
  const location = useLocation();

  const { data: pending = [] } = useQuery({
    queryKey: ["my-pending-lineups", user?.id],
    enabled: Boolean(user && token),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    queryFn: async () => (await getMyPendingLineups(token!)).data?.data ?? [],
  });

  const item = pending.find((entry) => entry.link !== location.pathname);
  if (!item) return null;

  return (
    <div className="border-b border-[#2C2B29] bg-[#0B0B0B] text-[#F2F0EB]" role="status">
      <div className="mx-auto flex min-h-14 w-full max-w-[1440px] items-center gap-3 px-4 md:px-8">
        <span className="h-2 w-2 shrink-0 bg-[#FF4A3D]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm font-bold">
          Chốt đội hình ra sân · {item.team_a.tag || item.team_a.name} – {item.team_b.tag || item.team_b.name}
          <span className="font-normal text-[#9A9893]"> · hạn {formatTime(item.closes_at ?? item.date_scheduled)}</span>
        </span>
        <Link
          to={item.link}
          className="inline-flex min-h-11 shrink-0 items-center bg-[#F2F0EB] px-4 text-sm font-extrabold text-[#0B0B0B] no-underline"
        >
          Chốt ngay
        </Link>
      </div>
    </div>
  );
};

export default LineupAlertBar;
