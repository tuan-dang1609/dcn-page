import { Elysia } from "elysia";

const BIGTOURNAMENT_BASE_URL = "https://bigtournament-1.onrender.com";
const PROXY_PREFIX = /^\/api\/ext\/bigtournament/;

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

const STRIP_RESPONSE_HEADERS = new Set([
  ...HOP_BY_HOP_HEADERS,
  "content-encoding",
  "content-length",
]);

const sanitizeProxyResponseHeaders = (headers) => {
  const outgoing = new Headers();

  headers.forEach((value, key) => {
    if (STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
    outgoing.set(key, value);
  });

  return outgoing;
};

const getBigTournamentApiKey = () => {
  const rawKey =
    process.env.BIGTOURNAMENT_API_KEY ??
    process.env.BIGTOURNAMENT_KEY ??
    process.env.BIG_TOURNAMENT_API_KEY ??
    process.env.API_KEY_DCN ??
    null;

  const normalized = typeof rawKey === "string" ? rawKey.trim() : "";
  return normalized || null;
};

const normalizeProxyPath = (pathname) => {
  const trimmed = pathname.replace(PROXY_PREFIX, "");
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const buildUpstreamUrl = (requestUrl) => {
  const incoming = new URL(requestUrl);
  const upstream = new URL(
    normalizeProxyPath(incoming.pathname),
    BIGTOURNAMENT_BASE_URL,
  );
  upstream.search = incoming.search;
  return upstream;
};

const buildUpstreamHeaders = (headers, apiKey) => {
  const outgoing = new Headers();

  headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalized)) return;
    if (normalized === "host") return;
    if (normalized === "origin") return;
    if (normalized === "referer") return;
    if (normalized === "authorization") return;
    if (normalized === "x-api-key") return;

    outgoing.set(key, value);
  });

  if (apiKey) {
    outgoing.set("x-api-key", apiKey);
  }

  return outgoing;
};

const shouldIncludeBody = (method) =>
  !["GET", "HEAD"].includes(String(method).toUpperCase());

const bigTournamentRouter = new Elysia({ name: "BigTournamentProxy" }).all(
  "/*",
  async ({ request, set }) => {
    try {
      const apiKey = getBigTournamentApiKey();
      if (!apiKey) {
        set.status = 503;
        return {
          error:
            "BigTournament proxy is not configured. Set BIGTOURNAMENT_API_KEY on the server.",
        };
      }

      const upstreamUrl = buildUpstreamUrl(request.url);
      const headers = buildUpstreamHeaders(request.headers, apiKey);

      const body = shouldIncludeBody(request.method)
        ? await request.arrayBuffer()
        : undefined;

      const upstreamResponse = await fetch(upstreamUrl, {
        method: request.method,
        headers,
        body: body && body.byteLength ? body : undefined,
      });

      const responseBody = await upstreamResponse.arrayBuffer();

      return new Response(responseBody, {
        status: upstreamResponse.status,
        headers: sanitizeProxyResponseHeaders(upstreamResponse.headers),
      });
    } catch (error) {
      set.status = 502;
      return { error: "Upstream request failed" };
    }
  },
);

export default bigTournamentRouter;
