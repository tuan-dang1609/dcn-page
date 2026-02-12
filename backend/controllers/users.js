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
  const { rows } = await pool.query(
    `SELECT * FROM users u
    LEFT JOIN teams t ON t.id = u.team_id
    WHERE u.id = $1`,
    [id],
  );
  response.status(200).json(rows[0]);
});

export default usersRouter;
