import { useState } from "react";
import SingleElimBracket from "@/components/BracketView";

const bracketTypes = [{ key: "single", label: "Single Elimination" }];

const BracketPage = () => {
  const [activeType, setActiveType] = useState("single");

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-heading">Nhánh đấu</h2>

      {/* Sub-tabs */}
      <div className="flex gap-2">
        {bracketTypes.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveType(t.key)}
            className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${
              activeType === t.key
                ? "bg-primary text-primary-foreground neo-box-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="neo-box bg-card p-6 overflow-x-auto">
        {activeType === "single" && <SingleElimBracket />}
      </div>
    </div>
  );
};

export default BracketPage;
