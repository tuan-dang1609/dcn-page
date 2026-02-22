import express from "express";
import { pool } from "../../utils/db";

const milestoneRouter = express();

milestoneRouter.post("/:id", async (request, response) => {
  const tournamentId = request.params.id;
  const user = request.user;

  if (!user) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  const payload = Array.isArray(request.body) ? request.body : [request.body];

  if (!payload.length) {
    return response.status(400).json({ error: "Body không được rỗng" });
  }

  for (const item of payload) {
    if (!item?.title || !item?.context) {
      return response.status(400).json({
        error: "Mỗi milestone phải có title và context",
      });
    }
  }

  const values = [];
  const placeholders = payload.map((item, index) => {
    const base = index * 4;
    values.push(item.title, item.context, tournamentId, item.milestone_time);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
  });

  const query = `
    INSERT INTO milestones (title, context, tournament_id, milestone_time)
    VALUES ${placeholders.join(", ")}
    RETURNING *;
  `;

  const { rows } = await pool.query(query, values);
  return response.status(201).json({
    message: "Tạo milestones thành công",
    data: rows,
  });
});

export default milestoneRouter;
