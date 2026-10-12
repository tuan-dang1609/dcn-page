import type { ValorantApiMatchData } from "@/api/valorant";

export type GameType = "cs2" | "valorant" | "lol" | "wildrift" | "tft" | "aov";

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
  riotAccount?: string;
  /** IGN gốc trong game (AOV) — dùng để remap đội */
  originalIgn?: string;
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
  performanceScore?: number;
  gold?: number;  firstDeaths?: number;
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

export interface AovGameRoster {
  label: string;
  team1Kills: number;
  team2Kills: number;
  /** match_games.payload.aov.duration_sec */
  durationSec?: number | null;
  /** null = chưa biết đội thắng ván */
  team1Won?: boolean | null;
  /** Phe của team1 trong ván (blue = Phe xanh) */
  team1Side?: "blue" | "red";
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
  status?: string;
  roomId?: string | null;
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
  /**
   * Dữ liệu Riot từng map, đã đổi Blue/Red để team1 luôn là "Blue"
   * (Riot đổi phe theo phòng) — dùng cho ValorantMatchResult.
   */
  valorantGames?: ValorantApiMatchData[];
  aovGameRosters?: AovGameRoster[];
}
