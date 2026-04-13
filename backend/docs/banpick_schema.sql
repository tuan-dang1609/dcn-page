-- Ban/Pick schema for round-slug based realtime flow
-- This script mirrors backend/utils/banPick.js bootstrap logic.

CREATE TABLE IF NOT EXISTS map_pool (
  id BIGSERIAL PRIMARY KEY,
  game_key TEXT NOT NULL,
  map_code TEXT NOT NULL,
  map_name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_key, map_code)
);

CREATE TABLE IF NOT EXISTS ban_picks (
  id BIGSERIAL PRIMARY KEY,
  round_slug TEXT NOT NULL UNIQUE,
  match_id BIGINT NOT NULL UNIQUE,
  tournament_id BIGINT NULL,
  team_a_id BIGINT NULL,
  team_b_id BIGINT NULL,
  format TEXT NOT NULL DEFAULT 'BO3',
  turn_time_limit_seconds INT NOT NULL DEFAULT 30,
  turn_started_at TIMESTAMPTZ NULL,
  phase TEXT NOT NULL DEFAULT 'ban_pick',
  current_step INT NOT NULL DEFAULT 0,
  selected_map_code TEXT NULL,
  side_select_map_code TEXT NULL,
  side_select_team TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ban_pick_actions (
  id BIGSERIAL PRIMARY KEY,
  ban_pick_id BIGINT NOT NULL REFERENCES ban_picks(id) ON DELETE CASCADE,
  step INT NOT NULL DEFAULT 0,
  map_code TEXT NULL,
  action_type TEXT NOT NULL,
  team_slot TEXT NULL,
  side TEXT NULL,
  acted_by_user_id BIGINT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS ban_pick_id BIGINT NULL;

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS room_id TEXT NULL;

ALTER TABLE ban_picks
ADD COLUMN IF NOT EXISTS turn_time_limit_seconds INT NOT NULL DEFAULT 30;

ALTER TABLE ban_picks
ADD COLUMN IF NOT EXISTS turn_started_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_ban_picks_match_id ON ban_picks(match_id);
CREATE INDEX IF NOT EXISTS idx_ban_pick_actions_ban_pick_id ON ban_pick_actions(ban_pick_id);

DO $$
BEGIN
  ALTER TABLE ban_picks
    ADD CONSTRAINT fk_ban_picks_match
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE matches
    ADD CONSTRAINT fk_matches_ban_pick
    FOREIGN KEY (ban_pick_id) REFERENCES ban_picks(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO map_pool (game_key, map_code, map_name, image_url, display_order)
VALUES
  ('valorant', 'bind', 'BIND', 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=500&fit=crop', 1),
  ('valorant', 'haven', 'HAVEN', 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&h=500&fit=crop', 2),
  ('valorant', 'split', 'SPLIT', 'https://images.unsplash.com/photo-1604076913837-52ab5f0e2f2e?w=800&h=500&fit=crop', 3),
  ('valorant', 'ascent', 'ASCENT', 'https://images.unsplash.com/photo-1539650116574-8efeb43e2750?w=800&h=500&fit=crop', 4),
  ('valorant', 'icebox', 'ICEBOX', 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&h=500&fit=crop', 5),
  ('valorant', 'breeze', 'BREEZE', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&h=500&fit=crop', 6),
  ('valorant', 'lotus', 'LOTUS', 'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800&h=500&fit=crop', 7)
ON CONFLICT (game_key, map_code)
DO UPDATE SET
  map_name = EXCLUDED.map_name,
  image_url = EXCLUDED.image_url,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();
