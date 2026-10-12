import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link, useParams, useSearchParams } from "react-router-dom";
import PageLoader from "@/components/PageLoader";

const MatchDetailPage = lazy(() => import("@/pages/MatchDetailPage"));

/** Query param giữ trận đang mở — copy link vẫn mở đúng trận, nút Back đóng panel. */
const MATCH_PARAM = "match";

type MatchPanelContextValue = {
  /** Có giá trị khi bracket nằm trong MatchPanelProvider → bấm trận mở sidebar. */
  openMatch?: (matchId: number) => void;
};

const MatchPanelContext = createContext<MatchPanelContextValue>({});

export const useMatchPanel = () => useContext(MatchPanelContext);

/**
 * Bọc thẻ trận đã kết thúc: trong trang bracket thì mở sidebar,
 * nơi khác (không có provider) vẫn là link sang /match/:id như cũ.
 */
export const MatchResultTrigger = ({
  matchId,
  ariaLabel,
  className = "",
  style,
  children,
}: {
  matchId: number;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) => {
  const { openMatch } = useMatchPanel();
  const { game, slug } = useParams();
  const cls = `block text-left transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#F2F0EB] ${className}`;
  // Valorant có trang kết quả riêng (bản đồ, diễn biến vòng, bảng tuyển thủ) → mở trang đầy đủ
  const isValorant = ["val", "valo", "valorant"].includes(String(game ?? "").toLowerCase());

  if (openMatch && !isValorant) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => openMatch(matchId)}
        className={cls}
        style={style}
      >
        {children}
      </button>
    );
  }

  return (
    <Link
      to={`/tournament/${game ?? ""}/${slug ?? ""}/match/${matchId}`}
      aria-label={ariaLabel}
      className={cls}
      style={style}
    >
      {children}
    </Link>
  );
};

/**
 * Bảng kết quả trận trượt ra (design/Main.dc.html — aside bên phải, ở đây 760px;
 * Mobile.dc.html — bottom sheet). Thay cho việc chuyển sang trang /match/:id.
 */
export const MatchPanelProvider = ({ children }: { children: ReactNode }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(MATCH_PARAM);
  const openId = raw && /^\d+$/.test(raw) ? raw : null;

  const openMatch = useCallback(
    (matchId: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set(MATCH_PARAM, String(matchId));
        return next;
      });
    },
    [setSearchParams],
  );

  const close = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(MATCH_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const value = useMemo(() => ({ openMatch }), [openMatch]);

  return (
    <MatchPanelContext.Provider value={value}>
      {children}

      <MatchPanelSheet open={Boolean(openId)} onClose={close}>
        {openId ? (
          <Suspense
            fallback={
              <PageLoader label="Đang tải trận đấu..." fullScreen={false} />
            }
          >
            <MatchDetailPage
              key={openId}
              matchId={openId}
              variant="panel"
              onClose={close}
            />
          </Suspense>
        ) : null}
      </MatchPanelSheet>
    </MatchPanelContext.Provider>
  );
};

/** Khung sidebar: phải 760px trên desktop, bottom sheet trên mobile. */
export const MatchPanelSheet = ({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) => (
  <DialogPrimitive.Root
    open={open}
    onOpenChange={(next) => {
      if (!next) onClose();
    }}
  >
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto border-t border-[#F2F0EB] bg-[#0B0B0B] text-[#F2F0EB] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom md:inset-y-0 md:left-auto md:right-0 md:h-full md:max-h-none md:w-[min(760px,100vw)] md:border-l md:border-t-0 md:data-[state=closed]:slide-out-to-right md:data-[state=open]:slide-in-from-right"
      >
        <DialogPrimitive.Title className="sr-only">
          Kết quả trận đấu
        </DialogPrimitive.Title>
        {/* Thanh kéo cho bottom sheet trên mobile */}
        <div className="mx-auto mt-2.5 h-1 w-10 bg-[#2C2B29] md:hidden" />
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
);

export const MatchPanelCloseButton = ({ onClose }: { onClose?: () => void }) => (
  <button
    type="button"
    aria-label="Đóng"
    onClick={onClose}
    className="flex h-11 w-11 shrink-0 items-center justify-center border border-[#F2F0EB] bg-transparent text-[#F2F0EB] transition-colors hover:bg-[#F2F0EB] hover:text-[#0B0B0B]"
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  </button>
);

type PanelTeam = { name: string; tag: string; logo?: string | null; score: number };

const PanelTeamBlock = ({
  team,
  isLoser,
  align,
}: {
  team: PanelTeam;
  isLoser: boolean;
  align: "left" | "right";
}) => (
  <div
    className={`flex min-w-0 items-center gap-2.5 md:gap-3.5 ${
      align === "right" ? "flex-row-reverse text-right" : ""
    }`}
  >
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border border-[#2C2B29] md:h-11 md:w-11">
      {team.logo ? (
        <img src={team.logo} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs font-extrabold text-[#9A9893]">{team.tag}</span>
      )}
    </div>
    <div className="min-w-0">
      <div className="text-[11px] text-[#9A9893] md:text-xs">{team.tag}</div>
      <div
        className={`truncate text-sm font-extrabold leading-[1.3] md:text-lg ${
          isLoser ? "text-[#9A9893]" : "text-[#F2F0EB]"
        }`}
      >
        {team.name}
      </div>
    </div>
  </div>
);

/** Đầu sidebar: tên vòng + ngày, nút đóng, rồi tỉ số lớn giữa hai đội. */
export const MatchPanelHeader = ({
  title,
  meta,
  isLive = false,
  team1,
  team2,
  onClose,
}: {
  title: string;
  meta?: string;
  isLive?: boolean;
  team1: PanelTeam;
  team2: PanelTeam;
  onClose?: () => void;
}) => (
  <div className="px-4 pt-3 md:px-8 md:pt-6">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-bold">{title}</div>
        <div className="mt-0.5 text-xs text-[#9A9893] md:text-[13px]">
          {meta}
          {isLive ? (
            <span className="font-bold text-[#FF4A3D]"> · TRỰC TIẾP</span>
          ) : null}
        </div>
      </div>
      <MatchPanelCloseButton onClose={onClose} />
    </div>

    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5 border-t-2 border-[#F2F0EB] pt-3 md:mt-5 md:gap-5 md:pt-4">
      <PanelTeamBlock
        team={team1}
        isLoser={!isLive && team1.score < team2.score}
        align="left"
      />
      <div className="whitespace-nowrap text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] tabular-nums md:text-[44px]">
        {team1.score}
        <span className="mx-1.5 font-normal text-[#9A9893] md:mx-2.5">–</span>
        {team2.score}
      </div>
      <PanelTeamBlock
        team={team2}
        isLoser={!isLive && team2.score < team1.score}
        align="right"
      />
    </div>
    <div className="mt-4 border-t border-[#2C2B29] md:mt-5" />
  </div>
);
