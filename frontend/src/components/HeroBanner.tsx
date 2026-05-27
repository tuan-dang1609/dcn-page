import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { API_BASE } from "@/lib/apiBase";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft,
  Bell,
  Check,
  LogIn,
  LogOut,
  Trophy,
  RefreshCw,
  X,
} from "lucide-react";
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
import {
  acceptTeamInvite,
  declineTeamInvite,
  getMyTeamInvites,
  type TeamInviteRecord,
} from "@/api/teamInvites";
import { useTeamInviteStream } from "@/hooks/useTeamInviteStream";
import TeamRosterDialog from "@/components/TeamRosterDialog";

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
  } | null;
}

const HeroBanner = ({ tournament }: HeroBannerProps) => {
  const { user, logout, isRegistered, setIsRegistered, token, refreshUser } =
    useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [regOpen, setRegOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"manage" | "roster">("manage");
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterTeamId, setRosterTeamId] = useState<number | string | null>(
    null,
  );
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<TeamInviteRecord[]>([]);
  const [inviteActionId, setInviteActionId] = useState<number | null>(null);
  const previousInviteCountRef = useRef(0);
  const hasTeam = Boolean((user as any)?.team_id);
  const isTeamCaptain = Boolean(
    user?.team && Number(user.team.created_by) === Number(user.id),
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

  const handleOpenRoster = () => {
    const registered = (tournament as any)?.registered ?? [];
    const match = registered.find(
      (r: any) => Number(r.team_id) === Number(user?.team_id),
    );
    setRosterTeamId(match ? Number(match.id) : null);
    setRosterOpen(true);
  };

  const [checkingInTeamId, setCheckingInTeamId] = useState<number | null>(null);
  const [myRegisteredTeamId, setMyRegisteredTeamId] = useState<number | null>(
    null,
  );
  const [myTeamCheckedIn, setMyTeamCheckedIn] = useState<boolean>(false);

  const fetchRegisteredTeams = useCallback(async () => {
    if (!tournament?.id || !user) return;

    try {
      const res = await axios.get(
        `${API_BASE}/api/tournaments/teams/${tournament.id}`,
      );
      const teams = Array.isArray(res.data?.teams) ? res.data.teams : [];
      const myTeam = teams.find(
        (t: any) => Number(t.team_id) === Number(user?.team_id),
      );
      const nextRegisteredTeamId = myTeam
        ? Number(myTeam.id ?? myTeam.team_id)
        : null;

      setMyRegisteredTeamId(nextRegisteredTeamId);
      setMyTeamCheckedIn(Boolean(myTeam?.isCheckedIn));
      setIsRegistered(Boolean(nextRegisteredTeamId));
    } catch {
      setMyRegisteredTeamId(null);
      setMyTeamCheckedIn(false);
      setIsRegistered(false);
    }
  }, [tournament?.id, user, setIsRegistered]);

  useEffect(() => {
    void fetchRegisteredTeams();
  }, [fetchRegisteredTeams]);

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

  const canShowHeaderCheckIn = Boolean(
    isTeamCaptain && user?.team_id && myRegisteredTeamId,
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

  const syncInvites = useCallback(
    async ({ notify = false }: { notify?: boolean } = {}) => {
      if (!user) return [] as TeamInviteRecord[];

      try {
        const response = await getMyTeamInvites(token);
        const invites = response.data?.invites ?? [];

        setPendingInvites(invites);

        const nextCount = invites.length;
        const previousCount = previousInviteCountRef.current;

        if (notify && nextCount > previousCount) {
          toast.success(
            nextCount === 1
              ? "Bạn có 1 lời mời team mới"
              : `Bạn có ${nextCount} lời mời team mới`,
          );
        }

        previousInviteCountRef.current = nextCount;
        return invites;
      } catch {
        setPendingInvites([]);
        return [] as TeamInviteRecord[];
      }
    },
    [user, token],
  );

  useEffect(() => {
    if (!user) {
      setPendingInvites([]);
      previousInviteCountRef.current = 0;
      return;
    }

    void syncInvites({ notify: false });
  }, [user, syncInvites]);

  useTeamInviteStream({
    enabled: Boolean(user && token),
    token,
    userId: Number(user?.id),
    onEvent: useCallback(
      (payload) => {
        // Treat invite_created as notify; treat invite_updated with accepted status or event_name containing 'accept' as notify
        const isCreated = payload.type === "invite_created";
        const isUpdated = payload.type === "invite_updated";
        const isAcceptedEventName =
          typeof payload.event_name === "string" &&
          payload.event_name.includes("accept");
        const isInviteAccepted =
          isUpdated &&
          (isAcceptedEventName || payload.invite?.status === "accepted");

        const shouldNotify = isCreated || isInviteAccepted;
        void syncInvites({ notify: shouldNotify });

        // handle membership changes pushed by server (kicked or joined)
        if (payload.type === "team_membership_changed") {
          const eventName = String(payload.event_name ?? "");
          if (eventName.includes("removed")) {
            // we were removed -> refresh user profile and show toast
            void refreshUser().catch(() => {});
            toast.error("Bạn đã bị gỡ khỏi team");
          } else if (eventName.includes("joined")) {
            void refreshUser().catch(() => {});
            toast.success("Bạn đã được thêm vào team");
          }
        }
      },
      [syncInvites],
    ),
  });

  const inviteCount = useMemo(() => pendingInvites.length, [pendingInvites]);

  const handleOpenInviteModal = async () => {
    setInviteModalOpen(true);
    await syncInvites({ notify: false });
  };

  const handleAcceptInvite = async (inviteId: number) => {
    setInviteActionId(inviteId);
    try {
      await acceptTeamInvite(inviteId, token);
      await syncInvites({ notify: false });
      toast.success("Đã chấp nhận lời mời");
      window.location.reload();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error || error?.message || "Không thể chấp nhận",
      );
    } finally {
      setInviteActionId(null);
    }
  };

  const handleDeclineInvite = async (inviteId: number) => {
    setInviteActionId(inviteId);
    try {
      await declineTeamInvite(inviteId, token);
      await syncInvites({ notify: false });
      toast.success("Đã từ chối lời mời");
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error || error?.message || "Không thể từ chối",
      );
    } finally {
      setInviteActionId(null);
    }
  };

  const handleBackToSeries = () => {
    if (normalizedSeriesSlug) {
      navigate(`/series/${normalizedSeriesSlug}`);
      return;
    }

    navigate("/series/dcn_series");
  };

  return (
    <>
      <div className="relative w-full h-87.5 md:h-105 overflow-hidden bg-muted">
        {normalizedSeriesSlug ? (
          <div className="absolute left-4 top-4 z-20">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleBackToSeries}
              className="gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              Về series
            </Button>
          </div>
        ) : null}

        <div
          className="absolute inset-0 bg-cover bg-center scale-105"
          style={{ backgroundImage: `url(${tournament?.banner_url})` }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/60 to-transparent" />

        {/* Bottom: tournament info left + auth area right (stacks on small screens) */}
        <div className="absolute left-0 right-0 bottom-0 p-4 sm:p-6 md:p-10 flex flex-col md:flex-row items-center md:items-end justify-between gap-4">
          {/* Left: tournament info (center on small, left on md+) */}
          <div className="min-w-0 w-full md:w-auto text-center md:text-left">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight mb-2 max-w-180 mx-auto md:mx-0">
              {tournament?.name || "Đang tải..."}
            </h1>
            <p className="text-sm sm:text-sm md:text-basetext-[#EEEEEE]">
              Tổ chức bởi{" "}
              <span className="font-semibold text-primary">
                Dong Chuyen Nghiep
              </span>
            </p>
          </div>

          {/* Right: auth area (move below on small screens) */}
          <div className="flex items-center gap-3 shrink-0 mt-3 md:mt-0">
            {user ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleOpenInviteModal}
                  className="relative h-10 w-10 rounded-full border border-border bg-card/80 backdrop-blur-sm"
                  aria-label="Thông báo lời mời"
                >
                  <Bell className="w-4 h-4" />
                  {inviteCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                      {inviteCount}
                    </span>
                  )}
                </Button>

                <div className="flex items-center gap-2 bg-card/80 backdrop-blur-sm border border-border rounded-lg px-3 py-2">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center overflow-hidden">
                    <Avatar className="w-7 h-7">
                      <AvatarImage
                        src={user.profile_picture ?? undefined}
                        alt={user.nickname}
                      />
                      <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
                        {(user.nickname || "U")[0]}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <span className="text-sm font-semibold">{user.nickname}</span>
                </div>
                {hasTeam && !isTeamCaptain ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleOpenRoster}
                    className="h-10 rounded-full border border-border bg-card/80 backdrop-blur-sm px-3 py-2 flex items-center gap-2 max-w-55"
                    aria-label="Xem đồng đội trong giải"
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage
                        src={user?.team?.logo_url ?? undefined}
                        alt={user?.team?.name ?? "Team"}
                      />
                      <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
                        {(user?.team?.short_name || user?.team?.name || "T")[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="max-w-35 truncate text-sm font-semibold">
                      {user?.team?.name}
                    </span>
                  </Button>
                ) : isRegistrationOpen || isRegistered ? (
                  <Button
                    size="sm"
                    onClick={handleOpenRegistration}
                    className="h-11 px-4 sm:px-5 gap-2 text-sm sm:text-base font-semibold"
                    variant={showUpdateRegistration ? "outline" : "default"}
                  >
                    {showUpdateRegistration ? (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        <span className="hidden sm:inline">Cập nhật</span>
                        <span className="sm:hidden">Cập nhật</span>
                      </>
                    ) : (
                      <>
                        <Trophy className="w-4 h-4" />
                        <span className="hidden sm:inline">Đăng ký giải</span>
                        <span className="sm:hidden">Đăng ký</span>
                      </>
                    )}
                  </Button>
                ) : null}

                {canShowHeaderCheckIn ? (
                  isCheckInOpen ? (
                    <Button
                      size="sm"
                      onClick={handleHeaderCheckIn}
                      disabled={
                        checkingInTeamId === myRegisteredTeamId ||
                        myTeamCheckedIn
                      }
                      className="gap-1.5"
                    >
                      {checkingInTeamId === myRegisteredTeamId
                        ? "Đang check-in..."
                        : myTeamCheckedIn
                          ? "Đã check-in"
                          : "Check-in đội của tôi"}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-2 backdrop-blur-sm">
                      <Avatar className="h-6 w-6">
                        <AvatarImage
                          src={user?.team?.logo_url ?? undefined}
                          alt={user?.team?.name ?? "Team"}
                        />
                        <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
                          {
                            (user?.team?.short_name ||
                              user?.team?.name ||
                              "T")[0]
                          }
                        </AvatarFallback>
                      </Avatar>
                      <span className="max-w-32 truncate text-sm font-semibold">
                        {user?.team?.name}
                      </span>
                    </div>
                  )
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={logout}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={handleLoginClick} className="gap-1.5">
                <LogIn className="w-4 h-4" />
                Đăng nhập
              </Button>
            )}
          </div>
        </div>
      </div>

      <TournamentRegistration
        open={regOpen}
        onOpenChange={setRegOpen}
        tournamentId={tournament?.id}
        requiredPlayerCount={tournament?.max_player_per_team}
        viewMode={dialogMode}
      />

      <TeamRosterDialog
        open={rosterOpen}
        onOpenChange={setRosterOpen}
        teamId={rosterTeamId}
        teamName={user?.team?.name ?? null}
        teamShortName={user?.team?.short_name ?? null}
        teamLogoUrl={user?.team?.logo_url ?? null}
      />

      <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl border-border bg-card p-6 shadow-xl">
          <DialogHeader>
            <DialogTitle>Lời mời team</DialogTitle>
            <DialogDescription>
              {hasTeam
                ? "Bạn đang có team. Nếu muốn nhận team mới, hãy rời team hiện tại trước."
                : "Chấp nhận hoặc từ chối các lời mời đang chờ."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {inviteCount === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                Không có lời mời nào.
              </div>
            ) : (
              pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="rounded-xl border border-border bg-background p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {invite.team_name}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        Mời bởi {invite.inviter_username}
                      </p>
                    </div>
                    <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                      Pending
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleDeclineInvite(invite.id)}
                      disabled={inviteActionId === invite.id}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Từ chối
                    </Button>
                    <Button
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleAcceptInvite(invite.id)}
                      disabled={inviteActionId === invite.id || hasTeam}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      {inviteActionId === invite.id
                        ? "Đang xử lý..."
                        : "Chấp nhận"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HeroBanner;
