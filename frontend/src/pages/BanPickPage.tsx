import { Link, useParams, useSearchParams } from "react-router-dom";
import PageLoader from "@/components/PageLoader";
import { PAGE_FRAME_CLASS } from "@/components/TournamentMasthead";
import BanPickBoard from "@/components/valorant/BanPickBoard";
import { useAuth } from "@/contexts/AuthContext";
import { useBanPickRoom } from "@/hooks/useBanPickRoom";

/**
 * Trang ban/pick độc lập (/round/:slug?matchId=) — link BTC gửi khi chưa có trang giải.
 * Trang trận Valorant (…/lobby/:id) dùng cùng BanPickBoard.
 */

const toNumber = (value?: string | null) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function BanPickPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const { user, token } = useAuth();

  const room = useBanPickRoom({
    roundSlug: String(slug ?? "").trim().toLowerCase() || undefined,
    matchId: toNumber(searchParams.get("matchId")),
    token,
  });
  const s = room.session;

  const teams = {
    team1: { name: s?.team_a.name ?? "Đội A", tag: s?.team_a.name ?? "Đội A" },
    team2: { name: s?.team_b.name ?? "Đội B", tag: s?.team_b.name ?? "Đội B" },
  };

  return (
    <div className="min-h-screen bg-background text-[#F2F0EB]">
      <header className={PAGE_FRAME_CLASS}>
        <div className="flex min-h-16 items-center justify-between gap-4 border-b border-[#F2F0EB]">
          <Link to="/" className="text-[17px] font-extrabold no-underline">
            Ban/pick
          </Link>
          {s ? (
            <span className="text-xs text-[#9A9893]">
              Valorant · {s.format.replace("BO", "Bo")} · {s.turn_time_limit_seconds}s mỗi lượt
            </span>
          ) : null}
        </div>
      </header>

      <main className={`${PAGE_FRAME_CLASS} pt-6`}>
        {room.isLoading && !s ? (
          <PageLoader label="Đang tải ban/pick..." fullScreen={false} />
        ) : room.notCreated ? (
          <p className="text-sm text-[#9A9893]">Trận này chưa được BTC tạo phòng ban/pick.</p>
        ) : room.error && !s ? (
          <p className="text-sm text-[#FF4A3D]">{room.error}</p>
        ) : s ? (
          <>
            <h1 className="m-0 border-b-2 border-[#F2F0EB] pb-3 text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] md:text-[56px]">
              {teams.team1.name} <span className="font-normal text-[#9A9893]">–</span>{" "}
              {teams.team2.name}
            </h1>
            <div className="mt-5">
              <BanPickBoard room={room} teams={teams} isLoggedIn={Boolean(user)} />
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
