import { useParams, Link, useOutletContext, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import type { MatchDetail, RoundHistoryEntry, AovGameRoster } from "@/types/matchDetail";
import { useAuth } from "@/contexts/AuthContext";
import type { RoundBanPickPayload } from "@/api/banpick";
import PageLoader from "@/components/PageLoader";
import { TournamentSubpageHeader } from "@/components/TournamentSubpageHeader";
import {
  MatchPanelCloseButton,
  MatchPanelHeader,
} from "@/components/MatchPanel";
import { useBanPickRoom } from "@/hooks/useBanPickRoom";
import BanPickBoard from "@/components/valorant/BanPickBoard";
import ValorantMatchResult from "@/components/valorant/ValorantMatchResult";
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
  getAovMatchStats,
  type AovMatchGameStats,
  type AovMatchSeriesScore,
} from "@/api/aovStats";
import {
  getBracketsByTournamentId,
  getMatchGameIds,
  getMatchLinkedPlayers,
  getMatchesByBracketId,
  type Match,
  type MatchGameIdRecord,
  type TournamentBySlugResponse,
} from "@/api/tournaments";
import type { TournamentTeamPlayersResponse } from "@/api/tournaments/types";
import {
  assignAovPlayersAcrossTeams,
  mapAovPlayersToRoster,
  matchAovIgnToPlayer,
} from "@/lib/aovIgnMatch";
import {
  MATCH_ROSTER_PANEL_CLASS,
  MATCH_SCOREBOARD_WRAPPER_CLASS,
  TOURNAMENT_PAGE_BG_CLASS,
  TOURNAMENT_TABLE_HEADER_CLASS,
  TOURNAMENT_TABLE_HEADER_ROW_CLASS,
  TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS,
  TOURNAMENT_TEAM_TAG_BADGE_CLASS,
} from "@/components/tournamentTheme";
import MatchLineupEditor from "@/components/MatchLineupEditor";
import LolCodePanel from "@/components/LolCodePanel";
import { getMatchLineups } from "@/api/matchLineups";

// Bảng chỉ số kiểu canvas: tiêu đề chữ xám không nền, kẻ 2px màu chữ dưới tiêu đề
const MATCH_STAT_PANEL = "overflow-hidden bg-[#0B0B0B]";
const MATCH_STAT_TH =
  "px-2 py-1.5 text-center text-xs font-normal text-[#9A9893] bg-[#0B0B0B]";
const MATCH_STAT_TH_NAME =
  "sticky left-0 z-20 min-w-[120px] max-w-[140px] bg-[#0B0B0B] px-2.5 py-1.5 text-left text-[#F2F0EB] sm:min-w-[140px] sm:max-w-[180px] sm:px-3";
const MATCH_STAT_TD =
  "px-2 py-3 text-[13px] text-[#F2F0EB] text-center tabular-nums";
const MATCH_STAT_TD_NAME =
  "sticky left-0 z-10 max-w-[140px] bg-[#0B0B0B] group-hover:bg-[#151515] px-2.5 py-3 sm:max-w-[180px] sm:px-3";
const MATCH_STAT_TR = `${TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS} group`;

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
type LinkedProfileRecord = {
  nickname: string;
  avatar: string;
  username: string;
  riot_account: string;
};

type LinkedTeamContext = {
  team1Players: TournamentTeamPlayersResponse["players"];
  team2Players: TournamentTeamPlayersResponse["players"];
  team1RiotAccounts: Set<string>;
  team2RiotAccounts: Set<string>;
  /** puuid (Valorant / LMHT / TFT) của người chơi từng đội — ghép phe chắc hơn Riot ID (không đổi khi đổi tên). */
  team1Puuids: Set<string>;
  team2Puuids: Set<string>;
  profileByPuuid: Map<string, { nickname?: string; avatar?: string }>;
  nicknameByRiotAccount: Map<string, string>;
  avatarByRiotAccount: Map<string, string>;
  nicknameByUsername: Map<string, string>;
  avatarByUsername: Map<string, string>;
  profileByKey: Map<string, LinkedProfileRecord>;
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

const normalizeUsernameKey = (value?: string | null) =>
  String(value ?? "").trim().toLowerCase();

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
  team1Puuids: new Set(),
  team2Puuids: new Set(),
  profileByPuuid: new Map(),
  nicknameByRiotAccount: new Map(),
  avatarByRiotAccount: new Map(),
  nicknameByUsername: new Map(),
  avatarByUsername: new Map(),
  profileByKey: new Map(),
});

const collectProfileKeys = (value?: string | null): string[] => {
  const keys = new Set<string>();
  const usernameKey = normalizeUsernameKey(value);
  if (usernameKey) keys.add(usernameKey);

  const riotKey = normalizeRiotAccount(value);
  if (riotKey) {
    keys.add(riotKey);
    const [gameNamePart] = riotKey.split("#");
    if (gameNamePart) keys.add(gameNamePart);
  }

  return Array.from(keys);
};

const buildLinkedProfileIndex = (
  players: TournamentTeamPlayersResponse["players"] | undefined,
): Map<string, LinkedProfileRecord> => {
  const index = new Map<string, LinkedProfileRecord>();

  players?.forEach((player) => {
    const record: LinkedProfileRecord = {
      nickname: String(player?.nickname ?? "").trim(),
      avatar: String(player?.profile_picture ?? "").trim(),
      username: String(player?.username ?? "").trim(),
      riot_account: String(player?.riot_account ?? "").trim(),
    };

    if (!record.avatar && !record.nickname && !record.username) {
      return;
    }

    const aliasKeys = [
      ...collectProfileKeys(record.username),
      ...collectProfileKeys(record.nickname),
      ...collectProfileKeys(record.riot_account),
    ];

    aliasKeys.forEach((key) => {
      if (!index.has(key)) {
        index.set(key, record);
      }
    });
  });

  return index;
};

const registerPlayerProfileAliases = (
  context: LinkedTeamContext,
  aliases: Array<string | undefined | null>,
  nickname: string,
  avatar: string,
) => {
  const keys = new Set<string>();

  aliases.forEach((alias) => {
    const usernameKey = normalizeUsernameKey(alias);
    if (usernameKey) keys.add(usernameKey);

    const riotAccount = normalizeRiotAccount(alias);
    if (riotAccount) {
      keys.add(riotAccount);
      const [gameNamePart] = riotAccount.split("#");
      if (gameNamePart) keys.add(gameNamePart);
    }
  });

  keys.forEach((key) => {
    if (nickname && !context.nicknameByUsername.has(key)) {
      context.nicknameByUsername.set(key, nickname);
    }
    if (avatar && !context.avatarByUsername.has(key)) {
      context.avatarByUsername.set(key, avatar);
    }

    const riotAccount = normalizeRiotAccount(key);
    if (!riotAccount) return;

    if (nickname && !context.nicknameByRiotAccount.has(riotAccount)) {
      context.nicknameByRiotAccount.set(riotAccount, nickname);
    }
    if (avatar && !context.avatarByRiotAccount.has(riotAccount)) {
      context.avatarByRiotAccount.set(riotAccount, avatar);
    }
  });
};

const lookupLinkedProfile = (
  linkedContext: LinkedTeamContext,
  candidates: Array<string | undefined | null>,
): { nickname?: string; avatar?: string } => {
  const lookupKeys = new Set<string>();
  candidates.forEach((candidate) => {
    collectProfileKeys(candidate).forEach((key) => lookupKeys.add(key));
  });

  for (const key of lookupKeys) {
    const hit = linkedContext.profileByKey.get(key);
    if (hit?.avatar || hit?.nickname) {
      return {
        nickname: hit.nickname || undefined,
        avatar: hit.avatar || undefined,
      };
    }
  }

  for (const key of lookupKeys) {
    const nickname = linkedContext.nicknameByUsername.get(key);
    const avatar = linkedContext.avatarByUsername.get(key);
    if (nickname || avatar) {
      return { nickname, avatar };
    }

    const riotNickname = linkedContext.nicknameByRiotAccount.get(key);
    const riotAvatar = linkedContext.avatarByRiotAccount.get(key);
    if (riotNickname || riotAvatar) {
      return { nickname: riotNickname, avatar: riotAvatar };
    }
  }

  const normalizedPlayerRiots = candidates
    .map((candidate) => normalizeRiotAccount(candidate))
    .filter(Boolean);

  if (normalizedPlayerRiots.length > 0) {
    for (const record of linkedContext.profileByKey.values()) {
      const recordRiot = normalizeRiotAccount(record.riot_account);
      if (recordRiot && normalizedPlayerRiots.includes(recordRiot)) {
        return {
          nickname: record.nickname || undefined,
          avatar: record.avatar || undefined,
        };
      }
    }
  }

  return {};
};

const findLinkedProfileForRosterPlayer = (
  player: MatchDetail["team1Roster"]["players"][number],
  linkedContext: LinkedTeamContext,
): { nickname?: string; avatar?: string } => {
  const riotAccount = String(player.riotAccount ?? "").trim();
  const displayName = String(player.name ?? "").trim();

  if (riotAccount.includes("#")) {
    const [gameName, ...tagParts] = riotAccount.split("#");
    const tagLine = tagParts.join("#");
    const fromRiotId = lookupLinkedProfile(linkedContext, [
      riotAccount,
      buildRiotAccount(gameName, tagLine),
      gameName,
      tagLine,
      displayName,
    ]);
    if (fromRiotId.avatar || fromRiotId.nickname) {
      return fromRiotId;
    }
  }

  return lookupLinkedProfile(linkedContext, [
    riotAccount,
    displayName,
    buildRiotAccount(displayName, undefined),
  ]);
};

/** Fuzzy fallback when IGN lệch nickname/username trên hệ thống */
const findLinkedProfileForAovIgn = (
  ign: string,
  sidePlayers: NonNullable<LinkedTeamContext["team1Players"]>,
  linkedContext: LinkedTeamContext,
): { nickname?: string; avatar?: string } => {
  const exact = lookupLinkedProfile(linkedContext, [ign]);
  if (exact.avatar || exact.nickname) return exact;

  const hit = matchAovIgnToPlayer(ign, sidePlayers);
  if (!hit) return {};

  return {
    nickname:
      String(hit.player.nickname ?? "").trim() ||
      String(hit.player.username ?? "").trim() ||
      undefined,
    avatar: String(hit.player.profile_picture ?? "").trim() || undefined,
  };
};

const findLinkedProfileFromValorantPlayer = (
  player: ValorantApiPlayer,
  linkedContext: LinkedTeamContext,
): { nickname?: string; avatar?: string } => {
  const byPuuid = player.puuid ? linkedContext.profileByPuuid.get(player.puuid) : undefined;
  if (byPuuid?.nickname || byPuuid?.avatar) return byPuuid;
  return lookupLinkedProfile(linkedContext, [
    buildRiotAccount(player.gameName, player.tagLine),
    player.gameName,
    player.tagLine,
  ]);
};

const enrichRosterWithLinkedProfiles = (
  roster: MatchDetail["team1Roster"],
  linkedContext: LinkedTeamContext,
): MatchDetail["team1Roster"] => ({
  ...roster,
  players: roster.players.map((player) => {
    const linked = findLinkedProfileForRosterPlayer(player, linkedContext);
    const avatar = linked.avatar || player.avatar;
    const name = linked.nickname || player.name;

    return {
      ...player,
      name,
      avatar: avatar || undefined,
    };
  }),
});

const enrichMatchWithLinkedProfiles = (
  sourceMatch: MatchDetail,
  linkedContext: LinkedTeamContext,
): MatchDetail => {
  const hasLinkedPlayers =
    (linkedContext.team1Players?.length ?? 0) > 0 ||
    (linkedContext.team2Players?.length ?? 0) > 0;

  if (!hasLinkedPlayers) {
    return sourceMatch;
  }

  const enrichAovSideRoster = (
    roster: MatchDetail["team1Roster"],
    sidePlayers: NonNullable<LinkedTeamContext["team1Players"]>,
  ) => {
    const mapped = mapAovPlayersToRoster(
      (roster.players ?? []).map((player) => ({ ign: player.name })),
      sidePlayers,
    );

    return {
      ...roster,
      players: (roster.players ?? []).map((player, index) => {
        const hit = mapped[index];
        const linkedPlayer = sidePlayers.find(
          (entry) =>
            hit?.matched_user_id != null &&
            String(entry.user_id) === String(hit.matched_user_id),
        );
        const mappedName = hit?.ign || player.name;
        let linked = findLinkedProfileForRosterPlayer(
          { ...player, name: mappedName },
          linkedContext,
        );
        if (!linked.nickname && !linked.avatar) {
          linked = findLinkedProfileForAovIgn(
            String(player.name ?? ""),
            sidePlayers,
            linkedContext,
          );
        }

        return {
          ...player,
          name: mappedName || linked.nickname || player.name,
          avatar:
            linkedPlayer?.profile_picture ||
            linked.avatar ||
            player.avatar,
          icon:
            linkedPlayer?.profile_picture ||
            linked.avatar ||
            (isNumberedPlayerPlaceholder(player.icon)
              ? undefined
              : player.icon),
        };
      }),
    };
  };

  const redistributeAovGameToTeams = (
    game: NonNullable<MatchDetail["aovGameRosters"]>[number],
  ) => {
    const team1Players = linkedContext.team1Players ?? [];
    const team2Players = linkedContext.team2Players ?? [];

    const toIgnRow = (player: (typeof game.team1Roster.players)[number]) => ({
      ...player,
      ign: String(player.originalIgn || player.name || "").trim(),
      matched_from_ign: String(player.originalIgn || "").trim() || null,
    });

    const assigned = assignAovPlayersAcrossTeams({
      bluePlayers: (game.team1Roster?.players ?? []).map(toIgnRow),
      redPlayers: (game.team2Roster?.players ?? []).map(toIgnRow),
      teamAPlayers: team1Players,
      teamBPlayers: team2Players,
    });

    const toDisplayPlayer = (
      row: (typeof assigned.blue)[number],
      sidePlayers: typeof team1Players,
    ) => {
      const linkedPlayer = sidePlayers.find(
        (entry) =>
          row.matched_user_id != null &&
          String(entry.user_id) === String(row.matched_user_id),
      );
      const hit =
        linkedPlayer ||
        matchAovIgnToPlayer(
          row.matched_from_ign || row.ign || row.name,
          sidePlayers,
        )?.player;

      const displayName =
        String(linkedPlayer?.nickname ?? "").trim() ||
        String(linkedPlayer?.username ?? "").trim() ||
        String(hit?.nickname ?? "").trim() ||
        String(hit?.username ?? "").trim() ||
        String(row.ign ?? "").trim() ||
        row.name;

      const avatar =
        String(linkedPlayer?.profile_picture ?? "").trim() ||
        String(hit?.profile_picture ?? "").trim() ||
        String(row.avatar ?? "").trim() ||
        undefined;

      return {
        ...row,
        name: displayName,
        originalIgn: row.matched_from_ign || row.originalIgn || undefined,
        avatar,
        icon: avatar || (isNumberedPlayerPlaceholder(row.icon) ? undefined : row.icon),
      };
    };

    return {
      ...game,
      team1Kills: assigned.swapped ? game.team2Kills : game.team1Kills,
      team2Kills: assigned.swapped ? game.team1Kills : game.team2Kills,
      team1Won:
        assigned.swapped && game.team1Won != null
          ? !game.team1Won
          : game.team1Won,
      team1Side: assigned.swapped
        ? game.team1Side === "red"
          ? "blue"
          : "red"
        : game.team1Side,
      team1Roster: {
        ...game.team1Roster,
        players: assigned.blue.map((row) => toDisplayPlayer(row, team1Players)),
      },
      team2Roster: {
        ...game.team2Roster,
        players: assigned.red.map((row) => toDisplayPlayer(row, team2Players)),
      },
    };
  };

  const aovGameRosters = sourceMatch.aovGameRosters?.map((game) =>
    redistributeAovGameToTeams(game),
  );
  const firstAov = aovGameRosters?.[0];

  return {
    ...sourceMatch,
    team1Roster: firstAov
      ? firstAov.team1Roster
      : enrichAovSideRoster(
          enrichRosterWithLinkedProfiles(sourceMatch.team1Roster, linkedContext),
          linkedContext.team1Players ?? [],
        ),
    team2Roster: firstAov
      ? firstAov.team2Roster
      : enrichAovSideRoster(
          enrichRosterWithLinkedProfiles(sourceMatch.team2Roster, linkedContext),
          linkedContext.team2Players ?? [],
        ),
    fpsMapRosters: sourceMatch.fpsMapRosters?.map((mapRoster) => ({
      ...mapRoster,
      team1Roster: enrichRosterWithLinkedProfiles(
        mapRoster.team1Roster,
        linkedContext,
      ),
      team2Roster: enrichRosterWithLinkedProfiles(
        mapRoster.team2Roster,
        linkedContext,
      ),
    })),
    aovGameRosters,
    maps: aovGameRosters?.length
      ? aovGameRosters.map((game) => ({
          mapName: game.label,
          team1Score: game.team1Kills,
          team2Score: game.team2Kills,
        }))
      : sourceMatch.maps,
  };
};

const getRosterPlayerPortrait = (
  player: MatchDetail["team1Roster"]["players"][number],
  linkedContext?: LinkedTeamContext,
  preferUserAvatar = true,
): string | undefined => {
  const linked = linkedContext
    ? findLinkedProfileForRosterPlayer(player, linkedContext)
    : {};
  const userAvatar = linked.avatar || player.avatar;

  if (preferUserAvatar && userAvatar) {
    return userAvatar;
  }

  return player.icon || userAvatar;
};

const resolveLinkedProfileFromMatchRiotId = (
  gameName: string | undefined,
  tagLine: string | undefined,
  linkedContext: LinkedTeamContext,
): { nickname?: string; avatar?: string } =>
  lookupLinkedProfile(linkedContext, [
    buildRiotAccount(gameName, tagLine),
    gameName,
    tagLine,
  ]);

const isLinkedTournamentPlayer = (
  value: unknown,
): value is NonNullable<TournamentTeamPlayersResponse["players"]>[number] => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.user_id === "number" ||
    typeof candidate.user_id === "string" ||
    typeof candidate.username === "string" ||
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
  if (
    ["aov", "arenaofvalor", "arena_of_valor", "lienquan", "lq"].includes(
      normalized,
    )
  )
    return "aov";

  return normalized;
};

const resolveGameType = (value?: string): MatchDetail["gameType"] => {
  const normalized = normalizeGameSlug(value);

  if (normalized === "val") return "valorant";
  if (normalized === "lol") return "lol";
  if (normalized === "tft") return "tft";
  if (normalized === "wildrift") return "wildrift";
  if (normalized === "aov") return "aov";

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

/** Avatar số placehold.co — không dùng làm ảnh người chơi */
const isNumberedPlayerPlaceholder = (url?: string | null): boolean => {
  const raw = String(url ?? "").trim().toLowerCase();
  if (!raw) return false;
  return (
    raw.includes("placehold.co/") &&
    (/[?&]text=\d+(\b|&|$)/.test(raw) || /text=%3[0-9]/.test(raw))
  );
};

const resolvePlayerAvatarUrl = (player: {
  avatar?: string | null;
  icon?: string | null;
}): string | undefined => {
  const avatar = String(player.avatar ?? "").trim();
  if (avatar && !isNumberedPlayerPlaceholder(avatar)) return avatar;

  const icon = String(player.icon ?? "").trim();
  if (icon && !isNumberedPlayerPlaceholder(icon)) return icon;

  return undefined;
};

const PlayerStatAvatar = ({
  player,
  imgClassName = "h-5 w-5 shrink-0 rounded-sm object-cover sm:h-6 sm:w-6",
  fallbackClassName = "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-neutral-800 text-[10px] font-bold text-neutral-300 sm:h-6 sm:w-6 sm:text-[11px]",
}: {
  player: { avatar?: string | null; icon?: string | null; name?: string };
  imgClassName?: string;
  fallbackClassName?: string;
}) => {
  const [failed, setFailed] = useState(false);
  const src = resolvePlayerAvatarUrl(player);
  const initial =
    String(player.name ?? "?").trim().charAt(0).toUpperCase() || "?";

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        className={imgClassName}
        onError={() => setFailed(true)}
      />
    );
  }

  return <div className={fallbackClassName}>{initial}</div>;
};

const buildMatchDetailFromApi = ({
  match,
  tournament,
  normalizedRouteGame,
  bracketName,
}: {
  match: Match;
  tournament?: TournamentBySlugResponse["info"];
  normalizedRouteGame: string;
  bracketName?: string | null;
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
  const resolvedBracketName = String(bracketName ?? "").trim();

  return {
    id: String(match.id),
    tournamentName: String(tournament?.name ?? "Tournament"),
    roundName:
      roundNumber && matchNo
        ? `Round ${roundNumber} - Match ${matchNo}`
        : roundNumber
          ? `Round ${roundNumber}`
          : `Match ${match.id}`,
    format: resolvedBracketName || String(tournament?.format ?? ""),
    date:
      scheduledDate ||
      String(tournament?.date_start ?? "").slice(0, 10) ||
      new Date().toISOString().slice(0, 10),
    gameType,
    status: String(match.status ?? "").trim() || undefined,
    roomId: String(match.room_id ?? "").trim() || null,
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
    statTabs:
      gameType === "valorant"
        ? ["All Maps"]
        : gameType === "aov"
          ? []
          : ["All Games"],
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
  const avatar = String(player?.profile_picture ?? "").trim() || undefined;

  return {
    name: normalizedNickname || normalizedRiot || `Player ${fallbackIndex + 1}`,
    riotAccount: normalizedRiot || undefined,
    icon: avatar,
    avatar,
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
      const participantPuuid = String(
        (participant as { puuid?: string | null }).puuid ?? "",
      ).trim();
      const inferredSide: TeamSide | null =
        (participantPuuid && linkedContext.team1Puuids.has(participantPuuid)) ||
        linkedContext.team1RiotAccounts.has(normalizedRiotAccount)
          ? "team1"
          : (participantPuuid && linkedContext.team2Puuids.has(participantPuuid)) ||
              linkedContext.team2RiotAccounts.has(normalizedRiotAccount)
            ? "team2"
            : null;
      const name =
        linkedNickname ||
        (gameName && tagLine
          ? `${gameName}#${tagLine}`
          : gameName || `Player ${index + 1}`);

      return {
        name,
        riotAccount: riotAccount || undefined,
        icon: linkedAvatar || undefined,
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
  provider: "val" | "lol" | "tft" | "aov",
) => {
  const ids = gameIds
    .filter((item) => {
      const infoGameId = String(item.info_game_id ?? "").trim();
      if (provider === "aov") {
        if (/^aov:/i.test(infoGameId)) return true;
        // staging đôi khi lưu thiếu prefix
        if (
          /^[a-z0-9]{10,}$/i.test(infoGameId) &&
          !infoGameId.includes("-") &&
          !infoGameId.includes(".")
        ) {
          return true;
        }
      }

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

const toAovPlayerStat = (
  player: AovMatchGameStats["players"][number],
  index: number,
) => {
  const displayName = String(player.ign ?? "").trim() || `Player ${index + 1}`;
  const originalIgn =
    String(player.matched_from_ign ?? "").trim() || displayName;
  const avatar =
    String(
      (player as { profile_picture?: string | null }).profile_picture ?? "",
    ).trim() || undefined;

  return {
    name: displayName,
    originalIgn,
    icon: avatar,
    avatar,
    kills: toNumber(player.kills) ?? 0,
    deaths: toNumber(player.deaths) ?? 0,
    assists: toNumber(player.assists) ?? 0,
    performanceScore: toNumber(player.performance_score) ?? undefined,
    gold: toNumber(player.gold) ?? undefined,
  };
};

const linkedPlayersAsAovStats = (
  players: TournamentTeamPlayersResponse["players"] | undefined,
) =>
  (players ?? []).map((player, index) =>
    toTeamPlayerStat(player, index),
  );

const mergeAovStatsIntoMatch = (
  baseMatch: MatchDetail,
  games: AovMatchGameStats[],
  linkedContext?: LinkedTeamContext,
): MatchDetail => {
  if (!games.length) return baseMatch;

  const sortedGames = [...games].sort(
    (a, b) => (toNumber(a.game_no) ?? 0) - (toNumber(b.game_no) ?? 0),
  );

  const fallbackTeam1 = linkedPlayersAsAovStats(linkedContext?.team1Players);
  const fallbackTeam2 = linkedPlayersAsAovStats(linkedContext?.team2Players);

  const aovGameRosters: AovGameRoster[] = sortedGames.map((game) => {
    const bluePlayers = (game.players ?? []).filter(
      (player) => player.team_side === "blue",
    );
    const redPlayers = (game.players ?? []).filter(
      (player) => player.team_side === "red",
    );

    const team1FromStats = bluePlayers.map((player, index) =>
      toAovPlayerStat(player, index),
    );
    const team2FromStats = redPlayers.map((player, index) =>
      toAovPlayerStat(player, index),
    );

    // Ưu tiên stats thật; nếu thiếu 1 bên thì bổ sung roster đăng ký
    const team1Players =
      team1FromStats.length > 0 ? team1FromStats : fallbackTeam1;
    const team2Players =
      team2FromStats.length > 0 ? team2FromStats : fallbackTeam2;

    // team1 = phe xanh (cùng quy ước với team1Kills = team_a_score = blue_kills)
    const team1Kills = toNumber(game.team_a_score) ?? 0;
    const team2Kills = toNumber(game.team_b_score) ?? 0;
    const winnerSide = game.aov?.winner_side;
    const team1Won =
      winnerSide === "blue" || winnerSide === "red"
        ? winnerSide === "blue"
        : null;

    return {
      label: `Ván ${game.game_no}`,
      team1Kills,
      team2Kills,
      durationSec: toNumber(game.aov?.duration_sec) ?? null,
      team1Won,
      team1Side: "blue",
      team1Roster: {
        ...baseMatch.team1Roster,
        players: team1Players,
      },
      team2Roster: {
        ...baseMatch.team2Roster,
        players: team2Players,
      },
    };
  });

  const maps = aovGameRosters.map((game) => ({
    mapName: game.label,
    team1Score: game.team1Kills,
    team2Score: game.team2Kills,
  }));

  const firstGame = aovGameRosters[0];

  return {
    ...baseMatch,
    gameType: "aov",
    maps,
    // Series score luôn lấy từ Score Control (score_a/score_b), không đếm từ kill từng ván
    team1: {
      ...baseMatch.team1,
      score: toNumber(baseMatch.team1.score) ?? 0,
    },
    team2: {
      ...baseMatch.team2,
      score: toNumber(baseMatch.team2.score) ?? 0,
    },
    team1Roster: firstGame?.team1Roster ?? {
      ...baseMatch.team1Roster,
      players:
        baseMatch.team1Roster.players.length > 0
          ? baseMatch.team1Roster.players
          : fallbackTeam1,
    },
    team2Roster: firstGame?.team2Roster ?? {
      ...baseMatch.team2Roster,
      players:
        baseMatch.team2Roster.players.length > 0
          ? baseMatch.team2Roster.players
          : fallbackTeam2,
    },
    aovGameRosters,
    statTabs: aovGameRosters.map((game) => game.label),
  };
};

const buildRosterOnlyAovGames = (
  baseMatch: MatchDetail,
  linkedContext: LinkedTeamContext,
  gameCount = 1,
): MatchDetail => {
  const team1Players = linkedPlayersAsAovStats(linkedContext.team1Players);
  const team2Players = linkedPlayersAsAovStats(linkedContext.team2Players);
  const count = Math.max(1, gameCount);

  const aovGameRosters: AovGameRoster[] = Array.from({ length: count }, (_, i) => ({
    label: count > 1 ? `Ván ${i + 1}` : "Đội hình",
    team1Kills: 0,
    team2Kills: 0,
    team1Roster: {
      ...baseMatch.team1Roster,
      players: team1Players,
    },
    team2Roster: {
      ...baseMatch.team2Roster,
      players: team2Players,
    },
  }));

  return {
    ...baseMatch,
    gameType: "aov",
    aovGameRosters,
    team1Roster: {
      ...baseMatch.team1Roster,
      players:
        baseMatch.team1Roster.players.length > 0
          ? baseMatch.team1Roster.players
          : team1Players,
    },
    team2Roster: {
      ...baseMatch.team2Roster,
      players:
        baseMatch.team2Roster.players.length > 0
          ? baseMatch.team2Roster.players
          : team2Players,
    },
    statTabs: aovGameRosters.map((game) => game.label),
  };
};

const looksLikeAovStagingId = (value?: string | null) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;
  if (/^aov:/i.test(trimmed)) return true;
  return (
    /^[a-z0-9]{10,}$/i.test(trimmed) &&
    !trimmed.includes("-") &&
    !trimmed.includes(".")
  );
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
      const puuid = String(player.puuid ?? "").trim();
      if (!riotAccount && !puuid) return;

      const playerTeamId = normalizeTeamId(player.teamId);
      // puuid không đổi khi đổi tên Riot → ưu tiên; không có thì so Riot ID
      const inTeam1 =
        (puuid && linkedContext.team1Puuids.has(puuid)) ||
        (riotAccount && linkedContext.team1RiotAccounts.has(riotAccount));
      const inTeam2 =
        (puuid && linkedContext.team2Puuids.has(puuid)) ||
        (riotAccount && linkedContext.team2RiotAccounts.has(riotAccount));

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
  linkedContext: LinkedTeamContext,
): MatchDetail["team1Roster"] => ({
  ...baseRoster,
  players: Array.from(
    players
      .reduce(
        (acc, player) => {
          const rawRiotAccount = buildRiotAccount(
            player.gameName,
            player.tagLine,
          );
          const riotAccount = normalizeRiotAccount(rawRiotAccount);
          const key =
            riotAccount ||
            `${String(player.gameName ?? "")}-${String(player.tagLine ?? "")}-${String(player.characterName ?? "")}`
              .toLowerCase()
              .trim();
          const linkedProfile = findLinkedProfileFromValorantPlayer(
            player,
            linkedContext,
          );
          const linkedNickname = linkedProfile.nickname;
          const linkedAvatar = linkedProfile.avatar;
          const stats = player.stats ?? {};
          const current = acc.get(key) ?? {
            name:
              linkedNickname ||
              String(player.gameName ?? "").trim() ||
              riotAccount ||
              "Unknown",
            riotAccount: rawRiotAccount || undefined,
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

          if (rawRiotAccount) {
            current.riotAccount = rawRiotAccount;
          }

          acc.set(key, current);
          return acc;
        },
        new Map<
          string,
          {
            name: string;
            riotAccount?: string;
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
      riotAccount: player.riotAccount,
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

    // team1 luôn là "Blue" trong dữ liệu gửi cho ValorantMatchResult
    const team1IsBlue =
      normalizeTeamId(effectiveSideMapping?.team1ApiTeamId ?? "Red") === "blue";
    const swapSide = (value?: string) => {
      const id = normalizeTeamId(value);
      return id === "blue" ? "Red" : id === "red" ? "Blue" : value;
    };
    const normalizedGame: ValorantApiMatchData = team1IsBlue
      ? apiData
      : {
          ...apiData,
          players: apiData.players?.map((player) => ({
            ...player,
            teamId: swapSide(player.teamId) ?? player.teamId,
          })),
          teams: apiData.teams?.map((team) => ({
            ...team,
            teamId: swapSide(team.teamId) ?? team.teamId,
          })),
          roundResults: apiData.roundResults?.map((round) => ({
            ...round,
            winningTeam: swapSide(round.winningTeam),
          })),
        };

    return {
      apiData,
      normalizedGame,
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
              linkedContext,
            )
          : baseMatch.team1Roster,
      team2Roster:
        mapTeam2Players.length > 0
          ? buildValorantRosterFromApi(
              baseMatch.team2Roster,
              mapTeam2Players,
              linkedContext,
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
    valorantGames: mappedMatches.map((mappedMatch) => mappedMatch.normalizedGame),
    team1Roster:
      team1Players.length > 0
        ? buildValorantRosterFromApi(
            baseMatch.team1Roster,
            team1Players,
            linkedContext,
          )
        : baseMatch.team1Roster,
    team2Roster:
      team2Players.length > 0
        ? buildValorantRosterFromApi(
            baseMatch.team2Roster,
            team2Players,
            linkedContext,
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
    <div className="relative h-12 overflow-hidden border border-neutral-700 bg-[#141414] sm:h-14">
      <div className="absolute inset-0">
        <img src={bgImg} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[#0a0a0a]/80" />
      </div>

      <div className="relative z-10 grid h-full w-full grid-cols-[1fr_auto_1fr] items-center px-3 sm:px-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <img src={team1.logo} alt="" className="h-5 w-5 object-cover" />
          <span
            className={`text-base font-black tabular-nums sm:text-lg ${t1Win ? "text-primary" : "text-muted-foreground"}`}
          >
            {map.team1Score}
          </span>
        </div>

        <span className="min-w-[4.5rem] px-2 py-1 text-center text-[10px] font-extrabold uppercase tracking-[0.16em] text-foreground sm:min-w-33 sm:px-3 sm:text-[11px] sm:tracking-[0.22em]">
          {map.mapName}
        </span>

        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <span
            className={`text-base font-black tabular-nums sm:text-lg ${!t1Win ? "text-primary" : "text-muted-foreground"}`}
          >
            {map.team2Score}
          </span>
          <img src={team2.logo} alt="" className="h-5 w-5 object-cover" />
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
              className="rounded-lg px-3 py-2"
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
                    className={`inline-flex h-6 items-center rounded-md border px-2 text-[10px] font-extrabold uppercase  ${badgeClass}`}
                  >
                    {item.type}
                  </span>

                  {team && (
                    <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1">
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

const isCompletedMatchStatus = (value?: string | null) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return normalized === "complete" || normalized === "completed";
};

const getPickedMapIdsFromSession = (
  payload?: RoundBanPickPayload | null,
): string[] => {
  if (!payload?.state) return [];

  const fromActionLog = (payload.state.actionLog ?? [])
    .filter((entry) =>
      String(entry.action ?? "")
        .trim()
        .toLowerCase()
        .includes("pick"),
    )
    .slice()
    .sort((a, b) => Number(a.step ?? 0) - Number(b.step ?? 0))
    .map((entry) => String(entry.mapId ?? "").trim())
    .filter(Boolean);

  const fromState = (payload.state.maps ?? [])
    .filter(
      (mapState) => mapState.status === "picked" || mapState.status === "decider",
    )
    .map((mapState) => String(mapState.mapId ?? "").trim())
    .filter(Boolean);

  return Array.from(new Set([...fromActionLog, ...fromState]));
};

const MatchRosterPlayerChip = ({
  player,
  index,
  teamTag,
  showRiotMeta = false,
  linkedContext,
}: {
  player: MatchDetail["team1Roster"]["players"][number];
  index: number;
  teamTag: string;
  showRiotMeta?: boolean;
  linkedContext?: LinkedTeamContext;
}) => {
  const displayName = String(player.name ?? "").trim();
  const riotAccount = String(player.riotAccount ?? "").trim();
  const shouldShowRiot =
    showRiotMeta &&
    Boolean(riotAccount) &&
    riotAccount.toLowerCase() !== displayName.toLowerCase();
  const portrait = getRosterPlayerPortrait(player, linkedContext, true);

  return (
    <div
      key={`${teamTag}-${player.name}-${index}`}
      className="mx-auto flex w-full min-w-0 flex-col items-center gap-2 text-center"
      title={shouldShowRiot ? riotAccount : displayName}
    >
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden sm:h-[4.5rem] sm:w-[4.5rem]">
        {portrait ? (
          <img
            src={portrait}
            alt={displayName || "player"}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-[#2d2d2d] text-base font-bold uppercase text-neutral-300 sm:text-lg">
            {(displayName || "P").charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <p className="w-full text-xs font-bold leading-snug text-white break-words [overflow-wrap:anywhere] sm:text-sm">
        {displayName || `P${index + 1}`}
      </p>
      {player.role ? (
        <p className="w-full text-[10px] font-semibold uppercase leading-snug tracking-wide text-neutral-500 break-words [overflow-wrap:anywhere]">
          {player.role}
        </p>
      ) : null}
    </div>
  );
};

const MatchRosterLineupGrid = ({
  players,
  teamTag,
  showRiotMeta = false,
  slotCount,
  linkedContext,
}: {
  players: MatchDetail["team1Roster"]["players"];
  teamTag: string;
  showRiotMeta?: boolean;
  slotCount?: number;
  linkedContext?: LinkedTeamContext;
}) => {
  const lineup =
    slotCount === undefined ? players : players.slice(0, slotCount);

  if (lineup.length === 0) {
    return (
      <p className="px-4 py-4 text-xs text-neutral-500">Chưa có roster</p>
    );
  }

  return (
    <div
      className="grid w-full items-start justify-items-center gap-x-4 gap-y-4 px-4 py-5 sm:gap-x-6 sm:px-8 sm:py-6"
      style={{
        gridTemplateColumns: `repeat(${Math.max(lineup.length, 1)}, minmax(0, 1fr))`,
      }}
    >
      {lineup.map((player, index) => (
        <div
          key={`${teamTag}-${player.name}-${index}`}
          className="w-full max-w-[7.5rem]"
        >
          <MatchRosterPlayerChip
            player={player}
            index={index}
            teamTag={teamTag}
            showRiotMeta={showRiotMeta}
            linkedContext={linkedContext}
          />
        </div>
      ))}
    </div>
  );
};

const MatchTeamRosterStatHeader = ({
  team,
  playerCount,
  showAllParticipants,
}: {
  team: MatchDetail["team1"];
  playerCount: number;
  showAllParticipants: boolean;
}) => (
  <div className={`${MATCH_STAT_TH} flex items-center gap-2.5 px-4 py-2.5 text-left`}>
    {team.logo ? (
      <img
        src={team.logo}
        alt={team.tag}
        className="h-5 w-5 shrink-0 object-cover"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    ) : (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center bg-neutral-800 text-[9px] font-bold text-neutral-200">
        {team.tag.slice(0, 2)}
      </div>
    )}
    <div className="min-w-0">
      <p className="truncate text-sm font-extrabold uppercase tracking-wide text-neutral-900 md:hidden">
        {team.tag || team.name}
      </p>
      <p className="hidden truncate text-sm font-extrabold uppercase tracking-wide text-neutral-900 md:block">
        {team.name}
      </p>
      {showAllParticipants && playerCount > 0 ? (
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">
          {playerCount} người
        </p>
      ) : team.tag && team.name !== team.tag ? (
        <p className="hidden text-[10px] font-bold uppercase tracking-wider text-neutral-600 md:block">
          {team.tag}
        </p>
      ) : null}
    </div>
  </div>
);

const MatchDualRosterStrip = ({
  team1,
  team2,
  team1Players,
  team2Players,
  showRiotMeta = false,
  showAllParticipants = false,
  linkedContext,
}: {
  team1: MatchDetail["team1"];
  team2: MatchDetail["team2"];
  team1Players: MatchDetail["team1Roster"]["players"];
  team2Players: MatchDetail["team2Roster"]["players"];
  showRiotMeta?: boolean;
  showAllParticipants?: boolean;
  linkedContext?: LinkedTeamContext;
}) => {
  const slotCount = showAllParticipants ? undefined : 5;

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className={MATCH_ROSTER_PANEL_CLASS}>
        <MatchTeamRosterStatHeader
          team={team1}
          playerCount={team1Players.length}
          showAllParticipants={showAllParticipants}
        />
        <MatchRosterLineupGrid
          players={team1Players}
          teamTag={team1.tag}
          showRiotMeta={showRiotMeta}
          slotCount={slotCount}
          linkedContext={linkedContext}
        />
      </div>
      <div className={MATCH_ROSTER_PANEL_CLASS}>
        <MatchTeamRosterStatHeader
          team={team2}
          playerCount={team2Players.length}
          showAllParticipants={showAllParticipants}
        />
        <MatchRosterLineupGrid
          players={team2Players}
          teamTag={team2.tag}
          showRiotMeta={showRiotMeta}
          slotCount={slotCount}
          linkedContext={linkedContext}
        />
      </div>
    </div>
  );
};

const MatchTeamRosterPanel = ({
  team,
  players,
  align = "left",
  showRiotMeta = false,
  linkedContext,
}: {
  team: MatchDetail["team1"];
  players: MatchDetail["team1Roster"]["players"];
  align?: "left" | "right";
  showRiotMeta?: boolean;
  linkedContext?: LinkedTeamContext;
}) => {
  const safePlayers = players.slice(0, 5);

  return (
    <div className={MATCH_ROSTER_PANEL_CLASS}>
      <MatchTeamRosterStatHeader
        team={team}
        playerCount={safePlayers.length}
        showAllParticipants={false}
      />
      <MatchRosterLineupGrid
        players={safePlayers}
        teamTag={team.tag}
        showRiotMeta={showRiotMeta}
        slotCount={5}
        linkedContext={linkedContext}
      />
    </div>
  );
};

const TeamLobbyRoster = ({
  team,
  players,
  align,
  showRiotMeta,
  linkedContext,
}: {
  team: MatchDetail["team1"];
  players: MatchDetail["team1Roster"]["players"];
  align: "left" | "right";
  showRiotMeta: boolean;
  linkedContext?: LinkedTeamContext;
}) => (
  <MatchTeamRosterPanel
    team={team}
    players={players}
    align={align}
    showRiotMeta={showRiotMeta}
    linkedContext={linkedContext}
  />
);

const PendingMatchOverviewPanel = ({
  match,
  session,
  matchGameIds,
  linkedContext,
}: {
  match: MatchDetail;
  session: RoundBanPickPayload | null;
  matchGameIds: MatchGameIdRecord[];
  linkedContext: LinkedTeamContext;
}) => {
  const mapNameByCode = new Map(
    (session?.map_pool ?? []).map((item) => [item.map_code, item.map_name]),
  );

  const pickedMapNames = getPickedMapIdsFromSession(session).map(
    (mapId) => mapNameByCode.get(mapId) ?? mapId.toUpperCase(),
  );

  const sortedGameIds = [...(matchGameIds ?? [])].sort((a, b) => {
    const gameNoA = toNumber(a.game_no) ?? Number.MAX_SAFE_INTEGER;
    const gameNoB = toNumber(b.game_no) ?? Number.MAX_SAFE_INTEGER;
    if (gameNoA !== gameNoB) return gameNoA - gameNoB;
    return Number(a.id ?? 0) - Number(b.id ?? 0);
  });

  const filledGameNoSet = new Set<number>();
  sortedGameIds.forEach((item, index) => {
    const parsedGameNo = toNumber(item.game_no);
    const gameNo = parsedGameNo ?? index + 1;
    const infoGameId = String(item.info_game_id ?? "").trim();
    if (infoGameId) {
      filledGameNoSet.add(gameNo);
    }
  });

  const highestFilledMapNo =
    filledGameNoSet.size > 0 ? Math.max(...Array.from(filledGameNoSet)) : 0;
  const format = session?.state?.format ?? "BO3";
  const expectedMapCount = format === "BO1" ? 1 : format === "BO5" ? 5 : 3;
  const totalMaps = Math.max(
    expectedMapCount,
    pickedMapNames.length,
    highestFilledMapNo,
    1,
  );
  const activeMapNo =
    highestFilledMapNo >= totalMaps
      ? totalMaps
      : Math.min(totalMaps, Math.max(1, highestFilledMapNo + 1));
  const activeMapLabel =
    pickedMapNames[activeMapNo - 1] ?? `MAP ${activeMapNo}`;
  const roomId = String(match.roomId ?? session?.room_id ?? "").trim();
  const isRiotGame = ["valorant", "lol", "wildrift", "tft"].includes(
    match.gameType,
  );

  return (
    <section className="mx-auto px-4 md:px-8 py-6">
      <div className="rounded-2xl border border-border/70 /30 p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <span className="text-primary">Quick Match</span>
          <span>Overview</span>
          <span>Scoreboard</span>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(220px,1fr)_minmax(0,1.7fr)_minmax(220px,1fr)]">
          <TeamLobbyRoster
            team={match.team1}
            players={match.team1Roster.players}
            align="left"
            showRiotMeta={isRiotGame}
            linkedContext={linkedContext}
          />

          <div className="space-y-3">
            <div className="rounded-md border border-border/70 /20 px-3 py-2 flex items-center justify-between gap-3">
              <p className="text-[11px] uppercase  text-muted-foreground">
                Room ID
              </p>
              <p className="text-sm font-semibold text-foreground">
                {roomId || "Chưa gán room_id"}
              </p>
            </div>

            <div className="space-y-2">
              {Array.from({ length: totalMaps }, (_, index) => {
                const mapNo = index + 1;
                const mapLabel = pickedMapNames[index] ?? `MAP ${mapNo}`;
                const hasMatchId = filledGameNoSet.has(mapNo);
                const isCurrent = mapNo === activeMapNo;

                return (
                  <div
                    key={`map-step-${mapNo}`}
                    className={`rounded-md border px-3 py-2 flex items-center justify-between gap-3 ${
                      isCurrent
                        ? "border-primary/60 bg-primary/10"
                        : hasMatchId
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : "border-border/60 /10"
                    }`}
                  >
                    <p className="text-sm font-semibold">
                      Map {mapNo}: {mapLabel}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {isCurrent
                        ? "Current"
                        : hasMatchId
                          ? "Done"
                          : "Upcoming"}
                    </p>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground">
              Trạng thái hiện tại: Map {activeMapNo} - {activeMapLabel}. Khi
              nhập match_id map 1, hệ thống sẽ tự chuyển sang map 2.
            </p>
          </div>

          <TeamLobbyRoster
            team={match.team2}
            players={match.team2Roster.players}
            align="right"
            showRiotMeta={isRiotGame}
            linkedContext={linkedContext}
          />
        </div>
      </div>
    </section>
  );
};

/* ── FPS Stat Table ── */
const FPSStatTable = ({
  match,
  linkedContext,
}: {
  match: MatchDetail;
  linkedContext: LinkedTeamContext;
}) => {
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
      <div className="flex items-center flex-wrap gap-4 justify-between">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            Match Stats
          </h3>
          <p className="text-xs text-[#EEEEEE] mt-0.5">
            Thống kê chi tiết từng người chơi
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab, i) => (
            <button
              key={`${tab}-${i}`}
              onClick={() => setActiveTab(i)}
              className={`border px-5 py-2 text-xs font-semibold transition-all ${
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

      <MatchDualRosterStrip
        team1={match.team1}
        team2={match.team2}
        team1Players={activeRosters[0]?.players ?? []}
        team2Players={activeRosters[1]?.players ?? []}
        showRiotMeta
        showAllParticipants={currentTab === 0}
        linkedContext={linkedContext}
      />

      {selectedMapForRounds && selectedRoundHistory.length > 0 && (
        <div className="w-full px-3 py-2">
          <div className="grid w-full grid-cols-[84px_minmax(0,1fr)] items-start gap-3">
            <div className="shrink-0 min-w-18.5">
              <div className="flex items-center justify-between text-[11px] leading-none">
                <span className="font-semibold text-neutral-200 uppercase tracking-wide">
                  {match.team1.tag}
                </span>
                <span className="font-black tabular-nums text-lg text-white">
                  {selectedMapForRounds.team1Score}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] leading-none">
                <span className="font-semibold text-neutral-200 uppercase tracking-wide">
                  {match.team2.tag}
                </span>
                <span className="font-black tabular-nums text-lg text-white">
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
                          isTeam1Win ? "text-white" : "text-neutral-600"
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
                          isTeam2Win ? "text-white" : "text-neutral-600"
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

                      <span className="mt-0.5 text-[10px] text-neutral-500 tabular-nums">
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
          <div key={roster.teamTag} className={MATCH_STAT_PANEL}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className={TOURNAMENT_TABLE_HEADER_ROW_CLASS}>
                    <th className={MATCH_STAT_TH_NAME}>
                      <div className="flex items-center gap-2 min-w-0 normal-case">
                        <img
                          src={roster.teamLogo}
                          alt={roster.teamTag}
                          className="w-5 h-5 rounded-sm"
                        />
                        <span className="truncate text-sm font-extrabold uppercase tracking-wide md:hidden">
                          {roster.teamTag || roster.teamName}
                        </span>
                        <span className="hidden truncate text-sm font-extrabold uppercase tracking-wide md:inline">
                          {roster.teamName}
                        </span>
                      </div>
                    </th>
                    <th className={MATCH_STAT_TH}>ACS</th>
                    <th className={MATCH_STAT_TH}>K</th>
                    <th className={MATCH_STAT_TH}>D</th>
                    <th className={MATCH_STAT_TH}>+/-</th>
                    <th className={MATCH_STAT_TH}>ADR</th>
                    <th className={MATCH_STAT_TH}>HS%</th>
                    <th className={MATCH_STAT_TH}>FK</th>
                    <th className={MATCH_STAT_TH}>FD</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.players.map((p, playerIndex) => (
                    <tr key={`${roster.teamTag}-${p.name}-${playerIndex}`} className={MATCH_STAT_TR}>
                      <td className={MATCH_STAT_TD_NAME}>
                        <div className="flex items-center gap-2 min-w-0">
                          {p.icon ? (
                            <img
                              src={p.icon}
                              alt={p.name}
                              className="w-6 h-6 rounded-sm"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-sm bg-neutral-800 flex items-center justify-center text-[11px] font-bold text-neutral-400">
                              {p.name.charAt(0)}
                            </div>
                          )}
                          <span className="text-[11px] font-semibold text-white truncate">
                            {p.name}
                          </span>
                        </div>
                      </td>

                      <td className={MATCH_STAT_TD}>{p.acs ?? "-"}</td>
                      <td className={MATCH_STAT_TD}>{p.kills ?? "-"}</td>
                      <td className={MATCH_STAT_TD}>{p.deaths ?? "-"}</td>
                      <td
                        className={`${MATCH_STAT_TD} font-bold ${
                          (p.plusMinus ?? 0) > 0
                            ? "text-emerald-400"
                            : (p.plusMinus ?? 0) < 0
                              ? "text-rose-400"
                              : "text-neutral-500"
                        }`}
                      >
                        {(p.plusMinus ?? 0) > 0
                          ? `+${p.plusMinus}`
                          : (p.plusMinus ?? "-")}
                      </td>
                      <td className={MATCH_STAT_TD}>{p.adr ?? "-"}</td>
                      <td className={MATCH_STAT_TD}>{p.hsPercent ?? "-"}</td>
                      <td className={MATCH_STAT_TD}>{p.firstKills ?? "-"}</td>
                      <td className={MATCH_STAT_TD}>{p.firstDeaths ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── AOV Stat Table ── */
// Phong cách "bảng đấu in" theo design/LienQuan.dc.html: góc vuông, kẻ 1px,
// không nền xám, tab đang chọn đảo màu. Chỉ hiện chỉ số có trong DB.
const AOV_FONT = "font-['Be_Vietnam_Pro',sans-serif]";
const AOV_INK = "text-[#F2F0EB]";
const AOV_GREY = "text-[#9A9893]";
const AOV_ACCENT = "text-[#FF4A3D]";
const AOV_RULE = "border-[#2C2B29]";
const AOV_ROW_GRID = "md:grid-cols-[minmax(0,1fr)_120px_80px_64px]";

const formatAovDuration = (sec?: number | null) => {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const formatAovGold = (gold: number) => `${(gold / 1000).toFixed(1)}k`;

const sumOrNull = (values: Array<number | undefined>) => {
  const present = values.filter((v): v is number => v != null);
  return present.length ? present.reduce((s, v) => s + v, 0) : null;
};

const AOVStatTable = ({ match }: { match: MatchDetail }) => {
  const games = match.aovGameRosters ?? [];
  const [activeTab, setActiveTab] = useState(0);
  const currentGame = games[activeTab] ?? games[0];

  if (!currentGame) return null;

  const team1Players = currentGame.team1Roster.players ?? [];
  const team2Players = currentGame.team2Roster.players ?? [];
  const allPlayers = [...team1Players, ...team2Players];

  const hasNumericStats = allPlayers.some(
    (p) =>
      (p.kills ?? 0) > 0 ||
      (p.deaths ?? 0) > 0 ||
      (p.assists ?? 0) > 0 ||
      p.performanceScore != null ||
      p.gold != null,
  );
  const team1Gold = sumOrNull(team1Players.map((p) => p.gold));
  const team2Gold = sumOrNull(team2Players.map((p) => p.gold));

  const sideLabel = (side?: "blue" | "red") =>
    side === "blue" ? "Phe xanh" : side === "red" ? "Phe đỏ" : null;
  const team1SideLabel = sideLabel(currentGame.team1Side);
  const team2SideLabel = sideLabel(
    currentGame.team1Side === "blue"
      ? "red"
      : currentGame.team1Side === "red"
        ? "blue"
        : undefined,
  );
  const duration = formatAovDuration(currentGame.durationSec);
  const tag1 = currentGame.team1Roster.teamTag || currentGame.team1Roster.teamName;
  const tag2 = currentGame.team2Roster.teamTag || currentGame.team2Roster.teamName;

  const compareRows = [
    hasNumericStats
      ? {
          label: "Hạ gục",
          a: currentGame.team1Kills,
          b: currentGame.team2Kills,
          fmt: String,
        }
      : null,
    team1Gold != null && team2Gold != null
      ? { label: "Vàng", a: team1Gold, b: team2Gold, fmt: formatAovGold }
      : null,
  ].filter((row): row is NonNullable<typeof row> => row !== null);

  const teams = [
    {
      roster: currentGame.team1Roster,
      players: team1Players,
      side: team1SideLabel,
      won: currentGame.team1Won,
      kills: currentGame.team1Kills,
      gold: team1Gold,
    },
    {
      roster: currentGame.team2Roster,
      players: team2Players,
      side: team2SideLabel,
      won: currentGame.team1Won == null ? null : !currentGame.team1Won,
      kills: currentGame.team2Kills,
      gold: team2Gold,
    },
  ];

  return (
    <div className={`${AOV_FONT} ${AOV_INK}`}>
      {games.length > 1 ? (
        <div
          role="tablist"
          aria-label="Chọn ván"
          className="grid border border-[#F2F0EB]"
          style={{ gridTemplateColumns: `repeat(${games.length}, minmax(0, 1fr))` }}
        >
          {games.map((game, i) => {
            const on = activeTab === i;
            const winnerTag =
              game.team1Won == null
                ? null
                : game.team1Won
                  ? game.team1Roster.teamTag || game.team1Roster.teamName
                  : game.team2Roster.teamTag || game.team2Roster.teamName;
            const sub = [
              winnerTag ? `${winnerTag} thắng` : null,
              formatAovDuration(game.durationSec),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <button
                key={game.label}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActiveTab(i)}
                className={`min-h-14 px-2.5 py-2 text-left transition-colors md:min-h-14 md:px-4 md:py-2 ${
                  i > 0 ? "border-l border-[#F2F0EB]" : ""
                } ${
                  on
                    ? "bg-[#F2F0EB] text-[#0B0B0B]"
                    : "bg-transparent text-[#F2F0EB] hover:bg-[#F2F0EB]/5"
                }`}
              >
                <span className="block text-sm font-extrabold md:text-base">
                  {game.label}
                </span>
                {sub ? (
                  <span
                    className={`mt-0.5 block text-[11px] md:text-[13px] ${
                      on ? "text-[#4A4844]" : AOV_GREY
                    }`}
                  >
                    {sub}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {compareRows.length > 0 ? (
        <div className="mt-5 md:mt-6">
          <div className="grid grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] pb-1.5 text-xs md:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)] md:pb-2.5 md:text-[13px]">
            <span>
              <strong>{tag1}</strong>
              {team1SideLabel ? (
                <span className={AOV_GREY}> · {team1SideLabel}</span>
              ) : null}
            </span>
            <span className={`text-center ${AOV_GREY}`}>
              {[currentGame.label, duration].filter(Boolean).join(" · ")}
            </span>
            <span className="text-right">
              {team2SideLabel ? (
                <span className={AOV_GREY}>{team2SideLabel} · </span>
              ) : null}
              <strong>{tag2}</strong>
            </span>
          </div>
          {compareRows.map((row) => (
            <div
              key={row.label}
              className={`grid grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] items-center border-t ${AOV_RULE} py-1.5 tabular-nums md:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)] md:py-2`}
            >
              <span
                className={`text-sm md:text-base ${
                  row.a >= row.b ? "font-extrabold" : `font-normal ${AOV_GREY}`
                }`}
              >
                {row.fmt(row.a)}
              </span>
              <span className={`text-center text-[11px] md:text-xs ${AOV_GREY}`}>
                {row.label}
              </span>
              <span
                className={`text-right text-sm md:text-base ${
                  row.b >= row.a ? "font-extrabold" : `font-normal ${AOV_GREY}`
                }`}
              >
                {row.fmt(row.b)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {teams.map((team) => (
        <section
          key={team.roster.teamTag || team.roster.teamName}
          className="mt-6 md:mt-8"
        >
          <div className="flex items-baseline gap-2 border-b-2 border-[#F2F0EB] pb-1.5 md:gap-3 md:pb-2">
            <h3 className="m-0 min-w-0 truncate text-sm font-extrabold md:text-base">
              {team.roster.teamName}
            </h3>
            <span className={`shrink-0 text-xs md:text-[13px] ${AOV_GREY}`}>
              {[
                team.side,
                hasNumericStats ? `${team.kills} hạ gục` : null,
                team.gold != null ? `${formatAovGold(team.gold)} vàng` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {team.won != null ? (
              <span
                className={`ml-auto shrink-0 text-xs font-extrabold tracking-[0.04em] md:text-[13px] ${
                  team.won ? AOV_ACCENT : AOV_GREY
                }`}
              >
                {team.won ? "THẮNG" : "THUA"}
              </span>
            ) : null}
          </div>

          <div
            className={`hidden gap-3 pb-1.5 pt-2.5 text-xs md:grid ${AOV_ROW_GRID} ${AOV_GREY}`}
          >
            <span>Tuyển thủ</span>
            <span>K / D / A</span>
            <span>Vàng</span>
            <span>Điểm</span>
          </div>

          {team.players.length === 0 ? (
            <div className={`border-t ${AOV_RULE} py-4 text-sm ${AOV_GREY}`}>
              Chưa có người chơi
            </div>
          ) : (
            team.players.map((p, playerIndex) => {
              const kda = hasNumericStats
                ? `${p.kills ?? 0} / ${p.deaths ?? 0} / ${p.assists ?? 0}`
                : "–";
              const score =
                p.performanceScore != null ? p.performanceScore.toFixed(1) : "–";
              const gold = p.gold != null ? formatAovGold(p.gold) : "–";
              const ignHint =
                p.originalIgn && p.originalIgn !== p.name
                  ? `${p.name} (${p.originalIgn})`
                  : p.name;

              return (
                <div
                  key={`${team.roster.teamTag}-${p.name}-${playerIndex}`}
                  className={`border-t ${AOV_RULE} py-2.5 text-[13px] tabular-nums md:grid md:items-center md:gap-3 md:py-2 ${AOV_ROW_GRID}`}
                >
                  <div className="flex min-w-0 items-center gap-3 md:gap-2.5">
                    <PlayerStatAvatar
                      player={p}
                      imgClassName={`h-9 w-9 shrink-0 border ${AOV_RULE} object-cover md:h-8 md:w-8`}
                      fallbackClassName={`flex h-9 w-9 shrink-0 items-center justify-center border ${AOV_RULE} text-xs font-extrabold ${AOV_GREY} md:h-8 md:w-8`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="min-w-0 truncate text-sm font-bold md:text-[13px]"
                          title={ignHint}
                        >
                          {p.name}
                        </span>
                        {/* Mobile: K/D/A nằm cùng dòng tên */}
                        <span className="ml-auto shrink-0 text-sm font-bold md:hidden">
                          {kda.replace(/ /g, "")}
                        </span>
                      </div>
                      <div
                        className={`mt-px flex justify-between gap-2 text-xs md:hidden ${AOV_GREY}`}
                      >
                        <span className="min-w-0 truncate">{gold} vàng</span>
                        <span className="shrink-0">
                          Điểm <strong className={AOV_INK}>{score}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="hidden font-semibold md:block">{kda}</span>
                  <span className="hidden md:block">{gold}</span>
                  <span className="hidden font-extrabold md:block">{score}</span>
                </div>
              );
            })
          )}
        </section>
      ))}
    </div>
  );
};

/* ── MOBA Stat Table ── */
const MOBAStatTable = ({ match }: { match: MatchDetail }) => {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = match.statTabs ?? ["All Games"];

  return (
    <div className="space-y-5">
      <div className="flex items-center flex-wrap gap-4 justify-between">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            Match Stats
          </h3>
          <p className="text-xs text-[#EEEEEE] mt-0.5">
            Thống kê chi tiết từng người chơi
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {tabs.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`border px-5 py-2 text-xs font-semibold transition-all ${
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
          <div key={roster.teamTag} className={MATCH_STAT_PANEL}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse table-fixed">
                <colgroup>
                  <col />
                  <col className="w-10" />
                  <col className="w-10" />
                  <col className="w-10" />
                  <col className="w-12" />
                  <col className="w-14" />
                </colgroup>
                <thead>
                  <tr className={TOURNAMENT_TABLE_HEADER_ROW_CLASS}>
                    <th className={MATCH_STAT_TH_NAME}>
                      <div className="flex items-center gap-2 min-w-0 normal-case">
                        <img
                          src={roster.teamLogo}
                          alt={roster.teamTag}
                          className="w-5 h-5 shrink-0 rounded-sm"
                        />
                        <span className="truncate text-sm font-extrabold uppercase tracking-wide md:hidden">
                          {roster.teamTag || roster.teamName}
                        </span>
                        <span className="hidden truncate text-sm font-extrabold uppercase tracking-wide md:inline">
                          {roster.teamName}
                        </span>
                      </div>
                    </th>
                    <th className={MATCH_STAT_TH}>K</th>
                    <th className={MATCH_STAT_TH}>D</th>
                    <th className={MATCH_STAT_TH}>A</th>
                    <th className={MATCH_STAT_TH}>CS</th>
                    <th className={MATCH_STAT_TH}>DMG</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.players.map((p, playerIndex) => (
                    <tr
                      key={`${roster.teamTag}-${p.name}-${playerIndex}`}
                      className={MATCH_STAT_TR}
                    >
                      <td className={MATCH_STAT_TD_NAME}>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[11px] font-semibold text-white">
                            {p.name}
                          </span>
                          {p.role ? (
                            <span className="shrink-0 rounded-sm bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                              {p.role}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className={MATCH_STAT_TD}>{p.kills}</td>
                      <td className={MATCH_STAT_TD}>{p.deaths}</td>
                      <td className={MATCH_STAT_TD}>{p.assists}</td>
                      <td className={MATCH_STAT_TD}>{p.cs}</td>
                      <td className={MATCH_STAT_TD}>
                        {((p.damage ?? 0) / 1000).toFixed(1)}k
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
        <div key={roster.teamTag} className={MATCH_STAT_PANEL}>
          <div className="flex items-center gap-3 px-4 py-3">
            <img
              src={roster.teamLogo}
              alt={roster.teamTag}
              className="w-5 h-5 rounded"
            />
            <span className="text-[11px] font-bold uppercase text-foreground md:hidden">
              {roster.teamTag || roster.teamName}
            </span>
            <span className="hidden text-[11px] font-bold uppercase text-foreground md:inline">
              {roster.teamName}
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[320px]">
              <div
                className={`${TOURNAMENT_TABLE_HEADER_CLASS} grid gap-0 px-4 py-1.5 text-[11px]`}
                style={{ gridTemplateColumns: "1fr 4rem" }}
              >
                <span className="text-left">Người chơi</span>
                <span className="text-center">Hạng TB</span>
              </div>
              {roster.players.map((p, playerIndex) => (
                <div
                  key={`${roster.teamTag}-${p.name}-${playerIndex}`}
                  className={`grid gap-0 items-center ${MATCH_STAT_TR}`}
                  style={{ gridTemplateColumns: "1fr 4rem" }}
                >
                  <div className={`${MATCH_STAT_TD_NAME} flex items-center gap-2`}>
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
                    className={`${MATCH_STAT_TD} font-bold ${
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
const RosterSection = ({
  match,
  linkedContext,
}: {
  match: MatchDetail;
  linkedContext: LinkedTeamContext;
}) => {
  const isRiotGame = ["valorant", "lol", "wildrift", "tft"].includes(
    match.gameType,
  );

  return (
    <MatchDualRosterStrip
      team1={match.team1}
      team2={match.team2}
      team1Players={match.team1Roster.players}
      team2Players={match.team2Roster.players}
      showRiotMeta={isRiotGame}
      showAllParticipants
      linkedContext={linkedContext}
    />
  );
};

/* ── Main Page ── */
/* ── Sidebar kết quả trận: header dùng chung trong MatchPanel ── */
const MatchDetailPanelHeader = ({
  match,
  isCompleted,
  onClose,
}: {
  match: MatchDetail;
  isCompleted: boolean;
  onClose?: () => void;
}) => (
  <MatchPanelHeader
    title={match.roundName || match.tournamentName}
    meta={[formatDate(match.date), match.format].filter(Boolean).join(" · ")}
    isLive={!isCompleted}
    team1={match.team1}
    team2={match.team2}
    onClose={onClose}
  />
);

/* ── Trang trận Valorant / Liên Quân: đầu trang kiểu trang báo (design/Valorant.dc.html) ── */
const GAME_LABEL: Partial<Record<MatchDetail["gameType"], string>> = {
  valorant: "Valorant",
  aov: "Liên Quân",
};

const PageTeamLogo = ({ team }: { team: MatchDetail["team1"] }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border border-[#2C2B29] md:h-[72px] md:w-[72px]">
      {team.logo && !failed ? (
        <img
          src={team.logo}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-xs font-extrabold text-[#9A9893] md:text-[15px]">{team.tag}</span>
      )}
    </div>
  );
};

const PageTeamBlock = ({
  team,
  lost,
  align,
}: {
  team: MatchDetail["team1"];
  lost: boolean;
  align: "left" | "right";
}) => (
  <div
    className={`flex min-w-0 items-center gap-3 md:gap-[18px] ${
      align === "right" ? "flex-row-reverse text-right" : ""
    }`}
  >
    <PageTeamLogo team={team} />
    <div className="min-w-0">
      <div className="hidden text-xs text-[#9A9893] md:block">{team.tag}</div>
      <div
        className={`truncate text-[17px] font-extrabold leading-[1.25] tracking-[-0.02em] transition-colors md:text-[36px] md:leading-[1.2] ${
          lost ? "text-[#9A9893]" : ""
        }`}
      >
        {team.name}
      </div>
    </div>
  </div>
);

/** Phòng ban/pick (trang lobby): giữa 2 đội hiện mũi tên chỉ đội đang tới lượt thay cho tỉ số. */
type HeaderBanPickTurn = {
  status: "waiting" | "running" | "done";
  actingSlot: "team1" | "team2" | null;
  action: "ban" | "pick" | "side" | null;
};

const TURN_VERB = { ban: "đang cấm", pick: "đang chọn map", side: "đang chọn bên" } as const;

const TurnArrow = ({ direction }: { direction: "left" | "right" }) => (
  <svg
    viewBox="0 0 96 40"
    className={`h-8 w-[72px] md:h-14 md:w-32 ${direction === "left" ? "" : "rotate-180"}`}
    aria-hidden="true"
  >
    <path
      d="M94 20H6M24 3L6 20l18 17"
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="square"
    />
  </svg>
);

const MatchPageHeader = ({
  match,
  isCompleted,
  backTo,
  prevLink,
  nextLink,
  banPickTurn,
}: {
  match: MatchDetail;
  isCompleted: boolean;
  backTo: string;
  prevLink?: string | null;
  nextLink?: string | null;
  banPickTurn?: HeaderBanPickTurn | null;
}) => {
  const s1 = toNumber(match.team1.score) ?? 0;
  const s2 = toNumber(match.team2.score) ?? 0;
  const decided = isCompleted && s1 !== s2;
  const actingSlot = banPickTurn?.status === "running" ? banPickTurn.actingSlot : null;

  // Tổng thời gian thi đấu các ván (Riot gameLengthMillis / AOV duration_sec)
  const minutes = Math.round(
    (match.valorantGames ?? []).reduce(
      (sum, game) => sum + (game.matchInfo?.gameLengthMillis ?? 0) / 60000,
      0,
    ) +
      (match.aovGameRosters ?? []).reduce(
        (sum, game) => sum + (toNumber(game.durationSec) ?? 0) / 60,
        0,
      ),
  );

  return (
    <header className="mx-auto w-full max-w-[1440px] px-4 pt-7 md:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
        <div className="min-w-0">
          <Link to={backTo} className="font-semibold">
            ← Nhánh đấu
          </Link>{" "}
          <span className="text-[#9A9893]">
            / {[match.roundName, match.tournamentName].filter(Boolean).join(" · ")}
          </span>
        </div>
        {prevLink || nextLink ? (
          <div className="flex gap-5 text-[13px]">
            {prevLink ? (
              <Link to={prevLink} className="text-[#9A9893] hover:text-[#F2F0EB]">
                ← Trận trước
              </Link>
            ) : null}
            {nextLink ? (
              <Link to={nextLink} className="text-[#9A9893] hover:text-[#F2F0EB]">
                Trận sau →
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[13px] text-[#9A9893]">
        <span>
          <strong className="text-[#F2F0EB]">{GAME_LABEL[match.gameType] ?? match.gameType}</strong>
          {[match.format, formatDate(match.date)]
            .filter(Boolean)
            .map((part) => ` · ${part}`)
            .join("")}
        </span>
        <span>
          {isCompleted ? (
            <>Kết thúc{minutes > 0 ? ` · ${minutes} phút` : ""}</>
          ) : (
            <strong className="text-[#FF4A3D]">Chưa kết thúc</strong>
          )}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-t-2 border-[#F2F0EB] pt-4 md:gap-8 md:pt-6">
        <PageTeamBlock
          team={match.team1}
          lost={banPickTurn ? actingSlot === "team2" : decided && s1 < s2}
          align="left"
        />
        {banPickTurn ? (
          <div className="flex min-w-[96px] flex-col items-center gap-1.5 md:min-w-[160px]">
            {actingSlot ? (
              <TurnArrow direction={actingSlot === "team1" ? "left" : "right"} />
            ) : (
              <span className="text-[40px] font-extrabold leading-none tracking-[-0.03em] text-[#9A9893] md:text-[64px]">
                VS
              </span>
            )}
            <span className="whitespace-nowrap text-[11px] font-bold text-[#9A9893] md:text-[13px]">
              {actingSlot && banPickTurn.action
                ? `${(actingSlot === "team1" ? match.team1 : match.team2).tag} ${TURN_VERB[banPickTurn.action]}`
                : banPickTurn.status === "done"
                  ? "Ban/pick xong"
                  : "Chờ bắt đầu ban/pick"}
            </span>
          </div>
        ) : (
          <div className="whitespace-nowrap text-[48px] font-extrabold leading-[1.05] tracking-[-0.04em] tabular-nums md:text-[96px]">
            {s1}
            <span className="mx-1.5 font-normal text-[#9A9893] md:mx-4">–</span>
            {s2}
          </div>
        )}
        <PageTeamBlock
          team={match.team2}
          lost={banPickTurn ? actingSlot === "team1" : decided && s2 < s1}
          align="right"
        />
      </div>

      <div className="mt-5 border-t border-[#2C2B29]" />
    </header>
  );
};

type MatchDetailPageProps = {
  /** Mở từ sidebar trên trang bracket (không lấy từ route /match/:id). */
  matchId?: string;
  /** "panel" = nội dung bên trong sidebar kết quả (MatchPanelProvider). */
  variant?: "page" | "panel";
  onClose?: () => void;
};

const MatchDetailPage = ({
  matchId,
  variant = "page",
  onClose,
}: MatchDetailPageProps = {}) => {
  const isPanel = variant === "panel";
  const { user, token } = useAuth();
  const { tournament } = useOutletContext<{
    tournament?: TournamentBySlugResponse["info"];
  }>();
  const params = useParams();
  const { game, slug } = params;
  const id = matchId ?? params.id;
  const location = useLocation();
  const normalizedRouteGame = normalizeGameSlug(game);
  const isLobbyRoute = !isPanel && /\/lobby\//.test(location.pathname);
  const backTo =
    normalizedRouteGame && slug
      ? `/tournament/${normalizedRouteGame}/${slug}/bracket`
      : "/bracket";
  const buildLobbyLink = (matchId: number | string) =>
    normalizedRouteGame && slug
      ? `/tournament/${normalizedRouteGame}/${slug}/lobby/${matchId}`
      : "/";
  const buildMatchLink = (matchId: number | string) =>
    normalizedRouteGame && slug
      ? `/tournament/${normalizedRouteGame}/${slug}/match/${matchId}`
      : `/match/${matchId}`;
  const numId = id && /^\d+$/.test(id) ? Number(id) : null;
  const tournamentId = toNumber(tournament?.id);

  const resolveLiveMatchPollInterval = (matches: Match[] | undefined) => {
    if (!numId || !matches?.length) return false;

    const current = matches.find((item) => toNumber(item.id) === numId);
    if (!current || isCompletedMatchStatus(current.status)) return false;

    return isLobbyRoute ? 10000 : 30000;
  };

  const { data: tournamentMatchBundle, isLoading: isMatchListLoading } =
    useQuery({
      queryKey: ["tournament-match-list-all-brackets", tournamentId],
      enabled: Boolean(tournamentId),
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      refetchInterval: (query) =>
        resolveLiveMatchPollInterval(
          (query.state.data as { matches?: Match[] } | undefined)?.matches,
        ),
      queryFn: async () => {
        const bracketsResponse = await getBracketsByTournamentId(tournamentId!);
        const brackets = bracketsResponse.data?.data ?? [];
        const bracketIds = brackets
          .map((bracket) => toNumber(bracket.id))
          .filter((bracketId): bracketId is number => bracketId !== null);

        if (!bracketIds.length) {
          return { matches: [] as Match[], brackets };
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
          brackets,
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

  const liveMatchPollInterval = useMemo(
    () => resolveLiveMatchPollInterval(sortedMatches),
    [sortedMatches, numId, isLobbyRoute],
  );

  const { data: linkedTeamPlayers, isLoading: isLinkedPlayersLoading } =
    useQuery({
      queryKey: ["match-linked-players", numId],
      enabled: Boolean(numId),
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
      queryFn: async () => {
        const response = await getMatchLinkedPlayers(numId!);
        const payload = response.data?.data;

        return {
          team1Players: payload?.team1?.players ?? [],
          team2Players: payload?.team2?.players ?? [],
          allPlayers: payload?.all_players ?? [],
        };
      },
    });

  // Giai đoạn chọn người ra sân (trước khi BTC mở phòng ban/pick / tới giờ) — khác thời điểm với ban/pick
  const { data: matchLineups } = useQuery({
    // Theo người xem: can_edit phụ thuộc đăng nhập (lần tải trước khi có token không được dùng lại)
    queryKey: ["match-lineups", numId, user?.id ?? null],
    enabled: Boolean(numId),
    queryFn: async () => (await getMatchLineups(numId!, token)).data.data,
  });
  const isLineupPhase = Boolean(matchLineups && !matchLineups.locked);

  const linkedTeamContext = useMemo(() => {
    const context = createEmptyLinkedTeamContext();
    context.team1Players = linkedTeamPlayers?.team1Players ?? [];
    context.team2Players = linkedTeamPlayers?.team2Players ?? [];

    const collectPlayerProfiles = (
      players: TournamentTeamPlayersResponse["players"],
      side: TeamSide,
    ) => {
      players?.forEach((player) => {
        const nickname = String(player?.nickname ?? "").trim();
        const avatar = String(player?.profile_picture ?? "").trim();
        const username = String(player?.username ?? "").trim();
        const riotRaw = String(player?.riot_account ?? "").trim();
        const riotAccount = normalizeRiotAccount(riotRaw);

        registerPlayerProfileAliases(
          context,
          [username, nickname, riotRaw, riotAccount],
          nickname,
          avatar,
        );

        [player?.riot_puuid_val, player?.riot_puuid_lol, player?.riot_puuid_tft]
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
          .forEach((puuid) => {
            (side === "team1" ? context.team1Puuids : context.team2Puuids).add(puuid);
            if (!context.profileByPuuid.has(puuid)) {
              context.profileByPuuid.set(puuid, {
                nickname: nickname || undefined,
                avatar: avatar || undefined,
              });
            }
          });

        if (!riotAccount) return;

        if (side === "team1") {
          context.team1RiotAccounts.add(riotAccount);
        } else {
          context.team2RiotAccounts.add(riotAccount);
        }
      });
    };

    collectPlayerProfiles(context.team1Players, "team1");
    collectPlayerProfiles(context.team2Players, "team2");

    context.profileByKey = new Map([
      ...buildLinkedProfileIndex(context.team1Players),
      ...buildLinkedProfileIndex(context.team2Players),
      ...buildLinkedProfileIndex(linkedTeamPlayers?.allPlayers),
    ]);

    return context;
  }, [linkedTeamPlayers]);

  const roundSlug = buildRoundSlug({
    tournamentSlug: slug,
    roundNumber: toNumber(currentMatchRow?.round_number),
    matchNo: toNumber(currentMatchRow?.match_no),
    matchId: toNumber(currentMatchRow?.id) ?? numId,
  });

  const banPickRoom = useBanPickRoom({
    roundSlug:
      normalizedRouteGame === "val" && Boolean(numId) ? roundSlug : undefined,
    matchId: numId,
    token,
    enabled: normalizedRouteGame === "val" && Boolean(numId),
  });
  const liveBanPickSession = banPickRoom.session;

  const currentBracketName = useMemo(() => {
    const bracketId = toNumber(currentMatchRow?.bracket_id);
    if (!bracketId) return null;
    const brackets = tournamentMatchBundle?.brackets ?? [];
    const bracket = brackets.find((item) => toNumber(item.id) === bracketId);
    const name = String(bracket?.name ?? "").trim();
    return name || null;
  }, [currentMatchRow?.bracket_id, tournamentMatchBundle?.brackets]);

  const baseMatch = useMemo(() => {
    if (!currentMatchRow) return null;
    return buildMatchDetailFromApi({
      match: currentMatchRow,
      tournament,
      normalizedRouteGame,
      bracketName: currentBracketName,
    });
  }, [currentMatchRow, tournament, normalizedRouteGame, currentBracketName]);

  const { data: matchGameIds } = useQuery({
    queryKey: ["match-game-ids", numId],
    enabled: Boolean(numId),
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
    refetchInterval: liveMatchPollInterval,
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
    if (baseMatch?.gameType === "aov" && getProviderMatchIds(ids, "aov").length > 0)
      return "aov";

    if (getProviderMatchIds(ids, "aov").length > 0) return "aov";

    if (tftIds.length > 0) return "tft";
    if (valIds.length > 0) return "val";
    if (lolIds.length > 0) return "lol";

    if (baseMatch?.gameType === "valorant") return "val";
    if (baseMatch?.gameType === "tft") return "tft";
    if (baseMatch?.gameType === "lol" || baseMatch?.gameType === "wildrift")
      return "lol";
    if (baseMatch?.gameType === "aov") return "aov";

    return null;
  }, [baseMatch?.gameType, matchGameIds]);

  const shouldFetchAovStats = useMemo(() => {
    if (!numId) return false;
    if (baseMatch?.gameType === "aov") return true;
    if (normalizedRouteGame === "aov") return true;
    if (looksLikeAovStagingId(baseMatch?.roomId)) return true;
    return getProviderMatchIds(matchGameIds ?? [], "aov").length > 0;
  }, [
    baseMatch?.gameType,
    baseMatch?.roomId,
    matchGameIds,
    normalizedRouteGame,
    numId,
  ]);

  const { data: aovBundle, isLoading: isAovStatsLoading } = useQuery({
    queryKey: ["aov-match-detail", numId],
    enabled: shouldFetchAovStats,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await getAovMatchStats(numId!);
      return {
        games: response.data?.data ?? ([] as AovMatchGameStats[]),
        series: (response.data?.series ?? null) as AovMatchSeriesScore | null,
      };
    },
  });
  const aovApiData = aovBundle?.games;
  const aovSeriesScore = aovBundle?.series;

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

  const { data: valorantApiData, isLoading: isValorantStatsLoading } = useQuery({
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

  const banPickTimeline = useMemo(
    () => buildBanPickTimeline(liveBanPickSession),
    [liveBanPickSession],
  );
  const match = useMemo(() => {
    if (!baseMatch) return null;

    // Ưu tiên tỉ số series từ Score Control (API matches / aov series)
    const seriesScoreA =
      aovSeriesScore != null
        ? toNumber(aovSeriesScore.score_a) ?? 0
        : toNumber(baseMatch.team1.score) ?? 0;
    const seriesScoreB =
      aovSeriesScore != null
        ? toNumber(aovSeriesScore.score_b) ?? 0
        : toNumber(baseMatch.team2.score) ?? 0;

    const hydratedBaseMatch = hydrateRostersWithLinkedPlayers(
      {
        ...baseMatch,
        team1: { ...baseMatch.team1, score: seriesScoreA },
        team2: { ...baseMatch.team2, score: seriesScoreB },
      },
      linkedTeamContext,
    );

    let resolvedMatch: MatchDetail = hydratedBaseMatch;

    if (preferredProvider === "tft" && tftApiData && tftApiData.length > 0) {
      resolvedMatch = mergeTftApiIntoMatch(
        hydratedBaseMatch,
        tftApiData[0],
        linkedTeamContext,
      );
    } else if (baseMatch.gameType === "valorant" && valorantApiData) {
      resolvedMatch = mergeValorantApiIntoMatch(
        hydratedBaseMatch,
        valorantApiData,
        linkedTeamContext,
      );
    } else if (preferredProvider === "val" && valorantApiData) {
      resolvedMatch = mergeValorantApiIntoMatch(
        hydratedBaseMatch,
        valorantApiData,
        linkedTeamContext,
      );
    } else if (
      (hydratedBaseMatch.gameType === "aov" || shouldFetchAovStats) &&
      aovApiData &&
      aovApiData.length > 0
    ) {
      resolvedMatch = mergeAovStatsIntoMatch(
        hydratedBaseMatch,
        aovApiData,
        linkedTeamContext,
      );

      // Stats API trả games nhưng players rỗng → vẫn hiện roster 2 đội
      const hasAnyPlayers = (resolvedMatch.aovGameRosters ?? []).some(
        (game) =>
          (game.team1Roster.players?.length ?? 0) > 0 ||
          (game.team2Roster.players?.length ?? 0) > 0,
      );
      if (
        !hasAnyPlayers &&
        (linkedTeamContext.team1Players.length > 0 ||
          linkedTeamContext.team2Players.length > 0)
      ) {
        resolvedMatch = buildRosterOnlyAovGames(
          resolvedMatch,
          linkedTeamContext,
          aovApiData.length,
        );
      }
    } else if (
      hydratedBaseMatch.gameType === "aov" &&
      (linkedTeamContext.team1Players.length > 0 ||
        linkedTeamContext.team2Players.length > 0)
    ) {
      // Chưa có/ chưa áp được stats — vẫn hiện danh sách người đăng ký 2 đội
      const seriesGames = Math.max(seriesScoreA, seriesScoreB, 1);
      resolvedMatch = buildRosterOnlyAovGames(
        hydratedBaseMatch,
        linkedTeamContext,
        seriesGames,
      );
    }

    const enriched = enrichMatchWithLinkedProfiles(
      resolvedMatch,
      linkedTeamContext,
    );

    // AOV: luôn khóa tỉ số series theo Score Control — không đếm từ kill/ván
    if (
      hydratedBaseMatch.gameType === "aov" ||
      shouldFetchAovStats ||
      enriched.gameType === "aov"
    ) {
      return {
        ...enriched,
        team1: {
          ...enriched.team1,
          score: seriesScoreA,
        },
        team2: {
          ...enriched.team2,
          score: seriesScoreB,
        },
      };
    }

    return enriched;
  }, [
    baseMatch,
    linkedTeamContext,
    preferredProvider,
    tftApiData,
    valorantApiData,
    aovApiData,
    aovSeriesScore,
    shouldFetchAovStats,
  ]);

  if (!match) {
    if (isMatchListLoading) {
      return (
        <PageLoader label="Đang tải trận đấu..." fullScreen={!isPanel} />
      );
    }

    if (isPanel) {
      return (
        <div className="flex items-start justify-between gap-4 px-4 py-6 md:px-8">
          <p className="text-sm text-[#9A9893]">Không tìm thấy trận đấu.</p>
          <MatchPanelCloseButton onClose={onClose} />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-foreground">
            Không tìm thấy trận đấu
          </h2>

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
  const hasAovData = Boolean(match.aovGameRosters?.length);
  const hasRosterData =
    match.team1Roster.players.length > 0 ||
    match.team2Roster.players.length > 0 ||
    hasAovData;
  const hasMapData = Boolean(match.maps?.length);
  const hasBanPickTimeline = banPickTimeline.length > 0;
  const isValorantMatch = match.gameType === "valorant";
  const isMatchCompleted = isCompletedMatchStatus(match.status);
  const shouldShowLobby = isLobbyRoute && isValorantMatch && !isMatchCompleted;
  const shouldShowEmbeddedBanPick = shouldShowLobby && Boolean(liveBanPickSession);
  const shouldShowPendingMatchOverview =
    shouldShowLobby && liveBanPickSession?.status === "done";
  const shouldShowPostMatchData =
    !isLobbyRoute && (!isValorantMatch || isMatchCompleted);
  const shouldShowMatchDetailBlockedNotice =
    !isLobbyRoute && isValorantMatch && !isMatchCompleted && !isLineupPhase;
  const shouldShowLobbyCompletedNotice =
    isLobbyRoute && isValorantMatch && isMatchCompleted;
  const shouldShowLobbyUnsupportedNotice = isLobbyRoute && !isValorantMatch;

  // Kết quả sau trận: chờ data load xong mới hiện (AOV/VAL có API stats)
  const isWaitingPostMatchStats =
    shouldShowPostMatchData &&
    ((shouldFetchAovStats &&
      (isAovStatsLoading || isLinkedPlayersLoading)) ||
      (Boolean(valorantApiMatchIds?.length) &&
        (isValorantStatsLoading || isLinkedPlayersLoading)));

  if (isWaitingPostMatchStats) {
    return (
      <PageLoader
        label="Đang tải dữ liệu sau trận..."
        fullScreen={!isPanel}
      />
    );
  }

  return (
    <div
      className={`${isPanel ? "pb-12" : "min-h-screen"} ${TOURNAMENT_PAGE_BG_CLASS}`}
    >
      {isPanel ? (
        <MatchDetailPanelHeader
          match={match}
          isCompleted={isMatchCompleted}
          onClose={onClose}
        />
      ) : match.gameType === "valorant" || match.gameType === "aov" ? (
        <MatchPageHeader
          match={match}
          isCompleted={isMatchCompleted}
          backTo={backTo}
          prevLink={prevDetail ? buildMatchLink(prevDetail.id) : null}
          nextLink={nextDetail ? buildMatchLink(nextDetail.id) : null}
          banPickTurn={
            shouldShowLobby && liveBanPickSession
              ? {
                  status: liveBanPickSession.status,
                  actingSlot: liveBanPickSession.current_action?.team ?? null,
                  action: liveBanPickSession.current_action?.type ?? null,
                }
              : null
          }
        />
      ) : (
      <>
      <TournamentSubpageHeader
        title={match.tournamentName}
        subtitle={[match.roundName, match.format].filter(Boolean).join(" · ")}
        bannerUrl={tournament?.banner_url}
        leftSlot={
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to={backTo}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-neutral-600 bg-black/30 px-2.5 text-xs font-semibold text-neutral-300 backdrop-blur-sm transition-colors hover:border-neutral-500 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nhánh đấu</span>
            </Link>
            {prevDetail ? (
              <div className="inline-flex min-w-0 items-center gap-2">
                <div className="hidden text-right leading-tight sm:block">
                  <p className="text-[10px] font-extrabold uppercase text-[#EEEEEE]">
                    Prev
                  </p>
                  <p className="text-[10px] text-[#EEEEEE]">
                    {formatNavDate(prevDetail.date_scheduled)}
                  </p>
                </div>
                <Link
                  to={buildMatchLink(prevDetail.id)}
                  className="inline-flex h-8 shrink-0 items-center rounded-md border border-neutral-600 bg-black/30 px-2 transition-colors hover:border-neutral-500"
                >
                  <img
                    src={
                      prevDetail.team_a?.logo_url ||
                      prevDetail.team_b?.logo_url ||
                      match.team1.logo
                    }
                    alt="prev-team"
                    className="h-4 w-4 rounded-sm"
                  />
                  <span className="mx-2 h-4 w-px bg-neutral-600" />
                  <span className="text-[13px] font-black tabular-nums text-white">
                    {toNumber(prevDetail.score_a) ?? 0}:
                    {toNumber(prevDetail.score_b) ?? 0}
                  </span>
                  <span className="mx-2 h-4 w-px bg-neutral-600" />
                  <img
                    src={
                      prevDetail.team_b?.logo_url ||
                      prevDetail.team_a?.logo_url ||
                      match.team2.logo
                    }
                    alt="prev-opponent"
                    className="h-4 w-4 rounded-sm"
                  />
                </Link>
              </div>
            ) : null}
          </div>
        }
        rightSlot={
          nextDetail ? (
            <div className="inline-flex min-w-0 items-center gap-2">
              <Link
                to={buildMatchLink(nextDetail.id)}
                className="inline-flex h-8 shrink-0 items-center rounded-md border border-neutral-600 bg-black/30 px-2 transition-colors hover:border-neutral-500"
              >
                <img
                  src={
                    nextDetail.team_a?.logo_url ||
                    nextDetail.team_b?.logo_url ||
                    match.team1.logo
                  }
                  alt="next-team"
                  className="h-4 w-4 rounded-sm"
                />
                <span className="mx-2 h-4 w-px bg-neutral-600" />
                <span className="text-[13px] font-black tabular-nums text-white">
                  {toNumber(nextDetail.score_a) ?? 0}:
                  {toNumber(nextDetail.score_b) ?? 0}
                </span>
                <span className="mx-2 h-4 w-px bg-neutral-600" />
                <img
                  src={
                    nextDetail.team_b?.logo_url ||
                    nextDetail.team_a?.logo_url ||
                    match.team2.logo
                  }
                  alt="next-opponent"
                  className="h-4 w-4 rounded-sm"
                />
              </Link>
              <div className="hidden text-left leading-tight sm:block">
                <p className="text-[10px] font-extrabold uppercase text-[#EEEEEE]">
                  Next
                </p>
                <p className="text-[10px] text-[#EEEEEE]">
                  {formatNavDate(nextDetail.date_scheduled)}
                </p>
              </div>
            </div>
          ) : null
        }
      />

      <div className="border-b border-neutral-800 bg-[#0f0f0f]">
        <div className={MATCH_SCOREBOARD_WRAPPER_CLASS}>
          {/* Mobile: điểm nổi giữa, shortname + logo 2 bên */}
          <div className="flex flex-col gap-3 py-4 md:hidden">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                <img
                  src={match.team1.logo}
                  alt={match.team1.tag}
                  className="h-11 w-11 shrink-0 object-cover"
                />
                <span className="max-w-full truncate px-0.5 text-[11px] font-extrabold uppercase leading-tight tracking-wide text-white">
                  {match.team1.tag}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-center gap-1 px-2">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-4xl font-black tabular-nums leading-none text-white">
                    {match.team1.score}
                  </span>
                  <span className="text-xl font-bold text-neutral-600">:</span>
                  <span className="text-4xl font-black tabular-nums leading-none text-white">
                    {match.team2.score}
                  </span>
                </div>
                <div className="text-center leading-tight">
                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-neutral-300">
                    {isMatchCompleted ? "FIN" : "LIVE"}
                  </p>
                  <p className="text-[10px] text-neutral-500">
                    {isMatchCompleted ? formatDate(match.date) : "ĐANG DIỄN RA"}
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                <img
                  src={match.team2.logo}
                  alt={match.team2.tag}
                  className="h-11 w-11 shrink-0 object-cover"
                />
                <span className="max-w-full truncate px-0.5 text-[11px] font-extrabold uppercase leading-tight tracking-wide text-white">
                  {match.team2.tag}
                </span>
              </div>
            </div>
          </div>

          {/* Desktop: tên đầy đủ */}
          <div className="hidden grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-5 py-3 md:grid">
            <div className="flex items-center justify-end gap-3 px-1 py-1">
              <div className="min-w-0 text-right">
                <span className="block text-sm font-extrabold uppercase tracking-wide text-white">
                  {match.team1.name}
                </span>
              </div>
              <img
                src={match.team1.logo}
                alt={match.team1.tag}
                className="h-9 w-9 shrink-0 object-cover"
              />
            </div>

            <div className="flex min-w-[120px] items-center justify-center gap-5 px-2 py-1">
              <span className="text-4xl font-black tabular-nums text-white">
                {match.team1.score}
              </span>
              <div className="min-w-[68px] text-center leading-tight">
                <p className="text-base font-extrabold uppercase text-neutral-300">
                  {isMatchCompleted ? "FIN" : "LIVE"}
                </p>
                <p className="text-[10px] text-neutral-500">
                  {isMatchCompleted ? formatDate(match.date) : "ĐANG DIỄN RA"}
                </p>
              </div>
              <span className="text-4xl font-black tabular-nums text-white">
                {match.team2.score}
              </span>
            </div>

            <div className="flex items-center gap-3 px-1 py-1">
              <img
                src={match.team2.logo}
                alt={match.team2.tag}
                className="h-9 w-9 shrink-0 object-cover"
              />
              <div className="min-w-0 text-left">
                <span className="block text-sm font-extrabold uppercase tracking-wide text-white">
                  {match.team2.name}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Đội trưởng chọn người ra sân trước giờ thi đấu (chỉ hiện với người sửa được) */}
      {!isPanel ? <MatchLineupEditor matchId={numId} token={token} /> : null}
      {/* LMHT: mã phòng giải đấu Riot từng ván */}
      {!isPanel && normalizedRouteGame === "lol" ? <LolCodePanel matchId={numId} /> : null}

      {shouldShowMatchDetailBlockedNotice ? (
        <section className="mx-auto w-full max-w-[1440px] px-4 md:px-8 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border border-[#2C2B29] px-4 py-4 md:px-5">
            <div className="min-w-0">
              <p className="m-0 text-base font-extrabold">Trận chưa kết thúc</p>
              <p className="m-0 mt-1 text-sm text-[#9A9893]">
                Ban/pick map và kết quả sẽ hiện ở đây khi trận xong. Chủ đội vào phòng ban/pick để cấm/chọn map.
              </p>
            </div>
            {numId ? (
              <Link
                to={buildLobbyLink(numId)}
                className="inline-flex min-h-11 shrink-0 items-center bg-[#F2F0EB] px-5 text-sm font-extrabold text-[#0B0B0B] hover:opacity-90"
              >
                Vào ban/pick
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {shouldShowLobbyCompletedNotice ? (
        <section className="mx-auto w-full max-w-[1440px] px-4 md:px-8 py-6">
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              Match đã completed.
            </p>
            <p className="text-xs text-muted-foreground">
              Lobby page chỉ dùng cho giai đoạn trước/trong trận. Dữ liệu chi
              tiết sau trận nằm ở match detail page.
            </p>
            {numId ? (
              <Link
                to={buildMatchLink(numId)}
                className="inline-flex h-9 items-center rounded-md border border-primary/60 px-3 text-xs font-bold uppercase  text-primary hover:bg-primary/10"
              >
                Mở Match Detail
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {shouldShowLobbyUnsupportedNotice ? (
        <section className="mx-auto w-full max-w-[1440px] px-4 md:px-8 py-6">
          <div className="text-sm text-neutral-400">
            Lobby page hiện chỉ áp dụng cho Valorant.
          </div>
        </section>
      ) : null}

      {shouldShowEmbeddedBanPick ? (
        <section className="mx-auto w-full max-w-[1440px] px-4 pt-6 md:px-8">
          <BanPickBoard
            room={banPickRoom}
            teams={{
              team1: { name: match.team1.name, tag: match.team1.tag || match.team1.name },
              team2: { name: match.team2.name, tag: match.team2.tag || match.team2.name },
            }}
            isLoggedIn={Boolean(token)}
          />
        </section>
      ) : null}

      {shouldShowPendingMatchOverview ? (
        <PendingMatchOverviewPanel
          match={match}
          session={liveBanPickSession}
          matchGameIds={matchGameIds ?? []}
          linkedContext={linkedTeamContext}
        />
      ) : null}

      {shouldShowLobby &&
      !shouldShowEmbeddedBanPick &&
      !shouldShowPendingMatchOverview &&
      !isLineupPhase ? (
        <section className="mx-auto w-full max-w-[1440px] px-4 md:px-8 py-6">
          <div className="space-y-2">
            <p className="text-sm text-white">
              {banPickRoom.isLoading
                ? "Đang tải ban/pick..."
                : "Trận này chưa được BTC tạo phòng ban/pick."}
            </p>
            {banPickRoom.error ? (
              <p className="text-xs text-[#FF4A3D]">{banPickRoom.error}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {shouldShowPostMatchData ? (
        <>
          {match.gameType === "valorant" && match.valorantGames?.length ? (
            <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8">
              {hasBanPickTimeline ? (
                <div className="mb-8">
                  <BanPickTimelinePanel
                    timeline={banPickTimeline}
                    team1={match.team1}
                    team2={match.team2}
                  />
                </div>
              ) : null}
              <ValorantMatchResult
                games={match.valorantGames}
                team1={{
                  name: match.team1.name,
                  tag: match.team1.tag || match.team1.name,
                  apiTeamId: "Blue",
                }}
                team2={{
                  name: match.team2.name,
                  tag: match.team2.tag || match.team2.name,
                  apiTeamId: "Red",
                }}
              />
            </div>
          ) : null}

          {/* Valorant / Liên Quân có tab ván riêng (kèm tỉ số) → bỏ hàng tỉ số từng map kiểu cũ */}
          {!(match.gameType === "valorant" && match.valorantGames?.length) &&
            !(match.gameType === "aov" && hasAovData) &&
            (hasMapData || hasBanPickTimeline) && (
            <div className="mx-auto w-full max-w-[1440px] px-4 md:px-8 py-6">
              <div
                className={`grid gap-4 ${
                  hasBanPickTimeline
                    ? "grid-cols-1 xl:grid-cols-[minmax(280px,1fr)_minmax(0,1.6fr)]"
                    : "grid-cols-1"
                }`}
              >
                {hasBanPickTimeline && (
                  <BanPickTimelinePanel
                    timeline={banPickTimeline}
                    team1={match.team1}
                    team2={match.team2}
                  />
                )}

                <div className="space-y-2.5">
                  {match.maps?.map((map, i) => (
                    <MapScoreRow
                      key={i}
                      map={map}
                      team1={match.team1}
                      team2={match.team2}
                    />
                  ))}

                  {!hasMapData && (
                    <div className="px-4 py-3 text-xs text-muted-foreground">
                      Chưa có dữ liệu tỉ số từng map.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {match.gameType === "valorant" && match.valorantGames?.length ? null : (
          <div className="mx-auto w-full max-w-[1440px] px-4 md:px-8 py-8 md:py-5 space-y-6">
            {!hasRosterData && !hasMapData && !hasBanPickTimeline ? (
              <section className="text-sm text-neutral-300">
                {isAovStatsLoading
                  ? "Đang tải dữ liệu sau trận..."
                  : shouldFetchAovStats
                    ? "Chưa có dữ liệu chi tiết. Hãy generate match_id ở trang AOV import, rồi dán vào Score Control (info_game_id) cho trận này."
                    : "Chưa có dữ liệu chi tiết cho trận đấu này."}
              </section>
            ) : (
              <>
                {!(
                  match.gameType === "aov" && hasAovData
                ) &&
                match.gameType !== "valorant" &&
                match.gameType !== "cs2" ? (
                  <section className="">
                    <RosterSection
                      match={match}
                      linkedContext={linkedTeamContext}
                    />
                  </section>
                ) : null}

                {(match.gameType === "cs2" ||
                  (match.gameType === "valorant" && !match.valorantGames?.length)) && (
                  <section>
                    <FPSStatTable
                      match={match}
                      linkedContext={linkedTeamContext}
                    />
                  </section>
                )}
                {(match.gameType === "lol" ||
                  match.gameType === "wildrift") && (
                  <section>
                    <MOBAStatTable match={match} />
                  </section>
                )}
                {match.gameType === "tft" && (
                  <section>
                    <TFTStatTable match={match} />
                  </section>
                )}
                {match.gameType === "aov" && hasAovData && (
                  <section>
                    <AOVStatTable match={match} />
                  </section>
                )}
              </>
            )}
          </div>
          )}
        </>
      ) : null}
    </div>
  );
};

export default MatchDetailPage;
