import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { getMyLolCodes } from "@/api/lolTournament";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Dải báo trên cùng (cùng kiểu BanPickAlertBar) khi trận LMHT tôi thi đấu / quản lý đã có mã phòng:
 *   ● Mã phòng LMHT · SMA – SMB · Ván 1        [Lấy mã]
 * Ẩn khi đang ở chính trang trận đó. Kiểm tra 60 giây/lần.
 */
const LolCodeAlertBar = () => {
  const { user, token } = useAuth();
  const location = useLocation();

  const { data: codes = [] } = useQuery({
    queryKey: ["my-lol-codes", user?.id],
    enabled: Boolean(user && token),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    queryFn: async () => (await getMyLolCodes(token!)).data?.data ?? [],
  });

  const item = codes.find((entry) => entry.link !== location.pathname);
  if (!item) return null;

  return (
    <div className="border-b border-[#2C2B29] bg-[#0B0B0B] text-[#F2F0EB]" role="status">
      <div className="mx-auto flex min-h-14 w-full max-w-[1440px] items-center gap-3 px-4 md:px-8">
        <span className="h-2 w-2 shrink-0 bg-[#FF4A3D]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm font-bold">
          Mã phòng LMHT · {item.team_a.tag || item.team_a.name} – {item.team_b.tag || item.team_b.name}
          <span className="font-normal text-[#9A9893]"> · Ván {item.game_no}</span>
        </span>
        <Link
          to={item.link}
          className="inline-flex min-h-11 shrink-0 items-center bg-[#F2F0EB] px-4 text-sm font-extrabold text-[#0B0B0B] no-underline"
        >
          Lấy mã
        </Link>
      </div>
    </div>
  );
};

export default LolCodeAlertBar;
