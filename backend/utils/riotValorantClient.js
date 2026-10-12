// Shard VAL-MATCH-V1 (không có "asia"); "ap" đầu tiên cho máy chủ Việt Nam
const RIOT_REGIONS = ["ap", "kr", "eu", "na", "latam", "br"];

const readRiotApiKey = () =>
  String(
    process.env.API_KEY_VALORANT_RIOT ??
      process.env.RIOT_API_KEY ??
      process.env.TFT_KEY ??
      "",
  ).trim();

const getPreferredRegions = () => {
  const configured = String(process.env.RIOT_VALORANT_REGION ?? "")
    .trim()
    .toLowerCase();

  if (configured) {
    return [configured, ...RIOT_REGIONS.filter((region) => region !== configured)];
  }

  return RIOT_REGIONS;
};

/**
 * Riot không trả sẵn ADR / HS% / hạ gục đầu — tính từ roundResults[].playerStats:
 * damage[] (sát thương + số phát đầu/thân/chân) và kills[] (mốc thời gian trong vòng).
 */
const computeRoundStats = (payload) => {
  const totals = new Map();
  const get = (puuid) => {
    if (!totals.has(puuid)) {
      totals.set(puuid, {
        damage: 0,
        head: 0,
        body: 0,
        leg: 0,
        firstKills: 0,
        firstDeaths: 0,
      });
    }
    return totals.get(puuid);
  };

  for (const round of payload?.roundResults ?? []) {
    let firstKill = null;

    for (const playerStat of round?.playerStats ?? []) {
      const total = get(playerStat.puuid);
      for (const hit of playerStat?.damage ?? []) {
        total.damage += Number(hit?.damage ?? 0);
        total.head += Number(hit?.headshots ?? 0);
        total.body += Number(hit?.bodyshots ?? 0);
        total.leg += Number(hit?.legshots ?? 0);
      }
      for (const kill of playerStat?.kills ?? []) {
        const time = Number(
          kill?.timeSinceRoundStartMillis ?? kill?.timeSinceGameStartMillis ?? 0,
        );
        if (!firstKill || time < firstKill.time) {
          firstKill = { time, killer: kill?.killer, victim: kill?.victim };
        }
      }
    }

    if (firstKill?.killer) get(firstKill.killer).firstKills += 1;
    if (firstKill?.victim) get(firstKill.victim).firstDeaths += 1;
  }

  return totals;
};

/**
 * Từ điển tên + ảnh đặc vụ / bản đồ (valorant-api.com, công khai, không cần key).
 * Riot chỉ trả mã: characterId = UUID, mapId = "/Game/Maps/Bonsai/Bonsai".
 * Cache trong bộ nhớ 24 giờ; lỗi thì trả từ điển rỗng (vẫn trả dữ liệu trận).
 */
const ASSET_TTL_MS = 24 * 60 * 60 * 1000;
let assetCache = null;

const loadValorantAssets = async () => {
  if (assetCache && Date.now() - assetCache.at < ASSET_TTL_MS) {
    return assetCache;
  }

  try {
    const [agentsRes, mapsRes] = await Promise.all([
      fetch("https://valorant-api.com/v1/agents?isPlayableCharacter=true"),
      fetch("https://valorant-api.com/v1/maps"),
    ]);
    const agents = new Map();
    const maps = new Map();

    for (const agent of (await agentsRes.json())?.data ?? []) {
      agents.set(String(agent.uuid).toLowerCase(), {
        name: agent.displayName,
        icon: agent.displayIcon ?? null,
      });
    }
    for (const map of (await mapsRes.json())?.data ?? []) {
      if (map.mapUrl) maps.set(String(map.mapUrl).toLowerCase(), map.displayName);
    }

    assetCache = { at: Date.now(), agents, maps };
  } catch {
    // Không chặn dữ liệu trận vì thiếu từ điển; thử lại ở lần gọi sau
    return { agents: new Map(), maps: new Map() };
  }

  return assetCache;
};

/**
 * Chỉ giữ thông tin giao diện cần của mỗi vòng.
 * playerStats (kills/damage/economy/ability của 10 người × mỗi vòng) chiếm ~99% dung lượng
 * phản hồi Riot — đã dùng để tính ADR/HS%/hạ gục đầu ở trên nên không gửi xuống client.
 */
const slimRoundResult = (round) => ({
  roundNum: round?.roundNum,
  winningTeam: round?.winningTeam,
  winningTeamRole: round?.winningTeamRole,
  roundResult: round?.roundResult,
  roundResultCode: round?.roundResultCode,
  roundCeremony: round?.roundCeremony,
});

const transformRiotValorantMatch = (payload, assets) => {
  const roundCount = (payload?.roundResults ?? []).length;
  const roundTotals = computeRoundStats(payload);
  const mapId = payload?.matchInfo?.mapId ?? undefined;

  return {
    source: "riot",
    matchData: {
      matchInfo: {
        mapId,
        mapName: assets.maps.get(String(mapId ?? "").toLowerCase()) ?? mapId,
        gameStartMillis: payload?.matchInfo?.gameStartMillis ?? undefined,
        gameLengthMillis: payload?.matchInfo?.gameLengthMillis ?? undefined,
      },
      players: (payload?.players ?? []).map((player) => {
        const rounds = Number(player.stats?.roundsPlayed ?? 0) || roundCount || 1;
        const total = roundTotals.get(player.puuid);
        const shots = total ? total.head + total.body + total.leg : 0;
        const agent = assets.agents.get(String(player.characterId ?? "").toLowerCase());

        return {
          puuid: player.puuid,
          gameName: player.gameName,
          tagLine: player.tagLine,
          teamId: player.teamId,
          characterId: player.characterId,
          characterName: agent?.name ?? player.characterId,
          imgCharacter: agent?.icon ?? undefined,
          stats: {
            kills: player.stats?.kills ?? 0,
            deaths: player.stats?.deaths ?? 0,
            assists: player.stats?.assists ?? 0,
            // Riot "score" là tổng điểm chiến đấu cả trận → ACS = score / số vòng
            acs: Math.round(Number(player.stats?.score ?? 0) / rounds),
            adr: total ? Math.round(total.damage / rounds) : 0,
            headshotPercentage: shots ? Math.round((total.head * 100) / shots) : 0,
            firstKills: total?.firstKills ?? 0,
            firstDeaths: total?.firstDeaths ?? 0,
          },
        };
      }),
      teams: (payload?.teams ?? []).map((team) => ({
        teamId: team.teamId,
        roundsWon: team.roundsWon,
        numPoints: team.numPoints,
      })),
      roundResults: (payload?.roundResults ?? []).map(slimRoundResult),
    },
  };
};

/** Trận đã đấu xong không đổi → giữ kết quả đã chuyển đổi, đỡ gọi Riot (rate limit). */
const MATCH_CACHE_LIMIT = 200;
const matchCache = new Map();

export const fetchValorantMatchFromRiot = async (matchId) => {
  const cached = matchCache.get(matchId);
  if (cached) return cached;

  const apiKey = readRiotApiKey();
  if (!apiKey) {
    throw new Error("RIOT Valorant API key is not configured on the server.");
  }

  const assets = await loadValorantAssets();
  const errors = [];

  for (const region of getPreferredRegions()) {
    const url = `https://${region}.api.riotgames.com/val/match/v1/matches/${encodeURIComponent(matchId)}`;

    try {
      const response = await fetch(url, {
        headers: {
          "X-Riot-Token": apiKey,
          Accept: "application/json",
        },
      });

      const text = await response.text();

      if (!response.ok) {
        errors.push(`${region}: ${response.status}`);
        continue;
      }

      if (text.trimStart().startsWith("<!")) {
        errors.push(`${region}: HTML response`);
        continue;
      }

      const result = transformRiotValorantMatch(JSON.parse(text), assets);
      // Chỉ cache khi từ điển đã có, để lần sau còn bổ sung tên/ảnh
      if (assets.agents.size) {
        if (matchCache.size >= MATCH_CACHE_LIMIT) {
          matchCache.delete(matchCache.keys().next().value);
        }
        matchCache.set(matchId, result);
      }
      return result;
    } catch (error) {
      errors.push(
        `${region}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(
    errors.length
      ? `Riot API could not load match (${errors.join(", ")})`
      : "Riot API could not load match",
  );
};
