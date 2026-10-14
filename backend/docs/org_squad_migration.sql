-- ════════════════════════════════════════════════════════════════════════
-- Org / đội lẻ / đội trưởng theo giải
--
--   Org   (teams.kind = 'org')   — thi series + giải lẻ, dùng chung tên/logo; 1 người tối đa 1 org.
--                                  Người sáng lập = teams.created_by. Vai trò: founder / lead / member.
--   Đội lẻ (teams.kind = 'squad') — chỉ cho 1 giải KHÔNG thuộc series (squad_tournament_id).
--   Solo  (teams.kind = 'solo')  — "đội ảo" S{userId} của giải đấu cá nhân (TFT).
--   Đội trưởng theo giải: tournament_teams.captain_user_id — người ban/pick, check-in cho lượt đăng ký đó.
--
-- Chạy trong 1 transaction: lỗi ở bước nào thì không thay đổi gì.
-- users.team_id vẫn giữ để code cũ chạy được trong lúc chuyển; org_members là nguồn chính về sau.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Phân loại đội ──────────────────────────────────────────────────────
ALTER TABLE teams ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'org';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS squad_tournament_id BIGINT
  REFERENCES tournaments(id) ON DELETE CASCADE;

UPDATE teams SET kind = 'solo' WHERE short_name ~ '^S[0-9]+$';

DO $$
BEGIN
  ALTER TABLE teams ADD CONSTRAINT teams_kind_check
    CHECK (kind IN ('org', 'squad', 'solo'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  -- Đội lẻ phải gắn đúng 1 giải; org/solo thì không
  ALTER TABLE teams ADD CONSTRAINT teams_squad_tournament_check
    CHECK ((kind = 'squad') = (squad_tournament_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tên/tag duy nhất: org trên toàn hệ thống, đội lẻ trong cùng 1 giải.
-- Bỏ unique logo/màu (2 đội không được trùng màu là quá chặt; màu mặc định tạo đội thứ 2 bị lỗi).
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_logo_url_unique;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_team_color_hex_unique;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_name_unique;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_short_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS teams_org_name_key
  ON teams (lower(name)) WHERE kind = 'org';
CREATE UNIQUE INDEX IF NOT EXISTS teams_org_short_name_key
  ON teams (lower(short_name)) WHERE kind = 'org';
CREATE UNIQUE INDEX IF NOT EXISTS teams_squad_name_key
  ON teams (squad_tournament_id, lower(name)) WHERE kind = 'squad';
CREATE UNIQUE INDEX IF NOT EXISTS teams_solo_short_name_key
  ON teams (short_name) WHERE kind = 'solo';

-- 2. Thành viên org (1 người tối đa 1 org) ───────────────────────────────
CREATE TABLE IF NOT EXISTS org_members (
  org_id    BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT   NOT NULL DEFAULT 'member' CHECK (role IN ('founder', 'lead', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS org_members_one_org_per_user ON org_members (user_id);

-- Chuyển từ users.team_id. Người sáng lập chỉ có dòng 'founder' khi đang ở chính org đó;
-- org do admin tạo thử (người tạo không ở trong org) vẫn quản lý qua teams.created_by.
INSERT INTO org_members (org_id, user_id, role)
SELECT u.team_id,
       u.id,
       CASE WHEN t.created_by = u.id THEN 'founder' ELSE 'member' END
FROM users u
JOIN teams t ON t.id = u.team_id AND t.kind = 'org'
ON CONFLICT DO NOTHING;

-- 3. Thành viên đội lẻ (1 người có thể ở nhiều đội lẻ, nhưng không 2 đội trong cùng 1 giải — kiểm ở code)
CREATE TABLE IF NOT EXISTS squad_members (
  squad_id  BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT   NOT NULL DEFAULT 'member' CHECK (role IN ('captain', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (squad_id, user_id)
);

-- 4. Đơn xin gia nhập (org hoặc đội lẻ) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS team_join_requests (
  id          BIGSERIAL PRIMARY KEY,
  team_id     BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT   NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  message     TEXT,
  decided_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS team_join_requests_pending_key
  ON team_join_requests (team_id, user_id) WHERE status = 'pending';

-- 5. Link mời (gửi qua Zalo/Discord; mở link là vào đội) ─────────────────
CREATE TABLE IF NOT EXISTS team_invite_links (
  id          BIGSERIAL PRIMARY KEY,
  team_id     BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  token       TEXT   NOT NULL UNIQUE,
  created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  max_uses    INT,
  used_count  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Đội trưởng theo từng lượt đăng ký giải ───────────────────────────────
ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS captain_user_id BIGINT
  REFERENCES users(id) ON DELETE SET NULL;

-- Đăng ký cũ: đội trưởng = người tạo đội (giống quyền ban/pick hiện tại)
UPDATE tournament_teams tt
SET captain_user_id = t.created_by
FROM teams t
WHERE t.id = tt.team_id AND tt.captain_user_id IS NULL;

-- Mỗi đội đăng ký 1 giải 1 lần; mỗi người 1 lần trong 1 đội hình (dữ liệu hiện tại không trùng)
CREATE UNIQUE INDEX IF NOT EXISTS tournament_teams_tournament_team_key
  ON tournament_teams (tournament_id, team_id);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_team_players_unique
  ON tournament_team_players (tournament_team_id, user_id);

COMMIT;

-- Kiểm tra sau khi chạy:
--   SELECT kind, COUNT(*) FROM teams GROUP BY kind;          -- dự kiến: org 31, solo 24
--   SELECT role, COUNT(*) FROM org_members GROUP BY role;
--   SELECT COUNT(*) FROM tournament_teams WHERE captain_user_id IS NULL;   -- dự kiến 0
