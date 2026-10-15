-- Cài đặt chốt đội hình ra sân theo giải (BTC chỉnh ở trang thiết lập giải → "Chốt đội hình ra sân").
--   lineup_open_minutes: mở chốt trước giờ đấu bao nhiêu phút (NULL = mở ngay khi có trận).
--   lineup_forfeit:      hết hạn không chốt → xử thua (đã thêm ở docs/match_lineup_forfeit.sql; chạy lại không sao).
BEGIN;

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS lineup_open_minutes INT;

DO $$
BEGIN
  ALTER TABLE tournaments ADD CONSTRAINT tournaments_lineup_open_minutes_check
    CHECK (lineup_open_minutes IS NULL OR lineup_open_minutes BETWEEN 0 AND 20160);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Giải cũ: tắt xử thua; giải mới: bật mặc định
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS lineup_forfeit BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tournaments ALTER COLUMN lineup_forfeit SET DEFAULT TRUE;

COMMIT;
