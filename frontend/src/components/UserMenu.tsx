import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, User, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import LoginDialog from "./LoginDialog";
import { toast } from "sonner";
import { useTeamInviteStream } from "@/hooks/useTeamInviteStream";

/** Sự kiện org / đội lẻ (backend/utils/groups.js → notifyUsers). */
const GROUP_EVENT_TOAST: Record<string, { tone: "success" | "error" | "info"; text: string }> = {
  join_request: { tone: "info", text: "Có đơn xin vào org / đội của bạn" },
  join_approved: { tone: "success", text: "Bạn đã được duyệt vào org / đội" },
  join_declined: { tone: "error", text: "Đơn xin vào của bạn bị từ chối" },
  member_removed: { tone: "error", text: "Bạn đã bị mời ra khỏi org / đội" },
  member_joined: { tone: "info", text: "Có thành viên mới vào org / đội của bạn" },
  member_left: { tone: "info", text: "Một thành viên đã rời org / đội của bạn" },
  team_invite: { tone: "info", text: "Có đội mời bạn vào — mở trang đăng ký giải để trả lời" },
  invite_declined: { tone: "info", text: "Người chơi đã từ chối lời mời vào đội" },
  team_formed: { tone: "success", text: "Đã ghép đội xong — bạn đã có đội trong giải" },
  team_unplaced: { tone: "error", text: "Ghép đội xong nhưng chưa đủ người để xếp bạn vào đội" },
  lineup_forfeit_lost: { tone: "error", text: "Đội bạn bị xử thua vì không chốt đội hình ra sân trước hạn" },
  lineup_forfeit_won: { tone: "success", text: "Đối thủ không chốt đội hình ra sân — đội bạn được xử thắng" },
  lol_code_ready: { tone: "info", text: "Đã có mã phòng LMHT cho trận của bạn — mở trang trận để lấy mã" },
  lol_match_finished: { tone: "success", text: "Trận LMHT đã có kết quả" },
};

const UserMenu = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, token, logout, refreshUser } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  // Realtime: thay đổi org / đội → báo + tải lại dữ liệu liên quan
  useTeamInviteStream({
    enabled: Boolean(user && token),
    token,
    userId: Number(user?.id),
    onEvent: useCallback(
      (payload) => {
        if (payload.type !== "group") return;
        const eventName = String((payload as { event?: string }).event ?? "");
        const info = GROUP_EVENT_TOAST[eventName];
        if (info) toast[info.tone](info.text);
        void refreshUser?.().catch(() => {});
        for (const key of ["group", "my-groups", "registration-options", "registration-entry", "team-finder", "my-pending-lineups", "match-lineups", "my-lol-codes", "lol-match-codes"]) {
          void queryClient.invalidateQueries({ queryKey: [key] });
        }
      },
      [queryClient, refreshUser],
    ),
  });

  const handleLogout = () => {
    logout();
    toast.success("Đã đăng xuất");
  };

  if (!user) {
    return (
      <>
        <Button onClick={() => setLoginOpen(true)} variant="outline" className="font-bold">
          Đăng nhập
        </Button>
        <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </>
    );
  }

  const displayName =
    (user as { nickname?: string; name?: string; username?: string }).nickname ||
    (user as { name?: string }).name ||
    (user as { username?: string }).username ||
    "User";
  const displayUsername =
    (user as { username?: string }).username || (user as { nickname?: string }).nickname || "user";

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-10 gap-2 rounded-none border border-neutral-600 bg-[#141414] px-2.5 hover:bg-[#1c1c1c] hover:text-white"
          title="Tài khoản"
        >
          <Avatar className="h-7 w-7 rounded-none">
            <AvatarImage
              src={(user as { profile_picture?: string | null }).profile_picture ?? undefined}
              alt={displayName}
              className="rounded-none object-cover"
            />
            <AvatarFallback className="rounded-none bg-[#2d2d2d] text-[10px] font-bold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-24 truncate text-xs font-bold text-neutral-200 sm:inline">
            {displayName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 rounded-none border-neutral-700 bg-[#141414]" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-bold leading-none text-white">{displayName}</p>
            <p className="text-xs leading-none text-neutral-500">@{displayUsername}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-neutral-800" />
        <DropdownMenuItem
          className="cursor-pointer focus:bg-neutral-900 focus:text-white"
          onClick={() => navigate("/profile")}
        >
          <User className="mr-2 h-4 w-4" />
          <span>Hồ sơ cá nhân</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer focus:bg-neutral-900 focus:text-white"
          onClick={() => navigate("/orgs")}
        >
          <Users className="mr-2 h-4 w-4" />
          <span>Org của tôi</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-neutral-800" />
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer text-red-400 focus:bg-neutral-900 focus:text-red-300"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Đăng xuất</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;
