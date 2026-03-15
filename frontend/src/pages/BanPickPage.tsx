import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { MapCard } from "@/components/MapCard";
import { SideSelectModal } from "@/components/SideSelectModal";
import { RotateCcw, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRoundBanPickSocket } from "@/hooks/useRoundBanPickSocket";

const toNumber = (value?: string | null) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function BanPickPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const { token } = useAuth();

  const roundSlug = String(slug ?? "")
    .trim()
    .toLowerCase();
  const matchId = toNumber(searchParams.get("matchId"));

  const {
    session,
    isLoading,
    isConnected,
    error,
    viewerTeamSlot,
    canAct,
    selectMap,
    confirmAction,
    selectSide,
    reset,
  } = useRoundBanPickSocket({
    roundSlug,
    matchId,
    token,
  });

  const mapByCode = useMemo(() => {
    const entries = (session?.map_pool ?? []).map((item) => [
      item.map_code,
      item,
    ]);
    return Object.fromEntries(entries);
  }, [session?.map_pool]);

  const banPick = session?.state;
  const sideSelectMap =
    banPick?.sideSelectMapId && mapByCode[banPick.sideSelectMapId]
      ? mapByCode[banPick.sideSelectMapId]
      : null;

  const sideSelectTeamName =
    banPick?.sideSelectTeam && banPick?.teamNames
      ? banPick.teamNames[banPick.sideSelectTeam]
      : "";

  const isComplete = banPick?.phase === "complete";
  const currentAction = session?.current_action ?? null;

  const isMyTurn =
    Boolean(viewerTeamSlot) &&
    ((banPick?.phase === "ban_pick" &&
      currentAction?.team === viewerTeamSlot) ||
      (banPick?.phase === "side_select" &&
        banPick?.sideSelectTeam === viewerTeamSlot));

  const currentActionLabel = (() => {
    if (!banPick) return "ĐANG TẢI";

    if (banPick.phase === "side_select" && banPick.sideSelectTeam) {
      return `${banPick.teamNames[banPick.sideSelectTeam]} - CHỌN SIDE`;
    }

    if (banPick.phase === "complete") return "HOÀN TẤT";
    if (!currentAction) return "HOÀN TẤT";

    const currentTeamName = banPick.teamNames[currentAction.team];
    return `${currentTeamName} - ${currentAction.type === "ban" ? "BAN" : "PICK"} PHASE`;
  })();

  if (!roundSlug) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-xl border border-border rounded-lg p-6 space-y-4 bg-card">
          <h1 className="font-display text-2xl text-foreground">
            Thiếu round slug
          </h1>
          <p className="text-sm text-muted-foreground">
            Link hợp lệ cần theo dạng /round/slug?matchId=123
          </p>
          <Link to="/" className="text-primary hover:underline text-sm">
            Quay lại trang chủ
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading && !banPick) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <h1 className="font-display text-3xl text-foreground">
            Đang tải ban/pick
          </h1>
          <p className="text-muted-foreground text-sm">Round: {roundSlug}</p>
        </div>
      </div>
    );
  }

  if (!banPick || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-xl border border-border rounded-lg p-6 space-y-4 bg-card">
          <h1 className="font-display text-2xl text-foreground">
            Không tìm thấy phiên ban/pick
          </h1>
          <p className="text-sm text-muted-foreground">
            Hãy mở link có thêm matchId để backend tự khởi tạo ban/pick cho
            trận.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b-2 border-border px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h2 className="font-display text-xl md:text-2xl font-bold text-foreground">
            {banPick.teamNames.team1}
          </h2>
          <div className="text-center flex flex-col items-center gap-1">
            <span className="font-display text-xs text-muted-foreground tracking-wider">
              {banPick.format}
            </span>
            <span className="font-display text-sm text-muted-foreground tracking-wider">
              VS
            </span>
            <div
              className={`inline-flex items-center gap-1 text-[10px] ${isConnected ? "text-emerald-400" : "text-amber-400"}`}
            >
              {isConnected ? (
                <Wifi className="w-3 h-3" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
              {isConnected ? "REALTIME" : "RECONNECTING"}
            </div>
          </div>
          <h2 className="font-display text-xl md:text-2xl font-bold text-foreground">
            {banPick.teamNames.team2}
          </h2>
        </div>
      </header>

      {!canAct && (
        <div className="border-b border-border px-4 py-2 text-center text-xs text-muted-foreground">
          Bạn đang ở chế độ xem. Chỉ thành viên của 2 team trong trận mới có thể
          thao tác ban/pick.
        </div>
      )}

      {canAct && !isMyTurn && !isComplete && (
        <div className="border-b border-border px-4 py-2 text-center text-xs text-amber-300">
          Đã xác thực team của bạn, nhưng hiện chưa tới lượt thao tác.
        </div>
      )}

      {/* Phase indicator */}
      <div className="border-b border-border px-4 py-3">
        <div className="max-w-5xl mx-auto text-center">
          {isComplete ? (
            <span className="font-display text-lg text-primary tracking-widest">
              BAN/PICK HOÀN TẤT
            </span>
          ) : banPick.phase === "side_select" ? (
            <span className="font-display text-lg tracking-widest text-amber-400 phase-pulse">
              {currentActionLabel}
            </span>
          ) : (
            <span
              className={`font-display text-lg tracking-widest phase-pulse ${
                currentAction?.type === "ban"
                  ? "text-destructive"
                  : "text-primary"
              }`}
            >
              {currentActionLabel}
            </span>
          )}
        </div>
      </div>

      {/* Map grid */}
      <main className="flex-1 px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {banPick.maps.map((mapState) => (
              <MapCard
                key={mapState.mapId}
                mapState={mapState}
                isSelected={banPick.selectedMapId === mapState.mapId}
                onSelect={selectMap}
                disabled={banPick.phase !== "ban_pick" || !isMyTurn}
                teamNames={banPick.teamNames}
                mapMeta={mapByCode[mapState.mapId]}
              />
            ))}
          </div>
        </div>
      </main>

      {/* Action bar */}
      <footer className="sticky bottom-0 border-t-2 border-border bg-background px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <button
            onClick={() => void reset()}
            disabled={!canAct}
            className="flex items-center gap-2 px-4 py-3 border-2 border-border font-display text-sm 
              text-muted-foreground tracking-wider hover:border-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-4 h-4" />
            RESET
          </button>

          {banPick.phase === "ban_pick" && (
            <button
              onClick={() => void confirmAction()}
              disabled={!banPick.selectedMapId || !isMyTurn}
              className={`
                flex-1 max-w-xs py-3 font-display text-lg tracking-widest transition-all
                ${
                  banPick.selectedMapId && isMyTurn
                    ? currentAction?.type === "ban"
                      ? "bg-destructive text-destructive-foreground hover:brightness-110 active:scale-[0.98]"
                      : "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98]"
                    : "bg-val-disabled text-muted-foreground cursor-not-allowed"
                }
              `}
            >
              {banPick.selectedMapId
                ? `LOCK IN ${currentAction?.type === "ban" ? "BAN" : "PICK"}`
                : isMyTurn
                  ? "SELECT A MAP"
                  : "WAIT FOR TURN"}
            </button>
          )}

          {isComplete && (
            <div className="flex-1 max-w-xs text-center">
              <span className="font-display text-primary text-lg tracking-widest">
                MAPS LOCKED
              </span>
            </div>
          )}
        </div>
      </footer>

      {/* Side select modal */}
      {banPick.phase === "side_select" && sideSelectMap && (
        <SideSelectModal
          mapName={sideSelectMap.map_name}
          teamName={sideSelectTeamName}
          onSelect={(side) => {
            if (!isMyTurn) return;
            void selectSide(side);
          }}
        />
      )}
    </div>
  );
}
