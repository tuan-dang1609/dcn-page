import { useParams, Link, useOutletContext } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import axios from "axios";
import type { MatchDetail, RoundHistoryEntry } from "@/types/matchDetail";
import { useAuth, type User as AuthUser } from "@/contexts/AuthContext";
import type { RoundBanPickPayload } from "@/api/banpick";
import { API_BASE } from "@/lib/apiBase";
import { MapCard } from "@/components/MapCard";
import { SideSelectModal } from "@/components/SideSelectModal";
import { useRoundBanPickSocket } from "@/hooks/useRoundBanPickSocket";
import {
  getValorantMatchData,
  type ValorantApiMatchData,
  type ValorantApiPlayer,
  type ValorantApiRoundResult,
} from "@/api/valorant";
import {
  getTftMatchData,
  type TftApiParticipant,
  type TftApiResponse,
} from "@/api/tft";
import {
  getBracketsByTournamentId,
  getMatchGameIds,
  getMatchesByBracketId,
  getTournamentTeamPlayers,
  type Match,
  type MatchGameIdRecord,
  type TournamentBySlugResponse,
} from "@/api/tournaments";
import type { TournamentTeamPlayersResponse } from "@/api/tournaments/types";

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

type RoundWinReason = NonNullable<RoundHistoryEntry["winReason"]>;
type TeamSide = "team1" | "team2";
type LinkedUserProfile = AuthUser;

type LinkedTeamContext = {
  team1Players: TournamentTeamPlayersResponse["players"];
  team2Players: TournamentTeamPlayersResponse["players"];
  team1RiotAccounts: Set<string>;
  team2RiotAccounts: Set<string>;
  nicknameByRiotAccount: Map<string, string>;
  avatarByRiotAccount: Map<string, string>;
};

type ValorantSideMapping = {
  team1ApiTeamId: string;
  team2ApiTeamId: string;
};

const TRACKER_ICON_PREFIX =
  "https://imgsvc.trackercdn.com/url/max-width(36),quality(70)/https%3A%2F%2Ftrackercdn.com%2Fcdn%2Ftracker.gg%2Fvalorant%2Ficons%2F";

const ROUND_REASON_ICON_MAP: Record<
  RoundWinReason,
  { win: string; loss: string }
> = {
  time: {
    win: `${TRACKER_ICON_PREFIX}timewin1.png/image.png`,
    loss: `${TRACKER_ICON_PREFIX}timeloss1.png/image.png`,
  },
  default: {
    win: `${TRACKER_ICON_PREFIX}eliminationwin1.png/image.png`,
    loss: `${TRACKER_ICON_PREFIX}eliminationloss1.png/image.png`,
  },
  defuse: {
    win: `${TRACKER_ICON_PREFIX}diffusewin1.png/image.png`,
    loss: `${TRACKER_ICON_PREFIX}diffuseloss1.png/image.png`,
  },
  explosion: {
    win: `${TRACKER_ICON_PREFIX}explosionwin1.png/image.png`,
    loss: `${TRACKER_ICON_PREFIX}explosionloss1.png/image.png`,
  },
};

const sanitizeRiotSegment = (value?: string | null) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/^[`'"“”‘’]+|[`'"“”‘’]+$/g, "")
    .replace(/\s+/g, " ");

const normalizeRiotAccount = (value?: string | null) => {
  const rawValue = sanitizeRiotSegment(value).replace(/\s*#\s*/g, "#");

  if (!rawValue) return "";

  const [gameNameRaw, ...tagLineParts] = rawValue.split("#");
  const gameName = sanitizeRiotSegment(gameNameRaw);
  const tagLine = sanitizeRiotSegment(
    tagLineParts.join("#").replace(/^#+/, ""),
  );

  if (!gameName || !tagLine) {
    return rawValue.toLowerCase();
  }

  return `${gameName}#${tagLine}`.toLowerCase();
};

const buildRiotAccount = (gameName?: string, tagLine?: string) => {
  const normalizedGameName = sanitizeRiotSegment(gameName);
  const normalizedTagLine = sanitizeRiotSegment(
    String(tagLine ?? "").replace(/^#+/, ""),
  );

  if (normalizedGameName && normalizedTagLine) {
    return `${normalizedGameName}#${normalizedTagLine}`;
  }

  if (normalizedGameName.includes("#")) {
    const [namePart, ...tagPartList] = normalizedGameName.split("#");
    const safeName = sanitizeRiotSegment(namePart);
    const safeTag = sanitizeRiotSegment(
      tagPartList.join("#").replace(/^#+/, ""),
    );

    if (safeName && safeTag) {
      return `${safeName}#${safeTag}`;
    }
  }

  return "";
};

const createEmptyLinkedTeamContext = (): LinkedTeamContext => ({
  team1Players: [],
  team2Players: [],
  team1RiotAccounts: new Set(),
  team2RiotAccounts: new Set(),
  nicknameByRiotAccount: new Map(),
  avatarByRiotAccount: new Map(),
});

const isLinkedTournamentPlayer = (
  value: unknown,
): value is NonNullable<TournamentTeamPlayersResponse["players"]>[number] => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.nickname === "string" ||
    typeof candidate.profile_picture === "string" ||
    typeof candidate.riot_account === "string"
  );
};

const extractTournamentTeamPlayers = (
  payload: unknown,
): TournamentTeamPlayersResponse["players"] => {
  if (Array.isArray(payload)) {
    return payload.filter(isLinkedTournamentPlayer);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidate = payload as {
    players?: unknown;
    data?: unknown;
  };

  if (Array.isArray(candidate.players)) {
    return candidate.players.filter(isLinkedTournamentPlayer);
  }

  if (candidate.data && typeof candidate.data === "object") {
    const nestedData = candidate.data as { players?: unknown };
    if (Array.isArray(nestedData.players)) {
      return nestedData.players.filter(isLinkedTournamentPlayer);
    }
  }

  if (isLinkedTournamentPlayer(payload)) {
    return [payload];
  }

  return [];
};

const hydrateLinkedPlayersWithUserProfiles = async (
  players: TournamentTeamPlayersResponse["players"],
): Promise<TournamentTeamPlayersResponse["players"]> => {
  const safePlayers = players ?? [];

  if (safePlayers.length === 0) {
    return [];
  }

  const userIds = Array.from(
    new Set(
      safePlayers
        .map((player) => toNumber(player?.user_id))
        .filter((id): id is number => id !== null),
    ),
  );

  if (userIds.length === 0) {
    return safePlayers;
  }

  const profileResults = await Promise.all(
    userIds.map(async (userId) => {
      try {
        const response = await axios.get<LinkedUserProfile>(
          `${API_BASE}/api/users/${userId}`,
        );
        return [userId, response.data] as const;
      } catch {
        return null;
      }
    }),
  );

  const userProfileById = new Map<number, LinkedUserProfile>();
  profileResults.forEach((entry) => {
    if (!entry) return;
    userProfileById.set(entry[0], entry[1]);
  });

  return safePlayers.map((player) => {
    const userId = toNumber(player?.user_id);
    const linkedUser =
      userId !== null ? (userProfileById.get(userId) ?? null) : null;

    const nickname = String(
      linkedUser?.nickname ?? player?.nickname ?? "",
    ).trim();
    const profilePicture = String(
      linkedUser?.profile_picture ?? player?.profile_picture ?? "",
    ).trim();
    const riotAccount = String(
      linkedUser?.riot_account ?? player?.riot_account ?? "",
    ).trim();

    return {
      ...player,
      user_id: linkedUser?.id ?? player?.user_id,
      nickname: nickname || undefined,
      profile_picture: profilePicture || undefined,
      riot_account: riotAccount || null,
    };
  });
};

type BanPickTimelineItem = {
  key: string;
  mapName: string;
  type: "BAN" | "PICK" | "DECIDER";
  teamSlot: "team1" | "team2" | null;
  sideLabel?: string;
};

const buildBanPickTimeline = (
  payload?: RoundBanPickPayload | null,
): BanPickTimelineItem[] => {
  if (!payload?.state) return [];

  const mapNameByCode = new Map(
    (payload.map_pool ?? []).map((mapItem) => [
      mapItem.map_code,
      mapItem.map_name,
    ]),
  );

  const mapStateById = new Map(
    (payload.state.maps ?? []).map((mapState) => [mapState.mapId, mapState]),
  );

  const timelineFromActionLog = (payload.state.actionLog ?? [])
    .slice()
    .sort((a, b) => Number(a.step ?? 0) - Number(b.step ?? 0))
    .reduce<BanPickTimelineItem[]>((acc, entry, index) => {
      const normalizedAction = String(entry.action ?? "")
        .trim()
        .toLowerCase();
      const actionType = normalizedAction.includes("ban")
        ? "BAN"
        : normalizedAction.includes("pick")
          ? "PICK"
          : null;

      if (!actionType) return acc;

      const mapState = mapStateById.get(entry.mapId);
      const sideLabel =
        mapState?.side?.team1 && mapState?.side?.team2
          ? `${mapState.side.team1}/${mapState.side.team2}`
          : undefined;

      acc.push({
        key: `log-${entry.step}-${entry.mapId}-${index}`,
        mapName: mapNameByCode.get(entry.mapId) ?? entry.mapId,
        type: actionType,
        teamSlot: entry.team ?? null,
        sideLabel,
      });

      return acc;
    }, []);

  const deciderMap = (payload.state.maps ?? []).find(
    (mapState) => mapState.status === "decider",
  );

  if (deciderMap) {
    const deciderMapName =
      mapNameByCode.get(deciderMap.mapId) ?? deciderMap.mapId;
    const alreadyHasDecider = timelineFromActionLog.some(
      (item) => item.type === "DECIDER" && item.mapName === deciderMapName,
    );

    if (!alreadyHasDecider) {
      timelineFromActionLog.push({
        key: `decider-${deciderMap.mapId}`,
        mapName: deciderMapName,
        type: "DECIDER",
        teamSlot: null,
      });
    }
  }

  if (timelineFromActionLog.length > 0) {
    return timelineFromActionLog;
  }

  return (payload.state.maps ?? [])
    .filter((mapState) => mapState.status !== "available")
    .map((mapState, index) => {
      const type =
        mapState.status === "banned"
          ? "BAN"
          : mapState.status === "picked"
            ? "PICK"
            : "DECIDER";

      const sideLabel =
        mapState.side?.team1 && mapState.side?.team2
          ? `${mapState.side.team1}/${mapState.side.team2}`
          : undefined;

      return {
        key: `state-${mapState.mapId}-${index}`,
        mapName: mapNameByCode.get(mapState.mapId) ?? mapState.mapId,
        type,
        teamSlot: mapState.actionBy ?? mapState.sideChosenBy ?? null,
        sideLabel,
      } satisfies BanPickTimelineItem;
    });
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

const buildRoundSlug = ({
  tournamentSlug,
  roundNumber,
  matchNo,
  matchId,
}: {
  tournamentSlug?: string;
  roundNumber?: number | null;
  matchNo?: number | null;
  matchId?: number | null;
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

const toTeamPlayerStat = (
  player:
    | {
        nickname?: string;
        profile_picture?: string;
        riot_account?: string | null;
      }
    | undefined,
  fallbackIndex: number,
) => {
  const normalizedNickname = String(player?.nickname ?? "").trim();
  const normalizedRiot = String(player?.riot_account ?? "").trim();

  return {
    name: normalizedNickname || normalizedRiot || `Player ${fallbackIndex + 1}`,
    icon: `https://placehold.co/24x24/111827/ffffff?text=${fallbackIndex + 1}`,
    avatar: String(player?.profile_picture ?? "").trim() || undefined,
  };
};

const hydrateRostersWithLinkedPlayers = (
  baseMatch: MatchDetail,
  linkedContext: LinkedTeamContext,
): MatchDetail => {
  const hasAnyLinkedPlayer =
    linkedContext.team1Players.length > 0 ||
    linkedContext.team2Players.length > 0;

  if (!hasAnyLinkedPlayer) return baseMatch;

  const hasTeam1Roster = baseMatch.team1Roster.players.length > 0;
  const hasTeam2Roster = baseMatch.team2Roster.players.length > 0;

  if (hasTeam1Roster || hasTeam2Roster) {
    return baseMatch;
  }

  return {
    ...baseMatch,
    team1Roster: {
      ...baseMatch.team1Roster,
      players: linkedContext.team1Players.map((player, index) =>
        toTeamPlayerStat(player, index),
      ),
    },
    team2Roster: {
      ...baseMatch.team2Roster,
      players: linkedContext.team2Players.map((player, index) =>
        toTeamPlayerStat(player, index),
      ),
    },
  };
};

const mergeTftApiIntoMatch = (
  baseMatch: MatchDetail,
  tftPayload: TftApiResponse,
  linkedContext: LinkedTeamContext,
): MatchDetail => {
  const parsedParticipants = extractTftParticipants(tftPayload)
    .map((participant, index) => {
      const gameName = String(participant.riotIdGameName ?? "").trim();
      const tagLine = String(participant.riotIdTagline ?? "").trim();
      const riotAccount = buildRiotAccount(gameName, tagLine);
      const normalizedRiotAccount = normalizeRiotAccount(riotAccount);
      const linkedNickname = normalizedRiotAccount
        ? linkedContext.nicknameByRiotAccount.get(normalizedRiotAccount)
        : undefined;
      const linkedAvatar = normalizedRiotAccount
        ? linkedContext.avatarByRiotAccount.get(normalizedRiotAccount)
        : undefined;
      const inferredSide: TeamSide | null = linkedContext.team1RiotAccounts.has(
        normalizedRiotAccount,
      )
        ? "team1"
        : linkedContext.team2RiotAccounts.has(normalizedRiotAccount)
          ? "team2"
          : null;
      const name =
        linkedNickname ||
        (gameName && tagLine
          ? `${gameName}#${tagLine}`
          : gameName || `Player ${index + 1}`);

      return {
        name,
        icon:
          linkedAvatar ||
          `https://placehold.co/24x24/111827/ffffff?text=${index + 1}`,
        avatar: linkedAvatar,
        placement: toNumber(participant.placement) ?? 8,
        side: inferredSide,
      };
    })
    .sort((a, b) => (a.placement ?? 8) - (b.placement ?? 8));

  if (parsedParticipants.length === 0) {
    return baseMatch;
  }

  const mappedTeam1 = parsedParticipants.filter(
    (participant) => participant.side === "team1",
  );
  const mappedTeam2 = parsedParticipants.filter(
    (participant) => participant.side === "team2",
  );
  const unassigned = parsedParticipants.filter(
    (participant) => participant.side === null,
  );

  const splitIndex = Math.ceil(parsedParticipants.length / 2);
  const team1Players = [...mappedTeam1];
  const team2Players = [...mappedTeam2];

  if (mappedTeam1.length > 0 || mappedTeam2.length > 0) {
    unassigned.forEach((participant) => {
      const shouldPushTeam1 =
        team1Players.length < splitIndex &&
        (team1Players.length <= team2Players.length ||
          team2Players.length >= splitIndex);

      if (shouldPushTeam1) {
        team1Players.push(participant);
      } else {
        team2Players.push(participant);
      }
    });
  } else {
    team1Players.push(...parsedParticipants.slice(0, splitIndex));
    team2Players.push(...parsedParticipants.slice(splitIndex));
  }

  return {
    ...baseMatch,
    gameType: "tft",
    team1Roster: {
      ...baseMatch.team1Roster,
      players: team1Players,
    },
    team2Roster: {
      ...baseMatch.team2Roster,
      players: team2Players,
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

const normalizeTeamId = (value?: string | null) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const getTeamRoundScore = (
  apiData: ValorantApiMatchData,
  teamId: string,
  fallback: number,
) => {
  const normalizedTarget = normalizeTeamId(teamId);
  const team = apiData.teams?.find(
    (entry) => normalizeTeamId(entry.teamId) === normalizedTarget,
  );

  return team?.roundsWon ?? team?.numPoints ?? fallback;
};

const resolveRoundWinner = (
  winningTeam?: string,
): RoundHistoryEntry["winner"] => {
  const normalized = String(winningTeam ?? "")
    .trim()
    .toLowerCase();

  if (["red", "team1", "left"].includes(normalized)) return "team1";
  if (["blue", "team2", "right"].includes(normalized)) return "team2";

  return null;
};

const resolveRoundWinnerWithMapping = (
  winningTeam: string | undefined,
  sideMapping: ValorantSideMapping,
): RoundHistoryEntry["winner"] => {
  const normalizedWinningTeam = normalizeTeamId(winningTeam);

  if (!normalizedWinningTeam) return null;
  if (normalizedWinningTeam === normalizeTeamId(sideMapping.team1ApiTeamId)) {
    return "team1";
  }
  if (normalizedWinningTeam === normalizeTeamId(sideMapping.team2ApiTeamId)) {
    return "team2";
  }

  return resolveRoundWinner(winningTeam);
};

const defaultValorantSideMapping = (
  teamIds: string[],
): ValorantSideMapping | null => {
  if (!teamIds.length) return null;

  const redId = teamIds.find((id) => normalizeTeamId(id) === "red");
  const blueId = teamIds.find((id) => normalizeTeamId(id) === "blue");

  if (redId && blueId) {
    return {
      team1ApiTeamId: redId,
      team2ApiTeamId: blueId,
    };
  }

  if (teamIds.length >= 2) {
    return {
      team1ApiTeamId: teamIds[0],
      team2ApiTeamId: teamIds[1],
    };
  }

  return {
    team1ApiTeamId: teamIds[0],
    team2ApiTeamId: "__unknown__",
  };
};

const resolveValorantSideMapping = (
  mapPlayers: ValorantApiPlayer[],
  linkedContext: LinkedTeamContext,
  previousMapping: ValorantSideMapping | null,
): ValorantSideMapping | null => {
  const teamFrequency = new Map<string, number>();

  mapPlayers.forEach((player) => {
    const teamId = String(player.teamId ?? "").trim();
    if (!teamId) return;
    teamFrequency.set(teamId, (teamFrequency.get(teamId) ?? 0) + 1);
  });

  const sortedTeamIds = Array.from(teamFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([teamId]) => teamId);

  if (sortedTeamIds.length === 0) {
    return previousMapping;
  }

  if (sortedTeamIds.length === 1) {
    if (previousMapping) return previousMapping;
    return defaultValorantSideMapping(sortedTeamIds);
  }

  const idA = sortedTeamIds[0];
  const idB = sortedTeamIds[1];

  const scoreMapping = (team1ApiTeamId: string, team2ApiTeamId: string) => {
    const team1Normalized = normalizeTeamId(team1ApiTeamId);
    const team2Normalized = normalizeTeamId(team2ApiTeamId);
    let score = 0;

    mapPlayers.forEach((player) => {
      const riotAccount = normalizeRiotAccount(
        buildRiotAccount(player.gameName, player.tagLine),
      );
      if (!riotAccount) return;

      const playerTeamId = normalizeTeamId(player.teamId);
      const inTeam1 = linkedContext.team1RiotAccounts.has(riotAccount);
      const inTeam2 = linkedContext.team2RiotAccounts.has(riotAccount);

      if (!inTeam1 && !inTeam2) return;

      if (playerTeamId === team1Normalized) {
        if (inTeam1) score += 2;
        if (inTeam2) score -= 2;
      }

      if (playerTeamId === team2Normalized) {
        if (inTeam2) score += 2;
        if (inTeam1) score -= 2;
      }
    });

    return score;
  };

  const optionA: ValorantSideMapping = {
    team1ApiTeamId: idA,
    team2ApiTeamId: idB,
  };
  const optionB: ValorantSideMapping = {
    team1ApiTeamId: idB,
    team2ApiTeamId: idA,
  };

  const optionAScore = scoreMapping(
    optionA.team1ApiTeamId,
    optionA.team2ApiTeamId,
  );
  const optionBScore = scoreMapping(
    optionB.team1ApiTeamId,
    optionB.team2ApiTeamId,
  );
  const bestOption = optionAScore >= optionBScore ? optionA : optionB;
  const bestScore = Math.max(optionAScore, optionBScore);

  if (bestScore > 0) return bestOption;

  if (
    previousMapping &&
    sortedTeamIds.some(
      (id) =>
        normalizeTeamId(id) === normalizeTeamId(previousMapping.team1ApiTeamId),
    ) &&
    sortedTeamIds.some(
      (id) =>
        normalizeTeamId(id) === normalizeTeamId(previousMapping.team2ApiTeamId),
    )
  ) {
    return previousMapping;
  }

  return defaultValorantSideMapping(sortedTeamIds);
};

const inferRoundWinReason = (
  roundResult: ValorantApiRoundResult,
): RoundWinReason => {
  const reasonText = [
    roundResult.roundResult,
    roundResult.roundResultCode,
    roundResult.roundResultType,
    roundResult.roundResultReason,
    roundResult.roundEndType,
    roundResult.roundOutcome,
    roundResult.roundWinMethod,
    roundResult.winType,
    roundResult.endType,
    roundResult.roundCeremony,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  if (/(defus|diffus)/.test(reasonText)) return "defuse";
  if (/(explos|detonat|spike\s*deton|bomb\s*explod)/.test(reasonText)) {
    return "explosion";
  }
  if (/(time|timeout|clock|timer)/.test(reasonText)) return "time";

  return "default";
};

const getRoundResultIcon = (
  reason: RoundHistoryEntry["winReason"],
  variant: "win" | "loss",
) => ROUND_REASON_ICON_MAP[reason ?? "default"][variant];

const buildRoundHistoryFromApi = (
  roundResults?: ValorantApiRoundResult[],
  winnerResolver?: (winningTeam?: string) => RoundHistoryEntry["winner"],
): RoundHistoryEntry[] => {
  if (!Array.isArray(roundResults) || roundResults.length === 0) return [];

  return roundResults
    .map((roundResult, index) => ({
      roundNum: toNumber(roundResult.roundNum) ?? index,
      winner: winnerResolver
        ? winnerResolver(roundResult.winningTeam)
        : resolveRoundWinner(roundResult.winningTeam),
      winningRole: roundResult.winningTeamRole,
      ceremony: roundResult.roundCeremony,
      winReason: inferRoundWinReason(roundResult),
    }))
    .sort((a, b) => a.roundNum - b.roundNum);
};

const buildValorantRosterFromApi = (
  baseRoster: MatchDetail["team1Roster"],
  players: ValorantApiPlayer[],
  nicknameByRiotAccount?: Map<string, string>,
  avatarByRiotAccount?: Map<string, string>,
): MatchDetail["team1Roster"] => ({
  ...baseRoster,
  players: Array.from(
    players
      .reduce(
        (acc, player) => {
          const riotAccount = normalizeRiotAccount(
            buildRiotAccount(player.gameName, player.tagLine),
          );
          const key =
            riotAccount ||
            `${String(player.gameName ?? "")}-${String(player.tagLine ?? "")}-${String(player.characterName ?? "")}`
              .toLowerCase()
              .trim();
          const linkedNickname = riotAccount
            ? nicknameByRiotAccount?.get(riotAccount)
            : undefined;
          const linkedAvatar = riotAccount
            ? avatarByRiotAccount?.get(riotAccount)
            : undefined;
          const stats = player.stats ?? {};
          const current = acc.get(key) ?? {
            name:
              linkedNickname ||
              String(player.gameName ?? "").trim() ||
              riotAccount ||
              "Unknown",
            icon: player.imgCharacter,
            avatar: linkedAvatar || undefined,
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

          if (linkedNickname) {
            current.name = linkedNickname;
          }

          if (linkedAvatar) {
            current.avatar = linkedAvatar;
          }

          if (player.imgCharacter) {
            current.icon = player.imgCharacter;
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
  linkedContext: LinkedTeamContext,
): MatchDetail => {
  if (apiMatches.length === 0) {
    return baseMatch;
  }

  const sortedMatches = [...apiMatches].sort(
    (a, b) =>
      (a.matchInfo?.gameStartMillis ?? Number.MAX_SAFE_INTEGER) -
      (b.matchInfo?.gameStartMillis ?? Number.MAX_SAFE_INTEGER),
  );

  let stickySideMapping: ValorantSideMapping | null = null;

  const mappedMatches = sortedMatches.map((apiData) => {
    const mapPlayers = apiData.players ?? [];
    const sideMapping =
      resolveValorantSideMapping(
        mapPlayers,
        linkedContext,
        stickySideMapping,
      ) ?? stickySideMapping;

    if (sideMapping) {
      stickySideMapping = sideMapping;
    }

    const effectiveSideMapping =
      sideMapping ??
      defaultValorantSideMapping(
        Array.from(
          new Set(
            mapPlayers
              .map((player) => String(player.teamId ?? "").trim())
              .filter(Boolean),
          ),
        ),
      );

    const mapTeam1Players = effectiveSideMapping
      ? mapPlayers.filter(
          (player) =>
            normalizeTeamId(player.teamId) ===
            normalizeTeamId(effectiveSideMapping.team1ApiTeamId),
        )
      : mapPlayers.filter((player) => normalizeTeamId(player.teamId) === "red");

    const mapTeam2Players = effectiveSideMapping
      ? mapPlayers.filter(
          (player) =>
            normalizeTeamId(player.teamId) ===
            normalizeTeamId(effectiveSideMapping.team2ApiTeamId),
        )
      : mapPlayers.filter(
          (player) => normalizeTeamId(player.teamId) === "blue",
        );

    const team1Score = getTeamRoundScore(
      apiData,
      effectiveSideMapping?.team1ApiTeamId ?? "Red",
      0,
    );
    const team2Score = getTeamRoundScore(
      apiData,
      effectiveSideMapping?.team2ApiTeamId ?? "Blue",
      0,
    );

    const roundHistory = buildRoundHistoryFromApi(
      apiData.roundResults,
      effectiveSideMapping
        ? (winningTeam) =>
            resolveRoundWinnerWithMapping(winningTeam, effectiveSideMapping)
        : undefined,
    );

    return {
      apiData,
      mapTeam1Players,
      mapTeam2Players,
      team1Score,
      team2Score,
      roundHistory,
    };
  });

  const maps = mappedMatches.map((mappedMatch, index) => {
    const { apiData, team1Score, team2Score, roundHistory } = mappedMatch;

    return {
      mapName: apiData.matchInfo?.mapName?.toUpperCase() ?? `GAME ${index + 1}`,
      team1Score,
      team2Score,
      roundHistory,
    };
  });

  const mapLabelCounts = new Map<string, number>();
  const mapLabels = maps.map((map, index) => {
    const baseLabel = map.mapName || `GAME ${index + 1}`;
    const count = (mapLabelCounts.get(baseLabel) ?? 0) + 1;
    mapLabelCounts.set(baseLabel, count);

    return count === 1 ? baseLabel : `${baseLabel} ${count}`;
  });

  const fpsMapRosters = mappedMatches.map((mappedMatch, index) => {
    const { mapTeam1Players, mapTeam2Players } = mappedMatch;

    return {
      label: mapLabels[index],
      team1Roster:
        mapTeam1Players.length > 0
          ? buildValorantRosterFromApi(
              baseMatch.team1Roster,
              mapTeam1Players,
              linkedContext.nicknameByRiotAccount,
              linkedContext.avatarByRiotAccount,
            )
          : baseMatch.team1Roster,
      team2Roster:
        mapTeam2Players.length > 0
          ? buildValorantRosterFromApi(
              baseMatch.team2Roster,
              mapTeam2Players,
              linkedContext.nicknameByRiotAccount,
              linkedContext.avatarByRiotAccount,
            )
          : baseMatch.team2Roster,
    };
  });

  const team1Players = mappedMatches.flatMap(
    (mappedMatch) => mappedMatch.mapTeam1Players,
  );
  const team2Players = mappedMatches.flatMap(
    (mappedMatch) => mappedMatch.mapTeam2Players,
  );

  const team1SeriesWins = maps.reduce(
    (wins, map) => wins + (map.team1Score > map.team2Score ? 1 : 0),
    0,
  );
  const team2SeriesWins = maps.reduce(
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
      score: team1SeriesWins,
    },
    team2: {
      ...baseMatch.team2,
      score: team2SeriesWins,
    },
    maps,
    statTabs: ["All Maps", ...mapLabels],
    fpsMapRosters,
    team1Roster:
      team1Players.length > 0
        ? buildValorantRosterFromApi(
            baseMatch.team1Roster,
            team1Players,
            linkedContext.nicknameByRiotAccount,
            linkedContext.avatarByRiotAccount,
          )
        : baseMatch.team1Roster,
    team2Roster:
      team2Players.length > 0
        ? buildValorantRosterFromApi(
            baseMatch.team2Roster,
            team2Players,
            linkedContext.nicknameByRiotAccount,
            linkedContext.avatarByRiotAccount,
          )
        : baseMatch.team2Roster,
  };
};

/* ── Map Score Row (blast.tv style with bg image) ── */
const MapScoreRow = ({
  map,
  team1,
  team2,
}: {
  map: NonNullable<MatchDetail["maps"]>[number];
  team1: MatchDetail["team1"];
  team2: MatchDetail["team2"];
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
          <img src={team1.logo} alt="" className="w-5 h-5 rounded" />
          <span
            className={`text-lg font-black tabular-nums ${t1Win ? "text-primary" : "text-muted-foreground"}`}
          >
            {map.team1Score}
          </span>
        </div>

        <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-foreground px-3 py-1 min-w-33 text-center">
          {map.mapName}
        </span>

        <div className="flex items-center gap-3 justify-end">
          <span
            className={`text-lg font-black tabular-nums ${!t1Win ? "text-primary" : "text-muted-foreground"}`}
          >
            {map.team2Score}
          </span>
          <img src={team2.logo} alt="" className="w-5 h-5 rounded" />
        </div>
      </div>
    </div>
  );
};

const BanPickTimelinePanel = ({
  timeline,
  team1,
  team2,
}: {
  timeline: BanPickTimelineItem[];
  team1: MatchDetail["team1"];
  team2: MatchDetail["team2"];
}) => {
  if (!timeline.length) return null;

  const teamBySlot = {
    team1,
    team2,
  } as const;

  return (
    <aside>
      <div className="mb-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">
          Ban/Pick Timeline
        </p>
      </div>

      <div className="space-y-2">
        {timeline.map((item) => {
          const team = item.teamSlot ? teamBySlot[item.teamSlot] : null;
          const badgeClass =
            item.type === "BAN"
              ? "text-rose-300 border-rose-500/40 bg-rose-500/10"
              : item.type === "PICK"
                ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
                : "text-sky-300 border-sky-500/40 bg-sky-500/10";

          return (
            <div
              key={item.key}
              className="rounded-lg border border-border/50 bg-black/20 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-foreground truncate">
                    {item.mapName}
                  </p>
                  {item.sideLabel && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Side: {item.sideLabel}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`inline-flex h-6 items-center rounded-md border px-2 text-[10px] font-extrabold uppercase tracking-[0.12em] ${badgeClass}`}
                  >
                    {item.type}
                  </span>

                  {team && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-black/25 px-1.5 py-1">
                      <img
                        src={team.logo}
                        alt={team.tag}
                        className="w-4 h-4 rounded-sm"
                      />
                      <span className="text-[10px] font-bold text-foreground uppercase tracking-wide">
                        {team.tag}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};

type BanPickLobbyMapItem = {
  key: string;
  mapId: string;
  mapName: string;
  imageUrl: string;
  type: "PICK" | "DECIDER";
};

const buildBanPickLobbyMaps = (
  payload?: RoundBanPickPayload | null,
): BanPickLobbyMapItem[] => {
  if (!payload?.state) return [];

  const mapMetaByCode = new Map(
    (payload.map_pool ?? []).map((mapItem) => [mapItem.map_code, mapItem]),
  );

  const mapStateById = new Map(
    (payload.state.maps ?? []).map((mapState) => [mapState.mapId, mapState]),
  );

  const pickedByOrder = (payload.state.actionLog ?? [])
    .slice()
    .sort((a, b) => Number(a.step ?? 0) - Number(b.step ?? 0))
    .filter((entry) => String(entry.action ?? "").toLowerCase() === "pick")
    .map((entry, index) => {
      const mapState = mapStateById.get(entry.mapId);
      const mapMeta = mapMetaByCode.get(entry.mapId);

      return {
        key: `picked-${entry.step}-${entry.mapId}-${index}`,
        mapId: entry.mapId,
        mapName: mapMeta?.map_name ?? entry.mapId,
        imageUrl: mapMeta?.image_url ?? "",
        type: mapState?.status === "decider" ? "DECIDER" : "PICK",
      } satisfies BanPickLobbyMapItem;
    });

  const seen = new Set(pickedByOrder.map((item) => item.mapId));

  const leftovers = (payload.state.maps ?? [])
    .filter(
      (mapState) =>
        (mapState.status === "picked" || mapState.status === "decider") &&
        !seen.has(mapState.mapId),
    )
    .map((mapState, index) => {
      const mapMeta = mapMetaByCode.get(mapState.mapId);

      return {
        key: `leftover-${mapState.mapId}-${index}`,
        mapId: mapState.mapId,
        mapName: mapMeta?.map_name ?? mapState.mapId,
        imageUrl: mapMeta?.image_url ?? "",
        type: mapState.status === "decider" ? "DECIDER" : "PICK",
      } satisfies BanPickLobbyMapItem;
    });

  return [...pickedByOrder, ...leftovers];
};

const BanPickLobbyPanel = ({
  roundSlug,
  matchId,
  token,
  team1,
  team2,
  seriesScoreA,
  seriesScoreB,
  mapCursorFromGameIds,
  roomId,
}: {
  roundSlug: string;
  matchId: number | null;
  token?: string | null;
  team1: MatchDetail["team1"];
  team2: MatchDetail["team2"];
  seriesScoreA: number;
  seriesScoreB: number;
  mapCursorFromGameIds: number;
  roomId?: string | null;
}) => {
  const {
    session,
    isLoading,
    error,
    viewerTeamSlot,
    canAct,
    selectMap,
    confirmAction,
    selectSide,
  } = useRoundBanPickSocket({
    roundSlug,
    matchId,
    token,
  });

  const banPick = session?.state ?? null;

  const mapByCode = useMemo(() => {
    const entries = (session?.map_pool ?? []).map((item) => [
      item.map_code,
      item,
    ]);
    return Object.fromEntries(entries);
  }, [session?.map_pool]);

  const lobbyMaps = useMemo(() => buildBanPickLobbyMaps(session), [session]);

  const currentAction = session?.current_action ?? null;

  const isMyTurn =
    Boolean(viewerTeamSlot) &&
    ((banPick?.phase === "ban_pick" && currentAction?.team === viewerTeamSlot) ||
      (banPick?.phase === "side_select" &&
        banPick?.sideSelectTeam === viewerTeamSlot));

  const progressByScore = Math.max(
    0,
    (toNumber(seriesScoreA) ?? 0) + (toNumber(seriesScoreB) ?? 0),
  );
  const progressByMatchIds = Math.max(0, toNumber(mapCursorFromGameIds) ?? 0);
  const nextMapCursor = Math.max(progressByScore, progressByMatchIds);

  const currentMapIndex =
    lobbyMaps.length > 0
      ? Math.min(nextMapCursor, Math.max(lobbyMaps.length - 1, 0))
      : -1;

  const currentMap = currentMapIndex >= 0 ? lobbyMaps[currentMapIndex] : null;

  const sideSelectMap =
    banPick?.sideSelectMapId && mapByCode[banPick.sideSelectMapId]
      ? mapByCode[banPick.sideSelectMapId]
      : null;

  const sideSelectTeamName =
    banPick?.sideSelectTeam && banPick?.teamNames
      ? banPick.teamNames[banPick.sideSelectTeam]
      : "";

  const draftComplete = banPick?.phase === "complete";
  const effectiveRoomId =
    String(session?.room_id ?? roomId ?? "").trim() || null;

  if (!matchId) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-[#0f1115] text-foreground overflow-hidden">
      <div className="border-b border-border/70 px-4 md:px-6 py-3.5 bg-[#14181d]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">
              Match Lobby
            </p>
            <p className="text-[11px] text-[#EEEEEE] mt-0.5">
              {roundSlug.toUpperCase()}
            </p>
          </div>

          <div className="text-right">
            {draftComplete ? (
              <span className="inline-flex items-center rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-300">
                Draft Complete
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-300">
                {currentAction?.type === "pick" ? "Pick Turn" : "Ban Turn"}
              </span>
            )}
          </div>
        </div>

        {draftComplete && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-border/70 bg-black/25 px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#EEEEEE]">
              Room ID
            </span>
            <span className="text-[11px] font-black tracking-[0.1em] text-primary">
              {effectiveRoomId ?? "TBD"}
            </span>
          </div>
        )}

        {error && (
          <p className="mt-3 text-[11px] text-rose-300">{error}</p>
        )}
      </div>

      <div className="px-4 md:px-6 py-4 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_220px] gap-4 lg:gap-5 items-start">
        <div className="rounded-xl border border-border/60 bg-black/20 px-4 py-4">
          <div className="flex items-center gap-3">
            <img src={team1.logo} alt={team1.tag} className="w-11 h-11 rounded-md" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#EEEEEE]">
                Team A
              </p>
              <p className="truncate text-[13px] font-black uppercase tracking-wide text-foreground">
                {team1.name}
              </p>
            </div>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-rose-300">
            {seriesScoreA}
          </p>
        </div>

        <div className="space-y-4">
          {currentMap && (
            <div className="relative rounded-xl overflow-hidden border border-primary/30 h-24">
              <img
                src={currentMap.imageUrl}
                alt={currentMap.mapName}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-linear-to-r from-black/75 via-black/35 to-black/75" />
              <div className="relative z-10 h-full px-4 py-3 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-primary font-black">
                    Current Map
                  </p>
                  <p className="truncate text-lg font-black uppercase tracking-wide text-white">
                    {currentMap.mapName}
                  </p>
                </div>
                <span className="shrink-0 rounded-md border border-primary/40 bg-black/40 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                  Map {currentMapIndex + 1}
                </span>
              </div>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {lobbyMaps.map((item, index) => {
              const isCurrent = index === currentMapIndex;

              return (
                <article
                  key={item.key}
                  className={`relative h-20 overflow-hidden rounded-lg border ${
                    isCurrent
                      ? "border-primary/70 ring-1 ring-primary/40"
                      : "border-border/60"
                  }`}
                >
                  <img
                    src={item.imageUrl}
                    alt={item.mapName}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent" />
                  <div className="relative z-10 h-full px-3 py-2 flex flex-col justify-end">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#EEEEEE]">
                      Map {index + 1}
                    </p>
                    <p className="truncate text-[13px] font-black uppercase tracking-wide text-white">
                      {item.mapName}
                    </p>
                  </div>
                </article>
              );
            })}

            {!lobbyMaps.length && (
              <div className="rounded-lg border border-border/60 bg-black/20 px-3 py-3 text-[11px] text-muted-foreground sm:col-span-2 xl:col-span-3">
                Chưa có map được pick/decider.
              </div>
            )}
          </div>

          {banPick && (
            <div className="space-y-3 rounded-xl border border-border/60 bg-black/20 p-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {banPick.maps.map((mapState) => (
                  <MapCard
                    key={mapState.mapId}
                    mapState={mapState}
                    isSelected={banPick.selectedMapId === mapState.mapId}
                    onSelect={selectMap}
                    disabled={banPick.phase !== "ban_pick" || !isMyTurn}
                    teamNames={banPick.teamNames}
                    mapMeta={mapByCode[mapState.mapId]}
                  />
                ))}
              </div>

              {!canAct && (
                <p className="text-[11px] text-muted-foreground">
                  Chế độ xem: chỉ thành viên của 2 team mới thao tác ban/pick.
                </p>
              )}

              {canAct && !isMyTurn && !draftComplete && (
                <p className="text-[11px] text-amber-300">
                  Chưa tới lượt team của bạn.
                </p>
              )}

              {banPick.phase === "ban_pick" && canAct && isMyTurn && (
                <button
                  onClick={() => void confirmAction()}
                  disabled={!banPick.selectedMapId}
                  className={`
                    w-full rounded-lg py-2.5 text-sm font-black uppercase tracking-[0.14em] transition-all
                    ${
                      banPick.selectedMapId
                        ? currentAction?.type === "ban"
                          ? "bg-rose-500 text-rose-50 hover:brightness-110"
                          : "bg-emerald-500 text-emerald-50 hover:brightness-110"
                        : "bg-val-disabled text-muted-foreground cursor-not-allowed"
                    }
                  `}
                >
                  {banPick.selectedMapId
                    ? `Lock ${currentAction?.type === "ban" ? "Ban" : "Pick"}`
                    : "Select Map"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border/60 bg-black/20 px-4 py-4">
          <div className="flex items-center gap-3">
            <img src={team2.logo} alt={team2.tag} className="w-11 h-11 rounded-md" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#EEEEEE]">
                Team B
              </p>
              <p className="truncate text-[13px] font-black uppercase tracking-wide text-foreground">
                {team2.name}
              </p>
            </div>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-emerald-300">
            {seriesScoreB}
          </p>
        </div>
      </div>

      {isLoading && !banPick && (
        <div className="border-t border-border/70 px-4 md:px-6 py-3 text-[11px] text-muted-foreground">
          Đang tải ban/pick lobby...
        </div>
      )}

      {banPick?.phase === "side_select" && sideSelectMap && (
        <SideSelectModal
          mapName={sideSelectMap.map_name}
          teamName={sideSelectTeamName}
          onSelect={(side) => {
            if (!isMyTurn) return;
            void selectSide(side);
          }}
        />
      )}
    </section>
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
  const selectedMapForRounds =
    currentTab === 0
      ? (match.maps?.[0] ?? null)
      : (match.maps?.[currentTab - 1] ?? null);
  const selectedRoundHistory = selectedMapForRounds?.roundHistory
    ? [...selectedMapForRounds.roundHistory].sort(
        (a, b) => a.roundNum - b.roundNum,
      )
    : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center  flex-wrap gap-4">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            Match Stats
          </h3>
          <p className="text-xs text-[#EEEEEE] mt-0.5">
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
                  : "bg-transparent border-border text-[#EEEEEE] hover:text-foreground hover:border-foreground/30"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {selectedMapForRounds && selectedRoundHistory.length > 0 && (
        <div className="w-full rounded-md border border-cyan-400/10 px-3 py-2">
          <div className="grid w-full grid-cols-[84px_minmax(0,1fr)] items-start gap-3">
            <div className="shrink-0 min-w-18.5">
              <div className="flex items-center justify-between text-[11px] leading-none">
                <span className="font-semibold text-slate-100 uppercase tracking-wide">
                  {match.team1.tag}
                </span>
                <span className="font-black tabular-nums text-lg text-cyan-300">
                  {selectedMapForRounds.team1Score}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] leading-none">
                <span className="font-semibold text-slate-100 uppercase tracking-wide">
                  {match.team2.tag}
                </span>
                <span className="font-black tabular-nums text-lg text-rose-300">
                  {selectedMapForRounds.team2Score}
                </span>
              </div>
            </div>

            <div className="w-full overflow-x-auto pb-1">
              <div
                className="grid min-w-max gap-x-3"
                style={{
                  gridTemplateColumns: `repeat(${selectedRoundHistory.length}, minmax(1.6rem, 1fr))`,
                }}
              >
                {selectedRoundHistory.map((round) => {
                  const isTeam1Win = round.winner === "team1";
                  const isTeam2Win = round.winner === "team2";
                  const team1Icon = getRoundResultIcon(round.winReason, "win");
                  const team2Icon = getRoundResultIcon(round.winReason, "loss");
                  const tooltipText = [
                    `Round ${round.roundNum + 1}`,
                    round.winningRole,
                    round.ceremony,
                  ]
                    .filter(Boolean)
                    .join(" | ");

                  return (
                    <div
                      key={`fps-round-col-${selectedMapForRounds.mapName}-${round.roundNum}`}
                      title={tooltipText}
                      className="flex flex-col items-center gap-1"
                    >
                      <span
                        className={`inline-flex h-4 w-4 items-center justify-center ${
                          isTeam1Win ? "text-cyan-300" : "text-slate-600"
                        }`}
                      >
                        {isTeam1Win ? (
                          <img
                            src={team1Icon}
                            alt="team1-round-win"
                            className="h-3.5 w-3.5 object-contain"
                          />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                        )}
                      </span>

                      <span
                        className={`inline-flex h-4 w-4 items-center justify-center ${
                          isTeam2Win ? "text-rose-400" : "text-slate-600"
                        }`}
                      >
                        {isTeam2Win ? (
                          <img
                            src={team2Icon}
                            alt="team2-round-win"
                            className="h-3.5 w-3.5 object-contain"
                          />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                        )}
                      </span>

                      <span className="mt-0.5 text-[10px] text-slate-500 tabular-nums">
                        {round.roundNum + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

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
                    <tr className="border-b border-border/40 text-[11px] font-bold uppercase tracking-wider text-[#EEEEEE]">
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
                              <div className="w-6 h-6 rounded bg-secondary flex items-center justify-center text-[11px] font-bold text-[#EEEEEE]">
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
          <p className="text-xs text-[#EEEEEE] mt-0.5">
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
                  : "bg-transparent border-border text-[#EEEEEE] hover:text-foreground"
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
                  className="grid gap-0 px-4 py-3 border-b border-border/40 text-[11px] font-bold uppercase tracking-wider text-[#EEEEEE]"
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
                        <span className="text-[11px] text-[#EEEEEE] bg-secondary px-1.5 py-0.5 rounded">
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
      <p className="text-xs text-[#EEEEEE] mt-0.5">
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
                className="grid gap-0 px-4 py-2 border-b border-border/40 text-[11px] font-bold uppercase tracking-wider text-[#EEEEEE]"
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
                    {p.icon ? (
                      <img
                        src={p.icon}
                        alt={p.name}
                        className="h-6 w-6 rounded object-cover"
                      />
                    ) : (
                      <div className="h-6 w-6 rounded bg-secondary flex items-center justify-center text-[10px] font-bold text-[#EEEEEE]">
                        {p.name.charAt(0)}
                      </div>
                    )}
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
        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-[#EEEEEE]">
          {roster.teamName} Roster
        </h3>
        <div className="grid gap-2 justify-start grid-cols-5 w-full">
          {roster.players.map((p) => (
            <div
              key={p.name}
              className="min-h-[120px] flex flex-col items-center justify-start gap-2 px-2 py-3"
            >
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-base font-bold text-[#EEEEEE]">
                {p.avatar || p.icon ? (
                  <img
                    src={p.avatar || p.icon}
                    alt={p.name}
                    className="h-full w-full rounded-lg object-cover"
                  />
                ) : (
                  <span>{p.name.charAt(0)}</span>
                )}
              </div>
              <div className="text-center w-full">
                <div className="flex items-center justify-center gap-1">
                  <span className="text-[11px] font-bold text-foreground truncate max-w-[72px]">
                    {p.name}
                  </span>
                </div>
                {p.role && (
                  <span className="text-[9px] text-[#EEEEEE] truncate block">
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
  const { user, token } = useAuth();
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
  const tournamentId = toNumber(tournament?.id);

  const { data: tournamentMatchBundle, isLoading: isMatchListLoading } =
    useQuery({
      queryKey: ["tournament-match-list-all-brackets", tournamentId],
      enabled: Boolean(tournamentId),
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
      refetchInterval: 5000,
      queryFn: async () => {
        const bracketsResponse = await getBracketsByTournamentId(tournamentId!);
        const bracketIds = (bracketsResponse.data?.data ?? [])
          .map((bracket) => toNumber(bracket.id))
          .filter((bracketId): bracketId is number => bracketId !== null);

        if (!bracketIds.length) {
          return { matches: [] as Match[] };
        }

        const matchResponses = await Promise.all(
          bracketIds.map((bracketId) => getMatchesByBracketId(bracketId)),
        );

        const mergedMatches = matchResponses.flatMap(
          (response) => response.data?.data ?? [],
        );

        const dedupedMatches = Array.from(
          new Map(
            mergedMatches.map((item) => [toNumber(item.id) ?? item.id, item]),
          ).values(),
        );

        return {
          matches: dedupedMatches,
        };
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

  const currentMatchTeamIds = useMemo(() => {
    const leftTeamId =
      toNumber(currentMatchRow?.team_a?.id) ??
      toNumber(currentMatchRow?.team_a_id);
    const rightTeamId =
      toNumber(currentMatchRow?.team_b?.id) ??
      toNumber(currentMatchRow?.team_b_id);

    return {
      team1TeamId: leftTeamId,
      team2TeamId: rightTeamId,
    };
  }, [currentMatchRow]);

  const tournamentTeamIdByTeamId = useMemo(() => {
    const map = new Map<number, number>();

    (tournament?.registered ?? []).forEach((entry) => {
      const teamId = toNumber(entry.team_id);
      const tournamentTeamId = toNumber(entry.id);

      if (teamId === null || tournamentTeamId === null) return;
      map.set(teamId, tournamentTeamId);
    });

    return map;
  }, [tournament?.registered]);

  const linkedTournamentTeamIds = useMemo(
    () => ({
      team1TournamentTeamId:
        currentMatchTeamIds.team1TeamId !== null
          ? (tournamentTeamIdByTeamId.get(currentMatchTeamIds.team1TeamId) ??
            null)
          : null,
      team2TournamentTeamId:
        currentMatchTeamIds.team2TeamId !== null
          ? (tournamentTeamIdByTeamId.get(currentMatchTeamIds.team2TeamId) ??
            null)
          : null,
    }),
    [currentMatchTeamIds, tournamentTeamIdByTeamId],
  );

  const { data: linkedTeamPlayers } = useQuery({
    queryKey: [
      "match-linked-team-players",
      linkedTournamentTeamIds.team1TournamentTeamId,
      linkedTournamentTeamIds.team2TournamentTeamId,
    ],
    enabled: Boolean(
      linkedTournamentTeamIds.team1TournamentTeamId ||
      linkedTournamentTeamIds.team2TournamentTeamId,
    ),
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [team1Response, team2Response] = await Promise.all([
        linkedTournamentTeamIds.team1TournamentTeamId
          ? getTournamentTeamPlayers(
              linkedTournamentTeamIds.team1TournamentTeamId,
            )
          : Promise.resolve(null),
        linkedTournamentTeamIds.team2TournamentTeamId
          ? getTournamentTeamPlayers(
              linkedTournamentTeamIds.team2TournamentTeamId,
            )
          : Promise.resolve(null),
      ]);

      const team1PlayersRaw = extractTournamentTeamPlayers(team1Response?.data);
      const team2PlayersRaw = extractTournamentTeamPlayers(team2Response?.data);

      const [team1Players, team2Players] = await Promise.all([
        hydrateLinkedPlayersWithUserProfiles(team1PlayersRaw),
        hydrateLinkedPlayersWithUserProfiles(team2PlayersRaw),
      ]);

      return {
        team1Players,
        team2Players,
      };
    },
  });

  const linkedTeamContext = useMemo(() => {
    const context = createEmptyLinkedTeamContext();
    context.team1Players = linkedTeamPlayers?.team1Players ?? [];
    context.team2Players = linkedTeamPlayers?.team2Players ?? [];

    const collectRiotAccounts = (
      players: TournamentTeamPlayersResponse["players"],
      side: TeamSide,
    ) => {
      players?.forEach((player) => {
        const riotAccount = normalizeRiotAccount(player?.riot_account);
        if (!riotAccount) return;

        if (side === "team1") {
          context.team1RiotAccounts.add(riotAccount);
        } else {
          context.team2RiotAccounts.add(riotAccount);
        }

        const nickname = String(player?.nickname ?? "").trim();
        if (nickname && !context.nicknameByRiotAccount.has(riotAccount)) {
          context.nicknameByRiotAccount.set(riotAccount, nickname);
        }

        const avatar = String(player?.profile_picture ?? "").trim();
        if (avatar && !context.avatarByRiotAccount.has(riotAccount)) {
          context.avatarByRiotAccount.set(riotAccount, avatar);
        }
      });
    };

    collectRiotAccounts(context.team1Players, "team1");
    collectRiotAccounts(context.team2Players, "team2");

    const currentUserRiotAccount = normalizeRiotAccount(user?.riot_account);
    if (currentUserRiotAccount) {
      const currentUserNickname = String(user?.nickname ?? "").trim();
      const currentUserAvatar = String(user?.profile_picture ?? "").trim();
      const currentUserTeamId = toNumber(user?.team_id);

      const inferredSide: TeamSide | null =
        currentUserTeamId !== null &&
        currentUserTeamId === currentMatchTeamIds.team1TeamId
          ? "team1"
          : currentUserTeamId !== null &&
              currentUserTeamId === currentMatchTeamIds.team2TeamId
            ? "team2"
            : null;

      if (inferredSide === "team1") {
        context.team1RiotAccounts.add(currentUserRiotAccount);
      } else if (inferredSide === "team2") {
        context.team2RiotAccounts.add(currentUserRiotAccount);
      }

      if (currentUserNickname) {
        context.nicknameByRiotAccount.set(
          currentUserRiotAccount,
          currentUserNickname,
        );
      }

      if (currentUserAvatar) {
        context.avatarByRiotAccount.set(
          currentUserRiotAccount,
          currentUserAvatar,
        );
      }
    }

    return context;
  }, [currentMatchTeamIds, linkedTeamPlayers, user]);

  const roundSlug = buildRoundSlug({
    tournamentSlug: slug,
    roundNumber: toNumber(currentMatchRow?.round_number),
    matchNo: toNumber(currentMatchRow?.match_no),
    matchId: toNumber(currentMatchRow?.id) ?? numId,
  });

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
    refetchInterval: 5000,
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
    const idsFromMatchGames = getProviderMatchIds(matchGameIds ?? [], "val")
      .map((value) => String(value).trim())
      .filter((value): value is string => Boolean(value) && isUuid(value));

    if (idsFromMatchGames.length > 0) {
      return Array.from(new Set(idsFromMatchGames));
    }

    return undefined;
  }, [matchGameIds]);

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
    enabled:
      preferredProvider === "val" &&
      Boolean(valorantApiMatchIds && valorantApiMatchIds.length > 0),
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

    const hydratedBaseMatch = hydrateRostersWithLinkedPlayers(
      baseMatch,
      linkedTeamContext,
    );

    if (preferredProvider === "tft" && tftApiData && tftApiData.length > 0) {
      return mergeTftApiIntoMatch(
        hydratedBaseMatch,
        tftApiData[0],
        linkedTeamContext,
      );
    }

    if (baseMatch.gameType === "valorant" && valorantApiData) {
      return mergeValorantApiIntoMatch(
        hydratedBaseMatch,
        valorantApiData,
        linkedTeamContext,
      );
    }

    if (preferredProvider === "val" && valorantApiData) {
      return mergeValorantApiIntoMatch(
        hydratedBaseMatch,
        valorantApiData,
        linkedTeamContext,
      );
    }

    return hydratedBaseMatch;
  }, [
    baseMatch,
    linkedTeamContext,
    preferredProvider,
    tftApiData,
    valorantApiData,
  ]);

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
  const hasEmbeddedLobby = match.gameType === "valorant" && Boolean(numId);

  const mapCursorFromGameIds = (() => {
    const items = matchGameIds ?? [];
    if (!items.length) return 0;

    const maxGameNo = items.reduce(
      (max, item) => Math.max(max, toNumber(item.game_no) ?? 0),
      0,
    );

    if (maxGameNo > 0) return maxGameNo;
    return items.length;
  })();

  const matchRoomId = String(currentMatchRow?.room_id ?? "").trim() || null;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/70 bg-[#140a16] text-foreground">
        <div className="mx-auto px-4 md:px-8 py-3 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-3">
          <div className="order-2 md:order-1 flex items-center gap-2 min-w-0">
            <Link
              to={backTo}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 px-2.5text-[#EEEEEE] hover:text-foreground hover:border-border transition-colors text-xs font-semibold"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nhánh đấu</span>
            </Link>
            {prevDetail ? (
              <div className="inline-flex items-center gap-2 min-w-0">
                <div className="text-right leading-tight">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#EEEEEE]">
                    Prev
                  </p>
                  <p className="text-[10px] text-[#EEEEEE]">
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
            <p className="text-xs md:text-[11px] lg:text-[14px] font-black uppercase tracking-[0.14em] text-primary">
              {match.tournamentName}
            </p>
            <p className="text-[11px] lg:text-[12px] text-[#EEEEEE] mt-0.5">
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
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#EEEEEE]">
                    Next
                  </p>
                  <p className="text-[10px] text-[#EEEEEE]">
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
              <p className="text-[11px] text-[#EEEEEE]">
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

      {hasEmbeddedLobby && (
        <div className="mx-auto px-4 md:px-8 py-6">
          <BanPickLobbyPanel
            roundSlug={roundSlug}
            matchId={numId}
            token={token}
            team1={match.team1}
            team2={match.team2}
            seriesScoreA={match.team1.score}
            seriesScoreB={match.team2.score}
            mapCursorFromGameIds={mapCursorFromGameIds}
            roomId={matchRoomId}
          />
        </div>
      )}

      {hasMapData && (
        <div className="mx-auto px-4 md:px-8 py-2">
          <div className="space-y-2.5">
            {match.maps?.map((map, i) => (
              <MapScoreRow key={i} map={map} team1={match.team1} team2={match.team2} />
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto px-4 md:px-8 py-8 md:py-5 space-y-6">
        {!hasRosterData && !hasMapData && !hasEmbeddedLobby ? (
          <section className="rounded-xl border border-border/70 bg-card/40 p-6 text-sm text-[#EEEEEE]">
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
