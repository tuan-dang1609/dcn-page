import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/apiBase";
import { TOURNAMENT_LOGO } from "@/data/tournament";
import TeamRosterDialog from "@/components/TeamRosterDialog";

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
        <p className="text-smtext-[#EEEEEE]">Đang tải người chơi...</p>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {apiPlayersRaw.map((participant) => (
          <button
            type="button"
            key={`${participant.id ?? participant.team_id}-${participant.name ?? "team"}`}
            onClick={() => openTeamModal(toNumber(participant.id))}
            style={
              toNumber(participant.id) === selectedTournamentTeamId
                ? { backgroundColor: "#0b0b0d" }
                : undefined
            }
            className={`neo-box-sm p-3 flex items-center gap-3 transition-colors text-left text-foreground ${
              toNumber(participant.id) === selectedTournamentTeamId
                ? ""
                : "bg-card hover:bg-muted/30"
            } ${participant.isCheckedIn ? "border-emerald-500/70" : "border-red-500/70"}`}
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

      <TeamRosterDialog
        open={isTeamModalOpen}
        onOpenChange={setIsTeamModalOpen}
        teamId={selectedTournamentTeamId}
        teamName={selectedTeam?.name || null}
        teamShortName={selectedTeam?.short_name || null}
        teamLogoUrl={selectedTeam?.logo_url || null}
      />
    </div>
  );
};

export default PlayersPage;
