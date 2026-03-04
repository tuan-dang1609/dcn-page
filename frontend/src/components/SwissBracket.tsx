import { swissMatches, TOURNAMENT_LOGO, type SwissMatch } from "@/data/tournament";
import { Link } from "react-router-dom";

const SwissMatchCard = ({ match }: { match: SwissMatch }) => {
  const { id, p1, p2, s1, s2, winner } = match;
  return (
    <Link to={`/bracket/${id}`} className="block neo-box-sm overflow-hidden hover:ring-1 hover:ring-primary/50 transition-all">
      <div className={`flex items-center justify-between px-3 py-2 border-b border-border/40 ${winner === p1 ? "bg-primary/20 font-semibold" : "bg-card"}`}>
        <span className="flex items-center gap-2 text-sm truncate">
          <img src={TOURNAMENT_LOGO} alt="" className="w-4 h-4 rounded-sm" />
          {p1}
        </span>
        <span className="text-sm font-bold">{s1}</span>
      </div>
      <div className={`flex items-center justify-between px-3 py-2 ${winner === p2 ? "bg-primary/20 font-semibold" : "bg-card"}`}>
        <span className="flex items-center gap-2 text-sm truncate">
          <img src={TOURNAMENT_LOGO} alt="" className="w-4 h-4 rounded-sm" />
          {p2}
        </span>
        <span className="text-sm font-bold">{s2}</span>
      </div>
    </Link>
  );
};

const SwissBracket = () => {
  const rounds = [1, 2, 3];

  return (
    <div className="space-y-8">
      {rounds.map(round => {
        const roundMatches = swissMatches.filter(m => m.round === round);
        return (
          <div key={round}>
            <h3 className="text-lg font-heading mb-4 text-muted-foreground">Vòng {round}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {roundMatches.map(m => (
                <SwissMatchCard key={m.id} match={m} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SwissBracket;
