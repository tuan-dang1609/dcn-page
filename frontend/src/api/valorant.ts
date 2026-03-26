import axios from "axios";
import { bigTournamentApiUrl } from "@/lib/bigtournamentApi";

export interface ValorantApiPlayerStats {
  multiKills?: number;
  acs?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  adr?: number;
  headshotPercentage?: number;
  firstDeaths?: number;
  firstKills?: number;
}

export interface ValorantApiPlayer {
  gameName: string;
  tagLine: string;
  teamId: string;
  characterName?: string;
  imgCharacter?: string;
  stats?: ValorantApiPlayerStats;
}

export interface ValorantApiTeam {
  teamId: string;
  roundsWon?: number;
  numPoints?: number;
}

export interface ValorantApiMatchInfo {
  mapName?: string;
  gameStartMillis?: number;
}

export interface ValorantApiRoundResult {
  roundNum?: number;
  winningTeam?: string;
  winningTeamRole?: string;
  roundCeremony?: string;
  roundResult?: string;
  roundResultCode?: string;
  roundResultType?: string;
  roundResultReason?: string;
  roundEndType?: string;
  roundOutcome?: string;
  roundWinMethod?: string;
  winType?: string;
  endType?: string;
}

export interface ValorantApiMatchData {
  matchInfo?: ValorantApiMatchInfo;
  players?: ValorantApiPlayer[];
  teams?: ValorantApiTeam[];
  roundResults?: ValorantApiRoundResult[];
}

export interface ValorantMatchDataResponse {
  source: string;
  matchData: ValorantApiMatchData;
}

const VALORANT_MATCH_BASE_URL = bigTournamentApiUrl(
  "/api/auth/valorant/matchdata",
);

export const getValorantMatchData = (matchId: string) =>
  axios.get<ValorantMatchDataResponse>(`${VALORANT_MATCH_BASE_URL}/${matchId}`);
