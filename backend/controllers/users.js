import bcrypt from "bcryptjs";
import { Elysia } from "elysia";
import { pool } from "../utils/db.js";

const usersRouter = new Elysia({ name: "Users" });
const TAG = "Users";
usersRouter.post(
  "/",
  async ({ body, set }) => {
    const { username, nickname, password } = body ?? {};

    if (!username || !password || username.length < 3 || password.length < 3) {
      set.status = 400;
      return { error: "username or password must be over 3 characters long" };
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const { rows } = await pool.query(
      "INSERT INTO users(nickname,username,password_hash) VALUES ($1,$2,$3) RETURNING nickname, username",
      [nickname ?? null, username, passwordHash],
    );

    set.status = 201;
    return rows;
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
