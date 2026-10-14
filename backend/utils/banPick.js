import { pool } from "./db.js";

const VALID_FORMATS = new Set(["BO1", "BO3", "BO5"]);
const DEFAULT_TURN_TIME_LIMIT_SECONDS = 30;
const MIN_TURN_TIME_LIMIT_SECONDS = 5;
const MAX_TURN_TIME_LIMIT_SECONDS = 3600;
const STAFF_ROLE_IDS = new Set([1, 2, 3]);

/**
 * Luồng ban/pick (state.version = 2):
 *   waiting  — BTC đã tạo phòng, chưa chạy giờ. Bắt đầu khi 2 chủ đội bấm Sẵn sàng hoặc BTC bấm Bắt đầu.
 *   running  — lần lượt từng bước trong state.steps (cấm / chọn map / chọn bên).
 *              Hết giờ → server tự chọn ngẫu nhiên (xử lý khi có người tải trạng thái).
 *   done     — xong; map còn lại là map quyết định.
 * Chỉ đội trưởng của lượt đăng ký giải (tournament_teams.captain_user_id, không có thì chủ đội) thao tác lượt;
 * BTC chỉ bắt đầu / bỏ qua lượt (ngẫu nhiên) / làm lại.
 */

const DEFAULT_VALORANT_MAP_POOL = [
  {
    map_code: "bind",
    map_name: "BIND",
    image_url:
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=500&fit=crop",
    display_order: 1,
  },
  {
    map_code: "haven",
    map_name: "HAVEN",
    image_url:
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&h=500&fit=crop",
    display_order: 2,
  },
  {
    map_code: "split",
    map_name: "SPLIT",
    image_url:
      "https://images.unsplash.com/photo-1604076913837-52ab5f0e2f2e?w=800&h=500&fit=crop",
    display_order: 3,
  },
  {
    map_code: "ascent",
    map_name: "ASCENT",
    image_url:
      "https://images.unsplash.com/photo-1539650116574-8efeb43e2750?w=800&h=500&fit=crop",
    display_order: 4,
  },
  {
    map_code: "icebox",
    map_name: "ICEBOX",
    image_url:
      "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&h=500&fit=crop",
    display_order: 5,
  },
  {
    map_code: "breeze",
    map_name: "BREEZE",
    image_url:
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&h=500&fit=crop",
    display_order: 6,
  },
  {
    map_code: "lotus",
    map_name: "LOTUS",
    image_url:
      "https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800&h=500&fit=crop",
    display_order: 7,
  },
];

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeTurnTimeLimitSeconds = (
  value,
  fallback = DEFAULT_TURN_TIME_LIMIT_SECONDS,
) => {
  const parsed = toNumber(value);
  if (!parsed) {
    return fallback;
  }

  const rounded = Math.round(parsed);
  return Math.min(
    MAX_TURN_TIME_LIMIT_SECONDS,
    Math.max(MIN_TURN_TIME_LIMIT_SECONDS, rounded),
  );
};

const normalizeFormat = (value, fallback = "BO3") => {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (VALID_FORMATS.has(raw)) return raw;

  const bestOf = toNumber(value);
  if (bestOf === 1) return "BO1";
  if (bestOf === 5) return "BO5";
  if (bestOf === 3) return "BO3";

  return VALID_FORMATS.has(fallback) ? fallback : "BO3";
};

const normalizeTeamSlot = (value, fallback = "team1") =>
  value === "team1" || value === "team2" ? value : fallback;

const normalizeDeciderRule = (value, fallback = "lastActor") =>
  value === "lastActor" || value === "other" ? value : fallback;

const getOpponent = (team) => (team === "team1" ? "team2" : "team1");

const parseState = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return null;
};

let ensureBanPickTablesPromise = null;

export const buildRoundSlug = ({
  tournamentSlug,
  roundNumber,
  matchNo,
  matchId,
}) => {
  const base = String(tournamentSlug ?? "tournament")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  const safeRound = toNumber(roundNumber) ?? 0;
  const safeMatchNo = toNumber(matchNo) ?? toNumber(matchId) ?? 0;
  const safeMatchId = toNumber(matchId) ?? 0;

  return `${base || "tournament"}-r${safeRound}-m${safeMatchNo}-${safeMatchId}`;
};

const toTeamNames = (sessionRow) => ({
  team1: String(sessionRow.team_a_name ?? "TEAM A"),
  team2: String(sessionRow.team_b_name ?? "TEAM B"),
});

/* ───────────── Luật ───────────── */

/**
 * Thứ tự lượt theo số map trong pool (N). Đội đi trước = firstTeam, sau đó luân phiên.
 *   BO1: cấm N-1 map.
 *   BO3: cấm, cấm, chọn, chọn, rồi cấm tới khi còn 1 map.
 *   BO5: cấm tối đa 2, chọn 4, rồi cấm tới khi còn 1 map.
 * Sau mỗi lần chọn map → đối thủ chọn bên. Map quyết định → bên theo deciderRule
 * ("lastActor" = đội thao tác cuối, "other" = đội còn lại).
 */
export const buildSteps = ({ format, mapCount, firstTeam, deciderRule }) => {
  const n = Math.max(0, mapCount);
  const kinds = [];

  if (format === "BO1") {
    for (let i = 0; i < n - 1; i += 1) kinds.push("ban");
  } else if (format === "BO3") {
    kinds.push("ban", "ban", "pick", "pick");
    for (let i = 0; i < n - 5; i += 1) kinds.push("ban");
  } else {
    const preBans = Math.min(2, Math.max(0, n - 5));
    for (let i = 0; i < preBans; i += 1) kinds.push("ban");
    kinds.push("pick", "pick", "pick", "pick");
    for (let i = 0; i < n - 5 - preBans; i += 1) kinds.push("ban");
  }

  const steps = [];
  let lastActor = firstTeam;
  kinds.slice(0, Math.max(0, n - 1)).forEach((kind, index) => {
    const team = index % 2 === 0 ? firstTeam : getOpponent(firstTeam);
    lastActor = team;
    steps.push({ kind, team });
    if (kind === "pick") steps.push({ kind: "side", team: getOpponent(team) });
  });

  // Còn đúng 1 map sau các lượt cấm/chọn → map quyết định cần chọn bên
  if (kinds.length === n - 1 && n > 0) {
    steps.push({
      kind: "side",
      team: deciderRule === "other" ? getOpponent(lastActor) : lastActor,
    });
  }

  return steps;
};

const derivePhase = (state) => {
  if (state.status === "waiting") return "waiting";
  if (state.status === "done") return "complete";
  return state.steps[state.stepIndex]?.kind === "side" ? "side_select" : "ban_pick";
};

const withPhase = (state) => ({ ...state, phase: derivePhase(state) });

const createInitialState = ({
  mapPool,
  format,
  teamNames,
  firstTeam = "team1",
  deciderRule = "lastActor",
}) =>
  withPhase({
    version: 2,
    status: "waiting",
    format,
    firstTeam,
    deciderRule,
    teamNames,
    steps: buildSteps({ format, mapCount: mapPool.length, firstTeam, deciderRule }),
    stepIndex: 0,
    currentStep: 0,
    ready: { team1: false, team2: false },
    maps: mapPool.map((map) => ({ mapId: map.map_code, status: "available" })),
    actionLog: [],
  });

/** Map đang chờ chọn bên: map đã chọn / quyết định chưa có bên, theo thứ tự thi đấu. */
export const getSideTargetMap = (state) =>
  (state.maps ?? [])
    .filter(
      (map) => (map.status === "picked" || map.status === "decider") && !map.side,
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0] ?? null;

export const getCurrentStep = (state) =>
  state.status === "running" ? state.steps[state.stepIndex] ?? null : null;

/**
 * Áp 1 bước (cấm / chọn / chọn bên). Trả null nếu lựa chọn không hợp lệ.
 * random = true khi server tự chọn (hết giờ hoặc BTC bỏ qua lượt).
 */
const applyStep = (state, { mapId, side }, random) => {
  const step = getCurrentStep(state);
  if (!step) return null;

  let maps = state.maps;
  let record;

  if (step.kind === "side") {
    const target = getSideTargetMap(state);
    const normalizedSide = String(side ?? "").toUpperCase();
    if (!target || (normalizedSide !== "ATK" && normalizedSide !== "DEF")) return null;
    const otherSide = normalizedSide === "ATK" ? "DEF" : "ATK";
    const sideMap =
      step.team === "team1"
        ? { team1: normalizedSide, team2: otherSide }
        : { team1: otherSide, team2: normalizedSide };
    maps = maps.map((map) =>
      map.mapId === target.mapId
        ? { ...map, side: sideMap, sideChosenBy: step.team, sideRandom: random }
        : map,
    );
    record = {
      step: state.stepIndex,
      mapId: target.mapId,
      action: "side_select",
      team: step.team,
      side: normalizedSide,
      random,
    };
  } else {
    const target = maps.find(
      (map) => map.mapId === String(mapId ?? "") && map.status === "available",
    );
    if (!target) return null;
    const pickedCount = maps.filter((map) => map.status === "picked").length;
    maps = maps.map((map) =>
      map.mapId === target.mapId
        ? step.kind === "ban"
          ? { ...map, status: "banned", actionBy: step.team, actionType: "ban", random }
          : {
              ...map,
              status: "picked",
              actionBy: step.team,
              actionType: "pick",
              order: pickedCount + 1,
              random,
            }
        : map,
    );

    // Hết lượt cấm/chọn mà còn đúng 1 map → map quyết định
    const banPickLeft = state.steps
      .slice(state.stepIndex + 1)
      .some((next) => next.kind !== "side");
    const available = maps.filter((map) => map.status === "available");
    if (!banPickLeft && available.length === 1) {
      const order = maps.filter((map) => map.status === "picked").length + 1;
      maps = maps.map((map) =>
        map.mapId === available[0].mapId
          ? { ...map, status: "decider", actionType: "pick", order }
          : map,
      );
    }

    record = {
      step: state.stepIndex,
      mapId: target.mapId,
      action: step.kind,
      team: step.team,
      random,
    };
  }

  const stepIndex = state.stepIndex + 1;
  const done = stepIndex >= state.steps.length;
  return {
    state: withPhase({
      ...state,
      maps,
      stepIndex,
      currentStep: stepIndex,
      status: done ? "done" : "running",
      actionLog: [...(state.actionLog ?? []), record],
    }),
    record,
  };
};

const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

const applyRandomStep = (state) => {
  const step = getCurrentStep(state);
  if (!step) return null;
  if (step.kind === "side") {
    return applyStep(state, { side: pickRandom(["ATK", "DEF"]) }, true);
  }
  const available = state.maps.filter((map) => map.status === "available");
  return available.length
    ? applyStep(state, { mapId: pickRandom(available).mapId }, true)
    : null;
};

/**
 * Hết giờ lượt → chọn ngẫu nhiên. Lượt kế bắt đầu đúng lúc lượt trước hết hạn,
 * nên nếu không ai mở trang trong lúc đó vẫn bắt kịp đúng số lượt đã trôi qua.
 */
const settleTimeouts = ({ state, turnStartedAt, turnLimitSeconds, now = Date.now() }) => {
  let current = state;
  let startedAt = turnStartedAt ? new Date(turnStartedAt).getTime() : null;
  const records = [];
  const limitMs = turnLimitSeconds * 1000;

  while (
    current.status === "running" &&
    startedAt !== null &&
    now >= startedAt + limitMs &&
    records.length < 64
  ) {
    const result = applyRandomStep(current);
    if (!result) break;
    current = result.state;
    records.push(result.record);
    startedAt += limitMs;
  }

  return {
    state: current,
    records,
    turnStartedAt:
      current.status === "running" && startedAt !== null
        ? new Date(startedAt).toISOString()
        : null,
  };
};

/**
 * Phiên cũ (luồng trước, không có version 2): đã xong thì giữ kết quả để hiển thị,
 * chưa xong thì tạo lại từ đầu ở trạng thái chờ.
 */
const normalizeStoredState = ({ sessionRow, mapPool }) => {
  const format = normalizeFormat(sessionRow.format, "BO3");
  const teamNames = toTeamNames(sessionRow);
  const parsed = parseState(sessionRow.state);

  if (parsed?.version === 2 && Array.isArray(parsed.steps)) {
    return withPhase({
      ...parsed,
      format,
      teamNames,
      firstTeam: normalizeTeamSlot(parsed.firstTeam),
      deciderRule: normalizeDeciderRule(parsed.deciderRule),
      ready: {
        team1: Boolean(parsed.ready?.team1),
        team2: Boolean(parsed.ready?.team2),
      },
      stepIndex: toNumber(parsed.stepIndex) ?? 0,
      actionLog: Array.isArray(parsed.actionLog) ? parsed.actionLog : [],
    });
  }

  if (parsed?.phase === "complete" && Array.isArray(parsed.maps)) {
    return withPhase({
      version: 2,
      status: "done",
      format,
      firstTeam: "team1",
      deciderRule: "lastActor",
      teamNames,
      steps: [],
      stepIndex: 0,
      currentStep: 0,
      ready: { team1: true, team2: true },
      maps: parsed.maps.map((map) => ({
        ...map,
        mapId: String(map.mapId ?? map.map_code ?? ""),
      })),
      actionLog: Array.isArray(parsed.actionLog) ? parsed.actionLog : [],
    });
  }

  return createInitialState({ mapPool, format, teamNames });
};

export const ensureBanPickTables = async () => {
  if (ensureBanPickTablesPromise) {
    return ensureBanPickTablesPromise;
  }

  ensureBanPickTablesPromise = (async () => {
    await pool.query(
      `
    CREATE TABLE IF NOT EXISTS map_pool (
      id BIGSERIAL PRIMARY KEY,
      game_key TEXT NOT NULL,
      map_code TEXT NOT NULL,
      map_name TEXT NOT NULL,
      image_url TEXT NOT NULL,
      display_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (game_key, map_code)
    )
    `,
    );

    await pool.query(
      `
    CREATE TABLE IF NOT EXISTS ban_picks (
      id BIGSERIAL PRIMARY KEY,
      round_slug TEXT NOT NULL UNIQUE,
      match_id BIGINT NOT NULL UNIQUE,
      tournament_id BIGINT NULL,
      team_a_id BIGINT NULL,
      team_b_id BIGINT NULL,
      format TEXT NOT NULL DEFAULT 'BO3',
      turn_time_limit_seconds INT NOT NULL DEFAULT 30,
      turn_started_at TIMESTAMPTZ NULL,
      phase TEXT NOT NULL DEFAULT 'ban_pick',
      current_step INT NOT NULL DEFAULT 0,
      selected_map_code TEXT NULL,
      side_select_map_code TEXT NULL,
      side_select_team TEXT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    `,
    );

    await pool.query(
      `
    CREATE TABLE IF NOT EXISTS ban_pick_actions (
      id BIGSERIAL PRIMARY KEY,
      ban_pick_id BIGINT NOT NULL REFERENCES ban_picks(id) ON DELETE CASCADE,
      step INT NOT NULL DEFAULT 0,
      map_code TEXT NULL,
      action_type TEXT NOT NULL,
      team_slot TEXT NULL,
      side TEXT NULL,
      acted_by_user_id BIGINT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    `,
    );

    await pool.query(
      `
    ALTER TABLE matches
    ADD COLUMN IF NOT EXISTS ban_pick_id BIGINT NULL
    `,
    );

    await pool.query(
      `
    ALTER TABLE matches
    ADD COLUMN IF NOT EXISTS room_id TEXT NULL
    `,
    );

    await pool.query(
      `
    ALTER TABLE ban_picks
    ADD COLUMN IF NOT EXISTS turn_time_limit_seconds INT NOT NULL DEFAULT 30
    `,
    );

    await pool.query(
      `
    ALTER TABLE ban_picks
    ADD COLUMN IF NOT EXISTS turn_started_at TIMESTAMPTZ NULL
    `,
    );

    await pool.query(
      `
    CREATE INDEX IF NOT EXISTS idx_ban_picks_match_id ON ban_picks(match_id)
    `,
    );

    await pool.query(
      `
    CREATE INDEX IF NOT EXISTS idx_ban_pick_actions_ban_pick_id ON ban_pick_actions(ban_pick_id)
    `,
    );

    await pool.query(
      `
    DO $$
    BEGIN
      ALTER TABLE ban_picks
        ADD CONSTRAINT fk_ban_picks_match
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    `,
    );

    await pool.query(
      `
    DO $$
    BEGIN
      ALTER TABLE matches
        ADD CONSTRAINT fk_matches_ban_pick
        FOREIGN KEY (ban_pick_id) REFERENCES ban_picks(id) ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    `,
    );

    for (const map of DEFAULT_VALORANT_MAP_POOL) {
      await pool.query(
        `
      INSERT INTO map_pool (game_key, map_code, map_name, image_url, display_order)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (game_key, map_code)
      DO UPDATE SET
        map_name = EXCLUDED.map_name,
        image_url = EXCLUDED.image_url,
        display_order = EXCLUDED.display_order,
        updated_at = NOW()
      `,
        [
          "valorant",
          map.map_code,
          map.map_name,
          map.image_url,
          map.display_order,
        ],
      );
    }
  })().catch((error) => {
    ensureBanPickTablesPromise = null;
    throw error;
  });

  return ensureBanPickTablesPromise;
};

export const getMapPool = async (gameKey = "valorant") => {
  const { rows } = await pool.query(
    `
    SELECT map_code, map_name, image_url
    FROM map_pool
    WHERE game_key = $1 AND is_active = TRUE
    ORDER BY display_order ASC, id ASC
    `,
    [gameKey],
  );

  return rows;
};

const getMatchContext = async (matchId) => {
  const { rows } = await pool.query(
    `
    SELECT m.id,
           m.tournament_id,
           m.team_a_id,
           m.team_b_id,
           m.round_number,
           m.match_no,
          m.room_id,
           m.ban_pick_id,
           COALESCE((to_jsonb(m)->>'best_of')::int, 3) AS best_of,
           t.slug AS tournament_slug,
           ta.name AS team_a_name,
           tb.name AS team_b_name
    FROM matches m
    LEFT JOIN tournaments t ON t.id = m.tournament_id
    LEFT JOIN teams ta ON ta.id = m.team_a_id
    LEFT JOIN teams tb ON tb.id = m.team_b_id
    WHERE m.id = $1
    LIMIT 1
    `,
    [matchId],
  );

  return rows[0] ?? null;
};

const getBanPickRowBySlug = async (roundSlug) => {
  const { rows } = await pool.query(
    `
    SELECT bp.*,
           m.round_number,
           m.match_no,
           m.date_scheduled,
          m.status AS match_status,
          m.room_id AS match_room_id,
           m.team_a_id AS match_team_a_id,
           m.team_b_id AS match_team_b_id,
           ta.name AS team_a_name,
           tb.name AS team_b_name,
           -- Người ban/pick = đội trưởng lượt đăng ký giải đó (không có thì chủ đội)
           COALESCE(rta.captain_user_id, ta.created_by) AS team_a_owner_id,
           COALESCE(rtb.captain_user_id, tb.created_by) AS team_b_owner_id,
           tr.created_by AS tournament_owner_id
    FROM ban_picks bp
    LEFT JOIN matches m ON m.id = bp.match_id
    LEFT JOIN teams ta ON ta.id = COALESCE(m.team_a_id, bp.team_a_id)
    LEFT JOIN teams tb ON tb.id = COALESCE(m.team_b_id, bp.team_b_id)
    LEFT JOIN tournaments tr ON tr.id = COALESCE(m.tournament_id, bp.tournament_id)
    LEFT JOIN tournament_teams rta
      ON rta.team_id = ta.id AND rta.tournament_id = COALESCE(m.tournament_id, bp.tournament_id)
    LEFT JOIN tournament_teams rtb
      ON rtb.team_id = tb.id AND rtb.tournament_id = COALESCE(m.tournament_id, bp.tournament_id)
    WHERE bp.round_slug = $1
    LIMIT 1
    `,
    [roundSlug],
  );

  return rows[0] ?? null;
};

const getBanPickRowByMatchId = async (matchId) => {
  const { rows } = await pool.query(
    `
    SELECT bp.*,
           m.round_number,
           m.match_no,
           m.date_scheduled,
          m.status AS match_status,
          m.room_id AS match_room_id,
           m.team_a_id AS match_team_a_id,
           m.team_b_id AS match_team_b_id,
           ta.name AS team_a_name,
           tb.name AS team_b_name,
           -- Người ban/pick = đội trưởng lượt đăng ký giải đó (không có thì chủ đội)
           COALESCE(rta.captain_user_id, ta.created_by) AS team_a_owner_id,
           COALESCE(rtb.captain_user_id, tb.created_by) AS team_b_owner_id,
           tr.created_by AS tournament_owner_id
    FROM ban_picks bp
    LEFT JOIN matches m ON m.id = bp.match_id
    LEFT JOIN teams ta ON ta.id = COALESCE(m.team_a_id, bp.team_a_id)
    LEFT JOIN teams tb ON tb.id = COALESCE(m.team_b_id, bp.team_b_id)
    LEFT JOIN tournaments tr ON tr.id = COALESCE(m.tournament_id, bp.tournament_id)
    LEFT JOIN tournament_teams rta
      ON rta.team_id = ta.id AND rta.tournament_id = COALESCE(m.tournament_id, bp.tournament_id)
    LEFT JOIN tournament_teams rtb
      ON rtb.team_id = tb.id AND rtb.tournament_id = COALESCE(m.tournament_id, bp.tournament_id)
    WHERE bp.match_id = $1
    LIMIT 1
    `,
    [matchId],
  );

  return rows[0] ?? null;
};

const hydrateSessionFromRow = async (row) => {
  if (!row) return null;

  const effectiveTeamAId =
    toNumber(row.match_team_a_id) ?? toNumber(row.team_a_id);
  const effectiveTeamBId =
    toNumber(row.match_team_b_id) ?? toNumber(row.team_b_id);

  if (
    effectiveTeamAId !== toNumber(row.team_a_id) ||
    effectiveTeamBId !== toNumber(row.team_b_id)
  ) {
    await pool.query(
      `
      UPDATE ban_picks
      SET team_a_id = $1,
          team_b_id = $2,
          updated_at = NOW()
      WHERE id = $3
      `,
      [effectiveTeamAId, effectiveTeamBId, row.id],
    );
  }

  const normalizedRow = {
    ...row,
    team_a_id: effectiveTeamAId,
    team_b_id: effectiveTeamBId,
  };

  const mapPool = await getMapPool("valorant");
  const state = normalizeStoredState({ sessionRow: normalizedRow, mapPool });

  return {
    ...normalizedRow,
    state,
    map_pool: mapPool,
  };
};

const getBanPickSessionByMatchId = async (matchId) => {
  const row = await getBanPickRowByMatchId(matchId);
  return hydrateSessionFromRow(row);
};

export const getBanPickSessionByRoundSlug = async (roundSlug) => {
  const row = await getBanPickRowBySlug(roundSlug);
  return hydrateSessionFromRow(row);
};

export const createBanPickSession = async ({
  matchId,
  roundSlug,
  format,
  countdownSeconds,
}) => {
  const match = await getMatchContext(matchId);
  if (!match) return null;

  const existingByMatch = await getBanPickRowByMatchId(matchId);
  if (existingByMatch) {
    return configureExistingSession({
      session: await hydrateSessionFromRow(existingByMatch),
      format,
      countdownSeconds,
    });
  }

  const normalizedFormat = normalizeFormat(format ?? match.best_of ?? 3, "BO3");
  const normalizedTurnTime = normalizeTurnTimeLimitSeconds(
    countdownSeconds,
    DEFAULT_TURN_TIME_LIMIT_SECONDS,
  );
  const mapPool = await getMapPool("valorant");
  const teamNames = {
    team1: String(match.team_a_name ?? "TEAM A"),
    team2: String(match.team_b_name ?? "TEAM B"),
  };

  const sessionState = createInitialState({
    mapPool,
    format: normalizedFormat,
    teamNames,
  });

  const computedRoundSlug =
    roundSlug ??
    buildRoundSlug({
      tournamentSlug: match.tournament_slug,
      roundNumber: match.round_number,
      matchNo: match.match_no,
      matchId: match.id,
    });

  // Tạo phòng ≠ bắt đầu: turn_started_at để trống tới khi bắt đầu
  const { rows } = await pool.query(
    `
    INSERT INTO ban_picks (
      round_slug,
      match_id,
      tournament_id,
      team_a_id,
      team_b_id,
      format,
      turn_time_limit_seconds,
      turn_started_at,
      phase,
      current_step,
      selected_map_code,
      side_select_map_code,
      side_select_team,
      status,
      state
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, 0, NULL, NULL, NULL, 'waiting', $9::jsonb)
    RETURNING id, round_slug
    `,
    [
      computedRoundSlug,
      match.id,
      match.tournament_id ?? null,
      match.team_a_id ?? null,
      match.team_b_id ?? null,
      normalizedFormat,
      normalizedTurnTime,
      sessionState.phase,
      JSON.stringify(sessionState),
    ],
  );

  const createdId = rows[0]?.id;
  if (!createdId) return null;

  await pool.query(
    `
    UPDATE matches
    SET ban_pick_id = $1
    WHERE id = $2
    `,
    [createdId, match.id],
  );

  return getBanPickSessionByRoundSlug(rows[0].round_slug);
};

/**
 * Setup lại từ trang BTC: chỉ đổi thể thức / thời gian khi phòng còn ở trạng thái chờ.
 * Đã bắt đầu thì giữ nguyên (muốn đổi phải bấm "Làm lại" trên trang ban/pick).
 */
const configureExistingSession = async ({ session, format, countdownSeconds }) => {
  if (!session) return session;
  const hasFormat = format !== null && format !== undefined && String(format).trim() !== "";
  const hasCountdown =
    countdownSeconds !== null &&
    countdownSeconds !== undefined &&
    String(countdownSeconds).trim() !== "";
  if (!hasFormat && !hasCountdown) return session;
  if (session.state.status !== "waiting") return session;

  await withLockedBanPick(session, ({ state, turnLimitSeconds }) => ({
    ok: true,
    ...reconfigure({
      session,
      state,
      turnLimitSeconds,
      format: hasFormat ? format : undefined,
      countdownSeconds: hasCountdown ? countdownSeconds : undefined,
    }),
  }));

  return getBanPickSessionByRoundSlug(session.round_slug);
};

export const ensureSessionByRoundSlug = async ({
  roundSlug,
  matchId,
  format,
  countdownSeconds,
}) => {
  const existing = await getBanPickSessionByRoundSlug(roundSlug);
  if (existing) {
    return configureExistingSession({ session: existing, format, countdownSeconds });
  }

  const matchIdAsNumber = toNumber(matchId);
  if (!matchIdAsNumber) return null;

  return createBanPickSession({
    matchId: matchIdAsNumber,
    roundSlug,
    format,
    countdownSeconds,
  });
};

/** Tìm phiên theo slug, nếu không có thì theo match_id (slug cũ/mới khác nhau vẫn ra đúng phiên). */
export const findBanPickSession = async ({ roundSlug, matchId }) => {
  const normalizedRoundSlug = String(roundSlug ?? "")
    .trim()
    .toLowerCase();
  let session = normalizedRoundSlug
    ? await getBanPickSessionByRoundSlug(normalizedRoundSlug)
    : null;
  const matchIdAsNumber = toNumber(matchId);
  if (!session && matchIdAsNumber) {
    session = await getBanPickSessionByMatchId(matchIdAsNumber);
  }
  return session;
};

export const deleteBanPickSession = async ({ roundSlug, matchId }) => {
  const normalizedRoundSlug = String(roundSlug ?? "")
    .trim()
    .toLowerCase();
  const matchIdAsNumber = toNumber(matchId);

  const { rows: candidateRows } = await pool.query(
    `
    SELECT bp.id::text AS id,
           bp.round_slug,
           bp.match_id::text AS match_id
    FROM ban_picks bp
    WHERE ($1 <> '' AND bp.round_slug = $1)
       OR ($2::bigint IS NOT NULL AND bp.match_id = $2::bigint)
       OR (
         $2::bigint IS NOT NULL
         AND bp.id = (
           SELECT m.ban_pick_id
           FROM matches m
           WHERE m.id = $2::bigint
           LIMIT 1
         )
       )
    ORDER BY bp.updated_at DESC NULLS LAST, bp.id DESC
    LIMIT 1
    `,
    [normalizedRoundSlug, matchIdAsNumber],
  );

  const target = candidateRows[0] ?? null;

  if (!target) {
    if (matchIdAsNumber) {
      await pool.query(
        `
        UPDATE matches
        SET ban_pick_id = NULL
        WHERE id = $1
        `,
        [matchIdAsNumber],
      );
    }

    return { deleted: false, session: null };
  }

  const targetId = String(target.id ?? "").trim();
  const targetMatchId =
    toNumber(target.match_id) ?? toNumber(matchId) ?? matchIdAsNumber;

  await pool.query(
    `
    UPDATE matches
    SET ban_pick_id = NULL
    WHERE ban_pick_id = $1::bigint
       OR ($2::bigint IS NOT NULL AND id = $2::bigint)
    `,
    [targetId, targetMatchId],
  );

  const { rows: deletedRows } = await pool.query(
    `
    DELETE FROM ban_picks
    WHERE id = $1::bigint
       OR ($2::bigint IS NOT NULL AND match_id = $2::bigint)
    RETURNING id::text AS id,
              round_slug,
              match_id::text AS match_id
    `,
    [targetId, targetMatchId],
  );

  const firstDeleted = deletedRows[0] ?? target;

  return {
    deleted: (deletedRows?.length ?? 0) > 0,
    session: {
      id: String(firstDeleted.id ?? "").trim() || null,
      round_slug: String(firstDeleted.round_slug ?? ""),
      match_id: toNumber(firstDeleted.match_id),
    },
  };
};

/* ───────────── Quyền ───────────── */

/** Chỉ đội trưởng lượt đăng ký giải (captain_user_id, không có thì teams.created_by) được thao tác lượt. */
export const resolveUserTeamSlot = (user, session) => {
  const userId = toNumber(user?.id);
  if (!userId || !session) return null;

  if (toNumber(session.team_a_owner_id) === userId) return "team1";
  if (toNumber(session.team_b_owner_id) === userId) return "team2";
  return null;
};

/** BTC: role 1–3 (admin / mod / trọng tài) hoặc người tạo giải. */
export const isBanPickAdmin = (user, session) => {
  if (!user) return false;
  if (STAFF_ROLE_IDS.has(toNumber(user.role_id))) return true;
  const ownerId = toNumber(session?.tournament_owner_id);
  return Boolean(ownerId) && ownerId === toNumber(user.id);
};

/* ───────────── Trả về client ───────────── */

export const getCurrentAction = (state) => {
  const step = getCurrentStep(state);
  return step ? { type: step.kind, team: step.team } : null;
};

export const toBanPickPayload = (session, userTeamSlot = null, viewerIsAdmin = false) => {
  const state = session.state;
  const currentAction = getCurrentAction(state);
  const sideTarget = currentAction?.type === "side" ? getSideTargetMap(state) : null;
  const turnTimeLimitSeconds = normalizeTurnTimeLimitSeconds(
    session.turn_time_limit_seconds,
    DEFAULT_TURN_TIME_LIMIT_SECONDS,
  );

  const turnStartedAt =
    state.status === "running" && session.turn_started_at
      ? new Date(session.turn_started_at)
      : null;
  const turnStartedAtIso =
    turnStartedAt && !Number.isNaN(turnStartedAt.getTime())
      ? turnStartedAt.toISOString()
      : null;
  const turnDeadlineAtIso = turnStartedAtIso
    ? new Date(new Date(turnStartedAtIso).getTime() + turnTimeLimitSeconds * 1000).toISOString()
    : null;
  const turnRemainingSeconds = turnDeadlineAtIso
    ? Math.max(0, Math.ceil((new Date(turnDeadlineAtIso).getTime() - Date.now()) / 1000))
    : null;

  return {
    id: toNumber(session.id),
    round_slug: String(session.round_slug),
    match_id: toNumber(session.match_id),
    tournament_id: toNumber(session.tournament_id),
    room_id: String(session.match_room_id ?? session.room_id ?? "").trim() || null,
    match_status: String(session.match_status ?? "").trim() || null,
    round_number: toNumber(session.round_number),
    match_no: toNumber(session.match_no),
    status: state.status,
    phase: state.phase,
    format: state.format,
    first_team: state.firstTeam,
    decider_rule: state.deciderRule,
    ready: state.ready,
    steps: state.steps,
    step_index: state.stepIndex,
    turn_time_limit_seconds: turnTimeLimitSeconds,
    turn_started_at: turnStartedAtIso,
    turn_deadline_at: turnDeadlineAtIso,
    turn_remaining_seconds: turnRemainingSeconds,
    server_time: new Date().toISOString(),
    current_step: state.stepIndex,
    side_select_map_id: sideTarget?.mapId ?? null,
    side_select_team: currentAction?.type === "side" ? currentAction.team : null,
    current_action: currentAction,
    team_a: {
      id: toNumber(session.team_a_id),
      name: state.teamNames.team1,
    },
    team_b: {
      id: toNumber(session.team_b_id),
      name: state.teamNames.team2,
    },
    map_pool: session.map_pool,
    state,
    viewer_team_slot: userTeamSlot,
    viewer_is_admin: viewerIsAdmin,
  };
};

/* ───────────── Ghi có khoá (tránh 2 người bấm cùng lúc) ───────────── */

const sessionWithState = (session, row) =>
  normalizeStoredState({
    sessionRow: { ...session, state: row.state, format: row.format },
    mapPool: session.map_pool,
  });

/**
 * Khoá dòng ban_picks (SELECT … FOR UPDATE), xử lý lượt hết giờ trước, rồi gọi mutator.
 * mutator trả { ok, status?, error?, state?, turnStartedAt?, turnLimitSeconds?, format?, records? };
 * không có state → không ghi gì thêm.
 */
const withLockedBanPick = async (session, mutator) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `
      SELECT id, state, format, turn_time_limit_seconds, turn_started_at
      FROM ban_picks
      WHERE id = $1
      FOR UPDATE
      `,
      [session.id],
    );
    const row = rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { ok: false, status: 404, error: "Không tìm thấy phiên ban/pick" };
    }

    const turnLimitSeconds = normalizeTurnTimeLimitSeconds(row.turn_time_limit_seconds);
    const settled = settleTimeouts({
      state: sessionWithState(session, row),
      turnStartedAt: row.turn_started_at,
      turnLimitSeconds,
    });

    const result =
      (await mutator({
        state: settled.state,
        turnStartedAt: settled.turnStartedAt,
        turnLimitSeconds,
      })) ?? { ok: true };

    const write = result.ok && result.state
      ? result
      : settled.records.length
        ? { state: settled.state, turnStartedAt: settled.turnStartedAt, records: [] }
        : null;

    if (!write) {
      await client.query("ROLLBACK");
      return result;
    }

    const nextState = write.state;
    const sideTarget = getCurrentStep(nextState)?.kind === "side" ? getSideTargetMap(nextState) : null;
    await client.query(
      `
      UPDATE ban_picks
      SET format = $1,
          turn_time_limit_seconds = $2,
          phase = $3,
          current_step = $4,
          selected_map_code = NULL,
          side_select_map_code = $5,
          side_select_team = $6,
          status = $7,
          state = $8::jsonb,
          turn_started_at = $9,
          updated_at = NOW()
      WHERE id = $10
      `,
      [
        normalizeFormat(write.format ?? nextState.format, "BO3"),
        write.turnLimitSeconds ?? turnLimitSeconds,
        nextState.phase,
        toNumber(nextState.stepIndex) ?? 0,
        sideTarget?.mapId ?? null,
        sideTarget ? getCurrentStep(nextState).team : null,
        nextState.status,
        JSON.stringify(nextState),
        write.turnStartedAt ?? null,
        session.id,
      ],
    );

    const records = [
      ...settled.records.map((record) => ({ ...record, userId: null })),
      ...(write === result ? result.records ?? [] : []),
    ];
    for (const record of records) {
      await client.query(
        `
        INSERT INTO ban_pick_actions (
          ban_pick_id, step, map_code, action_type, team_slot, side, acted_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          session.id,
          toNumber(record.step) ?? 0,
          record.mapId ?? null,
          record.random ? `${record.action}_random` : record.action,
          record.team ?? null,
          record.side ?? null,
          record.userId ?? null,
        ],
      );
    }

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const reconfigure = ({
  session,
  state,
  turnLimitSeconds,
  format,
  countdownSeconds,
  firstTeam,
  deciderRule,
}) => {
  const nextFormat = format !== undefined ? normalizeFormat(format, state.format) : state.format;
  return {
    format: nextFormat,
    turnLimitSeconds:
      countdownSeconds !== undefined
        ? normalizeTurnTimeLimitSeconds(countdownSeconds, turnLimitSeconds)
        : turnLimitSeconds,
    turnStartedAt: null,
    state: createInitialState({
      mapPool: session.map_pool,
      format: nextFormat,
      teamNames: toTeamNames(session),
      firstTeam: normalizeTeamSlot(firstTeam, state.firstTeam),
      deciderRule: normalizeDeciderRule(deciderRule, state.deciderRule),
    }),
    records: [],
  };
};

const startState = (state) =>
  withPhase({ ...state, status: "running", stepIndex: 0, currentStep: 0 });

/**
 * Áp lượt hết giờ còn tồn đọng khi có người tải trạng thái (không cần job nền).
 * Kiểm tra nhanh không khoá trước; chỉ khoá khi thực sự đã quá hạn.
 */
export const settleBanPickSession = async (session) => {
  if (!session || session.state.status !== "running" || !session.turn_started_at) {
    return session;
  }
  const limit = normalizeTurnTimeLimitSeconds(session.turn_time_limit_seconds);
  const deadline = new Date(session.turn_started_at).getTime() + limit * 1000;
  if (Date.now() < deadline) return session;

  await withLockedBanPick(session, () => ({ ok: true }));
  return getBanPickSessionByRoundSlug(session.round_slug);
};

/* ───────────── Lệnh ───────────── */

const TEAM_COMMANDS = new Set(["act", "ready"]);
const ADMIN_COMMANDS = new Set(["start", "skip", "reset", "configure"]);

export const mutateBanPickSession = async ({
  roundSlug,
  matchId,
  user,
  command,
  mapId,
  side,
  ready,
  config,
}) => {
  const session = await findBanPickSession({ roundSlug, matchId });
  if (!session) {
    return { ok: false, status: 404, error: "Không tìm thấy phiên ban/pick" };
  }

  const normalizedCommand = String(command ?? "").trim();
  const actorSlot = resolveUserTeamSlot(user, session);
  const isAdmin = isBanPickAdmin(user, session);
  const userId = toNumber(user?.id);

  if (TEAM_COMMANDS.has(normalizedCommand) && !actorSlot) {
    return {
      ok: false,
      status: 403,
      error: "Chỉ chủ đội của 2 đội trong trận mới được thao tác ban/pick",
    };
  }
  if (ADMIN_COMMANDS.has(normalizedCommand) && !isAdmin) {
    return { ok: false, status: 403, error: "Chỉ BTC mới được thao tác này" };
  }
  if (!TEAM_COMMANDS.has(normalizedCommand) && !ADMIN_COMMANDS.has(normalizedCommand)) {
    return { ok: false, status: 400, error: "Command không hợp lệ" };
  }

  const result = await withLockedBanPick(session, ({ state, turnStartedAt, turnLimitSeconds }) => {
    const nowIso = new Date().toISOString();

    switch (normalizedCommand) {
      case "act": {
        const step = getCurrentStep(state);
        if (!step) {
          return { ok: false, status: 400, error: "Ban/pick chưa bắt đầu hoặc đã kết thúc" };
        }
        if (step.team !== actorSlot) {
          return { ok: false, status: 403, error: "Chưa tới lượt đội của bạn" };
        }
        const applied = applyStep(state, { mapId, side }, false);
        if (!applied) {
          return { ok: false, status: 400, error: "Lựa chọn không hợp lệ" };
        }
        return {
          ok: true,
          state: applied.state,
          turnStartedAt: applied.state.status === "running" ? nowIso : null,
          records: [{ ...applied.record, userId }],
        };
      }
      case "ready": {
        if (state.status !== "waiting") {
          return { ok: false, status: 400, error: "Ban/pick đã bắt đầu" };
        }
        const nextReady = { ...state.ready, [actorSlot]: ready !== false };
        const next = withPhase({ ...state, ready: nextReady });
        const bothReady = nextReady.team1 && nextReady.team2;
        return {
          ok: true,
          state: bothReady ? startState(next) : next,
          turnStartedAt: bothReady ? nowIso : null,
          records: [
            { step: 0, action: bothReady ? "start" : ready === false ? "unready" : "ready", team: actorSlot, userId },
          ],
        };
      }
      case "start": {
        if (state.status !== "waiting") {
          return { ok: false, status: 400, error: "Ban/pick đã bắt đầu" };
        }
        return {
          ok: true,
          state: startState(state),
          turnStartedAt: nowIso,
          records: [{ step: 0, action: "start", userId }],
        };
      }
      case "skip": {
        const applied = applyRandomStep(state);
        if (!applied) {
          return { ok: false, status: 400, error: "Không có lượt nào để bỏ qua" };
        }
        return {
          ok: true,
          state: applied.state,
          turnStartedAt: applied.state.status === "running" ? nowIso : null,
          records: [{ ...applied.record, userId }],
        };
      }
      case "reset": {
        const next = reconfigure({ session, state, turnLimitSeconds });
        return { ...next, ok: true, records: [{ step: 0, action: "reset", userId }] };
      }
      case "configure": {
        if (state.status !== "waiting") {
          return {
            ok: false,
            status: 400,
            error: "Chỉ đổi thiết lập khi chưa bắt đầu (bấm Làm lại trước)",
          };
        }
        const next = reconfigure({
          session,
          state,
          turnLimitSeconds,
          format: config?.format,
          countdownSeconds: config?.countdown_seconds,
          firstTeam: config?.first_team,
          deciderRule: config?.decider_rule,
        });
        // Giữ trạng thái Sẵn sàng của 2 đội khi BTC chỉnh thiết lập
        return { ...next, ok: true, state: withPhase({ ...next.state, ready: state.ready }) };
      }
      default:
        return { ok: false, status: 400, error: "Command không hợp lệ" };
    }
  });

  if (!result.ok) return result;

  return {
    ok: true,
    status: 200,
    session: await getBanPickSessionByRoundSlug(session.round_slug),
  };
};

/**
 * Phòng ban/pick chưa xong mà người dùng là chủ đội (teams.created_by) — cho dải báo toàn trang.
 * Trả kèm link vào phòng: trang lobby của giải nếu biết game/slug, không thì /round/:slug.
 */
export const listOwnerBanPickSessions = async (user) => {
  const userId = toNumber(user?.id);
  if (!userId) return [];

  const { rows } = await pool.query(
    `
    SELECT bp.match_id,
           t.slug AS tournament_slug,
           t.name AS tournament_name,
           LOWER(g.short_name) AS game_short_name
    FROM ban_picks bp
    JOIN matches m ON m.id = bp.match_id
    LEFT JOIN teams ta ON ta.id = m.team_a_id
    LEFT JOIN teams tb ON tb.id = m.team_b_id
    LEFT JOIN tournaments t ON t.id = m.tournament_id
    LEFT JOIN games g ON g.id = t.game_id
    LEFT JOIN tournament_teams rta ON rta.team_id = ta.id AND rta.tournament_id = m.tournament_id
    LEFT JOIN tournament_teams rtb ON rtb.team_id = tb.id AND rtb.tournament_id = m.tournament_id
    WHERE (COALESCE(rta.captain_user_id, ta.created_by) = $1
        OR COALESCE(rtb.captain_user_id, tb.created_by) = $1)
      AND bp.status <> 'done'
      AND LOWER(COALESCE(m.status, '')) NOT IN ('completed', 'complete', 'finished')
    ORDER BY bp.updated_at DESC
    LIMIT 5
    `,
    [userId],
  );

  const items = [];
  for (const row of rows) {
    const session = await settleBanPickSession(
      await getBanPickSessionByMatchId(toNumber(row.match_id)),
    );
    if (!session || session.state.status === "done") continue;

    const slot = resolveUserTeamSlot(user, session);
    const payload = toBanPickPayload(session, slot, false);
    const lobbyPath =
      row.game_short_name && row.tournament_slug
        ? `/tournament/${row.game_short_name}/${row.tournament_slug}/lobby/${payload.match_id}`
        : `/round/${payload.round_slug}?matchId=${payload.match_id}`;

    items.push({
      match_id: payload.match_id,
      status: payload.status,
      format: payload.format,
      tournament_name: row.tournament_name ?? null,
      team_a: payload.team_a,
      team_b: payload.team_b,
      viewer_team_slot: slot,
      ready: payload.ready,
      current_action: payload.current_action,
      side_select_map_id: payload.side_select_map_id,
      turn_deadline_at: payload.turn_deadline_at,
      turn_time_limit_seconds: payload.turn_time_limit_seconds,
      server_time: payload.server_time,
      link: lobbyPath,
    });
  }

  return items;
};
