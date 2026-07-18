-- Revert staged Play-in → Main columns added by bracket_feeds_next.sql.
-- Safe to run multiple times. Does not touch date_start.

ALTER TABLE brackets
  DROP COLUMN IF EXISTS next_bracket_id;

ALTER TABLE brackets
  DROP COLUMN IF EXISTS feeds_next_bracket;
