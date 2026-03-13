import { pool } from "./db.js";

const VALID_FORMATS = new Set(["BO1", "BO3", "BO5"]);

const ACTION_SEQUENCES = {
  BO1: [
    { type: "ban", team: "team1" },
    { type: "ban", team: "team2" },
    { type: "ban", team: "team1" },
    { type: "ban", team: "team2" },
    { type: "ban", team: "team1" },
    { type: "ban", team: "team2" },
  ],
  BO3: [
    { type: "ban", team: "team1" },
    { type: "ban", team: "team2" },
    { type: "pick", team: "team1" },
    { type: "pick", team: "team2" },
    { type: "ban", team: "team1" },
    { type: "ban", team: "team2" },
  ],
  BO5: [
    { type: "ban", team: "team1" },
    { type: "ban", team: "team2" },
    { type: "pick", team: "team1" },
    { type: "pick", team: "team2" },
    { type: "pick", team: "team1" },
    { type: "pick", team: "team2" },
  ],
};

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

const getSequence = (format) => ACTION_SEQUENCES[normalizeFormat(format)] ?? [];

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
    .replace(/[\u0300-\u036f]/g, "")
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

const createInitialState = ({ mapPool, format, teamNames }) => ({
  maps: mapPool.map((map) => ({ mapId: map.map_code, status: "available" })),
  currentStep: 0,
  format,
  teamNames,
  phase: "ban_pick",
  selectedMapId: null,
  sideSelectMapId: null,
  sideSelectTeam: null,
  actionLog: [],
});

const findCurrentAction = (state) => {
  const sequence = getSequence(state.format);
  return state.currentStep < sequence.length ? sequence[state.currentStep] : null;
};

const handleSequenceComplete = ({ state, maps, step, log }) => {
  const format = normalizeFormat(state.format, "BO3");

  if (format === "BO1") {
    const remaining = maps.find((item) => item.status === "available");

    if (remaining) {
      remaining.status = "picked";
      remaining.actionType = "pick";

      return {
        ...state,
        maps: [...maps],
        currentStep: step,
        phase: "side_select",
        sideSelectMapId: remaining.mapId,
        sideSelectTeam: "team2",
        selectedMapId: null,
        actionLog: log,
      };
    }
  }

  const remaining = maps.find((item) => item.status === "available");
  if (remaining) {
    remaining.status = "decider";
    remaining.actionType = "pick";
  }

  return {
    ...state,
    maps: [...maps],
    currentStep: step,
    phase: "complete",
    selectedMapId: null,
    sideSelectMapId: null,
    sideSelectTeam: null,
    actionLog: log,
  };
};

export const applySelectMap = (state, mapId) => {
  const map = state.maps.find((item) => item.mapId === mapId);

  if (!map || map.status !== "available" || state.phase !== "ban_pick") {
    return state;
  }

  return {
    ...state,
    selectedMapId: mapId,
  };
};

export const applyConfirmAction = (state) => {
  const currentAction = findCurrentAction(state);

  if (!state.selectedMapId || !currentAction || state.phase !== "ban_pick") {
    return state;
  }

  const actionType = currentAction.type;
  const maps = state.maps.map((item) =>
    item.mapId === state.selectedMapId
      ? {
          ...item,
          status: actionType === "ban" ? "banned" : "picked",
          actionBy: currentAction.team,
          actionType,
        }
      : item,
  );

  const actionLog = [
    ...state.actionLog,
    {
      step: state.currentStep,
      mapId: state.selectedMapId,
      action: actionType,
      team: currentAction.team,
    },
  ];

  const nextStep = state.currentStep + 1;
  const sequence = getSequence(state.format);
  const isSequenceComplete = nextStep >= sequence.length;

  if (actionType === "pick") {
    return {
      ...state,
      maps,
      selectedMapId: null,
      phase: "side_select",
      sideSelectMapId: state.selectedMapId,
      sideSelectTeam: getOpponent(currentAction.team),
      currentStep: nextStep,
      actionLog,
    };
  }

  if (isSequenceComplete) {
    return handleSequenceComplete({
      state,
      maps,
      step: nextStep,
      log: actionLog,
    });
  }

  return {
    ...state,
    maps,
    currentStep: nextStep,
    selectedMapId: null,
    actionLog,
  };
};

export const applySelectSide = (state, side) => {
  if (
    state.phase !== "side_select" ||
    !state.sideSelectMapId ||
    !state.sideSelectTeam
  ) {
    return state;
  }

  const chooser = state.sideSelectTeam;
  const other = getOpponent(chooser);
  const chooserSide = side;
  const otherSide = side === "ATK" ? "DEF" : "ATK";

  const sideMap =
    chooser === "team1"
      ? { team1: chooserSide, team2: otherSide }
      : { team1: otherSide, team2: chooserSide };

  const maps = state.maps.map((item) =>
    item.mapId === state.sideSelectMapId
      ? { ...item, side: sideMap, sideChosenBy: chooser }
      : item,
  );

  const sequence = getSequence(state.format);
  const isSequenceComplete = state.currentStep >= sequence.length;

  if (isSequenceComplete) {
    return handleSequenceComplete({
      state,
      maps,
      step: state.currentStep,
      log: state.actionLog,
    });
  }

  return {
    ...state,
    maps,
    phase: "ban_pick",
    sideSelectMapId: null,
    sideSelectTeam: null,
  };
};

const normalizeStoredState = ({ sessionRow, mapPool }) => {
  const format = normalizeFormat(sessionRow.format, "BO3");
  const teamNames = toTeamNames(sessionRow);
  const parsed = parseState(sessionRow.state);

  if (!parsed || !Array.isArray(parsed.maps)) {
    return createInitialState({ mapPool, format, teamNames });
  }

  return {
    ...parsed,
    format,
    teamNames,
    maps: parsed.maps.map((item) => ({
      ...item,
      mapId: String(item.mapId ?? item.map_code ?? ""),
    })),
    currentStep: toNumber(parsed.currentStep) ?? 0,
    selectedMapId: parsed.selectedMapId ?? null,
    sideSelectMapId: parsed.sideSelectMapId ?? null,
    sideSelectTeam:
      parsed.sideSelectTeam === "team1" || parsed.sideSelectTeam === "team2"
        ? parsed.sideSelectTeam
        : null,
    actionLog: Array.isArray(parsed.actionLog) ? parsed.actionLog : [],
    phase:
      parsed.phase === "side_select" || parsed.phase === "complete"
        ? parsed.phase
        : "ban_pick",
  };
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
      ["valorant", map.map_code, map.map_name, map.image_url, map.display_order],
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
           ta.name AS team_a_name,
           tb.name AS team_b_name
    FROM ban_picks bp
    LEFT JOIN matches m ON m.id = bp.match_id
    LEFT JOIN teams ta ON ta.id = bp.team_a_id
    LEFT JOIN teams tb ON tb.id = bp.team_b_id
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
           ta.name AS team_a_name,
           tb.name AS team_b_name
    FROM ban_picks bp
    LEFT JOIN matches m ON m.id = bp.match_id
    LEFT JOIN teams ta ON ta.id = bp.team_a_id
    LEFT JOIN teams tb ON tb.id = bp.team_b_id
    WHERE bp.match_id = $1
    LIMIT 1
    `,
    [matchId],
  );

  return rows[0] ?? null;
};

export const getBanPickSessionByRoundSlug = async (roundSlug) => {
  const row = await getBanPickRowBySlug(roundSlug);
  if (!row) return null;

  const mapPool = await getMapPool("valorant");
  const state = normalizeStoredState({ sessionRow: row, mapPool });

  return {
    ...row,
    state,
    map_pool: mapPool,
  };
};

export const createBanPickSession = async ({ matchId, roundSlug, format }) => {
  const match = await getMatchContext(matchId);
  if (!match) return null;

  const existingByMatch = await getBanPickRowByMatchId(matchId);
  if (existingByMatch) {
    if (roundSlug && existingByMatch.round_slug !== roundSlug) {
      await pool.query(
        `
        UPDATE ban_picks
        SET round_slug = $1,
            updated_at = NOW()
        WHERE id = $2
        `,
        [roundSlug, existingByMatch.id],
      );
    }

    return getBanPickSessionByRoundSlug(roundSlug ?? existingByMatch.round_slug);
  }

  const normalizedFormat = normalizeFormat(format ?? match.best_of ?? 3, "BO3");
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

  const { rows } = await pool.query(
    `
    INSERT INTO ban_picks (
      round_slug,
      match_id,
      tournament_id,
      team_a_id,
      team_b_id,
      format,
      phase,
      current_step,
      selected_map_code,
      side_select_map_code,
      side_select_team,
      status,
      state
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NULL, 'active', $9::jsonb)
    RETURNING id, round_slug
    `,
    [
      computedRoundSlug,
      match.id,
      match.tournament_id ?? null,
      match.team_a_id ?? null,
      match.team_b_id ?? null,
      normalizedFormat,
      sessionState.phase,
      sessionState.currentStep,
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

export const ensureSessionByRoundSlug = async ({
  roundSlug,
  matchId,
  format,
}) => {
  const existing = await getBanPickSessionByRoundSlug(roundSlug);
  if (existing) return existing;

  const matchIdAsNumber = toNumber(matchId);
  if (!matchIdAsNumber) return null;

  return createBanPickSession({
    matchId: matchIdAsNumber,
    roundSlug,
    format,
  });
};

export const resolveUserTeamSlot = (user, session) => {
  const userTeamId = toNumber(user?.team_id);
  if (!userTeamId) return null;

  const teamAId = toNumber(session.team_a_id);
  const teamBId = toNumber(session.team_b_id);

  if (teamAId && userTeamId === teamAId) return "team1";
  if (teamBId && userTeamId === teamBId) return "team2";
  return null;
};

export const getCurrentAction = (state) => {
  const sequence = getSequence(state.format);
  return state.currentStep < sequence.length ? sequence[state.currentStep] : null;
};

export const toBanPickPayload = (session, userTeamSlot = null) => {
  const state = session.state;
  const currentAction = getCurrentAction(state);

  return {
    id: toNumber(session.id),
    round_slug: String(session.round_slug),
    match_id: toNumber(session.match_id),
    tournament_id: toNumber(session.tournament_id),
    round_number: toNumber(session.round_number),
    match_no: toNumber(session.match_no),
    status: String(session.status ?? "active"),
    phase: state.phase,
    format: state.format,
    current_step: state.currentStep,
    selected_map_id: state.selectedMapId,
    side_select_map_id: state.sideSelectMapId,
    side_select_team: state.sideSelectTeam,
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
  };
};

const persistSessionState = async ({
  session,
  nextState,
  actionRecord,
  actedByUserId,
}) => {
  await pool.query(
    `
    UPDATE ban_picks
    SET format = $1,
        phase = $2,
        current_step = $3,
        selected_map_code = $4,
        side_select_map_code = $5,
        side_select_team = $6,
        state = $7::jsonb,
        updated_at = NOW()
    WHERE id = $8
    `,
    [
      normalizeFormat(nextState.format, "BO3"),
      nextState.phase,
      toNumber(nextState.currentStep) ?? 0,
      nextState.selectedMapId ?? null,
      nextState.sideSelectMapId ?? null,
      nextState.sideSelectTeam ?? null,
      JSON.stringify(nextState),
      session.id,
    ],
  );

  if (actionRecord) {
    await pool.query(
      `
      INSERT INTO ban_pick_actions (
        ban_pick_id,
        step,
        map_code,
        action_type,
        team_slot,
        side,
        acted_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        session.id,
        toNumber(actionRecord.step) ?? 0,
        actionRecord.mapId ?? null,
        actionRecord.action,
        actionRecord.team ?? null,
        actionRecord.side ?? null,
        actedByUserId ?? null,
      ],
    );
  }
};

export const mutateBanPickSession = async ({
  roundSlug,
  user,
  command,
  mapId,
  side,
}) => {
  const session = await getBanPickSessionByRoundSlug(roundSlug);
  if (!session) {
    return { ok: false, status: 404, error: "Không tìm thấy phiên ban/pick" };
  }

  const actorTeamSlot = resolveUserTeamSlot(user, session);
  if (!actorTeamSlot) {
    return {
      ok: false,
      status: 403,
      error: "Chỉ thành viên của 2 team trong trận mới được thao tác ban/pick",
    };
  }

  let nextState = session.state;

  if (command === "select_map") {
    const currentAction = getCurrentAction(nextState);
    if (nextState.phase !== "ban_pick" || !currentAction) {
      return { ok: false, status: 400, error: "Không thể chọn map ở phase hiện tại" };
    }

    if (currentAction.team !== actorTeamSlot) {
      return { ok: false, status: 403, error: "Chưa tới lượt team của bạn" };
    }

    nextState = applySelectMap(nextState, String(mapId ?? ""));

    if (nextState === session.state) {
      return { ok: false, status: 400, error: "Map không hợp lệ hoặc đã được chọn" };
    }

    await persistSessionState({
      session,
      nextState,
      actionRecord: null,
      actedByUserId: toNumber(user?.id),
    });
  }

  if (command === "confirm_action") {
    const currentAction = getCurrentAction(nextState);
    if (nextState.phase !== "ban_pick" || !currentAction) {
      return {
        ok: false,
        status: 400,
        error: "Không thể xác nhận ban/pick ở phase hiện tại",
      };
    }

    if (currentAction.team !== actorTeamSlot) {
      return { ok: false, status: 403, error: "Chưa tới lượt team của bạn" };
    }

    if (!nextState.selectedMapId) {
      return { ok: false, status: 400, error: "Bạn chưa chọn map" };
    }

    const actionRecord = {
      step: nextState.currentStep,
      mapId: nextState.selectedMapId,
      action: currentAction.type,
      team: currentAction.team,
    };

    const updatedState = applyConfirmAction(nextState);
    nextState = updatedState;

    await persistSessionState({
      session,
      nextState,
      actionRecord,
      actedByUserId: toNumber(user?.id),
    });
  }

  if (command === "select_side") {
    if (nextState.phase !== "side_select" || !nextState.sideSelectTeam) {
      return { ok: false, status: 400, error: "Không thể chọn side ở phase hiện tại" };
    }

    if (nextState.sideSelectTeam !== actorTeamSlot) {
      return { ok: false, status: 403, error: "Chưa tới lượt team của bạn" };
    }

    const normalizedSide = String(side ?? "").toUpperCase();
    if (normalizedSide !== "ATK" && normalizedSide !== "DEF") {
      return { ok: false, status: 400, error: "Side không hợp lệ" };
    }

    const actionRecord = {
      step: nextState.currentStep,
      mapId: nextState.sideSelectMapId,
      action: "side_select",
      team: nextState.sideSelectTeam,
      side: normalizedSide,
    };

    nextState = applySelectSide(nextState, normalizedSide);

    await persistSessionState({
      session,
      nextState,
      actionRecord,
      actedByUserId: toNumber(user?.id),
    });
  }

  if (command === "reset") {
    const mapPool = session.map_pool;
    const resetState = createInitialState({
      mapPool,
      format: normalizeFormat(session.format, "BO3"),
      teamNames: toTeamNames(session),
    });

    await persistSessionState({
      session,
      nextState: resetState,
      actionRecord: {
        step: 0,
        mapId: null,
        action: "reset",
        team: actorTeamSlot,
      },
      actedByUserId: toNumber(user?.id),
    });
  }

  const refreshed = await getBanPickSessionByRoundSlug(roundSlug);

  return {
    ok: true,
    status: 200,
    session: refreshed,
  };
};
