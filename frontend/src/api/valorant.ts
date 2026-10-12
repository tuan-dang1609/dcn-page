import axios from "axios";
import { apiUrl } from "@/lib/apiBase";

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
  puuid?: string;
  gameName: string;
  tagLine: string;
  teamId: string;
  /** UUID đặc vụ (Riot characterId). */
  characterId?: string;
  /** Tên đặc vụ đã dịch ở backend; dữ liệu cũ có thể vẫn là UUID. */
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
  /** Đường dẫn map của Riot, vd "/Game/Maps/Bonsai/Bonsai". */
  mapId?: string;
  /** Tên map hiển thị ("Split"); dữ liệu cũ có thể là đường dẫn. */
  mapName?: string;
  gameStartMillis?: number;
  gameLengthMillis?: number;
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

export const getValorantMatchData = (matchId: string) =>
  axios.get<ValorantMatchDataResponse>(
    apiUrl(
      `/api/tournaments/matches/external/valorant/${encodeURIComponent(matchId)}`,
    ),
  );
