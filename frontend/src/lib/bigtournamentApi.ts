import { apiUrl } from "@/lib/apiBase";

const BIGTOURNAMENT_PROXY_PREFIX = "/api/ext/bigtournament";

export const bigTournamentApiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return apiUrl(`${BIGTOURNAMENT_PROXY_PREFIX}${normalizedPath}`);
};
