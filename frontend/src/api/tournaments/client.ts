const apiBaseFromVite =
  typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_API_BASE_URL ?? null)
    : null;
const apiBaseFromBun =
  typeof import.meta !== "undefined"
    ? (import.meta.env?.BUN_PUBLIC_API_BASE_URL ?? null)
    : null;
const apiBaseFromProcess =
  typeof process !== "undefined"
    ? (process.env?.BUN_PUBLIC_API_BASE_URL ?? null)
    : null;

const API_BASE =
  apiBaseFromVite ??
  apiBaseFromBun ??
  apiBaseFromProcess ??
  "http://localhost:3000";

export const tournamentsBaseUrl = `${API_BASE}/api/tournaments`;
