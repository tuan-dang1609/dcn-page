-- Bracket ops SQL (PostgreSQL / psql)
-- Chạy trực tiếp bằng psql / DBeaver — KHÔNG cần tắt database.
--
-- >>> Dùng Supabase SQL Editor: xem backend/docs/supabase_bracket_ops.sql <<<
--     (cú pháp DO $$ ... $$, keep-alive ping, delete/reset an toàn hơn)
--
-- Thay :bracket_id, :tournament_id bằng ID thật trước khi chạy.

-- ============================================================
-- 1) CHẨN ĐOÁN DOUBLE ELIM 8 ĐỘI
-- ============================================================

-- Round shape chuẩn 8 đội (single-bracket DE):
-- 1:4,2:2,3:1,4:2,5:2,6:1,7:1,8:1
SELECT round_number, COUNT(*) AS matches
FROM matches
WHERE bracket_id = :bracket_id
GROUP BY round_number
ORDER BY round_number;

-- Bracket "losers" ma (gây lỗi đẩy team sai nhánh):
SELECT id, name, stage
FROM brackets
WHERE tournament_id = :tournament_id
  AND LOWER(stage) = 'losers';

-- Trận nhánh trên đã có kết quả nhưng nhánh dưới còn trống:
SELECT
  upper.id,
  upper.round_number,
  upper.match_no,
  upper.winner_team_id,
  lower.id AS lower_match_id,
  lower.round_number AS lower_round,
  lower.match_no AS lower_match_no,
  lower.team_a_id,
  lower.team_b_id
FROM matches upper
LEFT JOIN matches lower ON lower.bracket_id = upper.bracket_id
  AND lower.round_number = CASE
    WHEN upper.round_number = 1 THEN 4
    WHEN upper.round_number = 2 THEN 5
    WHEN upper.round_number = 3 THEN 7
  END
  AND lower.match_no = CASE
    WHEN upper.round_number = 1 THEN CEIL(upper.match_no / 2.0)::int
    WHEN upper.round_number = 2 THEN upper.match_no
    WHEN upper.round_number = 3 THEN 1
  END
WHERE upper.bracket_id = :bracket_id
  AND upper.round_number BETWEEN 1 AND 3
  AND upper.winner_team_id IS NOT NULL
ORDER BY upper.round_number, upper.match_no;


-- ============================================================
-- 2) XÓA BRACKET (giữ DB chạy, dùng transaction)
-- ============================================================

BEGIN;

DELETE FROM match_games
WHERE match_id IN (SELECT id FROM matches WHERE bracket_id = :bracket_id);

DELETE FROM pickem_bracket_picks
WHERE bracket_id = :bracket_id;

DELETE FROM pickem_bracket_submissions
WHERE bracket_id = :bracket_id;

DELETE FROM matches
WHERE bracket_id = :bracket_id;

DELETE FROM brackets
WHERE id = :bracket_id;

COMMIT;


-- ============================================================
-- 3) RESET KẾT QUẢ BRACKET (giữ cấu trúc + seed vòng 1)
-- ============================================================

BEGIN;

DELETE FROM match_games
WHERE match_id IN (SELECT id FROM matches WHERE bracket_id = :bracket_id);

UPDATE matches
SET score_a = NULL,
    score_b = NULL,
    winner_team_id = NULL,
    status = 'scheduled'
WHERE bracket_id = :bracket_id
  AND round_number = 1;

UPDATE matches
SET score_a = NULL,
    score_b = NULL,
    winner_team_id = NULL,
    status = 'scheduled',
    team_a_id = NULL,
    team_b_id = NULL,
    seed_a = NULL,
    seed_b = NULL
WHERE bracket_id = :bracket_id
  AND round_number > 1;

COMMIT;


-- ============================================================
-- 4) XÓA BRACKET LOSERS MA (chỉ khi giải dùng single-bracket DE)
-- ============================================================

BEGIN;

DELETE FROM match_games
WHERE match_id IN (
  SELECT m.id
  FROM matches m
  JOIN brackets b ON b.id = m.bracket_id
  WHERE b.tournament_id = :tournament_id
    AND LOWER(b.stage) = 'losers'
);

DELETE FROM matches
WHERE bracket_id IN (
  SELECT id FROM brackets
  WHERE tournament_id = :tournament_id
    AND LOWER(stage) = 'losers'
);

DELETE FROM brackets
WHERE tournament_id = :tournament_id
  AND LOWER(stage) = 'losers';

COMMIT;


-- ============================================================
-- 5) SỬA THỦ CÔNG: đẩy loser R1-M1 xuống R4-M1 slot A (8 đội)
-- ============================================================

UPDATE matches lb
SET team_a_id = loser.team_id,
    seed_a = loser.seed
FROM (
  SELECT
    CASE
      WHEN winner_team_id = team_a_id THEN team_b_id
      ELSE team_a_id
    END AS team_id,
    CASE
      WHEN winner_team_id = team_a_id THEN seed_b
      ELSE seed_a
    END AS seed
  FROM matches
  WHERE bracket_id = :bracket_id
    AND round_number = 1
    AND match_no = 1
    AND winner_team_id IS NOT NULL
) loser
WHERE lb.bracket_id = :bracket_id
  AND lb.round_number = 4
  AND lb.match_no = 1
  AND lb.team_a_id IS NULL;


-- ============================================================
-- 6) LOGIC TỪNG LOẠI BRACKET (tham chiếu nhanh)
-- ============================================================
-- Single Elim   : winner qua next_match_id khi PATCH score
-- Double Elim   : winner qua next_match_id; loser qua propagateLoser (PATCH score / games)
-- Swiss         : pair-next-round API, không có loser bracket
-- Double Elimination:
--   4/6/8 đội trong 1 bracket
--   4 đội + teams_to_advance=2: shape 1:2,2:1,3:1,4:1 (không GF, 2 suất Advances)
--   6 đội: compact layout 2-2-1-2-1-1-1
-- Round Robin   : tạo sẵn tất cả trận, không auto-advance

-- Khuyến nghị: sau khi sửa code backend, chạy script:
--   bun run scripts/bracket-ops.js repropagate --bracket-id=:bracket_id
