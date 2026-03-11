import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Link2, Loader2, Save, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";
import { uploadImageToSupabase } from "@/lib/supabaseUpload";
import { API_BASE } from "@/lib/apiBase";

const ProfilePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, token, isLoading, refreshUser } = useAuth();

  const [nickname, setNickname] = useState("");
  const [profilePictureUrl, setProfilePictureUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewFromFile, setAvatarPreviewFromFile] = useState("");
  const [saving, setSaving] = useState(false);
  const [connectingRiot, setConnectingRiot] = useState(false);

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

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();

    if (!token) {
      toast({
        title: "Chưa đăng nhập",
        description: "Vui lòng đăng nhập để cập nhật hồ sơ.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      let nextProfilePicture = profilePictureUrl.trim() || null;

      if (avatarFile) {
        nextProfilePicture = await uploadImageToSupabase(avatarFile);
        setProfilePictureUrl(nextProfilePicture);
      }

      await axios.patch(
        `${API_BASE}/api/users/me`,
        {
          nickname: nickname.trim() || null,
          profile_picture: nextProfilePicture,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      await refreshUser();
      setAvatarFile(null);

      toast({
        title: "Cập nhật thành công",
        description: "Thông tin cá nhân đã được lưu.",
      });
    } catch (error: any) {
      toast({
        title: "Cập nhật thất bại",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Không thể cập nhật hồ sơ.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConnectRiot = async () => {
    if (!token) {
      toast({
        title: "Chưa đăng nhập",
        description: "Vui lòng đăng nhập trước khi liên kết Riot.",
        variant: "destructive",
      });
      return;
    }

    setConnectingRiot(true);

    try {
      const response = await axios.get<{ url?: string; error?: string }>(
        `${API_BASE}/api/users/riot/connect`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
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

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-centertext-[#EEEEEE] gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Đang tải hồ sơ...</span>
      </div>
    );
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

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Thông tin cơ bản</h2>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nickname</label>
              <Input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Nhập nickname của bạn"
              />
            </div>

            <div className="space-y-2">
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

            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Lưu thay đổi
                </>
              )}
            </Button>
          </form>
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
