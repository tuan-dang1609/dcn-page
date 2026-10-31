-- Đội hình ra sân từng trận (utils/matchLineups.js).
-- Backend tự tạo bảng khi cần (ensureMatchLineupTable); chạy tay trước cũng được.
CREATE TABLE IF NOT EXISTS match_lineups (
  match_id   BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id    BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  set_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, team_id, user_id)
);
