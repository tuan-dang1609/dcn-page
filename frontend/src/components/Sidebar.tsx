import type { ReactNode } from "react";

type SidebarProps = {
  tournament?: {
    requirement?: {
      rank_min?: string;
      rank_max?: string;
      device?: string | string[];
      discord?: boolean;
      pner_only?: boolean;
    };
    prizes?: Array<{
      id?: number | string;
      place_label?: string;
      place_order?: number;
      prize?: string;
      amount?: string | number;
    }>;
  } | null;
  isLoading?: boolean;
};

/** Một mục bên phải trang tổng quan: tiêu đề + danh sách nhãn/giá trị kẻ mảnh. */
const InfoSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section>
    <h2 className="m-0 text-lg font-extrabold leading-[1.3]">{title}</h2>
    <dl className="m-0 mt-2 border-t-2 border-[#F2F0EB]">{children}</dl>
  </section>
);

const InfoRow = ({
  label,
  children,
  strong = false,
}: {
  label: ReactNode;
  children: ReactNode;
  strong?: boolean;
}) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-[#2C2B29] py-2.5 text-sm">
    <dt className={strong ? "font-bold" : "text-[#9A9893]"}>{label}</dt>
    <dd className="m-0 min-w-0 text-right font-semibold tabular-nums">
      {children}
    </dd>
  </div>
);

const Sidebar = ({ tournament, isLoading = false }: SidebarProps) => {
  const requirement = tournament?.requirement ?? {};
  const rankLabel = (() => {
    const min = String(requirement?.rank_min ?? "").trim();
    const max = String(requirement?.rank_max ?? "").trim();
    if (!min || !max || min === "--" || max === "--") return "Mọi rank";
    return `${min} – ${max}`;
  })();

  const prizeItems = Array.isArray(tournament?.prizes)
    ? [...tournament.prizes]
        .sort((a, b) => Number(a?.place_order ?? 0) - Number(b?.place_order ?? 0))
        .map((item) => ({
          key: String(item?.id ?? item?.place_label ?? item?.place_order ?? ""),
          place: item?.place_label ?? "—",
          prize: String(item?.prize ?? item?.amount ?? "—"),
        }))
    : [];

  const deviceLabel = Array.isArray(requirement?.device)
    ? requirement.device.join(", ")
    : (requirement?.device ?? "—");

  return (
    <aside className="space-y-10">
      <InfoSection title="Giải thưởng">
        {isLoading ? (
          <p className="py-3 text-sm text-[#9A9893]">Đang tải…</p>
        ) : prizeItems.length ? (
          prizeItems.map((item, index) => (
            <InfoRow key={item.key} label={item.place} strong={index === 0}>
              {item.prize}
            </InfoRow>
          ))
        ) : (
          <p className="py-3 text-sm text-[#9A9893]">Chưa công bố giải thưởng.</p>
        )}
      </InfoSection>

      <InfoSection title="Điều kiện tham gia">
        <InfoRow label="Rank">{rankLabel}</InfoRow>
        <InfoRow label="Trường">
          {requirement?.pner_only ? "THPT Phú Nhuận" : "Mọi trường"}
        </InfoRow>
        <InfoRow label="Thiết bị">{deviceLabel}</InfoRow>
        <InfoRow label="Discord PN">
          {requirement?.discord ? "Bắt buộc" : "Không bắt buộc"}
        </InfoRow>
      </InfoSection>

      <InfoSection title="Liên hệ">
        <InfoRow label="Facebook">
          <a href="#" className="underline underline-offset-4">
            Dong Chuyen Nghiep
          </a>
        </InfoRow>
        <InfoRow label="Discord">
          <a href="#" className="underline underline-offset-4">
            THPT Phú Nhuận
          </a>
        </InfoRow>
      </InfoSection>
    </aside>
  );
};

export default Sidebar;
