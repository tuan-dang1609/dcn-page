import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { apiErrorMessage, memberName } from "@/api/groups";
import { clearMatchLineup, getMatchLineups, saveMatchLineup, type LineupTeam } from "@/api/matchLineups";

/**
 * Đội trưởng (quản lý đội / BTC) chọn người ra sân cho trận này trong đội hình đã đăng ký giải.
 * Trong giai đoạn chọn người (trước khi BTC mở phòng ban/pick / tới giờ thi đấu).
 */

const GREY = "text-[#9A9893]";
const RULE = "border-[#2C2B29]";

const formatTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "";

const TeamLineupForm = ({
  matchId,
  team,
  starters,
  token,
}: {
  matchId: number;
  team: LineupTeam;
  starters: number;
  token: string;
}) => {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number[]>(team.lineup);
  const [busy, setBusy] = useState(false);

  const savedKey = team.lineup.join(",");
  useEffect(() => setSelected(savedKey ? savedKey.split(",").map(Number) : []), [savedKey]);

  // Ít nhất `starters` người, tối đa cả đội hình đăng ký
  const toggle = (id: number) =>
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  const saved = team.lineup.length > 0;
  const enough = selected.length >= starters;
  const dirty = [...selected].sort().join(",") !== [...team.lineup].sort().join(",");

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast({ title: success });
      await queryClient.invalidateQueries({ queryKey: ["match-lineups", matchId] });
      await queryClient.invalidateQueries({ queryKey: ["match-linked-players", matchId] });
      await queryClient.invalidateQueries({ queryKey: ["my-pending-lineups"] });
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(() => saveMatchLineup(matchId, team.team_id, selected, token), `Đã chốt đội hình ra sân của ${team.name}`);
  const clear = () => {
    if (!window.confirm("Huỷ chốt đội hình ra sân? Đội sẽ về trạng thái chưa chốt.")) return;
    void run(() => clearMatchLineup(matchId, team.team_id, token), "Đã huỷ chốt — chọn lại rồi chốt trước hạn");
  };

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 border-b-2 border-[#F2F0EB] pb-2">
        <span className="truncate text-base font-extrabold">{team.name}</span>
        <span className={`shrink-0 text-xs tabular-nums ${enough ? GREY : "text-[#FF4A3D]"}`}>
          {selected.length} người · ít nhất {starters}
        </span>
      </div>
      <p className={`m-0 mt-2 text-xs ${saved && !dirty ? "font-bold text-[#F2F0EB]" : GREY}`}>
        {saved
          ? dirty
            ? "Đang sửa — bấm chốt lại để lưu thay đổi."
            : "Đã chốt. Đổi người: bỏ tick rồi tick người khác, hoặc huỷ chốt."
          : "Chưa chốt — đối thủ thấy đội bạn \"Chưa chốt\"."}
      </p>
      <ul className="m-0 list-none p-0">
        {team.roster.map((player) => {
          const id = Number(player.user_id);
          const on = selected.includes(id);
          return (
            <li key={id} className={`border-b ${RULE}`}>
              <button
                type="button"
                disabled={busy}
                aria-pressed={on}
                onClick={() => toggle(id)}
                className="flex min-h-12 w-full items-center gap-3 text-left disabled:opacity-50"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center border ${
                    on ? "border-[#F2F0EB] bg-[#F2F0EB] text-[#0B0B0B]" : RULE
                  }`}
                >
                  {on ? (
                    <svg viewBox="0 0 16 16" className="h-3 w-3">
                      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
                    </svg>
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{memberName(player)}</span>
                  <span className={`block truncate text-xs ${GREY}`}>
                    {String(player.user_id) === String(team.captain_user_id) ? "Đội trưởng · " : ""}
                    {player.riot_account || "Chưa liên kết Riot"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {saved ? (
          <button
            type="button"
            disabled={busy}
            onClick={clear}
            className="min-h-11 px-1 text-sm font-bold text-[#FF4A3D] disabled:opacity-50"
          >
            Huỷ chốt
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={busy || !enough || !dirty}
          onClick={() => void save()}
          className="inline-flex min-h-11 items-center bg-[#F2F0EB] px-5 text-sm font-extrabold text-[#0B0B0B] disabled:opacity-50"
        >
          {saved && !dirty ? "Đã chốt" : saved ? "Chốt lại" : "Chốt đội hình ra sân"}
        </button>
      </div>
    </div>
  );
};

/** Đội không sửa được (đối thủ / người xem): chỉ hiện đã chốt hay chưa — không lộ người ra sân trước trận. */
const TeamLineupStatus = ({ team }: { team: LineupTeam }) => (
  <div className={`flex min-h-12 items-center justify-between gap-3 border-b ${RULE}`}>
    <span className="min-w-0 truncate text-sm font-bold">{team.name ?? "Chưa xác định"}</span>
    <span className={`shrink-0 text-xs font-bold ${team.lineup_set ? "text-[#F2F0EB]" : "text-[#FF4A3D]"}`}>
      {!team.registered ? "Chưa đăng ký giải" : team.lineup_set ? "Đã chốt" : "Chưa chốt"}
    </span>
  </div>
);

/**
 * Giai đoạn chọn người ra sân (trước khi BTC mở phòng ban/pick / tới giờ): mọi người thấy trạng thái 2 đội;
 * đội trưởng / quản lý đội (admin) thấy thêm khung chọn của đội mình.
 */
const MatchLineupEditor = ({ matchId, token }: { matchId: number | null; token: string | null }) => {
  const { user } = useAuth();
  const lineupQuery = useQuery({
    // Cùng key với trang trận (theo người xem) → dùng chung 1 lần tải
    queryKey: ["match-lineups", matchId, user?.id ?? null],
    enabled: Boolean(matchId),
    queryFn: async () => (await getMatchLineups(matchId!, token)).data.data,
  });
  const data = lineupQuery.data;
  if (!matchId || !data || data.locked) return null;

  const editable = token ? data.teams.filter((team) => team.can_edit && team.registered) : [];
  const others = data.teams.filter((team) => !editable.includes(team));

  return (
    <section className="mx-auto w-full max-w-[1440px] px-4 py-6 text-[#F2F0EB] md:px-8" aria-labelledby="lineup-title">
      <div className={`border ${RULE} px-4 py-4 md:px-5`}>
        <h2 id="lineup-title" className="m-0 text-lg font-extrabold">
          Đội hình ra sân
        </h2>
        <p className={`m-0 mt-1 text-sm ${GREY}`}>
          {editable.length
            ? `Chọn ít nhất ${data.starters} người thi đấu trận này (có thể chọn cả đội hình đã đăng ký).`
            : `Hai đội đang chốt ít nhất ${data.starters} người ra sân.`}
          {data.closes_at ? ` Hạn chốt: ${formatTime(data.closes_at)}.` : ""}
          {data.game === "valorant" && data.date_scheduled
            ? ` Ban/pick tự bắt đầu lúc ${formatTime(data.date_scheduled)}.`
            : ""}
        </p>
        {data.forfeit_score ? (
          <p className="m-0 mt-2 text-sm font-bold text-[#FF4A3D]">
            Đội không chốt trước hạn bị xử thua {data.forfeit_score}–0.
          </p>
        ) : null}
        {data.not_open_yet && data.opens_at ? (
          <p className="m-0 mt-3 border-l-2 border-[#F2F0EB] pl-3 text-sm font-bold">
            Mở chốt lúc {formatTime(data.opens_at)}.
          </p>
        ) : editable.length ? (
          <div className={`mt-4 grid gap-6 ${editable.length > 1 ? "md:grid-cols-2" : ""}`}>
            {editable.map((team) => (
              <TeamLineupForm key={team.team_id} matchId={matchId} team={team} starters={data.starters} token={token!} />
            ))}
          </div>
        ) : null}
        {others.length ? (
          <div className="mt-4">
            {others.map((team) => (
              <TeamLineupStatus key={`${team.side}-${team.team_id}`} team={team} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
};
export default MatchLineupEditor;
