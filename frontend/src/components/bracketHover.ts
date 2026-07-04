export const BRACKET_CONN_BASE_STROKE = "rgba(255,255,255,0.82)";
export const BRACKET_CONN_ACTIVE_STROKE = "rgb(52, 211, 153)";
export const BRACKET_CONN_DIM_OPACITY = 0.18;

export const bracketRowHoverClass = (
  hasHover: boolean,
  isHovered: boolean,
): string => {
  if (!hasHover) return "";
  return isHovered
    ? "brightness-125 text-white font-semibold"
    : "opacity-40 text-muted-foreground";
};

export const bracketCardHoverClass = (
  hasHover: boolean,
  isInJourney: boolean,
): string => {
  if (!hasHover || isInJourney) return "opacity-100";
  return "opacity-30";
};
