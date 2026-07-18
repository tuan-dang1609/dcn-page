-- Add start date for brackets (auto-select UI by day).
-- Run once on Supabase / Postgres.

ALTER TABLE brackets
  ADD COLUMN IF NOT EXISTS date_start TIMESTAMPTZ NULL;

COMMENT ON COLUMN brackets.date_start IS
  'Ngày bắt đầu bracket. UI tự chọn bracket theo ngày này; trùng tên+ngày thì lấy bản ghi đầu (id ASC).';
