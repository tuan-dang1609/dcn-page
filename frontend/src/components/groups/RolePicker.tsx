import { roleLabel } from "@/lib/ingameRoles";

/** Chọn vai trò trong game: chip vuông, chạm ≥ 44px. multiple = chọn nhiều (vị trí đội cần tuyển). */

type SingleProps = {
  choices: string[];
  value: string | null;
  onChange: (value: string | null) => void;
  multiple?: false;
  allowEmpty?: boolean;
  disabled?: boolean;
  label?: string;
};

type MultiProps = {
  choices: string[];
  value: string[];
  onChange: (value: string[]) => void;
  multiple: true;
  disabled?: boolean;
  label?: string;
};

const RolePicker = (props: SingleProps | MultiProps) => {
  const { choices, disabled, label } = props;
  const isOn = (role: string) => (props.multiple ? props.value.includes(role) : props.value === role);

  const toggle = (role: string) => {
    if (props.multiple === true) {
      props.onChange(isOn(role) ? props.value.filter((value) => value !== role) : [...props.value, role]);
      return;
    }
    const single = props as SingleProps;
    single.onChange(isOn(role) && single.allowEmpty ? null : role);
  };

  return (
    <div role="group" aria-label={label}>
      {label ? <div className="mb-1.5 text-xs font-bold text-[#9A9893]">{label}</div> : null}
      <div className="flex flex-wrap gap-1.5">
        {choices.map((role) => {
          const on = isOn(role);
          return (
            <button
              key={role}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => toggle(role)}
              className={`min-h-11 min-w-11 border px-3 text-sm font-bold disabled:opacity-50 ${
                on ? "border-[#F2F0EB] bg-[#F2F0EB] text-[#0B0B0B]" : "border-[#2C2B29] text-[#9A9893] hover:text-[#F2F0EB]"
              }`}
            >
              {roleLabel(role)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RolePicker;
