import { Side, Team } from "@/data/maps";
import { Shield, Swords } from "lucide-react";

interface SideSelectModalProps {
  mapName: string;
  teamName: string;
  onSelect: (side: Side) => void;
}

export function SideSelectModal({
  mapName,
  teamName,
  onSelect,
}: SideSelectModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md mx-4 border-2 border-border bg-card p-8 space-y-6 animate-scale-in">
        <div className="text-center space-y-2">
          <h2 className="font-display text-2xl font-bold text-foreground tracking-wider">
            CHỌN SIDE
          </h2>
          <p className="font-body text-muted-foreground">
            <span className="text-primary font-semibold">{teamName}</span> chọn
            side cho map{" "}
            <span className="text-foreground font-semibold">{mapName}</span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => onSelect("ATK")}
            className="group flex flex-col items-center gap-3 p-6 border-2 border-border
              hover:border-destructive hover:bg-destructive/10 transition-all duration-100
              active:scale-95"
          >
            <Swords className="w-10 h-10 text-destructive group-hover:scale-110 transition-transform" />
            <span className="font-display text-xl font-bold text-destructive tracking-widest">
              ATK
            </span>
            <span className="font-body text-xs text-muted-foreground">
              ATTACK
            </span>
          </button>

          <button
            onClick={() => onSelect("DEF")}
            className="group flex flex-col items-center gap-3 p-6 border-2 border-border
              hover:border-primary hover:bg-primary/10 transition-all duration-100
              active:scale-95"
          >
            <Shield className="w-10 h-10 text-primary group-hover:scale-110 transition-transform" />
            <span className="font-display text-xl font-bold text-primary tracking-widest">
              DEF
            </span>
            <span className="font-body text-xs text-muted-foreground">
              DEFENSE
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
