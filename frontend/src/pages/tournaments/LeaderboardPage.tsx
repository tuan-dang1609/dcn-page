import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  fetchTournamentLeaderboardEnvelope,
  fetchTournamentPlayerStatsEnvelope,
  tournamentLeaderboardQueryKey,
  tournamentPlayerStatsQueryKey,
} from "@/api/tournaments/queryFns";
import type {
  TournamentPlayerStatRow,
  TournamentTeamResult,
} from "@/api/tournaments";
import PageLoader from "@/components/PageLoader";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  DEFAULT_USER_AVATAR_URL,
  TOURNAMENT_PAGE_BG_CLASS,
  TOURNAMENT_PAGE_HINT_CLASS,
  TOURNAMENT_PAGE_TITLE_CLASS,
  TOURNAMENT_PANEL_CLASS,
  TOURNAMENT_SUBTAB_ACTIVE,
  TOURNAMENT_SUBTAB_BASE,
  TOURNAMENT_SUBTAB_INACTIVE,
  TOURNAMENT_TABLE_CELL_CLASS,
  TOURNAMENT_TABLE_HEADER_CLASS,
  TOURNAMENT_TABLE_HEADER_ROW_CLASS,
  TOURNAMENT_TABLE_MIN_CLASS,
  TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS,
  isAovGameSlug,
} from "@/components/tournamentTheme";

const medals = ["🥇", "🥈", "🥉"];
const PAGE_SIZE = 12;

type LeaderboardView = "teams" | "players";

type LeaderboardOutletContext = {
  tournament?: {
    id?: number | string;
    short_name?: string;
  };
  isLoading?: boolean;
};

const toMedal = (placementLabel?: string | null) => {
  if (placementLabel === "1") return medals[0];
  if (placementLabel === "2") return medals[1];
  if (placementLabel === "3") return medals[2];
  return null;
};

const dash = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === "" ? "-" : value;

const formatKdaLine = (row: TournamentPlayerStatRow) => {
  if (!row.qualified) return "-";
  return `${row.kills ?? 0} / ${row.deaths ?? 0} / ${row.assists ?? 0}`;
};

const LeaderboardPager = ({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (next: number) => void;
}) => {
  if (totalItems <= PAGE_SIZE) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-neutral-700 border-t-0 bg-[#141414] px-3 py-2.5">
      <p className="text-xs font-semibold text-neutral-500">
        Trang {page}/{totalPages} · {totalItems} mục
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex h-8 items-center gap-1 border border-neutral-700 px-2.5 text-xs font-bold uppercase text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Trước
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex h-8 items-center gap-1 border border-neutral-700 px-2.5 text-xs font-bold uppercase text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Sau
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

const LeaderboardPage = () => {
  const { game } = useParams();
  const { tournament, isLoading: isTournamentLoading } =
    useOutletContext<LeaderboardOutletContext>();

  const tournamentId = tournament?.id;
  const showPlayerLeaderboard = isAovGameSlug(game ?? tournament?.short_name);
  const [view, setView] = useState<LeaderboardView>("teams");
  const [teamPage, setTeamPage] = useState(1);
  const [playerPage, setPlayerPage] = useState(1);

  const activeView: LeaderboardView =
    showPlayerLeaderboard && view === "players" ? "players" : "teams";

  const {
    data: leaderboardEnvelope,
    isLoading: isTeamsLoading,
    isError: isTeamsError,
  } = useQuery({
    queryKey: tournamentLeaderboardQueryKey(tournamentId),
    enabled: Boolean(tournamentId),
    queryFn: async () => fetchTournamentLeaderboardEnvelope(tournamentId!),
    staleTime: 60000,
  });

  const {
    data: playerStatsEnvelope,
    isLoading: isPlayersLoading,
    isError: isPlayersError,
  } = useQuery({
    queryKey: tournamentPlayerStatsQueryKey(tournamentId),
    enabled: Boolean(tournamentId) && activeView === "players",
    queryFn: async () => fetchTournamentPlayerStatsEnvelope(tournamentId!),
    staleTime: 60000,
  });

  const leaderboard = leaderboardEnvelope?.data ?? [];
  const playerRows = playerStatsEnvelope?.data ?? [];
  const minGames = playerStatsEnvelope?.min_games ?? 3;

  const teamTotalPages = Math.max(1, Math.ceil(leaderboard.length / PAGE_SIZE));
  const playerTotalPages = Math.max(1, Math.ceil(playerRows.length / PAGE_SIZE));

  useEffect(() => {
    setTeamPage(1);
    setPlayerPage(1);
    setView("teams");
  }, [tournamentId]);

  useEffect(() => {
    if (!showPlayerLeaderboard && view === "players") {
      setView("teams");
    }
  }, [showPlayerLeaderboard, view]);

  useEffect(() => {
    setTeamPage((prev) => Math.min(prev, teamTotalPages));
  }, [teamTotalPages]);

  useEffect(() => {
    setPlayerPage((prev) => Math.min(prev, playerTotalPages));
  }, [playerTotalPages]);

  const pagedTeams = useMemo(() => {
    const start = (teamPage - 1) * PAGE_SIZE;
    return leaderboard.slice(start, start + PAGE_SIZE);
  }, [leaderboard, teamPage]);

  const pagedPlayers = useMemo(() => {
    const start = (playerPage - 1) * PAGE_SIZE;
    return playerRows.slice(start, start + PAGE_SIZE);
  }, [playerRows, playerPage]);

  const isLoading =
    isTournamentLoading ||
    (activeView === "teams" ? isTeamsLoading : isPlayersLoading);
  const isError = activeView === "teams" ? isTeamsError : isPlayersError;

  return (
    <div className={`space-y-5 ${TOURNAMENT_PAGE_BG_CLASS}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className={TOURNAMENT_PAGE_TITLE_CLASS}>Bảng xếp hạng</h2>
        {showPlayerLeaderboard ? (
          <div
            className="flex items-stretch"
            role="tablist"
            aria-label="Loại BXH"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "teams"}
              onClick={() => setView("teams")}
              className={`${TOURNAMENT_SUBTAB_BASE} ${
                activeView === "teams"
                  ? TOURNAMENT_SUBTAB_ACTIVE
                  : TOURNAMENT_SUBTAB_INACTIVE
              }`}
            >
              Đội
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "players"}
              onClick={() => setView("players")}
              className={`${TOURNAMENT_SUBTAB_BASE} -ml-px ${
                activeView === "players"
                  ? TOURNAMENT_SUBTAB_ACTIVE
                  : TOURNAMENT_SUBTAB_INACTIVE
              }`}
            >
              Cá nhân
            </button>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <PageLoader label="Đang tải bảng xếp hạng..." fullScreen={false} />
      ) : null}

      {isError ? (
        <p className="text-sm text-rose-400">
          Không tải được bảng xếp hạng từ API.
        </p>
      ) : null}

      {activeView === "teams" ? (
        <>
          {!isLoading && !isError && !leaderboard.length ? (
            <p className="text-sm text-neutral-400">
              Chưa có dữ liệu xếp hạng cho giải này.
            </p>
          ) : null}

          <div>
            <div className={`${TOURNAMENT_PANEL_CLASS} w-full overflow-x-auto`}>
              <Table className="w-full min-w-0 max-md:table-fixed md:min-w-[760px]">
                <TableHeader>
                  <TableRow className={TOURNAMENT_TABLE_HEADER_ROW_CLASS}>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-center w-[12%] md:w-24`}
                    >
                      <span className="md:hidden">#</span>
                      <span className="hidden md:inline">Hạng</span>
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-left w-[40%] md:w-auto`}
                    >
                      Đội
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-center w-[16%] md:w-24`}
                    >
                      Thắng
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-center w-[16%] md:w-24`}
                    >
                      Thua
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-center hidden whitespace-nowrap md:table-cell md:w-56`}
                    >
                      Nhánh
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-center w-[16%] md:w-36`}
                    >
                      <span className="md:hidden">Điểm</span>
                      <span className="hidden md:inline">Điểm Thưởng</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedTeams.map((row: TournamentTeamResult) => {
                    const placementText = row.placement_label ?? "-";
                    const medal = toMedal(row.placement_label);
                    const elimRoundText = (() => {
                      const raw = String(row.elim_label ?? "").trim();
                      if (!raw) {
                        return row.elim_round != null && row.elim_round > 0
                          ? `Vòng ${row.elim_round}`
                          : "-";
                      }
                      return raw
                        .replace(/^play[\s_-]*in\b/i, "Play-in")
                        .replace(/^play[\s_-]*off\b/i, "Play-off");
                    })();
                    return (
                      <TableRow
                        key={`${row.tournament_id}-${row.team_id}`}
                        className={TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS}
                      >
                        <TableCell className="!text-center px-2 py-2.5 text-[13px] font-bold text-white md:px-4 md:py-4 md:text-base">
                          {medal ? (
                            <span className="inline-flex items-center justify-center gap-1">
                              <span aria-hidden className="hidden md:inline">
                                {medal}
                              </span>
                              <span>{placementText}</span>
                            </span>
                          ) : (
                            placementText
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-2.5 text-[13px] md:px-4 md:py-4 md:text-sm">
                          <div className="flex min-w-0 items-center gap-2 md:gap-3">
                            <img
                              src={
                                row.logo_url ||
                                "https://dongchuyennghiep.vercel.app/image/waiting.png"
                              }
                              alt=""
                              className="h-8 w-8 shrink-0 object-cover md:h-10 md:w-10"
                            />
                            <span className="truncate font-bold text-white">
                              <span className="md:hidden">
                                {row.short_name ||
                                  row.name ||
                                  `Team ${row.team_id}`}
                              </span>
                              <span className="hidden md:inline">
                                {row.name ||
                                  row.short_name ||
                                  `Team ${row.team_id}`}
                              </span>
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="!text-center px-2 py-2.5 text-[13px] font-bold text-primary tabular-nums md:px-4 md:py-4 md:text-sm">
                          {row.wins}
                        </TableCell>
                        <TableCell className="!text-center px-2 py-2.5 text-[13px] font-bold text-error tabular-nums md:px-4 md:py-4 md:text-sm">
                          {row.losses}
                        </TableCell>
                        <TableCell className="!text-center hidden px-4 py-4 text-sm font-semibold whitespace-nowrap text-white md:table-cell">
                          {elimRoundText}
                        </TableCell>
                        <TableCell className="!text-center px-2 py-2.5 text-[13px] font-semibold text-white tabular-nums md:px-4 md:py-4 md:text-sm">
                          {row.points}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <LeaderboardPager
              page={teamPage}
              totalPages={teamTotalPages}
              totalItems={leaderboard.length}
              onPageChange={setTeamPage}
            />
          </div>
        </>
      ) : (
        <>
          {!isLoading && !isError ? (
            <p className={`${TOURNAMENT_PAGE_HINT_CLASS} hidden lg:block`}>
              Toàn bộ thành viên đăng ký. Stats hiện từ {minGames} ván trở lên.
            </p>
          ) : null}

          {!isLoading && !isError && !playerRows.length ? (
            <p className="text-sm text-neutral-400">
              Chưa có thành viên nào trong giải này.
            </p>
          ) : null}

          <div>
            {/* Mobile: bảng riêng 5 cột, luôn vừa màn hình — không dùng min-width PC */}
            <div className={`${TOURNAMENT_PANEL_CLASS} lg:hidden`}>
              <table className="w-full table-fixed border-collapse text-[12px]">
                <thead>
                  <tr className={TOURNAMENT_TABLE_HEADER_ROW_CLASS}>
                    <th
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-[10%] !text-center`}
                    >
                      #
                    </th>
                    <th
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-[40%] !text-left`}
                    >
                      Người chơi
                    </th>
                    <th
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-[14%] !text-center`}
                    >
                      Ván
                    </th>
                    <th
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-[18%] !text-center`}
                    >
                      Điểm
                    </th>
                    <th
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-[18%] !text-center`}
                    >
                      KDA
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPlayers.map((row) => {
                    const muted = !row.qualified;
                    return (
                      <tr
                        key={`m-${row.user_id ?? "ign"}-${row.ign}`}
                        className={TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS}
                      >
                        <td
                          className={`px-1.5 py-2.5 text-center font-bold ${
                            muted ? "text-neutral-500" : "text-white"
                          }`}
                        >
                          {dash(row.rank)}
                        </td>
                        <td className="px-1.5 py-2.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <img
                              src={
                                row.profile_picture || DEFAULT_USER_AVATAR_URL
                              }
                              alt=""
                              className="h-7 w-7 shrink-0 object-cover"
                            />
                            <div className="min-w-0 leading-snug">
                              <div
                                className={`truncate font-bold ${
                                  muted ? "text-neutral-400" : "text-white"
                                }`}
                              >
                                {row.display_name || row.ign}
                              </div>
                              <div className="mt-0.5 truncate text-[10px] font-semibold uppercase text-neutral-500">
                                {row.team_short_name || row.team_name || "-"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-1.5 py-2.5 text-center font-bold tabular-nums text-neutral-200">
                          {row.games_played}
                        </td>
                        <td
                          className={`px-1.5 py-2.5 text-center font-bold tabular-nums ${
                            muted ? "text-neutral-500" : "text-primary"
                          }`}
                        >
                          {dash(row.avg_performance)}
                        </td>
                        <td
                          className={`px-1.5 py-2.5 text-center font-bold tabular-nums ${
                            muted ? "text-neutral-500" : "text-white"
                          }`}
                        >
                          {dash(row.kda)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* PC: giữ nguyên bảng đầy đủ */}
            <div
              className={`${TOURNAMENT_PANEL_CLASS} hidden w-full overflow-x-auto lg:block`}
            >
              <Table className="w-full min-w-[860px]">
                <TableHeader>
                  <TableRow className={TOURNAMENT_TABLE_HEADER_ROW_CLASS}>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-16 !text-center`}
                    >
                      Hạng
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} min-w-[200px] !text-left`}
                    >
                      Người chơi
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-16 !text-center`}
                    >
                      Ván
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-24 !text-center`}
                    >
                      Điểm TB
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-28 !text-center`}
                    >
                      K / D / A
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-20 !text-center`}
                    >
                      KDA
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-24 !text-center`}
                    >
                      Vàng TB
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedPlayers.map((row) => {
                    const muted = !row.qualified;
                    return (
                      <TableRow
                        key={`d-${row.user_id ?? "ign"}-${row.ign}`}
                        className={TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS}
                      >
                        <TableCell
                          className={`${TOURNAMENT_TABLE_CELL_CLASS} !text-center font-bold text-base ${
                            muted ? "text-neutral-500" : "text-white"
                          }`}
                        >
                          {dash(row.rank)}
                        </TableCell>
                        <TableCell className={TOURNAMENT_TABLE_CELL_CLASS}>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <img
                              src={
                                row.profile_picture || DEFAULT_USER_AVATAR_URL
                              }
                              alt=""
                              className="h-10 w-10 shrink-0 object-cover"
                            />
                            <div className="min-w-0 leading-snug">
                              <div
                                className={`truncate font-bold ${
                                  muted ? "text-neutral-400" : "text-white"
                                }`}
                              >
                                {row.display_name || row.ign}
                              </div>
                              <div className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                                {row.team_short_name || row.team_name || "-"}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell
                          className={`${TOURNAMENT_TABLE_CELL_CLASS} !text-center font-bold text-neutral-200`}
                        >
                          {row.games_played}
                        </TableCell>
                        <TableCell
                          className={`${TOURNAMENT_TABLE_CELL_CLASS} !text-center font-bold tabular-nums ${
                            muted ? "text-neutral-500" : "text-primary"
                          }`}
                        >
                          {dash(row.avg_performance)}
                        </TableCell>
                        <TableCell
                          className={`${TOURNAMENT_TABLE_CELL_CLASS} !text-center font-semibold tabular-nums ${
                            muted ? "text-neutral-500" : "text-neutral-200"
                          }`}
                        >
                          {formatKdaLine(row)}
                        </TableCell>
                        <TableCell
                          className={`${TOURNAMENT_TABLE_CELL_CLASS} !text-center font-bold tabular-nums ${
                            muted ? "text-neutral-500" : "text-white"
                          }`}
                        >
                          {dash(row.kda)}
                        </TableCell>
                        <TableCell
                          className={`${TOURNAMENT_TABLE_CELL_CLASS} !text-center font-semibold tabular-nums ${
                            muted ? "text-neutral-500" : "text-neutral-300"
                          }`}
                        >
                          {row.qualified && row.avg_gold != null
                            ? row.avg_gold.toLocaleString("vi-VN")
                            : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <LeaderboardPager
              page={playerPage}
              totalPages={playerTotalPages}
              totalItems={playerRows.length}
              onPageChange={setPlayerPage}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default LeaderboardPage;
