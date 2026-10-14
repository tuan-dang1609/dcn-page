import { useState } from "react";

/** Logo org / đội; không có hoặc link hỏng → tag. */
const GroupLogo = ({
  group,
  size = 40,
}: {
  group: { logo_url?: string | null; short_name?: string | null; name?: string | null };
  size?: number;
}) => {
  const [failed, setFailed] = useState(false);
  const label = String(group.short_name || group.name || "?").slice(0, 4).toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden border border-[#2C2B29] text-[11px] font-extrabold text-[#9A9893]"
      style={{ width: size, height: size }}
    >
      {group.logo_url && !failed ? (
        <img src={group.logo_url} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        label
      )}
    </span>
  );
};

export default GroupLogo;
