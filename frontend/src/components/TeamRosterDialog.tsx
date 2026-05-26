import { useEffect, useState } from "react";
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
  members?: TeamMember[];
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

    return () => {
      mounted = false;
    };
  }, [open, teamId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ backgroundColor: "#000" }}
        className="sm:max-w-7xl max-w-[95vw] border-slate-700 text-slate-100"
      >
        <div className="p-4 border-b border-slate-800">
                <div className="flex items-center gap-6">
            <img src={teamLogoUrl || TOURNAMENT_LOGO} alt={teamName || "Team logo"} className="w-20 h-20 rounded-full object-cover" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{teamName || "Đội chưa có tên"}</h2>
                  {teamShortName ? <p className="text-sm text-slate-300">{teamShortName}</p> : null}
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
                <div className="flex gap-6 flex-nowrap justify-center overflow-x-auto py-2">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center gap-6 rounded-md bg-black border border-slate-700 px-6 py-4 flex-none w-72 sm:w-80 md:w-96">
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
                        <div className="font-semibold text-white whitespace-nowrap px-2">{member.nickname || member.username}</div>
                        {member.real_name ? <div className="text-xs text-slate-400 whitespace-nowrap px-2">{member.real_name}</div> : null}
                        <div className="text-xs text-sky-300 mt-1 whitespace-nowrap px-2">Riot ID: {member.riot_account ?? "N/A"}</div>
                      </div>
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
    </Dialog>
  );
};

export default TeamRosterDialog;
