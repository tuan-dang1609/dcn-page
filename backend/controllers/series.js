import { Elysia } from "elysia";
import { pool } from "../utils/db.js";
import middleware from "../utils/middleware.js";
import {
  ensureDefaultSeriesPointRules,
  ensureRankingTables,
  recalculateTournamentResults,
} from "../utils/tournamentRanking.js";

const seriesRouter = new Elysia({ name: "Series" }).derive(
  middleware.deriveAuthContext,
);
const TAG = "Series";

seriesRouter.get(
  "/:slug/leaderboard",
  async ({ params, set }) => {
    const slug = params.slug;

    const { rows: seriesRows } = await pool.query(
      `SELECT * FROM series WHERE slug = $1 OR id::text = $1 LIMIT 1`,
      [slug],
    );

    if (!seriesRows[0]) {
      set.status = 404;
      return { error: "series not found" };
    }

    const series = seriesRows[0];
    const seriesId = Number(series.id);

    await ensureRankingTables();
    await ensureDefaultSeriesPointRules(seriesId);

    const { rows: tournamentRows } = await pool.query(
      "SELECT id FROM tournaments WHERE series_id = $1",
      [seriesId],
    );

    for (const tournament of tournamentRows) {
      await recalculateTournamentResults(Number(tournament.id));
    }

    const { rows } = await pool.query(
      `
      SELECT
        st.series_id,
        st.team_id,
        st.total_points,
        st.tournaments_played,
        st.updated_at,
        t.name,
        t.short_name,
        t.logo_url,
        t.team_color_hex
      FROM series_team_totals st
      JOIN teams t ON t.id = st.team_id
      WHERE st.series_id = $1
      ORDER BY st.total_points DESC, st.tournaments_played DESC, t.id ASC
      `,
      [seriesId],
    );

    const leaderboard = rows.map((row, index) => ({
      placement: index + 1,
      ...row,
    }));

    set.status = 200;
    return {
      status: "success",
      info: {
        series_id: seriesId,
        series_slug: series.slug,
        leaderboard,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Get series leaderboard from accumulated team points",
  },
);

seriesRouter.get(
  "/:slug",
  async ({ params, set }) => {
    const slug = params.slug;
    const { rows } = await pool.query(
      `SELECT * FROM series WHERE slug = $1 OR id::text = $1 LIMIT 1`,
      [slug],
    );

    if (!rows[0]) {
      set.status = 404;
      return { error: "series not found" };
    }

    const series = rows[0];
    const seriesId = series.id;

    const { rows: all_tournaments } = await pool.query(
      `
    SELECT t.id, t.name, g.short_name, g.name AS game_name, g.icon_game_url, f.name AS format, t.banner_url, t.season, t.date_start,
          t.date_end, t.register_start, t.register_end,
          COALESCE(t.check_in_start, t.register_start) AS check_in_start,
          COALESCE(t.check_in_end, t.register_end) AS check_in_end,
          t.created_by, t.max_player_per_team, t.max_participate,
          (SELECT COUNT(*)::int FROM tournament_teams WHERE tournament_id = t.id) AS registered_count,
          t.slug
       FROM tournaments t
       JOIN games g ON t.game_id = g.id
       JOIN formats f ON f.id = t.format_id
       WHERE t.series_id = $1`,
      [seriesId],
    );

    const { rows: participating_teams } = await pool.query(
      `SELECT
         t.id AS team_id,
         t.name,
         t.short_name,
         t.logo_url,
         t.team_color_hex,
         u.nickname AS created_by_name,
         COUNT(DISTINCT tt.tournament_id)::int AS tournaments_joined,
         ARRAY_AGG(DISTINCT tt.tournament_id ORDER BY tt.tournament_id) AS tournament_ids
       FROM tournament_teams tt
       JOIN tournaments tr ON tr.id = tt.tournament_id
       JOIN teams t ON t.id = tt.team_id
       LEFT JOIN users u ON u.id = t.created_by
       WHERE tr.series_id = $1
       GROUP BY t.id, t.name, t.short_name, t.logo_url, t.team_color_hex, u.nickname
       ORDER BY tournaments_joined DESC, t.name ASC`,
      [seriesId],
    );

    set.status = 200;
    return {
      status: "success",
      info: {
        ...series,
        all_tournaments,
        participating_teams,
      },
    };
  },
  {
    tags: [TAG],
    summary: "Get series by slug",
    detail: {
      parameters: [
        {
          name: "slug",
          in: "path",
          required: true,
          schema: { type: "string", example: "dcn-series" },
          description: "Series slug",
        },
      ],
    },
  },
);

export default seriesRouter;
