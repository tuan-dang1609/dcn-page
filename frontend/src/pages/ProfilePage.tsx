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
import {
  DEFAULT_USER_AVATAR_URL,
  TOURNAMENT_PAGE_BG_CLASS,
  TOURNAMENT_PAGE_HINT_CLASS,
  TOURNAMENT_PAGE_TITLE_CLASS,
  TOURNAMENT_PANEL_CLASS,
  TOURNAMENT_PANEL_TITLE_CLASS,
  TOURNAMENT_SECTION_META_CLASS,
} from "@/components/tournamentTheme";

const FIELD_LABEL_CLASS =
  "mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-neutral-400";

const FIELD_INPUT_CLASS =
  "h-11 rounded-none border-neutral-600 bg-[#1a1a1a] text-base text-white placeholder:text-neutral-500 focus-visible:ring-neutral-500 md:text-sm";

const ProfilePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, token, isLoading, refreshUser } = useAuth();

  const [nickname, setNickname] = useState("");
  const [profilePictureUrl, setProfilePictureUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewFromFile, setAvatarPreviewFromFile] = useState("");
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
    DEFAULT_USER_AVATAR_URL;

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
      const cacheBusted = `${nextProfilePicture}?v=${Date.now()}`;
      setProfilePictureUrl(cacheBusted);

      await axios.patch(
        `${API_BASE}/api/users/me`,
        { profile_picture: nextProfilePicture },
        { headers: { Authorization: `Bearer ${token}` } },
      );

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
        {
          params: {
            return_to: "/profile",
            origin: window.location.origin,
          },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          withCredentials: true,
        },
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
    <div className={`min-h-screen px-4 py-8 ${TOURNAMENT_PAGE_BG_CLASS}`}>
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <button
          type="button"
          onClick={handleGoBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </button>

        <section className={`${TOURNAMENT_PANEL_CLASS} p-5 sm:p-6`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 rounded-none border border-neutral-600">
                <AvatarImage
                  src={avatarPreview}
                  alt={nickname || user.nickname}
                  className="rounded-none object-cover"
                />
                <AvatarFallback className="rounded-none bg-[#2d2d2d] font-semibold text-white">
                  {initials || "US"}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className={`${TOURNAMENT_PAGE_TITLE_CLASS} text-xl sm:text-2xl`}>
                  Hồ sơ cá nhân
                </h1>
                <p className="mt-1 text-sm font-semibold text-neutral-300">
                  @{user.nickname || "chưa có nickname"}
                </p>
              </div>
            </div>
            <span
              className={`inline-flex w-fit items-center border px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider ${
                user.riot_account
                  ? "border-neutral-500 bg-[#2d2d2d] text-white"
                  : "border-neutral-700 bg-[#1a1a1a] text-neutral-400"
              }`}
            >
              {user.riot_account ? "Riot đã liên kết" : "Chưa liên kết Riot"}
            </span>
          </div>
        </section>

        {!hasTeam && pendingInvites.length > 0 && (
          <section className={`${TOURNAMENT_PANEL_CLASS} overflow-hidden`}>
            <div className={TOURNAMENT_PANEL_TITLE_CLASS}>
              Lời mời team · {pendingInvites.length} đang chờ
            </div>
            <div className="space-y-0">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-col gap-3 border-b border-neutral-800 px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-neutral-600 bg-[#2d2d2d] text-xs font-bold uppercase text-white">
                      {(invite.team_short_name ?? invite.team_name ?? "T")[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">
                        {invite.team_name}
                      </p>
                      <p className="truncate text-sm text-neutral-400">
                        Mời bởi {invite.inviter_username}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 sm:shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleDeclineInvite(invite.id)}
                      disabled={inviteActionId === invite.id}
                      className="rounded-none border-neutral-600 bg-transparent text-neutral-300 hover:bg-neutral-900 hover:text-white"
                    >
                      Từ chối
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleAcceptInvite(invite.id)}
                      disabled={inviteActionId === invite.id}
                      className="rounded-none bg-white text-neutral-900 hover:bg-neutral-200"
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

        <section className={`${TOURNAMENT_PANEL_CLASS} overflow-hidden`}>
          <div className={TOURNAMENT_PANEL_TITLE_CLASS}>Thông tin cơ bản</div>
          <div className="space-y-6 p-5 sm:p-6">
            <form onSubmit={handleSaveNickname} className="space-y-3">
              <div>
                <label htmlFor="profile-nickname" className={FIELD_LABEL_CLASS}>
                  Nickname
                </label>
                <Input
                  id="profile-nickname"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="Nhập nickname của bạn"
                  className={FIELD_INPUT_CLASS}
                  autoComplete="nickname"
                />
                <p className={`${TOURNAMENT_PAGE_HINT_CLASS} mt-1.5`}>
                  Tên hiển thị trên giải đấu và bảng xếp hạng.
                </p>
              </div>

              <Button
                type="submit"
                disabled={savingNickname}
                className="h-10 gap-2 rounded-none bg-white px-4 font-bold text-neutral-900 hover:bg-neutral-200"
              >
                {savingNickname ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Lưu nickname
                  </>
                )}
              </Button>
            </form>

            <div className="border-t border-neutral-800 pt-6">
              <form onSubmit={handleUploadAvatar} className="space-y-3">
                <div>
                  <p className={FIELD_LABEL_CLASS}>Ảnh đại diện</p>
                  <div className="mb-3 flex items-center gap-4">
                    <Avatar className="h-14 w-14 rounded-none border border-neutral-600">
                      <AvatarImage
                        src={avatarPreview}
                        alt="preview"
                        className="rounded-none object-cover"
                      />
                      <AvatarFallback className="rounded-none bg-[#2d2d2d] text-white">
                        {initials || "US"}
                      </AvatarFallback>
                    </Avatar>
                    <p className={TOURNAMENT_PAGE_HINT_CLASS}>
                      JPG, PNG hoặc WEBP · tối đa 5MB
                    </p>
                  </div>
                  <label className="flex cursor-pointer items-center justify-center gap-2 border border-dashed border-neutral-600 bg-[#1a1a1a] py-3.5 text-sm font-semibold text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-[#222] hover:text-white">
                    <Upload className="h-4 w-4 text-neutral-400" />
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

                <Button
                  type="submit"
                  disabled={savingAvatar || !avatarFile}
                  className="h-10 gap-2 rounded-none bg-white px-4 font-bold text-neutral-900 hover:bg-neutral-200 disabled:border disabled:border-neutral-700 disabled:bg-neutral-800 disabled:text-neutral-500"
                >
                  {savingAvatar ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Đang upload...
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
          </div>
        </section>

        <section className={`${TOURNAMENT_PANEL_CLASS} overflow-hidden`}>
          <div className={TOURNAMENT_PANEL_TITLE_CLASS}>Riot Account</div>
          <div className="space-y-4 p-5 sm:p-6">
            <p className={TOURNAMENT_PAGE_HINT_CLASS}>
              Liên kết Riot Sign On để lấy Riot ID và dùng cho đăng ký giải đấu.
            </p>

            <div className="border border-neutral-700 bg-[#1a1a1a] px-4 py-3.5">
              <p className={TOURNAMENT_SECTION_META_CLASS}>Riot ID hiện tại</p>
              <p className="mt-1 text-base font-bold text-white">
                {user.riot_account || "Chưa có"}
              </p>
            </div>

            <Button
              type="button"
              onClick={handleConnectRiot}
              disabled={connectingRiot}
              className="h-10 gap-2 rounded-none border border-neutral-600 bg-[#2d2d2d] px-4 font-bold text-white hover:border-neutral-500 hover:bg-neutral-700"
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
          </div>
        </section>
      </div>
    </div>
  );
};

export default ProfilePage;
