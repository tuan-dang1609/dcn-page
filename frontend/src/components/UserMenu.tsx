import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, Check, LogOut, User, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import LoginDialog from "./LoginDialog";
import { toast } from "sonner";
import {
  acceptTeamInvite,
  declineTeamInvite,
  getMyTeamInvites,
  type TeamInviteRecord,
} from "@/api/teamInvites";
import { useTeamInviteStream } from "@/hooks/useTeamInviteStream";

const UserMenu = () => {
  const navigate = useNavigate();
  const { user, token, logout, refreshUser } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<TeamInviteRecord[]>([]);
  const [inviteActionId, setInviteActionId] = useState<number | null>(null);

  const hasTeam = Boolean((user as any)?.team_id);

  const loadInvites = useCallback(async () => {
    if (!user) return;

    try {
      const response = await getMyTeamInvites(token);
      setPendingInvites(response.data?.invites ?? []);
    } catch {
      setPendingInvites([]);
    }
  }, [user, token]);

  useEffect(() => {
    if (!user) {
      setPendingInvites([]);
      return;
    }

    void loadInvites();
  }, [user, loadInvites]);

  useTeamInviteStream({
    enabled: Boolean(user && token),
    token,
    userId: Number(user?.id),
    onEvent: useCallback(
      (payload) => {
        // membership change -> refresh profile + invites
        if (payload.type === "team_membership_changed") {
          const eventName = String(payload.event_name ?? "");
          if (eventName.includes("removed")) {
            void (async () => {
              try {
                await refreshUser();
              } catch {
                // ignore
              }
              void loadInvites();
            })();
            toast.error("Bạn đã bị gỡ khỏi team");
            return;
          }
          if (eventName.includes("joined")) {
            void (async () => {
              try {
                await refreshUser();
              } catch {
                // ignore
              }
              void loadInvites();
            })();
            toast.success("Bạn đã được thêm vào team");
            return;
          }
        }

        void loadInvites();
      },
      [loadInvites],
    ),
  });

  const handleOpenInviteModal = async () => {
    setInviteModalOpen(true);
    await loadInvites();
  };

  const handleAcceptInvite = async (inviteId: number) => {
    setInviteActionId(inviteId);
    try {
      await acceptTeamInvite(inviteId, token);
      await loadInvites();
      toast.success("Đã chấp nhận lời mời");
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
      await loadInvites();
      toast.success("Đã từ chối lời mời");
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error || error?.message || "Không thể từ chối",
      );
    } finally {
      setInviteActionId(null);
    }
  };

  const inviteCount = useMemo(() => pendingInvites.length, [pendingInvites]);

  const handleLogout = () => {
    logout();
    toast.success("Đã đăng xuất");
  };

  if (!user) {
    return (
      <>
        <Button
          onClick={() => setLoginOpen(true)}
          variant="outline"
          className="font-bold"
        >
          Đăng nhập
        </Button>
        <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </>
    );
  }

  const displayName =
    (user as any)?.nickname ||
    (user as any)?.name ||
    (user as any)?.username ||
    "User";
  const displayUsername =
    (user as any)?.username || (user as any)?.nickname || "user";

  const initials = displayName
    ? displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "US";

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 rounded-full border border-border"
          onClick={handleOpenInviteModal}
          disabled={!user}
          aria-label="Thông báo lời mời"
        >
          <Bell className="h-4 w-4" />
          {inviteCount > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
              {inviteCount}
            </span>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-bold leading-none">{displayName}</p>
                <p className="text-xs leading-nonetext-[#EEEEEE]">
                  @{displayUsername}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => navigate("/profile")}
            >
              <User className="mr-2 h-4 w-4" />
              <span>Trang cá nhân</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="cursor-pointer text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Đăng xuất</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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

export default UserMenu;
