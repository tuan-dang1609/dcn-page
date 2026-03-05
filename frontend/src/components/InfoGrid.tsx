import {
  Gamepad2,
  Users,
  UserCheck,
  Trophy,
  CalendarDays,
  CalendarCheck,
} from "lucide-react";

type TournamentInfo = {
  game_name?: string;
  short_name?: string;
  icon_game_url?: string;
  max_player_per_team?: number;
  max_participate?: number;
  total_prize?: number | string;
  date_start?: string;
  date_end?: string;
};

type InfoGridProps = {
  tournament?: TournamentInfo;
  isLoading?: boolean;
};

const formatDateTime = (value?: string) => {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

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
  isLoading ? "..." : value;

const InfoGrid = ({ tournament, isLoading = false }: InfoGridProps) => {
  const infoItems = [
    {
      icon: Gamepad2,
      label: "GAME",
      value: displayValue(
        isLoading,
        tournament?.game_name ?? tournament?.short_name ?? "--",
      ),
      imageUrl: tournament?.icon_game_url,
    },
    {
      icon: Users,
      label: "SỐ NGƯỜI TRONG ĐỘI",
      value: displayValue(
        isLoading,
        String(tournament?.max_player_per_team ?? "--"),
      ),
      color: "bg-accent",
    },
    {
      icon: UserCheck,
      label: "GIỚI HẠN",
      value: displayValue(
        isLoading,
        String(tournament?.max_participate ?? "--"),
      ),
      color: "bg-secondary",
    },
    {
      icon: Trophy,
      label: "TỔNG GIẢI THƯỞNG",
      value: displayValue(
        isLoading,
        tournament?.total_prize ? `${tournament.total_prize} VND` : "0 VND",
      ),
      color: "bg-accent",
    },
    {
      icon: CalendarDays,
      label: "BẮT ĐẦU",
      value: displayValue(isLoading, formatDateTime(tournament?.date_start)),
      color: "bg-success",
    },
    {
      icon: CalendarCheck,
      label: "KẾT THÚC",
      value: displayValue(isLoading, formatDateTime(tournament?.date_end)),
      color: "bg-secondary",
    },
  ];

  return (
    <div>
      <h2 className="text-2xl mb-4 font-bold">Thông tin</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {infoItems.map((item) => (
          <div
            key={item.label}
            className="bg-card border border-border rounded-lg p-4 flex items-center gap-4 hover:border-primary/30 transition-colors"
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={`${item.label} icon`}
                className="w-10 h-10  object-cover"
              />
            ) : (
              <div className={` p-1 rounded-lg`}>
                <item.icon className="w-8 h-8 text-foreground" />
              </div>
            )}

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {item.label}
              </p>
              <p className="font-bold text-foreground">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default InfoGrid;
