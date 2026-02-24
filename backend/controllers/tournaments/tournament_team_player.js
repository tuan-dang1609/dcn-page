import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";

const playerTourRoute = new Elysia();
const TAG = "Tournament Team Players";

playerTourRoute.get(
  "/:tournament_team_id",
  async ({ params, set }) => {
    const { tournament_team_id } = params;
    const { rows } = await pool.query(
      "SELECT * FROM tournament_team_players WHERE tournament_team_id = $1",
      [Number(tournament_team_id)],
    );
    set.status = 200;
    return rows;
  },
  {
    tags: [TAG],
    summary: "List players by tournament team",
    detail: {
      parameters: [
        {
          name: "tournament_team_id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 1 },
          description: "ID bản ghi đội trong giải đấu",
        },
      ],
    },
  },
);

export default playerTourRoute;
