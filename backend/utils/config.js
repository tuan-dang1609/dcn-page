import "dotenv/config";

const PORT = process.env.PORT;

const FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL ?? "http://localhost:5173";

const RIOT_CLIENT_ID = process.env.RIOT_CLIENT_ID ?? "";
const RIOT_CLIENT_SECRET = process.env.RIOT_CLIENT_SECRET ?? "";
const RIOT_REDIRECT_URI =
  process.env.RIOT_REDIRECT_URI ??
  "http://localhost:3000/api/users/riot/callback";
const RIOT_ACCOUNT_API_BASE_URL =
  process.env.RIOT_ACCOUNT_API_BASE_URL ?? "https://asia.api.riotgames.com";

const RIOT_AUTH_BASE_URL =
  process.env.RIOT_AUTH_BASE_URL ?? "https://auth.riotgames.com";
const RIOT_AUTHORIZE_URL = `${RIOT_AUTH_BASE_URL}/authorize`;
const RIOT_TOKEN_URL = `${RIOT_AUTH_BASE_URL}/token`;
const RIOT_STATE_SECRET =
  process.env.RIOT_STATE_SECRET ?? process.env.SECRET ?? "riot-rso-dev-secret";

export default {
  PORT,
  FRONTEND_BASE_URL,
  RIOT_CLIENT_ID,
  RIOT_CLIENT_SECRET,
  RIOT_REDIRECT_URI,
  RIOT_ACCOUNT_API_BASE_URL,
  RIOT_AUTHORIZE_URL,
  RIOT_TOKEN_URL,
  RIOT_STATE_SECRET,
};
