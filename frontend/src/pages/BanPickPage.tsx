import { useState } from "react";
import { useBanPick } from "@/hooks/useBanPick";
import { MapCard } from "@/components/MapCard";
import { SideSelectModal } from "@/components/SideSelectModal";
import { GameFormat, VALORANT_MAPS } from "@/data/maps";
import { RotateCcw } from "lucide-react";

const FORMAT_OPTIONS: { value: GameFormat; label: string }[] = [
  { value: "BO1", label: "BO1" },
  { value: "BO3", label: "BO3" },
  { value: "BO5", label: "BO5" },
];

export default function BanPickPage() {
  const [team1, setTeam1] = useState("TEAM A");
  const [team2, setTeam2] = useState("TEAM B");
  const [format, setFormat] = useState<GameFormat>("BO3");
  const [started, setStarted] = useState(false);

  const banPick = useBanPick(team1, team2, format);

  // Find map name for side select
  const sideSelectMap = banPick.sideSelectMapId
    ? VALORANT_MAPS.find((m) => m.id === banPick.sideSelectMapId)
    : null;
  const sideSelectTeamName = banPick.sideSelectTeam
    ? banPick.teamNames[banPick.sideSelectTeam]
    : "";

  if (!started) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-8">
          <div className="text-center space-y-2">
            <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground">
              VALORANT
            </h1>
            <p className="font-display text-xl text-primary tracking-widest">
              MAP BAN / PICK
            </p>
          </div>

          {/* Format selector */}
          <div className="space-y-2">
            <label className="font-display text-sm text-muted-foreground tracking-wider">
              FORMAT
            </label>
            <div className="grid grid-cols-3 gap-2">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value)}
                  className={`py-3 font-display text-lg tracking-widest border-2 transition-all
                    ${
                      format === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                    }
                  `}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="font-display text-sm text-muted-foreground tracking-wider">
                TEAM 1
              </label>
              <input
                value={team1}
                onChange={(e) => setTeam1(e.target.value.toUpperCase())}
                className="w-full bg-card border-2 border-border p-3 font-display text-lg text-foreground
                  focus:outline-none focus:border-primary transition-colors uppercase tracking-wider"
              />
            </div>
            <div className="text-center font-display text-2xl text-muted-foreground">
              VS
            </div>
            <div className="space-y-2">
              <label className="font-display text-sm text-muted-foreground tracking-wider">
                TEAM 2
              </label>
              <input
                value={team2}
                onChange={(e) => setTeam2(e.target.value.toUpperCase())}
                className="w-full bg-card border-2 border-border p-3 font-display text-lg text-foreground
                  focus:outline-none focus:border-primary transition-colors uppercase tracking-wider"
              />
            </div>
          </div>

          <button
            onClick={() => setStarted(true)}
            className="w-full bg-primary text-primary-foreground font-display text-xl py-4 
              tracking-widest hover:brightness-110 active:scale-[0.98] transition-all"
          >
            START BAN/PICK
          </button>
        </div>
      </div>
    );
  }

  const isComplete = banPick.phase === "complete";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b-2 border-border px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h2 className="font-display text-xl md:text-2xl font-bold text-foreground">
            {banPick.teamNames.team1}
          </h2>
          <div className="text-center flex flex-col items-center">
            <span className="font-display text-xs text-muted-foreground tracking-wider">
              {format}
            </span>
            <span className="font-display text-sm text-muted-foreground tracking-wider">
              VS
            </span>
          </div>
          <h2 className="font-display text-xl md:text-2xl font-bold text-foreground">
            {banPick.teamNames.team2}
          </h2>
        </div>
      </header>

      {/* Phase indicator */}
      <div className="border-b border-border px-4 py-3">
        <div className="max-w-5xl mx-auto text-center">
          {isComplete ? (
            <span className="font-display text-lg text-primary tracking-widest">
              BAN/PICK HOÀN TẤT
            </span>
          ) : banPick.phase === "side_select" ? (
            <span className="font-display text-lg tracking-widest text-amber-400 phase-pulse">
              {banPick.currentActionLabel}
            </span>
          ) : (
            <span
              className={`font-display text-lg tracking-widest phase-pulse ${
                banPick.currentAction?.type === "ban"
                  ? "text-destructive"
                  : "text-primary"
              }`}
            >
              {banPick.currentActionLabel}
            </span>
          )}
        </div>
      </div>

      {/* Map grid */}
      <main className="flex-1 px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {banPick.maps.map((mapState) => (
              <MapCard
                key={mapState.mapId}
                mapState={mapState}
                isSelected={banPick.selectedMapId === mapState.mapId}
                onSelect={banPick.selectMap}
                disabled={banPick.phase !== "ban_pick"}
                teamNames={banPick.teamNames}
              />
            ))}
          </div>
        </div>
      </main>

      {/* Action bar */}
      <footer className="sticky bottom-0 border-t-2 border-border bg-background px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <button
            onClick={() => banPick.reset()}
            className="flex items-center gap-2 px-4 py-3 border-2 border-border font-display text-sm 
              text-muted-foreground tracking-wider hover:border-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            RESET
          </button>

          {banPick.phase === "ban_pick" && (
            <button
              onClick={banPick.confirmAction}
              disabled={!banPick.selectedMapId}
              className={`
                flex-1 max-w-xs py-3 font-display text-lg tracking-widest transition-all
                ${
                  banPick.selectedMapId
                    ? banPick.currentAction?.type === "ban"
                      ? "bg-destructive text-destructive-foreground hover:brightness-110 active:scale-[0.98]"
                      : "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98]"
                    : "bg-val-disabled text-muted-foreground cursor-not-allowed"
                }
              `}
            >
              {banPick.selectedMapId
                ? `LOCK IN ${banPick.currentAction?.type === "ban" ? "BAN" : "PICK"}`
                : "SELECT A MAP"}
            </button>
          )}

          {isComplete && (
            <div className="flex-1 max-w-xs text-center">
              <span className="font-display text-primary text-lg tracking-widest">
                MAPS LOCKED
              </span>
            </div>
          )}
        </div>
      </footer>

      {/* Side select modal */}
      {banPick.phase === "side_select" && sideSelectMap && (
        <SideSelectModal
          mapName={sideSelectMap.name}
          teamName={sideSelectTeamName}
          onSelect={banPick.selectSide}
        />
      )}
    </div>
  );
}
