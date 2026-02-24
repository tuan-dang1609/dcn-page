import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";

const ruleRouter = new Elysia();
const TAG = "Rules";

ruleRouter.post(
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
      if (!item?.title || !item?.content) {
        set.status = 400;
        return { error: "Mỗi rule phải có title và content" };
      }
    }

    const values = [];
    const placeholders = payload.map((item, index) => {
      const base = index * 3;
      values.push(item.title, item.content, tournamentId);
      return `($${base + 1}, $${base + 2}, $${base + 3})`;
    });

    const query = `
    INSERT INTO rules (title, content, tournament_id)
    VALUES ${placeholders.join(", ")}
    RETURNING *;
  `;

    const { rows } = await pool.query(query, values);

    set.status = 201;
    return {
      message: "Tạo rule thành công",
      data: rows,
    };
  },
  {
    tags: [TAG],
    summary: "Create rules",
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
                  required: ["title", "content"],
                  properties: {
                    title: { type: "string" },
                    content: { type: "string" },
                  },
                },
                {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["title", "content"],
                    properties: {
                      title: { type: "string" },
                      content: { type: "string" },
                    },
                  },
                },
              ],
            },
            examples: {
              singleSample: {
                value: {
                  title: "Quy định tên đội",
                  content: "Tên đội không chứa ký tự đặc biệt hoặc từ ngữ cấm.",
                },
              },
              plainTextMultiLine: {
                value: {
                  title: "Quy định thi đấu",
                  content:
                    "1) Nghiêm cấm gian lận.\n2) Đúng giờ thi đấu.\n3) Khiếu nại trong 15 phút sau trận.",
                },
              },
            },
          },
        },
      },
    },
  },
);

export default ruleRouter;
