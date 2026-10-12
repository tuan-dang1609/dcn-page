import { useEffect } from "react";
import HeroBanner from "@/components/HeroBanner";
import Timeline from "@/components/Timeline";
import Sidebar from "@/components/Sidebar";
import PageLoader from "@/components/PageLoader";
import {
  PAGE_FRAME_CLASS,
  TournamentMasthead,
  TournamentPageIntro,
} from "@/components/TournamentMasthead";
import { useTournamentBySlug } from "@/hooks/useTournamentBySlug";
import {
  useTournamentPrefetch,
  type TournamentTab,
} from "@/hooks/useTournamentPrefetch";
import { TOURNAMENT_PAGE_BG_CLASS } from "@/components/tournamentTheme";
import { Outlet, useMatch, useLocation, useParams } from "react-router-dom";

const TAB_SUBTITLE: Record<TournamentTab, string> = {
  overview: "Tổng quan",
  participants: "Đội tham gia",
  bracket: "Nhánh đấu",
  leaderboard: "Xếp hạng",
  rule: "Luật thi đấu",
};

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
  const { tournament, isLoading, error, refetch } = useTournamentBySlug(
    game,
    slug,
  );

  const activeTab: TournamentTab = isBracketPage
    ? "bracket"
    : isParticipantsPage
      ? "participants"
      : isLeaderboardPage
        ? "leaderboard"
        : isRulePage
          ? "rule"
          : "overview";

  useTournamentPrefetch(tournament?.id, activeTab);
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
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (!isLoading && !tournament && error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-lg space-y-3 text-center">
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

  const masthead = (
    <TournamentMasthead name={tournament?.name} tournamentId={tournament?.id} />
  );

  if (isTournamentHome && isLoading && !tournament) {
    return (
      <div className="min-h-screen bg-background">
        {masthead}
        <PageLoader label="Đang tải giải đấu..." fullScreen={false} />
      </div>
    );
  }

  // Tổng quan: tiêu đề giải + thông tin + đăng ký, rồi lịch trình và cột thông tin.
  if (isTournamentHome) {
    return (
      <div className={`min-h-screen bg-background ${TOURNAMENT_PAGE_BG_CLASS}`}>
        {masthead}
        <HeroBanner tournament={tournament} />
        <div
          className={`${PAGE_FRAME_CLASS} grid grid-cols-1 gap-12 pb-20 pt-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-16`}
        >
          <Timeline tournament={tournament} />
          <Sidebar tournament={tournament} isLoading={isLoading} />
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background ${TOURNAMENT_PAGE_BG_CLASS}`}>
      {masthead}
      <TournamentPageIntro
        eyebrow={tournament?.game_name || tournament?.short_name}
        title={TAB_SUBTITLE[activeTab]}
        tournament={tournament}
        isLoading={isLoading}
      />
      <main className={`${PAGE_FRAME_CLASS} pb-16 pt-10`}>
        <Outlet context={{ tournament, isLoading, refetch }} />
      </main>
    </div>
  );
};

export default Layout;
