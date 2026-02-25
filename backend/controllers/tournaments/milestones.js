import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";
const milestoneRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Milestones";

const normalizeMilestonePayload = (body) => {
  if (Array.isArray(body)) {
    return body;
  }

  if (Array.isArray(body?.milestones)) {
    return body.milestones;
  }

  if (body && typeof body === "object") {
    return [body];
  }

  return [];
};

milestoneRouter.post(
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

    const payload = normalizeMilestonePayload(body);

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

milestoneRouter.patch(
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
      : Array.isArray(body?.milestones)
        ? body.milestones
        : null;

    if (!Array.isArray(payload)) {
      set.status = 400;
      return { error: "Body phải là mảng milestones hoặc { milestones: [] }" };
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
      return { error: "Bạn không có quyền cập nhật milestone của giải này" };
    }

    if (payload.length === 0) {
      const { rowCount } = await pool.query(
        "DELETE FROM milestones WHERE tournament_id = $1",
        [tournamentId],
      );

      set.status = 200;
      return {
        message: "Đã xóa toàn bộ milestones của giải",
        deleted_count: rowCount,
      };
    }

    const updateItems = [];
    const insertItems = [];
    const incomingIds = [];

    for (const item of payload) {
      if (!item?.title || !item?.context) {
        set.status = 400;
        return { error: "Mỗi milestone phải có title và context" };
      }

      const rawId = item?.id;
      const hasId = rawId !== undefined && rawId !== null && rawId !== "";

      if (hasId) {
        const milestoneId = Number(rawId);
        if (!Number.isFinite(milestoneId)) {
          set.status = 400;
          return { error: "id milestone không hợp lệ" };
        }
        incomingIds.push(milestoneId);
        updateItems.push({
          id: milestoneId,
          title: item.title,
          context: item.context,
          milestone_time: item.milestone_time ?? null,
        });
      } else {
        insertItems.push({
          title: item.title,
          context: item.context,
          milestone_time: item.milestone_time ?? null,
        });
      }
    }

    if (new Set(incomingIds).size !== incomingIds.length) {
      set.status = 400;
      return { error: "Danh sách milestone bị trùng id" };
    }

    const { rows: existingMilestones } = await pool.query(
      "SELECT id FROM milestones WHERE tournament_id = $1",
      [tournamentId],
    );

    const existingIds = existingMilestones.map((row) => Number(row.id));
    const existingIdSet = new Set(existingIds);

    for (const id of incomingIds) {
      if (!existingIdSet.has(id)) {
        set.status = 404;
        return {
          error: "Một hoặc nhiều milestone không tồn tại trong giải đấu này",
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
        `DELETE FROM milestones WHERE tournament_id = $1 AND id IN (${deleteIdPlaceholders})`,
        [tournamentId, ...deleteIds],
      );
    }

    for (const item of updateItems) {
      await pool.query(
        `
          UPDATE milestones
          SET title = $1, context = $2, milestone_time = $3
          WHERE id = $4 AND tournament_id = $5
          `,
        [item.title, item.context, item.milestone_time, item.id, tournamentId],
      );
    }

    if (insertItems.length > 0) {
      const insertValues = [];
      const insertPlaceholders = insertItems.map((item, index) => {
        const base = index * 4;
        insertValues.push(
          item.title,
          item.context,
          tournamentId,
          item.milestone_time,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      });

      await pool.query(
        `
          INSERT INTO milestones (title, context, tournament_id, milestone_time)
          VALUES ${insertPlaceholders.join(", ")}
          `,
        insertValues,
      );
    }

    const { rows: syncedMilestones } = await pool.query(
      `
        SELECT *
        FROM milestones
        WHERE tournament_id = $1
        ORDER BY id
        `,
      [tournamentId],
    );

    set.status = 200;
    return {
      message: "Sync milestones thành công",
      data: syncedMilestones,
    };
  },
  {
    tags: [TAG],
    summary: "Sync milestones",
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
                    required: ["title", "context"],
                    properties: {
                      id: { type: "integer" },
                      title: { type: "string" },
                      context: { type: "string" },
                      milestone_time: { type: "string", format: "date-time" },
                    },
                  },
                },
                {
                  type: "object",
                  properties: {
                    milestones: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["title", "context"],
                        properties: {
                          id: { type: "integer" },
                          title: { type: "string" },
                          context: { type: "string" },
                          milestone_time: {
                            type: "string",
                            format: "date-time",
                          },
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
                    title: "Vòng bảng - cập nhật",
                    context: "Thi đấu BO1, cập nhật lịch mới.",
                    milestone_time: "2026-03-01T10:00:00.000Z",
                  },
                  {
                    title: "Chung kết",
                    context: "Trận BO5 tìm nhà vô địch.",
                    milestone_time: "2026-03-06T13:00:00.000Z",
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

export default milestoneRouter;
