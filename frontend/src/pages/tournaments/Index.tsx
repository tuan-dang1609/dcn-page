import { useEffect } from "react";
import HeroBanner from "@/components/HeroBanner";
import Navigation from "@/components/Navigation";
import InfoGrid from "@/components/InfoGrid";
import Timeline from "@/components/Timeline";
import Sidebar from "@/components/Sidebar";
import { useTournamentBySlug } from "@/hooks/useTournamentBySlug";
import { Outlet, useMatch, useLocation, useParams } from "react-router-dom";

const Layout = () => {
  const isTournamentHome = Boolean(useMatch("/tournament/:game/:slug"));
  const isMatchDetailPage = Boolean(
    useMatch("/tournament/:game/:slug/match/:id"),
  );
  const { game, slug } = useParams();
  const { tournament, isLoading, refetch } = useTournamentBySlug(game, slug);
  const location = useLocation();

  useEffect(() => {
    // Ensure we start at the top when navigating inside tournament pages
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (isMatchDetailPage) {
    return (
      <div className="min-h-screen bg-background">
        <Outlet context={{ tournament, isLoading, refetch }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="space-y-8">
        <HeroBanner tournament={tournament} />
        <div className="px-4 md:px-8 mb-10">
          <Navigation />
        </div>
        <div className="px-4 md:px-8">
          {isTournamentHome ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <InfoGrid tournament={tournament} isLoading={isLoading} />
                <Timeline tournament={tournament} />
              </div>
              <div>
                <Sidebar tournament={tournament} isLoading={isLoading} />
              </div>
            </div>
          ) : (
            <Outlet context={{ tournament, isLoading, refetch }} />
          )}
        </div>
      </div>
    </div>
  );
};

export default Layout;
