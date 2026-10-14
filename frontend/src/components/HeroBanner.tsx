import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE } from "@/lib/apiBase";
import { Link, useNavigate, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import InfoGrid from "@/components/InfoGrid";
import { PAGE_FRAME_CLASS } from "@/components/TournamentMasthead";
import { formatShortDateTime } from "@/lib/tournamentFormat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import TournamentRegistration from "@/components/TournamentRegistration";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { unregisterSoloFromTournament, syncSoloRiotOnTournament } from "@/api/tournaments";
import { getRegistrationOptions } from "@/api/groups";
import TeamRosterDialog from "@/components/TeamRosterDialog";
import { isRiotGameSlug } from "@/components/tournamentTheme";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface HeroBannerProps {
  tournament?: {
    banner_url?: string;
    id?: number | string;
    max_player_per_team?: number | string;
    check_in_start?: string;
    check_in_end?: string;
    register_start?: string;
    register_end?: string;
    name?: string;
    short_name?: string;
    game_name?: string;
    date_start?: string;
    date_end?: string;
    max_participate?: number;
    registered_count?: number;
    prizes?: Array<{ prize?: string }>;
    registration_mode?: "org" | "individual" | string;
    registered?: Array<{
      id?: number | string;
      team_id?: number | string;
      isCheckedIn?: boolean;
      player_ids?: Array<number | string> | string;
      name?: string;
      short_name?: string;
      logo_url?: string | null;
    }>;
  } | null;
}

const normalizePlayerIds = (raw: unknown): number[] => {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.map((item) => Number(item)).filter((id) => Number.isFinite(id));
};

const HeroBanner = ({ tournament }: HeroBannerProps) => {
  const {
    user,
    logout,
    isRegistered,
    setIsRegistered,
    token,
    refreshUser,
    isLoading: isAuthLoading,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { game, slug } = useParams();
  const queryClient = useQueryClient();
  const showRiotId = isRiotGameSlug(game ?? tournament?.short_name);
  const isIndividualMode =
    String(tournament?.registration_mode ?? "org").toLowerCase() ===
    "individual";
  const [regOpen, setRegOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"manage" | "roster">("manage");
  const [soloUnregConfirmOpen, setSoloUnregConfirmOpen] = useState(false);
  const [soloUnregistering, setSoloUnregistering] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterTeamId, setRosterTeamId] = useState<number | string | null>(
    null,
  );
  // Giải theo đội: đội của tôi trong giải này (org hoặc đội lẻ) + đội trưởng — API đăng ký mới
  const { data: registrationOptions } = useQuery({
    queryKey: ["registration-options", tournament?.id, user?.id],
    enabled: Boolean(user && token && tournament?.id && !isIndividualMode),
    queryFn: async () => (await getRegistrationOptions(tournament!.id, token)).data.data,
  });
  const myTeamEntry = registrationOptions?.my_registrations?.[0] ?? null;
  const isEntryCaptain = Boolean(
    myTeamEntry && Number(myTeamEntry.captain_user_id) === Number(user?.id),
  );

  const fromSeriesSlug =
    (location.state as { fromSeriesSlug?: string } | null)?.fromSeriesSlug ??
    null;
  const normalizedSeriesSlug =
    fromSeriesSlug && /^\d+$/.test(fromSeriesSlug) ? null : fromSeriesSlug;

  const now = Date.now();
  const registerStartMs = Number(new Date(tournament?.register_start ?? ""));
  const registerEndMs = Number(new Date(tournament?.register_end ?? ""));
  const isRegistrationOpen =
    Number.isFinite(registerStartMs) &&
    Number.isFinite(registerEndMs) &&
    now >= registerStartMs &&
    now <= registerEndMs;

  const handleLoginClick = () => {
    const returnTo = location.pathname + location.search;
    navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  };

  const handleOpenRegistration = () => {
    setDialogMode("manage");
    setRegOpen(true);
  };

  // Prevent OAuth return handler from re-firing (refreshUser / invalidateQueries
  // change deps while ?riot= is still in the URL → infinite API loop).
  const handledOauthSearchRef = useRef<string | null>(null);
  const oauthSyncRef = useRef({
    isIndividualMode,
    tournamentId: tournament?.id,
    token,
    game,
    slug,
    refreshUser,
    queryClient,
  });
  oauthSyncRef.current = {
    isIndividualMode,
    tournamentId: tournament?.id,
    token,
    game,
    slug,
    refreshUser,
    queryClient,
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldOpenRegister = params.get("register") === "1";
    const riotStatus = params.get("riot");
    const reason = params.get("reason");
    const gameName = params.get("gameName");
    const tagName = params.get("tagName");

    if (!shouldOpenRegister && !riotStatus) {
      handledOauthSearchRef.current = null;
      return;
    }
    if (isAuthLoading) return;
    if (shouldOpenRegister && !user) return;

    const searchKey = location.search;
    if (handledOauthSearchRef.current === searchKey) return;
    handledOauthSearchRef.current = searchKey;

    // Clear OAuth query params immediately so re-renders cannot re-trigger this.
    params.delete("register");
    params.delete("riot");
    params.delete("reason");
    params.delete("gameName");
    params.delete("tagName");
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true },
    );

    // Do not abort on effect cleanup — clearing the URL re-runs this effect and
    // would otherwise cancel sync/toasts mid-flight.
    void (async () => {
      const ctx = oauthSyncRef.current;

      if (riotStatus === "connected") {
        try {
          await ctx.refreshUser();
        } catch {
          // ignore refresh errors; modal still opens
        }

        if (ctx.isIndividualMode && ctx.tournamentId && ctx.token) {
          try {
            const syncResponse = await syncSoloRiotOnTournament(
              ctx.tournamentId,
            );
            const nextRiot =
              syncResponse.data?.data?.riot_account ||
              [gameName, tagName].filter(Boolean).join("#");
            toast.success("Đã đổi Riot ID", {
              description: nextRiot
                ? `Đăng ký giải đã cập nhật thành ${nextRiot}.`
                : "Riot ID và đăng ký giải đã được cập nhật.",
            });
            await ctx.queryClient.invalidateQueries({
              queryKey: ["tournament", ctx.game, ctx.slug],
            });
          } catch {
            toast.success("Đã liên kết Riot", {
              description:
                "Riot ID trên tài khoản đã cập nhật. Bạn có thể đăng ký ngay.",
            });
          }
        } else {
          toast.success("Đã liên kết Riot", {
            description: "Riot ID đã được cập nhật. Bạn có thể đăng ký ngay.",
          });
        }
      } else if (riotStatus === "failed") {
        toast.error("Liên kết Riot thất bại", {
          description: reason || "Không thể lấy Riot ID từ Riot Sign On.",
        });
      }

      if (shouldOpenRegister) {
        setDialogMode("manage");
        setRegOpen(true);
      }
    })();
  }, [
    isAuthLoading,
    location.pathname,
    location.search,
    navigate,
    user?.id,
  ]);

  const handleSoloUnregisterClick = () => {
    setSoloUnregConfirmOpen(true);
  };

  const handleConfirmSoloUnregister = async () => {
    if (!tournament?.id || !token) return;

    setSoloUnregistering(true);
    try {
      await unregisterSoloFromTournament(tournament.id);
      setIsRegistered(false);
      setMyRegisteredTeamId(null);
      setSoloUnregConfirmOpen(false);
      toast.success("Đã hủy đăng ký");
      window.location.reload();
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) &&
        error.response?.data &&
        typeof error.response.data === "object" &&
        ("message" in error.response.data || "error" in error.response.data)
          ? String(
              (error.response.data as { message?: string; error?: string })
                .message ??
                (error.response.data as { message?: string; error?: string })
                  .error,
            )
          : "Không thể hủy đăng ký cá nhân.";
      toast.error(message);
    } finally {
      setSoloUnregistering(false);
    }
  };

  const handleOpenRoster = () => {
    const registered = tournament?.registered ?? [];
    const match = isIndividualMode
      ? registered.find((r) =>
          normalizePlayerIds(r.player_ids).some(
            (playerId) => playerId === Number(user?.id),
          ) ||
          String(r.short_name ?? "").trim() === `S${Number(user?.id)}`,
        )
      : registered.find(
          (r) => Number(r.team_id) === Number(user?.team_id),
        );
    setRosterTeamId(match ? Number(match.id) : null);
    setRosterOpen(true);
  };

  const [checkingInTeamId, setCheckingInTeamId] = useState<number | null>(null);
  const [myRegisteredTeamId, setMyRegisteredTeamId] = useState<number | null>(
    null,
  );
  const [myTeamCheckedIn, setMyTeamCheckedIn] = useState<boolean>(false);

  useEffect(() => {
    if (!tournament?.id || !user) {
      setMyRegisteredTeamId(null);
      setMyTeamCheckedIn(false);
      setIsRegistered(false);
      return;
    }

    const registered = tournament?.registered ?? [];
    const myEntry = isIndividualMode
      ? registered.find(
          (team) =>
            normalizePlayerIds(team.player_ids).some(
              (playerId) => playerId === Number(user.id),
            ) ||
            String(team.short_name ?? "").trim() === `S${Number(user.id)}`,
        )
      : myTeamEntry
        ? registered.find(
            (team) => Number(team.id) === Number(myTeamEntry.registration_id),
          ) ?? { id: myTeamEntry.registration_id, team_id: myTeamEntry.team_id, isCheckedIn: false }
        : undefined;
    const nextRegisteredTeamId = myEntry
      ? Number(myEntry.id ?? myEntry.team_id)
      : null;

    setMyRegisteredTeamId(nextRegisteredTeamId);
    setMyTeamCheckedIn(Boolean(myEntry?.isCheckedIn));
    setIsRegistered(Boolean(nextRegisteredTeamId));
  }, [
    tournament?.id,
    tournament?.registered,
    user,
    setIsRegistered,
    isIndividualMode,
    myTeamEntry,
  ]);

  const checkInTournament = tournament as
    | { check_in_start?: string; check_in_end?: string }
    | null
    | undefined;
  const checkInStartMs = Number(
    new Date(checkInTournament?.check_in_start ?? ""),
  );
  const checkInEndMs = Number(new Date(checkInTournament?.check_in_end ?? ""));
  const nowMs = Date.now();
  const isCheckInOpen =
    Number.isFinite(checkInStartMs) &&
    Number.isFinite(checkInEndMs) &&
    nowMs >= checkInStartMs &&
    nowMs <= checkInEndMs;

  // Check-in: cá nhân tự check-in; giải theo đội thì đội trưởng của lượt đăng ký
  const canShowHeaderCheckIn = Boolean(
    myRegisteredTeamId && (isIndividualMode || isEntryCaptain),
  );

  const showUpdateRegistration = Boolean(myRegisteredTeamId || isRegistered);

  const handleHeaderCheckIn = async () => {
    if (!token || !tournament?.id || !myRegisteredTeamId) return;
    setCheckingInTeamId(myRegisteredTeamId);
    try {
      await axios.patch(
        `${API_BASE}/api/tournaments/teams/${myRegisteredTeamId}/check-in`,
        { checked_in: true },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      toast.success("Check-in thành công");
      window.location.reload();
    } catch (err) {
      toast.error("Check-in thất bại");
    } finally {
      setCheckingInTeamId(null);
    }
  };

  const handleBackToSeries = () => {
    if (normalizedSeriesSlug) {
      navigate(`/series/${normalizedSeriesSlug}`);
      return;
    }

    navigate("/series/dcn_series");
  };

  const registeredCount =
    tournament?.registered_count ?? tournament?.registered?.length ?? null;
  const registerStatus = (() => {
    const countText =
      registeredCount != null
        ? `${registeredCount}${tournament?.max_participate ? ` / ${tournament.max_participate}` : ""} ${isIndividualMode ? "người" : "đội"} đã đăng ký`
        : null;

    if (isRegistrationOpen) {
      return {
        label: "ĐANG MỞ ĐĂNG KÝ",
        tone: "text-[#FF4A3D]",
        detail: [countText, `hạn chót ${formatShortDateTime(tournament?.register_end)}`]
          .filter(Boolean)
          .join(" · "),
      };
    }
    if (Number.isFinite(registerStartMs) && now < registerStartMs) {
      return {
        label: "SẮP MỞ ĐĂNG KÝ",
        tone: "text-[#F2F0EB]",
        detail: `Mở lúc ${formatShortDateTime(tournament?.register_start)}`,
      };
    }
    if (Number.isFinite(registerEndMs) && now > registerEndMs) {
      return {
        label: "ĐÃ ĐÓNG ĐĂNG KÝ",
        tone: "text-[#9A9893]",
        detail: countText ?? "",
      };
    }
    return null;
  })();

  const actionBtn = "h-11 px-4 text-sm font-semibold";
  const gameLabel = tournament?.game_name || tournament?.short_name;

  return (
    <>
      <section className={`${PAGE_FRAME_CLASS} pt-6 md:pt-8`}>
        {normalizedSeriesSlug ? (
          <button
            type="button"
            onClick={handleBackToSeries}
            className="mb-2 flex min-h-11 items-center text-sm font-semibold hover:underline hover:underline-offset-4"
          >
            ← Về series
          </button>
        ) : null}

        {/* Ảnh giải: một dải ngang rộng hết khung, như ảnh bìa trang báo */}
        {tournament?.banner_url ? (
          <figure className="m-0">
            <img
              src={tournament.banner_url}
              alt={`Ảnh giải ${tournament?.name ?? ""}`}
              className="block aspect-[16/9] w-full object-cover md:aspect-[4/1]"
            />
          </figure>
        ) : null}

        {/* Tên giải bên trái, thông tin chính bên phải — cùng bố cục trang con */}
        <div className="mt-6 grid gap-6 md:mt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)] lg:items-end lg:gap-12">
          <div className="min-w-0">
            <p className="m-0 mb-1 text-[13px] font-semibold text-[#9A9893]">
              {[gameLabel, "Tổ chức bởi Dong Chuyen Nghiep"]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <h1 className="m-0 break-words text-[36px] font-extrabold leading-[1.08] tracking-[-0.03em] md:text-[52px]">
              {tournament?.name || "Đang tải…"}
            </h1>
          </div>
          <InfoGrid tournament={tournament} />
        </div>

        <div className="mt-6 flex flex-col gap-3 border-y border-b-[#2C2B29] border-t-[#F2F0EB] py-3 md:flex-row md:items-center md:gap-4">
          {registerStatus ? (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span className={`font-bold tracking-[0.04em] ${registerStatus.tone}`}>
                {registerStatus.label}
              </span>
              {registerStatus.detail ? (
                <span className="text-[#9A9893]">{registerStatus.detail}</span>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 md:ml-auto">
            {user ? (
              <>
                {isIndividualMode ? (
                  isRegistrationOpen || isRegistered ? (
                    <Button
                      onClick={handleOpenRegistration}
                      className={actionBtn}
                      variant={showUpdateRegistration ? "outline" : "default"}
                    >
                      {showUpdateRegistration ? "Quản lý đăng ký" : "Đăng ký cá nhân"}
                    </Button>
                  ) : null
                ) : myTeamEntry ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleOpenRegistration}
                    className={`${actionBtn} max-w-64`}
                    aria-label="Đội của bạn trong giải"
                  >
                    <span className="truncate">{myTeamEntry.name}</span>
                  </Button>
                ) : isRegistrationOpen ? (
                  <Button onClick={handleOpenRegistration} className={actionBtn}>
                    Đăng ký giải
                  </Button>
                ) : null}

                {canShowHeaderCheckIn ? (
                  isCheckInOpen ? (
                    <Button
                      onClick={handleHeaderCheckIn}
                      disabled={
                        checkingInTeamId === myRegisteredTeamId ||
                        myTeamCheckedIn
                      }
                      className={actionBtn}
                    >
                      {checkingInTeamId === myRegisteredTeamId
                        ? "Đang check-in…"
                        : myTeamCheckedIn
                          ? "Đã check-in"
                          : "Check-in"}
                    </Button>
                  ) : (
                    <span className="flex h-11 items-center px-1 text-sm text-[#9A9893]">
                      {isIndividualMode ? user?.nickname : myTeamEntry?.name}
                    </span>
                  )
                ) : null}

                <Link
                  to="/profile"
                  title="Hồ sơ cá nhân"
                  className="flex h-11 items-center gap-2 border border-[#2C2B29] pl-1 pr-3 no-underline transition-colors hover:border-[#F2F0EB]"
                >
                  <Avatar className="h-9 w-9 rounded-none">
                    <AvatarImage
                      src={user.profile_picture ?? undefined}
                      alt=""
                      className="object-cover"
                    />
                    <AvatarFallback className="rounded-none bg-[#151515] text-xs font-bold">
                      {(user.nickname || "U")[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="max-w-28 truncate text-sm font-semibold sm:max-w-40">
                    {user.nickname}
                  </span>
                </Link>

                <button
                  type="button"
                  onClick={logout}
                  className="flex h-11 items-center px-2 text-sm text-[#9A9893] hover:text-[#F2F0EB] hover:underline hover:underline-offset-4"
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              isRegistrationOpen ? (
                <Button onClick={handleLoginClick} className={actionBtn}>
                  Đăng nhập để đăng ký
                </Button>
              ) : (
                <button
                  type="button"
                  onClick={handleLoginClick}
                  className="flex h-11 items-center px-1 text-sm font-semibold underline underline-offset-4"
                >
                  Đăng nhập
                </button>
              )
            )}
          </div>
        </div>
      </section>

      <TournamentRegistration
        open={regOpen}
        onOpenChange={setRegOpen}
        tournamentId={tournament?.id}
        requiredPlayerCount={tournament?.max_player_per_team}
        viewMode={dialogMode}
        registrationMode={tournament?.registration_mode}
        alreadyRegistered={Boolean(myRegisteredTeamId || isRegistered)}
      />

      <Dialog
        open={soloUnregConfirmOpen}
        onOpenChange={(nextOpen) => {
          if (soloUnregistering) return;
          setSoloUnregConfirmOpen(nextOpen);
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md gap-0 rounded-sm border-neutral-700 bg-[#141414] p-0 text-neutral-200 shadow-none sm:w-full sm:max-w-md">
          <DialogHeader className="space-y-2 border-b border-neutral-700 px-4 py-4 text-left sm:px-5">
            <DialogTitle className="text-sm font-extrabold uppercase tracking-widest text-white">
              Xác nhận hủy đăng ký
            </DialogTitle>
            <DialogDescription className="text-sm text-neutral-400">
              Bạn có chắc muốn hủy đăng ký giải {tournament?.name || "này"}?
              Hành động này sẽ xóa bạn khỏi danh sách tham gia.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
            <Button
              variant="outline"
              onClick={() => setSoloUnregConfirmOpen(false)}
              disabled={soloUnregistering}
              className="rounded-sm border-neutral-600 bg-transparent text-neutral-200 hover:bg-neutral-900 hover:text-white"
            >
              Không
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmSoloUnregister()}
              disabled={soloUnregistering}
              className="rounded-sm"
            >
              {soloUnregistering ? "Đang hủy..." : "Có, hủy đăng ký"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <TeamRosterDialog
        open={rosterOpen}
        onOpenChange={setRosterOpen}
        teamId={rosterTeamId}
        teamName={
          isIndividualMode
            ? (tournament?.registered?.find(
                (item) => Number(item.id) === Number(rosterTeamId),
              )?.name ??
              user?.nickname ??
              null)
            : (user?.team?.name ?? null)
        }
        teamShortName={
          isIndividualMode
            ? (tournament?.registered?.find(
                (item) => Number(item.id) === Number(rosterTeamId),
              )?.short_name ?? null)
            : (user?.team?.short_name ?? null)
        }
        teamLogoUrl={
          isIndividualMode
            ? (tournament?.registered?.find(
                (item) => Number(item.id) === Number(rosterTeamId),
              )?.logo_url ??
              user?.profile_picture ??
              null)
            : (user?.team?.logo_url ?? null)
        }
        showRiotId={showRiotId}
      />

    </>
  );
};

export default HeroBanner;
