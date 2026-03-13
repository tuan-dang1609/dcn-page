import { VALORANT_MAPS, MapState, Team } from "@/data/maps";
import { X, Check, Shield, Swords, Crown } from "lucide-react";

interface MapCardProps {
  mapState: MapState;
  isSelected: boolean;
  onSelect: (mapId: string) => void;
  disabled: boolean;
  teamNames: { team1: string; team2: string };
}

export function MapCard({
  mapState,
  isSelected,
  onSelect,
  disabled,
  teamNames,
}: MapCardProps) {
  const mapData = VALORANT_MAPS.find((m) => m.id === mapState.mapId)!;
  const isBanned = mapState.status === "banned";
  const isPicked = mapState.status === "picked";
  const isDecider = mapState.status === "decider";
  const isAvailable = mapState.status === "available";
  const isActioned = isBanned || isPicked || isDecider;

  const teamLabel = mapState.actionBy ? teamNames[mapState.actionBy] : null;

  return (
    <button
      onClick={() => isAvailable && !disabled && onSelect(mapState.mapId)}
      disabled={!isAvailable || disabled}
      className={`
        relative overflow-hidden group cursor-pointer
        w-full aspect-[16/10] border-2 transition-all duration-100
        ${isAvailable && !disabled ? "hover:scale-105 hover:border-primary active:scale-100" : ""}
        ${isSelected ? "border-primary shadow-[0_0_20px_hsl(var(--val-teal)/0.4)]" : "border-border"}
        ${isBanned ? "border-destructive/50" : ""}
        ${isPicked ? "border-primary" : ""}
        ${isDecider ? "border-amber-400" : ""}
        ${!isAvailable ? "cursor-default" : ""}
      `}
    >
      {/* Map image */}
      <img
        src={mapData.image}
        alt={mapData.name}
        className={`
          absolute inset-0 w-full h-full object-cover transition-all duration-200
          ${isBanned ? "map-card-banned" : ""}
          ${isPicked || isDecider ? "map-card-picked" : ""}
        `}
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />

      {/* Map name */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <h3 className="font-display text-lg font-bold tracking-wider text-foreground">
          {mapData.name}
        </h3>
        {/* Side info */}
        {mapState.side && (
          <div className="flex gap-2 mt-1">
            <span className="text-xs font-body font-semibold text-primary">
              {teamNames.team1}: {mapState.side.team1}
            </span>
            <span className="text-xs font-body text-muted-foreground">|</span>
            <span className="text-xs font-body font-semibold text-destructive">
              {teamNames.team2}: {mapState.side.team2}
            </span>
          </div>
        )}
      </div>

      {/* Team badge - top left */}
      {isActioned && teamLabel && (
        <div
          className={`absolute top-0 left-0 px-2 py-1 font-display text-xs font-bold tracking-wider stamp-enter
            ${isBanned ? "bg-destructive text-destructive-foreground" : ""}
            ${isPicked ? "bg-primary text-primary-foreground" : ""}
            ${isDecider ? "bg-amber-400 text-background" : ""}
          `}
        >
          {teamLabel}
        </div>
      )}

      {/* Banned stamp */}
      {isBanned && (
        <div className="absolute inset-0 flex items-center justify-center stamp-enter">
          <div className="flex flex-col items-center gap-1">
            <X className="w-12 h-12 text-destructive" strokeWidth={3} />
            <span className="font-display text-sm font-bold text-destructive tracking-widest">
              BANNED
            </span>
          </div>
        </div>
      )}

      {/* Picked stamp */}
      {isPicked && (
        <div className="absolute inset-0 flex items-center justify-center stamp-enter">
          <div className="flex flex-col items-center gap-1">
            <Check className="w-12 h-12 text-primary" strokeWidth={3} />
            <span className="font-display text-sm font-bold text-primary tracking-widest">
              PICKED
            </span>
          </div>
        </div>
      )}

      {/* Decider stamp */}
      {isDecider && (
        <div className="absolute inset-0 flex items-center justify-center stamp-enter">
          <div className="flex flex-col items-center gap-1">
            <Crown className="w-12 h-12 text-amber-400" strokeWidth={3} />
            <span className="font-display text-sm font-bold text-amber-400 tracking-widest">
              DECIDER
            </span>
          </div>
        </div>
      )}

      {/* Selection highlight */}
      {isSelected && isAvailable && (
        <div className="absolute inset-0 border-2 border-primary bg-primary/10" />
      )}
    </button>
  );
}
