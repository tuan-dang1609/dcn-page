import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { User, LogOut } from "lucide-react";
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
import LoginDialog from "./LoginDialog";
import { toast } from "sonner";

const UserMenu = () => {
  const { user, logout } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

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
            <p className="text-xs leading-none text-muted-foreground">
              @{displayUsername}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer">
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
  );
};

export default UserMenu;
