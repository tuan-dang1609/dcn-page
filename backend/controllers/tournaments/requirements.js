import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";
const requirementRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Requirements";

const ensureTournamentManagePermission = async (user, tournamentId, set) => {
  if (!user) {
    set.status = 401;
    return { ok: false, error: { error: "Unauthorized" } };
  }

  const { rows } = await pool.query(
    "SELECT id, created_by FROM tournaments WHERE id = $1",
    [tournamentId],
  );

  if (rows.length === 0) {
    set.status = 404;
    return { ok: false, error: { error: "Tournament not found" } };
  }

  const isOwner = Number(user.id) === Number(rows[0].created_by);
  const allowedRoleIds = new Set([1, 2, 3]);
  const hasRolePermission = allowedRoleIds.has(Number(user.role_id));

  if (!isOwner && !hasRolePermission) {
    set.status = 403;
    return {
      ok: false,
      error: { error: "Bạn không có quyền cập nhật yêu cầu của giải này" },
    };
  }

  return { ok: true };
};

function toPgTextArray(arr) {
  if (!Array.isArray(arr)) return null;
  const quoted = arr.map(
    (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
  );
  return `{${quoted.join(",")}}`;
}

const normalizeDiscordBoolean = (value) => {
  if (value === undefined) return { hasValue: false, value: undefined };
  if (typeof value === "boolean") return { hasValue: true, value };
  if (value === null || value === "") return { hasValue: true, value: false };

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) {
      return { hasValue: true, value: true };
    }
    if (["false", "0", "no", "n"].includes(normalized)) {
      return { hasValue: true, value: false };
    }
  }

  return { hasValue: true, value: null };
};

requirementRouter.get(
  "/ranks",
  async ({ set }) => {
    const { rows } = await pool.query(
      "SELECT id, name FROM rank_game ORDER BY id ASC",
    );

    set.status = 200;
    return { data: rows };
  },
  {
    tags: [TAG],
    summary: "List rank options",
  },
);

requirementRouter.post(
  "/:id",
  async ({ params, body, set, user }) => {
    const id = Number(params.id);

    if (!Number.isFinite(id)) {
      set.status = 400;
      return { error: "ID giải đấu không hợp lệ" };
    }

    const permission = await ensureTournamentManagePermission(user, id, set);
    if (!permission.ok) return permission.error;

    const { rows: existingRows } = await pool.query(
      "SELECT id FROM requirements WHERE tournament_id = $1 ORDER BY id ASC LIMIT 1",
      [id],
    );

    if (existingRows.length > 0) {
      set.status = 409;
      return {
        error:
          "Tournament đã có requirements. Hãy dùng PATCH /api/tournaments/requirements/:id để cập nhật.",
      };
    }

    const { rank_min, rank_max, devices, discord } = body ?? {};
    const parsedDiscord = normalizeDiscordBoolean(discord);

    if (parsedDiscord.hasValue && parsedDiscord.value === null) {
      set.status = 400;
      return { error: "discord phải là boolean true/false" };
    }

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
      [rank_min, rank_max, deviceLiteral, parsedDiscord.value ?? false, id],
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
                  type: "boolean",
                  example: true,
                },
              },
            },
            examples: {
              arrayDevice: {
                value: {
                  rank_min: 1,
                  rank_max: 10,
                  devices: ["PC", "Mobile"],
                  discord: true,
                },
              },
              plainTextDevice: {
                value: {
                  rank_min: 1,
                  rank_max: 10,
                  devices: "PC",
                  discord: false,
                },
              },
            },
          },
        },
      },
    },
  },
);

requirementRouter.patch(
  "/:id",
  async ({ params, body, set, user }) => {
    const tournamentId = Number(params.id);

    if (!Number.isFinite(tournamentId)) {
      set.status = 400;
      return { error: "ID giải đấu không hợp lệ" };
    }

    const permission = await ensureTournamentManagePermission(
      user,
      tournamentId,
      set,
    );
    if (!permission.ok) return permission.error;

    const hasDevicesField = Object.prototype.hasOwnProperty.call(
      body ?? {},
      "devices",
    );
    const hasDiscordField = Object.prototype.hasOwnProperty.call(
      body ?? {},
      "discord",
    );

    const { rank_min, rank_max, devices, discord } = body ?? {};
    const parsedDiscord = normalizeDiscordBoolean(discord);

    if (parsedDiscord.hasValue && parsedDiscord.value === null) {
      set.status = 400;
      return { error: "discord phải là boolean true/false" };
    }

    const { rows: existingRows } = await pool.query(
      "SELECT * FROM requirements WHERE tournament_id = $1 ORDER BY id ASC LIMIT 1",
      [tournamentId],
    );

    const existing = existingRows[0] ?? null;

    if (!existing) {
      if (rank_min === undefined || rank_max === undefined) {
        set.status = 400;
        return {
          error:
            "Tournament chưa có requirements. Cần truyền rank_min và rank_max để tạo mới.",
        };
      }

      const allDevices = Array.isArray(devices)
        ? devices
        : devices
          ? [String(devices)]
          : null;

      const deviceLiteral = allDevices ? toPgTextArray(allDevices) : null;

      const { rows } = await pool.query(
        `
        INSERT INTO requirements (rank_min, rank_max, device, discord, tournament_id)
        VALUES ($1, $2, $3::text[], $4, $5)
        RETURNING *
        `,
        [rank_min, rank_max, deviceLiteral, parsedDiscord.value ?? false, tournamentId],
      );

      set.status = 201;
      return {
        message: "Tạo requirements thành công",
        data: rows[0],
      };
    }

    const nextRankMin = rank_min ?? existing.rank_min;
    const nextRankMax = rank_max ?? existing.rank_max;

    let nextDeviceLiteral = toPgTextArray(existing.device ?? null);
    if (hasDevicesField) {
      const allDevices = Array.isArray(devices)
        ? devices
        : devices
          ? [String(devices)]
          : null;
      nextDeviceLiteral = allDevices ? toPgTextArray(allDevices) : null;
    }

    const nextDiscord = hasDiscordField
      ? (parsedDiscord.value ?? false)
      : existing.discord;

    const { rows } = await pool.query(
      `
      UPDATE requirements
      SET rank_min = $1,
          rank_max = $2,
          device = $3::text[],
          discord = $4
      WHERE id = $5
      RETURNING *
      `,
      [nextRankMin, nextRankMax, nextDeviceLiteral, nextDiscord, existing.id],
    );

    set.status = 200;
    return {
      message: "Cập nhật requirements thành công",
      data: rows[0],
    };
  },
  {
    tags: [TAG],
    summary: "Create/update tournament requirements",
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
              type: "object",
              properties: {
                rank_min: { type: "integer", example: 1 },
                rank_max: { type: "integer", example: 10 },
                devices: {
                  oneOf: [
                    { type: "array", items: { type: "string" } },
                    { type: "string" },
                    { type: "null" },
                  ],
                },
                discord: {
                  oneOf: [{ type: "boolean" }, { type: "null" }],
                  example: true,
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
