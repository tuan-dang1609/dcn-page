import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  apiErrorMessage,
  createInviteLink,
  getGroupDetail,
  getRegistrationEntry,
  getRegistrationOptions,
  inviteUrl,
  kickMember,
  memberName,
  registerOrg,
  registerSquad,
  transferGroup,
  updateRegistration,
  withdrawRegistration,
} from "@/api/groups";
import RosterPicker from "@/components/groups/RosterPicker";
import RecruitPanel from "@/components/groups/RecruitPanel";
import SquadRoster from "@/components/groups/SquadRoster";
import TeamFinderPanel from "@/components/groups/TeamFinderPanel";

/**
 * Đăng ký giải theo đội (registration_mode = 'org'):
 *   - Đã có đội trong giải → xem / sửa đội hình + đội trưởng, rút đăng ký.
 *     Org: tick chọn người thi đấu trong số thành viên. Đội lẻ: thành viên = đội hình (link mời, mời ra).
 *   - Chưa có: "Đăng ký bằng org" (sáng lập / lead) và — giải ngoài series — "Tạo đội lẻ cho giải này"
 *     + "Tìm đội" (đội đang tuyển, lời mời, ghép ngẫu nhiên khi hết hạn).
 * Đội trưởng = người ban/pick và check-in cho giải này.
 * Vai trò trong game chỉ chọn khi xin vào đội / ghép ngẫu nhiên (tab "Tìm đội"), không chọn trong đội hình.
 */

type Mode = "org" | "squad" | "find";

const MODE_LABEL: Record<Mode, string> = { org: "Bằng org", squad: "Tạo đội lẻ", find: "Tìm đội" };


type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId?: number | string;
};

const GREY = "text-[#9A9893]";
const RULE = "border-[#2C2B29]";
const PRIMARY_BTN =
  "inline-flex min-h-11 items-center justify-center bg-[#F2F0EB] px-5 text-sm font-extrabold text-[#0B0B0B] disabled:opacity-50";
const GHOST_BTN = `inline-flex min-h-11 items-center justify-center border ${RULE} px-4 text-sm font-bold disabled:opacity-50`;
const INPUT = `min-h-11 w-full border ${RULE} bg-transparent px-3 text-sm outline-none focus:border-[#F2F0EB]`;

const TeamRegistrationDialog = ({ open, onOpenChange, tournamentId }: Props) => {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("org");
  const [selected, setSelected] = useState<Array<number | string>>([]);
  const [captainId, setCaptainId] = useState<number | string | null>(null);

  const [squadName, setSquadName] = useState("");
  const [squadTag, setSquadTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optionsQuery = useQuery({
    queryKey: ["registration-options", tournamentId, user?.id],
    enabled: open && Boolean(tournamentId),
    queryFn: async () => (await getRegistrationOptions(tournamentId!, token)).data.data,
  });
  const options = optionsQuery.data;
  const myRegistration = options?.my_registrations?.[0] ?? null;

  const entryQuery = useQuery({
    queryKey: ["registration-entry", myRegistration?.registration_id, user?.id],
    enabled: open && Boolean(myRegistration),
    queryFn: async () => (await getRegistrationEntry(myRegistration!.registration_id, token)).data.data,
  });
  const entry = entryQuery.data;

  // Đội lẻ: link mời thành viên
  const squadQuery = useQuery({
    queryKey: ["group", entry?.team.id, user?.id],
    enabled: open && entry?.team.kind === "squad" && Boolean(entry?.can_manage),
    queryFn: async () => (await getGroupDetail(entry!.team.id, token)).data.data,
  });

  // Đổ đội hình hiện có vào bộ chọn
  useEffect(() => {
    if (!entry) return;
    setSelected(entry.roster.map((player) => player.user_id));
    setCaptainId(entry.captain_user_id);
  }, [entry]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (options && !options.org?.can_register && !options.tournament.in_series) setMode("squad");
  }, [options]);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["registration-options"] });
    await queryClient.invalidateQueries({ queryKey: ["registration-entry"] });
    await queryClient.invalidateQueries({ queryKey: ["group"] });
    await queryClient.invalidateQueries({ queryKey: ["tournament"] });
  };

  const run = async (action: () => Promise<unknown>, success: string) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      toast({ title: success });
      await refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    if (!entry || !token) return;
    const existing = squadQuery.data?.invite_links?.[0];
    const link = existing ?? (await createInviteLink(entry.team.id, token)).data.data;
    await navigator.clipboard?.writeText(inviteUrl(link.token)).catch(() => {});
    toast({ title: "Đã sao chép link mời", description: "Gửi link cho đồng đội qua Zalo / Discord." });
    await queryClient.invalidateQueries({ queryKey: ["group"] });
  };

  const tournament = options?.tournament;

  const body = (() => {
    if (!user) {
      return (
        <p className={`text-sm ${GREY}`}>
          <Link to="/login" className="font-bold text-[#F2F0EB] underline underline-offset-4">
            Đăng nhập
          </Link>{" "}
          để đăng ký.
        </p>
      );
    }
    if (optionsQuery.isLoading || (myRegistration && entryQuery.isLoading)) {
      return <p className={`text-sm ${GREY}`}>Đang tải…</p>;
    }
    if (!tournament) return <p className="text-sm text-[#FF4A3D]">Không tải được thông tin giải.</p>;

    // ── Đã có đội trong giải ──
    if (entry) {
      const isSquad = entry.team.kind === "squad";

      const captain = entry.roster.find((player) => String(player.user_id) === String(entry.captain_user_id));
      return (
        <div className="grid gap-5">
          <div className="flex items-center gap-3 border-b-2 border-[#F2F0EB] pb-3">
            {entry.team.logo_url ? (
              <img src={entry.team.logo_url} alt="" className="h-11 w-11 border border-[#2C2B29] object-cover" />
            ) : (
              <span className={`flex h-11 w-11 items-center justify-center border ${RULE} text-xs font-extrabold ${GREY}`}>
                {entry.team.short_name}
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate text-lg font-extrabold">{entry.team.name}</div>
              <div className={`text-xs ${GREY}`}>
                {isSquad ? "Đội lẻ" : "Org"} · Đội trưởng: {captain ? memberName(captain) : "chưa chọn"}
              </div>
            </div>
          </div>

          {entry.can_manage ? (
            <>
              {isSquad ? (
                <div className={`flex flex-wrap items-center justify-between gap-3 border ${RULE} p-3 text-sm`}>
                  <span className={GREY}>Mời đồng đội vào đội lẻ bằng link</span>
                  <button type="button" className={GHOST_BTN} onClick={() => void copyInvite()}>
                    Sao chép link mời
                  </button>
                </div>
              ) : null}
              {isSquad ? (
                <SquadRoster
                  entry={entry}
                  disabled={busy || !entry.is_open}
                  onMakeCaptain={(userId) => {
                    const target = entry.roster.find((player) => String(player.user_id) === String(userId));
                    if (!window.confirm(`Chuyển đội trưởng cho ${target ? memberName(target) : "người này"}? Bạn sẽ không quản lý đội nữa.`)) return;
                    void run(() => transferGroup(entry.team.id, userId, token!), "Đã đổi đội trưởng");
                  }}
                  onRemove={(userId) => {
                    const target = entry.roster.find((player) => String(player.user_id) === String(userId));
                    if (!window.confirm(`Mời ${target ? memberName(target) : "người này"} ra khỏi đội?`)) return;
                    void run(() => kickMember(entry.team.id, userId, token!), "Đã mời ra khỏi đội");
                  }}
                />
              ) : (
                <RosterPicker
                  members={entry.members}
                  selected={selected}
                  captainId={captainId}
                  min={entry.roster_min}
                  max={entry.roster_max}
                  disabled={busy || !entry.is_open}
                  onChange={(next) => {
                    setSelected(next.selected);
                    setCaptainId(next.captainId);
                  }}
                />
              )}
              {!entry.is_open ? <p className={`text-sm ${GREY}`}>Đã hết hạn đăng ký — chỉ BTC sửa được đội hình.</p> : null}

              <div className="flex flex-wrap justify-between gap-2">
                <button
                  type="button"
                  disabled={busy || !entry.is_open}
                  className="min-h-11 px-1 text-sm font-bold text-[#FF4A3D] disabled:opacity-50"
                  onClick={() => {
                    if (!window.confirm(isSquad ? "Rút đăng ký? Đội lẻ sẽ bị xoá." : "Rút đăng ký org khỏi giải?")) return;
                    void run(() => withdrawRegistration(entry.id, token!), "Đã rút đăng ký");
                  }}
                >
                  Rút đăng ký
                </button>
                {isSquad ? null : (
                  <button
                    type="button"
                    disabled={busy || !entry.is_open || !captainId}
                    className={PRIMARY_BTN}
                    onClick={() =>
                      void run(
                        () => updateRegistration(entry.id, { player_ids: selected, captain_user_id: captainId! }, token!),
                        "Đã lưu đội hình",
                      )
                    }
                  >
                    Lưu đội hình
                  </button>
                )}
              </div>
              {isSquad && entry.team_finder ? <RecruitPanel entry={entry} token={token!} /> : null}
            </>
          ) : (
            <ul className="m-0 list-none p-0">
              {entry.roster.map((player) => (
                <li key={player.user_id} className={`flex min-h-11 items-center justify-between border-b ${RULE} text-sm`}>
                  <span className="font-bold">{memberName(player)}</span>
                  <span className={`text-xs ${GREY}`}>
                    {String(player.user_id) === String(entry.captain_user_id) ? "Đội trưởng" : player.riot_account}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    if (!tournament.is_open) {
      return <p className={`text-sm ${GREY}`}>Giải đang không mở đăng ký.</p>;
    }

    const org = options?.org;
    const canOrg = Boolean(org?.can_register);
    const canSquad = !tournament.in_series;
    const canFind = Boolean(tournament.team_finder);
    const modes = (["org", "squad", "find"] as const).filter(
      (value) => (value === "org" && canOrg) || (value === "squad" && canSquad) || (value === "find" && canFind),
    );


    return (
      <div className="grid gap-5">
        {modes.length > 1 ? (
          <div className={`grid border ${RULE}`} style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }}>
            {modes.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={`min-h-11 px-1 text-sm font-bold ${mode === value ? "bg-[#F2F0EB] text-[#0B0B0B]" : ""}`}
              >
                {value === "org" ? `Org ${org!.short_name}` : MODE_LABEL[value]}
              </button>
            ))}
          </div>
        ) : null}

        {mode === "find" && canFind ? <TeamFinderPanel tournamentId={tournament.id} token={token!} /> : null}

        {mode === "org" && canOrg ? (
          <>
            <p className={`m-0 text-sm ${GREY}`}>
              Đăng ký dưới tên <strong className="text-[#F2F0EB]">{org!.name}</strong>. Chọn người thi đấu và đội trưởng — đội
              trưởng ban/pick và check-in cho giải này.
            </p>
            <RosterPicker
              members={org!.members}
              selected={selected}
              captainId={captainId}
              min={tournament.roster_min}
              max={tournament.roster_max}
              disabled={busy}

              onChange={(next) => {
                setSelected(next.selected);
                setCaptainId(next.captainId);
              }}
            />

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy || !captainId || selected.length < tournament.roster_min}
                className={PRIMARY_BTN}
                onClick={() =>
                  void run(
                    () =>
                      registerOrg(
                        tournament.id,
                        {
                          org_id: org!.id,
                          player_ids: selected,
                          captain_user_id: captainId!,
                        },
                        token!,
                      ),
                    "Đã đăng ký",
                  )
                }
              >
                Đăng ký {org!.short_name}
              </button>
            </div>
          </>
        ) : null}

        {mode === "squad" && canSquad ? (
          <>
            <p className={`m-0 text-sm ${GREY}`}>
              Đội lẻ chỉ dùng cho giải này. Bạn là đội trưởng; sau khi tạo, gửi link mời cho đồng đội hoặc mở tuyển công
              khai để người chơi lẻ xin vào.
            </p>
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
              <input
                className={INPUT}
                placeholder="Tên đội"
                value={squadName}
                maxLength={64}
                onChange={(event) => setSquadName(event.target.value)}
              />
              <input
                className={`${INPUT} uppercase`}
                placeholder="Tag"
                value={squadTag}
                maxLength={16}
                onChange={(event) => setSquadTag(event.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy || squadName.trim().length < 2 || squadTag.trim().length < 2}
                className={PRIMARY_BTN}
                onClick={() =>
                  void run(
                    () =>
                      registerSquad(tournament.id, { name: squadName.trim(), short_name: squadTag.trim() }, token!),
                    "Đã tạo đội lẻ — gửi link mời cho đồng đội",
                  )
                }
              >
                Tạo đội & đăng ký
              </button>
            </div>
          </>
        ) : null}

        {!canOrg && !canSquad ? (
          <div className={`grid gap-2 text-sm ${GREY}`}>
            <p className="m-0">Giải thuộc series chỉ nhận đăng ký theo org.</p>
            <p className="m-0">
              {org
                ? `Chỉ sáng lập / lead của ${org.name} mới đăng ký được — nhờ họ đưa bạn vào đội hình.`
                : "Bạn chưa ở org nào."}{" "}
              <Link to="/orgs" className="font-bold text-[#F2F0EB] underline underline-offset-4">
                Xem các org
              </Link>
            </p>
          </div>
        ) : null}

        {mode === "org" && !canOrg && canSquad && org ? (
          <p className={`m-0 text-sm ${GREY}`}>
            Chỉ sáng lập / lead của {org.name} mới đăng ký org được. Bạn vẫn có thể tạo đội lẻ.
          </p>
        ) : null}
      </div>
    );
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto rounded-none border-[#2C2B29] bg-[#0B0B0B] px-4 py-5 text-[#F2F0EB] sm:px-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">Đăng ký giải</DialogTitle>
          <DialogDescription className={GREY}>
            {tournament
              ? `${tournament.name}${tournament.in_series ? " · thuộc series" : ""} · đội hình ${tournament.roster_min}–${tournament.roster_max} người`
              : " "}
          </DialogDescription>
        </DialogHeader>
        {body}
        {error ? <p className="m-0 text-sm text-[#FF4A3D]">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
};

export default TeamRegistrationDialog;
