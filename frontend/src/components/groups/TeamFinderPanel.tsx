import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { apiErrorMessage, memberName } from "@/api/groups";
import {
  answerTeamInvite,
  formTeamsNow,
  getTeamFinder,
  joinFreeAgents,
  joinRecruitingTeam,
  leaveFreeAgents,
} from "@/api/teamFinder";
import RolePicker from "@/components/groups/RolePicker";
import { roleChoices, roleLabel } from "@/lib/ingameRoles";

/**
 * Người chơi chưa có đội (giải lẻ của Valorant / LMHT / Liên Quân):
 *   - Lời mời từ đội trưởng → đồng ý / từ chối.
 *   - Đội đang tuyển → vào thẳng hoặc gửi đơn (kèm vai trò).
 *   - Đăng ký "ghép ngẫu nhiên": hết hạn đăng ký hệ thống tự xếp đội, cân bằng vai trò.
 * Liên Quân không hỏi vai trò.
 */

const GREY = "text-[#9A9893]";
const RULE = "border-[#2C2B29]";
const GHOST_BTN = `inline-flex min-h-11 items-center justify-center border ${RULE} px-3 text-sm font-bold disabled:opacity-50`;
const PRIMARY_BTN =
  "inline-flex min-h-11 items-center justify-center bg-[#F2F0EB] px-4 text-sm font-extrabold text-[#0B0B0B] disabled:opacity-50";

const formatTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "";

type Props = { tournamentId: number | string; token: string };

const TeamFinderPanel = ({ tournamentId, token }: Props) => {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [primary, setPrimary] = useState<string | null>(null);
  const [secondary, setSecondary] = useState<string | null>(null);
  const [canCaptain, setCanCaptain] = useState(false);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);

  const finderQuery = useQuery({
    queryKey: ["team-finder", tournamentId, "player"],
    queryFn: async () => (await getTeamFinder(tournamentId, token)).data.data,
  });
  const finder = finderQuery.data;
  const me = finder?.me;
  const choices = roleChoices(finder?.tournament.game);
  const needsRole = Boolean(finder?.tournament.roles_required && choices.length);

  // Điền sẵn: đăng ký hiện có → vai trò mặc định đã lưu (chỉ khi dữ liệu thật sự đổi, không phải mỗi lần tải lại)
  const prefillKey = JSON.stringify([me?.free_agent ?? null, me?.default_roles ?? null]);
  useEffect(() => {
    const [agent, defaults] = JSON.parse(prefillKey) as [NonNullable<typeof me>["free_agent"], NonNullable<typeof me>["default_roles"]];
    const source = agent ?? defaults;
    setPrimary(source?.primary_role ?? null);
    setSecondary(source?.secondary_role ?? null);
    setCanCaptain(Boolean(agent?.can_captain));
    setNote(agent?.note ?? "");
  }, [prefillKey]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast({ title: success });
      setEditing(false);
      for (const key of ["team-finder", "registration-options", "registration-entry", "group", "my-groups"]) {
        await queryClient.invalidateQueries({ queryKey: [key] });
      }
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (finderQuery.isLoading) return <p className={`text-sm ${GREY}`}>Đang tải…</p>;
  if (!finder) return <p className="text-sm text-[#FF4A3D]">Không tải được danh sách tìm đội.</p>;

  const { tournament } = finder;
  const agent = me?.free_agent;
  const waiting = agent?.status === "waiting";
  const pendingTeamIds = new Set((me?.requests ?? []).map((request) => String(request.registration_id)));
  const roleMissing = needsRole && !primary;

  if (tournament.team_formed_at) {
    return (
      <div className={`grid gap-2 text-sm ${GREY}`}>
        <p className="m-0">Đã ghép đội lúc {formatTime(tournament.team_formed_at)}.</p>
        {agent?.status === "unplaced" ? (
          <p className="m-0 text-[#FF4A3D]">Chưa đủ người để xếp bạn vào đội — liên hệ BTC nếu muốn làm dự bị.</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Lời mời */}
      {me?.invites.length ? (
        <section>
          <h3 className={`m-0 border-b-2 border-[#F2F0EB] pb-2 text-base font-extrabold`}>Lời mời vào đội</h3>
          <ul className="m-0 list-none p-0">
            {me.invites.map((invite) => (
              <li key={invite.id} className={`flex flex-wrap items-center gap-2 border-b ${RULE} py-2`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">
                    {invite.name} <span className={GREY}>[{invite.short_name}]</span>
                  </div>
                  {invite.ingame_role ? <div className={`text-xs ${GREY}`}>Vị trí: {roleLabel(invite.ingame_role)}</div> : null}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className={GHOST_BTN}
                  onClick={() => void run(() => answerTeamInvite(invite.id, "decline", token), "Đã từ chối lời mời")}
                >
                  Từ chối
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={PRIMARY_BTN}
                  onClick={() => void run(() => answerTeamInvite(invite.id, "accept", token), `Đã vào ${invite.name}`)}
                >
                  Vào đội
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Ghép ngẫu nhiên */}
      <section className="grid gap-3">
        <h3 className="m-0 border-b-2 border-[#F2F0EB] pb-2 text-base font-extrabold">Ghép đội ngẫu nhiên</h3>
        <p className={`m-0 text-sm ${GREY}`}>
          Hết hạn đăng ký{tournament.register_end ? ` (${formatTime(tournament.register_end)})` : ""}, hệ thống tự xếp
          những người đăng ký vào đội {tournament.roster_min} người
          {needsRole ? ", mỗi đội đủ vị trí" : ""}. Đăng ký sớm được ưu tiên nếu bị dư người.
        </p>

        {waiting && !editing ? (
          <div className={`flex flex-wrap items-center justify-between gap-3 border ${RULE} p-3`}>
            <div className="text-sm">
              <div className="font-bold">Đang chờ ghép</div>
              <div className={`text-xs ${GREY}`}>
                {[
                  agent.primary_role ? `Chính: ${roleLabel(agent.primary_role)}` : null,
                  agent.secondary_role ? `Phụ: ${roleLabel(agent.secondary_role)}` : null,
                  agent.can_captain ? "Sẵn sàng làm đội trưởng" : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Bạn sẽ được xếp ngẫu nhiên"}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                className="min-h-11 px-2 text-sm font-bold text-[#FF4A3D] disabled:opacity-50"
                onClick={() => void run(() => leaveFreeAgents(tournamentId, token), "Đã rút khỏi danh sách ghép")}
              >
                Rút
              </button>
              <button type="button" disabled={busy} className={GHOST_BTN} onClick={() => setEditing(true)}>
                Sửa
              </button>
            </div>
          </div>
        ) : tournament.is_open ? (
          <div className="grid gap-3">
            {needsRole ? (
              <>
                <RolePicker label="Vai trò chính *" choices={choices} value={primary} onChange={setPrimary} disabled={busy} />
                <RolePicker
                  label="Vai trò phụ (không bắt buộc)"
                  allowEmpty
                  choices={choices.filter((role) => role !== primary)}
                  value={secondary}
                  onChange={setSecondary}
                  disabled={busy}
                />
              </>
            ) : null}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[#F2F0EB]"
                checked={canCaptain}
                onChange={(event) => setCanCaptain(event.target.checked)}
              />
              Sẵn sàng làm đội trưởng (ban/pick, check-in)
            </label>
            <input
              className={`min-h-11 w-full border ${RULE} bg-transparent px-3 text-sm outline-none focus:border-[#F2F0EB]`}
              placeholder="Ghi chú (rank, tướng / agent hay chơi…)"
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              {editing ? (
                <button type="button" className={GHOST_BTN} onClick={() => setEditing(false)}>
                  Huỷ
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy || roleMissing}
                className={PRIMARY_BTN}
                onClick={() =>
                  void run(
                    () =>
                      joinFreeAgents(
                        tournamentId,
                        {
                          primary_role: needsRole ? primary : null,
                          secondary_role: needsRole && secondary !== primary ? secondary : null,
                          can_captain: canCaptain,
                          note: note.trim(),
                        },
                        token,
                      ),
                    waiting ? "Đã cập nhật" : "Đã đăng ký chờ ghép đội",
                  )
                }
              >
                {waiting ? "Lưu" : "Đăng ký ghép đội"}
              </button>
            </div>
          </div>
        ) : (
          <p className={`m-0 text-sm ${GREY}`}>Giải đang không mở đăng ký.</p>
        )}
      </section>

      {/* Đội đang tuyển */}
      <section className="grid gap-3">
        <h3 className="m-0 border-b-2 border-[#F2F0EB] pb-2 text-base font-extrabold">
          Đội đang tuyển <span className={`text-sm font-bold ${GREY}`}>{finder.teams.length}</span>
        </h3>
        {needsRole && finder.teams.length ? (
          <RolePicker label="Vai trò của bạn khi vào đội" choices={choices} value={primary} onChange={setPrimary} disabled={busy} />
        ) : null}
        {!finder.teams.length ? <p className={`m-0 text-sm ${GREY}`}>Chưa có đội nào mở tuyển.</p> : null}
        <ul className="m-0 list-none p-0">
          {finder.teams.map((team) => {
            const pending = pendingTeamIds.has(String(team.registration_id));
            const open = team.recruit_mode === "open";
            return (
              <li key={team.registration_id} className={`grid gap-2 border-b ${RULE} py-3`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-extrabold">
                      {team.name} <span className={GREY}>[{team.short_name}]</span>
                    </div>
                    <div className={`text-xs ${GREY}`}>
                      {open ? "Vào thẳng" : "Đội trưởng duyệt"} · còn {team.open_slots} chỗ
                      {team.recruit_roles.length ? (
                        <>
                          {" · cần "}
                          <span className="font-bold text-[#FF4A3D]">{team.recruit_roles.map(roleLabel).join(", ")}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || pending || roleMissing || !tournament.is_open}
                    className={open ? PRIMARY_BTN : GHOST_BTN}
                    onClick={() =>
                      void run(
                        () => joinRecruitingTeam(team.registration_id, { ingame_role: needsRole ? primary : null }, token),
                        open ? `Đã vào ${team.name}` : "Đã gửi đơn — chờ đội trưởng duyệt",
                      )
                    }
                  >
                    {pending ? "Đã gửi đơn" : open ? "Vào đội" : "Xin vào"}
                  </button>
                </div>
                <div className={`text-xs ${GREY}`}>
                  {team.roster
                    .map((player) => `${memberName(player)}${player.ingame_role ? ` (${roleLabel(player.ingame_role)})` : ""}`)
                    .join(" · ")}
                </div>
                {team.recruit_note ? <div className="text-xs">{team.recruit_note}</div> : null}
              </li>
            );
          })}
        </ul>
      </section>

      {tournament.can_form_now ? (
        <div className={`flex flex-wrap items-center justify-between gap-3 border ${RULE} p-3 text-sm`}>
          <span className={GREY}>
            BTC: ghép ngay những người đang chờ ({finder.free_agents.length} người, cần {tournament.roster_min} người / đội).
            Người dư vẫn chờ, tới hạn hệ thống ghép tiếp.
          </span>
          <button
            type="button"
            disabled={busy || !finder.free_agents.length}
            className={GHOST_BTN}
            onClick={() => {
              if (!window.confirm(`Ghép ngay ${finder.free_agents.length} người đang chờ?`)) return;
              void run(async () => {
                const { data } = await formTeamsNow(tournamentId, token);
                const result = data.data;
                toast({
                  title: `Tạo ${result?.created?.length ?? 0} đội, lấp ${result?.filled?.length ?? 0} đội`,
                  description: result?.still_waiting?.length ? `${result.still_waiting.length} người vẫn chờ ghép` : undefined,
                });
              }, "Đã ghép xong");
            }}
          >
            Ghép đội ngay
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default TeamFinderPanel;
