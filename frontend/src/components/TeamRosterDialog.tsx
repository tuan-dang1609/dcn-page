import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import axios from "axios";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchTournamentTeamPlayers,
  tournamentTeamPlayersQueryKey,
} from "@/api/tournaments/queryFns";
import { API_BASE } from "@/lib/apiBase";
import { TOURNAMENT_LOGO } from "@/data/tournament";
import {
  TOURNAMENT_PANEL_CLASS,
  TOURNAMENT_TABLE_HEADER_CLASS,
  TOURNAMENT_TABLE_HEADER_ROW_CLASS,
  TOURNAMENT_TABLE_ROW_CLASS,
} from "@/components/tournamentTheme";

type TeamMember = {
  tournament_team_player_id?: number | string;
  user_id?: number | string;
  id?: number | string;
  username?: string;
  nickname?: string | null;
  riot_account?: string | null;
  profile_picture?: string | null;
  real_name?: string | null;
  role_in_team?: string | null;
};

const getMemberKey = (member: TeamMember, index: number) =>
  String(
    member.tournament_team_player_id ??
      member.user_id ??
      member.id ??
      `member-${index}`,
  );

const getMemberUserId = (member: TeamMember) => {
  const raw = member.user_id ?? member.id;
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

interface TeamRosterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: number | string | null;
  teamName?: string | null;
  teamShortName?: string | null;
  teamLogoUrl?: string | null;
  showRiotId?: boolean;
}

const getInitials = (name?: string | null) => {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "T";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
};

/** Avatar in roster modal — responsive size. */
const ROSTER_MEMBER_AVATAR_CLASS =
  "flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center overflow-hidden border border-neutral-600 bg-[#2d2d2d] text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-neutral-300";

/** ~5 member rows visible; scales with viewport on mobile. */
const ROSTER_BODY_MAX_HEIGHT_CLASS =
  "max-h-[min(17.5rem,calc(100dvh-13rem))] sm:max-h-[min(19rem,calc(88vh-12rem))]";

const ROSTER_TABLE_CLASS = "w-full min-w-[16rem] border-collapse table-fixed sm:min-w-0";

const ROSTER_TABLE_HEADER_TH = `${TOURNAMENT_TABLE_HEADER_CLASS} px-3 py-3 sm:px-4 min-h-[2.75rem] sm:min-h-[3rem] align-middle`;

const ROSTER_TABLE_BODY_TD =
  "px-3 py-3 sm:px-4 sm:py-3.5 align-middle min-h-[3.25rem] sm:min-h-[3.5rem]";

const RosterMembersTable = ({
  members,
  showRiotId,
}: {
  members: TeamMember[];
  showRiotId: boolean;
}) => {
  const colGroup = (
    <colgroup>
      <col className="w-11 sm:w-12" />
      <col />
      {showRiotId ? <col className="w-[7.5rem] sm:w-[11rem]" /> : null}
    </colgroup>
  );

  const headerRow = (
    <tr className={TOURNAMENT_TABLE_HEADER_ROW_CLASS}>
      <th className={`${ROSTER_TABLE_HEADER_TH} w-12`} />
      <th className={`${ROSTER_TABLE_HEADER_TH} whitespace-nowrap text-left`}>
        Thành viên
      </th>
      {showRiotId ? (
        <th className={`${ROSTER_TABLE_HEADER_TH} whitespace-nowrap text-left`}>
          Riot ID
        </th>
      ) : null}
    </tr>
  );

  return (
    <div className="w-full min-w-0 overflow-hidden border border-neutral-700">
      <div className="overflow-x-auto">
        <table className={ROSTER_TABLE_CLASS}>
          {colGroup}
          <thead>{headerRow}</thead>
        </table>
      </div>
      <div
        className={`overflow-x-auto overflow-y-auto border-t border-neutral-700 ${ROSTER_BODY_MAX_HEIGHT_CLASS}`}
      >
        <table className={ROSTER_TABLE_CLASS}>
          {colGroup}
          <tbody>
            {members.map((member, index) => {
              const displayName = member.nickname || member.username || "—";
              const riotAccount = String(member.riot_account ?? "").trim();

              return (
                <tr
                  key={getMemberKey(member, index)}
                  className={TOURNAMENT_TABLE_ROW_CLASS}
                >
                  <td className={`${ROSTER_TABLE_BODY_TD} w-11 sm:w-12`}>
                    <div className={ROSTER_MEMBER_AVATAR_CLASS}>
                      {member.profile_picture ? (
                        <img
                          src={member.profile_picture}
                          alt={displayName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        getInitials(displayName)
                      )}
                    </div>
                  </td>
                  <td className={ROSTER_TABLE_BODY_TD}>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-white">
                        {displayName}
                      </div>
                      {member.real_name ? (
                        <div className="truncate text-xs text-neutral-400">
                          {member.real_name}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  {showRiotId ? (
                    <td className={ROSTER_TABLE_BODY_TD}>
                      <div className="truncate font-mono text-xs sm:text-sm text-neutral-200">
                        {riotAccount || "—"}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TeamRosterDialog = ({
  open,
  onOpenChange,
  teamId,
  teamName,
  teamShortName,
  teamLogoUrl,
  showRiotId = false,
}: TeamRosterDialogProps) => {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const { token } = useAuth();

  const {
    data: teamData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: tournamentTeamPlayersQueryKey(teamId ?? undefined),
    queryFn: () => fetchTournamentTeamPlayers(teamId!),
    enabled: teamId !== null && teamId !== undefined && teamId !== "",
    staleTime: 60_000,
  });

  const members: TeamMember[] = Array.isArray(teamData?.players)
    ? (teamData.players as TeamMember[])
    : [];

  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const custom = e as CustomEvent<{ teamId?: number | string }>;
        if (!custom?.detail) return;
        if (String(custom.detail.teamId) === String(teamId)) {
          void queryClient.invalidateQueries({
            queryKey: tournamentTeamPlayersQueryKey(teamId ?? undefined),
          });
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener("team:members-updated", handler as EventListener);
    return () =>
      window.removeEventListener(
        "team:members-updated",
        handler as EventListener,
      );
  }, [queryClient, teamId]);

  const dialogTitle = teamName
    ? `Thành viên — ${teamName}`
    : "Thành viên đội";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        disableAnimation
        className={`${TOURNAMENT_PANEL_CLASS} flex w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] max-h-[min(100dvh-1rem,34rem)] flex-col gap-0 overflow-hidden rounded-none border-neutral-700 p-0 text-neutral-200 sm:w-full sm:max-w-3xl sm:max-h-[min(88vh,34rem)]`}
      >
        <DialogTitle className="sr-only">{dialogTitle}</DialogTitle>

        <div className="z-20 shrink-0 border-b border-neutral-700 bg-[#141414] px-3 py-3.5 pr-11 sm:px-5 sm:py-4 sm:pr-12">
          <div className="flex items-center gap-3 sm:gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden sm:h-14 sm:w-14">
              <img
                src={teamLogoUrl || TOURNAMENT_LOGO}
                alt={teamName || "Team logo"}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-extrabold uppercase text-white leading-snug sm:text-[19px]">
                {teamName || "Đội chưa có tên"}
              </p>
              {teamShortName ? (
                <p className="mt-1 truncate text-[11px] font-semibold uppercase text-neutral-400 sm:text-xs">
                  {teamShortName}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-3 py-3 sm:px-5">
          {open && isLoading ? (
            <p className="text-sm text-neutral-400">
              Đang tải danh sách thành viên...
            </p>
          ) : null}
          {open && isError ? (
            <p className="text-sm text-rose-400">
              Không tải được danh sách đội.
            </p>
          ) : null}

          {open && !isLoading && !isError ? (
            <>
              {members.length > 0 ? (
                <RosterMembersTable
                  members={members}
                  showRiotId={showRiotId}
                />
              ) : (
                <div className="border border-dashed border-neutral-700 bg-[#111111] px-4 py-8 text-center text-sm text-neutral-400">
                  Đội chưa có thành viên.
                </div>
              )}
            </>
          ) : null}
        </div>

        {open && !isLoading && !isError ? (
          <div className="z-20 shrink-0 border-t border-neutral-700 bg-[#141414] px-3 py-3 sm:px-5">
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="w-full border-neutral-600 bg-transparent text-neutral-200 hover:bg-[#1c1c1c] hover:text-white sm:w-auto"
              >
                Đóng
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          disableAnimation
          className={`${TOURNAMENT_PANEL_CLASS} sm:max-w-sm max-w-[90vw] rounded-none border-neutral-700 text-neutral-200`}
        >
          <DialogTitle className="text-lg font-bold uppercase tracking-wide text-white">
            Xác nhận xóa đồng đội
          </DialogTitle>
          <div className="p-4 pt-0">
            <p className="mt-2 text-sm text-neutral-400">
              Bạn có chắc muốn xóa <strong>{memberToRemove?.username}</strong>{" "}
              khỏi team không? Hành động này sẽ gỡ họ khỏi team.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={removing}
                className="border-neutral-600 bg-transparent text-neutral-200"
              >
                Hủy
              </Button>
              <Button
                onClick={async () => {
                  if (!teamId || !memberToRemove) return;
                  setRemoving(true);
                  try {
                    const remaining = members
                      .map((m) => getMemberUserId(m))
                      .filter(
                        (id): id is number =>
                          id !== null &&
                          id !==
                            getMemberUserId(memberToRemove),
                      );

                    await axios.patch(
                      `${API_BASE}/api/teams/${teamId}`,
                      { user_ids: remaining },
                      {
                        headers: token
                          ? { Authorization: `Bearer ${token}` }
                          : undefined,
                        withCredentials: true,
                      },
                    );

                    toast({
                      title: "Đã xóa đồng đội",
                      description: `${memberToRemove.username} đã được gỡ khỏi team.`,
                    });
                    setConfirmOpen(false);
                    setMemberToRemove(null);
                    await refetch();
                    try {
                      window.dispatchEvent(
                        new CustomEvent("team:members-updated", {
                          detail: { teamId },
                        }),
                      );
                    } catch {
                      /* ignore */
                    }
                  } catch {
                    toast({
                      title: "Không thể xóa",
                      description: "Vui lòng thử lại.",
                      variant: "destructive",
                    });
                  } finally {
                    setRemoving(false);
                  }
                }}
                className="bg-rose-700 text-white hover:bg-rose-600"
                disabled={removing}
              >
                {removing ? "Đang xóa..." : "Xác nhận xóa"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default TeamRosterDialog;
