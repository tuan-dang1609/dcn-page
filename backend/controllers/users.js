import bcrypt from "bcryptjs";
import express from "express";
import { pool } from "../utils/db.js";
const usersRouter = express();
usersRouter.post("/", async (request, response) => {
  const { username, nickname, password } = request.body;
  if (username.length < 3 || password.length < 3) {
    response
      .status(400)
      .json({ error: "username or password must be over 3 characters long" });
  }
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const { rows } = await pool.query(
    "INSERT INTO users(nickname,username,password_hash) VALUES ($1,$2,$3) RETURNING nickname, username",
    [nickname, username, passwordHash],
  );

  response.status(201).json(rows);
});

usersRouter.get("/:id", async (request, response) => {
  const id = request.params.id;
  const { rows: user_info } = await pool.query(
    `SELECT id, nickname, profile_picture, riot_account, role_id, team_id FROM users
    WHERE id = $1`,
    [id],
  );
  const team_id = user_info[0].team_id;
  if (team_id !== null) {
    const { rows: team_user_info } = await pool.query(
      `SELECT t.name, t.short_name, t.logo_url, t.team_color_hex, u.nickname AS created_by, t.created_at FROM teams t
      INNER JOIN users u ON u.id = t.created_by
      WHERE t.id = $1`,
      [team_id],
    );
    return response.status(200).json({
      ...user_info[0],
      team: team_user_info[0],
    });
  } else {
    return response.status(200).json(user_info[0]);
  }
});

export default usersRouter;
