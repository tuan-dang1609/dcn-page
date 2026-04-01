-- Bracket-based Pickem schema for PostgreSQL
-- Mirrors backend/utils/pickem.js bootstrap logic.

CREATE TABLE IF NOT EXISTS pickem_bracket_submissions (
  id BIGSERIAL PRIMARY KEY,
  bracket_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  user_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bracket_id, user_id)
);

CREATE TABLE IF NOT EXISTS pickem_bracket_picks (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL REFERENCES pickem_bracket_submissions(id) ON DELETE CASCADE,
  bracket_id BIGINT NOT NULL,
  match_id BIGINT NOT NULL,
  selected_team_id BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_pickem_bracket_submissions_lookup
ON pickem_bracket_submissions(bracket_id, user_id);

CREATE INDEX IF NOT EXISTS idx_pickem_bracket_picks_lookup
ON pickem_bracket_picks(bracket_id, match_id);
