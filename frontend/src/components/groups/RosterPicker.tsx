import type { GroupMember } from "@/api/groups";
import { ROLE_LABEL, memberName } from "@/api/groups";

/**
 * Chọn đội hình + đội trưởng cho 1 giải: chạm hàng để thêm/bỏ người thi đấu,
 * "Đội trưởng" chỉ bấm được với người đã chọn (đội trưởng ban/pick và check-in cho giải này).

 */

type Props = {
  members: GroupMember[];
  selected: Array<number | string>;
  captainId: number | string | null;
  min: number;
  max: number;
  onChange: (next: { selected: Array<number | string>; captainId: number | string | null }) => void;
  disabled?: boolean;
};

const RosterPicker = ({ members, selected, captainId, min, max, onChange, disabled }: Props) => {
  const isSelected = (id: number | string) => selected.some((value) => String(value) === String(id));
  const count = selected.length;
  const countOk = count >= min && count <= max;

  const toggle = (id: number | string) => {
    if (disabled) return;
    if (isSelected(id)) {
      const next = selected.filter((value) => String(value) !== String(id));
      onChange({ selected: next, captainId: String(captainId) === String(id) ? null : captainId });
    } else if (count < max) {
      // Người đầu tiên được chọn mặc định là đội trưởng
      onChange({ selected: [...selected, id], captainId: captainId ?? id });
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 border-b border-[#2C2B29] pb-2 text-[13px]">
        <span className="font-bold">Đội hình thi đấu</span>
        <span className={`tabular-nums ${countOk ? "text-[#9A9893]" : "text-[#FF4A3D]"}`}>
          {count} / {min}–{max} người
        </span>
      </div>
      <ul className="m-0 list-none p-0">
        {members.map((member) => {
          const on = isSelected(member.user_id);
          const captain = on && String(captainId) === String(member.user_id);
          return (
            <li key={member.user_id} className="flex min-h-12 items-center gap-3 border-b border-[#2C2B29]">
              <button
                type="button"
                disabled={disabled || (!on && count >= max)}
                onClick={() => toggle(member.user_id)}
                aria-pressed={on}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-50"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center border ${
                    on ? "border-[#F2F0EB] bg-[#F2F0EB] text-[#0B0B0B]" : "border-[#2C2B29]"
                  }`}
                  aria-hidden="true"
                >
                  {on ? (
                    <svg viewBox="0 0 16 16" className="h-3 w-3">
                      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
                    </svg>
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{memberName(member)}</span>
                  <span className="block truncate text-xs text-[#9A9893]">
                    {member.riot_account || "Chưa liên kết Riot"}
                    {member.role !== "member" ? ` · ${ROLE_LABEL[member.role]}` : ""}
                  </span>
                </span>
              </button>

              <button
                type="button"
                disabled={disabled || !on}
                onClick={() => onChange({ selected, captainId: member.user_id })}
                className={`min-h-11 shrink-0 px-2.5 text-xs font-bold ${
                  captain
                    ? "bg-[#F2F0EB] text-[#0B0B0B]"
                    : on
                      ? "border border-[#2C2B29] text-[#9A9893] hover:text-[#F2F0EB]"
                      : "invisible"
                }`}
              >
                {captain ? "Đội trưởng" : "Chọn làm đội trưởng"}
              </button>
            </li>
          );
        })}
      </ul>
      {!members.length ? <p className="mt-3 text-sm text-[#9A9893]">Chưa có thành viên.</p> : null}
    </div>
  );
};

export default RosterPicker;
