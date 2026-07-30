import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

type TournamentSubpageHeaderProps = {
  title?: string | null;
  subtitle: string;
  bannerUrl?: string | null;
  /** Optional back link (e.g. match detail → bracket) */
  backTo?: string;
  backLabel?: string;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
};

/**
 * Compact tournament chrome for non-overview tabs.
 * Uses banner_url as a darkened atmospheric background — not a full hero.
 */
export const TournamentSubpageHeader = ({
  title,
  subtitle,
  bannerUrl,
  backTo,
  backLabel = "Quay lại",
  leftSlot,
  rightSlot,
}: TournamentSubpageHeaderProps) => {
  const hasBanner = Boolean(String(bannerUrl ?? "").trim());
  const displayTitle = String(title ?? "").trim() || "Giải đấu";

  const defaultBack = backTo ? (
    <Link
      to={backTo}
      className="inline-flex h-8 items-center gap-1.5 rounded border border-neutral-600 bg-black/30 px-2.5 text-xs font-semibold text-neutral-300 backdrop-blur-sm transition-colors hover:border-neutral-500 hover:text-white"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{backLabel}</span>
    </Link>
  ) : null;

  const left = leftSlot ?? defaultBack;
  const right = rightSlot ?? null;

  return (
    <header className="relative overflow-hidden border-b border-neutral-700 bg-[#141414] text-white">
      {hasBanner ? (
        <>
          <div
            className="absolute inset-0 scale-105 bg-cover bg-center"
            style={{ backgroundImage: `url(${bannerUrl})` }}
            aria-hidden
          />
          <div className="absolute inset-0 bg-[#0a0a0a]/75" aria-hidden />
          <div
            className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/55 to-[#0a0a0a]/35"
            aria-hidden
          />
        </>
      ) : null}

      {/* Mobile: slots on top row, title below — tránh đè chữ */}
      <div className="relative mx-auto px-4 py-3 md:hidden">
        {(left || right) && (
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">{left}</div>
            <div className="flex min-w-0 items-center justify-end gap-2">
              {right}
            </div>
          </div>
        )}
        <div className="text-center">
          <p className="text-[13px] font-bold uppercase leading-snug tracking-normal text-white">
            {displayTitle}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Desktop: title centered, slots on sides */}
      <div className="relative mx-auto hidden min-h-[80px] items-center px-8 py-3.5 md:flex">
        <div className="pointer-events-none absolute inset-x-24 top-1/2 z-0 -translate-y-1/2 text-center">
          <p className="mx-auto max-w-[min(720px,70%)] truncate text-[15px] font-bold uppercase leading-snug tracking-normal text-white">
            {displayTitle}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            {subtitle}
          </p>
        </div>

        <div className="relative z-10 flex w-full items-center justify-between gap-3">
          <div className="flex min-w-0 max-w-[38%] items-center gap-2">
            {left}
          </div>
          <div className="flex min-w-0 max-w-[38%] items-center justify-end">
            {right}
          </div>
        </div>
      </div>
    </header>
  );
};
