import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";
const requirementRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Requirements";

function toPgTextArray(arr) {
  if (!Array.isArray(arr)) return null;
  const quoted = arr.map(
    (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
  );
  return `{${quoted.join(",")}}`;
}

requirementRouter.post(
  "/:id",
  async ({ params, body, set, user }) => {
    const id = Number(params.id);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { rank_min, rank_max, devices, discord } = body ?? {};

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

    set.status = 201;
    return rows[0];
  },
  {
    tags: [TAG],
    summary: "Create tournament requirements",
    detail: {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 1 },
          description: "ID giải đấu",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["rank_min", "rank_max"],
              properties: {
                rank_min: { type: "integer", example: 1 },
                rank_max: { type: "integer", example: 10 },
                devices: {
                  oneOf: [
                    { type: "array", items: { type: "string" } },
                    { type: "string" },
                  ],
                  description:
                    "Thiết bị cho phép: nhập mảng hoặc 1 chuỗi plain text",
                },
                discord: {
                  type: "string",
                  example: "https://discord.gg/dcn-community",
                },
              },
            },
            examples: {
              arrayDevice: {
                value: {
                  rank_min: 1,
                  rank_max: 10,
                  devices: ["PC", "Mobile"],
                  discord: "https://discord.gg/dcn-community",
                },
              },
              plainTextDevice: {
                value: {
                  rank_min: 1,
                  rank_max: 10,
                  devices: "PC",
                  discord: "https://discord.gg/dcn-community",
                },
              },
            },
          },
        },
      },
    },
  },
);

export default requirementRouter;
