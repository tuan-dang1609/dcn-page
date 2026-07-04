-- Tournament prizes schema (PostgreSQL / Supabase)
-- Chạy toàn bộ file này trong Supabase SQL Editor.

-- ============================================================
-- 1) Tạo bảng mới
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tournament_prizes (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  place_label VARCHAR(120) NOT NULL,
  place_order INTEGER NOT NULL DEFAULT 1,
  prize TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tournament_prizes_tournament_id
  ON public.tournament_prizes(tournament_id);

CREATE INDEX IF NOT EXISTS idx_tournament_prizes_tournament_order
  ON public.tournament_prizes(tournament_id, place_order, id);

COMMENT ON TABLE public.tournament_prizes IS 'Giải thưởng theo hạng của từng giải đấu';
COMMENT ON COLUMN public.tournament_prizes.place_label IS 'Nhãn hạng, vd: 🥇 Hạng 1';
COMMENT ON COLUMN public.tournament_prizes.place_order IS 'Thứ tự hiển thị (1 = cao nhất)';
COMMENT ON COLUMN public.tournament_prizes.prize IS 'Nội dung giải thưởng (text tự do)';

-- ============================================================
-- 2) Migration (chỉ chạy nếu bạn đã tạo bảng cũ có amount/currency)
-- ============================================================

-- ALTER TABLE public.tournament_prizes ADD COLUMN IF NOT EXISTS prize TEXT;
--
-- UPDATE public.tournament_prizes
-- SET prize = TRIM(
--   CONCAT(
--     amount::text,
--     CASE
--       WHEN currency IS NOT NULL AND currency <> '' THEN ' ' || currency
--       ELSE ''
--     END
--   )
-- )
-- WHERE prize IS NULL OR prize = '';
--
-- ALTER TABLE public.tournament_prizes DROP COLUMN IF EXISTS amount;
-- ALTER TABLE public.tournament_prizes DROP COLUMN IF EXISTS currency;

-- ============================================================
-- 3) Ví dụ seed (đổi tournament_id cho đúng giải của bạn)
-- ============================================================

-- INSERT INTO public.tournament_prizes (tournament_id, place_label, place_order, prize, description)
-- VALUES
--   (1, '🥇 Hạng 1', 1, '2.000.000 VND', NULL),
--   (1, '🥈 Hạng 2', 2, '1.000.000 VND', NULL),
--   (1, '🥉 Hạng 3', 3, '500.000 VND', NULL),
--   (1, 'Hạng 4', 4, 'Skin bundle', 'Quà in-game');

-- ============================================================
-- 4) Kiểm tra sau khi tạo
-- ============================================================

-- SELECT *
-- FROM public.tournament_prizes
-- WHERE tournament_id = 1
-- ORDER BY place_order ASC, id ASC;

-- ============================================================
-- 5) Xóa dữ liệu / xóa bảng (cẩn thận)
-- ============================================================

-- DELETE FROM public.tournament_prizes WHERE tournament_id = 1;
-- DROP TABLE IF EXISTS public.tournament_prizes;
