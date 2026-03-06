import HeroBanner from "@/components/HeroBanner";
import Navigation from "@/components/Navigation";
import InfoGrid from "@/components/InfoGrid";
import Timeline from "@/components/Timeline";
import Sidebar from "@/components/Sidebar";
import { useTournamentBySlug } from "@/hooks/useTournamentBySlug";
import { Outlet, useMatch } from "react-router-dom";
import { useParams } from "react-router-dom";

const Layout = () => {
  const isTournamentHome = Boolean(useMatch("/tournament/:game/:slug"));
  const { game, slug } = useParams();
  const { tournament, isLoading } = useTournamentBySlug(game, slug);

  return (
    <div className="min-h-screen bg-background">
      <div className="space-y-8">
        <HeroBanner tournament={tournament} />
        <div className="px-4 md:px-8">
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
            <Outlet context={{ tournament, isLoading }} />
          )}
        </div>
      </div>
    </div>
  );
};

export default Layout;
