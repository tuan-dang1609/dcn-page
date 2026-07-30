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
  TOURNAMENT_PAGE_BG_CLASS,
  TOURNAMENT_PAGE_TITLE_CLASS,
  TOURNAMENT_PANEL_CLASS,
  TOURNAMENT_SUBTAB_ACTIVE,
  TOURNAMENT_SUBTAB_BASE,
  TOURNAMENT_SUBTAB_INACTIVE,
  TOURNAMENT_TABLE_HEADER_CLASS,
  TOURNAMENT_TABLE_HEADER_ROW_CLASS,
  TOURNAMENT_TABLE_MIN_CLASS,
  TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS,
  isAovGameSlug,
} from "@/components/tournamentTheme";

const medals = ["🥇", "🥈", "🥉"];
const PAGE_SIZE = 10;

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

const playerInitials = (name: string) => {
  const cleaned = String(name ?? "").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
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
  const showPlayerLeaderboard = isAovGameSlug(
    game ?? tournament?.short_name,
  );
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
              <Table className={TOURNAMENT_TABLE_MIN_CLASS}>
                <TableHeader>
                  <TableRow className={TOURNAMENT_TABLE_HEADER_ROW_CLASS}>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-24 text-center whitespace-nowrap`}
                    >
                      Hạng
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} min-w-[260px] whitespace-nowrap`}
                    >
                      Đội
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-20 text-center whitespace-nowrap`}
                    >
                      Thắng
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-20 text-center whitespace-nowrap`}
                    >
                      Thua
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-28 text-center whitespace-nowrap`}
                    >
                      Nhánh
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-28 text-center whitespace-nowrap`}
                    >
                      Điểm Thưởng
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
                        <TableCell className="text-center font-bold text-base">
                          {medal ? (
                            <span className="inline-flex items-center gap-1">
                              <span aria-hidden>{medal}</span>
                              <span>{placementText}</span>
                            </span>
                          ) : (
                            placementText
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <img
                              src={
                                row.logo_url ||
                                "https://dongchuyennghiep.vercel.app/image/waiting.png"
                              }
                              alt=""
                              className="w-10 h-10 object-cover shrink-0"
                            />
                            <span className="font-bold whitespace-nowrap">
                              {row.name ||
                                row.short_name ||
                                `Team ${row.team_id}`}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-bold text-primary whitespace-nowrap">
                          {row.wins}
                        </TableCell>
                        <TableCell className="text-center font-bold text-error whitespace-nowrap">
                          {row.losses}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-neutral-300 whitespace-nowrap">
                          {elimRoundText}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-foreground whitespace-nowrap">
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
            <p className="text-xs text-neutral-500">
              Hiện toàn bộ thành viên đăng ký. K/D/A, KDA và điểm TB chỉ hiện khi
              đã đấu từ {minGames} ván trở lên.
            </p>
          ) : null}

          {!isLoading && !isError && !playerRows.length ? (
            <p className="text-sm text-neutral-400">
              Chưa có thành viên nào trong giải này.
            </p>
          ) : null}

          <div>
            <div className={`${TOURNAMENT_PANEL_CLASS} w-full overflow-x-auto`}>
              <Table className="w-full min-w-[860px]">
                <TableHeader>
                  <TableRow className={TOURNAMENT_TABLE_HEADER_ROW_CLASS}>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-16 text-center whitespace-nowrap`}
                    >
                      Hạng
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} min-w-[220px] whitespace-nowrap`}
                    >
                      Người chơi
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-20 text-center whitespace-nowrap`}
                    >
                      Ván
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-24 text-center whitespace-nowrap`}
                    >
                      Điểm TB
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-28 text-center whitespace-nowrap`}
                    >
                      K / D / A
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-20 text-center whitespace-nowrap`}
                    >
                      KDA
                    </TableHead>
                    <TableHead
                      className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-24 text-center whitespace-nowrap`}
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
                        key={`${row.user_id ?? "ign"}-${row.ign}`}
                        className={TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS}
                      >
                        <TableCell
                          className={`text-center font-bold text-base ${
                            muted ? "text-neutral-500" : ""
                          }`}
                        >
                          {dash(row.rank)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            {row.profile_picture ? (
                              <img
                                src={row.profile_picture}
                                alt=""
                                className="h-9 w-9 shrink-0 object-cover"
                              />
                            ) : (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-neutral-600 bg-[#2d2d2d] text-[11px] font-bold text-neutral-300">
                                {playerInitials(row.display_name || row.ign)}
                              </div>
                            )}
                            <div className="min-w-0 leading-snug">
                              <div
                                className={`truncate font-bold ${
                                  muted ? "text-neutral-400" : "text-white"
                                }`}
                              >
                                {row.display_name || row.ign}
                              </div>
                              {row.team_short_name || row.team_name ? (
                                <div className="mt-0.5 truncate text-[11px] font-semibold uppercase text-neutral-500">
                                  {row.team_short_name || row.team_name}
                                </div>
                              ) : (
                                <div className="mt-0.5 text-[11px] font-semibold uppercase text-neutral-600">
                                  -
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-bold text-neutral-200 whitespace-nowrap">
                          {row.games_played}
                        </TableCell>
                        <TableCell
                          className={`text-center font-bold whitespace-nowrap tabular-nums ${
                            muted ? "text-neutral-500" : "text-primary"
                          }`}
                        >
                          {dash(row.avg_performance)}
                        </TableCell>
                        <TableCell
                          className={`text-center font-semibold whitespace-nowrap tabular-nums ${
                            muted ? "text-neutral-500" : "text-neutral-200"
                          }`}
                        >
                          {formatKdaLine(row)}
                        </TableCell>
                        <TableCell
                          className={`text-center font-bold whitespace-nowrap tabular-nums ${
                            muted ? "text-neutral-500" : "text-white"
                          }`}
                        >
                          {dash(row.kda)}
                        </TableCell>
                        <TableCell
                          className={`text-center font-semibold whitespace-nowrap tabular-nums ${
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
