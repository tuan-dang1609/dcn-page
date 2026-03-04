import { players, TOURNAMENT_LOGO } from "@/data/tournament";

const PlayersPage = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-heading">Người chơi</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {players.map((player, i) => (
          <div key={player} className="neo-box-sm bg-card p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/20 text-primary font-bold text-sm">
              {i + 1}
            </div>
            <div className="flex items-center gap-2">
              <img src={TOURNAMENT_LOGO} alt="" className="w-5 h-5 rounded-sm" />
              <span className="font-bold">{player}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlayersPage;
