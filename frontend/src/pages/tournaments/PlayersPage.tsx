import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

type PlayersOutletContext = {
  tournament?: {
    id?: number | string;
    register_start?: string;
    register_end?: string;
    check_in_start?: string;
    check_in_end?: string;
    registered?: Array<{
      id?: number | string;
      team_id?: number | string;
      name?: string;
      logo_url?: string;
      team_color_hex?: string;
      isCheckedIn?: boolean;
    }>;
  };
  isLoading?: boolean;
  refetch?: () => Promise<unknown>;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

const toTime = (value?: string) => {
  const ms = Number(new Date(value ?? ""));
  return Number.isFinite(ms) ? ms : null;
};

const PlayersPage = () => {
  const { tournament, isLoading, refetch } =
    useOutletContext<PlayersOutletContext>();
  const { user, token } = useAuth();
  const [checkingInTeamId, setCheckingInTeamId] = useState<number | null>(null);

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
      (participant) => Number(participant.team_id) === myTeamId,
    );
    return team ? Number(team.team_id) : null;
  }, [apiPlayersRaw, myTeamId]);

  const myTeamCheckedIn = useMemo(() => {
    const team = apiPlayersRaw.find(
      (participant) => Number(participant.team_id) === myTeamId,
    );

    return Boolean(team?.isCheckedIn);
  }, [apiPlayersRaw, myTeamId]);

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
          <div
            key={`${participant.id}-${participant.name}`}
            className={`neo-box-sm bg-card p-3 flex items-center gap-3 hover:bg-muted/30 transition-colors border ${
              participant.isCheckedIn
                ? "border-emerald-500/70"
                : "border-red-500/70"
            }`}
          >
            <div className="flex items-center gap-2">
              <img
                src={participant.logo_url}
                alt={participant.name}
                className="w-8 h-8"
              />
              <div>
                <span className="font-bold block">{participant.name}</span>
                <span
                  className={`text-xs ${
                    participant.isCheckedIn
                      ? "text-emerald-500"
                      : "text-red-500"
                  }`}
                >
                  {participant.isCheckedIn ? "Da check-in" : "Chua check-in"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlayersPage;
