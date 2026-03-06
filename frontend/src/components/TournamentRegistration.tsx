import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users,
  Plus,
  ChevronRight,
  Check,
  Shield,
  AlertCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface TeamMember {
  id: number;
  username: string;
  profile_picture: string | null;
}

interface TeamDetailsResponse {
  members?: Array<{
    id: number | string;
    username: string;
    profile_picture: string | null;
  }>;
}

interface TournamentTeamRow {
  id: number | string;
  team_id: number | string;
}

interface TournamentTeamPlayersResponse {
  players?: Array<{
    user_id: number | string;
  }>;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) return fallback;

  const payload = error.response?.data as {
    message?: string;
    error?: string;
  };

  return payload?.message ?? payload?.error ?? fallback;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tournamentId?: number | string;
  requiredPlayerCount?: number | string;
}

const TournamentRegistration = ({
  open,
  onOpenChange,
  tournamentId,
  requiredPlayerCount,
}: Props) => {
  const { user, token, setIsRegistered, refreshUser } = useAuth();
  const [step, setStep] = useState<"team" | "members" | "create-team">("team");
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [tournamentTeamId, setTournamentTeamId] = useState<number | null>(null);

  // Create team form
  const [newTeam, setNewTeam] = useState({
    name: "",
    short_name: "",
    logo_url: "",
    team_color_hex: "#4F46E5",
  });

  if (!user) return null;

  const hasTeam = !!user.team_id;
  const userId = Number(user.id);
  const roleId = Number(user.role_id);
  const teamOwnerId = Number(user.team?.created_by);

  const teamMemberCount = teamMembers.length;
  const minPlayersRequired = Math.max(1, Number(requiredPlayerCount) || 5);
  const hasEnoughPlayersForTournament =
    selectedMembers.length >= minPlayersRequired;
  const hasValidSelectedCount =
    selectedMembers.length === teamMemberCount ||
    selectedMembers.length === teamMemberCount + 2;

  // Rule: cần có team, và (role_id = 4 hoặc là người tạo team)
  const canRegister =
    !hasTeam ||
    roleId === 4 ||
    (Number.isFinite(teamOwnerId) && teamOwnerId === userId);

  const authHeaders = token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : undefined;

  const toggleMember = (id: number) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const loadTeamMembers = async () => {
    if (!hasTeam) {
      setTeamMembers([]);
      return;
    }

    setLoadingMembers(true);
    try {
      const response = await axios.get<TeamDetailsResponse>(
        `${API_BASE}/api/teams/${user.team_id}`,
      );

      const members = Array.isArray(response.data?.members)
        ? response.data.members.map((member) => ({
            id: Number(member.id),
            username: member.username,
            profile_picture: member.profile_picture ?? null,
          }))
        : [];

      setTeamMembers(members);
    } catch {
      setTeamMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  const getRegisteredTournamentTeamId = async () => {
    if (!tournamentId || !hasTeam) return null;

    const response = await axios.get<{ teams?: TournamentTeamRow[] }>(
      `${API_BASE}/api/tournaments/teams/${tournamentId}`,
    );

    const teams = Array.isArray(response.data?.teams)
      ? response.data.teams
      : [];
    const found = teams.find(
      (team) => Number(team.team_id) === Number(user.team_id),
    );

    return found ? Number(found.id) : null;
  };

  const loadRegisteredPlayers = async (currentTournamentTeamId: number) => {
    const response = await axios.get<TournamentTeamPlayersResponse>(
      `${API_BASE}/api/tournaments/team/players/${currentTournamentTeamId}`,
    );

    const ids = Array.isArray(response.data?.players)
      ? response.data.players
          .map((player) => Number(player.user_id))
          .filter(Number.isFinite)
      : [];

    setSelectedMembers(ids);
  };

  useEffect(() => {
    if (!open || !hasTeam) return;

    void loadTeamMembers();
  }, [open, hasTeam, user.team_id]);

  useEffect(() => {
    if (!open || !hasTeam || !tournamentId) return;

    const resolveRegisteredStatus = async () => {
      try {
        const foundId = await getRegisteredTournamentTeamId();
        setTournamentTeamId(foundId);
        setIsRegistered(Boolean(foundId));

        if (foundId) {
          await loadRegisteredPlayers(foundId);
          setStep("members");
        } else {
          setStep("team");
          setSelectedMembers([]);
        }
      } catch {
        setTournamentTeamId(null);
        setIsRegistered(false);
        setStep("team");
        setSelectedMembers([]);
      }
    };

    void resolveRegisteredStatus();
  }, [open, hasTeam, tournamentId, user.team_id, setIsRegistered]);

  const handleConfirmTeam = async () => {
    setStep("members");
  };

  const handleCreateTeam = async () => {
    if (!newTeam.name.trim() || !newTeam.short_name.trim()) return;

    if (!authHeaders) {
      toast({
        title: "Bạn chưa đăng nhập",
        description: "Vui lòng đăng nhập để tạo đội.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API_BASE}/api/teams`, newTeam, {
        headers: authHeaders,
      });

      await refreshUser();

      toast({
        title: "Tạo team thành công!",
        description: `Team ${newTeam.name} đã được tạo.`,
      });

      setStep("team");
    } catch (error) {
      toast({
        title: "Tạo team thất bại",
        description: getApiErrorMessage(error, "Không thể tạo team mới."),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitRegistration = async () => {
    if (selectedMembers.length === 0) return;

    if (!hasEnoughPlayersForTournament) {
      toast({
        title: "Chưa đủ số lượng tối thiểu",
        description: `Giải đấu yêu cầu ít nhất ${minPlayersRequired} người để đăng ký.`,
        variant: "destructive",
      });
      return;
    }

    if (!hasValidSelectedCount) {
      toast({
        title: "Số lượng thành viên chưa hợp lệ",
        description:
          "Danh sách đăng ký phải bằng hoặc thêm 2 người so với số người trong đội.",
        variant: "destructive",
      });
      return;
    }

    if (!tournamentId) {
      toast({
        title: "Thiếu thông tin giải đấu",
        description: "Không xác định được tournament_id để đăng ký.",
        variant: "destructive",
      });
      return;
    }

    if (!authHeaders) {
      toast({
        title: "Bạn chưa đăng nhập",
        description: "Vui lòng đăng nhập để đăng ký.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      let finalTournamentTeamId = tournamentTeamId;
      if (!finalTournamentTeamId) {
        try {
          await axios.post(
            `${API_BASE}/api/tournaments/teams/${tournamentId}`,
            {},
            {
              headers: authHeaders,
            },
          );
        } catch (error) {
          const isAlreadyRegistered =
            axios.isAxiosError(error) &&
            error.response?.status === 400 &&
            String(error.response?.data?.message ?? "")
              .toLowerCase()
              .includes("đã được đăng ký");

          if (!isAlreadyRegistered) {
            throw error;
          }
        }

        finalTournamentTeamId = await getRegisteredTournamentTeamId();
      }

      if (!finalTournamentTeamId) {
        throw new Error(
          "Bạn cần đăng ký đội vào giải trước khi thêm người chơi",
        );
      }

      await axios.patch(
        `${API_BASE}/api/tournaments/team/players/${finalTournamentTeamId}`,
        {
          user_ids: selectedMembers,
        },
        {
          headers: authHeaders,
        },
      );

      toast({
        title: "Đăng ký thành công!",
        description: `Đã đăng ký ${selectedMembers.length} người chơi vào giải đấu.`,
      });

      setIsRegistered(true);
      setTournamentTeamId(finalTournamentTeamId);
      onOpenChange(false);
      setStep("team");
      setSelectedMembers([]);
      window.location.reload();
    } catch (error) {
      toast({
        title: "Đăng ký thất bại",
        description: getApiErrorMessage(
          error,
          "Không thể thêm người chơi vào đội thi.",
        ),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdrawRegistration = async () => {
    if (!tournamentId || !hasTeam) {
      toast({
        title: "Thiếu thông tin",
        description: "Không xác định được team hoặc giải đấu để hủy đăng ký.",
        variant: "destructive",
      });
      return;
    }

    if (!authHeaders) {
      toast({
        title: "Bạn chưa đăng nhập",
        description: "Vui lòng đăng nhập để thao tác.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      await axios.delete(
        `${API_BASE}/api/tournaments/teams/${tournamentId}/${user.team_id}`,
        {
          headers: authHeaders,
        },
      );

      toast({
        title: "Đã hủy đăng ký",
        description: "Đội của bạn đã được xóa khỏi danh sách tham gia giải.",
      });

      setIsRegistered(false);
      setTournamentTeamId(null);
      setSelectedMembers([]);
      setStep("team");
      onOpenChange(false);
      window.location.reload();
    } catch (error) {
      toast({
        title: "Hủy đăng ký thất bại",
        description: getApiErrorMessage(
          error,
          "Không thể xóa đội khỏi danh sách đăng ký.",
        ),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = (v: boolean) => {
    if (!v) {
      setStep("team");
      setSelectedMembers([]);
      setTournamentTeamId(null);
    }
    onOpenChange(v);
  };

  // Not allowed when user already has a team but lacks permission by rule
  if (hasTeam && !canRegister) {
    return (
      <Dialog open={open} onOpenChange={resetAndClose}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Không có quyền
            </DialogTitle>
            <DialogDescription>
              Bạn không có quyền đăng ký giải đấu. Bạn cần có team và là chủ sở
              hữu.
            </DialogDescription>
          </DialogHeader>
          <Button variant="outline" onClick={() => resetAndClose(false)}>
            Đóng
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
              step === "team" || step === "create-team"
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Bước 1
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          <div
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
              step === "members"
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Bước 2
          </div>
        </div>

        {step === "team" && (
          <>
            <DialogHeader>
              <DialogTitle>Chọn team</DialogTitle>
              <DialogDescription>
                Xác nhận team của bạn để đăng ký giải đấu
              </DialogDescription>
            </DialogHeader>

            {hasTeam && user.team ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 bg-muted/50 border border-border rounded-lg p-4">
                  <img
                    src={
                      user.team.logo_url ||
                      "https://via.placeholder.com/96?text=Team"
                    }
                    alt={user.team.name}
                    className="w-12 h-12 rounded-lg object-cover bg-muted"
                  />
                  <div className="flex-1">
                    <p className="font-bold">{user.team.name}</p>
                    <p className="text-muted-foreground text-xs">
                      [{user.team.short_name}] • Tạo bởi{" "}
                      {user.team.created_by_name}
                    </p>
                  </div>
                  <Check className="w-5 h-5 text-primary" />
                </div>
                <Button
                  className="w-full"
                  onClick={handleConfirmTeam}
                  disabled={submitting}
                >
                  Tiếp tục
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            ) : (
              <div className="space-y-4 text-center py-4">
                <p className="text-muted-foreground text-sm">
                  Bạn chưa có team. Hãy tạo một team mới.
                </p>
                <Button onClick={() => setStep("create-team")}>
                  <Plus className="w-4 h-4 mr-1" />
                  Tạo team mới
                </Button>
              </div>
            )}
          </>
        )}

        {step === "create-team" && (
          <>
            <DialogHeader>
              <DialogTitle>Tạo team mới</DialogTitle>
              <DialogDescription>Điền thông tin team của bạn</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tên team</label>
                <Input
                  value={newTeam.name}
                  onChange={(e) =>
                    setNewTeam((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="VD: Beacon Esports"
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tên viết tắt</label>
                <Input
                  value={newTeam.short_name}
                  onChange={(e) =>
                    setNewTeam((p) => ({ ...p, short_name: e.target.value }))
                  }
                  placeholder="VD: BCN"
                  maxLength={5}
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Logo URL</label>
                <Input
                  value={newTeam.logo_url}
                  onChange={(e) =>
                    setNewTeam((p) => ({ ...p, logo_url: e.target.value }))
                  }
                  placeholder="https://..."
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Màu team</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={newTeam.team_color_hex}
                    onChange={(e) =>
                      setNewTeam((p) => ({
                        ...p,
                        team_color_hex: e.target.value,
                      }))
                    }
                    className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
                  />
                  <Input
                    value={newTeam.team_color_hex}
                    onChange={(e) =>
                      setNewTeam((p) => ({
                        ...p,
                        team_color_hex: e.target.value,
                      }))
                    }
                    className="bg-muted/50 flex-1"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setStep("team")}
                  className="flex-1"
                >
                  Quay lại
                </Button>
                <Button
                  onClick={handleCreateTeam}
                  disabled={
                    submitting ||
                    !newTeam.name.trim() ||
                    !newTeam.short_name.trim()
                  }
                  className="flex-1"
                >
                  {submitting ? "Đang tạo..." : "Tạo team"}
                </Button>
              </div>
            </div>
          </>
        )}

        {step === "members" && (
          <>
            <DialogHeader>
              <DialogTitle>Chọn người chơi</DialogTitle>
              <DialogDescription>
                Chọn thành viên trong team để tham gia giải đấu
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              <p className="text-xs text-muted-foreground">
                Điều kiện: tối thiểu {minPlayersRequired} người, và tổng số đăng
                ký phải bằng hoặc thêm 2 người so với số người trong đội hiện
                tại.
              </p>
              {loadingMembers ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  Đang tải danh sách thành viên...
                </div>
              ) : teamMembers.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  Team chưa có thành viên để đăng ký.
                </div>
              ) : (
                teamMembers.map((member) => (
                  <label
                    key={member.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedMembers.includes(member.id)
                        ? "border-primary bg-primary/5"
                        : "border-border bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={selectedMembers.includes(member.id)}
                      onCheckedChange={() => toggleMember(member.id)}
                    />
                    <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-bold uppercase">
                      {member.username[0]}
                    </div>
                    <span className="font-medium text-sm">
                      {member.username}
                    </span>
                  </label>
                ))
              )}
            </div>
            <div className="flex gap-2 pt-2">
              {tournamentTeamId && (
                <Button
                  variant="destructive"
                  onClick={handleWithdrawRegistration}
                  disabled={submitting}
                >
                  Xóa khỏi đăng ký
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setStep("team")}
                className="flex-1"
              >
                Quay lại
              </Button>
              <Button
                onClick={handleSubmitRegistration}
                disabled={
                  submitting ||
                  selectedMembers.length === 0 ||
                  !hasValidSelectedCount ||
                  !hasEnoughPlayersForTournament
                }
                className="flex-1"
              >
                {submitting
                  ? "Đang đăng ký..."
                  : `${tournamentTeamId ? "Cập nhật" : "Đăng ký"} (${selectedMembers.length})`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TournamentRegistration;
