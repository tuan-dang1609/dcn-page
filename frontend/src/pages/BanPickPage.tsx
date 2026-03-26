import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { MapCard } from "@/components/MapCard";
import { SideSelectModal } from "@/components/SideSelectModal";
import { useAuth } from "@/contexts/AuthContext";
import { useRoundBanPickSocket } from "@/hooks/useRoundBanPickSocket";

const toNumber = (value?: string | null) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeBanPickFormat = (
  value?: string | null,
): BanPickFormat | undefined => {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();

  if (normalized === "BO1" || normalized === "1") return "BO1";
  if (normalized === "BO3" || normalized === "3") return "BO3";
  if (normalized === "BO5" || normalized === "5") return "BO5";

  return undefined;
};

type SequenceStep = {
  type: "ban" | "pick";
  team: "team1" | "team2";
};

type ProgressStep = {
  type: "ban" | "pick" | "side";
  team: "team1" | "team2";
  actionIndex: number;
  sideOrder?: number;
};

type BanPickFormat = "BO1" | "BO3" | "BO5";

const ACTION_SEQUENCES: Record<BanPickFormat, SequenceStep[]> = {
  BO1: [
    { type: "ban", team: "team1" },
    { type: "ban", team: "team2" },
    { type: "ban", team: "team1" },
    { type: "ban", team: "team2" },
    { type: "ban", team: "team1" },
    { type: "ban", team: "team2" },
  ],
  BO3: [
    { type: "ban", team: "team1" },
    { type: "ban", team: "team2" },
    { type: "pick", team: "team1" },
    { type: "pick", team: "team2" },
    { type: "ban", team: "team1" },
    { type: "ban", team: "team2" },
  ],
  BO5: [
    { type: "ban", team: "team1" },
    { type: "ban", team: "team2" },
    { type: "pick", team: "team1" },
    { type: "pick", team: "team2" },
    { type: "pick", team: "team1" },
    { type: "pick", team: "team2" },
  ],
};

const getOpponent = (team: "team1" | "team2"): "team1" | "team2" =>
  team === "team1" ? "team2" : "team1";

export default function BanPickPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const { token } = useAuth();

  const roundSlug = String(slug ?? "")
    .trim()
    .toLowerCase();
  const matchId = toNumber(searchParams.get("matchId"));
  const requestedFormat = normalizeBanPickFormat(searchParams.get("format"));

  const {
    session,
    isLoading,
    error,
    viewerTeamSlot,
    canAct,
    selectMap,
    confirmAction,
    selectSide,
  } = useRoundBanPickSocket({
    roundSlug,
    matchId,
    format: requestedFormat,
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
  const actionSequence = useMemo(
    () => (banPick ? ACTION_SEQUENCES[banPick.format] : []),
    [banPick],
  );

  const progressSteps = useMemo<ProgressStep[]>(() => {
    if (!banPick || actionSequence.length === 0) return [];

    const steps: ProgressStep[] = [];
    let sideOrder = 0;

    actionSequence.forEach((step, actionIndex) => {
      steps.push({
        type: step.type,
        team: step.team,
        actionIndex,
      });

      if (step.type === "pick") {
        steps.push({
          type: "side",
          team: getOpponent(step.team),
          actionIndex,
          sideOrder,
        });
        sideOrder += 1;
      }
    });

    // BO1 has no explicit pick step in sequence, but still has one side-select step.
    if (sideOrder === 0) {
      steps.push({
        type: "side",
        team: banPick.sideSelectTeam ?? "team2",
        actionIndex: actionSequence.length,
        sideOrder: 0,
      });
    }

    return steps;
  }, [actionSequence, banPick]);

  const processState = useMemo(() => {
    if (!banPick || actionSequence.length === 0 || progressSteps.length === 0) {
      return null;
    }

    const totalActionSteps = actionSequence.length;
    const safeCurrentStep = Math.max(
      0,
      Math.min(Number(banPick.currentStep ?? 0), totalActionSteps),
    );

    const completedActionCount =
      banPick.phase === "complete" ? totalActionSteps : safeCurrentStep;

    const totalPickSteps = actionSequence.filter(
      (step) => step.type === "pick",
    ).length;
    const totalSideSteps = totalPickSteps > 0 ? totalPickSteps : 1;

    const executedPickCount = actionSequence
      .slice(0, completedActionCount)
      .filter((step) => step.type === "pick").length;

    let completedSideCount = 0;

    if (totalPickSteps === 0) {
      completedSideCount = banPick.phase === "complete" ? 1 : 0;
    } else {
      completedSideCount =
        banPick.phase === "side_select"
          ? Math.max(0, executedPickCount - 1)
          : executedPickCount;
    }

    completedSideCount = Math.max(
      0,
      Math.min(completedSideCount, totalSideSteps),
    );

    const actionIndexToStepIndex = new Map<number, number>();
    const sideOrderToStepIndex = new Map<number, number>();

    progressSteps.forEach((step, index) => {
      if (step.type === "ban" || step.type === "pick") {
        actionIndexToStepIndex.set(step.actionIndex, index);
      }

      if (step.type === "side" && step.sideOrder !== undefined) {
        sideOrderToStepIndex.set(step.sideOrder, index);
      }
    });

    const doneCount = Math.min(
      progressSteps.length,
      completedActionCount + completedSideCount,
    );

    let activeIndex = -1;

    if (banPick.phase === "side_select") {
      activeIndex = sideOrderToStepIndex.get(completedSideCount) ?? -1;
    } else if (
      banPick.phase !== "complete" &&
      completedActionCount < totalActionSteps
    ) {
      activeIndex = actionIndexToStepIndex.get(completedActionCount) ?? -1;
    }

    const currentDisplayStep =
      banPick.phase === "complete"
        ? progressSteps.length
        : activeIndex >= 0
          ? activeIndex + 1
          : Math.min(doneCount + 1, progressSteps.length);

    return {
      totalSteps: progressSteps.length,
      doneCount,
      activeIndex,
      currentDisplayStep,
    };
  }, [actionSequence, banPick, progressSteps]);

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
            Link hợp lệ cần theo dạng /round/slug?matchId=123&format=BO3
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
        <div className="max-w-5xl mx-auto grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:gap-4">
          <h2 className="font-display text-xl md:text-2xl font-bold text-foreground text-right truncate pr-2">
            {banPick.teamNames.team1}
          </h2>
          <div className="text-center flex flex-col items-center gap-1 min-w-18">
            <span className="font-display text-xs text-muted-foreground tracking-wider">
              {banPick.format}
            </span>
            <span className="font-display text-sm text-muted-foreground tracking-wider">
              VS
            </span>
          </div>
          <h2 className="font-display text-xl md:text-2xl font-bold text-foreground text-left truncate pl-2">
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

      {processState && (
        <div className="border-b border-border px-4 py-3">
          <div className="max-w-5xl mx-auto space-y-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Progress</span>
              <span>
                Step {processState.currentDisplayStep}/{processState.totalSteps}
              </span>
            </div>

            <div className="overflow-x-auto pb-1">
              <div
                className="mx-auto"
                style={{
                  minWidth: Math.max(processState.totalSteps * 120, 680),
                }}
              >
                <ul className="timeline timeline-horizontal">
                  {progressSteps.map((step, index) => {
                    const isDone = index < processState.doneCount;
                    const isCurrent =
                      !isComplete && index === processState.activeIndex;
                    const isLastStep = index === progressSteps.length - 1;

                    const connectorTargetIndex = isComplete
                      ? processState.totalSteps - 1
                      : processState.activeIndex >= 0
                        ? processState.activeIndex
                        : Math.max(processState.doneCount - 1, 0);

                    const markerClass = isCurrent
                      ? "border-primary bg-primary text-primary-foreground"
                      : isDone
                        ? "border-primary/70 bg-primary/20 text-primary"
                        : "border-border/70 bg-background text-muted-foreground";

                    const beforeLineClass =
                      index > 0 && index <= connectorTargetIndex
                        ? "bg-primary/80"
                        : "bg-border/60";

                    const afterLineClass =
                      index < connectorTargetIndex
                        ? "bg-primary/80"
                        : "bg-border/60";

                    const stepLabel =
                      step.type === "side" ? "SIDE" : step.type.toUpperCase();

                    const stepLabelTone =
                      step.type === "ban"
                        ? "text-rose-300"
                        : step.type === "pick"
                          ? "text-emerald-300"
                          : "text-amber-300";

                    const teamActionLabel =
                      step.type === "side"
                        ? `${banPick.teamNames[step.team]} chọn side`
                        : banPick.teamNames[step.team];

                    return (
                      <li key={`${step.team}-${step.type}-${index}`}>
                        {index > 0 && <hr className={beforeLineClass} />}

                        <div className="timeline-middle">
                          <span
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-bold ${markerClass}`}
                          >
                            {index + 1}
                          </span>
                        </div>

                        <div
                          className={`${index % 2 === 0 ? "timeline-start" : "timeline-end"} timeline-box min-w-32 border-border/70 bg-card/70 px-2 py-1 text-center`}
                        >
                          <p
                            className={`text-[10px] font-semibold uppercase tracking-wide ${stepLabelTone}`}
                          >
                            {stepLabel}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {teamActionLabel}
                          </p>
                          <p className="text-[9px] uppercase tracking-wide text-primary/90">
                            {isCurrent ? "NOW" : isDone ? "DONE" : "UPCOMING"}
                          </p>
                        </div>

                        {!isLastStep && <hr className={afterLineClass} />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            {banPick.phase === "side_select" && (
              <p className="text-[11px] text-amber-300">
                Đang chọn side cho map vừa pick.
              </p>
            )}
          </div>
        </div>
      )}

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
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          {banPick.phase === "ban_pick" && canAct && isMyTurn && (
            <button
              onClick={() => void confirmAction()}
              disabled={!banPick.selectedMapId}
              className={`
                w-full sm:w-auto sm:min-w-55 py-3 font-display text-lg tracking-widest transition-all
                ${
                  banPick.selectedMapId
                    ? currentAction?.type === "ban"
                      ? "bg-destructive text-destructive-foreground hover:brightness-110 active:scale-[0.98]"
                      : "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98]"
                    : "bg-val-disabled text-muted-foreground cursor-not-allowed"
                }
              `}
            >
              {banPick.selectedMapId
                ? `LOCK IN ${currentAction?.type === "ban" ? "BAN" : "PICK"}`
                : "SELECT A MAP"}
            </button>
          )}

          {banPick.phase === "ban_pick" &&
            canAct &&
            !isMyTurn &&
            !isComplete && (
              <button
                disabled
                className="ml-auto w-full sm:w-auto sm:min-w-55 py-3 font-display text-lg tracking-widest bg-val-disabled text-muted-foreground cursor-not-allowed"
              >
                WAIT FOR TURN
              </button>
            )}

          {isComplete && (
            <div className="ml-auto flex w-full sm:w-auto sm:min-w-55 justify-end">
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
