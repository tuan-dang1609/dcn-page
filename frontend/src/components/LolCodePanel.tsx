import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiErrorMessage } from "@/api/groups";
import { createLolMatchCode, getLolMatchCodes } from "@/api/lolTournament";

/**
 * Trang trận LMHT: mã phòng giải đấu từng ván (Riot tournament-v5). Hệ thống tạo mã lúc hạn chốt đội hình
 * (giờ trận − 15 phút, để kịp vào phòng); chỉ người đã chốt ra sân vào được phòng. Ván xong tự cập nhật tỉ số + mã ván kế.
 * Người thi đấu / quản lý 2 đội / BTC thấy mã; người khác chỉ thấy trạng thái.
 */

const GREY = "text-[#9A9893]";
const RULE = "border-[#2C2B29]";

const STATUS_LABEL = { open: "Đang chờ đấu", played: "Đã có kết quả", review: "BTC đang xem lại" } as const;

const LolCodePanel = ({ matchId }: { matchId: number | null }) => {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const codesQuery = useQuery({
    queryKey: ["lol-match-codes", matchId, user?.id ?? null],
    enabled: Boolean(matchId),
    refetchInterval: 60_000,
    queryFn: async () => (await getLolMatchCodes(matchId!, token)).data.data,
  });
  const data = codesQuery.data;
  if (!matchId || !data || (!data.codes.length && !data.can_create)) return null;

  const copy = async (code: string) => {
    await navigator.clipboard?.writeText(code).catch(() => {});
    toast({ title: "Đã sao chép mã phòng", description: "Mở LMHT → Chơi → biểu tượng chiếc cúp → dán mã." });
  };

  const createNow = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await createLolMatchCode(matchId, token);
      toast({ title: "Đã tạo mã phòng cho ván kế tiếp" });
      await queryClient.invalidateQueries({ queryKey: ["lol-match-codes", matchId] });
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const openCode = data.codes.find((item) => item.status === "open");

  return (
    <section className="mx-auto w-full max-w-[1440px] px-4 py-6 text-[#F2F0EB] md:px-8" aria-labelledby="lol-code-title">
      <div className={`border ${RULE} px-4 py-4 md:px-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="lol-code-title" className="m-0 text-lg font-extrabold">
            Mã phòng giải đấu
          </h2>
          {data.mode === "stub" ? <span className="text-xs font-bold text-[#FF4A3D]">Chế độ thử (stub) — không vào được phòng thật</span> : null}
        </div>
        <p className={`m-0 mt-1 text-sm ${GREY}`}>
          Dán mã trong LMHT: Chơi → biểu tượng chiếc cúp (mã giải đấu). Chỉ người đã chốt ra sân vào được phòng; kết quả
          tự cập nhật sau mỗi ván.
        </p>

        {!data.can_view && data.codes.length ? (
          <p className={`m-0 mt-3 text-sm ${GREY}`}>Mã phòng chỉ hiện cho người thi đấu và quản lý 2 đội.</p>
        ) : null}

        <ul className="m-0 mt-3 list-none p-0">
          {data.codes.map((item) => (
            <li key={`${item.game_no}-${item.created_at}`} className={`flex flex-wrap items-center gap-3 border-b ${RULE} py-2.5`}>
              <span className="w-14 shrink-0 text-sm font-extrabold">Ván {item.game_no}</span>
              {item.code ? (
                <code
                  className={`min-w-0 flex-1 break-all text-sm font-bold ${
                    item.status === "open" ? "text-[#F2F0EB]" : `${GREY} line-through`
                  }`}
                >
                  {item.code}
                </code>
              ) : (
                <span className={`min-w-0 flex-1 text-sm ${GREY}`}>—</span>
              )}
              <span className={`shrink-0 text-xs font-bold ${item.status === "review" ? "text-[#FF4A3D]" : GREY}`}>
                {STATUS_LABEL[item.status] ?? item.status}
              </span>
              {item.code && item.status === "open" ? (
                <button
                  type="button"
                  onClick={() => void copy(item.code!)}
                  className="inline-flex min-h-11 shrink-0 items-center bg-[#F2F0EB] px-4 text-sm font-extrabold text-[#0B0B0B]"
                >
                  Sao chép
                </button>
              ) : null}
              {item.status === "open" && item.missing_user_ids.length && data.can_view ? (
                <p className="m-0 w-full text-xs text-[#FF4A3D]">
                  {item.missing_user_ids.length} người thi đấu chưa liên kết tài khoản LMHT — không vào được phòng. Liên kết
                  Riot ID rồi báo BTC tạo lại mã.
                </p>
              ) : null}
              {item.note ? <p className={`m-0 w-full text-xs ${GREY}`}>{item.note}</p> : null}
            </li>
          ))}
        </ul>

        {data.can_create && !openCode ? (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => void createNow()}
              className={`inline-flex min-h-11 items-center border ${RULE} px-4 text-sm font-bold disabled:opacity-50`}
            >
              BTC: tạo mã ván kế tiếp
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default LolCodePanel;
