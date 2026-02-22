import express from "express";
import { pool } from "../../utils/db.js";

const requirementRouter = express();

function toPgTextArray(arr) {
  // arr: string[]
  if (!Array.isArray(arr)) return null;
  // quote each element and escape backslash + double-quote
  const quoted = arr.map(
    (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
  );
  return `{${quoted.join(",")}}`;
}

requirementRouter.post("/:id", async (request, response) => {
  const id = request.params.id;
  const user = request.user;
  if (!user) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  const { rank_min, rank_max, devices, discord } = request.body;

  const all_devices = Array.isArray(devices)
    ? devices
    : devices
      ? [String(devices)]
      : null;

  const deviceLiteral = all_devices ? toPgTextArray(all_devices) : null;

  const { rows } = await pool.query(
    `INSERT INTO requirements (rank_min, rank_max, device, discord, tournament_id)
       VALUES ($1, $2, $3::text[], $4, $5)
       RETURNING *`,
    [rank_min, rank_max, deviceLiteral, discord, id],
  );

  return response.status(201).json(rows[0]);
});

export default requirementRouter;
