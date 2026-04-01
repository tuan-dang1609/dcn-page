export interface TournamentPayload {
  name: string;
  game_id: number;
  banner_url?: string;
  season?: string;
  date_start?: string;
  date_end?: string;
  register_start?: string;
  register_end?: string;
  check_in_start?: string;
  check_in_end?: string;
  max_player_per_team?: number;
  max_participate?: number;
}

export interface Tournament {
  id: number;
  name: string;
  slug: string;
  game_id: number;
  format?: string;
  date_start?: string;
  date_end?: string;
  max_participate?: number;
}

export interface TournamentBySlugResponse {
  status: "success" | "error";
  info?: Tournament & {
    register_start?: string;
    register_end?: string;
    check_in_start?: string;
    check_in_end?: string;
    users?: Array<{ id?: number | string; username?: string }>;
    players?: Array<{ id?: number | string; username?: string }>;
    participants?: Array<{ id?: number | string; username?: string }>;
    registered?: Array<{
      id?: number | string;
      team_id?: number | string;
      name?: string;
      short_name?: string;
      logo_url?: string;
      team_color_hex?: string;
      isCheckedIn?: boolean;
    }>;
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
  next_match_id?: number | null;
  next_slot?: "A" | "B" | string | null;
  date_scheduled?: string | null;
  team_a_id?: number | null;
  team_b_id?: number | null;
  seed_a?: number | null;
  seed_b?: number | null;
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

export interface TournamentTeamPlayer {
  user_id?: number | string;
  nickname?: string;
  profile_picture?: string;
  riot_account?: string | null;
  role_in_team?: string;
}

export interface TournamentTeamPlayersResponse {
  name?: string;
  short_name?: string;
  logo_url?: string;
  team_color_hex?: string;
  players?: TournamentTeamPlayer[];
}
