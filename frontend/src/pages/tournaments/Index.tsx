import { useEffect } from "react";
import HeroBanner from "@/components/HeroBanner";
import Navigation from "@/components/Navigation";
import InfoGrid from "@/components/InfoGrid";
import Timeline from "@/components/Timeline";
import Sidebar from "@/components/Sidebar";
import PageLoader from "@/components/PageLoader";
import { useTournamentBySlug } from "@/hooks/useTournamentBySlug";
import { useTournamentPrefetch } from "@/hooks/useTournamentPrefetch";
import { TOURNAMENT_PAGE_BG_CLASS } from "@/components/tournamentTheme";
import { Outlet, useMatch, useLocation, useParams } from "react-router-dom";

const Layout = () => {
  const isTournamentHome = Boolean(useMatch("/tournament/:game/:slug"));
  const isMatchDetailPage = Boolean(
    useMatch("/tournament/:game/:slug/match/:id"),
  );
  const isLobbyPage = Boolean(useMatch("/tournament/:game/:slug/lobby/:id"));
  const isBracketPage = Boolean(useMatch("/tournament/:game/:slug/bracket"));
  const isParticipantsPage = Boolean(
    useMatch("/tournament/:game/:slug/participants"),
  );
  const isLeaderboardPage = Boolean(
    useMatch("/tournament/:game/:slug/leaderboard"),
  );
  const isRulePage = Boolean(useMatch("/tournament/:game/:slug/rule"));
  const { game, slug } = useParams();
  const { tournament, isLoading, error, refetch } = useTournamentBySlug(game, slug);
  useTournamentPrefetch(tournament?.id, tournament?.registered);
  const location = useLocation();

  const tournamentTitle = tournament?.name?.trim() || "Giải đấu";

  useEffect(() => {
    const pageTitle = isMatchDetailPage
      ? "Chi tiết trận đấu"
      : isLobbyPage
        ? "Sảnh chờ"
        : isBracketPage
          ? "Nhánh đấu"
          : isParticipantsPage
            ? "Thành viên"
            : isLeaderboardPage
              ? "Bảng xếp hạng"
              : isRulePage
                ? "Thể lệ"
                : "Trang chủ";

    document.title = `${tournamentTitle} | ${pageTitle}`;
  }, [
    tournamentTitle,
    isMatchDetailPage,
    isLobbyPage,
    isBracketPage,
    isParticipantsPage,
    isLeaderboardPage,
    isRulePage,
  ]);

  useEffect(() => {
    // Ensure we start at the top when navigating inside tournament pages
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (!isLoading && !tournament && error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-lg text-center space-y-3">
          <h1 className="text-2xl font-bold">Không tìm thấy giải đấu</h1>
          <p className="text-muted-foreground">
            URL: /tournament/{game}/{slug}
          </p>
          <p className="text-sm text-muted-foreground">
            Kiểm tra lại game slug và tournament slug trong database (bảng{" "}
            <code>games.short_name</code> và <code>tournaments.slug</code>).
          </p>
        </div>
      </div>
    );
  }

  if (isMatchDetailPage || isLobbyPage) {
    return (
      <div className="min-h-screen bg-background">
        <Outlet context={{ tournament, isLoading, refetch }} />
      </div>
    );
  }

  if (isTournamentHome && isLoading && !tournament) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="space-y-8">
        <HeroBanner tournament={tournament} />
        <div className="flex justify-center px-4 md:px-8">
          <div className="w-full max-w-4xl">
            <Navigation />
          </div>
        </div>
        <div className="px-4 md:px-8 pb-10">
          {isTournamentHome ? (
            <div
              className={`grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] lg:gap-8 ${TOURNAMENT_PAGE_BG_CLASS}`}
            >
              <div className="min-w-0 space-y-6">
                <InfoGrid tournament={tournament} isLoading={isLoading} />
                <Timeline tournament={tournament} />
              </div>
              <div className="min-w-0">
                <Sidebar tournament={tournament} isLoading={isLoading} />
              </div>
            </div>
          ) : (
            <div className={TOURNAMENT_PAGE_BG_CLASS}>
              <Outlet context={{ tournament, isLoading, refetch }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Layout;
