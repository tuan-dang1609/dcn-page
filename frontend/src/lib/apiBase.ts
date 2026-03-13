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

// Fallback to the deployed backend if env vars are missing.
export const API_BASE =
  apiBaseFromVite ??
  apiBaseFromBun ??
  apiBaseFromProcess ??
  fallbackFromWindow ??
  "https://dcn-page.onrender.com";

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
};
