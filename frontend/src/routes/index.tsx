import { Suspense, lazy, type ReactNode } from "react";
import { useRoutes } from "react-router-dom";

const Layout = lazy(() => import("@/pages/tournaments/Index"));
const BracketPage = lazy(() => import("@/pages/tournaments/BracketPage"));
const PlayersPage = lazy(() => import("@/pages/tournaments/PlayersPage"));
const LeaderboardPage = lazy(
  () => import("@/pages/tournaments/LeaderboardPage"),
);
const RulePage = lazy(() => import("@/pages/tournaments/RulePage"));
const NotFound = lazy(() => import("@/pages/tournaments/NotFound"));

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center text-muted-foreground">
    Đang tải...
  </div>
);

const withSuspense = (element: ReactNode) => (
  <Suspense fallback={<PageFallback />}>{element}</Suspense>
);

export const Router = () => {
  const routes = useRoutes([
    {
      path: "/tournament/:game/:slug",
      element: withSuspense(<Layout />),
      children: [
        { path: "bracket", element: withSuspense(<BracketPage />) },
        { path: "bracket/:matchId", element: withSuspense(<BracketPage />) },
        { path: "players", element: withSuspense(<PlayersPage />) },
        { path: "leaderboard", element: withSuspense(<LeaderboardPage />) },
        { path: "rule", element: withSuspense(<RulePage />) },
      ],
    },
    { path: "*", element: withSuspense(<NotFound />) },
  ]);

  return routes;
};
