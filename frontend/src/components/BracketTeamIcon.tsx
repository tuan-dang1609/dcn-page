import { useState } from "react";
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
  /** Tên đội — để hiện chữ cái đầu khi logo hỏng. */
  name?: string | null;
};

export const BracketTeamIcon = ({ teamId, logoUrl, name }: BracketTeamIconProps) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (isTbdTeam(teamId)) {
    return (
      <span className={BRACKET_TEAM_ICON_CLASS}>
        <span className="h-px w-2 bg-neutral-500" />
      </span>
    );
  }

  const src = logoUrl || TOURNAMENT_LOGO;
  // Ảnh lỗi (link hỏng) → chữ cái đầu tên đội thay cho icon ảnh vỡ
  if (failedSrc === src) {
    const initial = String(name ?? "").trim().charAt(0).toLocaleUpperCase("vi-VN") || "?";
    return (
      <span className={`${BRACKET_TEAM_ICON_CLASS} text-[10px] font-extrabold text-[#9A9893]`}>
        {initial}
      </span>
    );
  }

  return (
    <span className={BRACKET_TEAM_ICON_CLASS}>
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setFailedSrc(src)}
      />
    </span>
  );
};
