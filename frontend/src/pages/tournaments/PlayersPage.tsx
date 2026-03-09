import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TOURNAMENT_LOGO } from "@/data/tournament";

type RegisteredTeam = {
  id?: number | string;
  team_id?: number | string;
  name?: string;
  short_name?: string;
  logo_url?: string;
  team_color_hex?: string;
  isCheckedIn?: boolean;
};

type TeamPlayer = {
  user_id?: number | string;
  nickname?: string;
  profile_picture?: string;
  riot_account?: string | null;
  role_in_team?: string;
};

type TeamDetailResponse = {
  name?: string;
  short_name?: string;
  logo_url?: string;
  team_color_hex?: string;
  players?: TeamPlayer[];
};

type PlayersOutletContext = {
  tournament?: {
    id?: number | string;
    register_start?: string;
    register_end?: string;
    check_in_start?: string;
    check_in_end?: string;
    registered?: RegisteredTeam[];
  };
  isLoading?: boolean;
  refetch?: () => Promise<unknown>;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

const toTime = (value?: string) => {
  const ms = Number(new Date(value ?? ""));
  return Number.isFinite(ms) ? ms : null;
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getPlayerInitials = (name?: string, userId?: number | string) => {
  const trimmed = (name ?? "").trim();
  if (trimmed.length > 0) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }

  return `P${userId ?? "?"}`;
};

const PlayersPage = () => {
  const { tournament, isLoading, refetch } =
    useOutletContext<PlayersOutletContext>();
  const { user, token } = useAuth();
  const [checkingInTeamId, setCheckingInTeamId] = useState<number | null>(null);
  const [selectedTournamentTeamId, setSelectedTournamentTeamId] = useState<
    number | null
  >(null);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [teamDetail, setTeamDetail] = useState<TeamDetailResponse | null>(null);
  const [loadingTeamDetail, setLoadingTeamDetail] = useState(false);
  const [teamDetailError, setTeamDetailError] = useState<string | null>(null);

  const apiPlayersRaw = tournament?.registered ?? [];

  const now = Date.now();
  const checkInStartMs = toTime(tournament?.check_in_start);
  const checkInEndMs = toTime(tournament?.check_in_end);

  const isCheckInOpen =
    checkInStartMs !== null &&
    checkInEndMs !== null &&
    now >= checkInStartMs &&
    now <= checkInEndMs;

  const myTeamId = Number(user?.team_id);
  const userId = Number(user?.id);
  const roleId = Number(user?.role_id);
  const canManageOwnTeam =
    [1, 2, 3, 4].includes(roleId) || Number(user?.team?.created_by) === userId;

  const canUseCheckIn =
    Number.isFinite(myTeamId) &&
    myTeamId > 0 &&
    Boolean(token) &&
    canManageOwnTeam &&
    isCheckInOpen;

  const myRegisteredTeamId = useMemo(() => {
    const team = apiPlayersRaw.find(
      (participant) => toNumber(participant.team_id) === myTeamId,
    );
    return team ? toNumber(team.team_id) : null;
  }, [apiPlayersRaw, myTeamId]);

  const myTeamCheckedIn = useMemo(() => {
    const team = apiPlayersRaw.find(
      (participant) => toNumber(participant.team_id) === myTeamId,
    );

    return Boolean(team?.isCheckedIn);
  }, [apiPlayersRaw, myTeamId]);

  const selectedTeam = useMemo(() => {
    if (selectedTournamentTeamId === null) return null;
    return (
      apiPlayersRaw.find(
        (team) => toNumber(team.id) === selectedTournamentTeamId,
      ) ?? null
    );
  }, [apiPlayersRaw, selectedTournamentTeamId]);

  useEffect(() => {
    if (!isTeamModalOpen || selectedTournamentTeamId === null) {
      setTeamDetail(null);
      setTeamDetailError(null);
      return;
    }

    let mounted = true;

    const loadTeamDetail = async () => {
      setLoadingTeamDetail(true);
      setTeamDetailError(null);
      setTeamDetail(null);
      try {
        const response = await axios.get<TeamDetailResponse>(
          `${API_BASE}/api/tournaments/team/players/${selectedTournamentTeamId}`,
        );

        if (!mounted) return;
        setTeamDetail(response.data ?? null);
      } catch {
        if (!mounted) return;
        setTeamDetail(null);
        setTeamDetailError("Không tải được thông tin đội.");
      } finally {
        if (mounted) setLoadingTeamDetail(false);
      }
    };

    void loadTeamDetail();

    return () => {
      mounted = false;
    };
  }, [selectedTournamentTeamId, isTeamModalOpen]);

  const openTeamModal = (tournamentTeamId: number | null) => {
    if (tournamentTeamId === null) return;
    setSelectedTournamentTeamId(tournamentTeamId);
    setIsTeamModalOpen(true);
  };

  const handleCheckIn = async () => {
    if (!token || !tournament?.id || !myRegisteredTeamId) return;

    setCheckingInTeamId(myRegisteredTeamId);
    try {
      await axios.patch(
        `${API_BASE}/api/tournaments/teams/${tournament.id}/${myRegisteredTeamId}/check-in`,
        {
          checked_in: true,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      toast({
        title: "Check-in thành công",
        description: "Đội của bạn đã check-in vào giải đấu.",
      });

      if (refetch) {
        await refetch();
      }
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.message ?? error.response?.data?.error)
        : null;

      toast({
        title: "Check-in thất bại",
        description: message || "Không thể check-in lúc này.",
        variant: "destructive",
      });
    } finally {
      setCheckingInTeamId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-heading">Người chơi</h2>
        {canUseCheckIn && myRegisteredTeamId ? (
          <Button
            onClick={handleCheckIn}
            disabled={
              checkingInTeamId === myRegisteredTeamId || myTeamCheckedIn
            }
          >
            {checkingInTeamId === myRegisteredTeamId
              ? "Đang check-in..."
              : myTeamCheckedIn
                ? "Đã check-in"
                : "Check-in đội của tôi"}
          </Button>
        ) : null}
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải người chơi...</p>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {apiPlayersRaw.map((participant) => (
          <button
            type="button"
            key={`${participant.id ?? participant.team_id}-${participant.name ?? "team"}`}
            onClick={() => openTeamModal(toNumber(participant.id))}
            className={`neo-box-sm bg-card p-3 flex items-center gap-3 hover:bg-muted/30 transition-colors border text-left text-foreground ${
              participant.isCheckedIn
                ? "border-emerald-500/70"
                : "border-red-500/70"
            } ${
              toNumber(participant.id) === selectedTournamentTeamId
                ? "ring-2 ring-primary/60"
                : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <img
                src={participant.logo_url || TOURNAMENT_LOGO}
                alt={participant.name || "Team logo"}
                className="w-8 h-8"
              />
              <div>
                <span className="font-bold block">{participant.name}</span>
                <span
                  className={`text-xs ${
                    participant.isCheckedIn
                      ? "text-emerald-300"
                      : "text-red-300"
                  }`}
                >
                  {participant.isCheckedIn ? "Da check-in" : "Chua check-in"}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <Dialog open={isTeamModalOpen} onOpenChange={setIsTeamModalOpen}>
        <DialogContent className="sm:max-w-2xl bg-slate-950 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-50">Thông tin đội</DialogTitle>
            <DialogDescription className="text-slate-300">
              Xem đội và danh sách người chơi đã đăng ký tham gia giải.
            </DialogDescription>
          </DialogHeader>

          {selectedTeam ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md border border-slate-700 bg-slate-900/80 p-3">
                <img
                  src={
                    teamDetail?.logo_url ||
                    selectedTeam.logo_url ||
                    TOURNAMENT_LOGO
                  }
                  alt={teamDetail?.name || selectedTeam.name || "Team logo"}
                  className="w-12 h-12 rounded-md"
                />
                <div>
                  <h3 className="text-lg font-bold text-slate-100">
                    {teamDetail?.name || selectedTeam.name || "Đội chưa có tên"}
                  </h3>
                  <p className="text-sm text-slate-300">
                    {teamDetail?.short_name || selectedTeam.short_name || "N/A"}
                  </p>
                </div>
              </div>

              {loadingTeamDetail ? (
                <p className="text-sm text-slate-300">
                  Đang tải danh sách người chơi...
                </p>
              ) : null}

              {teamDetailError ? (
                <p className="text-sm text-red-300">{teamDetailError}</p>
              ) : null}

              {!loadingTeamDetail && !teamDetailError ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-100">
                    Người chơi tham gia ({teamDetail?.players?.length ?? 0})
                  </p>

                  {(teamDetail?.players?.length ?? 0) > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(teamDetail?.players ?? []).map((player) => (
                        <div
                          key={`${player.user_id}-${player.nickname}`}
                          className="rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2"
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="h-9 w-9 border border-slate-600">
                              <AvatarImage
                                src={player.profile_picture || undefined}
                                alt={player.nickname || "Player avatar"}
                              />
                              <AvatarFallback className="bg-slate-700 text-slate-100 text-xs font-semibold">
                                {getPlayerInitials(
                                  player.nickname,
                                  player.user_id,
                                )}
                              </AvatarFallback>
                            </Avatar>

                            <div className="min-w-0">
                              <p className="font-medium text-slate-100 truncate">
                                {player.nickname ||
                                  `Player #${player.user_id ?? "?"}`}
                              </p>
                              <p className="text-xs text-slate-300">
                                {player.role_in_team || "Thành viên"}
                              </p>
                              {player.riot_account ? (
                                <p className="text-xs text-sky-300 mt-1 truncate">
                                  Riot: {player.riot_account}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-300">
                      Đội này chưa có người chơi đăng ký vào giải.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-300">Chưa chọn đội.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlayersPage;
