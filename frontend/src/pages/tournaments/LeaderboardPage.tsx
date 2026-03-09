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

      {rankingBracketId ? (
        <p className="text-xs text-muted-foreground">
          Đang tính điểm theo bracket chỉ định: #{rankingBracketId}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Chưa chỉ định bracket tính điểm, hệ thống đang tổng hợp từ toàn bộ
          bracket của giải.
        </p>
      )}

      {isTournamentLoading || isLoading ? (
        <p className="text-sm text-muted-foreground">
          Đang tải bảng xếp hạng...
        </p>
      ) : null}

      {isError ? (
        <p className="text-sm text-destructive">
          Không tải được bảng xếp hạng từ API.
        </p>
      ) : null}

      {!isLoading && !isError && !leaderboard.length ? (
        <p className="text-sm text-muted-foreground">
          Chưa có dữ liệu xếp hạng cho giải này.
        </p>
      ) : null}

      <div className="neo-box bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="w-24 text-center">Hạng</TableHead>
              <TableHead>Đội</TableHead>
              <TableHead className="text-center">Thắng</TableHead>
              <TableHead className="text-center">Thua</TableHead>
              <TableHead className="text-center">Điểm</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaderboard.map((row: TournamentTeamResult) => {
              const medal = toMedal(row.placement_label);
              const placementText = row.placement_label ?? "Tam tinh";
              return (
                <TableRow
                  key={`${row.tournament_id}-${row.team_id}`}
                  className="border-border/50 hover:bg-muted/30"
                >
                  <TableCell className="text-center font-bold text-base">
                    {medal ? `${medal} ${placementText}` : placementText}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <img
                        src={
                          row.logo_url ||
                          "https://dongchuyennghiep.vercel.app/image/waiting.png"
                        }
                        alt=""
                        className="w-10 h-10 object-cover"
                      />
                      <span className="font-bold">
                        {row.name || row.short_name || `Team ${row.team_id}`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-bold text-primary">
                    {row.wins}
                  </TableCell>
                  <TableCell className="text-center font-bold text-error">
                    {row.losses}
                  </TableCell>
                  <TableCell className="text-center font-semibold text-foreground">
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
