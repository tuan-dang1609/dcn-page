import bcrypt from "bcryptjs";
import { Elysia } from "elysia";
import { pool } from "../utils/db.js";

const usersRouter = new Elysia({ name: "Users" });
const TAG = "Users";

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
      const avatarUrl = profile_picture ?? logo_url ?? null;

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

usersRouter.get(
  "/:id",
  async ({ params, set }) => {
    const id = Number(params.id);

    if (!Number.isFinite(id)) {
      set.status = 400;
      return { error: "invalid id" };
    }

    const { rows: user_info } = await pool.query(
      `SELECT id, nickname, profile_picture, riot_account, role_id, team_id
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
