import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Calendar,
  Users,
  Trophy,
  ArrowRight,
  Search,
  Crown,
  Shield,
} from "lucide-react";
import {
  seriesInfo as fallbackSeriesInfo,
  Team as UiTeam,
  leaderboardEntries,
  placementPoints,
  tournamentIds,
  Tournament as UiTournament,
} from "@/data/series";
import PageLoader from "@/components/PageLoader";
import { Input } from "@/components/ui/input";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import {
  type SeriesParticipatingTeamResponse,
  type SeriesTournamentResponse,
} from "@/api/series";
import { useSeriesById } from "@/hooks/useSeriesById";
import UserMenu from "@/components/UserMenu";
import {
  TOURNAMENT_PAGE_BG_CLASS,
  TOURNAMENT_PAGE_HINT_CLASS,
  TOURNAMENT_PAGE_TITLE_CLASS,
  TOURNAMENT_PANEL_CLASS,
  TOURNAMENT_SECTION_META_CLASS,
  TOURNAMENT_SUBTAB_ACTIVE,
  TOURNAMENT_SUBTAB_BASE,
  TOURNAMENT_SUBTAB_INACTIVE,
  TOURNAMENT_TABLE_HEADER_CLASS,
} from "@/components/tournamentTheme";

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
      "https://dongchuyennghiep.vercel.app/image/waiting.png",
    status: getTournamentStatus(item.date_start, item.date_end),
    startDate: item.date_start ?? new Date().toISOString(),
    endDate: item.date_end ?? item.date_start ?? new Date().toISOString(),
    prizePool: "Đang cập nhật",
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
      className={`group flex flex-col overflow-hidden transition-colors hover:border-neutral-500 ${TOURNAMENT_PANEL_CLASS}`}
    >
      <div className="relative h-40 overflow-hidden border-b border-neutral-800">
        <img
          src={t.bannerUrl}
          alt={t.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/40 to-transparent" />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
          {t.game}
        </p>
        <h3 className="mb-2 line-clamp-2 text-base font-bold leading-snug text-white transition-colors group-hover:text-neutral-200">
          {t.title}
        </h3>
        <p className="mb-4 line-clamp-2 text-xs leading-relaxed text-neutral-400">
          {t.description}
        </p>

        <div className="mt-auto space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
              <span>
                {new Date(t.startDate).toLocaleDateString("vi-VN", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Shield className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
              <span>{t.format}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Trophy className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
              <span>{t.prizePool}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Users className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
              <span>
                {t.teamSize} · {t.registered_count}/{t.maxPlayers}
              </span>
            </div>
          </div>

          <div className="h-1 w-full bg-neutral-800">
            <div
              className="h-1 bg-neutral-400 transition-all duration-500"
              style={{ width: `${fill}%` }}
            />
          </div>

          {t.winner ? (
            <div className="flex items-center gap-2 border border-neutral-700 bg-[#1a1a1a] px-3 py-2">
              <Crown className="h-3.5 w-3.5 text-neutral-300" />
              <span className="text-xs font-semibold text-neutral-200">
                Vô địch: {t.winner}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between pt-1 text-xs font-semibold text-neutral-400 transition-colors group-hover:text-white">
              <span>
                {t.status === "ongoing" ? "Xem trực tiếp" : "Xem chi tiết"}
              </span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
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

  const marqueeTeams = [...participatingTeams, ...participatingTeams];

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
    return <PageLoader label="Đang tải dữ liệu series..." />;
  }

  if (error) {
    return (
      <div
        className={`flex min-h-screen items-center justify-center px-6 ${TOURNAMENT_PAGE_BG_CLASS}`}
      >
        <div className="max-w-md text-center">
          <p className="mb-2 text-base font-semibold text-white">
            Không tải được dữ liệu series
          </p>
          <p className={TOURNAMENT_PAGE_HINT_CLASS}>
            Vui lòng thử lại sau hoặc kiểm tra kết nối API `/api/series/
            {seriesSlug}`.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${TOURNAMENT_PAGE_BG_CLASS}`}>
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden border-b border-neutral-800">
        {heroBannerUrl ? (
          <div
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage: `linear-gradient(to bottom, #0a0a0a 10%, #0a0a0acc 55%, #0a0a0a), url("${heroBannerUrl}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        ) : null}

        <div className="relative mx-auto max-w-6xl px-6 pb-12 pt-14 md:px-10 md:pb-16 md:pt-20">
          <div className="mb-6 flex justify-end">
            <UserMenu />
          </div>
          <h1 className="mb-4 max-w-3xl text-3xl font-extrabold uppercase leading-tight tracking-normal text-white md:text-5xl">
            {seriesInfo.name}
          </h1>
          <p className="mb-8 max-w-lg text-sm leading-relaxed text-neutral-400 md:text-base">
            {seriesInfo.description}
          </p>

          <div className="flex flex-wrap items-end gap-8 md:gap-12">
            {[
              { val: seriesInfo.totalTournaments, label: "Giải đấu" },
              {
                val: `${new Set(tournaments.map((t) => t.game)).size}`,
                label: "Bộ môn",
              },
              { val: seriesInfo.totalPrize, label: "Giải thưởng VĐ tổng" },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-xl font-bold text-white md:text-2xl">
                  {s.val}
                </p>
                <p className={TOURNAMENT_SECTION_META_CLASS}>{s.label}</p>
              </div>
            ))}
          </div>

          <div
            className={`mt-6 flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${TOURNAMENT_PANEL_CLASS}`}
          >
            <p className="text-sm text-neutral-400">
              Pick&apos;em theo series: chọn tournament, chọn bracket, bấm đội
              trên bracket để dự đoán.
            </p>
            <Link
              to={`/series/${canonicalSeriesSlug}/pickem`}
              className="inline-flex h-8 items-center border border-neutral-600 bg-[#2d2d2d] px-3 text-xs font-extrabold uppercase tracking-normal text-white transition-colors hover:border-neutral-500 hover:bg-neutral-700"
            >
              Chơi Pick&apos;em
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ TEAM LOGOS CAROUSEL ═══ */}
      <Section className="overflow-hidden border-b border-neutral-800 py-8">
        <div className="mx-auto mb-5 max-w-6xl px-6 md:px-10">
          <p className={TOURNAMENT_SECTION_META_CLASS}>Đội tuyển tham gia</p>
        </div>
        <div className="relative overflow-hidden">
          <div className="absolute bottom-0 left-0 top-0 z-10 w-16 bg-gradient-to-r from-[#0a0a0a] to-transparent" />
          <div className="absolute bottom-0 right-0 top-0 z-10 w-16 bg-gradient-to-l from-[#0a0a0a] to-transparent" />
          <div className="marquee-track">
            {marqueeTeams.map((team, i) => (
              <div
                key={`${team.shortName}-${i}`}
                className="flex shrink-0 items-center gap-3 px-6 md:px-8"
              >
                <img
                  src={team.logoUrl}
                  alt={team.name}
                  className="h-14 w-14 object-cover"
                  loading="lazy"
                />
                <div>
                  <p className="whitespace-nowrap text-sm font-bold text-white">
                    {team.name}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                    {team.shortName}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ═══ FILTERS ═══ */}
      <div className="mx-auto max-w-6xl px-6 pb-2 pt-10 md:px-10">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5">
            {allGames.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setActiveFilter(g)}
                className={`${TOURNAMENT_SUBTAB_BASE} ${
                  activeFilter === g
                    ? TOURNAMENT_SUBTAB_ACTIVE
                    : TOURNAMENT_SUBTAB_INACTIVE
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <Input
              placeholder="Tìm giải đấu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 rounded-none border-neutral-700 bg-[#141414] pl-9 text-sm text-neutral-200 placeholder:text-neutral-500"
            />
          </div>
        </div>
      </div>

      {/* ═══ TOURNAMENTS ═══ */}
      <main className="mx-auto mt-6 max-w-6xl space-y-14 px-6 pb-8 md:px-10">
        {ongoing.length > 0 && (
          <Section>
            <h2
              className={`${TOURNAMENT_PAGE_TITLE_CLASS} mb-6 flex items-center gap-2.5 text-lg`}
            >
              <span className="h-2 w-2 bg-primary" />
              Đang diễn ra
            </h2>
            <div className="reveal-stagger visible grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
            <h2 className={`${TOURNAMENT_PAGE_TITLE_CLASS} mb-6 text-lg`}>
              Sắp diễn ra
            </h2>
            <div className="reveal-stagger visible grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
            <h2 className={`${TOURNAMENT_PAGE_TITLE_CLASS} mb-6 text-lg`}>
              Đã kết thúc
            </h2>
            <div className="reveal-stagger visible grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="py-20 text-center">
            <p className="text-sm text-neutral-500">
              Không tìm thấy giải đấu nào.
            </p>
          </div>
        )}
      </main>

      {/* ═══ LEADERBOARD ═══ */}
      <Section className="border-t border-neutral-800">
        <div className="mx-auto max-w-6xl px-6 py-14 md:px-10">
          <div className="mb-8">
            <p className={TOURNAMENT_SECTION_META_CLASS}>Season Ranking</p>
            <h2 className={`${TOURNAMENT_PAGE_TITLE_CLASS} mt-1 text-2xl`}>
              Bảng xếp hạng tổng
            </h2>
            <p className={`${TOURNAMENT_PAGE_HINT_CLASS} mt-1`}>
              Điểm tích lũy qua các giải · Giải thưởng chỉ dành cho nhà vô địch
              tổng
            </p>
          </div>

          <div className="mb-5 flex flex-wrap gap-3">
            {placementPoints.map((pts, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 text-[10px] text-neutral-500"
              >
                <span
                  className={`font-bold ${i === 0 ? "text-white" : "text-neutral-300"}`}
                >
                  #{i + 1}
                </span>
                <span>= {pts} điểm</span>
              </div>
            ))}
          </div>

          <div className={`${TOURNAMENT_PANEL_CLASS} overflow-x-auto`}>
            <div
              className="grid min-w-175 gap-0"
              style={{
                gridTemplateColumns: `3rem 1fr repeat(${completedTournamentIds.length}, 4.5rem) 5rem`,
              }}
            >
              <div
                className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-left border-b border-neutral-600`}
              >
                #
              </div>
              <div
                className={`${TOURNAMENT_TABLE_HEADER_CLASS} !text-left border-b border-neutral-600`}
              >
                Đội tuyển
              </div>
              {completedTournamentIds.map((tid) => {
                const t = tournaments.find((x) => x.id === tid);
                return (
                  <div
                    key={tid}
                    className={`${TOURNAMENT_TABLE_HEADER_CLASS} border-b border-neutral-600 !text-center truncate`}
                    title={t?.title}
                  >
                    {t?.short_name || t?.game || tid}
                  </div>
                );
              })}
              <div
                className={`${TOURNAMENT_TABLE_HEADER_CLASS} border-b border-neutral-600 !text-right`}
              >
                Tổng
              </div>
            </div>

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
              const rowBorder =
                i < sortedLeaderboard.length - 1
                  ? "border-b border-neutral-800"
                  : "";

              return (
                <div
                  key={entry.team}
                  className="grid min-w-175 items-center gap-0 bg-[#141414] transition-colors hover:bg-[#1c1c1c]"
                  style={{
                    gridTemplateColumns: `3rem 1fr repeat(${completedTournamentIds.length}, 4.5rem) 5rem`,
                  }}
                >
                  <div
                    className={`px-3 py-3.5 text-sm font-bold tabular-nums ${i === 0 ? "text-white" : i < 3 ? "text-neutral-200" : "text-neutral-500"} ${rowBorder}`}
                  >
                    {i + 1}
                  </div>
                  <div
                    className={`flex min-w-0 items-center gap-3 px-3 py-3.5 ${rowBorder}`}
                  >
                    {team && (
                      <img
                        src={team.logoUrl}
                        alt={team.shortName}
                        className="h-7 w-7 shrink-0 border border-neutral-700 object-cover"
                      />
                    )}
                    <span className="truncate text-sm font-semibold text-white">
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
                        className={`px-2 py-3.5 text-center ${rowBorder}`}
                      >
                        {pts != null ? (
                          <div>
                            <span
                              className={`text-xs font-bold tabular-nums ${placement === 1 ? "text-white" : "text-neutral-300"}`}
                            >
                              {pts}
                            </span>
                            <span className="block text-[9px] text-neutral-500">
                              #{placement}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-600">—</span>
                        )}
                      </div>
                    );
                  })}
                  <div className={`px-3 py-3.5 text-right ${rowBorder}`}>
                    <span className="text-sm font-bold tabular-nums text-white">
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
