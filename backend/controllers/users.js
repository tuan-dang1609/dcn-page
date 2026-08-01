import bcrypt from "bcryptjs";
import { Elysia } from "elysia";
import jwt from "jsonwebtoken";
import { pool } from "../utils/db.js";
import middleware from "../utils/middleware.js";
import config from "../utils/config.js";

const usersRouter = new Elysia({ name: "Users" }).derive(
  middleware.deriveAuthContext,
);
const TAG = "Users";

const normalizeNullableText = (value) => {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const sanitizeReturnTo = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.includes("://")) return null;

  // Only keep pathname — query flags are passed separately in OAuth state.
  const pathname = trimmed.split("?")[0]?.split("#")[0] ?? "";
  if (!pathname.startsWith("/")) return null;
  return pathname;
};

const sanitizeOrigin = (value) => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
};

const resolveFrontendOrigin = (candidate) => {
  const sanitized = sanitizeOrigin(candidate);
  if (sanitized) return sanitized;
  return sanitizeOrigin(config.FRONTEND_BASE_URL) || "http://localhost:8080";
};

const isTruthyFlag = (value) => {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
};

const buildFrontendRedirectUrl = (
  returnTo,
  riot,
  reason = "",
  extras = {},
  origin = config.FRONTEND_BASE_URL,
) => {
  const safeReturnTo = sanitizeReturnTo(returnTo) || "/profile";
  const safeOrigin = resolveFrontendOrigin(origin);
  const url = new URL(safeReturnTo, safeOrigin);
  url.searchParams.set("riot", riot);

  if (reason) {
    url.searchParams.set("reason", reason);
  }

  Object.entries(extras).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim().length > 0
    ) {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
};

const friendlyRiotError = (error) => {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  if (
    message.includes("users_riot_account_unique") ||
    message.includes("duplicate key") ||
    message.includes("unique constraint")
  ) {
    return "Riot ID này đã được liên kết với tài khoản khác";
  }
  return String(error?.message || "cannot complete riot sign on");
};

const buildRiotAuthorizeUrl = (state = "") => {
  const query = new URLSearchParams({
    redirect_uri: config.RIOT_REDIRECT_URI,
    client_id: config.RIOT_CLIENT_ID,
    response_type: "code",
    scope: "openid",
  });

  if (state) {
    query.set("state", state);
  }

  return `${config.RIOT_AUTHORIZE_URL}?${query.toString()}`;
};

const getBasicAuthHeader = () => {
  const plain = `${config.RIOT_CLIENT_ID}:${config.RIOT_CLIENT_SECRET}`;
  const encoded = Buffer.from(plain, "utf8").toString("base64");
  return `Basic ${encoded}`;
};

const exchangeRiotCodeForToken = async (accessCode) => {
  const tokenResponse = await fetch(config.RIOT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: getBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: accessCode,
      redirect_uri: config.RIOT_REDIRECT_URI,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const tokenErrText = await tokenResponse.text();
    throw new Error(`token exchange failed: ${tokenErrText}`);
  }

  const tokenPayload = await tokenResponse.json();
  const accessToken = String(tokenPayload?.access_token ?? "").trim();

  if (!accessToken) {
    throw new Error("riot access token is missing");
  }

  return accessToken;
};

const fetchRiotAccountByToken = async (accessToken) => {
  const accountResponse = await fetch(
    `${config.RIOT_ACCOUNT_API_BASE_URL}/riot/account/v1/accounts/me`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!accountResponse.ok) {
    const accountErrText = await accountResponse.text();
    throw new Error(`fetch riot account failed: ${accountErrText}`);
  }

  const accountPayload = await accountResponse.json();
  const gameName = String(accountPayload?.gameName ?? "").trim();
  const tagLine = String(accountPayload?.tagLine ?? "").trim();
  const riotAccount = gameName && tagLine ? `${gameName}#${tagLine}` : null;

  if (!riotAccount) {
    throw new Error("riot account is empty");
  }

  return {
    gameName,
    tagLine,
    riotAccount,
  };
};

usersRouter.get(
  "/",
  async ({ query, set }) => {
    const q = String(query?.q ?? "").trim();

    if (!q) {
      const { rows } = await pool.query(
        `SELECT id, username, nickname, profile_picture, team_id
         FROM users
         ORDER BY username ASC`,
      );

      set.status = 200;
      return { users: rows };
    }

    const { rows } = await pool.query(
      `SELECT id, username, nickname, profile_picture, team_id
       FROM users
       WHERE username ILIKE $1 OR nickname ILIKE $1
       ORDER BY username ASC
       LIMIT 50`,
      [`%${q}%`],
    );

    set.status = 200;
    return { users: rows };
  },
  {
    tags: [TAG],
    summary: "List users",
  },
);

usersRouter.post(
  "/",
  async ({ body, set }) => {
    try {
      const { username, nickname, password, logo_url, profile_picture } =
        body ?? {};

      if (
        !username ||
        !password ||
        username.length < 3 ||
        password.length < 3
      ) {
        set.status = 400;
        return {
          error: "username or password must be over 3 characters long",
        };
      }

      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const DEFAULT_AVATAR =
        "https://nybmykdjtkjaatepkfog.supabase.co/storage/v1/object/public/image/users/default-avatar-icon-of-social-media-user-vector.jpg";
      const avatarUrl = profile_picture ?? logo_url ?? DEFAULT_AVATAR;

      const { rows } = await pool.query(
        "INSERT INTO users(nickname,username,password_hash,profile_picture) VALUES ($1,$2,$3,$4) RETURNING id, nickname, username, profile_picture",
        [nickname ?? null, username, passwordHash, avatarUrl],
      );

      set.status = 201;
      return rows;
    } catch (error) {
      if (error?.code === "23505") {
        set.status = 409;
        return { error: "username already exists" };
      }

      set.status = 500;
      return { error: error?.message || "internal server error" };
    }
  },
  {
    tags: [TAG],
    summary: "Create user",
    detail: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["username", "password"],
              properties: {
                username: { type: "string", example: "Beacon" },
                nickname: { type: "string", example: "Béo Cần" },
                password: { type: "string", example: "123456" },
                logo_url: {
                  type: "string",
                  example:
                    "https://<project>.supabase.co/storage/v1/object/public/avatars/users/abc.png",
                },
              },
            },
          },
        },
      },
    },
  },
);

usersRouter.patch(
  "/me",
  async ({ body, user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "token missing or invalid" };
    }

    const hasNickname = Object.prototype.hasOwnProperty.call(
      body ?? {},
      "nickname",
    );
    const hasProfilePicture = Object.prototype.hasOwnProperty.call(
      body ?? {},
      "profile_picture",
    );

    if (!hasNickname && !hasProfilePicture) {
      set.status = 400;
      return { error: "no updatable fields provided" };
    }

    const updateParts = [];
    const values = [];

    if (hasNickname) {
      const normalizedNickname = normalizeNullableText(body?.nickname);
      if (normalizedNickname === undefined) {
        set.status = 400;
        return { error: "nickname must be a string or null" };
      }

      values.push(normalizedNickname);
      updateParts.push(`nickname = $${values.length}`);
    }

    if (hasProfilePicture) {
      const normalizedProfilePicture = normalizeNullableText(
        body?.profile_picture,
      );
      if (normalizedProfilePicture === undefined) {
        set.status = 400;
        return { error: "profile_picture must be a string or null" };
      }

      values.push(normalizedProfilePicture);
      updateParts.push(`profile_picture = $${values.length}`);
    }

    values.push(user.id);

    const { rows } = await pool.query(
      `UPDATE users
       SET ${updateParts.join(", ")}
       WHERE id = $${values.length}
       RETURNING id, username, nickname, profile_picture, riot_account, role_id, team_id`,
      values,
    );

    set.status = 200;
    return rows[0] ?? null;
  },
  {
    tags: [TAG],
    summary: "Update current user profile",
    security: [{ bearerAuth: [] }],
  },
);

usersRouter.get(
  "/riot/connect",
  async ({ user, set, query, request }) => {
    if (!user) {
      set.status = 401;
      return { error: "token missing or invalid" };
    }

    if (!config.RIOT_CLIENT_ID || !config.RIOT_CLIENT_SECRET) {
      set.status = 500;
      return { error: "riot oauth is not configured" };
    }

    const returnTo = sanitizeReturnTo(query?.return_to) || "/profile";
    const openRegister = isTruthyFlag(query?.open_register);

    let refererOrigin = null;
    try {
      const referer = request?.headers?.get?.("referer");
      if (referer) refererOrigin = new URL(referer).origin;
    } catch {
      refererOrigin = null;
    }

    const requestOrigin =
      sanitizeOrigin(query?.origin) ||
      sanitizeOrigin(request?.headers?.get?.("origin")) ||
      sanitizeOrigin(refererOrigin) ||
      sanitizeOrigin(config.FRONTEND_BASE_URL);

    const state = jwt.sign(
      {
        uid: Number(user.id),
        returnTo,
        origin: requestOrigin,
        openRegister,
      },
      config.RIOT_STATE_SECRET,
      {
        expiresIn: "10m",
      },
    );

    set.status = 200;
    return {
      url: buildRiotAuthorizeUrl(state),
    };
  },
  {
    tags: [TAG],
    summary: "Create Riot OAuth URL",
    security: [{ bearerAuth: [] }],
  },
);

usersRouter.get(
  "/riot/login",
  ({ set }) => {
    if (!config.RIOT_CLIENT_ID || !config.RIOT_CLIENT_SECRET) {
      set.status = 500;
      return { error: "riot oauth is not configured" };
    }

    return Response.redirect(buildRiotAuthorizeUrl(), 302);
  },
  {
    tags: [TAG],
    summary: "Legacy Riot OAuth entrypoint",
  },
);

usersRouter.get(
  "/riot/callback",
  async ({ query }) => {
    const oauthError = String(query?.error ?? "").trim();
    const oauthErrorDescription = String(query?.error_description ?? "").trim();
    const state = String(query?.state ?? "").trim();

    let returnTo = "/profile";
    let origin = config.FRONTEND_BASE_URL;
    let openRegister = false;

    const redirectExtras = () =>
      openRegister ? { register: "1" } : {};

    if (state) {
      try {
        const decodedState = jwt.verify(state, config.RIOT_STATE_SECRET);
        returnTo = sanitizeReturnTo(decodedState?.returnTo) || "/profile";
        origin = resolveFrontendOrigin(decodedState?.origin);
        openRegister = Boolean(decodedState?.openRegister);
      } catch (stateError) {
        console.error("[riot/callback] invalid oauth state", stateError?.message);
        // Keep defaults when state is invalid; connection itself may still fail below.
      }
    }

    if (oauthError) {
      const reason = oauthErrorDescription || oauthError;
      return Response.redirect(
        buildFrontendRedirectUrl(
          returnTo,
          "failed",
          reason,
          redirectExtras(),
          origin,
        ),
        302,
      );
    }

    const accessCode = String(query?.code ?? "").trim();

    if (!accessCode) {
      return Response.redirect(
        buildFrontendRedirectUrl(
          returnTo,
          "failed",
          "missing code",
          redirectExtras(),
          origin,
        ),
        302,
      );
    }

    try {
      const accessToken = await exchangeRiotCodeForToken(accessCode);
      const riot = await fetchRiotAccountByToken(accessToken);

      if (!state) {
        // Backward-compatible callback mode for older Riot Portal setups.
        return Response.redirect(
          buildFrontendRedirectUrl(
            returnTo,
            "connected",
            "",
            {
              ...redirectExtras(),
              gameName: riot.gameName,
              tagName: riot.tagLine,
            },
            origin,
          ),
          302,
        );
      }

      const decodedState = jwt.verify(state, config.RIOT_STATE_SECRET);
      const userId = Number(decodedState?.uid);
      returnTo = sanitizeReturnTo(decodedState?.returnTo) || returnTo;
      origin = resolveFrontendOrigin(decodedState?.origin || origin);
      openRegister = Boolean(decodedState?.openRegister);

      if (!Number.isFinite(userId)) {
        throw new Error("invalid state");
      }

      const { rows: existingOwners } = await pool.query(
        `
        SELECT id
        FROM users
        WHERE lower(riot_account) = lower($1)
          AND id <> $2
        LIMIT 1
        `,
        [riot.riotAccount, userId],
      );

      if (existingOwners.length > 0) {
        return Response.redirect(
          buildFrontendRedirectUrl(
            returnTo,
            "failed",
            "Riot ID này đã được liên kết với tài khoản khác",
            redirectExtras(),
            origin,
          ),
          302,
        );
      }

      await pool.query("UPDATE users SET riot_account = $1 WHERE id = $2", [
        riot.riotAccount,
        userId,
      ]);

      return Response.redirect(
        buildFrontendRedirectUrl(
          returnTo,
          "connected",
          "",
          {
            ...redirectExtras(),
            gameName: riot.gameName,
            tagName: riot.tagLine,
          },
          origin,
        ),
        302,
      );
    } catch (error) {
      return Response.redirect(
        buildFrontendRedirectUrl(
          returnTo,
          "failed",
          friendlyRiotError(error),
          redirectExtras(),
          origin,
        ),
        302,
      );
    }
  },
  {
    tags: [TAG],
    summary: "Riot OAuth callback",
  },
);

usersRouter.get(
  "/:id",
  async ({ params, set }) => {
    const id = Number(params.id);

    if (!Number.isFinite(id)) {
      set.status = 400;
      return { error: "invalid id" };
    }

    const { rows: user_info } = await pool.query(
      `SELECT id, username, nickname, profile_picture, riot_account, role_id, team_id
     FROM users
     WHERE id = $1`,
      [id],
    );

    if (user_info.length === 0) {
      set.status = 404;
      return { error: "user not found" };
    }

    const team_id = user_info[0].team_id;

    if (team_id !== null) {
      const { rows: team_user_info } = await pool.query(
        `SELECT t.name, t.short_name, t.logo_url, t.team_color_hex, u.nickname AS created_by_name,t.created_by, t.created_at
       FROM teams t
       INNER JOIN users u ON u.id = t.created_by
       WHERE t.id = $1`,
        [team_id],
      );

      set.status = 200;
      return {
        ...user_info[0],
        team: team_user_info[0] ?? null,
      };
    }

    set.status = 200;
    return user_info[0];
  },
  {
    tags: [TAG],
    summary: "Get user by id",
    detail: {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 6 },
          description: "ID người dùng",
        },
      ],
    },
  },
);

export default usersRouter;
