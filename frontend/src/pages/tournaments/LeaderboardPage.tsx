import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import {
  fetchTournamentLeaderboardEnvelope,
  tournamentLeaderboardQueryKey,
} from "@/api/tournaments/queryFns";
import type { TournamentTeamResult } from "@/api/tournaments";
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
  TOURNAMENT_TABLE_HEADER_CLASS,
  TOURNAMENT_TABLE_HEADER_ROW_CLASS,
  TOURNAMENT_TABLE_MIN_CLASS,
  TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS,
} from "@/components/tournamentTheme";

const medals = ["🥇", "🥈", "🥉"];

type LeaderboardOutletContext = {
  tournament?: {
    id?: number | string;
  };
  isLoading?: boolean;
};

const toMedal = (placementLabel?: string | null) => {
  if (placementLabel === "1") return medals[0];
  if (placementLabel === "2") return medals[1];
  if (placementLabel === "3") return medals[2];
  return null;
};

const LeaderboardPage = () => {
  const { tournament, isLoading: isTournamentLoading } =
    useOutletContext<LeaderboardOutletContext>();

  const tournamentId = tournament?.id;

  const {
    data: leaderboardEnvelope,
    isLoading,
    isError,
  } = useQuery({
    queryKey: tournamentLeaderboardQueryKey(tournamentId),
    enabled: Boolean(tournamentId),
    queryFn: async () => fetchTournamentLeaderboardEnvelope(tournamentId!),
    staleTime: 60000,
  });

  const leaderboard = leaderboardEnvelope?.data ?? [];

  return (
    <div className={`space-y-5 ${TOURNAMENT_PAGE_BG_CLASS}`}>
      <h2 className={TOURNAMENT_PAGE_TITLE_CLASS}>Bảng xếp hạng</h2>

      {isTournamentLoading || isLoading ? (
        <PageLoader label="Đang tải bảng xếp hạng..." fullScreen={false} />
      ) : null}

      {isError ? (
        <p className="text-sm text-rose-400">
          Không tải được bảng xếp hạng từ API.
        </p>
      ) : null}

      {!isLoading && !isError && !leaderboard.length ? (
        <p className="text-sm text-neutral-400">
          Chưa có dữ liệu xếp hạng cho giải này.
        </p>
      ) : null}

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
                Điểm Thưởng
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaderboard.map((row: TournamentTeamResult) => {
              const placementText = row.placement_label ?? "-";
              const medal = toMedal(row.placement_label);
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
                        {row.name || row.short_name || `Team ${row.team_id}`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-bold text-primary whitespace-nowrap">
                    {row.wins}
                  </TableCell>
                  <TableCell className="text-center font-bold text-error whitespace-nowrap">
                    {row.losses}
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
    </div>
  );
};

export default LeaderboardPage;
