-- Supabase SQL Editor — KEEP-ALIVE
-- Chạy mỗi 2–3 ngày: Dashboard → SQL → New query → paste → Run
-- Không cần tắt DB.

CREATE TABLE IF NOT EXISTS public.dev_db_ping (
  id integer PRIMARY KEY CHECK (id = 1),
  pinged_at timestamptz NOT NULL DEFAULT now(),
  note text
);

INSERT INTO public.dev_db_ping (id, pinged_at, note)
VALUES (1, now(), 'keepalive')
ON CONFLICT (id) DO UPDATE
SET pinged_at = EXCLUDED.pinged_at,
    note = EXCLUDED.note;

SELECT id, pinged_at, note FROM public.dev_db_ping;
