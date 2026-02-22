import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { sql } from "../utils/db.js";

const loginRouter = express();

loginRouter.post("/", async (request, response, next) => {
  try {
    const { username, password } = request.body ?? {};
    if (!username || !password) {
      return response
        .status(400)
        .json({ error: "username and password are required" });
    }

    const rows = await sql`
      SELECT id, username, nickname, nickname, password_hash
      FROM users
      WHERE username = ${username}`;
    const user = rows[0] ?? null;
    const ok = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;
    if (!user || !ok) {
      return response
        .status(401)
        .json({ error: "invalid username or password" });
    }

    const token = jwt.sign(
      { username: user.username, id: user.id },
      process.env.SECRET ?? "dev-secret",
      { expiresIn: "3000h" },
    );

    return response.json({
      token,
      username: user.username,
      name: user.name ?? user.nickname ?? user.username,
    });
  } catch (error) {
    next(error);
  }
});

export default loginRouter;
