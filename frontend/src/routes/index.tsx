import { Suspense, lazy, type ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";

const Layout = lazy(() => import("@/pages/tournaments/Index"));
const BracketPage = lazy(() => import("@/pages/tournaments/BracketPage"));
const PlayersPage = lazy(() => import("@/pages/tournaments/PlayersPage"));
const LeaderboardPage = lazy(
  () => import("@/pages/tournaments/LeaderboardPage"),
);
const SeriesPage = lazy(() => import("@/pages/SeriesPage"));
const RulePage = lazy(() => import("@/pages/tournaments/RulePage"));
const NotFound = lazy(() => import("@/pages/tournaments/NotFound"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const SignupPage = lazy(() => import("@/pages/SignupPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const ScoreControlPage = lazy(() => import("@/pages/ScoreControlPage"));
const TournamentSetupPage = lazy(() => import("@/pages/TournamentSetupPage"));
const BracketSetupPage = lazy(() => import("@/pages/BracketSetupPage"));
const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center text-muted-foreground">
    Đang tải...
  </div>
);

const withSuspense = (element: ReactNode) => (
  <Suspense fallback={<PageFallback />}>{element}</Suspense>
);

const routes = [
  {
    path: "/tournament/:game/:slug",
    element: withSuspense(<Layout />),
    children: [
      { path: "bracket", element: withSuspense(<BracketPage />) },
      { path: "bracket/:matchId", element: withSuspense(<BracketPage />) },
      { path: "participants", element: withSuspense(<PlayersPage />) },
      { path: "leaderboard", element: withSuspense(<LeaderboardPage />) },
      { path: "rule", element: withSuspense(<RulePage />) },
    ],
  },
  {
    path: "/login",
    element: withSuspense(<LoginPage />),
  },
  {
    path: "/series/:slug",
    element: withSuspense(<SeriesPage />),
  },
  {
    path: "/register",
    element: withSuspense(<SignupPage />),
  },
  {
    path: "/profile",
    element: withSuspense(<ProfilePage />),
  },
  {
    path: "/ops/score-control",
    element: withSuspense(<ScoreControlPage />),
  },
  {
    path: "/ops/tournament-setup",
    element: withSuspense(<TournamentSetupPage />),
  },
  {
    path: "/ops/bracket-setup",
    element: withSuspense(<BracketSetupPage />),
  },
  { path: "*", element: withSuspense(<NotFound />) },
];

export const router = createBrowserRouter(routes);
