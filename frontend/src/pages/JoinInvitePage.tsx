import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { PAGE_FRAME_CLASS } from "@/components/TournamentMasthead";
import GroupLogo from "@/components/groups/GroupLogo";
import GroupsHeader from "@/components/groups/GroupsHeader";
import { acceptInvite, apiErrorMessage, getInvitePreview } from "@/api/groups";

/** /join/:token — mở link mời org / đội lẻ: xem trước, đăng nhập nếu cần, bấm "Tham gia". */

const GREY = "text-[#9A9893]";

const JoinInvitePage = () => {
  const { token: inviteToken = "" } = useParams();
  const { user, token, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewQuery = useQuery({
    queryKey: ["invite-preview", inviteToken, user?.id],
    retry: false,
    queryFn: async () => (await getInvitePreview(inviteToken, token)).data.data,
  });
  const preview = previewQuery.data;

  const accept = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await acceptInvite(inviteToken, token);
      toast({ title: "Đã tham gia" });
      await refreshUser?.();
      navigate(`/orgs/${data.data.id}`);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-[#F2F0EB]">
      <GroupsHeader />
      <main className={`${PAGE_FRAME_CLASS} pb-16 pt-10`}>
        <div className="mx-auto max-w-md">
          {previewQuery.isLoading ? (
            <p className={`text-sm ${GREY}`}>Đang tải…</p>
          ) : !preview ? (
            <div>
              <h1 className="m-0 text-2xl font-extrabold">Link mời không hợp lệ</h1>
              <p className={`mt-2 text-sm ${GREY}`}>Link đã hết hạn, đã bị thu hồi hoặc hết lượt dùng. Nhờ người mời gửi link mới.</p>
            </div>
          ) : (
            <div className="border-t-2 border-[#F2F0EB] pt-5">
              <div className={`text-xs ${GREY}`}>Bạn được mời vào {preview.group.kind === "org" ? "org" : "đội lẻ"}</div>
              <div className="mt-3 flex items-center gap-4">
                <GroupLogo group={preview.group} size={64} />
                <div className="min-w-0">
                  <h1 className="m-0 truncate text-[28px] font-extrabold leading-tight">{preview.group.name}</h1>
                  <div className={`text-sm ${GREY}`}>
                    {preview.group.short_name} · {preview.member_count} thành viên
                  </div>
                </div>
              </div>

              <div className="mt-6">
                {preview.already_member ? (
                  <Link
                    to={`/orgs/${preview.group.id}`}
                    className="inline-flex min-h-11 items-center bg-[#F2F0EB] px-5 text-sm font-extrabold text-[#0B0B0B]"
                  >
                    Bạn đã ở trong nhóm — xem trang
                  </Link>
                ) : user ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void accept()}
                    className="inline-flex min-h-11 w-full items-center justify-center bg-[#F2F0EB] px-5 text-sm font-extrabold text-[#0B0B0B] disabled:opacity-50"
                  >
                    {busy ? "Đang tham gia…" : "Tham gia"}
                  </button>
                ) : (
                  <Link
                    to={`/login?returnTo=${encodeURIComponent(`/join/${inviteToken}`)}`}
                    className="inline-flex min-h-11 w-full items-center justify-center bg-[#F2F0EB] px-5 text-sm font-extrabold text-[#0B0B0B]"
                  >
                    Đăng nhập để tham gia
                  </Link>
                )}
                {preview.group.kind === "org" && !preview.already_member ? (
                  <p className={`mt-3 text-xs ${GREY}`}>Mỗi người chỉ ở một org — nếu bạn đang ở org khác, cần rời org đó trước.</p>
                ) : null}
                {error ? <p className="mt-3 text-sm text-[#FF4A3D]">{error}</p> : null}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default JoinInvitePage;
