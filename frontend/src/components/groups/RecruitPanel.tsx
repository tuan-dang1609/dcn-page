import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { apiErrorMessage, decideJoinRequest, memberName, type RegistrationEntry } from "@/api/groups";
import { getTeamFinder, inviteFreeAgent, setRecruiting, type RecruitMode } from "@/api/teamFinder";
import RolePicker from "@/components/groups/RolePicker";
import { roleLabel } from "@/lib/ingameRoles";

/**
 * Đội trưởng đội lẻ: mở tuyển công khai (duyệt / vào thẳng), vị trí cần tìm, cho hệ thống tự lấp chỗ trống
 * khi hết hạn đăng ký; duyệt đơn xin vào; mời người chơi lẻ đang chờ ghép.
 */

const GREY = "text-[#9A9893]";
const RULE = "border-[#2C2B29]";
const GHOST_BTN = `inline-flex min-h-11 items-center justify-center border ${RULE} px-3 text-sm font-bold disabled:opacity-50`;
const PRIMARY_BTN =
  "inline-flex min-h-11 items-center justify-center bg-[#F2F0EB] px-4 text-sm font-extrabold text-[#0B0B0B] disabled:opacity-50";

const MODES: Array<{ value: RecruitMode; label: string }> = [
  { value: "closed", label: "Không tuyển" },
  { value: "approval", label: "Tôi duyệt" },
  { value: "open", label: "Vào thẳng" },
];

type Props = { entry: RegistrationEntry; token: string };

const RecruitPanel = ({ entry, token }: Props) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<RecruitMode>(entry.recruit_mode ?? "closed");
  const [wanted, setWanted] = useState<string[]>(entry.recruit_roles ?? []);
  const [note, setNote] = useState(entry.recruit_note ?? "");
  const [autoFill, setAutoFill] = useState(Boolean(entry.accept_auto_fill));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMode(entry.recruit_mode ?? "closed");
    setWanted(entry.recruit_roles ?? []);
    setNote(entry.recruit_note ?? "");
    setAutoFill(Boolean(entry.accept_auto_fill));
  }, [entry]);

  const finderQuery = useQuery({
    queryKey: ["team-finder", entry.tournament_id, "captain"],
    enabled: entry.is_open,
    queryFn: async () => (await getTeamFinder(entry.tournament_id, token)).data.data,
  });
  const finder = finderQuery.data;
  const managed = finder?.me?.managed_team;
  const positions = finder?.tournament.positions ?? [];

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast({ title: success });
      for (const key of ["team-finder", "registration-entry", "registration-options", "group"]) {
        await queryClient.invalidateQueries({ queryKey: [key] });
      }
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!entry.is_open) return null;
  const openSlots = Math.max(0, entry.roster_max - entry.roster.length);

  return (
    <section className={`grid gap-4 border-t ${RULE} pt-4`} aria-labelledby="recruit-title">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="recruit-title" className="m-0 text-base font-extrabold">
          Tuyển người công khai
        </h3>
        <span className={`text-xs tabular-nums ${GREY}`}>còn {openSlots} chỗ</span>
      </div>

      <div className={`grid grid-cols-3 border ${RULE}`}>
        {MODES.map((item) => (
          <button
            key={item.value}
            type="button"
            disabled={busy}
            aria-pressed={mode === item.value}
            onClick={() => setMode(item.value)}
            className={`min-h-11 text-sm font-bold ${mode === item.value ? "bg-[#F2F0EB] text-[#0B0B0B]" : GREY}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className={`m-0 text-xs ${GREY}`}>
        {mode === "closed"
          ? "Đội không hiện trong danh sách đội đang tuyển."
          : mode === "approval"
            ? "Người chơi gửi đơn kèm vai trò, bạn duyệt mới vào đội."
            : "Ai bấm vào là vào đội ngay (đến khi đủ người)."}
      </p>

      {mode !== "closed" ? (
        <>
          {positions.length ? (
            <RolePicker multiple label="Vị trí đang cần" choices={positions} value={wanted} onChange={setWanted} disabled={busy} />
          ) : null}
          <input
            className={`min-h-11 w-full border ${RULE} bg-transparent px-3 text-sm outline-none focus:border-[#F2F0EB]`}
            placeholder="Ghi chú (rank, giờ tập…)"
            maxLength={200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </>
      ) : null}

      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-[#F2F0EB]"
          checked={autoFill}
          onChange={(event) => setAutoFill(event.target.checked)}
        />
        <span>
          Hết hạn đăng ký mà chưa đủ người → cho hệ thống tự lấp bằng người chơi lẻ
          {positions.length ? " (ưu tiên đúng vị trí còn thiếu)" : ""}
        </span>
      </label>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy}
          className={PRIMARY_BTN}
          onClick={() =>
            void run(
              () =>
                setRecruiting(
                  entry.id,
                  { recruit_mode: mode, recruit_roles: wanted, recruit_note: note.trim(), accept_auto_fill: autoFill },
                  token,
                ),
              "Đã lưu cách tuyển",
            )
          }
        >
          Lưu cách tuyển
        </button>
      </div>

      {managed?.requests.length ? (
        <div>
          <div className={`border-b ${RULE} pb-2 text-[13px] font-bold`}>Đơn xin vào ({managed.requests.length})</div>
          <ul className="m-0 list-none p-0">
            {managed.requests.map((request) => (
              <li key={request.id} className={`flex flex-wrap items-center gap-2 border-b ${RULE} py-2`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">
                    {memberName(request)}
                    {request.ingame_role ? <span className={`ml-2 font-normal ${GREY}`}>{roleLabel(request.ingame_role)}</span> : null}
                  </div>
                  {request.message ? <div className={`truncate text-xs ${GREY}`}>{request.message}</div> : null}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className={GHOST_BTN}
                  onClick={() => void run(() => decideJoinRequest(request.id, "decline", token), "Đã từ chối")}
                >
                  Từ chối
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={PRIMARY_BTN}
                  onClick={() => void run(() => decideJoinRequest(request.id, "approve", token), "Đã nhận vào đội")}
                >
                  Duyệt
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {finder?.free_agents.length ? (
        <div>
          <div className={`border-b ${RULE} pb-2 text-[13px] font-bold`}>
            Người chơi lẻ đang tìm đội ({finder.free_agents.length})
          </div>
          <ul className="m-0 list-none p-0">
            {finder.free_agents.map((agent) => {
              const invited = managed?.invited_user_ids.includes(Number(agent.user_id));
              return (
                <li key={agent.user_id} className={`flex items-center gap-2 border-b ${RULE} py-2`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{memberName(agent)}</div>
                    <div className={`truncate text-xs ${GREY}`}>
                      {[
                        agent.primary_role ? roleLabel(agent.primary_role) : null,
                        agent.secondary_role ? `phụ ${roleLabel(agent.secondary_role)}` : null,
                        agent.can_captain ? "làm được đội trưởng" : null,
                        agent.note,
                      ]
                        .filter(Boolean)
                        .join(" · ") || agent.riot_account || "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || invited || openSlots === 0}
                    className={GHOST_BTN}
                    onClick={() => void run(() => inviteFreeAgent(entry.id, agent.user_id, token), "Đã gửi lời mời")}
                  >
                    {invited ? "Đã mời" : "Mời"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

export default RecruitPanel;
