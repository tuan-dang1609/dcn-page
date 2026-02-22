import express from "express";
import { pool } from "../utils/db.js";
const teamRouter = express();

// Xem thông tin tất cả các team
teamRouter.get("/", async (request, response) => {
  const { rows } = await pool.query(
    `SELECT
  t.id,
  t.name,
  t.short_name,
  t.logo_url,
  creator.username        AS created_by_username,
  COALESCE(
    json_agg(
      json_build_object('id', u.id, 'username', u.username, 'profile_picture', u.profile_picture)
      ORDER BY u.id
    ) FILTER (WHERE u.id IS NOT NULL),
    '[]'
  ) AS members
FROM teams t
LEFT JOIN users creator ON creator.id = t.created_by
LEFT JOIN users u       ON u.team_id = t.id
GROUP BY t.id, t.name, t.short_name, t.logo_url, creator.username;`,
  );
  return response.status(200).json(rows);
});

// Thêm team mới
teamRouter.post("/", async (request, response) => {
  const cteSql = `
  WITH new_team AS (
    INSERT INTO teams (name, short_name, logo_url, team_color_hex, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, name, short_name, logo_url, team_color_hex, created_by, created_at
  )
  UPDATE users
  SET team_id = new_team.id,
      role_id = CASE
        WHEN users.role_id IS NULL OR users.role_id > 4 THEN 4
        ELSE users.role_id
      END
  FROM new_team
  WHERE users.id = $5
  RETURNING
    new_team.id     AS team_id,
    new_team.name   AS team_name,
    new_team.short_name,
    new_team.logo_url,
    new_team.team_color_hex,
    new_team.created_by,
    users.id        AS user_id,
    users.username  
`;
  const user_id = request.user.id;

  const { name, short_name, logo_url, team_color_hex } = request.body;

  if (!user_id) {
    return response.status(401).json({ error: "Unathourized" });
  }
  const { rows } = await pool.query(cteSql, [
    name,
    short_name,
    logo_url,
    team_color_hex,
    user_id,
  ]);

  response.status(201).json(rows[0]);
});

// Coi thông tin chi tiết của team
teamRouter.get("/:id", async (request, response) => {
  const id = request.params.id;

  const { rows } = await pool.query(
    `SELECT
  t.id,
  t.name,
  t.short_name,
  t.logo_url,
  creator.username        AS created_by_username,
  COALESCE(
    json_agg(
      json_build_object('id', u.id, 'username', u.username, 'profile_picture', u.profile_picture)
      ORDER BY u.id
    ) FILTER (WHERE u.id IS NOT NULL),
    '[]'
  ) AS members
FROM teams t
LEFT JOIN users creator ON creator.id = t.created_by
LEFT JOIN users u       ON u.team_id = t.id
WHERE t.id = $1
GROUP BY t.id, t.name, t.short_name, t.logo_url, creator.username;`,
    [id],
  );
  return response.status(200).json(rows[0]);
});

// Update thông tin của đội
teamRouter.put("/:id", async (request, response) => {
  const id = request.params.id;
  const user = request.user;
  const { name, team_color_hex, short_name, logo_url } = request.body;
  const { rows: teams } = await pool.query(
    "SELECT * FROM teams WHERE id = $1 FOR UPDATE",
    [id],
  );
  const team = teams[0];
  const allowedRoleIds = new Set([1, 2, 3]);
  if (
    Number(user.id) !== Number(team.created_by) &&
    !allowedRoleIds.has(Number(user.role_id))
  ) {
    return response
      .status(403)
      .json({ error: "Bạn không phải chủ sở hữu team" });
  }

  const { rows } = await pool.query(
    "UPDATE teams SET name = $1, short_name = $2, logo_url = $3, team_color_hex = $4 WHERE id = $5 RETURNING *",
    [name, short_name, logo_url, team_color_hex, id],
  );
  return response.status(200).json(rows[0]);
});

// Thêm user vào đội thông qua team_id và user_ids = []
teamRouter.patch("/:id", async (request, response) => {
  const id = request.params.id;
  const { user_ids } = request.body;
  const user = request.user;
  const allowedRoleIds = new Set([1, 2, 3]);
  console.log(user.id);
  if (!user) {
    return response.status(401).json({ error: "Unathourized" });
  }
  const { rows: teamRows } = await pool.query(
    "SELECT created_by FROM teams WHERE id = $1",
    [id],
  );
  if (teamRows.length === 0)
    return response.status(404).json({ error: "Team not found" });
  const isOwner = Number(user.id) === Number(team.created_by);
  if (!isOwner && !allowedRoleIds.has(Number(user.role_id))) {
    return response
      .status(403)
      .json({ error: "Không có quyền gán user vào team này" });
  }

  await pool.query(
    "UPDATE users SET team_id = $1 WHERE id = ANY($2::bigint[]) RETURNING id, username, team_id",
    [id, user_ids],
  );

  // Return current members of the team
  const { rows } = await pool.query(
    `SELECT t.id, t.name,
        COALESCE(
          json_agg(json_build_object('id', u.id, 'username', u.username) ORDER BY u.id)
          FILTER (WHERE u.id IS NOT NULL),
          '[]'
        ) AS members
       FROM teams t
       LEFT JOIN users u ON u.team_id = t.id
       WHERE t.id = $1
       GROUP BY t.id, t.name;`,
    [id],
  );

  return response.status(200).json(rows[0]);
});

// Xóa đội (Điều kiện là chủ sở hữu mới được xóa)
teamRouter.delete("/:id", async (request, response) => {
  const id = request.params.id;
  const user = request.user;
  const { rows: teams } = await pool.query(
    "SELECT * FROM teams WHERE id = $1 FOR UPDATE",
    [id],
  );
  if (teams.length === 0) {
    return response.status(404).json({ error: "Team not found" });
  }
  const team = teams[0];
  const allowedRoleIds = new Set([1, 2, 3]);
  const isOwner = Number(user.id) === Number(team.created_by);
  if (!isOwner && !allowedRoleIds.has(Number(user.role_id))) {
    return response
      .status(403)
      .json({ error: "Bạn không có quyền xóa team này" });
  }

  await pool.query("UPDATE users SET team_id = NULL WHERE team_id = $1", [id]);

  await pool.query("DELETE FROM teams WHERE id = $1", [id]);
  return response.status(204).end();
});
export default teamRouter;
