import { doubleElimWinners, doubleElimLosers, grandFinal, TOURNAMENT_LOGO, type Match } from "@/data/tournament";
import { Link } from "react-router-dom";

const MatchCard = ({ match }: { match: Match }) => {
  const { id, p1, p2, s1, s2, winner } = match;
  return (
    <Link to={`/bracket/${id}`} className="block neo-box-sm overflow-hidden hover:ring-1 hover:ring-primary/50 transition-all w-full max-w-[220px]">
      <div className={`flex items-center justify-between px-3 py-2 border-b border-border/40 ${winner === p1 ? "bg-primary/20 font-semibold" : "bg-card"}`}>
        <span className="flex items-center gap-2 text-sm truncate">
          <img src={TOURNAMENT_LOGO} alt="" className="w-4 h-4 rounded-sm" />
          {p1}
        </span>
        <span className="text-sm font-bold">{s1 !== null ? s1 : "-"}</span>
      </div>
      <div className={`flex items-center justify-between px-3 py-2 ${winner === p2 ? "bg-primary/20 font-semibold" : "bg-card"}`}>
        <span className="flex items-center gap-2 text-sm truncate">
          <img src={TOURNAMENT_LOGO} alt="" className="w-4 h-4 rounded-sm" />
          {p2}
        </span>
        <span className="text-sm font-bold">{s2 !== null ? s2 : "-"}</span>
      </div>
    </Link>
  );
};

const BracketSection = ({ title, matches, color }: { title: string; matches: Match[]; color: string }) => (
  <div className="space-y-4">
    <h3 className={`text-lg font-heading ${color}`}>{title}</h3>
    <div className="flex flex-wrap gap-4">
      {matches.map(m => (
        <MatchCard key={m.id} match={m} />
      ))}
    </div>
  </div>
);

const DoubleElimBracket = () => {
  return (
    <div className="space-y-8">
      <BracketSection title="🏆 Winners Bracket" matches={doubleElimWinners} color="text-primary" />
      <BracketSection title="💀 Losers Bracket" matches={doubleElimLosers} color="text-secondary" />
      <div className="space-y-4">
        <h3 className="text-lg font-heading text-accent">⚡ Grand Final</h3>
        <MatchCard match={grandFinal} />
      </div>
    </div>
  );
};

export default DoubleElimBracket;
