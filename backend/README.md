# backend

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.8. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Riot Sign On (RSO)

Required environment variables in `backend/.env`:

```env
FRONTEND_BASE_URL="http://localhost:5173"
# Optional extras if you have multiple frontend hosts:
# ALLOWED_FRONTEND_ORIGINS="https://your-prod-frontend.com,https://your-preview.vercel.app"
RIOT_CLIENT_ID="709323"
RIOT_CLIENT_SECRET="mHsNYQM5BwDBuVBwYL8CVCLVKlf6d3yA498o00ZGz7B"
RIOT_REDIRECT_URI="http://localhost:3000/api/users/riot/callback"
RIOT_ACCOUNT_API_BASE_URL="https://asia.api.riotgames.com"
RIOT_AUTH_BASE_URL="https://auth.riotgames.com"
RIOT_STATE_SECRET="replace-me"
```

> Important: set `FRONTEND_BASE_URL` to the **live** frontend host (not a deleted Vercel deployment). Riot callback also stores the browser `origin` from `/riot/connect` so redirects return to the page the user started from (e.g. tournament register modal).
>
> Local dev checklist (avoid redirecting to `/profile` on Vercel/Render):
> 1. Frontend `VITE_API_BASE_URL=http://localhost:3000`
> 2. Backend `APP_BASE_URL=http://localhost:3000`
> 3. Backend `RIOT_REDIRECT_URI=http://localhost:3000/oauth2-callback`
> 4. Backend `FRONTEND_BASE_URL=http://localhost:8080`
> 5. Add the same `RIOT_REDIRECT_URI` in Riot Developer Portal → Redirect URLs
> 6. Restart backend after changing `.env`
>
> If `connect` runs on localhost but `RIOT_REDIRECT_URI` points to Render, Render will handle the callback (often old code) and always send users to `/profile`.

Legacy aliases also supported (for older env files):

```env
APP_BASE_URL="https://your-backend-host"
RIOT_PROVIDER="https://auth.riotgames.com"
JWT_SECRET="replace-me"
SESSION_SECRET="replace-me"
```

Implemented endpoints:

- `PATCH /api/users/me`: update nickname and profile picture for current user.
- `GET /api/users/riot/connect`: return Riot authorize URL for logged-in user.
- `GET /api/users/riot/callback`: exchange code, fetch Riot account, save `riot_account`.
- `GET /api/users/riot/login`: legacy-style Riot authorize redirect (no user `state`).
- `GET /sso/login-riot`: compatibility alias to legacy login endpoint.
- `GET /oauth2-callback`: compatibility alias that forwards query to `/api/users/riot/callback`.

Frontend flow:

- Open `/profile`.
- Click `Kết nối Riot`.
- After Riot auth, user is redirected back to `/profile` with status and updated Riot ID.

Legacy flow notes:

- For old Riot Portal setups that call `/sso/login-riot` and return to `/oauth2-callback`, callback still works.
- In legacy mode (no `state`), callback redirects to `/profile` with `gameName` and `tagName` query params.
