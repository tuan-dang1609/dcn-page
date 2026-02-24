import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";

const milestoneRouter = new Elysia();
const TAG = "Milestones";

milestoneRouter.post(
  "/:id",
  async ({ params, body, set, user }) => {
    const tournamentId = Number(params.id);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const payload = Array.isArray(body) ? body : [body];

    if (!payload.length) {
      set.status = 400;
      return { error: "Body không được rỗng" };
    }

    for (const item of payload) {
      if (!item?.title || !item?.context) {
        set.status = 400;
        return { error: "Mỗi milestone phải có title và context" };
      }
    }

    const values = [];
    const placeholders = payload.map((item, index) => {
      const base = index * 4;
      values.push(
        item.title,
        item.context,
        tournamentId,
        item.milestone_time ?? null,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });

    const query = `
    INSERT INTO milestones (title, context, tournament_id, milestone_time)
    VALUES ${placeholders.join(", ")}
    RETURNING *;
  `;

    const { rows } = await pool.query(query, values);

    set.status = 201;
    return {
      message: "Tạo milestones thành công",
      data: rows,
    };
  },
  {
    tags: [TAG],
    summary: "Create milestones",
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
              oneOf: [
                {
                  type: "object",
                  required: ["title", "context"],
                  properties: {
                    title: { type: "string" },
                    context: { type: "string" },
                    milestone_time: { type: "string", format: "date-time" },
                  },
                },
                {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["title", "context"],
                    properties: {
                      title: { type: "string" },
                      context: { type: "string" },
                      milestone_time: {
                        type: "string",
                        format: "date-time",
                      },
                    },
                  },
                },
              ],
            },
            examples: {
              singleSample: {
                value: {
                  title: "Check-in",
                  context: "Đến sớm 15 phút và xác nhận danh sách đội.",
                  milestone_time: "2026-03-01T07:45:00.000Z",
                },
              },
              multiSample: {
                value: [
                  {
                    title: "Vòng bảng",
                    context:
                      "Thi đấu BO1.\nMỗi đội đánh 4 trận trong ngày đầu tiên.",
                    milestone_time: "2026-03-01T09:00:00.000Z",
                  },
                  {
                    title: "Playoff",
                    context: "Top 8 vào nhánh loại trực tiếp BO3.",
                    milestone_time: "2026-03-05T09:00:00.000Z",
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
);

export default milestoneRouter;
