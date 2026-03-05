import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { singleElimMatches, getPlayerJourney, TOURNAMENT_LOGO, type Match } from "@/data/tournament";

const CARD_W = 240;
const ROW_H = 36;
const CARD_H = ROW_H * 2;
const CONN_W = 48;
const QF_GAP = 24;
const QF_PAIR_GAP = 56;

const qfPairH = 2 * CARD_H + QF_GAP;
const qfTops = [
  0,
  CARD_H + QF_GAP,
  qfPairH + QF_PAIR_GAP,
  qfPairH + QF_PAIR_GAP + CARD_H + QF_GAP,
];

const sfTops = [
  (qfTops[0] + qfTops[1] + CARD_H) / 2 - CARD_H / 2,
  (qfTops[2] + qfTops[3] + CARD_H) / 2 - CARD_H / 2,
];

const finalTop = (sfTops[0] + sfTops[1] + CARD_H) / 2 - CARD_H / 2;
const totalH = qfTops[3] + CARD_H;
const HEADER_H = 28;

const connectorPairs = [
  { from: [1, 2], to: 5 },
  { from: [3, 4], to: 6 },
  { from: [5, 6], to: 7 },
];

const connectorPairs4 = [{ from: [1, 2], to: 3 }];

interface PlayerRowProps {
  name: string;
  score: number | null;
  isWinner: boolean;
  isHoveredPlayer: boolean;
  hasHover: boolean;
  isTop?: boolean;
  onHover: (p: string | null) => void;
}

const PlayerRow = ({ name, score, isWinner, isHoveredPlayer, hasHover, isTop, onHover }: PlayerRowProps) => {
  const bg = hasHover
    ? isHoveredPlayer ? "bg-primary text-primary-foreground" : "bg-card"
    : isWinner ? "bg-primary/20" : "bg-card";

  const textCls = hasHover
    ? isHoveredPlayer ? "font-bold" : "text-muted-foreground"
    : isWinner ? "font-semibold" : "";

  return (
    <div
      className={`flex items-center justify-between px-3 transition-colors duration-150 cursor-default ${bg} ${textCls} ${isTop ? "border-b border-border/40" : ""}`}
      style={{ height: ROW_H }}
      onMouseEnter={() => onHover(name)}
      onMouseLeave={() => onHover(null)}
    >
      <span className="flex items-center gap-2 text-sm truncate flex-1">
        <img src={TOURNAMENT_LOGO} alt="" className="w-4 h-4 rounded-sm" />
        {name}
      </span>
      <span className="text-sm font-bold ml-2 w-6 text-right">{score !== null ? score : "-"}</span>
    </div>
  );
};

const MatchCard = ({ match, hoveredPlayer, onHover }: { match: Match; hoveredPlayer: string | null; onHover: (p: string | null) => void }) => {
  const { id, p1, p2, s1, s2, winner } = match;
  const hasHover = hoveredPlayer !== null;

  return (
    <Link to={`/bracket/${id}`} className="block neo-box-sm overflow-hidden hover:ring-1 hover:ring-primary/50 transition-all" style={{ width: CARD_W }}>
      <PlayerRow name={p1} score={s1} isWinner={winner === p1} isHoveredPlayer={hoveredPlayer === p1} hasHover={hasHover} isTop onHover={onHover} />
      <PlayerRow name={p2} score={s2} isWinner={winner === p2} isHoveredPlayer={hoveredPlayer === p2} hasHover={hasHover} onHover={onHover} />
    </Link>
  );
};

const Connector = ({
  y1,
  y2,
  outY,
  hasHover,
  activeFrom,
  hasOutput,
}: {
  y1: number;
  y2: number;
  outY: number;
  hasHover: boolean;
  activeFrom: "top" | "bottom" | null;
  hasOutput: boolean;
}) => {
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const svgTop = Math.min(top, outY);
  const svgBottom = Math.max(bottom, outY);
  const svgH = svgBottom - svgTop + 2;

  const lY1 = y1 - svgTop + 1;
  const lY2 = y2 - svgTop + 1;
  const lOut = outY - svgTop + 1;
  const midX = CONN_W / 2;
  const baseOpacity = hasHover ? 0.2 : 1;
  const baseStroke = "hsl(var(--border))";
  const hiStroke = "hsl(var(--primary))";

  const fromY = activeFrom === "top" ? lY1 : activeFrom === "bottom" ? lY2 : null;

  return (
    <svg
      width={CONN_W}
      height={svgH}
      className="absolute transition-opacity duration-150"
      style={{ top: svgTop + HEADER_H, left: 0 }}
    >
      <line x1={0} y1={lY1} x2={midX} y2={lY1} stroke={baseStroke} strokeWidth={1.5} opacity={baseOpacity} />
      <line x1={0} y1={lY2} x2={midX} y2={lY2} stroke={baseStroke} strokeWidth={1.5} opacity={baseOpacity} />
      <line x1={midX} y1={lY1} x2={midX} y2={lY2} stroke={baseStroke} strokeWidth={1.5} opacity={baseOpacity} />
      <line x1={midX} y1={lOut} x2={CONN_W} y2={lOut} stroke={baseStroke} strokeWidth={1.5} opacity={baseOpacity} />

      {fromY !== null && hasOutput ? (
        <>
          <line x1={0} y1={fromY} x2={midX} y2={fromY} stroke={hiStroke} strokeWidth={2.5} />
          <line x1={midX} y1={fromY} x2={midX} y2={lOut} stroke={hiStroke} strokeWidth={2.5} />
          <line x1={midX} y1={lOut} x2={CONN_W} y2={lOut} stroke={hiStroke} strokeWidth={2.5} />
        </>
      ) : null}
    </svg>
  );
};

const SingleElimBracket = () => {
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null);
  const journeySet = useMemo(() => hoveredPlayer ? getPlayerJourney(hoveredPlayer, singleElimMatches) : null, [hoveredPlayer]);
  const isFourTeam = singleElimMatches.length <= 3;

  const matchMap = useMemo(() => {
    const m: Record<number, Match> = {};
    singleElimMatches.forEach(match => (m[match.id] = match));
    return m;
  }, []);

  const getConnState = (i: number): { activeFrom: "top" | "bottom" | null; hasOutput: boolean } => {
    if (!journeySet) return { activeFrom: null, hasOutput: false };

    const pair = isFourTeam ? connectorPairs4[i] : connectorPairs[i];
    const topInPath = journeySet.has(pair.from[0]);
    const bottomInPath = journeySet.has(pair.from[1]);
    const activeFrom = topInPath ? "top" : bottomInPath ? "bottom" : null;

    return {
      activeFrom,
      hasOutput: activeFrom !== null && journeySet.has(pair.to),
    };
  };

  const col1 = CARD_W;
  const col2 = CARD_W + CONN_W;
  const col3 = 2 * CARD_W + CONN_W;
  const col4 = 2 * CARD_W + 2 * CONN_W;
  const totalW = isFourTeam ? 2 * CARD_W + CONN_W : 3 * CARD_W + 2 * CONN_W;

  const sfTops4 = [0, CARD_H + QF_PAIR_GAP];
  const finalTop4 = (sfTops4[0] + sfTops4[1] + CARD_H) / 2 - CARD_H / 2;
  const totalH4 = sfTops4[1] + CARD_H;

  // Connector exits from midpoint between two player rows = center of card
  const qfMids = qfTops.map(t => t + CARD_H / 2);
  const sfMids = sfTops.map(t => t + CARD_H / 2);
  const finalMid = finalTop + CARD_H / 2;
  const sfMids4 = sfTops4.map(t => t + CARD_H / 2);
  const finalMid4 = finalTop4 + CARD_H / 2;

  if (isFourTeam) {
    return (
      <div className="relative" style={{ width: totalW, height: totalH4 + HEADER_H }}>
        <div className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider" style={{ left: 0, width: CARD_W, textAlign: "center", top: 0 }}>Bán kết</div>
        <div className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider" style={{ left: col2, width: CARD_W, textAlign: "center", top: 0 }}>Chung kết</div>

        {[1, 2].map((id, i) => (
          <div key={id} className="absolute" style={{ left: 0, top: sfTops4[i] + HEADER_H }}>
            <MatchCard match={matchMap[id]} hoveredPlayer={hoveredPlayer} onHover={setHoveredPlayer} />
          </div>
        ))}

        <div className="absolute" style={{ left: col1, width: CONN_W, top: 0, height: totalH4 + HEADER_H }}>
          <Connector
            y1={sfMids4[0]}
            y2={sfMids4[1]}
            outY={finalMid4}
            hasHover={hoveredPlayer !== null}
            activeFrom={getConnState(0).activeFrom}
            hasOutput={getConnState(0).hasOutput}
          />
        </div>

        <div className="absolute" style={{ left: col2, top: finalTop4 + HEADER_H }}>
          <MatchCard match={matchMap[3]} hoveredPlayer={hoveredPlayer} onHover={setHoveredPlayer} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: totalW, height: totalH + HEADER_H }}>
      <div className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider" style={{ left: 0, width: CARD_W, textAlign: "center", top: 0 }}>Tứ kết</div>
      <div className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider" style={{ left: col2, width: CARD_W, textAlign: "center", top: 0 }}>Bán kết</div>
      <div className="absolute text-xs font-bold text-muted-foreground uppercase tracking-wider" style={{ left: col4, width: CARD_W, textAlign: "center", top: 0 }}>Chung kết</div>

      {[1, 2, 3, 4].map((id, i) => (
        <div key={id} className="absolute" style={{ left: 0, top: qfTops[i] + HEADER_H }}>
          <MatchCard match={matchMap[id]} hoveredPlayer={hoveredPlayer} onHover={setHoveredPlayer} />
        </div>
      ))}

      <div className="absolute" style={{ left: col1, width: CONN_W, top: 0, height: totalH + HEADER_H }}>
        <Connector
          y1={qfMids[0]}
          y2={qfMids[1]}
          outY={sfMids[0]}
          hasHover={hoveredPlayer !== null}
          activeFrom={getConnState(0).activeFrom}
          hasOutput={getConnState(0).hasOutput}
        />
        <Connector
          y1={qfMids[2]}
          y2={qfMids[3]}
          outY={sfMids[1]}
          hasHover={hoveredPlayer !== null}
          activeFrom={getConnState(1).activeFrom}
          hasOutput={getConnState(1).hasOutput}
        />
      </div>

      {[5, 6].map((id, i) => (
        <div key={id} className="absolute" style={{ left: col2, top: sfTops[i] + HEADER_H }}>
          <MatchCard match={matchMap[id]} hoveredPlayer={hoveredPlayer} onHover={setHoveredPlayer} />
        </div>
      ))}

      <div className="absolute" style={{ left: col3, width: CONN_W, top: 0, height: totalH + HEADER_H }}>
        <Connector
          y1={sfMids[0]}
          y2={sfMids[1]}
          outY={finalMid}
          hasHover={hoveredPlayer !== null}
          activeFrom={getConnState(2).activeFrom}
          hasOutput={getConnState(2).hasOutput}
        />
      </div>

      <div className="absolute" style={{ left: col4, top: finalTop + HEADER_H }}>
        <MatchCard match={matchMap[7]} hoveredPlayer={hoveredPlayer} onHover={setHoveredPlayer} />
      </div>
    </div>
  );
};

export default SingleElimBracket;
