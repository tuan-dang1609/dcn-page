import { useState } from "react";

const tabs = ["Tổng quan", "Nhánh đấu", "Người chơi", "BXH", "Luật"];

const TournamentTabs = ({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) => {
  return (
    <div className="flex justify-center gap-1 neo-box bg-card p-2">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`px-5 py-2.5 font-bold text-sm transition-all rounded-md ${
            activeTab === tab
              ? "bg-primary text-primary-foreground neo-box-sm"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
};

export default TournamentTabs;
