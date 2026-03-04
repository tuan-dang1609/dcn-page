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
    <nav className="flex justify-center gap-1 neo-box bg-card p-2">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.label === "Tổng quan"}
          className={({ isActive }) =>
            `px-5 py-2.5 font-bold text-sm transition-all rounded-md ${
              isActive
                ? "bg-primary text-primary-foreground neo-box-sm"
                : "text-muted-foreground hover:bg-muted"
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
