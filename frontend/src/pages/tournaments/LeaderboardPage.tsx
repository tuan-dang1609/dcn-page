import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import {
  getTournamentResults,
  type TournamentTeamResult,
} from "@/api/tournaments";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

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
    queryKey: ["tournament-leaderboard", tournamentId],
    enabled: Boolean(tournamentId),
    queryFn: async () => {
      const response = await getTournamentResults(tournamentId!);
      return response.data;
    },
    staleTime: 15000,
  });

  const leaderboard = leaderboardEnvelope?.data ?? [];
  const rankingBracketId = leaderboardEnvelope?.ranking_bracket_id ?? null;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-heading">Bảng xếp hạng</h2>

      {isTournamentLoading || isLoading ? (
        <p className="text-smtext-[#EEEEEE]">Đang tải bảng xếp hạng...</p>
      ) : null}

      {isError ? (
        <p className="text-sm text-destructive">
          Không tải được bảng xếp hạng từ API.
        </p>
      ) : null}

      {!isLoading && !isError && !leaderboard.length ? (
        <p className="text-smtext-[#EEEEEE]">
          Chưa có dữ liệu xếp hạng cho giải này.
        </p>
      ) : null}

      <div className="neo-box bg-card overflow-x-auto">
        <Table className="min-w-[680px]">
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="w-24 text-center whitespace-nowrap">
                Hạng
              </TableHead>
              <TableHead className="min-w-[260px] whitespace-nowrap">
                Đội
              </TableHead>
              <TableHead className="w-20 text-center whitespace-nowrap">
                Thắng
              </TableHead>
              <TableHead className="w-20 text-center whitespace-nowrap">
                Thua
              </TableHead>
              <TableHead className="w-28 text-center whitespace-nowrap">
                Điểm Thưởng
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaderboard.map((row: TournamentTeamResult) => {
              const placementText = row.placement_label ?? "-";
              return (
                <TableRow
                  key={`${row.tournament_id}-${row.team_id}`}
                  className="border-border/50 hover:bg-muted/30"
                >
                  <TableCell className="text-center font-bold text-base">
                    {` ${placementText}`}
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
