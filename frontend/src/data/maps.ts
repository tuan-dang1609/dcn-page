import bindImg from "@/assets/ascent.jpg";
import havenImg from "@/assets/haven.jpg";
import splitImg from "@/assets/split.jpg";
import ascentImg from "@/assets/ascent.jpg";
import iceboxImg from "@/assets/icebox.jpg";
import breezeImg from "@/assets/breeze.jpg";
import lotusImg from "@/assets/lotus.jpg";

export interface ValorantMap {
  id: string;
  name: string;
  image: string;
}

export const VALORANT_MAPS: ValorantMap[] = [
  { id: "bind", name: "BIND", image: bindImg },
  { id: "haven", name: "HAVEN", image: havenImg },
  { id: "split", name: "SPLIT", image: splitImg },
  { id: "ascent", name: "ASCENT", image: ascentImg },
  { id: "icebox", name: "ICEBOX", image: iceboxImg },
  { id: "breeze", name: "BREEZE", image: breezeImg },
  { id: "lotus", name: "LOTUS", image: lotusImg },
];

export type MapStatus = "available" | "banned" | "picked" | "decider";
export type ActionType = "ban" | "pick";
export type Team = "team1" | "team2";
export type Side = "ATK" | "DEF";
export type GameFormat = "BO1" | "BO3" | "BO5";

export interface BanPickAction {
  type: ActionType;
  team: Team;
}

// BO1: alternate bans until 1 map remains. Team1 bans first.
// After all bans, team2 (opponent of first banner) chooses side.
export const BO1_SEQUENCE: BanPickAction[] = [
  { type: "ban", team: "team1" },
  { type: "ban", team: "team2" },
  { type: "ban", team: "team1" },
  { type: "ban", team: "team2" },
  { type: "ban", team: "team1" },
  { type: "ban", team: "team2" },
  // remaining map → team2 picks side
];

// BO3: Ban-Ban-Pick(+side)-Pick(+side)-Ban-Ban → 7th map = decider (no side)
export const BO3_SEQUENCE: BanPickAction[] = [
  { type: "ban", team: "team1" },
  { type: "ban", team: "team2" },
  { type: "pick", team: "team1" }, // after: team2 picks side
  { type: "pick", team: "team2" }, // after: team1 picks side
  { type: "ban", team: "team1" },
  { type: "ban", team: "team2" },
  // remaining map = decider, no side selection
];

// BO5: Ban-Ban-Pick-Pick-Pick-Pick → 7th map = decider (no side)
export const BO5_SEQUENCE: BanPickAction[] = [
  { type: "ban", team: "team1" },
  { type: "ban", team: "team2" },
  { type: "pick", team: "team1" }, // after: team2 picks side
  { type: "pick", team: "team2" }, // after: team1 picks side
  { type: "pick", team: "team1" }, // after: team2 picks side
  { type: "pick", team: "team2" }, // after: team1 picks side
  // remaining map = decider, no side selection
];

export function getSequence(format: GameFormat): BanPickAction[] {
  switch (format) {
    case "BO1":
      return BO1_SEQUENCE;
    case "BO3":
      return BO3_SEQUENCE;
    case "BO5":
      return BO5_SEQUENCE;
  }
}

export function getOpponent(team: Team): Team {
  return team === "team1" ? "team2" : "team1";
}

export interface MapState {
  mapId: string;
  status: MapStatus;
  actionBy?: Team;
  actionType?: ActionType;
  side?: { team1: Side; team2: Side };
  sideChosenBy?: Team;
}
