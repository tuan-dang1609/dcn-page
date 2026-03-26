import axios from "axios";

const BIGTOURNAMENT_PROXY_PREFIX = "/ext-api/bigtournament";
const BIGTOURNAMENT_HOST = "bigtournament-1.onrender.com";
const DEFAULT_FRONTEND_API_KEY = "HoangTuan2004";

const resolveFrontendApiKey = () => {
  if (typeof import.meta === "undefined") {
    return DEFAULT_FRONTEND_API_KEY;
  }

  const configuredKey = import.meta.env?.VITE_API_KEY;
  if (typeof configuredKey === "string" && configuredKey.trim()) {
    return configuredKey.trim();
  }

  return DEFAULT_FRONTEND_API_KEY;
};

const FRONTEND_API_KEY = resolveFrontendApiKey();

export const bigTournamentApiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${BIGTOURNAMENT_PROXY_PREFIX}${normalizedPath}`;
};

const isBigTournamentRequest = (rawUrl: string) => {
  if (!rawUrl) return false;

  try {
    const baseOrigin =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost";
    const parsed = new URL(rawUrl, baseOrigin);

    return (
      parsed.pathname.startsWith(BIGTOURNAMENT_PROXY_PREFIX) ||
      parsed.hostname === BIGTOURNAMENT_HOST
    );
  } catch {
    return (
      rawUrl.startsWith(BIGTOURNAMENT_PROXY_PREFIX) ||
      rawUrl.includes(BIGTOURNAMENT_HOST)
    );
  }
};

let isConfigured = false;

export const configureBigTournamentApiAccess = () => {
  if (isConfigured) return;
  isConfigured = true;

  axios.interceptors.request.use((config) => {
    const urlPart = typeof config.url === "string" ? config.url : "";
    const basePart = typeof config.baseURL === "string" ? config.baseURL : "";

    const candidateUrl =
      urlPart.startsWith("http://") || urlPart.startsWith("https://")
        ? urlPart
        : `${basePart}${urlPart}`;

    if (!isBigTournamentRequest(candidateUrl)) {
      return config;
    }

    const headers = axios.AxiosHeaders.from(config.headers ?? {});
    if (!headers.has("x-api-key")) {
      headers.set("x-api-key", FRONTEND_API_KEY);
    }

    config.headers = headers;
    return config;
  });

  if (typeof window !== "undefined" && typeof window.fetch === "function") {
    const originalFetch = window.fetch.bind(window);

    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (!isBigTournamentRequest(requestUrl)) {
        return originalFetch(input, init);
      }

      try {
        const headers = new Headers(
          init?.headers ??
            (input instanceof Request ? input.headers : undefined),
        );

        if (!headers.has("x-api-key")) {
          headers.set("x-api-key", FRONTEND_API_KEY);
        }

        return originalFetch(input, { ...(init ?? {}), headers });
      } catch {
        return originalFetch(input, init);
      }
    };
  }
};
