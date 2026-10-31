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
  TOURNAMENT_TABLE_CELL_CLASS,
  TOURNAMENT_TABLE_HEADER_CLASS,
  TOURNAMENT_TABLE_HEADER_ROW_CLASS,
  TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS,
  isAovGameSlug,
} from "@/components/tournamentTheme";

/**
 * Bảng xếp hạng = xếp hạng tuyển thủ (không còn xếp hạng đội):
 *   - Giải cá nhân (TFT): thứ hạng / điểm từng người (mỗi người là 1 "đội ảo" — /results).
 *   - Valorant: ACS, K/D/A, ADR, HS% tổng hợp từ dữ liệu trận Riot (/player-stats).
 *   - LMHT: KDA, CS / vàng / sát thương mỗi phút từ match-v5 (/player-stats).
 *   - Liên Quân: điểm TB, K/D/A, vàng từ ảnh tổng kết (/player-stats).
 */

const medals = ["🥇", "🥈", "🥉"];
const PAGE_SIZE = 12;

type LeaderboardOutletContext = {
  tournament?: {
    id?: number | string;
    short_name?: string;
    registration_mode?: "org" | "individual" | string;
  };
  isLoading?: boolean;
};

const isValorantSlug = (value?: string | null) => {
  const slug = String(value ?? "").trim().toLowerCase();
  return slug === "val" || slug === "valorant";
};

const isLolSlug = (value?: string | null) => {
  const slug = String(value ?? "").trim().toLowerCase();
  return slug === "lol" || slug === "leagueoflegends";
};

const LOL_POSITION: Record<string, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "ADC",
  UTILITY: "Support",
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

const usePaged = <T,>(rows: T[], resetKey: unknown) => {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  useEffect(() => setPage(1), [resetKey]);
  useEffect(() => setPage((prev) => Math.min(prev, totalPages)), [totalPages]);
  const paged = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);
  return { page, setPage, totalPages, paged };
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

/** Ảnh + tên + đội của 1 tuyển thủ (dùng chung các bảng). */
const PlayerCell = ({ row, size = "md" }: { row: TournamentPlayerStatRow; size?: "sm" | "md" }) => {
  const muted = !row.qualified;
  return (
    <div className={`flex min-w-0 items-center ${size === "sm" ? "gap-2" : "gap-2.5"}`}>
      <img
        src={row.profile_picture || DEFAULT_USER_AVATAR_URL}
        alt=""
        className={`${size === "sm" ? "h-9 w-9" : "h-12 w-12"} shrink-0 object-cover`}
      />
      <div className="min-w-0 leading-snug">
        <div className={`truncate font-bold ${muted ? "text-neutral-400" : "text-white"}`}>
          {row.display_name || row.ign}
        </div>
        <div
          className={`mt-0.5 truncate font-semibold uppercase text-neutral-500 ${
            size === "sm" ? "text-[10px]" : "text-[11px] tracking-wide"
          }`}
        >
          {row.team_short_name || row.team_name || "-"}
        </div>
      </div>
    </div>
  );
};

/* ───────── Giải cá nhân (TFT): thứ hạng từng người ───────── */

const IndividualResultsTable = ({ tournamentId }: { tournamentId?: number | string }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: tournamentLeaderboardQueryKey(tournamentId),
    enabled: Boolean(tournamentId),
    queryFn: async () => fetchTournamentLeaderboardEnvelope(tournamentId!),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const rows = data?.data ?? [];
  const { page, setPage, totalPages, paged } = usePaged(rows, tournamentId);

  if (isLoading) return <PageLoader label="Đang tải bảng xếp hạng..." fullScreen={false} />;
  if (isError) return <p className="text-sm text-rose-400">Không tải được bảng xếp hạng từ API.</p>;
  if (!rows.length) return <p className="text-sm text-neutral-400">Chưa có dữ liệu xếp hạng cho giải này.</p>;

  return (
    <div>
      <div className={`${TOURNAMENT_PANEL_CLASS} w-full overflow-x-auto`}>
        <Table className="w-full min-w-0 max-md:table-fixed md:min-w-[760px]">
          <TableHeader>
            <TableRow className={TOURNAMENT_TABLE_HEADER_ROW_CLASS}>
              <TableHead className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-center w-[12%] md:w-24`}>
                <span className="md:hidden">#</span>
                <span className="hidden md:inline">Hạng</span>
              </TableHead>
              <TableHead className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-left w-[40%] md:w-auto`}>
                Thành viên
              </TableHead>
              <TableHead
                className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-left hidden whitespace-nowrap md:table-cell md:w-56`}
              >
                Riot ID
              </TableHead>
              <TableHead className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-center w-[16%] md:w-24`}>Thắng</TableHead>
              <TableHead className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-center w-[16%] md:w-24`}>Thua</TableHead>
              <TableHead
                className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-center hidden whitespace-nowrap md:table-cell md:w-56`}
              >
                Nhánh
              </TableHead>
              <TableHead className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-center w-[16%] md:w-36`}>
                <span className="md:hidden">Điểm</span>
                <span className="hidden md:inline">Điểm Thưởng</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((row: TournamentTeamResult) => {
              const placementText = row.placement_label ?? "-";
              const medal = toMedal(row.placement_label);
              const elimRoundText = (() => {
                const raw = String(row.elim_label ?? "").trim();
                if (!raw) {
                  return row.elim_round != null && row.elim_round > 0 ? `Vòng ${row.elim_round}` : "-";
                }
                return raw.replace(/^play[\s_-]*in\b/i, "Play-in").replace(/^play[\s_-]*off\b/i, "Play-off");
              })();
              return (
                <TableRow key={`${row.tournament_id}-${row.team_id}`} className={TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS}>
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
                        src={row.primary_profile_picture || row.logo_url || DEFAULT_USER_AVATAR_URL}
                        alt=""
                        className="h-10 w-10 shrink-0 object-cover md:h-12 md:w-12"
                      />
                      <div className="min-w-0 leading-snug">
                        <span className="block truncate font-bold text-white">
                          {row.primary_nickname || row.name || row.short_name || `Player ${row.team_id}`}
                        </span>
                        {row.primary_riot_account ? (
                          <span className="mt-0.5 block truncate text-[11px] font-medium text-neutral-400 md:hidden">
                            {row.primary_riot_account}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden px-4 py-4 text-sm font-semibold text-neutral-200 md:table-cell">
                    {row.primary_riot_account || "—"}
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
      <LeaderboardPager page={page} totalPages={totalPages} totalItems={rows.length} onPageChange={setPage} />
    </div>
  );
};

/* ───────── Tuyển thủ: cột theo game ───────── */

type StatColumn = {
  key: string;
  label: string;
  mobileLabel?: string;
  /** Hiện cả trên bảng mobile (5 cột). */
  mobile?: boolean;
  width: string;
  render: (row: TournamentPlayerStatRow) => string | number;
  tone?: "primary" | "strong" | "soft";
};

const VALORANT_COLUMNS: StatColumn[] = [
  { key: "games", label: "Map", mobile: true, width: "w-16", render: (row) => row.games_played, tone: "soft" },
  { key: "wins", label: "Thắng", width: "w-16", render: (row) => (row.qualified ? dash(row.wins) : "-"), tone: "soft" },
  { key: "acs", label: "ACS", mobile: true, width: "w-20", render: (row) => dash(row.acs), tone: "primary" },
  { key: "kda_line", label: "K / D / A", width: "w-28", render: formatKdaLine, tone: "soft" },
  { key: "kda", label: "KDA", mobile: true, width: "w-20", render: (row) => dash(row.kda), tone: "strong" },
  { key: "adr", label: "ADR", width: "w-16", render: (row) => dash(row.adr), tone: "soft" },
  {
    key: "hs",
    label: "HS%",
    width: "w-16",
    render: (row) => (row.qualified && row.hs_pct != null ? `${row.hs_pct}%` : "-"),
    tone: "soft",
  },
  {
    key: "fkfd",
    label: "FK / FD",
    width: "w-24",
    render: (row) => (row.qualified ? `${row.first_kills ?? 0} / ${row.first_deaths ?? 0}` : "-"),
    tone: "soft",
  },
];

const LOL_COLUMNS: StatColumn[] = [
  { key: "games", label: "Ván", mobile: true, width: "w-16", render: (row) => row.games_played, tone: "soft" },
  { key: "wins", label: "Thắng", width: "w-16", render: (row) => (row.qualified ? dash(row.wins) : "-"), tone: "soft" },
  {
    key: "pos",
    label: "Vị trí",
    width: "w-20",
    render: (row) => (row.main_position ? LOL_POSITION[row.main_position] ?? row.main_position : "-"),
    tone: "soft",
  },
  { key: "kda", label: "KDA", mobile: true, width: "w-20", render: (row) => dash(row.kda), tone: "primary" },
  { key: "kda_line", label: "K / D / A", width: "w-28", render: formatKdaLine, tone: "soft" },
  { key: "cs", label: "CS/p", mobile: true, width: "w-16", render: (row) => dash(row.cs_per_min), tone: "strong" },
  { key: "gold", label: "Vàng/p", width: "w-20", render: (row) => dash(row.gold_per_min), tone: "soft" },
  { key: "dmg", label: "ST/p", width: "w-20", render: (row) => dash(row.damage_per_min), tone: "soft" },
  { key: "vision", label: "Tầm nhìn", width: "w-20", render: (row) => dash(row.vision_per_game), tone: "soft" },
];

const AOV_COLUMNS: StatColumn[] = [
  { key: "games", label: "Ván", mobile: true, width: "w-16", render: (row) => row.games_played, tone: "soft" },
  {
    key: "perf",
    label: "Điểm TB",
    mobileLabel: "Điểm",
    mobile: true,
    width: "w-24",
    render: (row) => dash(row.avg_performance),
    tone: "primary",
  },
  { key: "kda_line", label: "K / D / A", width: "w-28", render: formatKdaLine, tone: "soft" },
  { key: "kda", label: "KDA", mobile: true, width: "w-20", render: (row) => dash(row.kda), tone: "strong" },
  {
    key: "gold",
    label: "Vàng TB",
    width: "w-24",
    render: (row) => (row.qualified && row.avg_gold != null ? row.avg_gold.toLocaleString("vi-VN") : "-"),
    tone: "soft",
  },
];

const toneClass = (column: StatColumn, muted: boolean) => {
  if (muted) return "text-neutral-500";
  if (column.tone === "primary") return "text-primary";
  if (column.tone === "strong") return "text-white";
  return "text-neutral-200";
};

const PlayerStatsTables = ({ rows, columns }: { rows: TournamentPlayerStatRow[]; columns: StatColumn[] }) => {
  const { page, setPage, totalPages, paged } = usePaged(rows, columns);
  const mobileColumns = columns.filter((column) => column.mobile);

  return (
    <div>
      {/* Mobile: bảng gọn vừa màn hình */}
      <div className={`${TOURNAMENT_PANEL_CLASS} lg:hidden`}>
        <table className="w-full table-fixed border-collapse text-[12px]">
          <thead>
            <tr className={TOURNAMENT_TABLE_HEADER_ROW_CLASS}>
              <th className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-[10%] !text-center`}>#</th>
              <th className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-[40%] !text-left`}>Người chơi</th>
              {mobileColumns.map((column) => (
                <th key={column.key} className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-center`}>
                  {column.mobileLabel ?? column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row) => {
              const muted = !row.qualified;
              return (
                <tr key={`m-${row.user_id ?? "ign"}-${row.ign}`} className={TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS}>
                  <td className={`px-1.5 py-2.5 text-center font-bold ${muted ? "text-neutral-500" : "text-white"}`}>
                    {dash(row.rank)}
                  </td>
                  <td className="px-1.5 py-2.5">
                    <PlayerCell row={row} size="sm" />
                  </td>
                  {mobileColumns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-1.5 py-2.5 text-center font-bold tabular-nums ${toneClass(column, muted)}`}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* PC: bảng đầy đủ */}
      <div className={`${TOURNAMENT_PANEL_CLASS} hidden w-full overflow-x-auto lg:block`}>
        <Table className="w-full min-w-[860px]">
          <TableHeader>
            <TableRow className={TOURNAMENT_TABLE_HEADER_ROW_CLASS}>
              <TableHead className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-16 !text-center`}>Hạng</TableHead>
              <TableHead className={`${TOURNAMENT_TABLE_HEADER_CLASS} min-w-[200px] !text-left`}>Người chơi</TableHead>
              {columns.map((column) => (
                <TableHead key={column.key} className={`${TOURNAMENT_TABLE_HEADER_CLASS} ${column.width} !text-center`}>
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((row) => {
              const muted = !row.qualified;
              return (
                <TableRow key={`d-${row.user_id ?? "ign"}-${row.ign}`} className={TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS}>
                  <TableCell
                    className={`${TOURNAMENT_TABLE_CELL_CLASS} !text-center font-bold text-base ${
                      muted ? "text-neutral-500" : "text-white"
                    }`}
                  >
                    {dash(row.rank)}
                  </TableCell>
                  <TableCell className={TOURNAMENT_TABLE_CELL_CLASS}>
                    <div className="flex items-center justify-between gap-3">
                      <PlayerCell row={row} />
                      {row.top_agents?.length ? (
                        <div className="flex shrink-0 gap-1" aria-label="Đặc vụ / tướng hay dùng">
                          {row.top_agents.map((agent) =>
                            agent.icon ? (
                              <img
                                key={agent.name}
                                src={agent.icon}
                                alt={agent.name}
                                title={`${agent.name} · ${agent.count} ván`}
                                className="h-7 w-7 object-cover"
                              />
                            ) : null,
                          )}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={`${TOURNAMENT_TABLE_CELL_CLASS} !text-center font-bold tabular-nums ${toneClass(column, muted)}`}
                    >
                      {column.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <LeaderboardPager page={page} totalPages={totalPages} totalItems={rows.length} onPageChange={setPage} />
    </div>
  );
};

const PlayerLeaderboard = ({
  tournamentId,
  isValorant,
  isLol,
}: {
  tournamentId?: number | string;
  isValorant: boolean;
  isLol: boolean;
}) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: tournamentPlayerStatsQueryKey(tournamentId),
    enabled: Boolean(tournamentId),
    queryFn: async () => fetchTournamentPlayerStatsEnvelope(tournamentId!),
    staleTime: 60000,
  });
  const rows = data?.data ?? [];
  const minGames = data?.min_games ?? (isValorant || isLol ? 2 : 3);
  const game = data?.game ?? (isValorant ? "valorant" : isLol ? "lol" : "aov");
  const valorant = game === "valorant";
  const columns = valorant ? VALORANT_COLUMNS : game === "lol" ? LOL_COLUMNS : AOV_COLUMNS;

  if (isLoading) return <PageLoader label="Đang tải bảng xếp hạng..." fullScreen={false} />;
  if (isError) return <p className="text-sm text-rose-400">Không tải được bảng xếp hạng từ API.</p>;

  return (
    <>
      <p className={`${TOURNAMENT_PAGE_HINT_CLASS} hidden lg:block`}>
        {valorant
          ? `Toàn bộ thành viên đăng ký. Chỉ số lấy từ dữ liệu trận của Riot, hiện từ ${minGames} map trở lên; xếp theo ACS.`
          : game === "lol"
            ? `Toàn bộ thành viên đăng ký. Chỉ số lấy từ dữ liệu trận của Riot, hiện từ ${minGames} ván trở lên; xếp theo KDA.`
            : `Toàn bộ thành viên đăng ký. Stats hiện từ ${minGames} ván trở lên.`}
        {data?.pending_games ? ` Đang lấy thêm ${data.pending_games} map — tải lại sau ít phút.` : ""}
      </p>
      {!rows.length ? (
        <p className="text-sm text-neutral-400">Chưa có thành viên nào trong giải này.</p>
      ) : (
        <PlayerStatsTables rows={rows} columns={columns} />
      )}
    </>
  );
};

const LeaderboardPage = () => {
  const { game } = useParams();
  const { tournament, isLoading: isTournamentLoading } = useOutletContext<LeaderboardOutletContext>();

  const tournamentId = tournament?.id;
  const gameSlug = game ?? tournament?.short_name;
  const isIndividualMode = String(tournament?.registration_mode ?? "org").toLowerCase() === "individual";
  const isValorant = isValorantSlug(gameSlug);
  const isLol = isLolSlug(gameSlug);
  const hasPlayerStats = isValorant || isLol || isAovGameSlug(gameSlug);

  return (
    <div className={`space-y-5 ${TOURNAMENT_PAGE_BG_CLASS}`}>
      <h2 className={TOURNAMENT_PAGE_TITLE_CLASS}>Bảng xếp hạng</h2>
      {isTournamentLoading ? (
        <PageLoader label="Đang tải bảng xếp hạng..." fullScreen={false} />
      ) : isIndividualMode ? (
        <IndividualResultsTable tournamentId={tournamentId} />
      ) : hasPlayerStats ? (
        <PlayerLeaderboard tournamentId={tournamentId} isValorant={isValorant} isLol={isLol} />
      ) : (
        <p className="text-sm text-neutral-400">Chưa có bảng xếp hạng tuyển thủ cho game này.</p>
      )}
    </div>
  );
};

export default LeaderboardPage;
