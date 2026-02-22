import express from "express";
import { pool } from "../../utils/db.js";
const tournamentRouter = express();

function slugify(s) {
  return String(s || "")
    .normalize("NFKD") // tách dấu
    .replace(/[\u0300-\u036f]/g, "") // bỏ dấu
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_") // thay nhóm ký tự thành -
    .replace(/^-+|-+$/g, ""); // bỏ - đầu/cuối
}

tournamentRouter.get("/:game/:slug", async (request, response) => {
  const { game, slug } = request.params;
  try {
    const { rows: tRows } = await pool.query(
      `SELECT t.id, t.name, g.short_name, g.name, g.icon_game_url, f.name AS format, t.banner_url, t.season, t.date_start,
              t.date_end, t.register_start, t.register_end, t.created_by, t.max_player_per_team, t.max_participate
              g.name AS game_name
       FROM tournaments t
       JOIN games g ON t.game_id = g.id
       JOIN formats f ON f.id = t.format_id
       WHERE g.short_name = $1 AND t.slug = $2
       LIMIT 1`,
      [game, slug],
    );

    if (tRows.length === 0) {
      return response.status(404).json({
        status: "error",
        error: { code: "NOT_FOUND", message: "Tournament not found" },
      });
    }
    const tournament = tRows[0];

    const { rows: mRows } = await pool.query(
      "SELECT id, title, context, milestone_time FROM milestones WHERE tournament_id = $1 ORDER BY milestone_time",
      [tournament.id],
    );

    const { rows: rulesRows } = await pool.query(
      "SELECT * FROM rules WHERE tournament_id = $1 ORDER BY id",
      [tournament.id],
    );

    const { rows: requirementRows } = await pool.query(
      `SELECT r.device, r.discord, rg1.name AS rank_min, rg2.name AS rank_max FROM requirements r 
      JOIN rank_game rg1 ON rg1.id = r.rank_min
      JOIN rank_game rg2 ON rg2.id = r.rank_max
      WHERE tournament_id = $1 ORDER BY r.id`,
      [tournament.id],
    );

    const { rows: creatorRows } = await pool.query(
      "SELECT nickname, profile_picture FROM users WHERE id = $1",
      [tournament.created_by],
    );

    return response.status(200).json({
      status: "success",
      info: {
        ...tournament,
        rule: rulesRows,
        requirement: requirementRows[0],
        milestones: mRows,
        created_by: creatorRows[0] || null,
      },
    });
  } catch (err) {
    console.error(err);
    return response.status(500).json({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "Database error" },
    });
  }
});

tournamentRouter.get("/", async (request, response) => {
  const { rows } = await pool.query("SELECT * FROM tournaments");
  return response.status(200).json(rows);
});

tournamentRouter.post("/", async (request, response) => {
  const user_id = request.user.id;
  if (!user_id) {
    return response.status(401).json({ error: "Unauthorized" });
  }
  const {
    name,
    game_id,
    banner_url,
    season,
    date_start,
    date_end,
    register_start,
    register_end,
    max_player_per_team,
    max_participate,
  } = request.body;
  const slug = slugify(name);
  // lưu slug cùng với các trường khác
  const ctesql = `INSERT INTO tournaments (name, slug, game_id, banner_url, season, date_start,
  date_end, register_start, register_end, created_by, max_player_per_team, max_participate) 
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`;

  const { rows } = await pool.query(ctesql, [
    name,
    slug,
    game_id,
    banner_url,
    season,
    date_start,
    date_end,
    register_start,
    register_end,
    user_id,
    max_player_per_team,
    max_participate,
  ]);
  response.status(201).json({ message: "Tạo giải thành công", data: rows[0] });
});

export default tournamentRouter;
