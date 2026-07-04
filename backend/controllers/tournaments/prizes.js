import { Elysia } from "elysia";
import { pool } from "../../utils/db.js";
import middleware from "../../utils/middleware.js";

const prizeRouter = new Elysia().derive(middleware.deriveAuthContext);
const TAG = "Prizes";
const allowedRoleIds = new Set([1, 2, 3]);

let ensurePrizesTablePromise = null;

const ensurePrizesTable = async () => {
  if (!ensurePrizesTablePromise) {
    ensurePrizesTablePromise = pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_prizes (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        place_label VARCHAR(120) NOT NULL,
        place_order INTEGER NOT NULL DEFAULT 1,
        prize TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_tournament_prizes_tournament_id
        ON tournament_prizes(tournament_id);

      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'tournament_prizes'
            AND column_name = 'amount'
        ) THEN
          ALTER TABLE tournament_prizes ADD COLUMN IF NOT EXISTS prize TEXT;

          UPDATE tournament_prizes
          SET prize = TRIM(
            CONCAT(
              amount::text,
              CASE
                WHEN currency IS NOT NULL AND currency <> '' THEN ' ' || currency
                ELSE ''
              END
            )
          )
          WHERE prize IS NULL OR prize = '';

          ALTER TABLE tournament_prizes DROP COLUMN IF EXISTS amount;
          ALTER TABLE tournament_prizes DROP COLUMN IF EXISTS currency;
        END IF;
      END $$;
    `);
  }

  return ensurePrizesTablePromise;
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePrizePayload = (body) => {
  if (Array.isArray(body)) {
    return body;
  }

  if (Array.isArray(body?.prizes)) {
    return body.prizes;
  }

  if (body && typeof body === "object") {
    return [body];
  }

  return [];
};

const normalizePrizeItem = (item, index) => {
  const placeLabel = String(item?.place_label ?? item?.place ?? "").trim();
  const prize = String(item?.prize ?? item?.amount ?? "").trim();
  const placeOrder = toNumber(item?.place_order) ?? index + 1;
  const description =
    item?.description === null || item?.description === undefined
      ? null
      : String(item.description).trim() || null;

  return {
    placeLabel,
    prize,
    placeOrder,
    description,
  };
};

prizeRouter.post(
  "/:id",
  async ({ params, body, set, user }) => {
    await ensurePrizesTable();

    const tournamentId = Number(params.id);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    if (!Number.isFinite(tournamentId)) {
      set.status = 400;
      return { error: "ID giải đấu không hợp lệ" };
    }

    const payload = normalizePrizePayload(body);

    if (!payload.length) {
      set.status = 400;
      return { error: "Body không được rỗng" };
    }

    const values = [];
    const placeholders = [];

    for (let index = 0; index < payload.length; index += 1) {
      const item = normalizePrizeItem(payload[index], index);

      if (!item.placeLabel || !item.prize) {
        set.status = 400;
        return {
          error: "Mỗi prize phải có place_label và prize",
        };
      }

      const base = index * 5;
      values.push(
        tournamentId,
        item.placeLabel,
        item.placeOrder,
        item.prize,
        item.description,
      );
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`,
      );
    }

    const query = `
      INSERT INTO tournament_prizes (
        tournament_id,
        place_label,
        place_order,
        prize,
        description
      )
      VALUES ${placeholders.join(", ")}
      RETURNING *;
    `;

    const { rows } = await pool.query(query, values);

    set.status = 201;
    return {
      message: "Tạo prizes thành công",
      data: rows,
    };
  },
  {
    tags: [TAG],
    summary: "Create tournament prizes",
    security: [{ bearerAuth: [] }],
  },
);

prizeRouter.patch(
  "/:id",
  async ({ params, body, set, user }) => {
    await ensurePrizesTable();

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
      : Array.isArray(body?.prizes)
        ? body.prizes
        : null;

    if (!Array.isArray(payload)) {
      set.status = 400;
      return { error: "Body phải là mảng prizes hoặc { prizes: [] }" };
    }

    const { rows: tournaments } = await pool.query(
      "SELECT created_by FROM tournaments WHERE id = $1",
      [tournamentId],
    );

    if (tournaments.length === 0) {
      set.status = 404;
      return { error: "Tournament not found" };
    }

    const isOwner = Number(user.id) === Number(tournaments[0].created_by);
    const hasRolePermission = allowedRoleIds.has(Number(user.role_id));

    if (!isOwner && !hasRolePermission) {
      set.status = 403;
      return { error: "Bạn không có quyền cập nhật prizes của giải này" };
    }

    if (payload.length === 0) {
      const { rowCount } = await pool.query(
        "DELETE FROM tournament_prizes WHERE tournament_id = $1",
        [tournamentId],
      );

      set.status = 200;
      return {
        message: "Đã xóa toàn bộ prizes của giải",
        deleted_count: rowCount,
      };
    }

    const updateItems = [];
    const insertItems = [];
    const incomingIds = [];

    for (let index = 0; index < payload.length; index += 1) {
      const item = normalizePrizeItem(payload[index], index);

      if (!item.placeLabel || !item.prize) {
        set.status = 400;
        return {
          error: "Mỗi prize phải có place_label và prize",
        };
      }

      const rawId = payload[index]?.id;
      const hasId = rawId !== undefined && rawId !== null && rawId !== "";

      if (hasId) {
        const prizeId = Number(rawId);
        if (!Number.isFinite(prizeId)) {
          set.status = 400;
          return { error: "id prize không hợp lệ" };
        }

        incomingIds.push(prizeId);
        updateItems.push({
          id: prizeId,
          place_label: item.placeLabel,
          place_order: item.placeOrder,
          prize: item.prize,
          description: item.description,
        });
      } else {
        insertItems.push({
          place_label: item.placeLabel,
          place_order: item.placeOrder,
          prize: item.prize,
          description: item.description,
        });
      }
    }

    if (new Set(incomingIds).size !== incomingIds.length) {
      set.status = 400;
      return { error: "Danh sách prize bị trùng id" };
    }

    const { rows: existingPrizes } = await pool.query(
      "SELECT id FROM tournament_prizes WHERE tournament_id = $1",
      [tournamentId],
    );

    const existingIds = existingPrizes.map((row) => Number(row.id));
    const existingIdSet = new Set(existingIds);

    for (const id of incomingIds) {
      if (!existingIdSet.has(id)) {
        set.status = 404;
        return {
          error: "Một hoặc nhiều prize không tồn tại trong giải đấu này",
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
        `DELETE FROM tournament_prizes WHERE tournament_id = $1 AND id IN (${deleteIdPlaceholders})`,
        [tournamentId, ...deleteIds],
      );
    }

    for (const item of updateItems) {
      await pool.query(
        `
        UPDATE tournament_prizes
        SET place_label = $1,
            place_order = $2,
            prize = $3,
            description = $4
        WHERE id = $5 AND tournament_id = $6
        `,
        [
          item.place_label,
          item.place_order,
          item.prize,
          item.description,
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
          tournamentId,
          item.place_label,
          item.place_order,
          item.prize,
          item.description,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      });

      await pool.query(
        `
        INSERT INTO tournament_prizes (
          tournament_id,
          place_label,
          place_order,
          prize,
          description
        )
        VALUES ${insertPlaceholders.join(", ")}
        `,
        insertValues,
      );
    }

    const { rows: syncedPrizes } = await pool.query(
      `
      SELECT *
      FROM tournament_prizes
      WHERE tournament_id = $1
      ORDER BY place_order ASC, id ASC
      `,
      [tournamentId],
    );

    set.status = 200;
    return {
      message: "Sync prizes thành công",
      data: syncedPrizes,
    };
  },
  {
    tags: [TAG],
    summary: "Sync tournament prizes",
    security: [{ bearerAuth: [] }],
  },
);

export default prizeRouter;
