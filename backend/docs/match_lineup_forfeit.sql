-- ════════════════════════════════════════════════════════════════════════
-- Xử thua khi hết hạn chốt đội hình ra sân (utils/matchLineups.js → checkLineupForfeits).
--   Hạn chốt = BTC mở phòng ban/pick hoặc tới giờ đấu (cái nào trước).
--   1 đội không chốt → thua 1-0 (BO1) / 2-0 (BO3) / 3-0 (BO5); cả 2 không chốt → BTC tự xử.
--
-- tournaments.lineup_forfeit: giải CŨ = tắt (tránh xử thua hàng loạt trận cũ chưa ai chốt),
-- giải tạo MỚI = bật mặc định. Bật / tắt tay cho 1 giải:
--   UPDATE tournaments SET lineup_forfeit = TRUE WHERE id = <id>;
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- Thêm cột với mặc định FALSE → mọi giải hiện có = tắt; rồi đổi mặc định cho giải tạo sau này = bật
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS lineup_forfeit BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tournaments ALTER COLUMN lineup_forfeit SET DEFAULT TRUE;

-- Đã xét 1 trận (1 lần / trận) — backend cũng tự tạo nếu thiếu
CREATE TABLE IF NOT EXISTS match_lineup_checks (
  match_id       BIGINT PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  outcome        TEXT NOT NULL,     -- 'ok' | 'forfeit' | 'both_missing'
  winner_team_id BIGINT,
  checked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;

-- Kiểm tra: SELECT lineup_forfeit, COUNT(*) FROM tournaments GROUP BY 1;   -- toàn bộ FALSE
