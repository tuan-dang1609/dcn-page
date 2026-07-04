export const BRACKET_CONN_BASE_STROKE = "rgb(55, 65, 81)";
export const BRACKET_CONN_ACTIVE_STROKE = "rgb(52, 211, 153)";
export const BRACKET_CONN_DIM_OPACITY = 0.42;

export const bracketRowHoverClass = (
  hasHover: boolean,
  isHovered: boolean,
): string => {
  if (!hasHover) return "";
  return isHovered
    ? "text-white font-semibold"
    : "opacity-55 text-neutral-400";
};

export const bracketCardHoverClass = (
  hasHover: boolean,
  isInJourney: boolean,
): string => {
  if (!hasHover) return "opacity-100";
  return isInJourney ? "opacity-100" : "opacity-55";
};

export const isHoverableTeamId = (
  teamId: number | null | undefined,
): teamId is number =>
  typeof teamId === "number" && Number.isFinite(teamId) && teamId > 0;

export type BracketHover = {
  teamId: number;
  matchId: number;
  round: number;
};

export const getTeamJourneyMatchIds = <
  T extends { id: number; teamAId: number | null; teamBId: number | null },
>(
  matches: T[],
  hoveredTeamId: number | null,
): Set<number> | null => {
  if (hoveredTeamId === null) return null;
  return new Set(
    matches
      .filter(
        (match) =>
          match.teamAId === hoveredTeamId || match.teamBId === hoveredTeamId,
      )
      .map((match) => match.id),
  );
};

export const buildMatchProgressOrder = (
  matches: { id: number; round: number; matchNo: number }[],
): Map<number, number> => {
  const order = new Map<number, number>();

  [...matches]
    .sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round;
      if (a.matchNo !== b.matchNo) return a.matchNo - b.matchNo;
      return a.id - b.id;
    })
    .forEach((match, index) => {
      order.set(match.id, index);
    });

  return order;
};

const getMatchOrder = (
  orderMap: Map<number, number>,
  matchId: number,
): number => orderMap.get(matchId) ?? Number.MAX_SAFE_INTEGER;

/** Full connector when both matches are on the team's path (source → dest). */
export const isJourneyConnectorActive = (
  journeySet: Set<number> | null,
  source: { id: number },
  dest: { id: number },
  orderMap: Map<number, number>,
): boolean => {
  if (!journeySet) return false;
  if (!journeySet.has(source.id) || !journeySet.has(dest.id)) return false;
  return getMatchOrder(orderMap, source.id) <= getMatchOrder(orderMap, dest.id);
};
