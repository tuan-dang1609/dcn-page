-- Add registration mode for tournaments (org team vs individual/solo).
-- Run once on Supabase / Postgres.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS registration_mode TEXT NOT NULL DEFAULT 'org';

COMMENT ON COLUMN tournaments.registration_mode IS
  'org = đăng ký theo đội tổ chức (mặc định); individual = đăng ký cá nhân (TFT solo, cần riot_account)';

-- Optional: constrain values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tournaments_registration_mode_check'
  ) THEN
    ALTER TABLE tournaments
      ADD CONSTRAINT tournaments_registration_mode_check
      CHECK (registration_mode IN ('org', 'individual'));
  END IF;
END $$;
