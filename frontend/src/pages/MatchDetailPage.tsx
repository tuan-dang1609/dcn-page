import { useParams, Link, useOutletContext } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calendar } from "lucide-react";
import type { MatchDetail } from "@/types/matchDetail";
import {
  getValorantMatchData,
  type ValorantApiMatchData,
  type ValorantApiPlayer,
} from "@/api/valorant";
import {
  getTftMatchData,
  type TftApiParticipant,
  type TftApiResponse,
} from "@/api/tft";
import {
  getMatchGameIds,
  getMatchesByTournamentSlug,
  type Match,
  type MatchGameIdRecord,
  type TournamentBySlugResponse,
} from "@/api/tournaments";

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const formatNavDate = (value?: string | null) => {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--";

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
};

/* ── Map images for background ── */
const mapImages: Record<string, string> = {
  INFERNO:
    "https://images.unsplash.com/photo-1604076913837-52ab5f0e2f2e?w=800&h=200&fit=crop",
  ANUBIS:
    "https://images.unsplash.com/photo-1539650116574-8efeb43e2750?w=800&h=200&fit=crop",
  MIRAGE:
    "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&h=200&fit=crop",
  HAVEN:
    "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&h=200&fit=crop",
  BIND: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=200&fit=crop",
  "GAME 1":
    "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&h=200&fit=crop",
  "GAME 2":
    "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&h=200&fit=crop",
  "GAME 3":
    "https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800&h=200&fit=crop",
};

const isUuid = (value?: string) =>
  Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );

const normalizeGameSlug = (value?: string) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (["valo", "val", "valorant"].includes(normalized)) return "val";
  if (["lol", "leagueoflegends", "league_of_legends"].includes(normalized))
    return "lol";
  if (["tft", "teamfighttactics", "teamfight_tactics"].includes(normalized))
    return "tft";

  return normalized;
};

const resolveGameType = (value?: string): MatchDetail["gameType"] => {
  const normalized = normalizeGameSlug(value);

  if (normalized === "val") return "valorant";
  if (normalized === "lol") return "lol";
  if (normalized === "tft") return "tft";
  if (normalized === "wildrift") return "wildrift";

  return "cs2";
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildTeamTag = (name?: string | null, shortName?: string | null) => {
  const normalizedShort = String(shortName ?? "")
    .trim()
    .toUpperCase();
  if (normalizedShort) return normalizedShort;

  const compact = String(name ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  return compact.slice(0, 3) || "TBD";
};

const buildPlaceholderLogo = (teamTag: string) =>
  `https://placehold.co/80x80/1f2937/ffffff?text=${encodeURIComponent(teamTag)}`;

const buildMatchDetailFromApi = ({
  match,
  tournament,
  normalizedRouteGame,
}: {
  match: Match;
  tournament?: TournamentBySlugResponse["info"];
  normalizedRouteGame: string;
}): MatchDetail => {
  const team1Name = match.team_a?.name || "TBD";
  const team2Name = match.team_b?.name || "TBD";
  const team1Tag = buildTeamTag(match.team_a?.name, match.team_a?.short_name);
  const team2Tag = buildTeamTag(match.team_b?.name, match.team_b?.short_name);
  const team1Logo = match.team_a?.logo_url || buildPlaceholderLogo(team1Tag);
  const team2Logo = match.team_b?.logo_url || buildPlaceholderLogo(team2Tag);

  const team1Score = toNumber(match.score_a) ?? 0;
  const team2Score = toNumber(match.score_b) ?? 0;
  const roundNumber = toNumber(match.round_number);
  const matchNo = toNumber(match.match_no);
  const gameType = resolveGameType(normalizedRouteGame);
  const scheduledDate = String(match.date_scheduled ?? "").trim();

  return {
    id: String(match.id),
    tournamentName: String(tournament?.name ?? "Tournament"),
    roundName:
      roundNumber && matchNo
        ? `Round ${roundNumber} - Match ${matchNo}`
        : roundNumber
          ? `Round ${roundNumber}`
          : `Match ${match.id}`,
    format: String(tournament?.format ?? ""),
    date:
      scheduledDate ||
      String(tournament?.date_start ?? "").slice(0, 10) ||
      new Date().toISOString().slice(0, 10),
    gameType,
    team1: {
      name: team1Name,
      tag: team1Tag,
      logo: team1Logo,
      score: team1Score,
    },
    team2: {
      name: team2Name,
      tag: team2Tag,
      logo: team2Logo,
      score: team2Score,
    },
    maps: undefined,
    team1Roster: {
      teamName: team1Name,
      teamLogo: team1Logo,
      teamTag: team1Tag,
      players: [],
    },
    team2Roster: {
      teamName: team2Name,
      teamLogo: team2Logo,
      teamTag: team2Tag,
      players: [],
    },
    statTabs: gameType === "valorant" ? ["All Maps"] : ["All Games"],
  };
};

const extractTftParticipants = (
  payload: TftApiResponse,
): TftApiParticipant[] => {
  const fromInfo = payload?.info?.participants;
  if (Array.isArray(fromInfo) && fromInfo.length > 0) return fromInfo;

  const fromNestedInfo = payload?.data?.info?.participants;
  if (Array.isArray(fromNestedInfo) && fromNestedInfo.length > 0)
    return fromNestedInfo;

  return [];
};

const mergeTftApiIntoMatch = (
  baseMatch: MatchDetail,
  tftPayload: TftApiResponse,
): MatchDetail => {
  const participants = extractTftParticipants(tftPayload)
    .map((participant, index) => {
      const gameName = String(participant.riotIdGameName ?? "").trim();
      const tagLine = String(participant.riotIdTagline ?? "").trim();
      const name =
        gameName && tagLine
          ? `${gameName}#${tagLine}`
          : gameName || `Player ${index + 1}`;

      return {
        name,
        icon: `https://placehold.co/24x24/111827/ffffff?text=${index + 1}`,
        placement: toNumber(participant.placement) ?? 8,
      };
    })
    .sort((a, b) => (a.placement ?? 8) - (b.placement ?? 8));

  if (participants.length === 0) {
    return baseMatch;
  }

  const splitIndex = Math.ceil(participants.length / 2);

  return {
    ...baseMatch,
    gameType: "tft",
    team1Roster: {
      ...baseMatch.team1Roster,
      players: participants.slice(0, splitIndex),
    },
    team2Roster: {
      ...baseMatch.team2Roster,
      players: participants.slice(splitIndex),
    },
    statTabs: ["All Games"],
  };
};

const getProviderMatchIds = (
  gameIds: MatchGameIdRecord[],
  provider: "val" | "lol" | "tft",
) => {
  const ids = gameIds
    .filter((item) => {
      const providerKey = normalizeGameSlug(
        item.external_provider ??
          item.resolved_provider ??
          item.game_short_name,
      );
      return providerKey === provider;
    })
    .map((item) => String(item.info_game_id ?? "").trim())
    .filter((value) => Boolean(value));

  return Array.from(new Set(ids));
};

const getTeamRoundScore = (
  apiData: ValorantApiMatchData,
  teamId: "Red" | "Blue",
  fallback: number,
) =>
  apiData.teams?.find((team) => team.teamId === teamId)?.roundsWon ??
  apiData.teams?.find((team) => team.teamId === teamId)?.numPoints ??
  fallback;

const buildValorantRosterFromApi = (
  baseRoster: MatchDetail["team1Roster"],
  players: ValorantApiPlayer[],
): MatchDetail["team1Roster"] => ({
  ...baseRoster,
  players: Array.from(
    players
      .reduce(
        (acc, player) => {
          const key = `${player.gameName}#${player.tagLine}`.toLowerCase();
          const stats = player.stats ?? {};
          const current = acc.get(key) ?? {
            name: player.gameName,
            icon: player.imgCharacter,
            avatar: player.imgCharacter,
            role: player.characterName,
            kills: 0,
            deaths: 0,
            assists: 0,
            firstKills: 0,
            firstDeaths: 0,
            acsTotal: 0,
            acsCount: 0,
            adrTotal: 0,
            adrCount: 0,
            hsTotal: 0,
            hsCount: 0,
          };

          current.kills += stats.kills ?? 0;
          current.deaths += stats.deaths ?? 0;
          current.assists += stats.assists ?? 0;
          current.firstKills += stats.firstKills ?? 0;
          current.firstDeaths += stats.firstDeaths ?? 0;

          if (typeof stats.acs === "number") {
            current.acsTotal += stats.acs;
            current.acsCount += 1;
          }
          if (typeof stats.adr === "number") {
            current.adrTotal += stats.adr;
            current.adrCount += 1;
          }
          if (typeof stats.headshotPercentage === "number") {
            current.hsTotal += stats.headshotPercentage;
            current.hsCount += 1;
          }

          if (player.imgCharacter) {
            current.icon = player.imgCharacter;
            current.avatar = player.imgCharacter;
          }
          if (player.characterName) {
            current.role = player.characterName;
          }

          acc.set(key, current);
          return acc;
        },
        new Map<
          string,
          {
            name: string;
            icon?: string;
            avatar?: string;
            role?: string;
            kills: number;
            deaths: number;
            assists: number;
            firstKills: number;
            firstDeaths: number;
            acsTotal: number;
            acsCount: number;
            adrTotal: number;
            adrCount: number;
            hsTotal: number;
            hsCount: number;
          }
        >(),
      )
      .values(),
  )
    .map((player) => ({
      name: player.name,
      icon: player.icon,
      avatar: player.avatar,
      role: player.role,
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      plusMinus: player.kills - player.deaths,
      adr:
        player.adrCount > 0 ? Math.round(player.adrTotal / player.adrCount) : 0,
      hsPercent:
        player.hsCount > 0
          ? `${Math.round(player.hsTotal / player.hsCount)}%`
          : "0%",
      acs:
        player.acsCount > 0 ? Math.round(player.acsTotal / player.acsCount) : 0,
      firstKills: player.firstKills,
      firstDeaths: player.firstDeaths,
    }))
    .sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0)),
});

const mergeValorantApiIntoMatch = (
  baseMatch: MatchDetail,
  apiMatches: ValorantApiMatchData[],
): MatchDetail => {
  if (apiMatches.length === 0) {
    return baseMatch;
  }

  const sortedMatches = [...apiMatches].sort(
    (a, b) =>
      (a.matchInfo?.gameStartMillis ?? Number.MAX_SAFE_INTEGER) -
      (b.matchInfo?.gameStartMillis ?? Number.MAX_SAFE_INTEGER),
  );

  const maps = sortedMatches.map((apiData, index) => {
    const redTeamScore = getTeamRoundScore(apiData, "Red", 0);
    const blueTeamScore = getTeamRoundScore(apiData, "Blue", 0);

    return {
      mapName: apiData.matchInfo?.mapName?.toUpperCase() ?? `GAME ${index + 1}`,
      team1Score: redTeamScore,
      team2Score: blueTeamScore,
    };
  });

  const mapLabelCounts = new Map<string, number>();
  const mapLabels = maps.map((map, index) => {
    const baseLabel = map.mapName || `GAME ${index + 1}`;
    const count = (mapLabelCounts.get(baseLabel) ?? 0) + 1;
    mapLabelCounts.set(baseLabel, count);

    return count === 1 ? baseLabel : `${baseLabel} ${count}`;
  });

  const fpsMapRosters = sortedMatches.map((apiData, index) => {
    const mapPlayers = apiData.players ?? [];
    const mapRedPlayers = mapPlayers.filter(
      (player) => player.teamId === "Red",
    );
    const mapBluePlayers = mapPlayers.filter(
      (player) => player.teamId === "Blue",
    );

    return {
      label: mapLabels[index],
      team1Roster:
        mapRedPlayers.length > 0
          ? buildValorantRosterFromApi(baseMatch.team1Roster, mapRedPlayers)
          : baseMatch.team1Roster,
      team2Roster:
        mapBluePlayers.length > 0
          ? buildValorantRosterFromApi(baseMatch.team2Roster, mapBluePlayers)
          : baseMatch.team2Roster,
    };
  });

  const allPlayers = sortedMatches.flatMap((apiData) => apiData.players ?? []);
  const redPlayers = allPlayers.filter((player) => player.teamId === "Red");
  const bluePlayers = allPlayers.filter((player) => player.teamId === "Blue");

  const redSeriesWins = maps.reduce(
    (wins, map) => wins + (map.team1Score > map.team2Score ? 1 : 0),
    0,
  );
  const blueSeriesWins = maps.reduce(
    (wins, map) => wins + (map.team2Score > map.team1Score ? 1 : 0),
    0,
  );

  const dateFromApi = sortedMatches[0]?.matchInfo?.gameStartMillis
    ? new Date(sortedMatches[0].matchInfo.gameStartMillis)
        .toISOString()
        .slice(0, 10)
    : baseMatch.date;

  return {
    ...baseMatch,
    date: dateFromApi,
    team1: {
      ...baseMatch.team1,
      score: redSeriesWins,
    },
    team2: {
      ...baseMatch.team2,
      score: blueSeriesWins,
    },
    maps,
    statTabs: ["All Maps", ...mapLabels],
    fpsMapRosters,
    team1Roster:
      redPlayers.length > 0
        ? buildValorantRosterFromApi(baseMatch.team1Roster, redPlayers)
        : baseMatch.team1Roster,
    team2Roster:
      bluePlayers.length > 0
        ? buildValorantRosterFromApi(baseMatch.team2Roster, bluePlayers)
        : baseMatch.team2Roster,
  };
};

/* ── Map Score Row (blast.tv style with bg image) ── */
const MapScoreRow = ({
  map,
  team1Logo,
  team2Logo,
}: {
  map: { mapName: string; team1Score: number; team2Score: number };
  team1Logo: string;
  team2Logo: string;
}) => {
  const t1Win = map.team1Score > map.team2Score;
  const bgImg = mapImages[map.mapName];

  return (
    <div className="relative rounded-xl overflow-hidden h-14 border border-border/60 bg-card/70">
      <div className="absolute inset-0">
        <img src={bgImg} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-background/80 backdrop-blur-[1px]" />
      </div>

      <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center w-full px-4 h-full">
        <div className="flex items-center gap-3">
          <img src={team1Logo} alt="" className="w-5 h-5 rounded" />
          <span
            className={`text-lg font-black tabular-nums ${t1Win ? "text-primary" : "text-muted-foreground"}`}
          >
            {map.team1Score}
          </span>
        </div>

        <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-foreground px-3 py-1  min-w-[132px] text-center">
          {map.mapName}
        </span>

        <div className="flex items-center gap-3 justify-end">
          <span
            className={`text-lg font-black tabular-nums ${!t1Win ? "text-primary" : "text-muted-foreground"}`}
          >
            {map.team2Score}
          </span>
          <img src={team2Logo} alt="" className="w-5 h-5 rounded" />
        </div>
      </div>
    </div>
  );
};

/* ── FPS Stat Table ── */
const FPSStatTable = ({ match }: { match: MatchDetail }) => {
  const [activeTab, setActiveTab] = useState(0);
  const mapRosterTabs = match.fpsMapRosters ?? [];
  const tabs =
    mapRosterTabs.length > 0
      ? ["All Maps", ...mapRosterTabs.map((tab) => tab.label)]
      : (match.statTabs ?? ["All Maps"]);
  const currentTab = activeTab < tabs.length ? activeTab : 0;
  const activeRosters =
    currentTab === 0 || mapRosterTabs.length === 0
      ? [match.team1Roster, match.team2Roster]
      : [
          mapRosterTabs[currentTab - 1]?.team1Roster ?? match.team1Roster,
          mapRosterTabs[currentTab - 1]?.team2Roster ?? match.team2Roster,
        ];

  return (
    <div className="space-y-5">
      <div className="flex items-center  flex-wrap gap-4">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            Match Stats
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Thống kê chi tiết từng người chơi
          </p>
        </div>
        <div className="flex gap-2">
          {tabs.map((tab, i) => (
            <button
              key={`${tab}-${i}`}
              onClick={() => setActiveTab(i)}
              className={`px-5 py-2 text-xs font-semibold rounded-full border transition-all ${
                currentTab === i
                  ? "bg-foreground text-background border-foreground"
                  : "bg-transparent border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {activeRosters.map((roster) => (
          <div
            key={roster.teamTag}
            className="bg-card border border-border rounded-xl overflow-hidden"
          >
            <div className="overflow-x-auto">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse">
                  <thead>
                    <tr className="border-b border-border/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="!w-[180px] sticky left-0 z-20 bg-card px-4 py-3 text-left normal-case text-base font-bold text-foreground border-r border-border/40">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={roster.teamLogo}
                            alt={roster.teamTag}
                            className="w-5 h-5 rounded"
                          />
                          <span className="truncate text-[12px]">
                            {roster.teamName}
                          </span>
                        </div>
                      </th>
                      <th className="px-2 py-3 text-center">ACS</th>
                      <th className="px-2 py-3 text-center">K</th>
                      <th className="px-2 py-3 text-center">D</th>
                      <th className="px-2 py-3 text-center">+/-</th>
                      <th className="px-2 py-3 text-center">ADR</th>
                      <th className="px-2 py-3 text-center">HS%</th>
                      <th className="px-2 py-3 text-center">FK</th>
                      <th className="px-2 py-3 text-center">FD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.players.map((p) => (
                      <tr
                        key={p.name}
                        className="border-b border-border/20 last:border-0 hover:bg-secondary/40 transition-colors"
                      >
                        <td className="sticky left-0 z-10 bg-card px-4 py-2.5 border-r border-border/20">
                          <div className="flex items-center gap-2 min-w-0">
                            {p.icon ? (
                              <img
                                src={p.icon}
                                alt={p.name}
                                className="w-6 h-6 rounded"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded bg-secondary flex items-center justify-center text-[11px] font-bold text-muted-foreground">
                                {p.name.charAt(0)}
                              </div>
                            )}
                            <span className="text-[11px] font-semibold text-foreground truncate">
                              {p.name}
                            </span>
                          </div>
                        </td>

                        <td className="px-2 py-2.5 text-[11px] text-foreground text-center tabular-nums">
                          {p.acs ?? "-"}
                        </td>
                        <td className="px-2 py-2.5 text-[11px] text-foreground text-center tabular-nums">
                          {p.kills ?? "-"}
                        </td>
                        <td className="px-2 py-2.5 text-[11px] text-foreground text-center tabular-nums">
                          {p.deaths ?? "-"}
                        </td>
                        <td
                          className={`px-2 py-2.5 text-[11px] font-bold text-center tabular-nums ${
                            (p.plusMinus ?? 0) > 0
                              ? "text-primary"
                              : (p.plusMinus ?? 0) < 0
                                ? "text-destructive"
                                : "text-muted-foreground"
                          }`}
                        >
                          {(p.plusMinus ?? 0) > 0
                            ? `+${p.plusMinus}`
                            : (p.plusMinus ?? "-")}
                        </td>
                        <td className="px-2 py-2.5 text-[11px] text-foreground text-center tabular-nums">
                          {p.adr ?? "-"}
                        </td>
                        <td className="px-2 py-2.5 text-[11px] text-foreground text-center tabular-nums">
                          {p.hsPercent ?? "-"}
                        </td>
                        <td className="px-2 py-2.5 text-[11px] text-foreground text-center tabular-nums">
                          {p.firstKills ?? "-"}
                        </td>
                        <td className="px-2 py-2.5 text-[11px] text-foreground text-center tabular-nums">
                          {p.firstDeaths ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── MOBA Stat Table ── */
const MOBAStatTable = ({ match }: { match: MatchDetail }) => {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = match.statTabs ?? ["All Games"];

  return (
    <div className="space-y-5">
      <div className="flex items-center  flex-wrap gap-4">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            Match Stats
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Thống kê chi tiết từng người chơi
          </p>
        </div>
        <div className="flex gap-2">
          {tabs.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`px-5 py-2 text-xs font-semibold rounded-full border transition-all ${
                activeTab === i
                  ? "bg-foreground text-background border-foreground"
                  : "bg-transparent border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[match.team1Roster, match.team2Roster].map((roster) => (
          <div
            key={roster.teamTag}
            className="bg-card border border-border rounded-xl overflow-hidden"
          >
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div
                  className="grid gap-0 px-4 py-3 border-b border-border/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                  style={{
                    gridTemplateColumns: "1fr 2.5rem 2.5rem 2.5rem 3.5rem 4rem",
                  }}
                >
                  <span className="sticky left-0 z-20 bg-card flex items-center gap-2 text-foreground normal-case text-base font-bold truncate pr-4 border-r border-border/40">
                    <img
                      src={roster.teamLogo}
                      alt={roster.teamTag}
                      className="w-5 h-5 rounded"
                    />
                    {roster.teamName}
                  </span>
                  <span className="text-center">K</span>
                  <span className="text-center">D</span>
                  <span className="text-center">A</span>
                  <span className="text-center">CS</span>
                  <span className="text-center">DMG</span>
                </div>
                {roster.players.map((p) => (
                  <div
                    key={p.name}
                    className="grid gap-0 px-4 py-2.5 items-center border-b border-border/20 last:border-0 hover:bg-secondary/40 transition-colors"
                    style={{
                      gridTemplateColumns:
                        "1fr 2.5rem 2.5rem 2.5rem 3.5rem 4rem",
                    }}
                  >
                    <div className="sticky left-0 z-10 bg-card flex items-center gap-2 min-w-0 pr-4 border-r border-border/20">
                      <span className="text-[11px] font-semibold text-foreground truncate">
                        {p.name}
                      </span>
                      {p.role && (
                        <span className="text-[11px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                          {p.role}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-foreground text-center tabular-nums">
                      {p.kills}
                    </span>
                    <span className="text-[11px] text-foreground text-center tabular-nums">
                      {p.deaths}
                    </span>
                    <span className="text-[11px] text-foreground text-center tabular-nums">
                      {p.assists}
                    </span>
                    <span className="text-[11px] text-foreground text-center tabular-nums">
                      {p.cs}
                    </span>
                    <span className="text-[11px] text-foreground text-center tabular-nums">
                      {((p.damage ?? 0) / 1000).toFixed(1)}k
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── TFT Stat Table ── */
const TFTStatTable = ({ match }: { match: MatchDetail }) => (
  <div className="space-y-5">
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">
        Kết quả TFT
      </h3>
      <p className="text-xs text-muted-foreground mt-0.5">
        Hạng trung bình của từng người chơi
      </p>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[match.team1Roster, match.team2Roster].map((roster) => (
        <div
          key={roster.teamTag}
          className="bg-card border border-border rounded-xl overflow-hidden"
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <img
              src={roster.teamLogo}
              alt={roster.teamTag}
              className="w-5 h-5 rounded"
            />
            <span className="text-[11px] font-bold text-foreground">
              {roster.teamName}
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[320px]">
              <div
                className="grid gap-0 px-4 py-2 border-b border-border/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                style={{ gridTemplateColumns: "1fr 4rem" }}
              >
                <span className="sticky left-0 z-20 bg-card pr-4 border-r border-border/40"></span>
                <span className="text-center">Hạng TB</span>
              </div>
              {roster.players.map((p) => (
                <div
                  key={p.name}
                  className="grid gap-0 px-4 py-2.5 items-center border-b border-border/20 last:border-0 hover:bg-secondary/40 transition-colors"
                  style={{ gridTemplateColumns: "1fr 4rem" }}
                >
                  <div className="sticky left-0 z-10 bg-card pr-4 border-r border-border/20 flex items-center gap-2">
                    <img src={p.icon} />
                    <span className="text-[11px] font-semibold text-foreground">
                      {p.name}
                    </span>
                  </div>
                  <span
                    className={`text-[11px] font-bold text-center ${
                      (p.placement ?? 8) <= 2
                        ? "text-primary"
                        : (p.placement ?? 8) <= 4
                          ? "text-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    #{p.placement}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

/* ── Roster Section ── */
const RosterSection = ({ match }: { match: MatchDetail }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    {[match.team1Roster, match.team2Roster].map((roster) => (
      <div key={roster.teamTag} className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
          {roster.teamName} Roster
        </h3>
        <div className="grid gap-2 justify-start grid-cols-5 w-full">
          {roster.players.map((p) => (
            <div
              key={p.name}
              className="min-h-[120px] flex flex-col items-center justify-start gap-2 px-2 py-3"
            >
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-base font-bold text-muted-foreground">
                {p.name.charAt(0)}
              </div>
              <div className="text-center w-full">
                <div className="flex items-center justify-center gap-1">
                  <span className="text-[11px] font-bold text-foreground truncate max-w-[72px]">
                    {p.name}
                  </span>
                </div>
                {p.role && (
                  <span className="text-[9px] text-muted-foreground truncate block">
                    {p.role}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

/* ── Main Page ── */
const MatchDetailPage = () => {
  const { tournament } = useOutletContext<{
    tournament?: TournamentBySlugResponse["info"];
  }>();
  const { id, game, slug } = useParams();
  const normalizedRouteGame = normalizeGameSlug(game);
  const backTo =
    normalizedRouteGame && slug
      ? `/tournament/${normalizedRouteGame}/${slug}/bracket`
      : "/bracket";
  const buildMatchLink = (matchId: number | string) =>
    normalizedRouteGame && slug
      ? `/tournament/${normalizedRouteGame}/${slug}/match/${matchId}`
      : `/match/${matchId}`;
  const numId = id && /^\d+$/.test(id) ? Number(id) : null;

  const { data: tournamentMatchBundle, isLoading: isMatchListLoading } =
    useQuery({
      queryKey: ["tournament-match-list", normalizedRouteGame, slug],
      enabled: Boolean(normalizedRouteGame && slug),
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
      queryFn: async () => {
        const response = await getMatchesByTournamentSlug(
          normalizedRouteGame,
          slug!,
        );
        return response;
      },
    });

  const sortedMatches = useMemo(() => {
    const source = tournamentMatchBundle?.matches ?? [];

    return [...source].sort((a, b) => {
      const roundA = toNumber(a.round_number) ?? Number.MAX_SAFE_INTEGER;
      const roundB = toNumber(b.round_number) ?? Number.MAX_SAFE_INTEGER;
      if (roundA !== roundB) return roundA - roundB;

      const noA = toNumber(a.match_no) ?? Number.MAX_SAFE_INTEGER;
      const noB = toNumber(b.match_no) ?? Number.MAX_SAFE_INTEGER;
      if (noA !== noB) return noA - noB;

      return (toNumber(a.id) ?? 0) - (toNumber(b.id) ?? 0);
    });
  }, [tournamentMatchBundle?.matches]);

  const currentMatchRow = useMemo(() => {
    if (!numId) return null;
    return sortedMatches.find((item) => toNumber(item.id) === numId) ?? null;
  }, [numId, sortedMatches]);

  const baseMatch = useMemo(() => {
    if (!currentMatchRow) return null;
    return buildMatchDetailFromApi({
      match: currentMatchRow,
      tournament,
      normalizedRouteGame,
    });
  }, [currentMatchRow, tournament, normalizedRouteGame]);

  const { data: matchGameIds } = useQuery({
    queryKey: ["match-game-ids", numId],
    enabled: Boolean(numId),
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await getMatchGameIds(numId!);
      return response.data?.data ?? [];
    },
  });

  const preferredProvider = useMemo(() => {
    const ids = matchGameIds ?? [];
    const valIds = getProviderMatchIds(ids, "val").filter((value) =>
      isUuid(value),
    );
    const tftIds = getProviderMatchIds(ids, "tft");
    const lolIds = getProviderMatchIds(ids, "lol");

    if (baseMatch?.gameType === "valorant" && valIds.length > 0) return "val";
    if (baseMatch?.gameType === "tft" && tftIds.length > 0) return "tft";
    if (baseMatch?.gameType === "lol" && lolIds.length > 0) return "lol";

    if (tftIds.length > 0) return "tft";
    if (valIds.length > 0) return "val";
    if (lolIds.length > 0) return "lol";

    if (baseMatch?.gameType === "valorant") return "val";
    if (baseMatch?.gameType === "tft") return "tft";
    if (baseMatch?.gameType === "lol" || baseMatch?.gameType === "wildrift")
      return "lol";

    return null;
  }, [baseMatch?.gameType, matchGameIds]);

  const valorantApiMatchIds = useMemo(() => {
    if (preferredProvider !== "val") {
      return undefined;
    }

    const idsFromMatchGames = getProviderMatchIds(matchGameIds ?? [], "val")
      .map((value) => String(value).trim())
      .filter((value): value is string => Boolean(value) && isUuid(value));

    if (idsFromMatchGames.length > 0) {
      return Array.from(new Set(idsFromMatchGames));
    }

    return undefined;
  }, [matchGameIds, preferredProvider]);

  const tftApiMatchIds = useMemo(() => {
    if (preferredProvider !== "tft") {
      return undefined;
    }

    const idsFromMatchGames = getProviderMatchIds(matchGameIds ?? [], "tft");
    if (idsFromMatchGames.length > 0) {
      return idsFromMatchGames;
    }

    return undefined;
  }, [matchGameIds, preferredProvider]);

  const { data: valorantApiData } = useQuery({
    queryKey: ["valorant-match-detail", valorantApiMatchIds],
    enabled: Boolean(valorantApiMatchIds && valorantApiMatchIds.length > 0),
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const responses = await Promise.all(
        valorantApiMatchIds!.map((matchId) => getValorantMatchData(matchId)),
      );
      return responses.map((response) => response.data.matchData);
    },
  });

  const { data: tftApiData } = useQuery({
    queryKey: ["tft-match-detail", tftApiMatchIds],
    enabled: Boolean(tftApiMatchIds && tftApiMatchIds.length > 0),
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const responses = await Promise.all(
        tftApiMatchIds!.map((matchId) => getTftMatchData(matchId)),
      );
      return responses.map((response) => response.data);
    },
  });

  const match = useMemo(() => {
    if (!baseMatch) return null;

    if (preferredProvider === "tft" && tftApiData && tftApiData.length > 0) {
      return mergeTftApiIntoMatch(baseMatch, tftApiData[0]);
    }

    if (baseMatch.gameType === "valorant" && valorantApiData) {
      return mergeValorantApiIntoMatch(baseMatch, valorantApiData);
    }

    if (preferredProvider === "val" && valorantApiData) {
      return mergeValorantApiIntoMatch(baseMatch, valorantApiData);
    }

    return baseMatch;
  }, [baseMatch, preferredProvider, tftApiData, valorantApiData]);

  if (!match) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          {isMatchListLoading ? (
            <h2 className="text-2xl font-bold text-foreground">
              Đang tải dữ liệu trận đấu...
            </h2>
          ) : (
            <h2 className="text-2xl font-bold text-foreground">
              Không tìm thấy trận đấu
            </h2>
          )}
          <Link
            to={backTo}
            className="text-primary hover:underline text-[11px]"
          >
            ← Quay lại nhánh đấu
          </Link>
        </div>
      </div>
    );
  }

  const currentIndex = sortedMatches.findIndex(
    (item) => toNumber(item.id) === numId,
  );
  const currentBracketId =
    currentIndex >= 0
      ? toNumber(sortedMatches[currentIndex]?.bracket_id)
      : null;
  const bracketMatches =
    currentBracketId === null
      ? sortedMatches
      : sortedMatches.filter(
          (item) => toNumber(item.bracket_id) === currentBracketId,
        );
  const bracketCurrentIndex = bracketMatches.findIndex(
    (item) => toNumber(item.id) === numId,
  );
  const prevDetail =
    bracketCurrentIndex > 0 ? bracketMatches[bracketCurrentIndex - 1] : null;
  const nextDetail =
    bracketCurrentIndex >= 0 && bracketCurrentIndex < bracketMatches.length - 1
      ? bracketMatches[bracketCurrentIndex + 1]
      : null;
  const hasRosterData =
    match.team1Roster.players.length > 0 ||
    match.team2Roster.players.length > 0;
  const hasMapData = Boolean(match.maps?.length);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/70 bg-[#140a16] text-foreground">
        <div className="mx-auto px-4 md:px-8 py-3 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-3">
          <div className="order-2 md:order-1 flex items-center gap-2 min-w-0">
            <Link
              to={backTo}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 px-2.5 text-muted-foreground hover:text-foreground hover:border-border transition-colors text-xs font-semibold"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nhánh đấu</span>
            </Link>
            {prevDetail ? (
              <div className="inline-flex items-center gap-2 min-w-0">
                <div className="text-right leading-tight">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
                    Prev
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatNavDate(prevDetail.date_scheduled)}
                  </p>
                </div>
                <Link
                  to={buildMatchLink(prevDetail.id)}
                  className="inline-flex h-8 items-center rounded-md border border-border/70 bg-black/25 px-2 hover:bg-black/40 transition-colors shrink-0"
                >
                  <img
                    src={
                      prevDetail.team_a?.logo_url ||
                      prevDetail.team_b?.logo_url ||
                      match.team1.logo
                    }
                    alt="prev-team"
                    className="w-4 h-4 rounded-sm"
                  />
                  <span className="mx-2 h-4 w-px bg-border/70" />
                  <span className="text-[13px] font-black tabular-nums text-foreground">
                    {toNumber(prevDetail.score_a) ?? 0}:
                    {toNumber(prevDetail.score_b) ?? 0}
                  </span>
                  <span className="mx-2 h-4 w-px bg-border/70" />
                  <img
                    src={
                      prevDetail.team_b?.logo_url ||
                      prevDetail.team_a?.logo_url ||
                      match.team2.logo
                    }
                    alt="prev-opponent"
                    className="w-4 h-4 rounded-sm"
                  />
                </Link>
              </div>
            ) : null}
          </div>

          <div className="order-1 md:order-2 text-center">
            <p className="text-xs md:text-[11px] font-black uppercase tracking-[0.14em] text-primary">
              {match.tournamentName}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {match.roundName} · {match.format}
            </p>
          </div>

          <div className="order-3 flex justify-end items-center gap-2 min-w-0">
            {nextDetail ? (
              <div className="inline-flex items-center gap-2 min-w-0">
                <Link
                  to={buildMatchLink(nextDetail.id)}
                  className="inline-flex h-8 items-center rounded-md border border-border/70 bg-black/25 px-2 hover:bg-black/40 transition-colors shrink-0"
                >
                  <img
                    src={
                      nextDetail.team_a?.logo_url ||
                      nextDetail.team_b?.logo_url ||
                      match.team1.logo
                    }
                    alt="next-team"
                    className="w-4 h-4 rounded-sm"
                  />
                  <span className="mx-2 h-4 w-px bg-border/70" />
                  <span className="text-[13px] font-black tabular-nums text-foreground">
                    {toNumber(nextDetail.score_a) ?? 0}:
                    {toNumber(nextDetail.score_b) ?? 0}
                  </span>
                  <span className="mx-2 h-4 w-px bg-border/70" />
                  <img
                    src={
                      nextDetail.team_b?.logo_url ||
                      nextDetail.team_a?.logo_url ||
                      match.team2.logo
                    }
                    alt="next-opponent"
                    className="w-4 h-4 rounded-sm"
                  />
                </Link>
                <div className="text-left leading-tight">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
                    Next
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatNavDate(nextDetail.date_scheduled)}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="">
        <div className="mx-auto px-4 md:px-8 py-2 grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
          <div className="justify-end rounded-md border border-rose-500/20 bg-gradient-to-r from-rose-950/50 to-rose-900/20 px-4 py-3 flex items-center  gap-4">
            <div className="min-w-0 text-right">
              <span className="hidden lg:block text-base text-[15px] font-black uppercase tracking-wide">
                {match.team1.name}
              </span>
              <span className="block lg:hidden text-[11px] font-black uppercase tracking-wide">
                {match.team1.tag}
              </span>
            </div>
            <img
              src={match.team1.logo}
              alt={match.team1.tag}
              className="w-10 h-10"
            />
          </div>

          <div className="rounded-md border border-border/80 bg-black/25 px-4 py-2.5 flex items-center gap-5 md:gap-3 justify-center">
            <span className="text-2xl md:text-4xl font-black tabular-nums text-rose-400">
              {match.team1.score}
            </span>
            <div className="text-center leading-tight min-w-[76px] lg:block hidden">
              <p className="text-[20px] font-black">FIN</p>
              <p className="text-[11px] text-muted-foreground">
                {formatDate(match.date)}
              </p>
            </div>
            <span className="text-2xl md:text-4xl font-black tabular-nums text-emerald-400">
              {match.team2.score}
            </span>
          </div>

          <div className="rounded-md border border-emerald-500/20 bg-gradient-to-r from-emerald-900/20 to-emerald-950/50 px-4 py-3 flex items-center  gap-4">
            <img
              src={match.team2.logo}
              alt={match.team2.tag}
              className="w-10 h-10 "
            />
            <div className="min-w-0 text-left">
              <span className="hidden lg:block text-base text-[15px] font-black uppercase tracking-wide">
                {match.team2.name}
              </span>
              <span className="block lg:hidden text-[11px] font-black uppercase tracking-wide">
                {match.team2.tag}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Map Scores with background images ── */}
      {match.maps && match.maps.length > 0 && (
        <div className="">
          <div className="mx-auto px-4 md:px-8 py-6 space-y-2.5">
            {match.maps.map((map, i) => (
              <MapScoreRow
                key={i}
                map={map}
                team1Logo={match.team1.logo}
                team2Logo={match.team2.logo}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto px-4 md:px-8 py-8 md:py-5 space-y-6">
        {!hasRosterData && !hasMapData ? (
          <section className="rounded-xl border border-border/70 bg-card/40 p-6 text-sm text-muted-foreground">
            Chua co du lieu chi tiet cho tran dau nay.
          </section>
        ) : (
          <>
            <section className="">
              <RosterSection match={match} />
            </section>

            {(match.gameType === "cs2" || match.gameType === "valorant") && (
              <section className="rounded-2xl ">
                <FPSStatTable match={match} />
              </section>
            )}
            {(match.gameType === "lol" || match.gameType === "wildrift") && (
              <section className="rounded-2xl ">
                <MOBAStatTable match={match} />
              </section>
            )}
            {match.gameType === "tft" && (
              <section className="rounded-2xl ">
                <TFTStatTable match={match} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MatchDetailPage;
