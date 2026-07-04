#!/usr/bin/env bun
/**
 * Ping Supabase Postgres qua DATABASE_URL — tránh project pause do idle.
 * Chạy định kỳ (cron/Task Scheduler mỗi 2–3 ngày):
 *
 *   cd backend
 *   bun run scripts/supabase-keepalive.js
 *
 * Cần DATABASE_URL trong .env (Supabase → Settings → Database → Connection string)
 */

import { pool } from "../utils/db.js";

const main = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.dev_db_ping (
      id integer PRIMARY KEY CHECK (id = 1),
      pinged_at timestamptz NOT NULL DEFAULT now(),
      note text
    )
  `);

  const { rows } = await pool.query(
    `
    INSERT INTO public.dev_db_ping (id, pinged_at, note)
    VALUES (1, now(), $1)
    ON CONFLICT (id) DO UPDATE
    SET pinged_at = EXCLUDED.pinged_at,
        note = EXCLUDED.note
    RETURNING pinged_at, note
    `,
    ["bun script supabase-keepalive"],
  );

  console.log(JSON.stringify({ ok: true, ping: rows[0] }, null, 2));
};

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.close();
  });
