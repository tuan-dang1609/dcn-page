import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Upload, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { uploadImageToSupabase } from "@/lib/supabaseUpload";
import { API_BASE } from "@/lib/apiBase";

const SignupPage = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/login");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập tên đăng nhập và mật khẩu.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Mật khẩu không khớp",
        description: "Vui lòng nhập lại mật khẩu xác nhận.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      let logoUrl: string | null = null;

      if (avatarFile) {
        logoUrl = await uploadImageToSupabase(avatarFile);
      }

      await axios.post(`${API_BASE}/api/users`, {
        username: username.trim(),
        nickname: nickname.trim() || null,
        password,
        logo_url: logoUrl,
      });

      toast({
        title: "Đăng ký thành công",
        description: "Tài khoản đã được tạo. Bạn có thể đăng nhập ngay.",
      });

      navigate(`/login?username=${encodeURIComponent(username.trim())}`);
    } catch (error: any) {
      toast({
        title: "Đăng ký thất bại",
        description:
          error?.response?.data?.error ||
          error?.message ||
          "Không thể tạo tài khoản.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <button
          onClick={handleBack}
          className="flex items-center gap-2text-[#EEEEEE] hover:text-foreground text-sm mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại
        </button>

        <div className="bg-card border border-border rounded-xl p-8 shadow-lg">
          <div className="text-center mb-8">
            <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 ">
              <img
                src="https://dongchuyennghiep.vercel.app/image/waiting.png"
                alt="Dong Chuyen Nghiep logo"
                className="w-full h-full"
              />
            </div>
            <h1 className="text-2xl font-bold mb-1">Đăng ký tài khoản</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tên đăng nhập</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập tên đăng nhập"
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Biệt danh</label>
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Nhập biệt danh (không bắt buộc)"
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Mật khẩu</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Nhập lại mật khẩu</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu"
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Ảnh đại diện</label>
              <label className="flex items-center justify-center gap-2 border border-dashed border-border rounded-md py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                <Upload className="w-4 h-4" />
                <span className="text-sm">
                  {avatarFile ? avatarFile.name : "Chọn ảnh để upload Supabase"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <Button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="w-full"
            >
              {loading ? "Đang đăng ký..." : "Đăng ký"}
            </Button>
          </form>

          <p className="text-centertext-[#EEEEEE] text-xs mt-4">
            Đã có tài khoản?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Đăng nhập
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
