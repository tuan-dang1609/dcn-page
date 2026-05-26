import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { API_BASE } from "@/lib/apiBase";
import { TOURNAMENT_LOGO } from "@/data/tournament";

type TeamMember = {
  id: number | string;
  username?: string;
  nickname?: string | null;
  riot_account?: string | null;
  profile_picture?: string | null;
  real_name?: string | null;
};

type TeamDetailsResponse = {
  players?: TeamMember[];
};

interface TeamRosterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: number | string | null;
  teamName?: string | null;
  teamShortName?: string | null;
  teamLogoUrl?: string | null;
}

const getInitials = (name?: string | null) => {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "T";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
};

const TeamRosterDialog = ({
  open,
  onOpenChange,
  teamId,
  teamName,
  teamShortName,
  teamLogoUrl,
}: TeamRosterDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { user, token } = useAuth();

  useEffect(() => {
    if (!open || !teamId) {
      setMembers([]);
      setError(null);
      return;
    }

    let mounted = true;

    const loadTeam = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get<TeamDetailsResponse>(
          `${API_BASE}/api/tournaments/team/players/${teamId}`,
        );
        if (!mounted) return;
        setMembers(
          Array.isArray(res.data?.players)
            ? (res.data?.players as unknown as TeamMember[])
            : [],
        );
      } catch (err) {
        if (!mounted) return;
        setMembers([]);
        setError("Không tải được danh sách đội.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadTeam();
    // refresh when requested

    return () => {
      mounted = false;
    };
  }, [open, teamId]);

  useEffect(() => {
    if (!open || !teamId) return;
    // trigger reload when refreshKey changes
    let mounted = true;
    const reload = async () => {
      try {
        const res = await axios.get<TeamDetailsResponse>(
          `${API_BASE}/api/tournaments/team/players/${teamId}`,
        );
        if (!mounted) return;
        setMembers(
          Array.isArray(res.data?.players)
            ? (res.data?.players as unknown as TeamMember[])
            : [],
        );
      } catch {
        if (!mounted) return;
        setError("Không tải được danh sách đội.");
      }
    };

    void reload();

    return () => {
      mounted = false;
    };
  }, [refreshKey, open, teamId]);

  // listen for global updates when members change elsewhere
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const custom = e as CustomEvent<{ teamId?: number | string }>;
        if (!custom?.detail) return;
        if (String(custom.detail.teamId) === String(teamId)) {
          setRefreshKey((k) => k + 1);
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
  }, [teamId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ backgroundColor: "#000" }}
        className="sm:max-w-7xl max-w-[95vw] border-slate-700 text-slate-100"
      >
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-6">
            <img
              src={teamLogoUrl || TOURNAMENT_LOGO}
              alt={teamName || "Team logo"}
              className="w-20 h-20 rounded-full object-cover"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">
                    {teamName || "Đội chưa có tên"}
                  </h2>
                  {teamShortName ? (
                    <p className="text-sm text-slate-300">{teamShortName}</p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <p className="text-sm text-slate-300">
              Đang tải danh sách thành viên...
            </p>
          ) : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          {!loading && !error ? (
            <div>
              {members.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-4 rounded-md bg-black border border-slate-700 px-4 py-3 w-full"
                    >
                      <div className="w-14 h-14 rounded-full overflow-hidden bg-black flex items-center justify-center shrink-0">
                        {member.profile_picture ? (
                          <img
                            src={member.profile_picture}
                            alt={member.nickname || member.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="bg-slate-700 w-full h-full flex items-center justify-center text-slate-100 font-semibold text-base">
                            {getInitials(member.nickname ?? member.username)}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white truncate">
                          {member.nickname || member.username}
                        </div>
                        {member.real_name ? (
                          <div className="text-xs text-slate-400 truncate">
                            {member.real_name}
                          </div>
                        ) : null}
                        <div className="text-xs text-sky-300 mt-1 truncate">
                          Riot ID: {member.riot_account ?? "N/A"}
                        </div>
                      </div>
                      {/* delete action intentionally removed from roster dialog */}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-slate-700 bg-slate-900/50 px-4 py-6 text-center text-sm text-slate-300">
                  Team chưa có thành viên.
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Đóng
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
      {/* Confirm remove modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm max-w-[90vw] border-slate-700 text-slate-100">
          <div className="p-4">
            <h3 className="text-lg font-semibold">Xác nhận xóa đồng đội</h3>
            <p className="text-sm text-slate-300 mt-2">
              Bạn có chắc muốn xóa <strong>{memberToRemove?.username}</strong>{" "}
              khỏi team không? Hành động này sẽ gỡ họ khỏi team.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={removing}
              >
                Hủy
              </Button>
              <Button
                onClick={async () => {
                  if (!teamId || !memberToRemove) return;
                  setRemoving(true);
                  try {
                    // compute remaining member ids (exclude memberToRemove)
                    const remaining = members
                      .map((m) => Number(m.id))
                      .filter(
                        (id) =>
                          Number.isFinite(id) &&
                          id !== Number(memberToRemove.id),
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
                    setRefreshKey((k) => k + 1);
                    try {
                      window.dispatchEvent(
                        new CustomEvent("team:members-updated", {
                          detail: { teamId },
                        }),
                      );
                    } catch {
                      /* ignore */
                    }
                  } catch (err) {
                    toast({
                      title: "Không thể xóa",
                      description: "Vui lòng thử lại.",
                      variant: "destructive",
                    });
                  } finally {
                    setRemoving(false);
                  }
                }}
                className="bg-red-600 text-white"
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
