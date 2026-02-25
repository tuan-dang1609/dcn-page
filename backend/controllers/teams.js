import { Elysia } from "elysia";
import { pool } from "../utils/db.js";
import middleware from "../utils/middleware.js";

const teamRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Teams";

// Xem thông tin tất cả các team
teamRouter.get(
  "/",
  async ({ set }) => {
    const { rows } = await pool.query(
      `SELECT
      t.id,
      t.name,
      t.short_name,
      t.logo_url,
      creator.username AS created_by_username,
      COALESCE(
        json_agg(
          json_build_object('id', u.id, 'username', u.username, 'profile_picture', u.profile_picture)
          ORDER BY u.id
        ) FILTER (WHERE u.id IS NOT NULL),
        '[]'
      ) AS members
    FROM teams t
    LEFT JOIN users creator ON creator.id = t.created_by
    LEFT JOIN users u ON u.team_id = t.id
    GROUP BY t.id, t.name, t.short_name, t.logo_url, creator.username;`,
    );

    set.status = 200;
    return rows;
  },
  { tags: [TAG], summary: "List teams" },
);

// Thêm team mới
teamRouter.post(
  "/",
  async ({ body, set, user }) => {
    const cteSql = `
    WITH new_team AS (
      INSERT INTO teams (name, short_name, logo_url, team_color_hex, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, short_name, logo_url, team_color_hex, created_by, created_at
    )
    UPDATE users
    SET team_id = new_team.id,
        role_id = CASE
          WHEN users.role_id IS NULL OR users.role_id > 4 THEN 4
          ELSE users.role_id
        END
    FROM new_team
    WHERE users.id = $5
    RETURNING
      new_team.id AS team_id,
      new_team.name AS team_name,
      new_team.short_name,
      new_team.logo_url,
      new_team.team_color_hex,
      new_team.created_by,
      users.id AS user_id,
      users.username
  `;

    const userId = Number(user?.id);
    const { name, short_name, logo_url, team_color_hex } = body ?? {};

    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { rows } = await pool.query(cteSql, [
      name,
      short_name,
      logo_url,
      team_color_hex,
      userId,
    ]);

    set.status = 201;
    return rows[0];
  },
  {
    tags: [TAG],
    summary: "Create team",
    detail: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "short_name"],
              properties: {
                name: { type: "string", example: "Beacon Esports" },
                short_name: { type: "string", example: "BCN" },
                logo_url: {
                  type: "string",
                  example: "https://cdn.example.com/team-logo.png",
                },
                team_color_hex: { type: "string", example: "#4F46E5" },
              },
            },
          },
        },
      },
    },
  },
);

// Coi thông tin chi tiết của team
teamRouter.get(
  "/:id",
  async ({ params, set }) => {
    const id = Number(params.id);

    const { rows } = await pool.query(
      `SELECT
      t.id,
      t.name,
      t.short_name,
      t.logo_url,
      creator.username AS created_by_username,
      COALESCE(
        json_agg(
          json_build_object('id', u.id, 'username', u.username, 'profile_picture', u.profile_picture)
          ORDER BY u.id
        ) FILTER (WHERE u.id IS NOT NULL),
        '[]'
      ) AS members
    FROM teams t
    LEFT JOIN users creator ON creator.id = t.created_by
    LEFT JOIN users u ON u.team_id = t.id
    WHERE t.id = $1
    GROUP BY t.id, t.name, t.short_name, t.logo_url, creator.username;`,
      [id],
    );

    set.status = 200;
    return rows[0] ?? null;
  },
  {
    tags: [TAG],
    summary: "Get team by id",
    detail: {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 1 },
          description: "ID đội",
        },
      ],
    },
  },
);

// Update thông tin của đội
teamRouter.put(
  "/:id",
  async ({ params, body, set, user }) => {
    const id = Number(params.id);
    const { name, team_color_hex, short_name, logo_url } = body ?? {};

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { rows: teams } = await pool.query(
      "SELECT * FROM teams WHERE id = $1 FOR UPDATE",
      [id],
    );

    if (teams.length === 0) {
      set.status = 404;
      return { error: "Team not found" };
    }

    const team = teams[0];
    const allowedRoleIds = new Set([1, 2, 3]);

    if (
      Number(user.id) !== Number(team.created_by) &&
      !allowedRoleIds.has(Number(user.role_id))
    ) {
      set.status = 403;
      return { error: "Bạn không phải chủ sở hữu team" };
    }

    const { rows } = await pool.query(
      "UPDATE teams SET name = $1, short_name = $2, logo_url = $3, team_color_hex = $4 WHERE id = $5 RETURNING *",
      [name, short_name, logo_url, team_color_hex, id],
    );

    set.status = 200;
    return rows[0];
  },
  {
    tags: [TAG],
    summary: "Update team",
    detail: {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 1 },
          description: "ID đội cần cập nhật",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string", example: "Beacon Academy" },
                short_name: { type: "string", example: "BCA" },
                logo_url: {
                  type: "string",
                  example: "https://cdn.example.com/team-logo-new.png",
                },
                team_color_hex: { type: "string", example: "#06B6D4" },
              },
            },
          },
        },
      },
    },
  },
);

// Thêm user vào đội thông qua team_id và user_ids = []
teamRouter.patch(
  "/:id",
  async ({ params, body, set, user }) => {
    const id = Number(params.id);
    const { user_ids } = body ?? {};
    const allowedRoleIds = new Set([1, 2, 3]);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    if (!Number.isFinite(id)) {
      set.status = 400;
      return { error: "Team id không hợp lệ" };
    }

    if (!Array.isArray(user_ids)) {
      set.status = 400;
      return { error: "user_ids phải là mảng số" };
    }

    const ids = [...new Set(user_ids.map(Number).filter(Number.isFinite))];

    const { rows: teamRows } = await pool.query(
      "SELECT created_by FROM teams WHERE id = $1 FOR UPDATE",
      [id],
    );

    if (teamRows.length === 0) {
      set.status = 404;
      return { error: "Team not found" };
    }

    const isOwner = Number(user.id) === Number(teamRows[0].created_by);
    const hasRolePermission = allowedRoleIds.has(Number(user.role_id));

    if (!isOwner && !hasRolePermission) {
      set.status = 403;
      return { error: "Không có quyền gán user vào team này" };
    }

    const creatorId = Number(teamRows[0].created_by);
    const creatorIdIsValid = Number.isFinite(creatorId);

    if (ids.length === 0) {
      if (creatorIdIsValid) {
        await pool.query(
          "UPDATE users SET team_id = NULL WHERE team_id = $1 AND id <> $2",
          [id, creatorId],
        );
      } else {
        await pool.query("UPDATE users SET team_id = NULL WHERE team_id = $1", [
          id,
        ]);
      }
    } else {
      const idsCsv = ids.join(",");

      if (creatorIdIsValid) {
        await pool.query(
          `
          UPDATE users
          SET team_id = NULL
          WHERE team_id = $1
            AND NOT (id = ANY(string_to_array($2, ',')::bigint[]))
            AND id <> $3
        `,
          [id, idsCsv, creatorId],
        );
      } else {
        await pool.query(
          `
          UPDATE users
          SET team_id = NULL
          WHERE team_id = $1
            AND NOT (id = ANY(string_to_array($2, ',')::bigint[]))
        `,
          [id, idsCsv],
        );
      }

      await pool.query(
        `
        UPDATE users
        SET team_id = $1
        WHERE id = ANY(string_to_array($2, ',')::bigint[])
      `,
        [id, idsCsv],
      );
    }

    const { rows } = await pool.query(
      `
      SELECT t.id, t.name,
        COALESCE(
          json_agg(
            json_build_object('id', u.id, 'username', u.username)
            ORDER BY u.id
          ) FILTER (WHERE u.id IS NOT NULL),
          '[]'
        ) AS members
      FROM teams t
      LEFT JOIN users u ON u.team_id = t.id
      WHERE t.id = $1
      GROUP BY t.id, t.name
    `,
      [id],
    );

    set.status = 200;
    return rows[0];
  },
  {
    tags: [TAG],
    summary: "Assign team members",
    detail: {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 1 },
          description: "ID đội cần gán thành viên",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                user_ids: {
                  type: "array",
                  items: { type: "integer" },
                  description: "Danh sách user id (chỉ chấp nhận mảng số)",
                },
              },
            },
            examples: {
              arraySample: {
                value: {
                  user_ids: [6, 7, 8],
                },
              },
              emptyArraySample: {
                value: {
                  user_ids: [],
                },
              },
            },
          },
        },
      },
    },
  },
);

// Xóa đội
teamRouter.delete(
  "/:id",
  async ({ params, set, user }) => {
    const id = Number(params.id);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { rows: teams } = await pool.query(
      "SELECT * FROM teams WHERE id = $1 FOR UPDATE",
      [id],
    );

    if (teams.length === 0) {
      set.status = 404;
      return { error: "Team not found" };
    }

    const team = teams[0];
    const allowedRoleIds = new Set([1, 2, 3]);
    const isOwner = Number(user.id) === Number(team.created_by);

    if (!isOwner && !allowedRoleIds.has(Number(user.role_id))) {
      set.status = 403;
      return { error: "Bạn không có quyền xóa team này" };
    }

    await pool.query("UPDATE users SET team_id = NULL WHERE team_id = $1", [
      id,
    ]);
    await pool.query("DELETE FROM teams WHERE id = $1", [id]);

    set.status = 204;
    return;
  },
  {
    tags: [TAG],
    summary: "Delete team",
    detail: {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer", example: 1 },
          description: "ID đội cần xóa",
        },
      ],
    },
  },
);

export default teamRouter;
