const RIOT_OAUTH_RETURN_KEY = "dcn_riot_oauth_return";
const RIOT_OAUTH_RETURN_TTL_MS = 15 * 60 * 1000;

export type RiotOAuthReturn = {
  path: string;
  openRegister?: boolean;
  ts: number;
};

const isSafePath = (path: unknown): path is string =>
  typeof path === "string" &&
  path.startsWith("/") &&
  !path.startsWith("//") &&
  !path.includes("://");

/** Save where to return after Riot OAuth (survives backend always redirecting to /profile). */
export const saveRiotOAuthReturn = (path: string, openRegister = false) => {
  if (typeof window === "undefined" || !isSafePath(path)) return;

  const payload: RiotOAuthReturn = {
    path,
    openRegister: Boolean(openRegister),
    ts: Date.now(),
  };

  try {
    window.localStorage.setItem(RIOT_OAUTH_RETURN_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
};

export const peekRiotOAuthReturn = (): RiotOAuthReturn | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(RIOT_OAUTH_RETURN_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as RiotOAuthReturn;
    if (!isSafePath(parsed?.path)) return null;
    if (!Number.isFinite(parsed.ts)) return null;
    if (Date.now() - parsed.ts > RIOT_OAUTH_RETURN_TTL_MS) return null;

    return {
      path: parsed.path,
      openRegister: Boolean(parsed.openRegister),
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
};

export const clearRiotOAuthReturn = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RIOT_OAUTH_RETURN_KEY);
  } catch {
    // ignore
  }
};

/** Build redirect target after Riot callback lands on any page (often /profile). */
export const buildRiotOAuthResumeUrl = (
  currentSearch: string,
): string | null => {
  const saved = peekRiotOAuthReturn();
  if (!saved) return null;
  // Connecting from Profile should stay on Profile — no bounce loop.
  if (saved.path === "/profile") return null;

  const params = new URLSearchParams(currentSearch);
  if (saved.openRegister) {
    params.set("register", "1");
  }

  const query = params.toString();
  return query ? `${saved.path}?${query}` : saved.path;
};
