-- Allow creating/updating tournaments without a banner image.
-- Run once on Supabase / Postgres if banner_url is currently NOT NULL.

ALTER TABLE tournaments
  ALTER COLUMN banner_url DROP NOT NULL;
