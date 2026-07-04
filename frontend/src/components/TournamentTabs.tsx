import {
  TOURNAMENT_NAV_LINK_ACTIVE,
  TOURNAMENT_NAV_LINK_BASE,
  TOURNAMENT_NAV_LINK_INACTIVE,
  TOURNAMENT_NAV_WRAPPER_CLASS,
} from "@/components/tournamentTheme";

const tabs = ["Tổng quan", "Nhánh đấu", "Người chơi", "BXH", "Luật"];

const TournamentTabs = ({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
}) => {
  return (
    <div className={`flex justify-center gap-0 ${TOURNAMENT_NAV_WRAPPER_CLASS}`}>
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`${TOURNAMENT_NAV_LINK_BASE} ${
            activeTab === tab
              ? TOURNAMENT_NAV_LINK_ACTIVE
              : TOURNAMENT_NAV_LINK_INACTIVE
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
};

export default TournamentTabs;
