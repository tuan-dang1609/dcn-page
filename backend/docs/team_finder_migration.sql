-- ════════════════════════════════════════════════════════════════════════
-- Tìm đội cho giải theo đội (Valorant / LMHT / Liên Quân), chỉ giải KHÔNG thuộc series:
--
--   1. Vai trò trong game (tournament_team_players.ingame_role) — bắt buộc với Valorant / LMHT,
--      Liên Quân không dùng. Vai trò mặc định của người chơi theo từng game: user_game_roles.
--   2. Đội lẻ mở tuyển công khai (tournament_teams.recruit_*): 'approval' = đội trưởng duyệt,
--      'open' = vào thẳng. team_join_requests thêm vai trò + chiều (xin vào / đội trưởng mời).
--   3. Người chơi lẻ chờ ghép (tournament_free_agents). Hết hạn đăng ký → server tự ghép:
--      lấp chỗ trống các đội cho phép tự lấp, rồi chia người còn lại thành đội mới cân bằng vai trò.
--      tournaments.team_formed_at = đã ghép (chỉ chạy 1 lần).
--
-- Chạy trong 1 transaction; chạy lại nhiều lần không sao (IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Vai trò ──────────────────────────────────────────────────────────────
ALTER TABLE tournament_team_players ADD COLUMN IF NOT EXISTS ingame_role TEXT;

CREATE TABLE IF NOT EXISTS user_game_roles (
  user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game           TEXT   NOT NULL,              -- 'valorant' | 'lol'
  primary_role   TEXT,
  secondary_role TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, game)
);

-- 2. Đội mở tuyển ─────────────────────────────────────────────────────────
ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS recruit_mode TEXT NOT NULL DEFAULT 'closed';
ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS recruit_roles TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS recruit_note TEXT;
ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS accept_auto_fill BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  ALTER TABLE tournament_teams ADD CONSTRAINT tournament_teams_recruit_mode_check
    CHECK (recruit_mode IN ('closed', 'approval', 'open'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE team_join_requests ADD COLUMN IF NOT EXISTS ingame_role TEXT;
-- 'request' = người chơi xin vào (quản lý duyệt); 'invite' = đội trưởng mời (người chơi đồng ý)
ALTER TABLE team_join_requests ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'request';

DO $$
BEGIN
  ALTER TABLE team_join_requests ADD CONSTRAINT team_join_requests_direction_check
    CHECK (direction IN ('request', 'invite'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Người chơi lẻ chờ ghép ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_free_agents (
  id                     BIGSERIAL PRIMARY KEY,
  tournament_id          BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id                BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  primary_role           TEXT,
  secondary_role         TEXT,
  can_captain            BOOLEAN NOT NULL DEFAULT FALSE,
  note                   TEXT,
  -- waiting = đang chờ; placed = đã vào đội; unplaced = ghép xong nhưng không đủ người thành đội
  status                 TEXT NOT NULL DEFAULT 'waiting'
                         CHECK (status IN ('waiting', 'placed', 'unplaced')),
  placed_registration_id BIGINT REFERENCES tournament_teams(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, user_id)
);
CREATE INDEX IF NOT EXISTS tournament_free_agents_waiting_idx
  ON tournament_free_agents (tournament_id) WHERE status = 'waiting';

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS team_formed_at TIMESTAMPTZ;

COMMIT;

-- Kiểm tra sau khi chạy:
--   SELECT recruit_mode, COUNT(*) FROM tournament_teams GROUP BY recruit_mode;   -- tất cả 'closed'
--   SELECT direction, COUNT(*) FROM team_join_requests GROUP BY direction;       -- tất cả 'request'
