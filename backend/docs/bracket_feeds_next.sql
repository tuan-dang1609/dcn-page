-- Flexible staged brackets: play-in/prelim feeds winners into next bracket.
-- Run once on Supabase / Postgres.

ALTER TABLE brackets
  ADD COLUMN IF NOT EXISTS feeds_next_bracket BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE brackets
  ADD COLUMN IF NOT EXISTS next_bracket_id INTEGER NULL
    REFERENCES brackets(id) ON DELETE SET NULL;

COMMENT ON COLUMN brackets.feeds_next_bracket IS
  'true = bracket này đẩy đội thắng sang bracket khác (play-in / prelim)';

COMMENT ON COLUMN brackets.next_bracket_id IS
  'Bracket nhận đội từ feeds_next_bracket (vd Main sau Play-in)';
