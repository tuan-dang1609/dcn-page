const sanitizeApiBase = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  if (lowered === "undefined" || lowered === "null") return null;

  return trimmed.replace(/\/+$/, "");
};

const apiBaseFromVite =
  typeof import.meta !== "undefined"
    ? sanitizeApiBase(import.meta.env?.VITE_API_BASE_URL)
    : null;

const apiBaseFromBun =
  typeof import.meta !== "undefined"
    ? sanitizeApiBase(import.meta.env?.BUN_PUBLIC_API_BASE_URL)
    : null;

const apiBaseFromProcess =
  typeof process !== "undefined"
    ? sanitizeApiBase(process.env?.BUN_PUBLIC_API_BASE_URL)
    : null;

const fallbackFromWindow =
  typeof window !== "undefined"
    ? sanitizeApiBase(window.location.origin)
    : null;

const localhostFallback =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
    ? "http://localhost:3000"
    : null;

// Fallback to the deployed backend if env vars are missing.
export const API_BASE =
  apiBaseFromVite ??
  apiBaseFromBun ??
  apiBaseFromProcess ??
  localhostFallback ??
  fallbackFromWindow ??
  "http://localhost:8080";

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return normalizedPath;
    }
  }

  return `${API_BASE}${normalizedPath}`;
};
