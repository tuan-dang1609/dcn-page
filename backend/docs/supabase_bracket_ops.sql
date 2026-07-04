-- =============================================================================
-- SUPABASE SQL EDITOR — Bracket ops + keep-alive
-- Chạy trực tiếp tại: Supabase Dashboard → SQL → New query
-- Không cần tắt DB. Copy từng section, sửa ID, rồi Run.
-- =============================================================================


-- =============================================================================
-- 0) KEEP-ALIVE — chạy định kỳ (2–3 ngày/lần) để tránh project Supabase pause
--    Ghi 1 dòng ping (INSERT/UPDATE) = có hoạt động ghi DB.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dev_db_ping (
  id integer PRIMARY KEY CHECK (id = 1),
  pinged_at timestamptz NOT NULL DEFAULT now(),
  note text
);

INSERT INTO public.dev_db_ping (id, pinged_at, note)
VALUES (1, now(), 'manual ping from supabase_bracket_ops.sql')
ON CONFLICT (id) DO UPDATE
SET pinged_at = EXCLUDED.pinged_at,
    note = EXCLUDED.note;

SELECT id, pinged_at, note FROM public.dev_db_ping;


-- =============================================================================
-- 1) XEM NHANH — tìm bracket_id / tournament_id trước khi xóa
-- =============================================================================

SELECT
  b.id AS bracket_id,
  b.name AS bracket_name,
  b.stage,
  t.id AS tournament_id,
  t.name AS tournament_name,
  f.name AS format_name,
  f.has_losers_bracket,
  COUNT(m.id) AS match_count
FROM brackets b
JOIN tournaments t ON t.id = b.tournament_id
JOIN formats f ON f.id = b.format_id
LEFT JOIN matches m ON m.bracket_id = b.id
GROUP BY b.id, b.name, b.stage, t.id, t.name, f.name, f.has_losers_bracket
ORDER BY b.id DESC
LIMIT 30;


-- =============================================================================
-- 2) CHẨN ĐOÁN DOUBLE ELIM 8 ĐỘI
--    Điền bracket_id / tournament_id vào các query bên dưới
-- =============================================================================

SELECT round_number, COUNT(*) AS matches
FROM matches
WHERE bracket_id = 0 -- <-- ĐIỀN bracket_id
GROUP BY round_number
ORDER BY round_number;

-- Shape chuẩn 8 đội DE (single bracket): 1:4,2:2,3:1,4:2,5:2,6:1,7:1,8:1

-- Bracket losers ma (gây lỗi đẩy team sai nhánh):
SELECT b.id, b.name, b.stage, COUNT(m.id) AS matches
FROM brackets b
LEFT JOIN matches m ON m.bracket_id = b.id
WHERE b.tournament_id = 0 -- <-- ĐIỀN tournament_id
  AND LOWER(b.stage) = 'losers'
GROUP BY b.id, b.name, b.stage;

-- Trận nhánh trên đã xong nhưng slot nhánh dưới còn trống:
SELECT
  u.id,
  u.round_number,
  u.match_no,
  u.winner_team_id,
  l.id AS lower_match_id,
  l.round_number AS lower_round,
  l.match_no AS lower_match_no,
  l.team_a_id,
  l.team_b_id
FROM matches u
LEFT JOIN matches l
  ON l.bracket_id = u.bracket_id
 AND l.round_number = CASE
    WHEN u.round_number = 1 THEN 4
    WHEN u.round_number = 2 THEN 5
    WHEN u.round_number = 3 THEN 7
  END
 AND l.match_no = CASE
    WHEN u.round_number = 1 THEN CEIL(u.match_no / 2.0)::int
    WHEN u.round_number = 2 THEN u.match_no
    WHEN u.round_number = 3 THEN 1
  END
WHERE u.bracket_id = 0 -- <-- ĐIỀN bracket_id
  AND u.round_number BETWEEN 1 AND 3
  AND u.winner_team_id IS NOT NULL
ORDER BY u.round_number, u.match_no;


-- =============================================================================
-- 3) XÓA 1 BRACKET (DELETE) — an toàn, dùng transaction
--    Sửa v_bracket_id
-- =============================================================================

DO $$
DECLARE
  v_bracket_id bigint := 0; -- <-- ĐIỀN bracket_id
  v_deleted_games int;
  v_deleted_matches int;
BEGIN
  IF v_bracket_id = 0 THEN
    RAISE EXCEPTION 'Hãy set v_bracket_id';
  END IF;

  DELETE FROM match_games
  WHERE match_id IN (SELECT id FROM matches WHERE bracket_id = v_bracket_id);
  GET DIAGNOSTICS v_deleted_games = ROW_COUNT;

  -- Bỏ comment nếu project có bảng pickem:
  -- DELETE FROM pickem_bracket_picks WHERE bracket_id = v_bracket_id;
  -- DELETE FROM pickem_bracket_submissions WHERE bracket_id = v_bracket_id;

  DELETE FROM matches WHERE bracket_id = v_bracket_id;
  GET DIAGNOSTICS v_deleted_matches = ROW_COUNT;

  DELETE FROM brackets WHERE id = v_bracket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bracket % không tồn tại', v_bracket_id;
  END IF;

  -- Ping keep-alive sau khi xóa
  INSERT INTO public.dev_db_ping (id, pinged_at, note)
  VALUES (1, now(), format('deleted bracket %s', v_bracket_id))
  ON CONFLICT (id) DO UPDATE
  SET pinged_at = EXCLUDED.pinged_at, note = EXCLUDED.note;

  RAISE NOTICE 'Đã xóa bracket % — match_games: %, matches: %',
    v_bracket_id, v_deleted_games, v_deleted_matches;
END $$;


-- =============================================================================
-- 4) RESET KẾT QUẢ BRACKET (giữ cấu trúc + team vòng 1)
--    Sửa v_bracket_id
-- =============================================================================

DO $$
DECLARE
  v_bracket_id bigint := 0; -- <-- ĐIỀN bracket_id
BEGIN
  IF v_bracket_id = 0 THEN
    RAISE EXCEPTION 'Hãy set v_bracket_id';
  END IF;

  DELETE FROM match_games
  WHERE match_id IN (SELECT id FROM matches WHERE bracket_id = v_bracket_id);

  UPDATE matches
  SET score_a = NULL,
      score_b = NULL,
      winner_team_id = NULL,
      status = 'scheduled'
  WHERE bracket_id = v_bracket_id
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
  WHERE bracket_id = v_bracket_id
    AND round_number > 1;

  INSERT INTO public.dev_db_ping (id, pinged_at, note)
  VALUES (1, now(), format('reset bracket %s', v_bracket_id))
  ON CONFLICT (id) DO UPDATE
  SET pinged_at = EXCLUDED.pinged_at, note = EXCLUDED.note;

  RAISE NOTICE 'Đã reset bracket %', v_bracket_id;
END $$;


-- =============================================================================
-- 5) XÓA BRACKET LOSERS MA (single-bracket DE không cần record này)
--    Sửa v_tournament_id
-- =============================================================================

DO $$
DECLARE
  v_tournament_id bigint := 0; -- <-- ĐIỀN tournament_id
BEGIN
  IF v_tournament_id = 0 THEN
    RAISE EXCEPTION 'Hãy set v_tournament_id';
  END IF;

  DELETE FROM match_games
  WHERE match_id IN (
    SELECT m.id
    FROM matches m
    JOIN brackets b ON b.id = m.bracket_id
    WHERE b.tournament_id = v_tournament_id
      AND LOWER(b.stage) = 'losers'
  );

  DELETE FROM matches
  WHERE bracket_id IN (
    SELECT id FROM brackets
    WHERE tournament_id = v_tournament_id
      AND LOWER(stage) = 'losers'
  );

  DELETE FROM brackets
  WHERE tournament_id = v_tournament_id
    AND LOWER(stage) = 'losers';

  INSERT INTO public.dev_db_ping (id, pinged_at, note)
  VALUES (1, now(), format('deleted ghost losers brackets, tournament %s', v_tournament_id))
  ON CONFLICT (id) DO UPDATE
  SET pinged_at = EXCLUDED.pinged_at, note = EXCLUDED.note;

  RAISE NOTICE 'Đã xóa ghost losers brackets cho tournament %', v_tournament_id;
END $$;


-- =============================================================================
-- 6) SỬA THỦ CÔNG LOSER 8 ĐỘI — R1-M1 thua → R4-M1 slot A
--    Sửa v_bracket_id
-- =============================================================================

DO $$
DECLARE
  v_bracket_id bigint := 0; -- <-- ĐIỀN bracket_id
BEGIN
  IF v_bracket_id = 0 THEN
    RAISE EXCEPTION 'Hãy set v_bracket_id';
  END IF;

  UPDATE matches lb
  SET team_a_id = loser.team_id,
      seed_a = loser.seed
  FROM (
    SELECT
      CASE WHEN winner_team_id = team_a_id THEN team_b_id ELSE team_a_id END AS team_id,
      CASE WHEN winner_team_id = team_a_id THEN seed_b ELSE seed_a END AS seed
    FROM matches
    WHERE bracket_id = v_bracket_id
      AND round_number = 1
      AND match_no = 1
      AND winner_team_id IS NOT NULL
  ) loser
  WHERE lb.bracket_id = v_bracket_id
    AND lb.round_number = 4
    AND lb.match_no = 1
    AND lb.team_a_id IS NULL;

  INSERT INTO public.dev_db_ping (id, pinged_at, note)
  VALUES (1, now(), format('manual loser fix R1-M1 bracket %s', v_bracket_id))
  ON CONFLICT (id) DO UPDATE
  SET pinged_at = EXCLUDED.pinged_at, note = EXCLUDED.note;
END $$;


-- =============================================================================
-- 7) RE-PROPAGATE LOSER (chạy lần lượt từng trận nhánh trên đã có winner)
--    Mapping 8 đội — chạy sau khi deploy fix backend, hoặc khi slot còn trống
--    Sửa v_bracket_id, chạy cả block
-- =============================================================================

DO $$
DECLARE
  v_bracket_id bigint := 0; -- <-- ĐIỀN bracket_id
  r record;
  v_loser_id bigint;
  v_loser_seed int;
  v_target_round int;
  v_target_match_no int;
  v_slot text;
BEGIN
  IF v_bracket_id = 0 THEN
    RAISE EXCEPTION 'Hãy set v_bracket_id';
  END IF;

  FOR r IN
    SELECT id, round_number, match_no, team_a_id, team_b_id,
           seed_a, seed_b, winner_team_id
    FROM matches
    WHERE bracket_id = v_bracket_id
      AND round_number <= 3
      AND winner_team_id IS NOT NULL
      AND team_a_id IS NOT NULL
      AND team_b_id IS NOT NULL
    ORDER BY round_number, match_no
  LOOP
    v_loser_id := CASE
      WHEN r.winner_team_id = r.team_a_id THEN r.team_b_id
      ELSE r.team_a_id
    END;
    v_loser_seed := CASE
      WHEN r.winner_team_id = r.team_a_id THEN r.seed_b
      ELSE r.seed_a
    END;

    IF r.round_number = 1 THEN
      v_target_round := 4;
      v_target_match_no := CEIL(r.match_no / 2.0)::int;
      v_slot := CASE WHEN r.match_no % 2 = 1 THEN 'A' ELSE 'B' END;
    ELSIF r.round_number = 2 THEN
      v_target_round := 5;
      v_target_match_no := r.match_no;
      v_slot := 'B';
    ELSIF r.round_number = 3 THEN
      v_target_round := 7;
      v_target_match_no := 1;
      v_slot := 'B';
    ELSE
      CONTINUE;
    END IF;

    IF v_slot = 'A' THEN
      UPDATE matches
      SET team_a_id = v_loser_id, seed_a = v_loser_seed
      WHERE bracket_id = v_bracket_id
        AND round_number = v_target_round
        AND match_no = v_target_match_no
        AND team_a_id IS NULL;
    ELSE
      UPDATE matches
      SET team_b_id = v_loser_id, seed_b = v_loser_seed
      WHERE bracket_id = v_bracket_id
        AND round_number = v_target_round
        AND match_no = v_target_match_no
        AND team_b_id IS NULL;
    END IF;
  END LOOP;

  INSERT INTO public.dev_db_ping (id, pinged_at, note)
  VALUES (1, now(), format('repropagate losers bracket %s', v_bracket_id))
  ON CONFLICT (id) DO UPDATE
  SET pinged_at = EXCLUDED.pinged_at, note = EXCLUDED.note;

  RAISE NOTICE 'Done repropagate for bracket %', v_bracket_id;
END $$;
