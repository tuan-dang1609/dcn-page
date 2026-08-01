import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";
const milestoneRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Milestones";

let ensureMilestonesSchemaPromise = null;

const ensureMilestonesSchema = async () => {
  if (!ensureMilestonesSchemaPromise) {
    ensureMilestonesSchemaPromise = pool
      .query(
        `
        ALTER TABLE milestones
          ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
        `,
      )
      .catch((error) => {
        ensureMilestonesSchemaPromise = null;
        throw error;
      });
  }

  return ensureMilestonesSchemaPromise;
};

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
    await ensureMilestonesSchema();

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

    const { rows: orderRows } = await pool.query(
      `
      SELECT COALESCE(MAX(sort_order), -1)::int AS max_order
      FROM milestones
      WHERE tournament_id = $1
      `,
      [tournamentId],
    );
    const startOrder = Number(orderRows[0]?.max_order ?? -1) + 1;

    const values = [];
    const placeholders = payload.map((item, index) => {
      const base = index * 5;
      values.push(
        item.title,
        item.context,
        tournamentId,
        item.milestone_time ?? null,
        Number.isFinite(Number(item.sort_order))
          ? Number(item.sort_order)
          : startOrder + index,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    });

    const query = `
    INSERT INTO milestones (title, context, tournament_id, milestone_time, sort_order)
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
                    sort_order: { type: "integer" },
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
                      sort_order: { type: "integer" },
                    },
                  },
                },
              ],
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
    await ensureMilestonesSchema();

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

    for (const [index, item] of payload.entries()) {
      if (!item?.title || !item?.context) {
        set.status = 400;
        return { error: "Mỗi milestone phải có title và context" };
      }

      const sortOrder = Number.isFinite(Number(item.sort_order))
        ? Number(item.sort_order)
        : index;

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
          sort_order: sortOrder,
        });
      } else {
        insertItems.push({
          title: item.title,
          context: item.context,
          milestone_time: item.milestone_time ?? null,
          sort_order: sortOrder,
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
          SET title = $1,
              context = $2,
              milestone_time = $3,
              sort_order = $4
          WHERE id = $5 AND tournament_id = $6
          `,
        [
          item.title,
          item.context,
          item.milestone_time,
          item.sort_order,
          item.id,
          tournamentId,
        ],
      );
    }

    if (insertItems.length > 0) {
      const insertValues = [];
      const insertPlaceholders = insertItems.map((item, index) => {
        const base = index * 5;
        insertValues.push(
          item.title,
          item.context,
          tournamentId,
          item.milestone_time,
          item.sort_order,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      });

      await pool.query(
        `
          INSERT INTO milestones (title, context, tournament_id, milestone_time, sort_order)
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
        ORDER BY sort_order ASC, id ASC
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
  },
);

export default milestoneRouter;
