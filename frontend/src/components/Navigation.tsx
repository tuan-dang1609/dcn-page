import { NavLink, useParams, useNavigate, useLocation } from "react-router-dom";
import { useMemo } from "react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

const Navigation = () => {
  const { game, slug } = useParams();
  const basePath = game && slug ? `/tournament/${game}/${slug}` : "/tournament";

  const links = [
    { to: basePath, label: "Tổng quan" },
    { to: `${basePath}/bracket`, label: "Nhánh đấu" },
    { to: `${basePath}/participants`, label: "Người chơi" },
    { to: `${basePath}/leaderboard`, label: "BXH" },
    { to: `${basePath}/rule`, label: "Luật" },
  ];
  const navigate = useNavigate();
  const location = useLocation();

  // pick the most specific matching link for current pathname
  const selectedValue = useMemo(() => {
    const sorted = [...links].sort((a, b) => b.to.length - a.to.length);
    const found = sorted.find((l) => location.pathname.startsWith(l.to));
    return found ? found.to : basePath;
  }, [location.pathname, links, basePath]);

  return (
    <nav className="bg-card/50 backdrop-blur-sm border border-border rounded-lg">
      {/* Desktop / tablet: full nav */}
      <div className="hidden md:flex justify-center gap-1 p-1.5">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === basePath}
            className={({ isActive }) =>
              `px-5 py-2 font-semibold text-sm transition-all rounded-md ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>

      {/* Mobile: compact select for easy navigation */}
      <div className="md:hidden p-2">
        <Select value={selectedValue} onValueChange={(v) => navigate(v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Chọn mục" />
          </SelectTrigger>
          <SelectContent>
            {links.map((l) => (
              <SelectItem key={l.to} value={l.to}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </nav>
  );
};

export default Navigation;
