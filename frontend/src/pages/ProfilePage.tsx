import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Link2, Loader2, Save, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import PageLoader from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";
import { uploadImageToSupabase } from "@/lib/supabaseUpload";
import { API_BASE } from "@/lib/apiBase";
import {
  acceptTeamInvite,
  declineTeamInvite,
  getMyTeamInvites,
  type TeamInviteRecord,
} from "@/api/teamInvites";
import { useTeamInviteStream } from "@/hooks/useTeamInviteStream";

const ProfilePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, token, isLoading, refreshUser } = useAuth();

  const [nickname, setNickname] = useState("");
  const [profilePictureUrl, setProfilePictureUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewFromFile, setAvatarPreviewFromFile] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingNickname, setSavingNickname] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [connectingRiot, setConnectingRiot] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<TeamInviteRecord[]>([]);
  const [inviteActionId, setInviteActionId] = useState<number | null>(null);
  const hasTeam = Boolean(user?.team_id);

  useEffect(() => {
    if (!isLoading && !user) {
      navigate(`/login?returnTo=${encodeURIComponent("/profile")}`, {
        replace: true,
      });
    }
  }, [isLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    setNickname(user.nickname ?? "");
    setProfilePictureUrl(user.profile_picture ?? "");
  }, [user?.id, user?.nickname, user?.profile_picture]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewFromFile("");
      return;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewFromFile(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [avatarFile]);

  useEffect(() => {
    const riotStatus = searchParams.get("riot");
    const reason = searchParams.get("reason");

    if (!riotStatus) return;

    if (riotStatus === "connected") {
      toast({
        title: "Đã liên kết Riot",
        description: "Tài khoản Riot đã được cập nhật vào hồ sơ của bạn.",
      });
      void refreshUser().catch(() => {});
    } else {
      toast({
        title: "Liên kết Riot thất bại",
        description: reason || "Không thể lấy Riot ID từ Riot Sign On.",
        variant: "destructive",
      });
    }

    navigate("/profile", { replace: true });
  }, [searchParams, navigate, refreshUser]);

  const loadInvites = useCallback(async () => {
    if (!user || hasTeam) {
      setPendingInvites([]);
      return;
    }

    try {
      const response = await getMyTeamInvites(token);
      setPendingInvites(response.data?.invites ?? []);
    } catch {
      setPendingInvites([]);
    }
  }, [user, hasTeam, token]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  useTeamInviteStream({
    enabled: Boolean(user && token),
    token,
    userId: Number(user?.id),
    onEvent: useCallback(() => {
      void loadInvites();
    }, [loadInvites]),
  });

  const initials = useMemo(() => {
    const raw = nickname || user?.nickname || "User";
    return raw
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }, [nickname, user?.nickname]);

  const avatarPreview =
    avatarPreviewFromFile ||
    profilePictureUrl.trim() ||
    user?.profile_picture ||
    undefined;

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/", { replace: true });
  };

  const handleSaveNickname = async (event?: FormEvent) => {
    if (event) event.preventDefault();

    setSavingNickname(true);

    try {
      await axios.patch(
        `${API_BASE}/api/users/me`,
        { nickname: nickname.trim() || null },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      await refreshUser();

      toast({
        title: "Cập nhật thành công",
        description: "Nickname đã được lưu.",
      });
    } catch (error: any) {
      toast({
        title: "Cập nhật thất bại",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Không thể cập nhật.",
        variant: "destructive",
      });
    } finally {
      setSavingNickname(false);
    }
  };

  const handleUploadAvatar = async (event?: FormEvent) => {
    if (event) event.preventDefault();

    if (!avatarFile) {
      toast({
        title: "Không có ảnh",
        description: "Vui lòng chọn ảnh để upload.",
        variant: "destructive",
      });
      return;
    }

    setSavingAvatar(true);

    try {
      const nextProfilePicture = await uploadImageToSupabase(avatarFile);

      // update local preview immediately and add cache buster so browser refetches
      const cacheBusted = `${nextProfilePicture}?v=${Date.now()}`;
      setProfilePictureUrl(cacheBusted);

      await axios.patch(
        `${API_BASE}/api/users/me`,
        { profile_picture: nextProfilePicture },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      // refresh user to keep server state in sync
      await refreshUser();
      setAvatarFile(null);

      toast({
        title: "Cập nhật thành công",
        description: "Ảnh đại diện đã được cập nhật.",
      });
    } catch (error: any) {
      toast({
        title: "Cập nhật thất bại",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Không thể cập nhật ảnh.",
        variant: "destructive",
      });
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleConnectRiot = async () => {
    setConnectingRiot(true);

    try {
      const response = await axios.get<{ url?: string; error?: string }>(
        `${API_BASE}/api/users/riot/connect`,
        { withCredentials: true },
      );

      const redirectUrl = response.data?.url;
      if (!redirectUrl) {
        throw new Error(
          response.data?.error || "Không tạo được URL Riot OAuth",
        );
      }

      window.location.assign(redirectUrl);
    } catch (error: any) {
      setConnectingRiot(false);
      toast({
        title: "Không thể bắt đầu Riot Sign On",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Vui lòng thử lại sau.",
        variant: "destructive",
      });
    }
  };

  const handleAcceptInvite = async (inviteId: number) => {
    setInviteActionId(inviteId);
    try {
      await acceptTeamInvite(inviteId, token);
      await refreshUser();
      const response = await getMyTeamInvites(token);
      setPendingInvites(response.data?.invites ?? []);
      toast({
        title: "Đã tham gia team",
        description: "Lời mời đã được chấp nhận.",
      });
    } catch (error: any) {
      toast({
        title: "Không thể chấp nhận lời mời",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setInviteActionId(null);
    }
  };

  const handleDeclineInvite = async (inviteId: number) => {
    setInviteActionId(inviteId);
    try {
      await declineTeamInvite(inviteId, token);
      const response = await getMyTeamInvites(token);
      setPendingInvites(response.data?.invites ?? []);
      toast({
        title: "Đã từ chối lời mời",
        description: "Lời mời đã được cập nhật.",
      });
    } catch (error: any) {
      toast({
        title: "Không thể từ chối lời mời",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setInviteActionId(null);
    }
  };

  if (isLoading || !user) {
    return <PageLoader label="Đang tải hồ sơ..." />;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <button
          onClick={handleGoBack}
          className="flex items-center gap-2text-[#EEEEEE] hover:text-foreground text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </button>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border border-border">
                <AvatarImage
                  src={avatarPreview}
                  alt={nickname || user.nickname}
                />
                <AvatarFallback className="font-semibold">
                  {initials || "US"}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl font-bold leading-tight">
                  Hồ sơ cá nhân
                </h1>
                <p className="text-smtext-[#EEEEEE]">@{user.nickname}</p>
              </div>
            </div>
            <Badge variant={user.riot_account ? "default" : "secondary"}>
              {user.riot_account ? "Riot đã liên kết" : "Chưa liên kết Riot"}
            </Badge>
          </div>
        </section>

        {!hasTeam && pendingInvites.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-lg space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Lời mời team</h2>
                <p className="text-sm text-muted-foreground">
                  Bạn có thể chấp nhận hoặc từ chối các lời mời đang chờ.
                </p>
              </div>
              <Badge variant="secondary">{pendingInvites.length} pending</Badge>
            </div>
            <div className="grid gap-3">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="rounded-lg border border-border bg-background p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold uppercase shrink-0">
                      {(invite.team_short_name ?? invite.team_name ?? "T")[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {invite.team_name}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        Mời bởi {invite.inviter_username}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 sm:shrink-0">
                    <Button
                      variant="ghost"
                      onClick={() => handleDeclineInvite(invite.id)}
                      disabled={inviteActionId === invite.id}
                      className="border border-border text-muted-foreground"
                    >
                      Từ chối
                    </Button>
                    <Button
                      onClick={() => handleAcceptInvite(invite.id)}
                      disabled={inviteActionId === invite.id}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {inviteActionId === invite.id
                        ? "Đang xử lý..."
                        : "Chấp nhận"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Thông tin cơ bản</h2>

          <div className="space-y-4">
            <form onSubmit={handleSaveNickname} className="space-y-2">
              <div>
                <label className="text-sm font-medium">Nickname</label>
                <Input
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="Nhập nickname của bạn"
                />
              </div>

              <Button type="submit" disabled={savingNickname} className="gap-2">
                {savingNickname ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang lưu nickname...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Lưu nickname
                  </>
                )}
              </Button>
            </form>

            <form onSubmit={handleUploadAvatar} className="space-y-2">
              <div>
                <label className="text-sm font-medium">Upload ảnh mới</label>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border py-3 text-sm hover:bg-muted/40 transition-colors">
                  <Upload className="h-4 w-4" />
                  <span>
                    {avatarFile ? avatarFile.name : "Chọn ảnh để upload"}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(event) =>
                      setAvatarFile(event.target.files?.[0] ?? null)
                    }
                  />
                </label>
              </div>

              <Button type="submit" disabled={savingAvatar} className="gap-2">
                {savingAvatar ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang upload ảnh...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Cập nhật ảnh
                  </>
                )}
              </Button>
            </form>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Riot Account</h2>
          <p className="text-smtext-[#EEEEEE] mb-4">
            Liên kết Riot Sign On để lấy Riot ID và dùng cho đăng ký giải đấu.
          </p>

          <div className="rounded-md border border-border bg-muted/30 p-4 mb-4">
            <p className="text-smtext-[#EEEEEE]">Riot ID hiện tại</p>
            <p className="font-semibold text-foreground mt-1">
              {user.riot_account || "Chưa có"}
            </p>
          </div>

          <Button
            type="button"
            onClick={handleConnectRiot}
            disabled={connectingRiot}
            className="gap-2"
          >
            {connectingRiot ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang chuyển sang Riot...
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" />
                {user.riot_account ? "Liên kết lại Riot" : "Kết nối Riot"}
              </>
            )}
          </Button>
        </section>
      </div>
    </div>
  );
};

export default ProfilePage;
