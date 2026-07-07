import { NavLink, useParams, useNavigate, useLocation } from "react-router-dom";
import { useMemo } from "react";
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

const Navigation = () => {
  const { game, slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = game && slug ? `/tournament/${game}/${slug}` : "/tournament";

  const links = useMemo(
    () => [
      { to: basePath, label: "Tổng quan" },
      { to: `${basePath}/bracket`, label: "Nhánh đấu" },
      { to: `${basePath}/participants`, label: "Danh sách" },
      { to: `${basePath}/leaderboard`, label: "BXH" },
      { to: `${basePath}/rule`, label: "Luật" },
    ],
    [basePath],
  );

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
