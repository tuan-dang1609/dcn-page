import { memberName, type RegistrationEntry } from "@/api/groups";

/**
 * Đội hình đội lẻ: mọi thành viên là người thi đấu (không tick chọn như org).
 * Đội trưởng: đổi đội trưởng, mời người ra khỏi đội.
 */

type Props = {
  entry: RegistrationEntry;
  disabled?: boolean;
  onMakeCaptain: (userId: number | string) => void;
  onRemove: (userId: number | string) => void;
};

const SquadRoster = ({ entry, disabled, onMakeCaptain, onRemove }: Props) => {
  const count = entry.roster.length;
  const countOk = count >= entry.roster_min && count <= entry.roster_max;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 border-b border-[#2C2B29] pb-2 text-[13px]">
        <span className="font-bold">Đội hình thi đấu</span>
        <span className={`tabular-nums ${countOk ? "text-[#9A9893]" : "text-[#FF4A3D]"}`}>
          {count} / {entry.roster_min}–{entry.roster_max} người
        </span>
      </div>
      <ul className="m-0 list-none p-0">
        {entry.roster.map((player) => {
          const captain = String(player.user_id) === String(entry.captain_user_id);
          return (
            <li key={player.user_id} className="flex min-h-12 items-center gap-2 border-b border-[#2C2B29]">
              <span className="min-w-0 flex-1 py-1.5">
                <span className="block truncate text-sm font-bold">{memberName(player)}</span>
                <span className="block truncate text-xs text-[#9A9893]">{player.riot_account || "Chưa liên kết Riot"}</span>
              </span>
              {captain ? (
                <span className="inline-flex min-h-11 shrink-0 items-center bg-[#F2F0EB] px-2.5 text-xs font-bold text-[#0B0B0B]">
                  Đội trưởng
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onMakeCaptain(player.user_id)}
                    className="min-h-11 shrink-0 border border-[#2C2B29] px-2.5 text-xs font-bold text-[#9A9893] hover:text-[#F2F0EB] disabled:opacity-50"
                  >
                    Làm đội trưởng
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onRemove(player.user_id)}
                    className="min-h-11 shrink-0 px-2 text-xs font-bold text-[#FF4A3D] disabled:opacity-50"
                  >
                    Mời ra
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {count < entry.roster_min ? (
        <p className="mt-2 text-xs text-[#9A9893]">
          Cần thêm {entry.roster_min - count} người — gửi link mời hoặc mở tuyển công khai bên dưới.
        </p>
      ) : null}
    </div>
  );
};

export default SquadRoster;
