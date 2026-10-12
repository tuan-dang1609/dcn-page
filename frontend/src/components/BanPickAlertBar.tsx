import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { getMyBanPicks, type MyBanPickRoom } from "@/api/banpick";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Dải báo trên cùng mọi trang cho chủ đội có phòng ban/pick đang chờ / đang chạy:
 *   ● Ban/pick đang mở · WRO – NES · Bo3                 [Vào ngay]
 *   LƯỢT BẠN · Cấm 1 map · 0:21                          [Vào ngay]   (nền sáng)
 * Ẩn khi đang ở chính phòng đó. Kiểm tra 20 giây/lần, 4 giây/lần khi phòng đang chạy.
 */

const ACTION_VI = { ban: "Cấm 1 map", pick: "Chọn 1 map", side: "Chọn bên" } as const;

const formatClock = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

const samePath = (link: string, pathname: string, search: string) => {
  const [path, query = ""] = link.split("?");
  if (path !== pathname) return false;
  // /round/:slug?matchId= — so cả matchId
  const want = new URLSearchParams(query).get("matchId");
  return !want || new URLSearchParams(search).get("matchId") === want;
};

const BanPickAlertBar = () => {
  const { user, token } = useAuth();
  const location = useLocation();
  const [now, setNow] = useState(() => Date.now());

  const { data: rooms = [] } = useQuery({
    queryKey: ["my-ban-picks", user?.id],
    enabled: Boolean(user && token),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((room: MyBanPickRoom) => room.status === "running")
        ? 4000
        : 20000,
    refetchIntervalInBackground: false,
    queryFn: async () => (await getMyBanPicks(token!)).data?.data ?? [],
  });

  const visible = rooms.filter((room) => !samePath(room.link, location.pathname, location.search));
  const room =
    visible.find(
      (item) => item.status === "running" && item.current_action?.team === item.viewer_team_slot,
    ) ?? visible[0];
  const running = room?.status === "running";

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [running]);

  if (!room) return null;

  const myTurn = running && room.current_action?.team === room.viewer_team_slot;
  const offset = Date.parse(room.server_time) - Date.now();
  const remaining = room.turn_deadline_at
    ? Math.max(0, Math.ceil((Date.parse(room.turn_deadline_at) - (now + (Number.isFinite(offset) ? offset : 0))) / 1000))
    : null;
  const teams = `${room.team_a.name} – ${room.team_b.name}`;
  const myReady = room.viewer_team_slot ? room.ready?.[room.viewer_team_slot] : false;

  const label = myTurn
    ? `LƯỢT BẠN · ${room.current_action ? ACTION_VI[room.current_action.type] : ""}`
    : running
      ? `Ban/pick đang diễn ra · ${teams}`
      : myReady
        ? `Đã sẵn sàng · chờ đối thủ · ${teams}`
        : `Ban/pick đã mở · ${teams} · bấm Sẵn sàng`;

  return (
    <div
      className={
        myTurn
          ? "bg-[#F2F0EB] text-[#0B0B0B]"
          : "border-b border-[#2C2B29] bg-[#0B0B0B] text-[#F2F0EB]"
      }
      role="status"
    >
      <div className="mx-auto flex min-h-14 w-full max-w-[1440px] items-center gap-3 px-4 md:px-8">
        {!myTurn ? (
          <span className="h-2 w-2 shrink-0 bg-[#FF4A3D]" aria-hidden="true" />
        ) : null}
        <span className={`min-w-0 flex-1 truncate text-sm ${myTurn ? "font-extrabold" : "font-bold"}`}>
          {label}
          {!myTurn && room.format ? (
            <span className="font-normal text-[#9A9893]"> · {room.format.replace("BO", "Bo")}</span>
          ) : null}
        </span>
        {running && remaining !== null ? (
          <span
            className={`shrink-0 text-base font-extrabold tabular-nums ${
              remaining <= 5 ? "text-[#FF4A3D]" : ""
            }`}
          >
            {formatClock(remaining)}
          </span>
        ) : null}
        <Link
          to={room.link}
          className={`inline-flex min-h-11 shrink-0 items-center px-4 text-sm font-extrabold no-underline ${
            myTurn ? "bg-[#0B0B0B] text-[#F2F0EB]" : "bg-[#F2F0EB] text-[#0B0B0B]"
          }`}
        >
          Vào ngay
        </Link>
      </div>
    </div>
  );
};

export default BanPickAlertBar;
