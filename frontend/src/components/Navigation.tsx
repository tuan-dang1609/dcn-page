import { NavLink, useParams } from "react-router-dom";
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  prefetchTournamentTab,
  type TournamentTab,
} from "@/hooks/useTournamentPrefetch";

interface NavigationProps {
  tournamentId?: number | string | null;
  className?: string;
}

/**
 * Liên kết chữ trên đầu trang (design/Main.dc.html): mục đang xem gạch chân dày,
 * không khung, không nền. Trên mobile là một dải cuộn ngang, mỗi mục cao 44px.
 */
const Navigation = ({ tournamentId, className = "" }: NavigationProps) => {
  const { game, slug } = useParams();
  const queryClient = useQueryClient();
  const basePath = game && slug ? `/tournament/${game}/${slug}` : "/tournament";

  const links = useMemo(
    () =>
      [
        { to: basePath, label: "Tổng quan", tab: "overview" as const },
        { to: `${basePath}/bracket`, label: "Nhánh đấu", tab: "bracket" as const },
        {
          to: `${basePath}/participants`,
          label: "Đội tham gia",
          tab: "participants" as const,
        },
        {
          to: `${basePath}/leaderboard`,
          label: "Xếp hạng",
          tab: "leaderboard" as const,
        },
        { to: `${basePath}/rule`, label: "Luật", tab: "rule" as const },
      ] as const,
    [basePath],
  );

  const handlePrefetch = (tab: TournamentTab) => {
    if (!tournamentId) return;
    prefetchTournamentTab(queryClient, tournamentId, tab);
  };

  return (
    <nav
      aria-label="Mục giải đấu"
      className={`flex gap-6 overflow-x-auto text-sm md:gap-8 ${className}`}
    >
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === basePath}
          onMouseEnter={() => handlePrefetch(link.tab)}
          onFocus={() => handlePrefetch(link.tab)}
          className={({ isActive }) =>
            `flex min-h-11 shrink-0 items-center whitespace-nowrap underline-offset-[6px] ${
              isActive
                ? "font-semibold underline decoration-2"
                : "no-underline hover:underline hover:decoration-1"
            }`
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
};

export default Navigation;
