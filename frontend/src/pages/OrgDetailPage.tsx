import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { PAGE_FRAME_CLASS } from "@/components/TournamentMasthead";
import GroupLogo from "@/components/groups/GroupLogo";
import GroupsHeader from "@/components/groups/GroupsHeader";
import {
  ROLE_LABEL,
  apiErrorMessage,
  cancelJoinRequest,
  createInviteLink,
  decideJoinRequest,
  disbandGroup,
  getGroupDetail,
  inviteUrl,
  kickMember,
  leaveGroup,
  memberName,
  requestToJoin,
  revokeInviteLink,
  setMemberRole,
  transferGroup,
  type GroupMember,
} from "@/api/groups";

/**
 * /orgs/:id — org hoặc đội lẻ: thành viên + vai trò, các giải đã tham gia.
 * Khách: xin vào. Thành viên: rời. Quản lý (sáng lập / lead / đội trưởng): duyệt đơn, link mời, kick.
 * Sáng lập: đổi vai trò lead, chuyển quyền, giải tán (khi chưa có lịch sử thi đấu).
 */

const GREY = "text-[#9A9893]";
const RULE = "border-[#2C2B29]";
const PRIMARY_BTN =
  "inline-flex min-h-11 items-center justify-center bg-[#F2F0EB] px-5 text-sm font-extrabold text-[#0B0B0B] disabled:opacity-50";
const GHOST_BTN = `inline-flex min-h-11 items-center justify-center border ${RULE} px-4 text-sm font-bold disabled:opacity-50`;
const SMALL_BTN = `inline-flex min-h-9 items-center border ${RULE} px-2.5 text-xs font-bold disabled:opacity-50`;

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", year: "numeric" }) : "";

const OrgDetailPage = () => {
  const { id = "" } = useParams();
  const { user, token, refreshUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const groupQuery = useQuery({
    queryKey: ["group", id, user?.id],
    queryFn: async () => (await getGroupDetail(id, token)).data.data,
  });
  const group = groupQuery.data;

  const run = async (action: () => Promise<unknown>, success: string, after?: () => void) => {
    if (!token) return;
    setBusy(true);
    try {
      await action();
      toast({ title: success });
      await queryClient.invalidateQueries({ queryKey: ["group"] });
      await queryClient.invalidateQueries({ queryKey: ["my-groups"] });
      await refreshUser?.();
      after?.();
    } catch (err) {
      toast({ title: "Không thực hiện được", description: apiErrorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (groupQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0B0B] text-[#F2F0EB]">
        <GroupsHeader />
        <p className={`${PAGE_FRAME_CLASS} pt-8 text-sm ${GREY}`}>Đang tải…</p>
      </div>
    );
  }
  if (!group) {
    return (
      <div className="min-h-screen bg-[#0B0B0B] text-[#F2F0EB]">
        <GroupsHeader />
        <p className={`${PAGE_FRAME_CLASS} pt-8 text-sm text-[#FF4A3D]`}>Không tìm thấy org / đội.</p>
      </div>
    );
  }

  const isOrg = group.kind === "org";
  const myRole = group.my_role;
  const isOwner = myRole === "founder" || myRole === "captain";
  const canManage = group.can_manage;
  const ownerLabel = isOrg ? "sáng lập" : "đội trưởng";

  const copyLink = async (token_: string) => {
    await navigator.clipboard?.writeText(inviteUrl(token_)).catch(() => {});
    toast({ title: "Đã sao chép link mời", description: "Gửi link qua Zalo / Discord." });
  };

  const memberActions = (member: GroupMember) => {
    if (!canManage || String(member.user_id) === String(user?.id)) return null;
    if (member.role === "founder" || member.role === "captain") return null;
    return (
      <div className="flex flex-wrap justify-end gap-1.5">
        {isOrg && isOwner ? (
          <button
            type="button"
            disabled={busy}
            className={SMALL_BTN}
            onClick={() =>
              void run(
                () => setMemberRole(group.id, member.user_id, member.role === "lead" ? "member" : "lead", token!),
                member.role === "lead" ? "Đã bỏ quyền lead" : "Đã đặt làm lead",
              )
            }
          >
            {member.role === "lead" ? "Bỏ lead" : "Đặt lead"}
          </button>
        ) : null}
        {isOwner ? (
          <button
            type="button"
            disabled={busy}
            className={SMALL_BTN}
            onClick={() => {
              if (!window.confirm(`Chuyển quyền ${ownerLabel} cho ${memberName(member)}?`)) return;
              void run(() => transferGroup(group.id, member.user_id, token!), "Đã chuyển quyền");
            }}
          >
            Chuyển quyền
          </button>
        ) : null}
        {member.role !== "lead" || isOwner ? (
          <button
            type="button"
            disabled={busy}
            className={`${SMALL_BTN} text-[#FF4A3D]`}
            onClick={() => {
              if (!window.confirm(`Mời ${memberName(member)} ra khỏi ${isOrg ? "org" : "đội"}?`)) return;
              void run(() => kickMember(group.id, member.user_id, token!), "Đã mời ra khỏi nhóm");
            }}
          >
            Kick
          </button>
        ) : null}
      </div>
    );
  };

  /* Hành động của khách / thành viên */
  const viewerAction = (() => {
    if (!user) {
      return (
        <Link to={`/login?returnTo=${encodeURIComponent(`/orgs/${group.id}`)}`} className={GHOST_BTN}>
          Đăng nhập để xin vào
        </Link>
      );
    }
    if (myRole && !isOwner) {
      return (
        <button
          type="button"
          disabled={busy}
          className={`${GHOST_BTN} text-[#FF4A3D]`}
          onClick={() => {
            if (!window.confirm(`Rời ${group.name}?`)) return;
            void run(() => leaveGroup(group.id, token!), "Đã rời nhóm");
          }}
        >
          Rời {isOrg ? "org" : "đội"}
        </button>
      );
    }
    if (myRole) return null;
    if (group.my_request) {
      return (
        <div className="flex flex-wrap items-center gap-3">
          <span className={`text-sm ${GREY}`}>Đã gửi đơn — chờ duyệt</span>
          <button
            type="button"
            disabled={busy}
            className={GHOST_BTN}
            onClick={() => void run(() => cancelJoinRequest(group.id, token!), "Đã huỷ đơn")}
          >
            Huỷ đơn
          </button>
        </div>
      );
    }
    return (
      <div className="flex w-full max-w-md flex-wrap gap-2">
        <input
          className={`min-h-11 min-w-0 flex-1 border ${RULE} bg-transparent px-3 text-sm outline-none focus:border-[#F2F0EB]`}
          placeholder="Lời nhắn (không bắt buộc)"
          value={message}
          maxLength={300}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          className={PRIMARY_BTN}
          onClick={() => void run(() => requestToJoin(group.id, message.trim(), token!), "Đã gửi đơn xin vào")}
        >
          Xin vào
        </button>
      </div>
    );
  })();

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-[#F2F0EB]">
      <GroupsHeader />
      <main className={`${PAGE_FRAME_CLASS} pb-16 pt-6`}>
        <div className="text-sm">
          <Link to="/orgs" className="font-semibold">
            ← Org
          </Link>
        </div>

        {/* Đầu trang */}
        <div className="mt-6 flex flex-wrap items-center gap-4 border-b-2 border-[#F2F0EB] pb-5">
          <GroupLogo group={group} size={72} />
          <div className="min-w-0 flex-1">
            <div className={`text-xs ${GREY}`}>
              {isOrg ? "Org" : "Đội lẻ"} · {group.short_name} · {group.members.length} người
            </div>
            <h1 className="m-0 truncate text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] md:text-[48px]">
              {group.name}
            </h1>
          </div>
          <div className="w-full md:w-auto">{viewerAction}</div>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Thành viên */}
          <section>
            <h2 className="m-0 border-b border-[#F2F0EB] pb-2 text-[15px] font-extrabold">Thành viên</h2>
            <ul className="m-0 list-none p-0">
              {group.members.map((member) => (
                <li key={member.user_id} className={`flex min-h-14 flex-wrap items-center gap-3 border-b ${RULE} py-2`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border border-[#2C2B29]">
                    {member.profile_picture ? (
                      <img src={member.profile_picture} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className={`text-xs font-bold ${GREY}`}>{memberName(member).charAt(0).toUpperCase()}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{memberName(member)}</span>
                    <span className={`block truncate text-xs ${GREY}`}>{member.riot_account || "Chưa liên kết Riot"}</span>
                  </span>
                  <span
                    className={`shrink-0 text-xs font-bold ${
                      member.role === "founder" || member.role === "captain" ? "text-[#F2F0EB]" : GREY
                    }`}
                  >
                    {ROLE_LABEL[member.role]}
                  </span>
                  {memberActions(member)}
                </li>
              ))}
            </ul>

            {/* Giải */}
            <h2 className="m-0 mt-10 border-b border-[#F2F0EB] pb-2 text-[15px] font-extrabold">Giải đấu</h2>
            {group.tournaments.length ? (
              <ul className="m-0 list-none p-0">
                {group.tournaments.map((tournament) => (
                  <li key={tournament.registration_id} className={`flex min-h-12 items-center gap-3 border-b ${RULE} text-sm`}>
                    <span className="min-w-0 flex-1 truncate font-bold">
                      {tournament.game && tournament.slug ? (
                        <Link to={`/tournament/${tournament.game.toLowerCase()}/${tournament.slug}`}>{tournament.name}</Link>
                      ) : (
                        tournament.name
                      )}
                    </span>
                    <span className={`shrink-0 text-xs ${GREY}`}>
                      {tournament.series_id ? "Series · " : ""}
                      {tournament.roster_count} người · {formatDate(tournament.date_start)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`text-sm ${GREY}`}>Chưa tham gia giải nào.</p>
            )}
          </section>

          {/* Quản lý */}
          {canManage ? (
            <aside className="grid content-start gap-10">
              <section>
                <h2 className="m-0 border-b border-[#F2F0EB] pb-2 text-[15px] font-extrabold">
                  Đơn xin vào{" "}
                  {group.pending_requests.length ? (
                    <span className="text-[#FF4A3D]">({group.pending_requests.length})</span>
                  ) : null}
                </h2>
                {group.pending_requests.length ? (
                  <ul className="m-0 list-none p-0">
                    {group.pending_requests.map((request) => (
                      <li key={request.id} className={`border-b ${RULE} py-2.5`}>
                        <div className="text-sm font-bold">{memberName(request)}</div>
                        <div className={`text-xs ${GREY}`}>{request.riot_account || "Chưa liên kết Riot"}</div>
                        {request.message ? <p className="m-0 mt-1 text-sm">“{request.message}”</p> : null}
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            className="inline-flex min-h-9 items-center bg-[#F2F0EB] px-3 text-xs font-extrabold text-[#0B0B0B] disabled:opacity-50"
                            onClick={() => void run(() => decideJoinRequest(request.id, "approve", token!), "Đã duyệt")}
                          >
                            Duyệt
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className={SMALL_BTN}
                            onClick={() => void run(() => decideJoinRequest(request.id, "decline", token!), "Đã từ chối")}
                          >
                            Từ chối
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={`text-sm ${GREY}`}>Không có đơn nào.</p>
                )}
              </section>

              <section>
                <h2 className="m-0 border-b border-[#F2F0EB] pb-2 text-[15px] font-extrabold">Link mời</h2>
                <p className={`text-sm ${GREY}`}>Ai mở link là vào {isOrg ? "org" : "đội"} ngay. Link hết hạn sau 72 giờ.</p>
                {group.invite_links.map((link) => (
                  <div key={link.id} className={`flex flex-wrap items-center gap-2 border-b ${RULE} py-2 text-xs`}>
                    <code className="min-w-0 flex-1 truncate text-[#9A9893]">{inviteUrl(link.token)}</code>
                    <button type="button" className={SMALL_BTN} onClick={() => void copyLink(link.token)}>
                      Sao chép
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className={`${SMALL_BTN} text-[#FF4A3D]`}
                      onClick={() => void run(() => revokeInviteLink(group.id, link.id, token!), "Đã thu hồi link")}
                    >
                      Thu hồi
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  className={`${GHOST_BTN} mt-3`}
                  onClick={() =>
                    void run(async () => {
                      const { data } = await createInviteLink(group.id, token!);
                      await copyLink(data.data.token);
                    }, "Đã tạo link mời")
                  }
                >
                  Tạo & sao chép link mới
                </button>
              </section>

              {isOwner ? (
                <section>
                  <h2 className="m-0 border-b border-[#2C2B29] pb-2 text-[15px] font-extrabold">Giải tán</h2>
                  <p className={`text-sm ${GREY}`}>Chỉ giải tán được khi chưa có lịch sử thi đấu.</p>
                  <button
                    type="button"
                    disabled={busy}
                    className={`${GHOST_BTN} border-[#FF4A3D] text-[#FF4A3D]`}
                    onClick={() => {
                      if (!window.confirm(`Giải tán ${group.name}? Không thể hoàn tác.`)) return;
                      void run(() => disbandGroup(group.id, token!), "Đã giải tán", () => navigate("/orgs"));
                    }}
                  >
                    Giải tán {isOrg ? "org" : "đội"}
                  </button>
                </section>
              ) : null}
            </aside>
          ) : null}
        </div>
      </main>
    </div>
  );
};

export default OrgDetailPage;
