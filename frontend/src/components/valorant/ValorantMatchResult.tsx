import { Fragment, useState } from "react";
import type {
  ValorantApiMatchData,
  ValorantApiPlayer,
  ValorantApiRoundResult,
} from "@/api/valorant";
import {
  fallbackMapName,
  useValorantAssets,
} from "@/hooks/useValorantAssets";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Phần thân trang kết quả trận Valorant (design/Valorant.dc.html):
 * tab bản đồ → ảnh bản đồ + tỉ số theo hiệp → diễn biến từng vòng → bảng tuyển thủ.
 * Màn nhỏ (< lg) chuyển sang dạng thẻ như ValorantMobile.dc.html.
 * Cột ADR / HS% / Hạ gục đầu tự ẩn nếu nguồn dữ liệu không có (toàn 0).
 */

export type ValorantSideTeam = {
  name: string;
  tag: string;
  /** teamId trong dữ liệu Riot: "Red" | "Blue". */
  apiTeamId: string;
};

type Props = {
  games: ValorantApiMatchData[];
  team1: ValorantSideTeam;
  team2: ValorantSideTeam;
};

const GREY = "text-[#9A9893]";
const RULE = "border-[#2C2B29]";

const same = (a?: string | null, b?: string | null) =>
  String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

const ROUND_TYPE: Record<string, { mark: string; label: string }> = {
  elimination: { mark: "H", label: "hạ gục toàn đội" },
  detonate: { mark: "N", label: "Spike phát nổ" },
  defuse: { mark: "G", label: "gỡ Spike" },
};
/**
 * roundCeremony của Riot — vòng đáng chú ý (banner hiện trong game).
 * CeremonyDefault = vòng bình thường, không đánh dấu.
 */
const CEREMONY: Record<string, { code: string; label: string }> = {
  ceremonyace: { code: "ACE", label: "Ace — một người hạ cả 5 đối thủ" },
  ceremonyteamace: { code: "TA", label: "Team Ace — cả 5 người đều có hạ gục" },
  ceremonyflawless: { code: "FL", label: "Flawless — thắng không mất người nào" },
  ceremonythrifty: { code: "TH", label: "Thrifty — thắng dù trang bị rẻ hơn hẳn" },
  ceremonyclutch: { code: "CL", label: "Clutch — người sống sót cuối cùng lật kèo" },
  ceremonycloser: { code: "CS", label: "Closer" },
};
const ceremonyOf = (round: ValorantApiRoundResult) => {
  const key = String(round.roundCeremony ?? "").toLowerCase();
  if (!key || key === "ceremonydefault") return null;
  if (CEREMONY[key]) return CEREMONY[key];
  const name = String(round.roundCeremony).replace(/^Ceremony/, "");
  return { code: name.slice(0, 3).toUpperCase(), label: name };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
const PATH_RE = /^\/Game\//i;

/** Riot để roundResultCode rỗng khi hết giờ ("Round timer expired") → dựa vào roundResult. */
const roundType = (round: ValorantApiRoundResult) => {
  const byCode = ROUND_TYPE[String(round.roundResultCode ?? "").toLowerCase()];
  if (byCode) return byCode;
  const text = String(round.roundResult ?? "");
  if (!text || /timer|time/i.test(text)) return { mark: "T", label: "hết giờ" };
  if (/surrender/i.test(text)) return { mark: "Đ", label: "đối thủ đầu hàng" };
  return { mark: "·", label: text };
};

const sideLabel = (role?: string | null) =>
  same(role, "attacker") ? "Tấn công" : same(role, "defender") ? "Phòng thủ" : "";
const flipRole = (role?: string | null) =>
  same(role, "attacker") ? "Defender" : same(role, "defender") ? "Attacker" : "";

/**
 * Nguồn cũ trả "acs" là tổng điểm cả trận → chia số vòng.
 * Nhận diện theo cả trận (ACS thật không vượt ~600) để mọi người được xử lý như nhau.
 */
const toAcs = (raw: number | undefined, rounds: number, isTotal: boolean) => {
  const value = Number(raw ?? 0);
  return Math.round(isTotal && rounds ? value / rounds : value);
};

const buildGame = (
  game: ValorantApiMatchData,
  team1: ValorantSideTeam,
  team2: ValorantSideTeam,
) => {
  const rounds = [...(game.roundResults ?? [])].sort(
    (a, b) => Number(a.roundNum ?? 0) - Number(b.roundNum ?? 0),
  );
  const R = rounds.length;
  const scoreOf = (team: ValorantSideTeam) => {
    const row = game.teams?.find((t) => same(t.teamId, team.apiTeamId));
    return Number(
      row?.roundsWon ??
        row?.numPoints ??
        rounds.filter((r) => same(r.winningTeam, team.apiTeamId)).length,
    );
  };
  const s1 = scoreOf(team1);
  const s2 = scoreOf(team2);

  // Phe của team1 mỗi hiệp: suy từ vòng đầu tiên của hiệp
  const team1RoleAt = (from: number) => {
    const first = rounds[from];
    if (!first) return "";
    return same(first.winningTeam, team1.apiTeamId)
      ? String(first.winningTeamRole ?? "")
      : flipRole(first.winningTeamRole);
  };
  const role1H1 = team1RoleAt(0);
  const role1H2 = team1RoleAt(12);
  const count = (from: number, to: number, team: ValorantSideTeam) =>
    rounds.slice(from, to).filter((r) => same(r.winningTeam, team.apiTeamId))
      .length;
  const hasOT = R > 24;

  const halves = [
    {
      team: team1,
      h1: count(0, 12, team1),
      s1: sideLabel(role1H1),
      h2: count(12, 24, team1),
      s2: sideLabel(role1H2),
      ot: hasOT ? String(count(24, R, team1)) : "–",
      total: s1,
      won: s1 > s2,
    },
    {
      team: team2,
      h1: count(0, 12, team2),
      s1: sideLabel(flipRole(role1H1)),
      h2: count(12, 24, team2),
      s2: sideLabel(flipRole(role1H2)),
      ot: hasOT ? String(count(24, R, team2)) : "–",
      total: s2,
      won: s2 > s1,
    },
  ];

  const acsIsTotal = (game.players ?? []).some(
    (p) => Number(p.stats?.acs ?? 0) > 999,
  );
  const playersOf = (team: ValorantSideTeam) =>
    (game.players ?? [])
      .filter((p) => same(p.teamId, team.apiTeamId))
      .map((p: ValorantApiPlayer) => {
        const st = p.stats ?? {};
        return {
          key: `${p.gameName}#${p.tagLine}`,
          name: p.gameName || "—",
          tagLine: p.tagLine,
          agentId: String(p.characterId ?? p.characterName ?? "").toLowerCase(),
          // Backend mới đã dịch sẵn tên/ảnh; dữ liệu cũ characterName là UUID
          agentName:
            p.characterName && !UUID_RE.test(p.characterName) ? p.characterName : null,
          agentIcon: p.imgCharacter ?? null,
          acs: toAcs(st.acs, R, acsIsTotal),
          k: Number(st.kills ?? 0),
          d: Number(st.deaths ?? 0),
          a: Number(st.assists ?? 0),
          adr: Number(st.adr ?? 0),
          hs: Number(st.headshotPercentage ?? 0),
          fk: Number(st.firstKills ?? 0),
        };
      })
      .sort((a, b) => b.acs - a.acs);

  const players1 = playersOf(team1);
  const players2 = playersOf(team2);
  // MVP: ACS cao nhất của đội thắng bản đồ
  const mvpKey = (s1 > s2 ? players1 : s2 > s1 ? players2 : [])[0]?.key ?? null;

  return {
    mapUrl: game.matchInfo?.mapId ?? game.matchInfo?.mapName ?? "",
    mapLabel:
      game.matchInfo?.mapName && !PATH_RE.test(game.matchInfo.mapName)
        ? game.matchInfo.mapName
        : null,
    rounds,
    R,
    s1,
    s2,
    halves,
    players1,
    players2,
    mvpKey,
  };
};

const ValorantMatchResult = ({ games, team1, team2 }: Props) => {
  const [active, setActive] = useState(0);
  const { data: assets } = useValorantAssets();

  const views = games.map((game) => buildGame(game, team1, team2));
  const view = views[active] ?? views[0];
  if (!view) {
    return (
      <p className={`border-t-2 border-[#F2F0EB] py-4 text-sm ${GREY}`}>
        Chưa có dữ liệu bản đồ cho trận này.
      </p>
    );
  }

  const mapNameOf = (v: { mapUrl: string; mapLabel: string | null }) =>
    v.mapLabel ??
    assets?.maps.get(v.mapUrl.toLowerCase())?.name ??
    fallbackMapName(v.mapUrl);
  const mapAsset = assets?.maps.get(view.mapUrl.toLowerCase());
  const mapName = mapNameOf(view);
  const allPlayers = [...view.players1, ...view.players2];
  const showAdr = allPlayers.some((p) => p.adr > 0);
  const showHs = allPlayers.some((p) => p.hs > 0);
  const showFk = allPlayers.some((p) => p.fk > 0);

  const statCols = [
    { key: "acs", label: "ACS" },
    { key: "kda", label: "K / D / A" },
    { key: "pm", label: "+/–" },
    ...(showAdr ? [{ key: "adr", label: "ADR" }] : []),
    ...(showHs ? [{ key: "hs", label: "HS%" }] : []),
    ...(showFk ? [{ key: "fk", label: "Hạ gục đầu" }] : []),
  ];
  const tableCols = `minmax(0,240px) minmax(0,200px) repeat(${statCols.length}, minmax(0,1fr))`;
  const halfCols = "minmax(0,1fr) 96px 96px 96px 72px";

  return (
    <div className="text-[#F2F0EB]">
      {/* Tab bản đồ */}
      <div
        role="tablist"
        aria-label="Chọn bản đồ"
        className="grid border border-[#F2F0EB]"
        style={{ gridTemplateColumns: `repeat(${views.length}, minmax(0, 1fr))` }}
      >
        {views.map((v, i) => {
          const on = i === active;
          return (
            <button
              key={`${v.mapUrl}-${i}`}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(i)}
              className={`min-h-14 px-3 py-2 text-left lg:min-h-[72px] lg:px-[18px] lg:py-3 ${
                i > 0 ? "border-l border-[#F2F0EB]" : ""
              } ${on ? "bg-[#F2F0EB] text-[#0B0B0B]" : "hover:bg-[#F2F0EB]/5"}`}
            >
              <span className={`block text-xs ${on ? "text-[#4A4844]" : GREY}`}>
                Bản đồ {i + 1}
              </span>
              <span className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-sm font-extrabold lg:text-xl">
                  {mapNameOf(v)}
                </span>
                <span className="text-sm font-extrabold tabular-nums lg:text-xl">
                  {v.s1} – {v.s2}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Ảnh bản đồ + tỉ số theo hiệp */}
      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-[420px_minmax(0,1fr)] lg:items-start lg:gap-10">
        <figure className={`relative m-0 h-[160px] overflow-hidden border ${RULE} lg:h-[236px]`}>
          {mapAsset?.splash ? (
            <img
              src={mapAsset.splash}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          {/* Nhãn chữ trên nền đặc — không gradient */}
          <figcaption className="absolute bottom-0 left-0 bg-[#0B0B0B] px-3 py-2">
            <div className={`text-xs ${GREY}`}>Bản đồ {active + 1}</div>
            <div className="text-[22px] font-extrabold leading-[1.2] lg:text-[28px]">
              {mapName}
            </div>
          </figcaption>
        </figure>

        <div className="min-w-0">
          <div
            className={`grid gap-3 pb-2 text-xs ${GREY}`}
            style={{ gridTemplateColumns: halfCols }}
          >
            <span>Đội</span>
            <span>Hiệp 1</span>
            <span>Hiệp 2</span>
            <span>Hiệp phụ</span>
            <span className="text-right">Tổng</span>
          </div>
          {view.halves.map((row) => (
            <div
              key={row.team.apiTeamId}
              className={`grid items-center gap-3 border-t ${RULE} py-3 tabular-nums`}
              style={{ gridTemplateColumns: halfCols }}
            >
              <span className="truncate font-bold lg:text-base">{row.team.name}</span>
              <span>
                <span className="text-lg font-bold">{row.h1}</span>{" "}
                <span className={`text-[11px] ${GREY}`}>{row.s1}</span>
              </span>
              <span>
                <span className="text-lg font-bold">{row.h2}</span>{" "}
                <span className={`text-[11px] ${GREY}`}>{row.s2}</span>
              </span>
              <span className="text-lg font-bold">{row.ot}</span>
              <span
                className={`text-right text-[28px] font-extrabold ${row.won ? "" : GREY}`}
              >
                {row.total}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Diễn biến từng vòng */}
      <h2 className="m-0 mt-10 text-lg font-extrabold">Diễn biến từng vòng</h2>
      <div className="mt-3 overflow-x-auto pb-1.5">
        <div className="flex min-w-full items-stretch">
          <div className="flex w-14 flex-none flex-col justify-between py-px text-xs font-bold">
            <span className="flex h-7 items-center">{team1.tag}</span>
            <span className="h-5" />
            <span className="flex h-7 items-center">{team2.tag}</span>
          </div>
          {view.rounds.map((round, i) => {
            const w1 = same(round.winningTeam, team1.apiTeamId);
            const w2 = same(round.winningTeam, team2.apiTeamId);
            const type = roundType(round);
            const ceremony = ceremonyOf(round);
            const sep = i === 12 || i === 24;
            const cell =
              "flex h-7 w-full items-center justify-center text-[11px] font-extrabold";
            // Vòng có ceremony: ghi thẳng mã (ACE, CL…) vào ô đội thắng thay cho H/N/G/T
            const mark = ceremony ? (
              <span className="text-[9px] tracking-[0.02em] text-[#FF4A3D]">
                {ceremony.code}
              </span>
            ) : (
              type.mark
            );
            return (
              <Fragment key={`r-${i}`}>
              {/* Vạch đổi bên là cột riêng — không ăn vào bề rộng ô vòng (bị bóp trên mobile) */}
              {sep ? <div className="mx-1.5 w-px flex-none bg-[#F2F0EB]" /> : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex min-w-8 max-w-18 flex-1 cursor-default flex-col gap-px px-0.5 py-px">
                    <span
                      className={`${cell} ${w1 ? "bg-[#F2F0EB] text-[#0B0B0B]" : `border ${RULE}`}`}
                    >
                      {w1 ? mark : ""}
                    </span>
                    <span
                      className={`flex h-5 items-center justify-center text-[10px] tabular-nums ${GREY}`}
                    >
                      {i + 1}
                    </span>
                    <span className={`${cell} border ${w2 ? "border-[#F2F0EB]" : RULE}`}>
                      {w2 ? mark : ""}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className={`rounded-none border ${RULE} bg-[#0B0B0B] px-3 py-2 text-xs text-[#F2F0EB] shadow-none`}
                >
                  <div className="font-extrabold">
                    Vòng {i + 1} · {w1 ? team1.tag : team2.tag} thắng
                  </div>
                  {/* H (hạ gục) phổ biến nhất → không cần chú thích khi hover */}
                  {type.mark !== "H" ? (
                    <div className={GREY}>
                      {type.mark} — {type.label.charAt(0).toUpperCase()}
                      {type.label.slice(1)}
                    </div>
                  ) : null}
                  {ceremony ? (
                    <div className="text-[#FF4A3D]">
                      {ceremony.code} — {ceremony.label}
                    </div>
                  ) : null}
                </TooltipContent>
              </Tooltip>
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Bảng tuyển thủ */}
      {[
        { team: team1, players: view.players1, won: view.s1 > view.s2 },
        { team: team2, players: view.players2, won: view.s2 > view.s1 },
      ].map(({ team, players, won }) => {
        return (
          <section key={team.apiTeamId} className="mt-10">
            <div className="flex items-baseline gap-3 border-b-2 border-[#F2F0EB] pb-2">
              <h3 className="m-0 min-w-0 truncate text-lg font-extrabold">{team.name}</h3>
              <span
                className={`ml-auto shrink-0 text-[13px] font-extrabold tracking-[0.04em] ${
                  won ? "text-[#FF4A3D]" : GREY
                }`}
              >
                {won ? "THẮNG" : "THUA"}
              </span>
            </div>

            <div
              className={`hidden gap-3 pb-1.5 pt-2.5 text-xs lg:grid ${GREY}`}
              style={{ gridTemplateColumns: tableCols }}
            >
              <span>Tuyển thủ</span>
              <span>Đặc vụ</span>
              {statCols.map((c) => (
                <span key={c.key} className="text-right">
                  {c.label}
                </span>
              ))}
            </div>

            {players.map((p) => {
              // Tên/ảnh ưu tiên từ backend; vai trò (tiếng Việt) từ từ điển valorant-api
              const asset = assets?.agents.get(p.agentId);
              const agent =
                p.agentName || asset
                  ? {
                      name: p.agentName ?? asset?.name ?? null,
                      icon: p.agentIcon ?? asset?.icon ?? null,
                      role: asset?.role ?? null,
                    }
                  : null;
              const pm = p.k - p.d;
              const isMvp = p.key === view.mvpKey;
              const values: Record<string, string> = {
                acs: String(p.acs),
                kda: `${p.k} / ${p.d} / ${p.a}`,
                pm: `${pm > 0 ? "+" : ""}${pm}`,
                adr: String(p.adr),
                hs: `${p.hs}%`,
                fk: String(p.fk),
              };
              const agentIcon = agent?.icon ? (
                <img
                  src={agent.icon}
                  alt=""
                  className={`h-10 w-10 shrink-0 border ${RULE} object-cover`}
                />
              ) : (
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center border ${RULE} text-xs font-extrabold`}
                >
                  {(agent?.name ?? "?").slice(0, 2)}
                </span>
              );
              const mvpBadge = isMvp ? (
                <span className="shrink-0 bg-[#FF4A3D] px-[5px] py-px text-[10px] font-extrabold text-[#0B0B0B]">
                  MVP
                </span>
              ) : null;

              return (
                <div key={p.key} className={`border-t ${RULE} tabular-nums`}>
                  {/* Màn rộng: một hàng bảng */}
                  <div
                    className="hidden items-center gap-3 py-2 text-[15px] lg:grid"
                    style={{ gridTemplateColumns: tableCols }}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {/* Chỗ ảnh tuyển thủ — BTC chưa có ảnh nên dùng icon */}
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center border ${RULE}`}
                        title={`Ảnh tuyển thủ ${p.name}`}
                      >
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#9A9893"
                          strokeWidth="1.5"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="9" r="4" />
                          <path d="M4 21c1.6-4 4.6-6 8-6s6.4 2 8 6" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-bold" title={`${p.name}#${p.tagLine}`}>
                            {p.name}
                          </span>
                          {mvpBadge}
                        </div>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-2.5">
                      {agentIcon}
                      <div className="min-w-0">
                        <div className="truncate">{agent?.name ?? "—"}</div>
                      </div>
                    </div>
                    {statCols.map((c) => (
                      <span
                        key={c.key}
                        className={`text-right ${
                          c.key === "acs" ? "font-extrabold" : c.key === "kda" ? "font-semibold" : ""
                        } ${c.key === "pm" && pm <= 0 ? GREY : ""}`}
                      >
                        {values[c.key]}
                      </span>
                    ))}
                  </div>

                  {/* Màn nhỏ: thẻ */}
                  <div className="py-3 lg:hidden">
                    <div className="flex items-center gap-3">
                      {agentIcon}
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[15px] font-bold">{p.name}</span>
                          {mvpBadge}
                        </div>
                        <div className={`text-xs ${GREY}`}>
                          {agent?.name ?? "—"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-extrabold leading-tight">{p.acs}</div>
                        <div className={`text-[10px] ${GREY}`}>ACS</div>
                      </div>
                    </div>
                    <div className="mt-2.5 grid grid-cols-[1.4fr_repeat(4,minmax(0,1fr))] gap-1.5">
                      {statCols
                        .filter((c) => c.key !== "acs")
                        .map((c) => (
                          <div key={c.key}>
                            <div className={`text-[10px] ${GREY}`}>{c.label}</div>
                            <div className={`text-sm ${c.key === "kda" ? "font-semibold" : ""}`}>
                              {values[c.key]}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
};

export default ValorantMatchResult;
