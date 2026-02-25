import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";
const ruleRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Rules";

const normalizeRulePayload = (body) => {
  if (Array.isArray(body)) {
    return body;
  }

  if (Array.isArray(body?.rules)) {
    return body.rules;
  }

  if (body && typeof body === "object") {
    return [body];
  }

  return [];
};

ruleRouter.post(
  "/:id",
  async ({ params, body, set, user }) => {
    const tournamentId = Number(params.id);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    if (!Number.isFinite(tournamentId)) {
      set.status = 400;
      return { error: "ID giải đấu không hợp lệ" };
    }

    const payload = normalizeRulePayload(body);

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

ruleRouter.patch(
  "/:id",
  async ({ params, body, set, user }) => {
    const tournamentId = Number(params.id);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    if (!Number.isFinite(tournamentId)) {
      set.status = 400;
      return { error: "ID giải đấu không hợp lệ" };
    }

    const payload = Array.isArray(body)
      ? body
      : Array.isArray(body?.rules)
        ? body.rules
        : null;

    if (!Array.isArray(payload)) {
      set.status = 400;
      return { error: "Body phải là mảng rules hoặc { rules: [] }" };
    }

    const { rows: tournaments } = await pool.query(
      "SELECT created_by FROM tournaments WHERE id = $1",
      [tournamentId],
    );

    if (tournaments.length === 0) {
      set.status = 404;
      return { error: "Tournament not found" };
    }

    const allowedRoleIds = new Set([1, 2, 3]);
    const isOwner = Number(user.id) === Number(tournaments[0].created_by);
    const hasRolePermission = allowedRoleIds.has(Number(user.role_id));

    if (!isOwner && !hasRolePermission) {
      set.status = 403;
      return { error: "Bạn không có quyền cập nhật rules của giải này" };
    }

    if (payload.length === 0) {
      const { rowCount } = await pool.query(
        "DELETE FROM rules WHERE tournament_id = $1",
        [tournamentId],
      );

      set.status = 200;
      return {
        message: "Đã xóa toàn bộ rules của giải",
        deleted_count: rowCount,
      };
    }

    const updateItems = [];
    const insertItems = [];
    const incomingIds = [];

    for (const item of payload) {
      if (!item?.title || !item?.content) {
        set.status = 400;
        return { error: "Mỗi rule phải có title và content" };
      }

      const rawId = item?.id;
      const hasId = rawId !== undefined && rawId !== null && rawId !== "";

      if (hasId) {
        const ruleId = Number(rawId);
        if (!Number.isFinite(ruleId)) {
          set.status = 400;
          return { error: "id rule không hợp lệ" };
        }

        incomingIds.push(ruleId);
        updateItems.push({
          id: ruleId,
          title: item.title,
          content: item.content,
        });
      } else {
        insertItems.push({
          title: item.title,
          content: item.content,
        });
      }
    }

    if (new Set(incomingIds).size !== incomingIds.length) {
      set.status = 400;
      return { error: "Danh sách rule bị trùng id" };
    }

    const { rows: existingRules } = await pool.query(
      "SELECT id FROM rules WHERE tournament_id = $1",
      [tournamentId],
    );

    const existingIds = existingRules.map((row) => Number(row.id));
    const existingIdSet = new Set(existingIds);

    for (const id of incomingIds) {
      if (!existingIdSet.has(id)) {
        set.status = 404;
        return {
          error: "Một hoặc nhiều rule không tồn tại trong giải đấu này",
        };
      }
    }

    const keepIdSet = new Set(incomingIds);
    const deleteIds = existingIds.filter((id) => !keepIdSet.has(id));

    if (deleteIds.length > 0) {
      const deleteIdPlaceholders = deleteIds
        .map((_, index) => `$${index + 2}`)
        .join(", ");

      await pool.query(
        `DELETE FROM rules WHERE tournament_id = $1 AND id IN (${deleteIdPlaceholders})`,
        [tournamentId, ...deleteIds],
      );
    }

    for (const item of updateItems) {
      await pool.query(
        `
        UPDATE rules
        SET title = $1, content = $2
        WHERE id = $3 AND tournament_id = $4
        `,
        [item.title, item.content, item.id, tournamentId],
      );
    }

    if (insertItems.length > 0) {
      const insertValues = [];
      const insertPlaceholders = insertItems.map((item, index) => {
        const base = index * 3;
        insertValues.push(item.title, item.content, tournamentId);
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      });

      await pool.query(
        `
        INSERT INTO rules (title, content, tournament_id)
        VALUES ${insertPlaceholders.join(", ")}
        `,
        insertValues,
      );
    }

    const { rows: syncedRules } = await pool.query(
      `
      SELECT *
      FROM rules
      WHERE tournament_id = $1
      ORDER BY id
      `,
      [tournamentId],
    );

    set.status = 200;
    return {
      message: "Sync rules thành công",
      data: syncedRules,
    };
  },
  {
    tags: [TAG],
    summary: "Sync rules",
    security: [{ bearerAuth: [] }],
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
                  type: "array",
                  items: {
                    type: "object",
                    required: ["title", "content"],
                    properties: {
                      id: { type: "integer" },
                      title: { type: "string" },
                      content: { type: "string" },
                    },
                  },
                },
                {
                  type: "object",
                  properties: {
                    rules: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["title", "content"],
                        properties: {
                          id: { type: "integer" },
                          title: { type: "string" },
                          content: { type: "string" },
                        },
                      },
                    },
                  },
                },
              ],
            },
            examples: {
              syncMixed: {
                value: [
                  {
                    id: 10,
                    title: "Quy định tên đội",
                    content: "Không dùng từ ngữ phản cảm.",
                  },
                  {
                    title: "Quy định xử phạt",
                    content: "Trễ giờ quá 15 phút sẽ bị xử thua.",
                  },
                ],
              },
              clearAll: {
                value: [],
              },
            },
          },
        },
      },
    },
  },
);

export default ruleRouter;
