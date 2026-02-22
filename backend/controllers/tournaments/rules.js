import { pool } from "../../utils/db";
import express from "express";

const ruleRouter = express();

ruleRouter.post("/:id", async (request, response) => {
  const id = request.params.id;
  const user = request.user;
  if (!user) {
    return response.status(401).json({ error: "Unauthorized" });
  }
  const payload = Array.isArray(request.body) ? request.body : [request.body];

  if (!payload.length) {
    return response.status(400).json({ error: "Body không được rỗng" });
  }

  for (const item of payload) {
    if (!item?.title || !item?.content) {
      return response.status(400).json({
        error: "Mỗi rule phải có title và content",
      });
    }
  }
  const values = [];
  const placeholders = payload.map((item, index) => {
    const base = index * 3;
    values.push(item.title, item.content, id);
    return `($${base + 1}, $${base + 2}, $${base + 3})`;
  });

  const query = `
    INSERT INTO rules (title, content, tournament_id)
    VALUES ${placeholders.join(", ")}
    RETURNING *;
  `;

  const { rows } = await pool.query(query, values);
  return response.status(201).json({
    message: "Tạo rule thành công",
    data: rows,
  });
});

export default ruleRouter;
