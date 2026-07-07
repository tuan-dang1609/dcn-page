-- =============================================================================
-- AOV / Liên Quân Mobile — match stats (PostgreSQL / Supabase)
-- Chạy trong Supabase SQL Editor.
--
-- Mô hình AOV staging:
--   1) Trang /ops/aov-import tạo match_id dạng "aov:xxxx" + lưu stats vào aov_staged_stats
--   2) Score Control dán match_id vào info_game_id của trận giải → stats áp vào match_games
--
-- Mô hình sau khi gắn:
--   matches (series BO1/BO3/BO5)
--     └── match_games (game_no = 1..N, info_game_id = "aov:xxxx")
--           └── match_game_player_stats (10 dòng / ván)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.match_game_player_stats (
  id SERIAL PRIMARY KEY,
  match_game_id INTEGER NOT NULL REFERENCES public.match_games(id) ON DELETE CASCADE,
  team_side VARCHAR(10) NOT NULL CHECK (team_side IN ('blue', 'red')),
  team_id INTEGER REFERENCES public.teams(id) ON DELETE SET NULL,
  slot_no SMALLINT NOT NULL CHECK (slot_no BETWEEN 1 AND 5),
  ign TEXT NOT NULL,
  hero_name TEXT,
  performance_score NUMERIC(5, 2),
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  gold INTEGER,
  is_mvp BOOLEAN NOT NULL DEFAULT FALSE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual_json',
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_game_id, team_side, slot_no)
);

CREATE INDEX IF NOT EXISTS idx_match_game_player_stats_match_game
  ON public.match_game_player_stats(match_game_id);

CREATE INDEX IF NOT EXISTS idx_match_game_player_stats_ign
  ON public.match_game_player_stats(ign);

COMMENT ON TABLE public.match_game_player_stats IS
  'Chỉ số từng người chơi theo ván AOV/Liên Quân (nhập JSON thủ công)';

COMMENT ON COLUMN public.match_game_player_stats.team_side IS
  'blue = đội trái (thường map sang matches.team_a), red = đội phải (team_b)';

COMMENT ON COLUMN public.match_game_player_stats.performance_score IS
  'Điểm đánh giá trên màn hình kết quả (vd: 14.8)';

-- metadata ván lưu trong match_games.payload->aov, ví dụ:
-- {
--   "aov": {
--     "blue_kills": 19,
--     "red_kills": 1,
--     "duration_sec": 474,
--     "played_at": "2025-07-26T06:05:00.000Z",
--     "winner_side": "blue",
--     "imported_at": "2026-07-05T14:00:00.000Z"
--   }
-- }

-- =============================================================================
-- Kiểm tra
-- =============================================================================
-- SELECT mg.id, mg.match_id, mg.game_no, mg.info_game_id,
--        (mg.payload->'aov') AS aov_meta
-- FROM match_games mg
-- WHERE mg.match_id = :match_id
-- ORDER BY mg.game_no;

-- SELECT s.*
-- FROM match_game_player_stats s
-- JOIN match_games mg ON mg.id = s.match_game_id
-- WHERE mg.match_id = :match_id AND mg.game_no = 1
-- ORDER BY s.team_side, s.slot_no;
