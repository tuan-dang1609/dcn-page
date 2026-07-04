import { NavLink } from "react-router-dom";
import {
  TOURNAMENT_TAB_CARD_ACTIVE,
  TOURNAMENT_TAB_CARD_BASE,
  TOURNAMENT_TAB_CARD_INACTIVE,
  TOURNAMENT_TAB_CARD_LABEL,
  TOURNAMENT_TAB_CARD_TITLE,
} from "@/components/tournamentTheme";

type TournamentTabCardProps = {
  label?: string;
  title: string;
  isActive?: boolean;
  onClick?: () => void;
  to?: string;
  end?: boolean;
};

export const TournamentTabCard = ({
  label,
  title,
  isActive = false,
  onClick,
  to,
  end,
}: TournamentTabCardProps) => {
  const content = (
    <>
      {label ? (
        <span className={TOURNAMENT_TAB_CARD_LABEL}>{label}</span>
      ) : null}
      <span className={TOURNAMENT_TAB_CARD_TITLE}>{title}</span>
    </>
  );

  if (to) {
    return (
      <NavLink
        to={to}
        end={end}
        className={({ isActive: routeActive }) =>
          `${TOURNAMENT_TAB_CARD_BASE} ${
            routeActive
              ? TOURNAMENT_TAB_CARD_ACTIVE
              : TOURNAMENT_TAB_CARD_INACTIVE
          }`
        }
      >
        {content}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${TOURNAMENT_TAB_CARD_BASE} ${
        isActive ? TOURNAMENT_TAB_CARD_ACTIVE : TOURNAMENT_TAB_CARD_INACTIVE
      }`}
    >
      {content}
    </button>
  );
};
