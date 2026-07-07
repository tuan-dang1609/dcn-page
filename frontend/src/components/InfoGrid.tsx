import {
  CalendarCheck,
  CalendarDays,
  Gamepad2,
  Trophy,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

type TournamentInfo = {
  game_name?: string;
  short_name?: string;
  icon_game_url?: string;
  max_player_per_team?: number;
  max_participate?: number;
  prizes?: Array<{ prize?: string }>;
  date_start?: string;
  date_end?: string;
};

type InfoGridProps = {
  tournament?: TournamentInfo;
  isLoading?: boolean;
};

type InfoItem = {
  icon: LucideIcon;
  label: string;
  value: string;
  imageUrl?: string | null;
};

const formatDateTime = (value?: string) => {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
};

const displayValue = (isLoading: boolean, value: string) =>
  isLoading ? "…" : value;

const parseVndAmounts = (text: string) => {
  const matches = text.matchAll(/(\d[\d.,\s]*)\s*VND/gi);
  let total = 0;

  for (const match of matches) {
    const digits = match[1].replace(/[^\d]/g, "");
    const amount = Number(digits);
    if (Number.isFinite(amount) && amount > 0) {
      total += amount;
    }
  }

  return total;
};

const formatTotalPrize = (prizes?: Array<{ prize?: string }>) => {
  if (!prizes?.length) return "—";

  const total = prizes.reduce(
    (sum, item) => sum + parseVndAmounts(String(item?.prize ?? "")),
    0,
  );

  if (total <= 0) return "—";

  return `${total.toLocaleString("vi-VN")} VND`;
};

const InfoGrid = ({ tournament, isLoading = false }: InfoGridProps) => {
  const infoItems: InfoItem[] = [
    {
      icon: Gamepad2,
      label: "Game",
      value: displayValue(
        isLoading,
        tournament?.game_name ?? tournament?.short_name ?? "—",
      ),
      imageUrl: tournament?.icon_game_url,
    },
    {
      icon: Users,
      label: "Số người trong đội",
      value: displayValue(
        isLoading,
        String(tournament?.max_player_per_team ?? "—"),
      ),
    },
    {
      icon: UserCheck,
      label: "Giới hạn",
      value: displayValue(
        isLoading,
        String(tournament?.max_participate ?? "—"),
      ),
    },
    {
      icon: Trophy,
      label: "Tổng giải thưởng",
      value: displayValue(isLoading, formatTotalPrize(tournament?.prizes)),
    },
    {
      icon: CalendarDays,
      label: "Bắt đầu",
      value: displayValue(isLoading, formatDateTime(tournament?.date_start)),
    },
    {
      icon: CalendarCheck,
      label: "Kết thúc",
      value: displayValue(isLoading, formatDateTime(tournament?.date_end)),
    },
  ];

  return (
    <section>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
        {infoItems.map((item) => (
          <div
            key={item.label}
            className="flex min-h-[72px] items-center gap-2.5 border border-neutral-700 bg-[#141414] p-2.5 sm:min-h-[76px] sm:gap-3 sm:p-3"
          >
            {item.imageUrl ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-neutral-600 bg-[#2d2d2d] sm:h-9 sm:w-9">
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-5 w-5 object-contain sm:h-6 sm:w-6"
                />
              </div>
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-neutral-600 bg-[#2d2d2d] sm:h-9 sm:w-9">
                <item.icon className="h-4 w-4 text-neutral-200 sm:h-5 sm:w-5" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-500 sm:text-[10px]">
                {item.label}
              </p>
              <p className="mt-0.5 text-xs font-bold leading-snug text-white sm:text-sm">
                <span className="line-clamp-2 break-words">{item.value}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default InfoGrid;
