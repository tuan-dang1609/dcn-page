import { useEffect, useMemo, useState } from "react";
import { toast } from "@/hooks/use-toast";
import {
  getBracketSlots,
  pairSwissNextRound,
  saveBracketSlots,
  type BracketSlotMatch,
  type BracketSlotsData,
  type BracketSlotUpdate,
} from "@/api/tournaments";

/**
 * Xếp đội vào từng cặp đấu + đặt giờ / BO từng trận của 1 bracket (kể cả bracket tạo từ template trống).
 * Slot đầu vào chọn bằng dropdown đội đã đăng ký giải; slot nhận đội thắng từ trận khác chỉ hiển thị nguồn.
 * Swiss: chỉ vòng 1 (0-0) chọn tay; vòng sau bấm "Ghép cặp" để hệ thống ghép theo thành tích.
 */

const GREY = "text-[#9A9893]";
const RULE = "border-[#2C2B29]";
const FIELD_BASE = `min-h-11 border ${RULE} bg-[#0B0B0B] px-2 text-sm text-[#F2F0EB] disabled:opacity-50`;
const FIELD = `${FIELD_BASE} w-full`;
const BEST_OF = [1, 2, 3, 5, 7];

type Draft = { team_a_id: number | null; team_b_id: number | null; date: string; best_of: number };

const pad = (value: number) => String(value).padStart(2, "0");
const toLocalInput = (value: string | Date | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const draftOf = (match: BracketSlotMatch): Draft => ({
  team_a_id: match.team_a_id,
  team_b_id: match.team_b_id,
  date: toLocalInput(match.date_scheduled),
  best_of: match.best_of ?? 1,
});

const HOURS = Array.from({ length: 24 }, (_, hour) => pad(hour));
const MINUTES = Array.from({ length: 12 }, (_, index) => pad(index * 5));

/**
 * Ngày + giờ 24h. Không dùng datetime-local: máy để định dạng 12 giờ bắt chọn thêm SA/CH,
 * thiếu là cả ô rỗng. Giá trị "YYYY-MM-DDTHH:mm" (giờ máy), chọn ngày trước giờ mặc định 19:00.
 */
const DateTime24 = ({
  id,
  label,
  value,
  onChange,
  className = "",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) => {
  const [date = "", time = ""] = value.split("T");
  const [hour = "", minute = ""] = time.split(":");
  const emit = (nextDate: string, nextHour: string, nextMinute: string) =>
    onChange(nextDate ? `${nextDate}T${nextHour || "19"}:${nextMinute || "00"}` : "");
  const minuteOptions = minute && !MINUTES.includes(minute) ? [...MINUTES, minute].sort() : MINUTES;

  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1 ${className}`} role="group" aria-label={label}>
      <input
        id={id}
        type="date"
        aria-label={`${label} — ngày`}
        className={FIELD}
        value={date}
        onChange={(event) => emit(event.target.value, hour, minute)}
      />
      <select
        aria-label={`${label} — giờ`}
        className={`${FIELD_BASE} w-16`}
        value={hour}
        disabled={!date}
        onChange={(event) => emit(date, event.target.value, minute)}
      >
        {!hour ? <option value="">--</option> : null}
        {HOURS.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} — phút`}
        className={`${FIELD_BASE} w-16`}
        value={minute}
        disabled={!date}
        onChange={(event) => emit(date, hour, event.target.value)}
      >
        {!minute ? <option value="">--</option> : null}
        {minuteOptions.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );
};

const shuffle = <T,>(items: T[]) => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const BracketSlotEditor = ({ bracketId }: { bracketId: number }) => {
  const [data, setData] = useState<BracketSlotsData | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pairingRound, setPairingRound] = useState<number | null>(null);
  const [savingMatchId, setSavingMatchId] = useState<number | null>(null);
  const [fillStart, setFillStart] = useState("");
  const [fillGap, setFillGap] = useState("60");
  const [fillMode, setFillMode] = useState<"round" | "sequential">("round");

  const applyData = (next: BracketSlotsData) => {
    setData(next);
    setDrafts(Object.fromEntries(next.matches.map((match) => [match.id, draftOf(match)])));
  };

  const pairRound = async (round: number) => {
    if (!data) return;
    setPairingRound(round);
    try {
      await pairSwissNextRound(data.bracket.tournament_id, bracketId, { round_number: round });
      const response = await getBracketSlots(bracketId);
      applyData(response.data.data);
      toast({ title: `Đã ghép cặp vòng ${round}` });
    } catch (error: any) {
      toast({
        title: `Chưa ghép được vòng ${round}`,
        description: error?.response?.data?.error || error?.message,
        variant: "destructive",
      });
    } finally {
      setPairingRound(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBracketSlots(bracketId)
      .then((response) => {
        if (!cancelled) applyData(response.data.data);
      })
      .catch((error) => {
        if (cancelled) return;
        setData(null);
        toast({
          title: "Không tải được trận của bracket",
          description: error?.response?.data?.error || error?.message,
          variant: "destructive",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bracketId]);

  const teams = data?.teams ?? [];
  const teamLabel = (teamId: number | null) => {
    if (teamId === null) return null;
    const team = teams.find((item) => item.team_id === teamId);
    return team?.short_name?.trim() || team?.name?.trim() || `Đội #${teamId}`;
  };

  const rounds = useMemo(() => {
    const map = new Map<number, BracketSlotMatch[]>();
    for (const match of data?.matches ?? []) {
      map.set(match.round_number, [...(map.get(match.round_number) ?? []), match]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [data]);

  /** Đội đang đứng ở slot đầu vào nào (để dropdown ẩn đội đã xếp chỗ khác). */
  const usedTeams = useMemo(() => {
    const used = new Map<number, string>();
    for (const match of data?.matches ?? []) {
      const draft = drafts[match.id];
      if (!draft) continue;
      if (match.slot_a_editable && draft.team_a_id !== null) used.set(draft.team_a_id, `${match.id}:A`);
      if (match.slot_b_editable && draft.team_b_id !== null) used.set(draft.team_b_id, `${match.id}:B`);
    }
    return used;
  }, [data, drafts]);

  const changes = useMemo(() => {
    const list: BracketSlotUpdate[] = [];
    for (const match of data?.matches ?? []) {
      const draft = drafts[match.id];
      if (!draft) continue;
      const original = draftOf(match);
      const change: BracketSlotUpdate = { id: match.id };
      if (draft.team_a_id !== original.team_a_id) change.team_a_id = draft.team_a_id;
      if (draft.team_b_id !== original.team_b_id) change.team_b_id = draft.team_b_id;
      if (draft.date !== original.date) change.date_scheduled = draft.date ? new Date(draft.date).toISOString() : null;
      if (draft.best_of !== original.best_of) change.best_of = draft.best_of;
      if (Object.keys(change).length > 1) list.push(change);
    }
    return list;
  }, [data, drafts]);

  const setDraft = (matchId: number, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [matchId]: { ...prev[matchId], ...patch } }));

  const randomFill = () => {
    if (!data) return;
    const free = shuffle(teams.map((team) => team.team_id).filter((id) => !usedTeams.has(id)));
    const next = { ...drafts };
    for (const match of data.matches) {
      const draft = { ...next[match.id] };
      if (match.slot_a_editable && draft.team_a_id === null && free.length) draft.team_a_id = free.shift()!;
      if (match.slot_b_editable && draft.team_b_id === null && free.length) draft.team_b_id = free.shift()!;
      next[match.id] = draft;
    }
    setDrafts(next);
  };

  const fillTimes = () => {
    const start = fillStart ? new Date(fillStart) : null;
    const gap = Number(fillGap);
    if (!start || Number.isNaN(start.getTime()) || !Number.isFinite(gap) || gap < 0) {
      toast({ title: "Nhập giờ trận đầu và số phút cách nhau", variant: "destructive" });
      return;
    }
    const next = { ...drafts };
    let step = 0;
    for (const [, matches] of rounds) {
      for (const match of matches) {
        next[match.id] = { ...next[match.id], date: toLocalInput(new Date(start.getTime() + step * gap * 60_000)) };
        if (fillMode === "sequential") step += 1;
      }
      if (fillMode === "round") step += 1;
    }
    setDrafts(next);
  };

  /** Lưu 1 trận: các trận khác giữ nguyên phần đang sửa dở. */
  const saveOne = async (matchId: number) => {
    const change = changes.find((item) => item.id === matchId);
    if (!change || !data) return;
    setSavingMatchId(matchId);
    try {
      const response = await saveBracketSlots(bracketId, [change]);
      const next = { ...response.data.data, teams: data.teams };
      const saved = next.matches.find((match) => match.id === matchId);
      setData(next);
      if (saved) setDrafts((prev) => ({ ...prev, [matchId]: draftOf(saved) }));
      toast({ title: `Đã lưu vòng ${saved?.round_number ?? "?"} · trận ${saved?.match_no ?? "?"}` });
    } catch (error: any) {
      toast({
        title: "Lưu thất bại",
        description: error?.response?.data?.error || error?.message,
        variant: "destructive",
      });
    } finally {
      setSavingMatchId(null);
    }
  };

  const save = async () => {
    if (!changes.length) return;
    setSaving(true);
    try {
      const response = await saveBracketSlots(bracketId, changes);
      applyData({ ...response.data.data, teams: data?.teams });
      toast({ title: response.data.message });
    } catch (error: any) {
      toast({
        title: "Lưu thất bại",
        description: error?.response?.data?.error || error?.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <p className={`m-0 text-sm ${GREY}`}>Đang tải trận…</p>;
  if (!data) return null;

  const isSwiss = data.bracket.format_type === "swiss";

  const slot = (match: BracketSlotMatch, side: "A" | "B") => {
    const editable = side === "A" ? match.slot_a_editable : match.slot_b_editable;
    const feeder = side === "A" ? match.feeder_a : match.feeder_b;
    const field = side === "A" ? "team_a_id" : "team_b_id";
    const value = drafts[match.id]?.[field] ?? null;
    const selectId = `slot-${match.id}-${side}`;

    if (!editable) {
      return (
        <div className={`flex min-h-11 items-center border ${RULE} px-2 text-sm`}>
          {teamLabel(value) ?? (
            <span className={GREY}>
              {feeder
                ? `Thắng V${feeder.round_number} · T${feeder.match_no}`
                : isSwiss && match.round_number > 1
                  ? "Ghép theo thành tích"
                  : "Chờ kết quả vòng trước"}
            </span>
          )}
        </div>
      );
    }

    return (
      <select
        id={selectId}
        aria-label={`Vòng ${match.round_number} trận ${match.match_no} đội ${side}`}
        className={FIELD}
        value={value ?? ""}
        onChange={(event) => setDraft(match.id, { [field]: event.target.value ? Number(event.target.value) : null })}
      >
        <option value="">— Chưa xếp —</option>
        {teams.map((team) => {
          const usedAt = usedTeams.get(team.team_id);
          const takenElsewhere = usedAt !== undefined && usedAt !== `${match.id}:${side}`;
          return (
            <option key={team.team_id} value={team.team_id} disabled={takenElsewhere}>
              {team.short_name?.trim() || team.name?.trim() || `Đội #${team.team_id}`}
              {takenElsewhere ? " (đã xếp)" : ""}
            </option>
          );
        })}
      </select>
    );
  };

  const editableSlots = data.matches.reduce(
    (count, match) => count + Number(match.slot_a_editable) + Number(match.slot_b_editable),
    0,
  );

  return (
    <section className={`space-y-4 border ${RULE} bg-[#0B0B0B] p-4 text-[#F2F0EB]`} aria-labelledby={`slots-${bracketId}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`slots-${bracketId}`} className="m-0 text-base font-extrabold">
          Xếp đội & giờ thi đấu · {data.bracket.name || `Bracket #${bracketId}`}
        </h3>
        <span className={`text-xs ${GREY}`}>
          {data.matches.length} trận · {editableSlots} slot chọn đội · {teams.length} đội đã đăng ký
        </span>
      </div>

      <div className={`grid gap-3 border-y ${RULE} py-3 md:grid-cols-[1fr_auto]`}>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-bold" htmlFor={`fill-start-${bracketId}`}>
            Giờ trận đầu
            <DateTime24
              id={`fill-start-${bracketId}`}
              label="Giờ trận đầu"
              className="w-72"
              value={fillStart}
              onChange={setFillStart}
            />
          </label>
          <label className="grid gap-1 text-xs font-bold" htmlFor={`fill-gap-${bracketId}`}>
            Cách nhau (phút)
            <input
              id={`fill-gap-${bracketId}`}
              type="number"
              min={0}
              className={`${FIELD_BASE} w-28`}
              value={fillGap}
              onChange={(event) => setFillGap(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs font-bold" htmlFor={`fill-mode-${bracketId}`}>
            Cách xếp
            <select
              id={`fill-mode-${bracketId}`}
              className={`${FIELD_BASE} w-48`}
              value={fillMode}
              onChange={(event) => setFillMode(event.target.value as "round" | "sequential")}
            >
              <option value="round">Cùng giờ trong 1 vòng</option>
              <option value="sequential">Lần lượt từng trận</option>
            </select>
          </label>
          <button type="button" onClick={fillTimes} className={`min-h-11 border ${RULE} px-4 text-sm font-bold`}>
            Điền giờ
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={randomFill}
            disabled={!editableSlots || !teams.length}
            className={`min-h-11 border ${RULE} px-4 text-sm font-bold disabled:opacity-50`}
          >
            Xếp ngẫu nhiên slot trống
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {rounds.map(([round, matches]) => (
          <div key={round} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={`m-0 text-xs font-bold uppercase tracking-widest ${GREY}`}>
                Vòng {round}
                {data.round_labels?.[round] ? ` · ${data.round_labels[round]}` : ""}
              </p>
              {isSwiss && round > 1 && matches.every((match) => match.team_a_id === null && match.team_b_id === null) ? (
                <button
                  type="button"
                  disabled={pairingRound !== null || changes.length > 0}
                  title={changes.length ? "Lưu thay đổi trước khi ghép cặp" : undefined}
                  onClick={() => void pairRound(round)}
                  className={`min-h-11 border ${RULE} px-4 text-sm font-bold disabled:opacity-50`}
                >
                  {pairingRound === round ? "Đang ghép…" : "Ghép cặp vòng này"}
                </button>
              ) : null}
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {matches.map((match) => {
                const draft = drafts[match.id];
                const status = String(match.status ?? "").toLowerCase();
                const played = match.score_a !== null && match.score_b !== null && status === "completed";
                const dirty = changes.some((change) => change.id === match.id);
                return (
                  <div
                    key={match.id}
                    className={`grid gap-2 border p-3 ${dirty ? "border-[#FF4A3D]" : RULE}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-extrabold">Trận {match.match_no}</span>
                      <span className={`text-xs ${GREY}`}>
                        #{match.id}
                        {played ? ` · ${match.score_a}–${match.score_b}` : status && status !== "scheduled" ? ` · ${status}` : ""}
                      </span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      {slot(match, "A")}
                      <span className={`text-xs font-bold ${GREY}`}>vs</span>
                      {slot(match, "B")}
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                      <DateTime24
                        id={`date-${match.id}`}
                        label={`Giờ thi đấu vòng ${round} trận ${match.match_no}`}
                        value={draft?.date ?? ""}
                        onChange={(next) => setDraft(match.id, { date: next })}
                      />
                      <select
                        aria-label={`Số ván vòng ${round} trận ${match.match_no}`}
                        id={`bo-${match.id}`}
                        className={`${FIELD_BASE} w-24`}
                        value={draft?.best_of ?? 1}
                        onChange={(event) => setDraft(match.id, { best_of: Number(event.target.value) })}
                      >
                        {BEST_OF.map((value) => (
                          <option key={value} value={value}>
                            BO{value}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!dirty || saving || savingMatchId !== null}
                        onClick={() => void saveOne(match.id)}
                        aria-label={`Lưu vòng ${round} trận ${match.match_no}`}
                        className={`min-h-11 px-4 text-sm font-extrabold disabled:opacity-40 ${
                          dirty ? "bg-[#F2F0EB] text-[#0B0B0B]" : `border ${RULE}`
                        }`}
                      >
                        {savingMatchId === match.id ? "Đang lưu…" : "Lưu"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className={`sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t ${RULE} bg-[#0B0B0B] py-3`}>
        <span className={`text-sm ${GREY}`}>{changes.length ? `${changes.length} trận chưa lưu` : "Không có thay đổi"}</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!changes.length || saving}
            onClick={() => applyData(data)}
            className={`min-h-11 border ${RULE} px-4 text-sm font-bold disabled:opacity-50`}
          >
            Bỏ thay đổi
          </button>
          <button
            type="button"
            disabled={!changes.length || saving || savingMatchId !== null}
            onClick={() => void save()}
            className="min-h-11 bg-[#F2F0EB] px-5 text-sm font-extrabold text-[#0B0B0B] disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : `Lưu tất cả${changes.length ? ` (${changes.length})` : ""}`}
          </button>
        </div>
      </div>
    </section>
  );
};

export default BracketSlotEditor;
