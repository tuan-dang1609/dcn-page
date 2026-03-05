import { NavLink, useParams } from "react-router-dom";

const Navigation = () => {
  const { game, slug } = useParams();
  const basePath = game && slug ? `/tournament/${game}/${slug}` : "/tournament";

  const links = [
    { to: basePath, label: "Tổng quan" },
    { to: `${basePath}/bracket`, label: "Nhánh đấu" },
    { to: `${basePath}/players`, label: "Người chơi" },
    { to: `${basePath}/leaderboard`, label: "BXH" },
    { to: `${basePath}/rule`, label: "Luật" },
  ];

  return (
    <nav className="flex justify-center gap-1 bg-card/50 backdrop-blur-sm border border-border rounded-lg p-1.5">
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
    </nav>
  );
};

export default Navigation;
