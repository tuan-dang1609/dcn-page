import { formatDateRange, formatTotalPrize, isIndividualTournament } from "@/lib/tournamentFormat";

type TournamentInfo = {
  game_name?: string;
  short_name?: string;
  max_player_per_team?: number | string;
  max_participate?: number;
  registered_count?: number;
  registration_mode?: "org" | "individual" | string;
  prizes?: Array<{ prize?: string }>;
  date_start?: string;
  date_end?: string;
};

type InfoGridProps = {
  tournament?: TournamentInfo | null;
  isLoading?: boolean;
  className?: string;
};

/** Các ô thông tin chính của giải — dùng ở trang tổng quan và đầu trang con. */
export const getTournamentFacts = (tournament?: TournamentInfo | null) => {
  const individual = isIndividualTournament(tournament?.registration_mode);
  const max = tournament?.max_participate;
  const count = tournament?.registered_count;

  return [
    {
      label: "Hình thức",
      value: individual
        ? "Cá nhân"
        : tournament?.max_player_per_team
          ? `Đội ${tournament.max_player_per_team} người`
          : "Theo đội",
    },
    {
      label: individual ? "Người chơi" : "Số đội",
      value:
        count != null && max ? `${count} / ${max}` : String(max ?? count ?? "—"),
    },
    { label: "Giải thưởng", value: formatTotalPrize(tournament?.prizes) },
    {
      label: "Thời gian",
      value: formatDateRange(tournament?.date_start, tournament?.date_end),
    },
  ];
};

/**
 * Hàng thông tin kiểu "bảng đấu in": kẻ 1px màu chữ phía trên, nhãn xám nhỏ,
 * giá trị đậm vừa. Không icon, không khung.
 */
const InfoGrid = ({ tournament, isLoading = false, className = "" }: InfoGridProps) => {
  const facts = getTournamentFacts(tournament);

  return (
    <dl
      className={`m-0 grid grid-cols-2 border-t border-[#F2F0EB] text-sm md:grid-cols-4 ${className}`}
    >
      {facts.map((fact) => (
        <div key={fact.label} className="py-2.5 pr-4">
          <dt className="text-xs text-[#9A9893]">{fact.label}</dt>
          <dd className="m-0 mt-1 font-semibold tabular-nums">
            {isLoading ? "…" : fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
};

export default InfoGrid;
