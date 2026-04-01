import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Calendar,
  Users,
  Trophy,
  ArrowRight,
  Search,
  Crown,
  Gamepad2,
  Target,
  Shield,
  UserPlus,
} from "lucide-react";
import {
  seriesInfo as fallbackSeriesInfo,
  Team as UiTeam,
  leaderboardEntries,
  placementPoints,
  tournamentIds,
  Tournament as UiTournament,
} from "@/data/series";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import {
  type SeriesParticipatingTeamResponse,
  type SeriesTournamentResponse,
} from "@/api/series";
import { useSeriesById } from "@/hooks/useSeriesById";

const fallbackTournaments: UiTournament[] = [];
const fallbackTeams: UiTeam[] = [];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

/* ── Scroll Section wrapper ── */
const Section = ({
  children,
  className = "",
  stagger = false,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: boolean;
}) => {
  const { ref, isVisible } = useScrollReveal(0.1);
  return (
    <div
      ref={ref}
      className={`${stagger ? "reveal-stagger" : "reveal"} ${isVisible ? "visible" : ""} ${className}`}
    >
      {children}
    </div>
  );
};

/* ── Status badge ── */
const statusMap = {
  ongoing: {
    label: "LIVE",
    dot: true,
    cls: "text-primary border-primary/30 bg-primary/10",
  },
  upcoming: {
    label: "SẮP DIỄN RA",
    dot: false,
    cls: "text-warning border-warning/30 bg-warning/10",
  },
  completed: {
    label: "ĐÃ KẾT THÚC",
    dot: false,
    cls: "text-muted-foreground border-border bg-muted",
  },
};

const getTournamentStatus = (
  dateStart?: string,
  dateEnd?: string,
): UiTournament["status"] => {
  const now = Date.now();
  const start = dateStart ? new Date(dateStart).getTime() : null;
  const end = dateEnd ? new Date(dateEnd).getTime() : null;

  if (start && now < start) return "upcoming";
  if (end && now > end) return "completed";
  return "ongoing";
};

const mapApiTournamentToUi = (item: SeriesTournamentResponse): UiTournament => {
  const teamSize = Number(item.max_player_per_team ?? 0);

  return {
    id: String(item.id),
    title: item.name,
    game: item.game_name ?? "Unknown",
    gameIcon: "🎮",
    bannerUrl:
      item.banner_url ||
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&h=340&fit=crop",
    status: getTournamentStatus(item.date_start, item.date_end),
    startDate: item.date_start ?? new Date().toISOString(),
    endDate: item.date_end ?? item.date_start ?? new Date().toISOString(),
    prizePool: "Dang cap nhat",
    maxPlayers: Number(item.max_participate ?? 0),
    registeredPlayers: 0,
    organizer: "Dong Chuyen Nghiep",
    format: item.format ?? "TBD",
    teamSize: teamSize > 0 ? `${teamSize}v${teamSize}` : "TBD",
    description: `${item.game_name ?? "Game"} - Season ${item.season ?? "-"}`,
    tags: [item.short_name ?? "series"],
    short_name: item.short_name ?? "series",
    slug: slugify(item.name),
    registered_count: item.registered_count,
  };
};

const mapApiTeamToUi = (item: SeriesParticipatingTeamResponse): UiTeam => ({
  name: item.name,
  shortName: item.short_name || item.name.slice(0, 3).toUpperCase(),
  logoUrl:
    item.logo_url || "https://dongchuyennghiep.vercel.app/image/waiting.png",
  color: item.team_color_hex || "#10B981",
});

/* ── Tournament Card ── */
const TournamentCard = ({
  t,
  seriesSlug,
}: {
  t: UiTournament;
  seriesSlug?: string;
}) => {
  const status = statusMap[t.status];
  const now = Date.now();
  const start = t.startDate ? new Date(t.startDate).getTime() : NaN;
  const end = t.endDate ? new Date(t.endDate).getTime() : NaN;
  let fill = 0;
  if (isNaN(start) || isNaN(end) || end <= start) {
    fill = now < start ? 0 : 100;
  } else {
    fill = Math.round(((now - start) / (end - start)) * 100);
    fill = Math.max(0, Math.min(100, fill));
  }

  return (
    <Link
      to={`/tournament/${t.short_name}/${t.slug}`}
      state={seriesSlug ? { fromSeriesSlug: seriesSlug } : undefined}
      className="group bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 transition-all duration-300 flex flex-col"
    >
      {/* Image */}
      <div className="relative h-40 overflow-hidden">
        <img
          src={t.bannerUrl}
          alt={t.title}
          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-linear-to-t from-card via-card/30 to-transparent" />
        <div className="absolute top-3 left-3">
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${status.cls}`}
          >
            {status.dot && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            )}
            {status.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary/80 mb-1.5">
          {t.game}
        </p>
        <h3 className="font-bold text-base leading-snug text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
          {t.title}
        </h3>
        <p className="text-xstext-[#EEEEEE] leading-relaxed mb-4 line-clamp-2">
          {t.description}
        </p>

        {/* Meta */}
        <div className="mt-auto space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 text-xs text-secondary-foreground">
              <Calendar className="w-3.5 h-3.5text-[#EEEEEE] shrink-0" />
              <span>
                {new Date(t.startDate).toLocaleDateString("vi-VN", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-secondary-foreground">
              <Shield className="w-3.5 h-3.5text-[#EEEEEE] shrink-0" />
              <span>{t.format}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-secondary-foreground">
              <Trophy className="w-3.5 h-3.5text-[#EEEEEE] shrink-0" />
              <span>{t.prizePool}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-secondary-foreground">
              <Users className="w-3.5 h-3.5text-[#EEEEEE] shrink-0" />
              <span>
                {t.teamSize} · {t.registered_count}/{t.maxPlayers}
              </span>
            </div>
          </div>

          {/* Progress */}
          <div className="w-full bg-secondary rounded-full h-1">
            <div
              className="bg-primary h-1 rounded-full transition-all duration-700"
              style={{ width: `${fill}%` }}
            />
          </div>

          {/* Winner badge or CTA */}
          {t.winner ? (
            <div className="flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-lg px-3 py-2">
              <Crown className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary">
                Vô địch: {t.winner}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs font-semibold text-primary/70 group-hover:text-primary transition-colors pt-1">
              <span>
                {t.status === "ongoing" ? "Xem trực tiếp" : "Xem chi tiết"}
              </span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

/* ── Main Page ── */
const SeriesPage = () => {
  const { slug } = useParams<{ slug?: string }>();
  const seriesSlug = slug ?? "";
  const navigate = useNavigate();
  const { series, isLoading, error } = useSeriesById(seriesSlug);

  const [activeFilter, setActiveFilter] = useState("Tất cả");
  const [search, setSearch] = useState("");

  const canonicalSeriesSlug = series?.slug ?? seriesSlug;

  useEffect(() => {
    if (series?.slug && series?.slug !== seriesSlug) {
      navigate(`/series/${series.slug}`, { replace: true });
    }
  }, [navigate, series?.slug, seriesSlug]);

  const apiTournaments = useMemo(
    () => (series?.all_tournaments ?? []).map(mapApiTournamentToUi),
    [series],
  );

  const tournaments = apiTournaments.length
    ? apiTournaments
    : fallbackTournaments;

  const heroBannerUrl = tournaments.find((t) => t.bannerUrl)?.bannerUrl;

  const allGames = [
    "Tất cả",
    ...Array.from(new Set(tournaments.map((t) => t.game))),
  ];

  const totalPrize = series?.totalprize
    ? `${Number(series.totalprize).toLocaleString("vi-VN")} VND`
    : fallbackSeriesInfo.totalPrize;

  const seriesInfo = {
    name: series?.name ?? fallbackSeriesInfo.name,
    description: series?.description ?? fallbackSeriesInfo.description,
    totalTournaments: series?.all_tournaments?.length ?? tournaments.length,
    totalPlayers:
      series?.all_tournaments?.reduce(
        (sum, tournament) => sum + Number(tournament.max_participate ?? 0),
        0,
      ) ?? fallbackSeriesInfo.totalPlayers,
    totalPrize,
  };

  const filtered = tournaments.filter((t) => {
    const matchGame = activeFilter === "Tất cả" || t.game === activeFilter;
    const matchSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.game.toLowerCase().includes(search.toLowerCase());
    return matchGame && matchSearch;
  });

  const ongoing = filtered.filter((t) => t.status === "ongoing");
  const upcoming = filtered.filter((t) => t.status === "upcoming");
  const completed = filtered.filter((t) => t.status === "completed");

  const participatingTeams = useMemo(() => {
    const apiTeams = (series?.participating_teams ?? []).map(mapApiTeamToUi);
    return apiTeams.length ? apiTeams : fallbackTeams;
  }, [series]);

  // duplicate teams for infinite marquee
  const marqueeTeams = [...participatingTeams, ...participatingTeams];

  // Calculate leaderboard from completed tournaments only
  const completedTournamentIds = tournamentIds.filter((tid) => {
    const t = fallbackTournaments.find((x) => x.id === tid);
    return t?.status === "completed";
  });

  const sortedLeaderboard = [...leaderboardEntries].sort((a, b) => {
    const totalA = completedTournamentIds.reduce((sum, tid) => {
      const placement = a.results[tid];
      return (
        sum + (placement != null ? (placementPoints[placement - 1] ?? 0) : 0)
      );
    }, 0);
    const totalB = completedTournamentIds.reduce((sum, tid) => {
      const placement = b.results[tid];
      return (
        sum + (placement != null ? (placementPoints[placement - 1] ?? 0) : 0)
      );
    }, 0);
    return totalB - totalA;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <p className="text-smtext-[#EEEEEE]">Dang tai du lieu series...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="text-base font-semibold text-foreground mb-2">
            Khong tai duoc du lieu series
          </p>
          <p className="text-smtext-[#EEEEEE]">
            Vui long thu lai sau hoac kiem tra ket noi API `/api/series/
            {seriesSlug}`.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden border-b border-border">
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: heroBannerUrl
              ? `linear-gradient(to bottom, hsl(var(--background) / 0.82), hsl(var(--background) / 0.9)), url("${heroBannerUrl}")`
              : "radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)",
            backgroundSize: heroBannerUrl ? "cover" : "32px 32px",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute top-0 left-0 w-150 h-150 bg-primary/5 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2" />

        <div className="max-w-6xl mx-auto px-6 md:px-10 pt-16 pb-14 md:pt-24 md:pb-20 relative">
          <h1 className="text-4xl md:text-6xl font-bold leading-[1.1] max-w-3xl mb-5 text-foreground">
            {seriesInfo.name}
          </h1>
          <p className="text-muted-foreground max-w-lg text-sm md:text-base leading-relaxed mb-8">
            {seriesInfo.description}
          </p>

          {/* Stats row */}
          <div className="flex items-center gap-8 md:gap-12">
            {[
              { val: seriesInfo.totalTournaments, label: "Giải đấu" },
              {
                val: `${new Set(tournaments.map((t) => t.game)).size}`,
                label: "Bộ môn",
              },
              { val: seriesInfo.totalPrize, label: "Giải thưởng VĐ tổng" },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-xl md:text-2xl font-bold text-foreground">
                  {s.val}
                </p>
                <p className="text-[10px] uppercase tracking-[0.15em] text-[#EEEEEE] mt-0.5">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-md border border-border/60 bg-card/40 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Pick'em theo series: chon tournament, chon bracket, bam doi tren
                bracket de du doan.
              </p>
              <Button asChild size="sm">
                <Link to={`/series/${canonicalSeriesSlug}/pickem`}>
                  Choi Pick'em
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TEAM LOGOS CAROUSEL ═══ */}
      <Section className="border-b border-border py-8 overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 md:px-10 mb-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#EEEEEE]">
            Đội tuyển tham gia
          </p>
        </div>
        <div className="relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-20 bg-linear-to-r from-background to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-background to-transparent z-10" />
          <div className="marquee-track">
            {marqueeTeams.map((team, i) => (
              <div
                key={`${team.shortName}-${i}`}
                className="flex items-center gap-3 px-6 md:px-8 shrink-0"
              >
                <img
                  src={team.logoUrl}
                  alt={team.name}
                  className="w-14 h-14  object-cover"
                  loading="lazy"
                />
                <div>
                  <p className="text-sm font-bold text-foreground whitespace-nowrap">
                    {team.name}
                  </p>
                  <p className="text-[10px] text-[#EEEEEE]">{team.shortName}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ═══ FILTERS ═══ */}
      <div className="max-w-6xl mx-auto px-6 md:px-10 pt-10 pb-2">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex gap-1.5 flex-wrap">
            {allGames.map((g) => (
              <button
                key={g}
                onClick={() => setActiveFilter(g)}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all duration-200 ${
                  activeFilter === g
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-bordertext-[#EEEEEE] hover:text-foreground hover:border-primary/20"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4text-[#EEEEEE]" />
            <Input
              placeholder="Tìm giải đấu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm bg-card border-border rounded-xl"
            />
          </div>
        </div>
      </div>

      {/* ═══ TOURNAMENTS ═══ */}
      <main className="max-w-6xl mx-auto px-6 md:px-10 pb-8 space-y-14 mt-6">
        {ongoing.length > 0 && (
          <Section>
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Đang diễn ra
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 reveal-stagger visible">
              {ongoing.map((t) => (
                <TournamentCard
                  key={t.id}
                  t={t}
                  seriesSlug={canonicalSeriesSlug}
                />
              ))}
            </div>
          </Section>
        )}

        {upcoming.length > 0 && (
          <Section>
            <h2 className="text-lg font-bold mb-6">Sắp diễn ra</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 reveal-stagger visible">
              {upcoming.map((t) => (
                <TournamentCard
                  key={t.id}
                  t={t}
                  seriesSlug={canonicalSeriesSlug}
                />
              ))}
            </div>
          </Section>
        )}

        {completed.length > 0 && (
          <Section>
            <h2 className="text-lg font-bold mb-6">Đã kết thúc</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 reveal-stagger visible">
              {completed.map((t) => (
                <TournamentCard
                  key={t.id}
                  t={t}
                  seriesSlug={canonicalSeriesSlug}
                />
              ))}
            </div>
          </Section>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-sm">
              Không tìm thấy giải đấu nào.
            </p>
          </div>
        )}
      </main>

      {/* ═══ LEADERBOARD ═══ */}
      <Section className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-14">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80 mb-1">
                Season Ranking
              </p>
              <h2 className="text-2xl font-bold text-foreground">
                Bảng xếp hạng tổng
              </h2>
              <p className="text-xstext-[#EEEEEE] mt-1">
                Điểm tích lũy qua các giải · Giải thưởng chỉ dành cho nhà vô
                địch tổng
              </p>
            </div>
            <Target className="w-6 h-6text-[#EEEEEE]" />
          </div>

          {/* Points legend */}
          <div className="flex flex-wrap gap-3 mb-5">
            {placementPoints.map((pts, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 text-[10px] text-[#EEEEEE]"
              >
                <span
                  className={`font-bold ${i === 0 ? "text-primary" : "text-foreground"}`}
                >
                  #{i + 1}
                </span>
                <span>= {pts} điểm</span>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-x-auto">
            {/* Header */}
            <div
              className="grid gap-0 min-w-175"
              style={{
                gridTemplateColumns: `3rem 1fr repeat(${completedTournamentIds.length}, 4.5rem) 5rem`,
              }}
            >
              <div className="px-3 py-3 border-b border-border text-[10px] font-bold uppercase tracking-[0.12em] text-[#EEEEEE]">
                #
              </div>
              <div className="px-3 py-3 border-b border-border text-[10px] font-bold uppercase tracking-[0.12em] text-[#EEEEEE]">
                Đội tuyển
              </div>
              {completedTournamentIds.map((tid) => {
                const t = tournaments.find((x) => x.id === tid);
                return (
                  <div
                    key={tid}
                    className="px-2 py-3 border-b border-border text-[10px] font-bold uppercase tracking-[0.08em] text-[#EEEEEE] text-center truncate"
                    title={t?.title}
                  >
                    {t?.gameIcon}
                  </div>
                );
              })}
              <div className="px-3 py-3 border-b border-border text-[10px] font-bold uppercase tracking-[0.12em] text-[#EEEEEE] text-right">
                Tổng
              </div>
            </div>

            {/* Rows */}
            {sortedLeaderboard.map((entry, i) => {
              const team = fallbackTeams.find((t) => t.name === entry.team);
              const total = completedTournamentIds.reduce((sum, tid) => {
                const placement = entry.results[tid];
                return (
                  sum +
                  (placement != null
                    ? (placementPoints[placement - 1] ?? 0)
                    : 0)
                );
              }, 0);

              return (
                <div
                  key={entry.team}
                  className="grid gap-0 min-w-175 items-center transition-colors hover:bg-secondary/50"
                  style={{
                    gridTemplateColumns: `3rem 1fr repeat(${completedTournamentIds.length}, 4.5rem) 5rem`,
                  }}
                >
                  <div
                    className={`px-3 py-3.5 text-sm font-bold ${i === 0 ? "text-primary" : i < 3 ? "text-foreground" : "text-muted-foreground"} ${i < sortedLeaderboard.length - 1 ? "border-b border-border" : ""}`}
                  >
                    {i + 1}
                  </div>
                  <div
                    className={`px-3 py-3.5 flex items-center gap-3 min-w-0 ${i < sortedLeaderboard.length - 1 ? "border-b border-border" : ""}`}
                  >
                    {team && (
                      <img
                        src={team.logoUrl}
                        alt={team.shortName}
                        className="w-7 h-7 rounded-md object-cover border border-border shrink-0"
                      />
                    )}
                    <span className="text-sm font-semibold text-foreground truncate">
                      {entry.team}
                    </span>
                  </div>
                  {completedTournamentIds.map((tid) => {
                    const placement = entry.results[tid];
                    const pts =
                      placement != null
                        ? (placementPoints[placement - 1] ?? 0)
                        : null;
                    return (
                      <div
                        key={tid}
                        className={`px-2 py-3.5 text-center ${i < sortedLeaderboard.length - 1 ? "border-b border-border" : ""}`}
                      >
                        {pts != null ? (
                          <div>
                            <span
                              className={`text-xs font-bold ${placement === 1 ? "text-primary" : "text-foreground"}`}
                            >
                              {pts}
                            </span>
                            <span className="block text-[9px] text-[#EEEEEE]">
                              #{placement}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xstext-[#EEEEEE]/50">—</span>
                        )}
                      </div>
                    );
                  })}
                  <div
                    className={`px-3 py-3.5 text-right ${i < sortedLeaderboard.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <span className="text-sm font-bold text-primary">
                      {total}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Section>
    </div>
  );
};

export default SeriesPage;
