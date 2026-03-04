import { useMemo } from "react";
import { singleElimMatches, getLeaderboard, TOURNAMENT_LOGO } from "@/data/tournament";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";

const medals = ["🥇", "🥈", "🥉"];

const LeaderboardPage = () => {
  const leaderboard = useMemo(() => getLeaderboard(singleElimMatches), []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-heading">Bảng xếp hạng</h2>
      <div className="neo-box bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="w-16 text-center">#</TableHead>
              <TableHead>Người chơi</TableHead>
              <TableHead className="text-center">Thắng</TableHead>
              <TableHead className="text-center">Thua</TableHead>
              <TableHead className="text-center">Vòng đạt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaderboard.map((row, i) => (
              <TableRow key={row.player} className="border-border/50 hover:bg-muted/30">
                <TableCell className="text-center font-bold text-lg">
                  {i < 3 ? medals[i] : i + 1}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <img src={TOURNAMENT_LOGO} alt="" className="w-5 h-5 rounded-sm" />
                    <span className="font-bold">{row.player}</span>
                  </div>
                </TableCell>
                <TableCell className="text-center font-bold text-primary">{row.wins}</TableCell>
                <TableCell className="text-center font-bold text-secondary">{row.losses}</TableCell>
                <TableCell className="text-center">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    row.roundReached === "Chung kết" ? "bg-primary/20 text-primary" :
                    row.roundReached === "Bán kết" ? "bg-accent/20 text-accent" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {row.roundReached}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default LeaderboardPage;
