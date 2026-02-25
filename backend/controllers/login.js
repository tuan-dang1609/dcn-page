import { Elysia } from "elysia";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { pool } from "../utils/db.js";

const loginRouter = new Elysia({ name: "Auth" });
const TAG = "Auth";

loginRouter.post(
  "/",
  async ({ body, set }) => {
    try {
      const { username, password } = body ?? {};

      if (!username || !password) {
        set.status = 400;
        return { error: "username and password are required" };
      }

      const { rows } = await pool.query(
        `
    SELECT id, username, nickname, password_hash
    FROM users
    WHERE username = $1
  `,
        [username],
      );

      const user = rows[0] ?? null;
      const ok = user
        ? await bcrypt.compare(password, user.password_hash)
        : false;

      if (!user || !ok) {
        set.status = 401;
        return { error: "invalid username or password" };
      }

      const token = jwt.sign(
        { username: user.username, id: user.id },
        process.env.SECRET ?? "dev-secret",
        { expiresIn: "3000h" },
      );

      return {
        token,
        username: user.username,
        name: user.nickname ?? user.username,
      };
    } catch (error) {
      set.status = 500;
      return { error: error?.message || "internal server error" };
    }
  },
  {
    tags: [TAG],
    summary: "Login",
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
                password: { type: "string", example: "123456" },
              },
            },
          },
        },
      },
    },
  },
);

export default loginRouter;
