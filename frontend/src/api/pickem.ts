import axios from "axios";
import { API_BASE } from "@/lib/apiBase";

const pickemBaseUrl = `${API_BASE}/api/pickem`;

export interface PickemBracket {
  id: number;
  tournament_id: number;
  name?: string;
  stage?: string;
  status?: string;
  format_id?: number;
  format_name?: string;
  format_type?: string;
  has_losers_bracket?: boolean;
}

export interface PickemMatchTeam {
  id?: number | null;
  name?: string | null;
  short_name?: string | null;
  logo_url?: string | null;
  team_color_hex?: string | null;
}

export interface PickemMatch {
  id: number;
  bracket_id: number;
  round_number?: number;
  match_no?: number;
  team_a_id?: number | null;
  team_b_id?: number | null;
  score_a?: number | null;
  score_b?: number | null;
  winner_team_id?: number | null;
  status?: string;
  team_a?: PickemMatchTeam | null;
  team_b?: PickemMatchTeam | null;
}

export interface UserBracketPick {
  matchId: number;
  selectedTeamId: number;
  updatedAt?: string;
  isResolved?: boolean;
  isCorrect?: boolean | null;
  winnerTeamId?: number | null;
  roundNumber?: number | null;
  points?: number;
}

export interface UserBracketPickStats {
  totalPicks: number;
  resolvedPicks: number;
  correctPicks: number;
  wrongPicks: number;
  pendingPicks: number;
  totalPoints: number;
}

export interface BracketPickemResponse {
  bracket: PickemBracket;
  matches: PickemMatch[];
  myPicks: {
    submissionId: number;
    bracketId: number;
    userId: string;
    userMeta: Record<string, unknown>;
    updatedAt?: string;
    picks: UserBracketPick[];
    stats?: UserBracketPickStats;
  } | null;
  totalMatches: number;
}

export interface MyBracketPicksResponse {
  bracket_id: number;
  userId: string;
  user: Record<string, unknown>;
  picks: UserBracketPick[];
  stats?: UserBracketPickStats;
  updatedAt?: string | null;
}

export interface SaveBracketPicksPayload {
  userId: string | number;
  user?: Record<string, unknown>;
  picks: Array<{
    matchId: number;
    selectedTeamId: number;
  }>;
}

export interface SaveBracketPicksResponse {
  success: boolean;
  message: string;
  data?: {
    bracketId: number;
    userId: string;
    picks: UserBracketPick[];
    count: number;
    updatedAt?: string;
  };
}

export const getBracketPickemData = (
  bracketId: string | number,
  userId?: string | number,
) =>
  axios.get<BracketPickemResponse>(`${pickemBaseUrl}/bracket/${bracketId}`, {
    params: userId ? { userId } : undefined,
  });

export const getMyBracketPicks = (
  bracketId: string | number,
  userId: string | number,
) =>
  axios.get<MyBracketPicksResponse>(
    `${pickemBaseUrl}/bracket/${bracketId}/my-picks`,
    {
      params: { userId },
    },
  );

export const saveBracketPicks = (
  bracketId: string | number,
  payload: SaveBracketPicksPayload,
) =>
  axios.post<SaveBracketPicksResponse>(
    `${pickemBaseUrl}/bracket/${bracketId}/picks`,
    payload,
  );
