import axios from "axios";

const baseUrl = `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"}/api/tournaments`;
let token: string | null = null;

const toGameRouteKey = (value: string) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (["valo", "val", "valorant"].includes(normalized)) return "val";
  if (["lol", "leagueoflegends", "league_of_legends"].includes(normalized))
    return "lol";
  if (["tft", "teamfighttactics", "teamfight_tactics"].includes(normalized))
    return "tft";

  return normalized;
};

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

interface TournamentBySlugResponse {
  status: "success" | "error";
  info?: Tournament & {
    rule?: unknown[];
    milestones?: unknown[];
    requirement?: unknown;
    created_by?: unknown;
  };
}

const getAll = () => axios.get<Tournament[]>(baseUrl);

const getBySlug = (game: string, slug: string) =>
  axios.get<TournamentBySlugResponse>(
    `${baseUrl}/by-slug/${toGameRouteKey(game)}/${slug}`,
  );

const setToken = (nextToken: string | null) => {
  token = nextToken ? `Bearer ${nextToken}` : null;
};

const getAuthConfig = () =>
  token
    ? {
        headers: {
          Authorization: token,
        },
      }
    : {};

const create = (newObject: TournamentPayload) =>
  axios.post(baseUrl, newObject, getAuthConfig());

const update = (id: number | string, newObject: Partial<TournamentPayload>) =>
  axios.patch(`${baseUrl}/${id}`, newObject, getAuthConfig());



export default {
  getAll,
  getBySlug,
  setToken,
  create,
  update,
};
