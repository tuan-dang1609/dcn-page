-- Seed giải thưởng cho tournament_id = 100
-- Chạy trên Supabase SQL Editor (bảng tournament_prizes phải đã tồn tại).

BEGIN;

DELETE FROM public.tournament_prizes
WHERE tournament_id = 100;

INSERT INTO public.tournament_prizes (tournament_id, place_label, place_order, prize, description)
VALUES
  (100, '🥇 1st', 1, '2.000.000 VND', NULL),
  (100, '🥈 2nd', 2, '1.000.000 VND', NULL),
  (100, '🥉 3rd', 3, '500.000 VND', NULL),
  (100, '4th', 4, '250.000 VND', NULL);

COMMIT;

-- Kiểm tra
SELECT id, tournament_id, place_label, place_order, prize, description
FROM public.tournament_prizes
WHERE tournament_id = 100
ORDER BY place_order ASC, id ASC;
