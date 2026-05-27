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
  Upload,
  Search,
  Send,
  Clock3,
  UserCheck,
  X,
  Trash2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTeamInviteStream } from "@/hooks/useTeamInviteStream";
import { toast } from "@/hooks/use-toast";
import {
  deleteImageFromSupabase,
  uploadImageToSupabase,
} from "@/lib/supabaseUpload";
import { API_BASE } from "@/lib/apiBase";
import {
  getTeamInvites,
  revokeTeamInvite,
  sendTeamInvite,
  type TeamInviteRecord,
} from "@/api/teamInvites";

interface TeamMember {
  id: number;
  username: string;
  nickname?: string | null;
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

interface AvailableUser {
  id: number;
  username: string;
  nickname?: string | null;
  profile_picture: string | null;
  team_id: number | null;
}

interface UsersListResponse {
  users?: Array<{
    id: number | string;
    username: string;
    nickname?: string | null;
    profile_picture: string | null;
    team_id: number | string | null;
  }>;
}

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
  viewMode?: "manage" | "roster";
}

const TournamentRegistration = ({
  open,
  onOpenChange,
  tournamentId,
  requiredPlayerCount,
  viewMode = "manage",
}: Props) => {
  const { user, token, setIsRegistered, refreshUser } = useAuth();
  const isRosterView = viewMode === "roster";
  const [step, setStep] = useState<
    "team" | "members" | "create-team" | "edit-team" | "team-members"
  >(isRosterView ? "members" : "team");
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [removingMember, setRemovingMember] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [allUsers, setAllUsers] = useState<AvailableUser[] | null>(null);
  const [inviteQuery, setInviteQuery] = useState("");
  const [invitePanel, setInvitePanel] = useState<"search" | "pending">(
    "search",
  );
  const [pendingInvites, setPendingInvites] = useState<TeamInviteRecord[]>([]);
  const [sendingInviteId, setSendingInviteId] = useState<number | null>(null);
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
  const [editTeam, setEditTeam] = useState({
    name: "",
    short_name: "",
    logo_url: "",
    team_color_hex: "#4F46E5",
  });
  const [teamLogoFile, setTeamLogoFile] = useState<File | null>(null);
  const [editTeamLogoFile, setEditTeamLogoFile] = useState<File | null>(null);
  const [createMemberIds, setCreateMemberIds] = useState<number[]>([]);

  const currentTeamId = user?.team_id ?? null;
  const hasTeam = currentTeamId !== null && currentTeamId !== undefined;
  const userId = Number(user?.id);
  const roleId = Number(user?.role_id);
  const teamOwnerId = Number(user?.team?.created_by);

  const minPlayersRequired = Math.max(1, Number(requiredPlayerCount) || 5);
  const maxPlayersAllowed = minPlayersRequired + 2;
  const hasEnoughPlayersForTournament =
    selectedMembers.length >= minPlayersRequired;
  const hasValidSelectedCount = selectedMembers.length <= maxPlayersAllowed;

  // Rule: cần có team, và (role_id = 4 hoặc là người tạo team)
  const canRegister =
    !hasTeam ||
    roleId === 4 ||
    (Number.isFinite(teamOwnerId) && teamOwnerId === userId);

  const canManageTeam =
    Number.isFinite(teamOwnerId) && teamOwnerId === userId
      ? true
      : [1, 2, 3].includes(roleId);

  const toggleMember = (id: number) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const toggleCreateMember = (id: number) => {
    setCreateMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const canAssignUserToCurrentTeam = (candidate: AvailableUser) => {
    if (candidate.id === userId) return false;
    if (!hasTeam) return candidate.team_id === null;
    return (
      candidate.team_id === null ||
      Number(candidate.team_id) === Number(currentTeamId)
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
        `${API_BASE}/api/teams/${currentTeamId}`,
      );

      const members = Array.isArray(response.data?.members)
        ? response.data.members.map((member) => ({
            id: Number(member.id),
            username: member.username,
            nickname: (member as any)?.nickname ?? null,
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

  const loadAvailableUsers = async (query = "") => {
    setLoadingUsers(true);
    try {
      const normalizedQuery = String(query || "").trim();
      const response = await axios.get<UsersListResponse>(
        `${API_BASE}/api/users`,
        {
          params: normalizedQuery ? { q: normalizedQuery } : undefined,
        },
      );
      const users = Array.isArray(response.data?.users)
        ? response.data.users.map((u) => ({
            id: Number(u.id),
            username: u.username,
            nickname: u.nickname ?? null,
            profile_picture: u.profile_picture ?? null,
            team_id:
              u.team_id === null || u.team_id === undefined
                ? null
                : Number(u.team_id),
          }))
        : [];

      setAvailableUsers(users.filter((u) => Number.isFinite(u.id)));
    } catch {
      setAvailableUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  // listen for external member updates (kicks/accepts) and refresh lists
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const custom = e as CustomEvent<{ teamId?: number | string }>;
        if (!custom?.detail) return;
        if (String(custom.detail.teamId) !== String(currentTeamId)) {
          // if event for different team, still refresh available users
          void loadAvailableUsers(inviteQuery);
          return;
        }

        void Promise.all([
          loadTeamMembers(),
          loadTeamInvites(),
          loadAvailableUsers(inviteQuery),
        ]);
      } catch {
        void loadAvailableUsers(inviteQuery);
      }
    };

    window.addEventListener("team:members-updated", handler as EventListener);
    return () =>
      window.removeEventListener(
        "team:members-updated",
        handler as EventListener,
      );
  }, [currentTeamId, inviteQuery]);

  const fetchAllUsers = async () => {
    if (allUsers !== null) return allUsers;
    setLoadingUsers(true);
    try {
      const response = await axios.get<UsersListResponse>(
        `${API_BASE}/api/users`,
      );
      const users = Array.isArray(response.data?.users)
        ? response.data.users.map((u) => ({
            id: Number(u.id),
            username: u.username,
            nickname: u.nickname ?? null,
            profile_picture: u.profile_picture ?? null,
            team_id:
              u.team_id === null || u.team_id === undefined
                ? null
                : Number(u.team_id),
          }))
        : [];

      const filtered = users.filter((u) => Number.isFinite(u.id));
      setAllUsers(filtered);
      return filtered;
    } catch {
      setAllUsers([]);
      return [] as AvailableUser[];
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadTeamInvites = async () => {
    if (!hasTeam || !currentTeamId) {
      setPendingInvites([]);
      return;
    }

    try {
      const response = await getTeamInvites(currentTeamId, token);
      setPendingInvites(response.data?.invites ?? []);
    } catch {
      setPendingInvites([]);
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
      (team) => Number(team.team_id) === Number(currentTeamId),
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
  }, [open, hasTeam, currentTeamId]);

  useEffect(() => {
    if (!open || !user || step !== "team-members") return;

    // Only filter locally for invite search to avoid spamming API.
    const timer = window.setTimeout(async () => {
      if (invitePanel !== "search") return;

      const q = String(inviteQuery || "")
        .trim()
        .toLowerCase();

      if (!q) {
        setAvailableUsers([]);
        return;
      }

      // Ensure we have the full user list cached, then filter client-side.
      const users = allUsers ?? (await fetchAllUsers());
      const filtered = users.filter((u) => {
        return (
          (u.username || "").toLowerCase().includes(q) ||
          (u.nickname || "").toLowerCase().includes(q)
        );
      });

      setAvailableUsers(filtered);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [open, user, step, inviteQuery, invitePanel, allUsers]);

  useEffect(() => {
    // Preload full user list when user opens invite panel to search.
    if (!open || !user || step !== "team-members" || invitePanel !== "search")
      return;
    void fetchAllUsers();
  }, [open, user, step, invitePanel]);

  useEffect(() => {
    if (!open || !hasTeam || step !== "team-members") return;

    void loadTeamInvites();
  }, [open, hasTeam, currentTeamId, step]);

  useEffect(() => {
    if (!open || !hasTeam || !user?.team) return;

    setEditTeam({
      name: user.team.name ?? "",
      short_name: user.team.short_name ?? "",
      logo_url: user.team.logo_url ?? "",
      team_color_hex: user.team.team_color_hex ?? "#4F46E5",
    });
  }, [
    open,
    hasTeam,
    user?.team?.name,
    user?.team?.short_name,
    user?.team?.logo_url,
    user?.team?.team_color_hex,
  ]);

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
  }, [open, hasTeam, tournamentId, currentTeamId, setIsRegistered]);

  useEffect(() => {
    if (!open) return;

    setStep(isRosterView ? "members" : "team");
  }, [open, isRosterView]);

  useTeamInviteStream({
    enabled: Boolean(open && user),
    token,
    userId: userId ?? null,
    onEvent: async (payload) => {
      // Normalize events: controller emits 'invite_created' and 'invite_updated'.
      const isCreated = payload.type === "invite_created";
      const isRevoked = payload.type === "invite_revoked";
      const isUpdated = payload.type === "invite_updated";
      const isAcceptedEventName =
        typeof payload.event_name === "string" &&
        payload.event_name.includes("accept");
      const isInviteAccepted =
        isUpdated &&
        (isAcceptedEventName || payload.invite?.status === "accepted");

      if (isInviteAccepted) {
        await Promise.all([loadTeamMembers(), loadTeamInvites()]);
        toast({
          title: "Đã có thành viên mới",
          description: "Lời mời đã được chấp nhận.",
        });
        try {
          window.dispatchEvent(
            new CustomEvent("team:members-updated", {
              detail: { teamId: currentTeamId },
            }),
          );
        } catch {
          /* ignore */
        }
      } else if (isCreated || isRevoked) {
        void loadTeamInvites();
      }
    },
  });

  const canInviteCandidate = (candidate: AvailableUser) => {
    if (!hasTeam || !currentTeamId) return false;
    if (candidate.id === userId) return false;
    if (Number(candidate.team_id) === Number(currentTeamId)) return false;
    if (candidate.team_id !== null) return false;
    if (
      pendingInvites.some(
        (invite) => Number(invite.invitee_id) === Number(candidate.id),
      )
    ) {
      return false;
    }

    return true;
  };

  const getCandidateStatusLabel = (candidate: AvailableUser) => {
    const isCurrentTeammate =
      Number(candidate.team_id) === Number(currentTeamId);
    if (isCurrentTeammate) return "Đồng đội";
    if (candidate.team_id !== null) return "Đã có đội";
    return "Không thể mời";
  };

  const handleSendTeamInvite = async (candidate: AvailableUser) => {
    if (!currentTeamId) return;

    setSendingInviteId(candidate.id);
    try {
      await sendTeamInvite(currentTeamId, candidate.id, token);
      await Promise.all([loadTeamMembers(), loadTeamInvites()]);
      toast({
        title: "Đã gửi lời mời",
        description: `${candidate.username} sẽ nhận được lời mời tham gia team.`,
      });
    } catch (error) {
      toast({
        title: "Gửi lời mời thất bại",
        description: getApiErrorMessage(error, "Không thể gửi lời mời."),
        variant: "destructive",
      });
    } finally {
      setSendingInviteId(null);
    }
  };

  const handleRevokeTeamInvite = async (inviteId: number) => {
    try {
      await revokeTeamInvite(inviteId, token);
      await loadTeamInvites();
      toast({
        title: "Đã hủy lời mời",
        description: "Lời mời chờ đã được hủy.",
      });
    } catch (error) {
      toast({
        title: "Không thể hủy lời mời",
        description: getApiErrorMessage(error, "Vui lòng thử lại."),
        variant: "destructive",
      });
    }
  };

  const handleConfirmTeam = async () => {
    setStep("members");
  };

  const handleCreateTeam = async () => {
    if (!newTeam.name.trim() || !newTeam.short_name.trim()) return;

    setSubmitting(true);
    try {
      let nextLogoUrl = newTeam.logo_url.trim();

      if (teamLogoFile) {
        nextLogoUrl = await uploadImageToSupabase(teamLogoFile);
      }

      if (!token) {
        throw new Error("Unauthorized");
      }

      const createResponse = await axios.post(
        `${API_BASE}/api/teams`,
        {
          ...newTeam,
          logo_url: nextLogoUrl || null,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const createdTeamId = Number(
        createResponse.data?.team_id ?? createResponse.data?.id,
      );

      if (Number.isFinite(createdTeamId) && createMemberIds.length > 0) {
        await axios.patch(
          `${API_BASE}/api/teams/${createdTeamId}`,
          {
            user_ids: createMemberIds,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );
      }

      await refreshUser();
      setTeamLogoFile(null);
      setCreateMemberIds([]);

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

  const handleTeamLogoFileChange = (file: File | null) => {
    setTeamLogoFile(file);
  };

  const handleEditTeamLogoFileChange = (file: File | null) => {
    setEditTeamLogoFile(file);
  };

  const handleUpdateTeam = async () => {
    if (!canManageTeam) {
      toast({
        title: "Không có quyền",
        description: "Bạn không có quyền chỉnh sửa thông tin đội.",
        variant: "destructive",
      });
      return;
    }

    if (!hasTeam || currentTeamId === null || currentTeamId === undefined) {
      toast({
        title: "Thiếu thông tin",
        description: "Không xác định được đội để cập nhật.",
        variant: "destructive",
      });
      return;
    }

    if (!editTeam.name.trim() || !editTeam.short_name.trim()) return;

    setSubmitting(true);
    let uploadedLogoUrl: string | null = null;
    try {
      let nextLogoUrl = editTeam.logo_url.trim();
      const previousLogoUrl = (user?.team?.logo_url ?? "").trim();

      if (editTeamLogoFile) {
        nextLogoUrl = await uploadImageToSupabase(editTeamLogoFile);
        uploadedLogoUrl = nextLogoUrl;
      }

      if (!token) {
        throw new Error("Unauthorized");
      }

      await axios.put(
        `${API_BASE}/api/teams/${currentTeamId}`,
        {
          ...editTeam,
          logo_url: nextLogoUrl || null,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (previousLogoUrl && nextLogoUrl && previousLogoUrl !== nextLogoUrl) {
        try {
          await deleteImageFromSupabase(previousLogoUrl);
        } catch (deleteError) {
          console.warn("Could not delete previous team logo:", deleteError);
        }
      }

      await refreshUser();
      await loadTeamMembers();
      setEditTeamLogoFile(null);

      toast({
        title: "Cập nhật đội thành công",
        description: "Thông tin đội đã được cập nhật.",
      });

      setStep("team");
    } catch (error) {
      toast({
        title: "Cập nhật đội thất bại",
        description: getApiErrorMessage(error, "Không thể cập nhật đội."),
        variant: "destructive",
      });

      // If upload succeeded but update API failed, remove the newly uploaded file
      // to avoid leaving orphan files in storage.
      if (uploadedLogoUrl) {
        try {
          await deleteImageFromSupabase(uploadedLogoUrl);
        } catch (deleteError) {
          console.warn("Could not cleanup uploaded team logo:", deleteError);
        }
      }
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
        description: `Danh sách đăng ký tối đa ${maxPlayersAllowed} người (min ${minPlayersRequired}).`,
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

    setSubmitting(true);
    try {
      let finalTournamentTeamId = tournamentTeamId;
      if (!finalTournamentTeamId) {
        try {
          if (!token) {
            throw new Error("Unauthorized");
          }

          await axios.post(
            `${API_BASE}/api/tournaments/teams/${tournamentId}`,
            {},
            { headers: { Authorization: `Bearer ${token}` } },
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

      if (!token) {
        throw new Error("Unauthorized");
      }

      await axios.patch(
        `${API_BASE}/api/tournaments/team/players/${finalTournamentTeamId}`,
        {
          user_ids: selectedMembers,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      toast({
        title: "Đăng ký thành công!",
        description: `Đã đăng ký ${selectedMembers.length} người chơi vào giải đấu.`,
      });

      setIsRegistered(true);
      setTournamentTeamId(finalTournamentTeamId);
      onOpenChange(false);
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

    setSubmitting(true);
    try {
      if (!token) {
        throw new Error("Unauthorized");
      }

      await axios.delete(
        `${API_BASE}/api/tournaments/teams/${tournamentId}/${currentTeamId}`,
        { headers: { Authorization: `Bearer ${token}` } },
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
      setStep(isRosterView ? "members" : "team");
      setSelectedMembers([]);
      setTournamentTeamId(null);
      setCreateMemberIds([]);
      setTeamLogoFile(null);
      setEditTeamLogoFile(null);
      setInviteQuery("");
      setInvitePanel("search");
      setPendingInvites([]);
      setSendingInviteId(null);
    }
    onOpenChange(v);
  };

  // Keep hook order stable: guard only after all hooks are declared.
  if (!user) return null;

  // Not allowed when user already has a team but lacks permission by rule
  if (!isRosterView && hasTeam && !canRegister) {
    return (
      <Dialog open={open} onOpenChange={resetAndClose}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md bg-card border-border px-4 py-5 sm:w-full sm:max-w-md sm:px-6 sm:py-6">
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
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg bg-card border-border shadow-lg rounded-2xl px-4 py-5 sm:w-full sm:max-w-lg sm:px-6 sm:py-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
              step === "team" ||
              step === "create-team" ||
              step === "edit-team" ||
              step === "team-members"
                ? "bg-primary/15 text-primary"
                : "bg-mutedtext-[#EEEEEE]"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Bước 1
          </div>
          <ChevronRight className="w-4 h-4text-[#EEEEEE]" />
          <div
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
              step === "members"
                ? "bg-primary/15 text-primary"
                : "bg-mutedtext-[#EEEEEE]"
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
                <div className="flex items-center gap-4 bg-linear-to-r from-slate-800/50 to-slate-700/30 border border-border rounded-lg p-4">
                  <Avatar className="w-12 h-12">
                    {user.team.logo_url ? (
                      <AvatarImage
                        src={user.team.logo_url}
                        alt={user.team.name}
                      />
                    ) : (
                      <AvatarFallback className="font-bold">
                        {String(user.team.short_name ?? user.team.name)[0]}
                      </AvatarFallback>
                    )}
                  </Avatar>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep("edit-team")}
                    disabled={submitting || !canManageTeam}
                  >
                    Cập nhật đội
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setStep("team-members")}
                    disabled={submitting || !canManageTeam}
                  >
                    Quản lý thành viên đội
                  </Button>
                </div>
                {!canManageTeam && (
                  <p className="text-xstext-[#EEEEEE]">
                    Bạn có thể đăng ký giải nhưng không có quyền chỉnh sửa đội.
                  </p>
                )}
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
                <label className="text-sm font-medium">Logo đội</label>
                <label className="flex items-center justify-center gap-2 border border-dashed border-border rounded-md py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">
                    {teamLogoFile
                      ? teamLogoFile.name
                      : "Chọn ảnh để upload lên Supabase"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      handleTeamLogoFileChange(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Hoặc nhập Logo URL
                </label>
                <Input
                  value={newTeam.logo_url}
                  onChange={(e) =>
                    setNewTeam((p) => ({ ...p, logo_url: e.target.value }))
                  }
                  placeholder="https://..."
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Thêm thành viên vào đội (riêng)
                </label>
                <div className="max-h-44 overflow-y-auto rounded-md border border-border p-2 space-y-2 bg-muted/20">
                  {loadingUsers ? (
                    <p className="text-xstext-[#EEEEEE]">
                      Đang tải người dùng...
                    </p>
                  ) : (
                    availableUsers.map((candidate) => {
                      const disabled = !canAssignUserToCurrentTeam(candidate);
                      const checked = createMemberIds.includes(candidate.id);
                      const statusLabel =
                        candidate.id === userId
                          ? "Bạn"
                          : candidate.team_id === null
                            ? "Có thể thêm"
                            : Number(candidate.team_id) ===
                                Number(currentTeamId)
                              ? "Đồng đội"
                              : "Đã có đội";

                      return (
                        <label
                          key={`create-member-${candidate.id}`}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 border ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${checked ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={() =>
                              !disabled && toggleCreateMember(candidate.id)
                            }
                          />
                          <div className="flex items-center gap-2">
                            <Avatar className="w-7 h-7">
                              {candidate.profile_picture ? (
                                <AvatarImage src={candidate.profile_picture} />
                              ) : (
                                <AvatarFallback className="text-[10px] font-bold uppercase">
                                  {
                                    (candidate.nickname ??
                                      candidate.username)[0]
                                  }
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <span className="text-sm">
                              {candidate.nickname ?? candidate.username}
                            </span>
                          </div>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {statusLabel}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
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

        {step === "edit-team" && (
          <>
            <DialogHeader>
              <DialogTitle>Cập nhật đội</DialogTitle>
              <DialogDescription>
                Chỉnh sửa thông tin đội của bạn (Bước 1)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tên team</label>
                <Input
                  value={editTeam.name}
                  onChange={(e) =>
                    setEditTeam((p) => ({ ...p, name: e.target.value }))
                  }
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tên viết tắt</label>
                <Input
                  value={editTeam.short_name}
                  onChange={(e) =>
                    setEditTeam((p) => ({ ...p, short_name: e.target.value }))
                  }
                  maxLength={5}
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Logo đội</label>
                <label className="flex items-center justify-center gap-2 border border-dashed border-border rounded-md py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">
                    {editTeamLogoFile
                      ? editTeamLogoFile.name
                      : "Chọn ảnh để upload lên Supabase"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      handleEditTeamLogoFileChange(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Hoặc nhập Logo URL
                </label>
                <Input
                  value={editTeam.logo_url}
                  onChange={(e) =>
                    setEditTeam((p) => ({ ...p, logo_url: e.target.value }))
                  }
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Màu team</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={editTeam.team_color_hex}
                    onChange={(e) =>
                      setEditTeam((p) => ({
                        ...p,
                        team_color_hex: e.target.value,
                      }))
                    }
                    className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
                  />
                  <Input
                    value={editTeam.team_color_hex}
                    onChange={(e) =>
                      setEditTeam((p) => ({
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
                  onClick={handleUpdateTeam}
                  disabled={
                    submitting ||
                    !editTeam.name.trim() ||
                    !editTeam.short_name.trim()
                  }
                  className="flex-1"
                >
                  {submitting ? "Đang lưu..." : "Lưu đội"}
                </Button>
              </div>
            </div>
          </>
        )}

        {step === "team-members" && (
          <>
            <DialogHeader>
              <DialogTitle>Quản lý thành viên đội</DialogTitle>
              <DialogDescription>
                Mời người chơi vào team và xem các lời mời đang chờ chấp nhận
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {loadingMembers
                        ? "Đang tải..."
                        : `${teamMembers.length} người chơi trong team`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2"
                    >
                      <Avatar className="w-7 h-7">
                        {member.profile_picture ? (
                          <AvatarImage src={member.profile_picture} />
                        ) : (
                          <AvatarFallback className="text-[10px] font-bold uppercase">
                            {(member.nickname ?? member.username)[0]}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <span className="text-sm font-medium">
                        {member.nickname ?? member.username}
                      </span>
                      {canManageTeam && (
                        <button
                          aria-label={`Xóa ${member.nickname ?? member.username}`}
                          onClick={() => {
                            setMemberToRemove(member);
                            setConfirmOpen(true);
                          }}
                          className="ml-2 p-1 rounded-md hover:bg-slate-800"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-2xl border border-border bg-background p-1">
                <button
                  type="button"
                  onClick={() => setInvitePanel("search")}
                  className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${invitePanel === "search" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Tìm & mời
                </button>
                <button
                  type="button"
                  onClick={() => setInvitePanel("pending")}
                  className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${invitePanel === "pending" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Lời mời chờ ({pendingInvites.length})
                </button>
              </div>

              {invitePanel === "search" ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={inviteQuery}
                      onChange={(event) => setInviteQuery(event.target.value)}
                      placeholder="Tìm theo username hoặc nickname"
                      className="pl-9 bg-muted/30 border-border"
                    />
                  </div>

                  <div className="rounded-2xl border border-border bg-muted/10 max-h-75 overflow-y-auto p-2 space-y-2">
                    {!inviteQuery.trim() ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        Nhập tên người chơi để tìm và gửi lời mời.
                      </div>
                    ) : loadingUsers ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        Đang tìm người chơi...
                      </div>
                    ) : availableUsers.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        Không tìm thấy người chơi phù hợp.
                      </div>
                    ) : (
                      availableUsers.map((candidate) => {
                        const canInvite = canInviteCandidate(candidate);
                        const alreadyInTeam =
                          Number(candidate.team_id) === Number(currentTeamId);
                        const alreadyHasTeam =
                          candidate.team_id !== null && !alreadyInTeam;

                        const isAlreadyInvited = pendingInvites.some(
                          (inv) =>
                            Number(inv.invitee_id) === Number(candidate.id),
                        );

                        return (
                          <div
                            key={`invite-user-${candidate.id}`}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-linear-to-r from-slate-800/60 to-slate-700/40 p-3 shadow-sm"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar className="w-10 h-10">
                                {candidate.profile_picture ? (
                                  <AvatarImage
                                    src={candidate.profile_picture}
                                  />
                                ) : (
                                  <AvatarFallback className="font-bold">
                                    {candidate.username[0]}
                                  </AvatarFallback>
                                )}
                              </Avatar>
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {candidate.username}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {candidate.nickname || "Chưa có nickname"}
                                </p>
                              </div>
                            </div>

                            {alreadyInTeam ? (
                              <span className="text-xs text-primary whitespace-nowrap">
                                Đồng đội
                              </span>
                            ) : alreadyHasTeam ? (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                Đã có đội
                              </span>
                            ) : isAlreadyInvited ? (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                Đã mời
                              </span>
                            ) : canInvite ? (
                              <Button
                                size="sm"
                                onClick={() => handleSendTeamInvite(candidate)}
                                disabled={sendingInviteId === candidate.id}
                                className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                <Send className="w-4 h-4 mr-1" />
                                {sendingInviteId === candidate.id
                                  ? "Đang gửi..."
                                  : "Mời"}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                Không thể mời
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 rounded-2xl border border-border bg-muted/10 p-2 max-h-75 overflow-y-auto">
                  {pendingInvites.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      Chưa có lời mời nào đang chờ.
                    </div>
                  ) : (
                    pendingInvites.map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="w-10 h-10">
                            {invite.invitee_profile_picture ? (
                              <AvatarImage
                                src={invite.invitee_profile_picture}
                              />
                            ) : (
                              <AvatarFallback className="font-bold text-xs uppercase">
                                {String(invite.invitee_username ?? "U")[0]}
                              </AvatarFallback>
                            )}
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {invite.invitee_username}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {invite.invitee_nickname || "Đang chờ phản hồi"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                            <Clock3 className="w-3.5 h-3.5" />
                            Đã mời
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevokeTeamInvite(invite.id)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => setStep("team")}
                  className="flex-1"
                >
                  Quay lại
                </Button>
                <Button
                  onClick={async () => {
                    await Promise.all([loadTeamMembers(), loadTeamInvites()]);
                    toast({
                      title: "Đã làm mới",
                      description:
                        "Danh sách thành viên và lời mời đã được cập nhật.",
                    });
                  }}
                  className="flex-1"
                >
                  Làm mới
                </Button>
              </div>
            </div>
          </>
        )}

        {step === "members" && (
          <>
            <DialogHeader>
              <DialogTitle>
                {isRosterView ? "Danh sách đồng đội" : "Chọn người chơi"}
              </DialogTitle>
              <DialogDescription>
                {isRosterView
                  ? "Các đồng đội đã đăng ký trong giải đấu này."
                  : "Chọn thành viên trong team để tham gia giải đấu"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-75 overflow-y-auto pr-1">
              {loadingMembers ? (
                <div className="text-smtext-[#EEEEEE] py-4 text-center">
                  Đang tải danh sách thành viên...
                </div>
              ) : isRosterView ? (
                teamMembers.filter((member) =>
                  selectedMembers.includes(member.id),
                ).length === 0 ? (
                  <div className="text-smtext-[#EEEEEE] py-4 text-center">
                    Team chưa đăng ký hoặc chưa có đồng đội nào trong giải này.
                  </div>
                ) : (
                  teamMembers
                    .filter((member) => selectedMembers.includes(member.id))
                    .map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30"
                      >
                        <Avatar className="w-8 h-8">
                          {member.profile_picture ? (
                            <AvatarImage src={member.profile_picture} />
                          ) : (
                            <AvatarFallback className="text-xs font-bold uppercase">
                              {(member.nickname ?? member.username)[0]}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <span className="font-medium text-sm">
                          {member.nickname ?? member.username}
                        </span>
                      </div>
                    ))
                )
              ) : (
                <>
                  <p className="text-xstext-[#EEEEEE]">
                    Điều kiện: chọn từ {minPlayersRequired} đến{" "}
                    {maxPlayersAllowed}
                    người.
                  </p>
                  {teamMembers.length === 0 ? (
                    <div className="text-smtext-[#EEEEEE] py-4 text-center">
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
                        <Avatar className="w-8 h-8">
                          {member.profile_picture ? (
                            <AvatarImage src={member.profile_picture} />
                          ) : (
                            <AvatarFallback className="text-xs font-bold uppercase">
                              {(member.nickname ?? member.username)[0]}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <span className="font-medium text-sm">
                          {member.nickname ?? member.username}
                        </span>
                      </label>
                    ))
                  )}
                </>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              {isRosterView ? (
                <Button
                  variant="outline"
                  onClick={() => resetAndClose(false)}
                  className="flex-1"
                >
                  Đóng
                </Button>
              ) : (
                <>
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
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {submitting
                      ? tournamentTeamId
                        ? "Đang cập nhật..."
                        : "Đang đăng ký..."
                      : `${tournamentTeamId ? "Cập nhật" : "Đăng ký"} (${selectedMembers.length})`}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
        {/* Confirm remove modal */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="w-[calc(100vw-1rem)] max-w-sm border-slate-700 text-slate-100 px-4 py-5 sm:w-full sm:max-w-sm sm:px-6 sm:py-6">
            <div>
              <h3 className="text-lg font-semibold">Xác nhận xóa đồng đội</h3>
              <p className="text-sm text-slate-300 mt-2">
                Bạn có chắc muốn xóa <strong>{memberToRemove?.username}</strong>{" "}
                khỏi team không? Hành động này sẽ gỡ họ khỏi team.
              </p>

              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setConfirmOpen(false)}
                  disabled={removingMember}
                >
                  Hủy
                </Button>
                <Button
                  onClick={async () => {
                    if (!currentTeamId || !memberToRemove) return;
                    setRemovingMember(true);
                    try {
                      const remaining = teamMembers
                        .map((m) => Number(m.id))
                        .filter(
                          (id) =>
                            Number.isFinite(id) &&
                            id !== Number(memberToRemove.id),
                        );

                      await axios.patch(
                        `${API_BASE}/api/teams/${currentTeamId}`,
                        { user_ids: remaining },
                        {
                          withCredentials: true,
                          headers: token
                            ? { Authorization: `Bearer ${token}` }
                            : undefined,
                        },
                      );

                      toast({
                        title: "Đã xóa đồng đội",
                        description: `${memberToRemove.username} đã được gỡ khỏi team.`,
                      });
                      setConfirmOpen(false);
                      setMemberToRemove(null);
                      await loadTeamMembers();
                      // notify other parts of the app to refresh
                      try {
                        window.dispatchEvent(
                          new CustomEvent("team:members-updated", {
                            detail: { teamId: currentTeamId },
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
                      setRemovingMember(false);
                    }
                  }}
                  className="bg-red-600 text-white"
                  disabled={removingMember}
                >
                  {removingMember ? "Đang xóa..." : "Xác nhận xóa"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

export default TournamentRegistration;
