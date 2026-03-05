export interface TournamentPayload {
  name: string;
  game_id: number;
  banner_url?: string;
  season?: string;
  date_start?: string;
  date_end?: string;
  register_start?: string;
  register_end?: string;
  max_player_per_team?: number;
  max_participate?: number;
}

export interface Tournament {
  id: number;
  name: string;
  slug: string;
  game_id: number;
  max_participate?: number;
}

export interface TournamentBySlugResponse {
  status: "success" | "error";
  info?: Tournament & {
    users?: Array<{ id?: number | string; username?: string }>;
    players?: Array<{ id?: number | string; username?: string }>;
    participants?: Array<{ id?: number | string; username?: string }>;
    registered_count?: number;
    requirement?: {
      rank_min?: string;
      rank_max?: string;
      device?: string[] | string;
      discord?: boolean;
    };
    milestones?: unknown[];
    rule?: unknown[];
    created_by?: {
      id?: number | string;
      username?: string;
      profile_picture?: string;
    };
  };
}

export interface Bracket {
  id: number;
  tournament_id: number;
  stage?: string;
  status?: string;
  name?: string;
  format_id?: number;
  format_name?: string;
  format_type?: string;
  has_losers_bracket?: boolean;
}

export interface Match {
  id: number;
  bracket_id: number;
  round_number?: number;
  match_no?: number;
  team_a_id?: number | null;
  team_b_id?: number | null;
  score_a?: number | null;
  score_b?: number | null;
  winner_team_id?: number | null;
  team_a?: {
    id?: number | null;
    name?: string | null;
    short_name?: string | null;
    logo_url?: string | null;
    team_color_hex?: string | null;
  } | null;
  team_b?: {
    id?: number | null;
    name?: string | null;
    short_name?: string | null;
    logo_url?: string | null;
    team_color_hex?: string | null;
  } | null;
  status?: string;
}

export interface DataEnvelope<T> {
  data: T;
}
