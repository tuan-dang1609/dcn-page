import { TOURNAMENT_LOGO } from "@/data/tournament";
import { BRACKET_TEAM_ICON_CLASS } from "@/components/bracketTheme";

export const isTbdTeam = (teamId?: number | null): boolean =>
  teamId === null ||
  teamId === undefined ||
  !Number.isFinite(Number(teamId)) ||
  Number(teamId) <= 0;

type BracketTeamIconProps = {
  teamId?: number | null;
  logoUrl?: string | null;
};

export const BracketTeamIcon = ({ teamId, logoUrl }: BracketTeamIconProps) => {
  if (isTbdTeam(teamId)) {
    return (
      <span className={BRACKET_TEAM_ICON_CLASS}>
        <span className="h-px w-2 bg-neutral-500" />
      </span>
    );
  }

  return (
    <span className={BRACKET_TEAM_ICON_CLASS}>
      <img
        src={logoUrl || TOURNAMENT_LOGO}
        alt=""
        className="h-full w-full object-cover"
      />
    </span>
  );
};
