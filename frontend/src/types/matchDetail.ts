export type GameType = "cs2" | "valorant" | "lol" | "wildrift" | "tft";

export interface MapScore {
  mapName: string;
  mapImage?: string;
  team1Score: number;
  team2Score: number;
  roundHistory?: RoundHistoryEntry[];
}

export interface RoundHistoryEntry {
  roundNum: number;
  winner: "team1" | "team2" | null;
  winningRole?: string;
  ceremony?: string;
  winReason?: "time" | "default" | "defuse" | "explosion";
}

export interface PlayerStat {
  name: string;
  icon: string;
  avatar?: string;
  kills?: number;
  deaths?: number;
  plusMinus?: number;
  adr?: number;
  hsPercent?: string;
  assists?: number;
  cs?: number;
  damage?: number;
  placement?: number;
  role?: string;
  firstDeaths?: number;
  firstKills?: number;
  multiKills?: number;
  acs?: number;
}

export interface TeamRoster {
  teamName: string;
  teamLogo: string;
  teamTag: string;
  players: PlayerStat[];
}

export interface FPSMapRoster {
  label: string;
  team1Roster: TeamRoster;
  team2Roster: TeamRoster;
}

export interface MatchDetail {
  id: string;
  tournamentName: string;
  roundName: string;
  format: string;
  date: string;
  gameType: GameType;
  team1: {
    name: string;
    tag: string;
    logo: string;
    score: number;
    rank?: string;
  };
  team2: {
    name: string;
    tag: string;
    logo: string;
    score: number;
    rank?: string;
  };
  maps?: MapScore[];
  team1Roster: TeamRoster;
  team2Roster: TeamRoster;
  statTabs?: string[];
  fpsMapRosters?: FPSMapRoster[];
}
