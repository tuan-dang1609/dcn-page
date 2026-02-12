// handlers/login.js
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { sql } from "../utils/db.js";

export default async function loginHandler(req) {
  const { username, password } = await req.json();
  const rows =
    await sql`SELECT id, username, nickname, password_hash FROM users WHERE username = ${username}`;
  const user = rows[0] || null;
  const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !ok)
    return new Response(
      JSON.stringify({ error: "invalid username or password" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  const token = jwt.sign(
    { username: user.username, id: user.id },
    process.env.SECRET || "dev-secret",
    { expiresIn: "300h" },
  );
  return new Response(
    JSON.stringify({ token, username: user.username, name: user.name }),
    { headers: { "Content-Type": "application/json" } },
  );
}
