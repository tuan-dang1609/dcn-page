const HeroBanner = ({ tournament }) => {
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
  return (
    <div className="relative w-full h-[350px] md:h-[420px] overflow-hidden border-b-[3px] border-border">
      <img
        src={tournament?.banner_url}
        alt="TFT Tournament Banner"
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/30 to-transparent" />
      <div className="absolute bottom-0 left-0 p-6 md:p-10">
        <span className="inline-block bg-secondary text-secondary-foreground px-3 py-1 text-sm font-bold neo-box-sm mb-3">
          {formatDateTime(tournament?.date_start)}
        </span>
        <h1 className="text-3xl md:text-5xl text-background font-bold leading-tight mb-2">
          {tournament?.name}
        </h1>
        <p className="text-background/80 text-sm">
          Tổ chức bởi{" "}
          <span className="font-bold text-primary">
            {tournament?.created_by.nickname}
          </span>
        </p>
      </div>
    </div>
  );
};

export default HeroBanner;
