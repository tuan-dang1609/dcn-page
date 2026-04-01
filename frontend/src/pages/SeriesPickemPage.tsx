import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  getBracketPickemData,
  saveBracketPicks,
  type UserBracketPick,
} from "@/api/pickem";
import {
  getBracketsByTournamentId,
  type Bracket,
} from "@/api/tournaments/index";
import AutoFitContent from "@/components/AutoFitContent";
import SingleElimBracket from "@/components/BracketView";
import DoubleElimBracket from "@/components/DoubleElimBracket";
import SwissBracket from "@/components/SwissBracket";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useSeriesById } from "@/hooks/useSeriesById";
import { useToast } from "@/hooks/use-toast";

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

type SeriesTournamentOption = {
  id: number;
  name: string;
  shortName?: string;
  dateStart?: string;
  dateEnd?: string;
  section: "ongoing" | "upcoming" | "completed";
};

type BracketOption = Bracket & {
  id: number;
  format_id: number;
  tournament_id: number;
};

const getTournamentSection = (
  dateStart?: string,
  dateEnd?: string,
): SeriesTournamentOption["section"] => {
  const now = Date.now();
  const start = dateStart ? new Date(dateStart).getTime() : null;
  const end = dateEnd ? new Date(dateEnd).getTime() : null;

  if (start && now < start) return "upcoming";
  if (end && now > end) return "completed";
  return "ongoing";
};

const SeriesPickemPage = () => {
  const { slug } = useParams<{ slug?: string }>();
  const seriesSlug = slug ?? "";
  const navigate = useNavigate();

  const { series, isLoading, error } = useSeriesById(seriesSlug);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const seriesTournaments = useMemo<SeriesTournamentOption[]>(() => {
    return (series?.all_tournaments ?? [])
      .map<SeriesTournamentOption | null>((item) => {
        const id = toNumber(item.id);
        if (!id) return null;

        return {
          id,
          name: item.name,
          shortName: item.short_name ?? undefined,
          dateStart: item.date_start,
          dateEnd: item.date_end,
          section: getTournamentSection(item.date_start, item.date_end),
        };
      })
      .filter((item): item is SeriesTournamentOption => item !== null);
  }, [series?.all_tournaments]);

  const [pickedTeamByBracket, setPickedTeamByBracket] = useState<
    Record<number, Record<number, number>>
  >({});
  const pickedTeamByBracketRef = useRef<Record<number, Record<number, number>>>(
    {},
  );
  const [dirtyBracketMap, setDirtyBracketMap] = useState<
    Record<number, boolean>
  >({});

  useEffect(() => {
    if (series?.slug && series.slug !== seriesSlug) {
      navigate(`/series/${series.slug}/pickem`, { replace: true });
    }
  }, [navigate, series?.slug, seriesSlug]);

  const bracketQueries = useQueries({
    queries: seriesTournaments.map((tournament) => ({
      queryKey: ["series-pickem-brackets", tournament.id],
      queryFn: async (): Promise<BracketOption[]> => {
        const response = await getBracketsByTournamentId(tournament.id);
        const items = response.data?.data ?? [];

        return items
          .map((bracket) => ({
            ...bracket,
            id: toNumber(bracket.id),
            format_id: toNumber(bracket.format_id) ?? 0,
            tournament_id: toNumber(bracket.tournament_id) ?? tournament.id,
          }))
          .filter((bracket): bracket is BracketOption =>
            Number.isFinite(bracket.id),
          );
      },
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  });

  const sectionOrder: Array<SeriesTournamentOption["section"]> = [
    "ongoing",
    "upcoming",
    "completed",
  ];

  const sectionLabel: Record<SeriesTournamentOption["section"], string> = {
    ongoing: "Dang dien ra",
    upcoming: "Sap dien ra",
    completed: "Da ket thuc",
  };

  const tournamentBundles = useMemo(
    () =>
      seriesTournaments.map((tournament, index) => ({
        tournament,
        query: bracketQueries[index],
        brackets: bracketQueries[index]?.data ?? [],
      })),
    [seriesTournaments, bracketQueries],
  );

  const allBracketItems = useMemo(
    () =>
      tournamentBundles.flatMap((bundle) =>
        bundle.brackets.map((bracket) => ({
          ...bracket,
          tournamentId: bundle.tournament.id,
          tournamentName: bundle.tournament.name,
          section: bundle.tournament.section,
        })),
      ),
    [tournamentBundles],
  );

  const pickemDataQueries = useQueries({
    queries: allBracketItems.map((item) => ({
      queryKey: ["series-pickem-data", item.id, user?.id],
      queryFn: async () => {
        const response = await getBracketPickemData(item.id, user?.id);
        return response.data;
      },
      staleTime: 10000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  });

  const pickemQueryByBracketId = useMemo(() => {
    const map = new Map<number, (typeof pickemDataQueries)[number]>();

    allBracketItems.forEach((item, index) => {
      map.set(item.id, pickemDataQueries[index]);
    });

    return map;
  }, [allBracketItems, pickemDataQueries]);

  const bundleGroups = useMemo(() => {
    return sectionOrder.map((section) => ({
      section,
      label: sectionLabel[section],
      bundles: tournamentBundles.filter(
        (bundle) => bundle.tournament.section === section,
      ),
    }));
  }, [tournamentBundles]);

  useEffect(() => {
    setPickedTeamByBracket((previous) => {
      let changed = false;
      const next = { ...previous };

      allBracketItems.forEach((item, index) => {
        const bracketId = toNumber(item.id);
        if (!bracketId || dirtyBracketMap[bracketId]) return;

        const picks = pickemDataQueries[index]?.data?.myPicks?.picks ?? [];
        if (!pickemDataQueries[index]?.data) return;

        const incoming: Record<number, number> = {};
        picks.forEach((pick) => {
          const matchId = toNumber(pick.matchId);
          const selectedTeamId = toNumber(pick.selectedTeamId);
          if (!matchId || !selectedTeamId) return;
          incoming[matchId] = selectedTeamId;
        });

        const current = previous[bracketId] ?? {};
        const currentKeys = Object.keys(current);
        const incomingKeys = Object.keys(incoming);
        const isSame =
          currentKeys.length === incomingKeys.length &&
          currentKeys.every(
            (key) => current[Number(key)] === incoming[Number(key)],
          );

        if (!isSame) {
          next[bracketId] = incoming;
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [allBracketItems, dirtyBracketMap, pickemDataQueries]);

  useEffect(() => {
    pickedTeamByBracketRef.current = pickedTeamByBracket;
  }, [pickedTeamByBracket]);

  const totalCorrectCount = useMemo(
    () =>
      pickemDataQueries.reduce((sum, query) => {
        return sum + (query.data?.myPicks?.stats?.correctPicks ?? 0);
      }, 0),
    [pickemDataQueries],
  );

  const pickTeam = (bracketId: number, matchId: number, teamId: number) => {
    const previous = pickedTeamByBracketRef.current;
    const currentBracket = previous[bracketId] ?? {};

    const nextBracket =
      currentBracket[matchId] === teamId
        ? (() => {
            const removed = { ...currentBracket };
            delete removed[matchId];
            return removed;
          })()
        : {
            ...currentBracket,
            [matchId]: teamId,
          };

    const next = {
      ...previous,
      [bracketId]: nextBracket,
    };

    pickedTeamByBracketRef.current = next;
    setPickedTeamByBracket(next);

    setDirtyBracketMap((previous) => ({
      ...previous,
      [bracketId]: true,
    }));

    if (user?.id) {
      saveMutation.mutate({
        bracketId,
        picksByMatch: nextBracket,
      });
    }
  };

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
        queryKey: ["series-pickem-data", variables.bracketId, user?.id],
      });

      setDirtyBracketMap((previous) => {
        if (!previous[variables.bracketId]) return previous;

        const next = { ...previous };
        delete next[variables.bracketId];
        return next;
      });
    },
    onError: (err) => {
      toast({
        title: "Luu Pick'em that bai",
        description: toErrorMessage(err, "Vui long thu lai sau."),
        variant: "destructive",
      });
    },
  });
  const backSeriesSlug = series?.slug ?? seriesSlug;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">
          Dang tai du lieu series...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="text-base font-semibold text-foreground mb-2">
            Khong tai duoc du lieu series
          </p>
          <p className="text-sm text-muted-foreground">
            Vui long thu lai sau hoac kiem tra ket noi API.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/series/${backSeriesSlug}`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Quay lai series
              </Link>
            </Button>
            <h1 className="text-2xl font-heading">Pick'em Series</h1>
            <p className="text-sm text-muted-foreground">
              Hien tat ca bracket theo tung muc. Bam truc tiep vao doi tren
              bracket de pick.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Dung {totalCorrectCount}</Badge>
          </div>
        </div>

        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pick'em Theo Muc</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!seriesTournaments.length ? (
              <p className="text-sm text-muted-foreground">
                Series nay chua co tournament.
              </p>
            ) : (
              <div className="space-y-4">
                {bundleGroups.map((group) => {
                  if (!group.bundles.length) return null;

                  return (
                    <div key={group.section} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.label}
                      </p>

                      <div className="space-y-2">
                        {group.bundles.map((bundle) => {
                          const tournamentLabel =
                            normalizeText(bundle.tournament.shortName) ||
                            normalizeText(bundle.tournament.name);

                          return (
                            <div
                              key={bundle.tournament.id}
                              className="space-y-2"
                            >
                              <p className="mb-2 text-sm font-semibold">
                                {tournamentLabel}
                              </p>

                              {bundle.query.isLoading ? (
                                <p className="text-sm text-muted-foreground">
                                  Dang tai bracket...
                                </p>
                              ) : null}

                              {bundle.query.isError ? (
                                <p className="text-sm text-destructive">
                                  {toErrorMessage(
                                    bundle.query.error,
                                    "Khong tai duoc danh sach bracket.",
                                  )}
                                </p>
                              ) : null}

                              {bundle.brackets.length ? (
                                <div className="space-y-3">
                                  {bundle.brackets.map((bracket) => {
                                    const bracketId = Number(bracket.id);
                                    const pickemQuery =
                                      pickemQueryByBracketId.get(bracketId);
                                    const pickemData = pickemQuery?.data;
                                    const selectedPicks =
                                      pickedTeamByBracket[bracketId] ?? {};
                                    const matches = pickemData?.matches ?? [];
                                    const pickStats =
                                      pickemData?.myPicks?.stats;
                                    const pickStatusByMatchId =
                                      buildPickStatusByMatchId(
                                        pickemData?.myPicks?.picks,
                                      );
                                    const pickableCount = matches.filter(
                                      (match) =>
                                        toNumber(match.team_a_id) &&
                                        toNumber(match.team_b_id),
                                    ).length;
                                    const bracketInfo = pickemData?.bracket;
                                    const formatId = toNumber(
                                      bracketInfo?.format_id ??
                                        bracket.format_id,
                                    );
                                    const formatType = normalizeText(
                                      bracketInfo?.format_type ??
                                        bracket.format_type,
                                    ).toLowerCase();
                                    const isSwissBracket =
                                      formatType === "swiss";
                                    const isSavingThisBracket =
                                      saveMutation.isPending &&
                                      saveMutation.variables?.bracketId ===
                                        bracketId;

                                    return (
                                      <Card
                                        key={bracketId}
                                        className="border-0 bg-transparent shadow-none"
                                      >
                                        <CardHeader className="pb-2">
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <CardTitle className="text-sm">
                                              {normalizeText(bracket.name) ||
                                                "Bracket"}
                                            </CardTitle>
                                            <div className="flex flex-wrap items-center gap-2">
                                              <Badge variant="outline">
                                                Dung{" "}
                                                {pickStats?.correctPicks ?? 0}
                                              </Badge>
                                            </div>
                                          </div>
                                        </CardHeader>

                                        <CardContent className="space-y-3 px-0 pb-4 pt-0">
                                          {pickemQuery?.isLoading ? (
                                            <p className="text-sm text-muted-foreground">
                                              Dang tai du lieu Pick'em...
                                            </p>
                                          ) : null}

                                          {pickemQuery?.isError ? (
                                            <p className="text-sm text-destructive">
                                              {toErrorMessage(
                                                pickemQuery.error,
                                                "Khong tai duoc du lieu Pick'em theo bracket.",
                                              )}
                                            </p>
                                          ) : null}

                                          {!pickemQuery?.isLoading &&
                                          !pickemQuery?.isError ? (
                                            <>
                                              <p className="text-sm text-muted-foreground">
                                                Bam vao ten doi trong moi cap
                                                dau de chon doi thang.
                                              </p>

                                              {pickStats ? (
                                                <p className="text-xs text-muted-foreground">
                                                  Match da co ket qua se tu dong
                                                  danh dau Dung/Sai. Diem tinh
                                                  theo round: R1 = 1, R2 = 2, R3
                                                  = 4...
                                                </p>
                                              ) : null}

                                              <AutoFitContent>
                                                {formatId === 1 ? (
                                                  <SingleElimBracket
                                                    bracketId={bracketId}
                                                    selectedTeamByMatchId={
                                                      selectedPicks
                                                    }
                                                    pickStatusByMatchId={
                                                      pickStatusByMatchId
                                                    }
                                                    onPickTeam={(
                                                      matchId,
                                                      teamId,
                                                    ) =>
                                                      pickTeam(
                                                        bracketId,
                                                        matchId,
                                                        teamId,
                                                      )
                                                    }
                                                    disableMatchLink
                                                  />
                                                ) : null}

                                                {formatId === 2 ? (
                                                  <DoubleElimBracket
                                                    bracketId={bracketId}
                                                    selectedTeamByMatchId={
                                                      selectedPicks
                                                    }
                                                    pickStatusByMatchId={
                                                      pickStatusByMatchId
                                                    }
                                                    onPickTeam={(
                                                      matchId,
                                                      teamId,
                                                    ) =>
                                                      pickTeam(
                                                        bracketId,
                                                        matchId,
                                                        teamId,
                                                      )
                                                    }
                                                    disableMatchLink
                                                  />
                                                ) : null}

                                                {isSwissBracket ? (
                                                  <SwissBracket
                                                    bracketId={bracketId}
                                                    selectedTeamByMatchId={
                                                      selectedPicks
                                                    }
                                                    pickStatusByMatchId={
                                                      pickStatusByMatchId
                                                    }
                                                    onPickTeam={(
                                                      matchId,
                                                      teamId,
                                                    ) =>
                                                      pickTeam(
                                                        bracketId,
                                                        matchId,
                                                        teamId,
                                                      )
                                                    }
                                                    disableMatchLink
                                                  />
                                                ) : null}

                                                {!isSwissBracket &&
                                                formatId !== 1 &&
                                                formatId !== 2 ? (
                                                  <p className="text-sm text-muted-foreground">
                                                    Bracket nay co format khac.
                                                    He thong hien chi render
                                                    single, double va swiss.
                                                  </p>
                                                ) : null}
                                              </AutoFitContent>

                                              {!pickableCount ? (
                                                <p className="text-sm text-muted-foreground">
                                                  Bracket nay chua co tran nao
                                                  du doi hinh de pick.
                                                </p>
                                              ) : null}

                                              <div className="flex flex-wrap items-center justify-between gap-3">
                                                {!user ? (
                                                  <p className="text-sm text-muted-foreground">
                                                    Dang nhap de tu dong luu
                                                    Pick'em cua ban ngay khi
                                                    chon doi.
                                                  </p>
                                                ) : (
                                                  <p className="text-sm text-muted-foreground">
                                                    Chon doi la he thong se tu
                                                    dong luu ngay cho bracket
                                                    nay.
                                                  </p>
                                                )}

                                                {user ? (
                                                  <p className="text-xs text-muted-foreground">
                                                    {isSavingThisBracket
                                                      ? "Dang tu dong luu..."
                                                      : "Da bat tu dong luu."}
                                                  </p>
                                                ) : null}
                                              </div>
                                            </>
                                          ) : null}
                                        </CardContent>
                                      </Card>
                                    );
                                  })}
                                </div>
                              ) : null}

                              {!bundle.query.isLoading &&
                              !bundle.brackets.length ? (
                                <p className="text-sm text-muted-foreground">
                                  Tournament nay chua co bracket.
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SeriesPickemPage;
