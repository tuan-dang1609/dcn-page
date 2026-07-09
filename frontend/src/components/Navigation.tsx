import { NavLink, useParams, useNavigate, useLocation } from "react-router-dom";
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  prefetchTournamentTab,
  type TournamentTab,
} from "@/hooks/useTournamentPrefetch";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  TOURNAMENT_NAV_LINK_ACTIVE,
  TOURNAMENT_NAV_LINK_BASE,
  TOURNAMENT_NAV_LINK_INACTIVE,
  TOURNAMENT_NAV_WRAPPER_CLASS,
} from "@/components/tournamentTheme";

interface NavigationProps {
  tournamentId?: number | string | null;
}

const Navigation = ({ tournamentId }: NavigationProps) => {
  const { game, slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const basePath = game && slug ? `/tournament/${game}/${slug}` : "/tournament";

  const links = useMemo(
    () =>
      [
        { to: basePath, label: "Tổng quan", tab: "overview" as const },
        {
          to: `${basePath}/participants`,
          label: "Danh sách",
          tab: "participants" as const,
        },
        {
          to: `${basePath}/bracket`,
          label: "Nhánh đấu",
          tab: "bracket" as const,
        },
        {
          to: `${basePath}/leaderboard`,
          label: "BXH",
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

  const selectedValue = useMemo(() => {
    const sorted = [...links].sort((a, b) => b.to.length - a.to.length);
    const found = sorted.find((link) => location.pathname.startsWith(link.to));
    return found ? found.to : basePath;
  }, [location.pathname, links, basePath]);

  const activeLabel =
    links.find((link) => link.to === selectedValue)?.label ?? "Tổng quan";

  return (
    <nav className={TOURNAMENT_NAV_WRAPPER_CLASS}>
      <div className="p-2 md:hidden">
        <Select value={selectedValue} onValueChange={(value) => navigate(value)}>
          <SelectTrigger className="h-10 w-full border-neutral-600 bg-[#1a1a1a] text-xs font-extrabold uppercase tracking-wide text-white">
            <SelectValue placeholder={activeLabel}>{activeLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {links.map((link) => (
              <SelectItem
                key={link.to}
                value={link.to}
                className="text-xs font-bold uppercase tracking-wide"
                onFocus={() => handlePrefetch(link.tab)}
              >
                {link.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden w-full md:flex">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === basePath}
            onMouseEnter={() => handlePrefetch(link.tab)}
            onFocus={() => handlePrefetch(link.tab)}
            className={({ isActive }) =>
              `${TOURNAMENT_NAV_LINK_BASE} ${
                isActive
                  ? TOURNAMENT_NAV_LINK_ACTIVE
                  : TOURNAMENT_NAV_LINK_INACTIVE
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default Navigation;
