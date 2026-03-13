import { useState, useCallback } from "react";
import {
  VALORANT_MAPS,
  MapState,
  Team,
  Side,
  GameFormat,
  getSequence,
  getOpponent,
} from "@/data/maps";

export type Phase = "ban_pick" | "side_select" | "complete";

export interface BanPickState {
  maps: MapState[];
  currentStep: number;
  format: GameFormat;
  teamNames: { team1: string; team2: string };
  phase: Phase;
  selectedMapId: string | null;
  // Which map needs side selection and who picks
  sideSelectMapId: string | null;
  sideSelectTeam: Team | null;
  actionLog: Array<{
    step: number;
    mapId: string;
    action: string;
    team: Team;
    side?: string;
  }>;
}

export function useBanPick(
  team1Name: string,
  team2Name: string,
  format: GameFormat,
) {
  const sequence = getSequence(format);

  const [state, setState] = useState<BanPickState>({
    maps: VALORANT_MAPS.map((m) => ({ mapId: m.id, status: "available" })),
    currentStep: 0,
    format,
    teamNames: { team1: team1Name, team2: team2Name },
    phase: "ban_pick",
    selectedMapId: null,
    sideSelectMapId: null,
    sideSelectTeam: null,
    actionLog: [],
  });

  const currentAction =
    state.currentStep < sequence.length ? sequence[state.currentStep] : null;

  const selectMap = useCallback((mapId: string) => {
    setState((prev) => {
      const map = prev.maps.find((m) => m.mapId === mapId);
      if (!map || map.status !== "available" || prev.phase !== "ban_pick")
        return prev;
      return { ...prev, selectedMapId: mapId };
    });
  }, []);

  const confirmAction = useCallback(() => {
    setState((prev) => {
      if (!prev.selectedMapId || !currentAction || prev.phase !== "ban_pick")
        return prev;

      const actionType = currentAction.type;
      const newMaps = prev.maps.map((m) =>
        m.mapId === prev.selectedMapId
          ? {
              ...m,
              status:
                actionType === "ban"
                  ? ("banned" as const)
                  : ("picked" as const),
              actionBy: currentAction.team,
              actionType: actionType,
            }
          : m,
      );

      const newLog = [
        ...prev.actionLog,
        {
          step: prev.currentStep,
          mapId: prev.selectedMapId,
          action: actionType,
          team: currentAction.team,
        },
      ];

      const nextStep = prev.currentStep + 1;
      const isSequenceComplete = nextStep >= sequence.length;

      // If this was a PICK action, need side selection
      if (actionType === "pick") {
        const sideTeam = getOpponent(currentAction.team);
        return {
          ...prev,
          maps: newMaps,
          selectedMapId: null,
          phase: "side_select" as Phase,
          sideSelectMapId: prev.selectedMapId,
          sideSelectTeam: sideTeam,
          currentStep: nextStep,
          actionLog: newLog,
        };
      }

      // If sequence is complete after a ban
      if (isSequenceComplete) {
        return handleSequenceComplete(prev, newMaps, nextStep, newLog);
      }

      return {
        ...prev,
        maps: newMaps,
        currentStep: nextStep,
        selectedMapId: null,
        actionLog: newLog,
      };
    });
  }, [currentAction, sequence]);

  const selectSide = useCallback(
    (side: Side) => {
      setState((prev) => {
        if (
          prev.phase !== "side_select" ||
          !prev.sideSelectMapId ||
          !prev.sideSelectTeam
        )
          return prev;

        const chooserSide = side;
        const otherSide: Side = side === "ATK" ? "DEF" : "ATK";
        const chooser = prev.sideSelectTeam;
        const other = getOpponent(chooser);

        const sideMap: { team1: Side; team2: Side } =
          chooser === "team1"
            ? { team1: chooserSide, team2: otherSide }
            : { team1: otherSide, team2: chooserSide };

        const newMaps = prev.maps.map((m) =>
          m.mapId === prev.sideSelectMapId
            ? { ...m, side: sideMap, sideChosenBy: chooser }
            : m,
        );

        const isSequenceComplete = prev.currentStep >= sequence.length;

        if (isSequenceComplete) {
          return handleSequenceComplete(
            prev,
            newMaps,
            prev.currentStep,
            prev.actionLog,
          );
        }

        return {
          ...prev,
          maps: newMaps,
          phase: "ban_pick" as Phase,
          sideSelectMapId: null,
          sideSelectTeam: null,
        };
      });
    },
    [sequence],
  );

  function handleSequenceComplete(
    prev: BanPickState,
    maps: MapState[],
    step: number,
    log: BanPickState["actionLog"],
  ): BanPickState {
    const format = prev.format;

    if (format === "BO1") {
      // Remaining map is the chosen map, team2 picks side
      const remaining = maps.find((m) => m.status === "available");
      if (remaining) {
        remaining.status = "picked";
        remaining.actionType = "pick";
        // team2 (opponent of first banner team1) picks side
        return {
          ...prev,
          maps: [...maps],
          currentStep: step,
          phase: "side_select",
          sideSelectMapId: remaining.mapId,
          sideSelectTeam: "team2",
          selectedMapId: null,
          actionLog: log,
        };
      }
    }

    // BO3 / BO5: remaining map is decider, no side selection
    const remaining = maps.find((m) => m.status === "available");
    if (remaining) {
      remaining.status = "decider";
      remaining.actionType = "pick";
    }

    return {
      ...prev,
      maps: [...maps],
      currentStep: step,
      phase: "complete",
      selectedMapId: null,
      sideSelectMapId: null,
      sideSelectTeam: null,
      actionLog: log,
    };
  }

  const reset = useCallback(() => {
    setState({
      maps: VALORANT_MAPS.map((m) => ({ mapId: m.id, status: "available" })),
      currentStep: 0,
      format,
      teamNames: { team1: team1Name, team2: team2Name },
      phase: "ban_pick",
      selectedMapId: null,
      sideSelectMapId: null,
      sideSelectTeam: null,
      actionLog: [],
    });
  }, [team1Name, team2Name, format]);

  const currentTeamName = currentAction
    ? state.teamNames[currentAction.team]
    : null;

  const currentActionLabel = (() => {
    if (state.phase === "side_select" && state.sideSelectTeam) {
      return `${state.teamNames[state.sideSelectTeam]} — CHỌN SIDE`;
    }
    if (state.phase === "complete") return "HOÀN TẤT";
    if (!currentAction) return "HOÀN TẤT";
    return `${currentTeamName} — ${currentAction.type === "ban" ? "BAN" : "PICK"} PHASE`;
  })();

  return {
    ...state,
    currentAction,
    currentTeamName,
    currentActionLabel,
    selectMap,
    confirmAction,
    selectSide,
    reset,
  };
}
