export interface Match {
  id: number;
  p1: string;
  p2: string;
  s1: number | null;
  s2: number | null;
  winner: string | null;
}

export const players = [
  "Player 1", "Player 2", "Player 3", "Player 4",
  "Player 5", "Player 6", "Player 7", "Player 8",
];

export const TOURNAMENT_LOGO = "https://placehold.co/20x20/1a1a2e/e0e0e0?text=⚔";

// Single Elimination
export const singleElimMatches: Match[] = [
  { id: 1, p1: players[0], p2: players[1], s1: 3, s2: 1, winner: players[0] },
  { id: 2, p1: players[2], p2: players[3], s1: 0, s2: 3, winner: players[3] },
  { id: 3, p1: players[4], p2: players[5], s1: 3, s2: 2, winner: players[4] },
  { id: 4, p1: players[6], p2: players[7], s1: 1, s2: 3, winner: players[7] },
  { id: 5, p1: players[0], p2: players[3], s1: 3, s2: 0, winner: players[0] },
  { id: 6, p1: players[4], p2: players[7], s1: 1, s2: 3, winner: players[7] },
  { id: 7, p1: players[0], p2: players[7], s1: null, s2: null, winner: null },
];

// Swiss bracket rounds
export interface SwissMatch {
  id: number;
  round: number;
  p1: string;
  p2: string;
  s1: number;
  s2: number;
  winner: string;
}

export const swissMatches: SwissMatch[] = [
  // Round 1
  { id: 101, round: 1, p1: players[0], p2: players[1], s1: 3, s2: 1, winner: players[0] },
  { id: 102, round: 1, p1: players[2], p2: players[3], s1: 2, s2: 3, winner: players[3] },
  { id: 103, round: 1, p1: players[4], p2: players[5], s1: 3, s2: 0, winner: players[4] },
  { id: 104, round: 1, p1: players[6], p2: players[7], s1: 1, s2: 3, winner: players[7] },
  // Round 2 (winners play winners, losers play losers)
  { id: 201, round: 2, p1: players[0], p2: players[3], s1: 3, s2: 2, winner: players[0] },
  { id: 202, round: 2, p1: players[4], p2: players[7], s1: 1, s2: 3, winner: players[7] },
  { id: 203, round: 2, p1: players[1], p2: players[2], s1: 3, s2: 1, winner: players[1] },
  { id: 204, round: 2, p1: players[5], p2: players[6], s1: 2, s2: 3, winner: players[6] },
  // Round 3
  { id: 301, round: 3, p1: players[0], p2: players[7], s1: 3, s2: 1, winner: players[0] },
  { id: 302, round: 3, p1: players[3], p2: players[1], s1: 2, s2: 3, winner: players[1] },
  { id: 303, round: 3, p1: players[4], p2: players[6], s1: 3, s2: 2, winner: players[4] },
  { id: 304, round: 3, p1: players[2], p2: players[5], s1: 3, s2: 0, winner: players[2] },
];

// Double elimination
export const doubleElimWinners: Match[] = [
  // Winners R1
  { id: 501, p1: players[0], p2: players[1], s1: 3, s2: 1, winner: players[0] },
  { id: 502, p1: players[2], p2: players[3], s1: 0, s2: 3, winner: players[3] },
  { id: 503, p1: players[4], p2: players[5], s1: 3, s2: 2, winner: players[4] },
  { id: 504, p1: players[6], p2: players[7], s1: 1, s2: 3, winner: players[7] },
  // Winners R2
  { id: 505, p1: players[0], p2: players[3], s1: 3, s2: 1, winner: players[0] },
  { id: 506, p1: players[4], p2: players[7], s1: 2, s2: 3, winner: players[7] },
  // Winners Final
  { id: 507, p1: players[0], p2: players[7], s1: 3, s2: 2, winner: players[0] },
];

export const doubleElimLosers: Match[] = [
  // Losers R1
  { id: 601, p1: players[1], p2: players[2], s1: 3, s2: 1, winner: players[1] },
  { id: 602, p1: players[5], p2: players[6], s1: 2, s2: 3, winner: players[6] },
  // Losers R2
  { id: 603, p1: players[1], p2: players[4], s1: 1, s2: 3, winner: players[4] },
  { id: 604, p1: players[6], p2: players[3], s1: 3, s2: 2, winner: players[6] },
  // Losers Semi
  { id: 605, p1: players[4], p2: players[6], s1: 3, s2: 1, winner: players[4] },
  // Losers Final
  { id: 606, p1: players[4], p2: players[7], s1: 2, s2: 3, winner: players[7] },
];

export const grandFinal: Match = {
  id: 700, p1: players[0], p2: players[7], s1: 3, s2: 2, winner: players[0],
};

// Utility
export function getPlayerJourney(player: string, matches: Match[]): Set<number> {
  const ids = new Set<number>();
  matches.forEach((m) => {
    if (m.p1 === player || m.p2 === player) ids.add(m.id);
  });
  return ids;
}

export function getLeaderboard(matches: Match[]): { player: string; wins: number; losses: number; roundReached: string }[] {
  const stats: Record<string, { wins: number; losses: number; lastMatchId: number }> = {};
  
  players.forEach(p => {
    stats[p] = { wins: 0, losses: 0, lastMatchId: 0 };
  });

  matches.forEach(m => {
    if (!m.winner) return;
    if (m.p1 === m.winner) {
      stats[m.p1].wins++;
      stats[m.p2].losses++;
    } else {
      stats[m.p2].wins++;
      stats[m.p1].losses++;
    }
    stats[m.p1].lastMatchId = Math.max(stats[m.p1].lastMatchId, m.id);
    stats[m.p2].lastMatchId = Math.max(stats[m.p2].lastMatchId, m.id);
  });

  const getRound = (matchId: number) => {
    if (matchId >= 7) return "Chung kết";
    if (matchId >= 5) return "Bán kết";
    return "Tứ kết";
  };

  return Object.entries(stats)
    .map(([player, s]) => ({
      player,
      wins: s.wins,
      losses: s.losses,
      roundReached: getRound(s.lastMatchId),
      _lastMatchId: s.lastMatchId,
    }))
    .sort((a, b) => {
      if (b._lastMatchId !== a._lastMatchId) return b._lastMatchId - a._lastMatchId;
      return b.wins - a.wins;
    });
}
