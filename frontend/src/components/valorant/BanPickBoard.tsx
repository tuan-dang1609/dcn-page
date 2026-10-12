import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type {
  BanPickFormat,
  BanPickMapState,
  BanPickStepKind,
  DeciderRule,
  Side,
  TeamSlot,
} from "@/api/banpick";
import type { BanPickRoom } from "@/hooks/useBanPickRoom";
import { useValorantAssets } from "@/hooks/useValorantAssets";

/**
 * Bảng ban/pick Valorant cho chủ đội, BTC và khán giả.
 * - Chủ đội: chạm map → nút lớn "Cấm/Chọn …" ở thanh dưới; chọn bên bằng 2 nút Tấn công / Phòng thủ.
 * - BTC: thiết lập khi phòng còn chờ, Bắt đầu, Bỏ qua lượt (ngẫu nhiên), Làm lại.
 * - Hết giờ: server tự chọn ngẫu nhiên.
 */

export type BanPickTeams = Record<TeamSlot, { name: string; tag: string }>;

const GREY = "text-[#9A9893]";
const RULE = "border-[#2C2B29]";
const RED = "text-[#FF4A3D]";

const SIDE_VI: Record<Side, string> = { ATK: "Tấn công", DEF: "Phòng thủ" };
const VERB: Record<BanPickStepKind, string> = { ban: "Cấm", pick: "Chọn", side: "Bên" };

const formatClock = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

const titleCase = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : value;

const Segmented = <T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) => (
  <div className={`inline-flex w-fit max-w-full flex-wrap border ${RULE}`}>
    {options.map((o) => (
      <button
        key={String(o.value)}
        type="button"
        disabled={disabled}
        onClick={() => onChange(o.value)}
        className={`min-h-11 px-3.5 text-sm font-bold disabled:opacity-50 ${
          o.value === value ? "bg-[#F2F0EB] text-[#0B0B0B]" : "text-[#F2F0EB] hover:bg-[#1A1A19]"
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

type Props = {
  room: BanPickRoom;
  teams: BanPickTeams;
  isLoggedIn: boolean;
};

const BanPickBoard = ({ room, teams, isLoggedIn }: Props) => {
  const { session: s, viewerSlot, isAdmin, send, isSending, actionError, clockOffset } = room;
  const location = useLocation();
  const { data: assets } = useValorantAssets();
  const [pending, setPending] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const mapName = useMemo(() => {
    const byCode = new Map((s?.map_pool ?? []).map((m) => [m.map_code, m.map_name]));
    return (code: string) => titleCase(byCode.get(code) ?? code);
  }, [s?.map_pool]);

  // Ảnh map: valorant-api theo tên, không có thì dùng ảnh trong map_pool
  const mapImage = useMemo(() => {
    const byName = new Map<string, string>();
    for (const m of assets?.maps.values() ?? []) {
      if (m.splash) byName.set(m.name.toLowerCase(), m.splash);
    }
    const fallback = new Map((s?.map_pool ?? []).map((m) => [m.map_code, m.image_url]));
    return (code: string) =>
      byName.get(mapName(code).toLowerCase()) ?? fallback.get(code) ?? null;
  }, [assets, mapName, s?.map_pool]);

  const running = s?.status === "running";
  const step = running ? s?.steps[s.step_index] : undefined;
  const myTurn = Boolean(step && viewerSlot && step.team === viewerSlot);
  const deadlineMs = s?.turn_deadline_at ? Date.parse(s.turn_deadline_at) : null;
  const limit = s?.turn_time_limit_seconds ?? 30;
  const remaining =
    running && deadlineMs ? Math.max(0, Math.ceil((deadlineMs - (now + clockOffset)) / 1000)) : limit;
  const sideTargetId = step?.kind === "side" ? s?.side_select_map_id : null;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => setPending(null), [s?.step_index, s?.status]);

  // Báo lượt: tiêu đề tab + rung (điện thoại)
  const prevTurn = useRef(false);
  const baseTitle = useRef<string | null>(null);
  useEffect(() => {
    if (baseTitle.current === null) baseTitle.current = document.title;
    document.title = myTurn ? `● Lượt bạn – Ban/pick` : baseTitle.current;
    if (myTurn && !prevTurn.current) navigator.vibrate?.(150);
    prevTurn.current = myTurn;
  }, [myTurn]);
  useEffect(
    () => () => {
      if (baseTitle.current !== null) document.title = baseTitle.current;
    },
    [],
  );

  if (!s) return null;

  const tag = (slot: TeamSlot) => teams[slot].tag;
  const playedMaps = s.state.maps
    .filter((m) => m.order)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const loginHref = `/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`;

  const act = (payload: { map_id?: string; side?: Side }) => {
    void send({ command: "act", ...payload });
    setPending(null);
  };
  const configure = (config: {
    format?: BanPickFormat;
    countdown_seconds?: number;
    first_team?: TeamSlot;
    decider_rule?: DeciderRule;
  }) => void send({ command: "configure", config });
  const reset = () => {
    if (window.confirm("Làm lại ban/pick từ đầu? Mọi lượt đã chọn sẽ mất.")) {
      void send({ command: "reset" });
    }
  };

  /* ── Thanh trạng thái ── */
  const statusBar = (() => {
    if (s.status === "waiting") {
      return (
        <div>
          <div className="text-lg font-extrabold md:text-xl">Chờ bắt đầu</div>
          <div className={`mt-1 text-sm ${GREY}`}>
            Bắt đầu khi cả hai chủ đội bấm Sẵn sàng, hoặc khi BTC bấm Bắt đầu. Đồng hồ chưa chạy.
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {(["team1", "team2"] as TeamSlot[]).map((slot) => (
              <span key={slot}>
                <strong>{tag(slot)}</strong>{" "}
                <span className={s.ready[slot] ? "" : GREY}>
                  {s.ready[slot] ? "sẵn sàng" : "chưa sẵn sàng"}
                </span>
              </span>
            ))}
          </div>
        </div>
      );
    }
    if (s.status === "done") {
      return (
        <div>
          <div className="text-lg font-extrabold md:text-xl">Ban/pick xong</div>
          <div className={`mt-1 text-sm ${GREY}`}>
            {playedMaps.map((m) => mapName(m.mapId)).join(" → ")}
          </div>
        </div>
      );
    }
    if (!step) return null;
    const label =
      step.kind === "side"
        ? `chọn bên ở ${sideTargetId ? mapName(sideTargetId) : ""}`
        : step.kind === "ban"
          ? "cấm 1 map"
          : "chọn 1 map";
    const low = remaining <= 5;
    return (
      <div className={myTurn ? "bg-[#F2F0EB] text-[#0B0B0B]" : ""}>
        <div className={`flex items-center justify-between gap-4 py-3 ${myTurn ? "px-4 md:px-5" : ""}`}>
          <div className="min-w-0">
            <div className="text-[11px] font-extrabold tracking-[0.08em]">
              {myTurn ? "LƯỢT BẠN" : `LƯỢT ${tag(step.team)}`}
            </div>
            <div className="truncate text-lg font-extrabold md:text-2xl">
              {myTurn
                ? label.charAt(0).toUpperCase() + label.slice(1)
                : `${teams[step.team].name} đang ${label}…`}
            </div>
          </div>
          <div
            className={`shrink-0 text-[32px] font-extrabold leading-none tabular-nums md:text-[44px] ${
              low ? RED : ""
            }`}
          >
            {formatClock(remaining)}
          </div>
        </div>
        <div className={`h-1 ${myTurn ? "bg-[#0B0B0B]/15" : "bg-[#2C2B29]"}`}>
          <div
            className={`h-full ${low ? "bg-[#FF4A3D]" : myTurn ? "bg-[#0B0B0B]" : "bg-[#F2F0EB]"}`}
            style={{ width: `${(remaining / limit) * 100}%`, transition: "width 250ms linear" }}
          />
        </div>
      </div>
    );
  })();

  /* ── Thanh hành động dưới cùng ── */
  const actionBar = (() => {
    if (!isLoggedIn && s.status !== "done") {
      return (
        <Link
          to={loginHref}
          className={`flex min-h-12 items-center justify-center border ${RULE} text-sm font-bold`}
        >
          Chủ đội? Đăng nhập để thao tác
        </Link>
      );
    }
    if (s.status === "waiting" && viewerSlot) {
      const ready = s.ready[viewerSlot];
      return (
        <button
          type="button"
          disabled={isSending}
          onClick={() => void send({ command: "ready", ready: !ready })}
          className={`min-h-12 w-full text-base font-extrabold disabled:opacity-60 ${
            ready ? `border ${RULE} text-[#F2F0EB]` : "bg-[#F2F0EB] text-[#0B0B0B]"
          }`}
        >
          {ready ? "Đã sẵn sàng · bấm để huỷ" : "Sẵn sàng"}
        </button>
      );
    }
    if (!myTurn || !step) return null;
    if (step.kind === "side") {
      return (
        <div>
          <div className={`mb-2 text-sm ${GREY}`}>
            Bên khởi đầu của {tag(viewerSlot!)} ở{" "}
            <strong className="text-[#F2F0EB]">{sideTargetId ? mapName(sideTargetId) : ""}</strong>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["ATK", "DEF"] as Side[]).map((side) => (
              <button
                key={side}
                type="button"
                disabled={isSending}
                onClick={() => act({ side })}
                className="min-h-12 bg-[#F2F0EB] text-base font-extrabold text-[#0B0B0B] hover:opacity-90 disabled:opacity-60"
              >
                {SIDE_VI[side]}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (!pending) {
      return (
        <div className={`flex min-h-12 items-center justify-center text-sm ${GREY}`}>
          Chạm một map để {step.kind === "ban" ? "cấm" : "chọn"}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <button
          type="button"
          onClick={() => setPending(null)}
          className={`min-h-12 border ${RULE} px-4 text-sm font-bold`}
        >
          Bỏ
        </button>
        <button
          type="button"
          disabled={isSending}
          onClick={() => act({ map_id: pending })}
          className={`min-h-12 text-base font-extrabold text-[#0B0B0B] disabled:opacity-60 ${
            step.kind === "ban" ? "bg-[#FF4A3D]" : "bg-[#F2F0EB]"
          }`}
        >
          {step.kind === "ban" ? "Cấm" : "Chọn"} {mapName(pending)}
        </button>
      </div>
    );
  })();

  const selectable = myTurn && step && step.kind !== "side";

  const mapStatus = (m: BanPickMapState, isPending: boolean) => {
    if (m.status === "banned") {
      return (
        <span className={RED}>
          Cấm · {m.actionBy ? tag(m.actionBy) : ""}
          {m.random ? " · ngẫu nhiên" : ""}
        </span>
      );
    }
    if (m.status === "picked" || m.status === "decider") {
      const chooser = m.sideChosenBy;
      return (
        <>
          <span className="font-extrabold">
            Map {m.order} · {m.status === "decider" ? "Quyết định" : `${m.actionBy ? tag(m.actionBy) : ""} chọn`}
          </span>
          <br />
          <span className={GREY}>
            {m.side && chooser
              ? `${tag(chooser)} ${SIDE_VI[m.side[chooser]]}${m.sideRandom ? " · ngẫu nhiên" : ""}`
              : "Chưa chọn bên"}
          </span>
        </>
      );
    }
    return isPending ? <span className="font-extrabold">Đang chọn</span> : null;
  };

  return (
    <div className="pb-36">
      {statusBar}

      {actionError ? <p className={`m-0 mt-3 text-sm ${RED}`}>{actionError}</p> : null}

      {/* Thứ tự lượt — breadcrumb dạng thanh tiến trình, ngăn bằng chevron */}
      {s.steps.length ? (
        <nav aria-label="Thứ tự ban/pick" className={`mt-4 overflow-x-auto border-y ${RULE}`}>
          <ol className="m-0 flex min-w-max list-none items-stretch p-0">
            {s.steps.map((st, i) => {
              const done = s.status === "done" || i < s.step_index;
              const current = running && i === s.step_index;
              const entry = s.state.actionLog.find((log) => log.step === i);
              const result = entry
                ? entry.action === "side_select"
                  ? entry.side
                    ? SIDE_VI[entry.side]
                    : ""
                  : mapName(entry.mapId)
                : "";
              return (
                <li key={i} className="flex items-stretch">
                  <div
                    aria-current={current ? "step" : undefined}
                    className={`flex min-h-12 items-center gap-2.5 px-3.5 text-sm ${
                      current ? "bg-[#F2F0EB] text-[#0B0B0B]" : ""
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center border text-[11px] font-extrabold tabular-nums ${
                        current
                          ? "border-[#0B0B0B]"
                          : done
                            ? "border-[#F2F0EB] bg-[#F2F0EB] text-[#0B0B0B]"
                            : `${RULE} ${GREY}`
                      }`}
                    >
                      {done ? (
                        <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
                          <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span className="whitespace-nowrap leading-tight">
                      <span className={`font-bold ${st.kind === "ban" && !current ? RED : ""}`}>
                        {VERB[st.kind]}
                      </span>{" "}
                      <span className="font-extrabold">{tag(st.team)}</span>
                      {done && result ? (
                        <span className={`block text-xs ${GREY}`}>{result}</span>
                      ) : null}
                    </span>
                  </div>
                  {i < s.steps.length - 1 ? (
                    <svg
                      viewBox="0 0 12 48"
                      preserveAspectRatio="none"
                      className="h-auto w-3 shrink-0 self-stretch text-[#2C2B29]"
                      aria-hidden="true"
                    >
                      {/* Bước hiện tại: tô cả mũi chevron → khối sáng thành hình mũi tên liền */}
                      {current ? <path d="M0 -1 L11 24 L0 49 Z" fill="#F2F0EB" /> : null}
                      <path d="M0 -1 L11 24 L0 49" fill="none" stroke="currentColor" vectorEffect="non-scaling-stroke" />
                    </svg>
                  ) : current ? (
                    // Bước cuối mà đang chạy: vẫn có mũi
                    <svg
                      viewBox="0 0 12 48"
                      preserveAspectRatio="none"
                      className="h-auto w-3 shrink-0 self-stretch"
                      aria-hidden="true"
                    >
                      <path d="M0 -1 L11 24 L0 49 Z" fill="#F2F0EB" />
                    </svg>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      {/* Bản đồ */}
      <div className="mt-6 grid grid-cols-1 border-t border-[#2C2B29] lg:grid-cols-2 lg:gap-x-8">
        {s.state.maps.map((m) => {
          const image = mapImage(m.mapId);
          const isPending = pending === m.mapId;
          const canTap = Boolean(selectable && m.status === "available");
          return (
            <button
              key={m.mapId}
              type="button"
              disabled={!canTap}
              onClick={() => setPending(isPending ? null : m.mapId)}
              className={`flex min-h-16 w-full items-stretch gap-3 border-b border-l-[3px] py-2 pl-2 text-left ${RULE} ${
                isPending || sideTargetId === m.mapId
                  ? "border-l-[#F2F0EB] bg-[#F2F0EB]/[0.07]"
                  : "border-l-transparent"
              } ${canTap ? "hover:bg-[#151514]" : "cursor-default"}`}
            >
              <div className="relative w-24 shrink-0 overflow-hidden bg-[#151514] md:w-36">
                {image ? (
                  <img
                    src={image}
                    alt=""
                    className={`absolute inset-0 h-full w-full object-cover ${
                      m.status === "banned" ? "opacity-25 grayscale" : ""
                    }`}
                  />
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-1">
                <span
                  className={`truncate text-base font-extrabold md:text-lg ${
                    m.status === "banned" ? `${GREY} line-through` : ""
                  }`}
                >
                  {mapName(m.mapId)}
                </span>
                <span className="shrink-0 text-right text-xs leading-snug">
                  {mapStatus(m, isPending)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bảng BTC */}
      {isAdmin ? (
        <section className="mt-8 border-t border-[#2C2B29] pt-4">
          <h2 className="m-0 text-lg font-extrabold">Bảng BTC</h2>
          {s.status === "waiting" ? (
            <div className="mt-3 grid gap-4">
              <div className="grid gap-1.5">
                <span className={`text-xs ${GREY}`}>Thể thức</span>
                <Segmented
                  value={s.format}
                  disabled={isSending}
                  options={[
                    { value: "BO1", label: "Bo1" },
                    { value: "BO3", label: "Bo3" },
                    { value: "BO5", label: "Bo5" },
                  ]}
                  onChange={(format) => configure({ format })}
                />
              </div>
              <div className="grid gap-1.5">
                <span className={`text-xs ${GREY}`}>Thời gian mỗi lượt</span>
                <Segmented
                  value={limit}
                  disabled={isSending}
                  options={[20, 30, 45, 60, 90].map((v) => ({ value: v, label: `${v}s` }))}
                  onChange={(countdown_seconds) => configure({ countdown_seconds })}
                />
              </div>
              <div className="grid gap-1.5">
                <span className={`text-xs ${GREY}`}>Đội cấm trước</span>
                <Segmented
                  value={s.first_team}
                  disabled={isSending}
                  options={(["team1", "team2"] as TeamSlot[]).map((v) => ({ value: v, label: tag(v) }))}
                  onChange={(first_team) => configure({ first_team })}
                />
              </div>
              <div className="grid gap-1.5">
                <span className={`text-xs ${GREY}`}>Bên ở map quyết định</span>
                <Segmented
                  value={s.decider_rule}
                  disabled={isSending}
                  options={[
                    { value: "lastActor", label: "Đội cấm/chọn cuối" },
                    { value: "other", label: "Đội còn lại" },
                  ]}
                  onChange={(decider_rule) => configure({ decider_rule })}
                />
              </div>
              <div>
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => void send({ command: "start" })}
                  className="min-h-12 bg-[#F2F0EB] px-6 text-base font-extrabold text-[#0B0B0B] disabled:opacity-60"
                >
                  Bắt đầu ban/pick
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {running ? (
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => void send({ command: "skip" })}
                  className={`min-h-11 border ${RULE} px-4 text-sm font-bold disabled:opacity-60`}
                >
                  Bỏ qua lượt (ngẫu nhiên)
                </button>
              ) : null}
              <button
                type="button"
                disabled={isSending}
                onClick={reset}
                className="min-h-11 border border-[#FF4A3D] px-4 text-sm font-bold text-[#FF4A3D] disabled:opacity-60"
              >
                Làm lại
              </button>
            </div>
          )}
        </section>
      ) : null}

      {/* Lịch sử */}
      {s.state.actionLog.length ? (
        <section className="mt-8">
          <h2 className="m-0 border-b border-[#2C2B29] pb-2 text-lg font-extrabold">Lịch sử</h2>
          <ol className="m-0 list-none p-0">
            {s.state.actionLog.map((e, i) => (
              <li key={i} className={`flex gap-3 border-b ${RULE} py-2 text-sm`}>
                <span className={`w-5 tabular-nums ${GREY}`}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  {tag(e.team)}{" "}
                  {e.action === "side_select"
                    ? `chọn ${e.side ? SIDE_VI[e.side] : ""} ở ${mapName(e.mapId)}`
                    : `${e.action === "ban" ? "cấm" : "chọn"} ${mapName(e.mapId)}`}
                </span>
                {e.random ? <span className={`shrink-0 text-xs ${RED}`}>ngẫu nhiên</span> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {actionBar ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#2C2B29] bg-[#0B0B0B]">
          <div className="mx-auto w-full max-w-xl px-4 py-3">{actionBar}</div>
        </div>
      ) : null}
    </div>
  );
};

export default BanPickBoard;
