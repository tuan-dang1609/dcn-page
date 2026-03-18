-- Pickem schema for PostgreSQL
-- Mirrors backend/utils/pickem.js bootstrap logic.

CREATE TABLE IF NOT EXISTS pickem_challenges (
  id BIGSERIAL PRIMARY KEY,
  league_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pickem_questions (
  id BIGSERIAL PRIMARY KEY,
  challenge_id BIGINT NOT NULL REFERENCES pickem_challenges(id) ON DELETE CASCADE,
  question_id INT NOT NULL,
  question TEXT NOT NULL,
  type TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  score NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_choose INT NOT NULL DEFAULT 1,
  correct_answer JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  game_short TEXT NULL,
  bracket_id TEXT NULL,
  open_time TIMESTAMPTZ NULL,
  close_time TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (challenge_id, question_id)
);

ALTER TABLE pickem_questions
ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS pickem_responses (
  id BIGSERIAL PRIMARY KEY,
  league_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_score NUMERIC(10,2) NOT NULL DEFAULT 0,
  last_update TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, user_id)
);

CREATE TABLE IF NOT EXISTS pickem_answers (
  id BIGSERIAL PRIMARY KEY,
  response_id BIGINT NOT NULL REFERENCES pickem_responses(id) ON DELETE CASCADE,
  question_id INT NOT NULL,
  selected_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  open_time TIMESTAMPTZ NULL,
  close_time TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (response_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_pickem_questions_league
ON pickem_questions(challenge_id, game_short, type);

CREATE INDEX IF NOT EXISTS idx_pickem_responses_league
ON pickem_responses(league_id, total_score DESC, last_update ASC);

CREATE INDEX IF NOT EXISTS idx_pickem_answers_response
ON pickem_answers(response_id, question_id);
