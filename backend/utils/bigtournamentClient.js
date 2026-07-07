import { fetchValorantMatchFromRiot } from "./riotValorantClient.js";

const BIGTOURNAMENT_BASE_URL = "https://bigtournament-1.onrender.com";

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = String(process.env[key] ?? "").trim();
    if (value) return value;
  }
  return "";
};

const buildAuthVariants = () => {
  const variants = [];
  const seen = new Set();

  const addVariant = (label, headers) => {
    const signature = JSON.stringify({ label, headers });
    if (seen.has(signature)) return;
    seen.add(signature);
    variants.push({ label, headers });
  };

  const dcnKey = readEnv(
    "BIGTOURNAMENT_API_KEY",
    "BIGTOURNAMENT_KEY",
    "BIG_TOURNAMENT_API_KEY",
    "API_KEY_DCN",
  );
  const valorantKey = readEnv("API_KEY_VALORANT");

  if (dcnKey) {
    addVariant("x-api-key:dcn", { "x-api-key": dcnKey });
  }

  if (valorantKey) {
    addVariant("x-api-key:valorant", { "x-api-key": valorantKey });
    addVariant("authorization:valorant", {
      Authorization: `Bearer ${valorantKey}`,
    });
  }

  return variants;
};

const buildValorantPaths = (matchId) => {
  const encodedId = encodeURIComponent(matchId);
  return [
    `/api/auth/valorant/matchdata/valorant/match/${encodedId}`,
    `/api/auth/valorant/matchdata/${encodedId}`,
  ];
};

const normalizeValorantPayload = (payload) => {
  if (payload?.matchData) {
    return payload;
  }

  if (payload?.players || payload?.matchInfo) {
    return {
      source: "bigtournament",
      matchData: payload,
    };
  }

  return payload;
};

const fetchUpstreamJson = async (path, extraHeaders = {}) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${BIGTOURNAMENT_BASE_URL}${normalizedPath}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...extraHeaders,
    },
  });

  const text = await response.text();
  const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();

  if (!response.ok) {
    throw new Error(
      `BigTournament upstream returned ${response.status}: ${text.slice(0, 240)}`,
    );
  }

  if (contentType.includes("text/html") || text.trimStart().startsWith("<!")) {
    throw new Error("BigTournament upstream returned HTML instead of JSON.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("BigTournament upstream returned invalid JSON.");
  }
};

export const fetchValorantMatchData = async (matchId) => {
  const normalizedMatchId = String(matchId ?? "").trim();
  if (!normalizedMatchId) {
    throw new Error("match_id is required");
  }

  const bigTournamentErrors = [];
  const authVariants = buildAuthVariants();
  const paths = buildValorantPaths(normalizedMatchId);

  if (authVariants.length === 0) {
    bigTournamentErrors.push("No BigTournament API key configured.");
  }

  for (const path of paths) {
    for (const variant of authVariants) {
      try {
        const payload = await fetchUpstreamJson(path, variant.headers);
        return normalizeValorantPayload(payload);
      } catch (error) {
        bigTournamentErrors.push(
          `${variant.label} ${path}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  try {
    return await fetchValorantMatchFromRiot(normalizedMatchId);
  } catch (riotError) {
    throw new Error(
      `Valorant match data unavailable. BigTournament attempts failed (${bigTournamentErrors.join(
        " | ",
      )}). Riot fallback failed (${
        riotError instanceof Error ? riotError.message : String(riotError)
      }).`,
    );
  }
};

export const fetchTftMatchData = async (matchId) => {
  const normalizedMatchId = String(matchId ?? "").trim();
  if (!normalizedMatchId) {
    throw new Error("match_id is required");
  }

  const authVariants = buildAuthVariants();
  if (!authVariants.length) {
    throw new Error("BigTournament API key is not configured on the server.");
  }

  const path = `/api/tft/match/${encodeURIComponent(normalizedMatchId)}`;
  const errors = [];

  for (const variant of authVariants) {
    try {
      return await fetchUpstreamJson(path, variant.headers);
    } catch (error) {
      errors.push(
        `${variant.label}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  throw new Error(errors.join(" | ") || "Failed to fetch TFT match data.");
};

export const getBigTournamentApiKey = () => readEnv(
  "BIGTOURNAMENT_API_KEY",
  "BIGTOURNAMENT_KEY",
  "BIG_TOURNAMENT_API_KEY",
  "API_KEY_DCN",
  "API_KEY_VALORANT",
);
