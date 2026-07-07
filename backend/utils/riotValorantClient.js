const RIOT_REGIONS = ["asia", "ap", "na", "eu", "kr", "latam"];

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

const transformRiotValorantMatch = (payload) => ({
  source: "riot",
  matchData: {
    matchInfo: {
      mapName: payload?.matchInfo?.mapId ?? undefined,
      gameStartMillis: payload?.matchInfo?.gameStartMillis ?? undefined,
    },
    players: (payload?.players ?? []).map((player) => ({
      gameName: player.gameName,
      tagLine: player.tagLine,
      teamId: player.teamId,
      characterName: player.characterId,
      stats: {
        kills: player.stats?.kills ?? 0,
        deaths: player.stats?.deaths ?? 0,
        assists: player.stats?.assists ?? 0,
        acs: player.stats?.score ?? 0,
        adr: 0,
        headshotPercentage: 0,
        firstKills: 0,
        firstDeaths: 0,
      },
    })),
    teams: (payload?.teams ?? []).map((team) => ({
      teamId: team.teamId,
      roundsWon: team.roundsWon,
      numPoints: team.numPoints,
    })),
    roundResults: payload?.roundResults ?? [],
  },
});

export const fetchValorantMatchFromRiot = async (matchId) => {
  const apiKey = readRiotApiKey();
  if (!apiKey) {
    throw new Error("RIOT Valorant API key is not configured on the server.");
  }

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

      return transformRiotValorantMatch(JSON.parse(text));
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
