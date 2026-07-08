import { Suspense, lazy, useEffect, type ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";
import PageLoader from "@/components/PageLoader";

const BRAND_TITLE = "DCN Championship Series";

const DocumentTitle = ({ title }: { title: string }) => {
  useEffect(() => {
    document.title = `${title} | ${BRAND_TITLE}`;
  }, [title]);

  return null;
};

const Layout = lazy(() => import("@/pages/tournaments/Index"));
const BracketPage = lazy(() => import("@/pages/tournaments/BracketPage"));
const PlayersPage = lazy(() => import("@/pages/tournaments/PlayersPage"));
const LeaderboardPage = lazy(
  () => import("@/pages/tournaments/LeaderboardPage"),
);
const SeriesPage = lazy(() => import("@/pages/SeriesPage"));
const SeriesPickemPage = lazy(() => import("@/pages/SeriesPickemPage"));
const RulePage = lazy(() => import("@/pages/tournaments/RulePage"));
const NotFound = lazy(() => import("@/pages/tournaments/NotFound"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const SignupPage = lazy(() => import("@/pages/SignupPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const ScoreControlPage = lazy(() => import("@/pages/ScoreControlPage"));
const AovStatsImportPage = lazy(() => import("@/pages/AovStatsImportPage"));
const TournamentSetupPage = lazy(() => import("@/pages/TournamentSetupPage"));
const BracketSetupPage = lazy(() => import("@/pages/BracketSetupPage"));
const MatchDetailPage = lazy(() => import("@/pages/MatchDetailPage"));
const BanPickPage = lazy(() => import("@/pages/BanPickPage"));
const withSuspense = (element: ReactNode) => (
  <Suspense fallback={<PageLoader />}>{element}</Suspense>
);

const withTitle = (element: ReactNode, title: string) => (
  <>
    <DocumentTitle title={title} />
    {element}
  </>
);

const routes = [
  {
    path: "/tournament/:game/:slug",
    element: withSuspense(<Layout />),
    children: [
      { path: "bracket", element: withSuspense(<BracketPage />) },
      { path: "participants", element: withSuspense(<PlayersPage />) },
      { path: "leaderboard", element: withSuspense(<LeaderboardPage />) },
      { path: "rule", element: withSuspense(<RulePage />) },
      { path: "lobby/:id", element: withSuspense(<MatchDetailPage />) },
      { path: "match/:id", element: withSuspense(<MatchDetailPage />) },
    ],
  },
  {
    path: "/login",
    element: withTitle(withSuspense(<LoginPage />), "Đăng nhập"),
  },
  {
    path: "/series/:slug",
    element: withTitle(withSuspense(<SeriesPage />), "Series"),
  },
  {
    path: "/series/:slug/pickem",
    element: withTitle(withSuspense(<SeriesPickemPage />), "Pickem"),
  },
  {
    path: "/round/:slug",
    element: withTitle(withSuspense(<BanPickPage />), "Ban Pick"),
  },
  {
    path: "/register",
    element: withTitle(withSuspense(<SignupPage />), "Đăng ký"),
  },
  {
    path: "/profile",
    element: withTitle(withSuspense(<ProfilePage />), "Hồ sơ"),
  },
  {
    path: "/ops/score-control",
    element: withTitle(withSuspense(<ScoreControlPage />), "Điều khiển điểm"),
  },
  {
    path: "/ops/aov-import",
    element: withTitle(withSuspense(<AovStatsImportPage />), "Tạo match_id AOV"),
  },
  {
    path: "/ops/tournament-setup",
    element: withTitle(withSuspense(<TournamentSetupPage />), "Thiết lập giải"),
  },
  {
    path: "/ops/bracket-setup",
    element: withTitle(withSuspense(<BracketSetupPage />), "Thiết lập bracket"),
  },
  { path: "*", element: withTitle(withSuspense(<NotFound />), "404") },
];

export const router = createBrowserRouter(routes);
