import type { ComponentProps } from "react";
import { Link, useParams } from "react-router-dom";
import InfoGrid from "@/components/InfoGrid";
import Navigation from "@/components/Navigation";

/** Khung trang giải: lề hai bên và bề rộng tối đa dùng chung mọi trang. */
export const PAGE_FRAME_CLASS = "mx-auto w-full max-w-[1440px] px-4 md:px-8";

type TournamentMastheadProps = {
  name?: string | null;
  tournamentId?: number | string | null;
};

/**
 * Dòng đầu trang như đầu báo: tên giải bên trái, mục lục bên phải,
 * kẻ 1px màu chữ bên dưới. Mobile: tên giải, rồi dải mục lục cuộn ngang.
 */
export const TournamentMasthead = ({
  name,
  tournamentId,
}: TournamentMastheadProps) => {
  const { game, slug } = useParams();
  const home = game && slug ? `/tournament/${game}/${slug}` : "/";

  return (
    <header className={PAGE_FRAME_CLASS}>
      <div className="flex flex-col border-b border-[#F2F0EB] md:h-16 md:flex-row md:items-center md:justify-between md:gap-8">
        <Link
          to={home}
          className="flex min-h-12 min-w-0 items-center truncate text-[15px] font-extrabold tracking-[-0.01em] no-underline md:text-[17px]"
        >
          {name?.trim() || "Giải đấu"}
        </Link>
        <Navigation tournamentId={tournamentId} className="-mx-4 px-4 md:mx-0 md:px-0" />
      </div>
    </header>
  );
};

type TournamentPageIntroProps = {
  /** Dòng nhỏ phía trên tiêu đề, thường là tên game. */
  eyebrow?: string | null;
  title: string;
  tournament?: ComponentProps<typeof InfoGrid>["tournament"];
  isLoading?: boolean;
};

/**
 * Đầu trang con (design/Main.dc.html): tiêu đề lớn bên trái,
 * hàng thông tin giải bên phải — xuống dòng dưới tiêu đề trên màn nhỏ.
 */
export const TournamentPageIntro = ({
  eyebrow,
  title,
  tournament,
  isLoading,
}: TournamentPageIntroProps) => (
  <section className={`${PAGE_FRAME_CLASS} pt-8 md:pt-12`}>
    <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="m-0 mb-1 text-[13px] font-semibold text-[#9A9893]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="m-0 text-[44px] font-extrabold leading-[1.05] tracking-[-0.035em] md:text-[72px]">
          {title}
        </h1>
      </div>
      <InfoGrid
        tournament={tournament}
        isLoading={isLoading}
        className="w-full lg:w-[640px]"
      />
    </div>
  </section>
);
