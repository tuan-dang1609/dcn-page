import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import {
  getBracketPickemData,
  saveBracketPicks,
  type UserBracketPick,
} from "@/api/pickem";
import {
  getBracketsByTournamentId,
  type Bracket,
} from "@/api/tournaments/index";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import AutoFitContent from "@/components/AutoFitContent";
import SingleElimBracket from "@/components/BracketView";
import DoubleElimBracket from "@/components/DoubleElimBracket";
import SwissBracket from "@/components/SwissBracket";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const toErrorMessage = (error: unknown, fallback: string) => {
  if (!error || typeof error !== "object") return fallback;
  const maybeResponse = error as {
    response?: {
      data?: {
        error?: string;
        message?: string;
      };
    };
    message?: string;
  };

  return (
    maybeResponse.response?.data?.error ??
    maybeResponse.response?.data?.message ??
    maybeResponse.message ??
    fallback
  );
};

type MatchPickStatus = {
  isResolved: boolean;
  isCorrect: boolean | null;
  winnerTeamId: number | null;
};

const serializePicks = (pickedTeamByMatch: Record<number, number>) =>
  Object.entries(pickedTeamByMatch)
    .map(([matchIdRaw, selectedTeamIdRaw]) => {
      const matchId = Number(matchIdRaw);
      const selectedTeamId = Number(selectedTeamIdRaw);

      if (!Number.isFinite(matchId) || !Number.isFinite(selectedTeamId)) {
        return null;
      }

      return {
        matchId,
        selectedTeamId,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

const buildPickStatusByMatchId = (picks: UserBracketPick[] | undefined) => {
  const map: Record<number, MatchPickStatus> = {};

  (picks ?? []).forEach((pick) => {
    const matchId = toNumber(pick.matchId);
    if (!matchId) return;

    map[matchId] = {
      isResolved: Boolean(pick.isResolved),
      isCorrect: typeof pick.isCorrect === "boolean" ? pick.isCorrect : null,
      winnerTeamId: toNumber(pick.winnerTeamId),
    };
  });

  return map;
};

type PickemOutletContext = {
  tournament?: {
    id?: number | string;
    name?: string;
  };
  isLoading?: boolean;
};

const PickemPage = () => {
  const { tournament, isLoading: isTournamentLoading } =
    useOutletContext<PickemOutletContext>();
  const tournamentId = toNumber(tournament?.id);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeBracketId, setActiveBracketId] = useState<number | null>(null);
  const [pickedTeamByMatch, setPickedTeamByMatch] = useState<
    Record<number, number>
  >({});
  const pickedTeamByMatchRef = useRef<Record<number, number>>({});

  const bracketsQuery = useQuery({
    queryKey: ["pickem-brackets", tournamentId],
    enabled: Boolean(tournamentId),
    queryFn: async () => {
      const response = await getBracketsByTournamentId(tournamentId!);
      const items = response.data?.data ?? [];

      return items
        .map((bracket) => ({
          ...bracket,
          id: toNumber(bracket.id),
          format_id: toNumber(bracket.format_id),
        }))
        .filter(
          (
            bracket,
          ): bracket is Bracket & {
            id: number;
            format_id: number | undefined;
          } => Number.isFinite(bracket.id),
        );
    },
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    const brackets = bracketsQuery.data ?? [];
    if (!brackets.length || activeBracketId) return;

    const firstBracketId = Number(brackets[0].id);
    setActiveBracketId(firstBracketId);
  }, [activeBracketId, bracketsQuery.data]);

  const pickemDataQuery = useQuery({
    queryKey: ["pickem-bracket-data", activeBracketId, user?.id],
    enabled: Boolean(activeBracketId),
    queryFn: async () => {
      const response = await getBracketPickemData(activeBracketId!, user?.id);
      return response.data;
    },
    staleTime: 10000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    setPickedTeamByMatch({});
    pickedTeamByMatchRef.current = {};
  }, [activeBracketId]);

  useEffect(() => {
    const picks = pickemDataQuery.data?.myPicks?.picks ?? [];
    const next: Record<number, number> = {};
    picks.forEach((pick) => {
      const matchId = toNumber(pick.matchId);
      const selectedTeamId = toNumber(pick.selectedTeamId);
      if (!matchId || !selectedTeamId) return;

      next[matchId] = selectedTeamId;
    });

    pickedTeamByMatchRef.current = next;
    setPickedTeamByMatch(next);
  }, [pickemDataQuery.data?.myPicks?.picks]);

  useEffect(() => {
    pickedTeamByMatchRef.current = pickedTeamByMatch;
  }, [pickedTeamByMatch]);

  const matches = pickemDataQuery.data?.matches ?? [];

  const pickableMatches = useMemo(
    () =>
      matches.filter(
        (match) => toNumber(match.team_a_id) && toNumber(match.team_b_id),
      ),
    [matches],
  );

  const pickStatusByMatchId = useMemo(
    () => buildPickStatusByMatchId(pickemDataQuery.data?.myPicks?.picks),
    [pickemDataQuery.data?.myPicks?.picks],
  );

  const saveMutation = useMutation({
    mutationFn: async ({
      bracketId,
      picksByMatch,
    }: {
      bracketId: number;
      picksByMatch: Record<number, number>;
    }) => {
      if (!bracketId || !user?.id) {
        throw new Error("Ban can dang nhap de luu du doan");
      }

      return saveBracketPicks(bracketId, {
        userId: user.id,
        user: {
          userId: user.id,
          nickname: user.nickname,
          img: user.profile_picture,
          teamName: user.team?.name ?? null,
          logoTeam: user.team?.logo_url ?? null,
        },
        picks: serializePicks(picksByMatch),
      });
    },
    onSuccess: async (_response, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["pickem-bracket-data", variables.bracketId, user?.id],
      });
    },
    onError: (error) => {
      toast({
        title: "Luu Pick'em that bai",
        description: toErrorMessage(error, "Vui long thu lai sau."),
        variant: "destructive",
      });
    },
  });

  const pickTeam = (matchId: number, teamId: number) => {
    const previous = pickedTeamByMatchRef.current;

    let next: Record<number, number>;
    if (previous[matchId] === teamId) {
      next = { ...previous };
      delete next[matchId];
    } else {
      next = {
        ...previous,
        [matchId]: teamId,
      };
    }

    pickedTeamByMatchRef.current = next;
    setPickedTeamByMatch(next);

    if (activeBracketId && user?.id) {
      saveMutation.mutate({
        bracketId: activeBracketId,
        picksByMatch: next,
      });
    }
  };

  const selectedBracket = pickemDataQuery.data?.bracket;
  const pickStats = pickemDataQuery.data?.myPicks?.stats;
  const correctCount =
    pickStats?.correctPicks ??
    Object.values(pickStatusByMatchId).filter((status) => status.isCorrect)
      .length;
  const selectedFormatId = toNumber(selectedBracket?.format_id);
  const selectedFormatType = normalizeText(
    selectedBracket?.format_type,
  ).toLowerCase();
  const isSwissBracket = selectedFormatType === "swiss";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-heading">Pick'em Tournament</h2>
          <p className="text-sm text-muted-foreground">
            Bam truc tiep vao doi trong bracket de chon doi thang tung tran.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Dung {correctCount}</Badge>
        </div>
      </div>

      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Chon Bracket</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(bracketsQuery.data ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {(bracketsQuery.data ?? []).map((bracket) => {
                const bracketId = Number(bracket.id);
                const isActive = activeBracketId === bracketId;

                return (
                  <Button
                    key={bracketId}
                    type="button"
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                    onClick={() => {
                      setActiveBracketId(bracketId);
                    }}
                  >
                    {normalizeText(bracket.name) || "Bracket"}
                  </Button>
                );
              })}
            </div>
          ) : null}

          {isTournamentLoading || bracketsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Dang tai bracket...</p>
          ) : null}

          {bracketsQuery.isError ? (
            <p className="text-sm text-destructive">
              {toErrorMessage(
                bracketsQuery.error,
                "Khong tai duoc danh sach bracket.",
              )}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {pickemDataQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">
          Dang tai du lieu Pick'em...
        </p>
      ) : null}

      {pickemDataQuery.isError ? (
        <p className="text-sm text-destructive">
          {toErrorMessage(
            pickemDataQuery.error,
            "Khong tai duoc du lieu Pick'em theo bracket.",
          )}
        </p>
      ) : null}

      {activeBracketId &&
      !pickemDataQuery.isLoading &&
      !pickemDataQuery.isError ? (
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Bracket View</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-0 py-4">
            <p className="text-sm text-muted-foreground">
              Chon doi thang bang cach bam vao ten doi trong moi match.
            </p>

            {pickStats ? (
              <p className="text-xs text-muted-foreground">
                Match da co ket qua se tu dong danh dau Dung/Sai. Diem tinh theo
                round: R1 = 1, R2 = 2, R3 = 4...
              </p>
            ) : null}

            <AutoFitContent>
              {selectedFormatId === 1 ? (
                <SingleElimBracket
                  bracketId={activeBracketId}
                  selectedTeamByMatchId={pickedTeamByMatch}
                  pickStatusByMatchId={pickStatusByMatchId}
                  onPickTeam={pickTeam}
                  disableMatchLink
                />
              ) : null}

              {selectedFormatId === 2 ? (
                <DoubleElimBracket
                  bracketId={activeBracketId}
                  selectedTeamByMatchId={pickedTeamByMatch}
                  pickStatusByMatchId={pickStatusByMatchId}
                  onPickTeam={pickTeam}
                  disableMatchLink
                />
              ) : null}

              {isSwissBracket ? (
                <SwissBracket
                  bracketId={activeBracketId}
                  selectedTeamByMatchId={pickedTeamByMatch}
                  pickStatusByMatchId={pickStatusByMatchId}
                  onPickTeam={pickTeam}
                  disableMatchLink
                />
              ) : null}

              {!isSwissBracket &&
              selectedFormatId !== 1 &&
              selectedFormatId !== 2 ? (
                <p className="text-sm text-muted-foreground">
                  Bracket nay co format khac. He thong hien chi render style cho
                  single, double va swiss.
                </p>
              ) : null}
            </AutoFitContent>
          </CardContent>
        </Card>
      ) : null}

      {activeBracketId ? (
        !pickableMatches.length && !pickemDataQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">
            Bracket nay chua co tran nao du doi hinh de pick.
          </p>
        ) : null
      ) : null}

      {activeBracketId ? (
        <Card className="border-0 bg-transparent shadow-none">
          <CardContent className="p-4">
            <div className="space-y-1">
              {!user ? (
                <p className="text-sm text-muted-foreground">
                  Dang nhap de tu dong luu Pick'em cua ban ngay khi chon doi.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Chon doi la he thong se tu dong luu ngay.
                </p>
              )}

              {user ? (
                <p className="text-xs text-muted-foreground">
                  {saveMutation.isPending
                    ? "Dang tu dong luu..."
                    : "Da bat tu dong luu."}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default PickemPage;
