import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext, useParams } from "react-router-dom";
import {
  generatePickemChallenge,
  getMyPickemAnswers,
  getPickemQuestions,
  submitPickemPrediction,
  type PickemOption,
  type PickemQuestion,
} from "@/api/pickem";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeGameShort = (value: unknown) => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "val" || normalized === "valorantv2") return "valorant";
  if (normalized === "leagueoflegends" || normalized === "league_of_legends") {
    return "lol";
  }
  if (normalized === "teamfighttactics" || normalized === "teamfight_tactics") {
    return "tft";
  }
  return normalized;
};

const toOptionLabel = (option: PickemOption) => {
  if (typeof option === "string") return option;
  if (!option || typeof option !== "object") return "";

  const candidate =
    option.label ?? option.name ?? option.value ?? option.id ?? option.team_id;

  return normalizeText(candidate);
};

const toOptionArray = (value: unknown): PickemOption[] => {
  if (Array.isArray(value)) return value as PickemOption[];

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed as PickemOption[];
      if (parsed && typeof parsed === "object") {
        return [parsed as Record<string, unknown>];
      }
      return [trimmed];
    } catch {
      return [trimmed];
    }
  }

  if (value && typeof value === "object") {
    return [value as Record<string, unknown>];
  }

  return [];
};

const toOptionKey = (value: unknown) => normalizeText(value).toLowerCase();

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

const resolveSection = (question: PickemQuestion) => {
  const fromMeta = normalizeText(question.meta?.section).toLowerCase();
  if (fromMeta) return fromMeta;

  const fromType = normalizeText(question.type).toLowerCase();
  if (fromType.includes("single")) return "single-elim";
  if (fromType.includes("double")) return "double-elim";
  if (fromType.includes("swiss")) return "swiss";
  if (fromType.includes("prop") || fromType.includes("champion")) return "prop";

  return "other";
};

const groupMatchQuestionsByRound = (questions: PickemQuestion[]) => {
  const roundMap = new Map<number, PickemQuestion[]>();

  for (const question of questions) {
    const round = toNumber(question.meta?.roundNumber) ?? 1;
    if (!roundMap.has(round)) roundMap.set(round, []);
    roundMap.get(round)!.push(question);
  }

  return Array.from(roundMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([round, items]) => ({
      round,
      questions: [...items].sort((a, b) => {
        const aMatchNo = toNumber(a.meta?.matchNo) ?? 0;
        const bMatchNo = toNumber(b.meta?.matchNo) ?? 0;
        if (aMatchNo !== bMatchNo) return aMatchNo - bMatchNo;
        return (toNumber(a.id) ?? 0) - (toNumber(b.id) ?? 0);
      }),
    }));
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
  const { game } = useParams();
  const normalizedGame = normalizeGameShort(game) || "all";
  const leagueId = toNumber(tournament?.id);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [answersByQuestion, setAnswersByQuestion] = useState<
    Record<number, string[]>
  >({});

  const pickemQuestionsQuery = useQuery({
    queryKey: ["pickem-questions", leagueId, normalizedGame],
    enabled: Boolean(leagueId),
    queryFn: async () => {
      const response = await getPickemQuestions({
        leagueId: leagueId!,
        gameShort: normalizedGame,
        type: "all",
      });
      return response.data;
    },
    staleTime: 15000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const myAnswersQuery = useQuery({
    queryKey: ["pickem-my-answers", leagueId, user?.id],
    enabled: Boolean(leagueId && user?.id),
    queryFn: async () => {
      const response = await getMyPickemAnswers(leagueId!, user!.id);
      return response.data;
    },
    staleTime: 10000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    const rows = myAnswersQuery.data?.answers ?? [];
    if (!rows.length) return;

    const nextState: Record<number, string[]> = {};
    rows.forEach((answer) => {
      const questionId = toNumber(answer.questionId);
      if (!questionId) return;

      const selectedOptions = Array.isArray(answer.selectedOptions)
        ? answer.selectedOptions
        : [];

      nextState[questionId] = selectedOptions
        .map((item) => normalizeText(item))
        .filter(Boolean);
    });

    setAnswersByQuestion(nextState);
  }, [myAnswersQuery.data?.answers]);

  const questions = pickemQuestionsQuery.data?.questions ?? [];

  const questionMapById = useMemo(
    () => new Map(questions.map((question) => [Number(question.id), question])),
    [questions],
  );

  const selectedAnswerCount = useMemo(
    () =>
      Object.values(answersByQuestion).filter(
        (selectedOptions) => selectedOptions.length > 0,
      ).length,
    [answersByQuestion],
  );

  const canManagePickem = useMemo(() => {
    const roleId = toNumber(user?.role_id);
    return roleId !== null && [1, 2, 3].includes(roleId);
  }, [user?.role_id]);

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      if (!leagueId) throw new Error("Missing league id");
      return generatePickemChallenge(leagueId, {
        tournamentId: leagueId,
        gameShort: normalizedGame,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["pickem-questions", leagueId, normalizedGame],
      });

      toast({
        title: "Da tao lai challenge",
        description: "Danh sach cau hoi Pick'em da duoc cap nhat.",
      });
    },
    onError: (error) => {
      toast({
        title: "Khong the tao lai challenge",
        description: toErrorMessage(error, "Vui long thu lai sau."),
        variant: "destructive",
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!leagueId || !user?.id) {
        throw new Error("Bạn cần đăng nhập để gửi dự đoán");
      }

      const answers = Object.entries(answersByQuestion)
        .map(([questionIdRaw, selectedOptions]) => {
          const questionId = Number(questionIdRaw);
          if (!Number.isFinite(questionId) || selectedOptions.length === 0) {
            return null;
          }

          const question = questionMapById.get(questionId);

          return {
            questionId,
            selectedOptions,
            openTime: question?.openTime ?? null,
            closeTime: question?.closeTime ?? null,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (!answers.length) {
        throw new Error("Bạn chưa chọn đáp án nào");
      }

      return submitPickemPrediction(leagueId, {
        userId: user.id,
        user: {
          userId: user.id,
          nickname: user.nickname,
          img: user.profile_picture,
          teamName: user.team?.name ?? null,
          logoTeam: user.team?.logo_url ?? null,
        },
        answers,
      });
    },
    onSuccess: async (response) => {
      const score = response.data?.data?.totalScore;

      await queryClient.invalidateQueries({
        queryKey: ["pickem-my-answers", leagueId, user?.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["pickem-questions", leagueId, normalizedGame],
      });

      toast({
        title: "Da luu du doan",
        description:
          typeof score === "number"
            ? `Tong diem hien tai: ${score}`
            : "Du doan cua ban da duoc cap nhat.",
      });
    },
    onError: (error) => {
      toast({
        title: "Luu du doan that bai",
        description: toErrorMessage(error, "Vui long thu lai sau."),
        variant: "destructive",
      });
    },
  });

  const selectSingleOption = (questionId: number, optionLabel: string) => {
    setAnswersByQuestion((previous) => ({
      ...previous,
      [questionId]: [optionLabel],
    }));
  };

  const toggleMultiOption = (question: PickemQuestion, optionLabel: string) => {
    const questionId = Number(question.id);
    const maxChoose = Math.max(toNumber(question.maxChoose) ?? 1, 1);

    setAnswersByQuestion((previous) => {
      const current = previous[questionId] ?? [];
      const targetKey = toOptionKey(optionLabel);
      const hasOption = current.some((value) => toOptionKey(value) === targetKey);

      if (hasOption) {
        return {
          ...previous,
          [questionId]: current.filter((value) => toOptionKey(value) !== targetKey),
        };
      }

      if (current.length >= maxChoose) {
        return previous;
      }

      return {
        ...previous,
        [questionId]: [...current, optionLabel],
      };
    });
  };

  const isOptionSelected = (questionId: number, optionLabel: string) => {
    const selected = answersByQuestion[questionId] ?? [];
    const targetKey = toOptionKey(optionLabel);
    return selected.some((item) => toOptionKey(item) === targetKey);
  };

  const sectionedQuestions = useMemo(() => {
    const buckets: Record<
      "single" | "double" | "swiss" | "prop" | "other",
      PickemQuestion[]
    > = {
      single: [],
      double: [],
      swiss: [],
      prop: [],
      other: [],
    };

    for (const question of questions) {
      const section = resolveSection(question);

      if (section === "single-elim") {
        buckets.single.push(question);
        continue;
      }

      if (section === "double-elim") {
        buckets.double.push(question);
        continue;
      }

      if (section === "swiss") {
        buckets.swiss.push(question);
        continue;
      }

      if (section === "prop") {
        buckets.prop.push(question);
        continue;
      }

      buckets.other.push(question);
    }

    return {
      single: groupMatchQuestionsByRound(buckets.single),
      double: groupMatchQuestionsByRound(buckets.double),
      swiss: buckets.swiss,
      prop: buckets.prop,
      other: buckets.other,
    };
  }, [questions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-heading">Pick'em Challenge</h2>
          <p className="text-sm text-muted-foreground">
            Single/Double Elimination: moi tran chon 1 doi thang. Swiss: chon
            dung so doi di tiep. Prop theo tung game.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            Da chon {selectedAnswerCount}/{questions.length}
          </Badge>

          {typeof myAnswersQuery.data?.totalScore === "number" ? (
            <Badge variant="secondary">
              Diem hien tai: {myAnswersQuery.data.totalScore}
            </Badge>
          ) : null}

          {pickemQuestionsQuery.data?.autoGenerated ? (
            <Badge>Tao tu dong</Badge>
          ) : null}

          {canManagePickem ? (
            <Button
              variant="outline"
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending || !leagueId}
            >
              {regenerateMutation.isPending
                ? "Dang tao lai..."
                : "Tao lai challenge"}
            </Button>
          ) : null}
        </div>
      </div>

      {isTournamentLoading || pickemQuestionsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Dang tai Pick'em...</p>
      ) : null}

      {pickemQuestionsQuery.isError ? (
        <p className="text-sm text-destructive">
          {toErrorMessage(
            pickemQuestionsQuery.error,
            "Khong tai duoc danh sach cau hoi Pick'em.",
          )}
        </p>
      ) : null}

      {!pickemQuestionsQuery.isLoading && !questions.length ? (
        <p className="text-sm text-muted-foreground">
          Chua co cau hoi Pick'em cho giai dau nay.
        </p>
      ) : null}

      {sectionedQuestions.single.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-bold">Single Elimination</h3>
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max gap-4">
              {sectionedQuestions.single.map((roundGroup) => (
                <div key={`single-round-${roundGroup.round}`} className="w-72 shrink-0">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Round {roundGroup.round}
                  </p>
                  <div className="space-y-3">
                    {roundGroup.questions.map((question) => {
                      const questionId = Number(question.id);
                      const options = toOptionArray(question.options)
                        .map((option) => toOptionLabel(option))
                        .filter(Boolean);

                      return (
                        <Card key={question.id} className="border-border/60 bg-card/70">
                          <CardContent className="space-y-3 p-4">
                            <p className="text-xs text-muted-foreground">
                              Match {toNumber(question.meta?.matchNo) ?? "-"}
                            </p>
                            <p className="text-sm font-semibold leading-relaxed">
                              {question.question}
                            </p>

                            <div className="space-y-2">
                              {options.map((optionLabel) => {
                                const selected = isOptionSelected(questionId, optionLabel);
                                return (
                                  <button
                                    key={`${question.id}-${optionLabel}`}
                                    type="button"
                                    onClick={() =>
                                      selectSingleOption(questionId, optionLabel)
                                    }
                                    className={cn(
                                      "w-full rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors",
                                      selected
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border bg-muted/40 hover:bg-muted",
                                    )}
                                  >
                                    {optionLabel}
                                  </button>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {sectionedQuestions.double.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-bold">Double Elimination</h3>
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max gap-4">
              {sectionedQuestions.double.map((roundGroup) => (
                <div key={`double-round-${roundGroup.round}`} className="w-72 shrink-0">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Round {roundGroup.round}
                  </p>
                  <div className="space-y-3">
                    {roundGroup.questions.map((question) => {
                      const questionId = Number(question.id);
                      const options = toOptionArray(question.options)
                        .map((option) => toOptionLabel(option))
                        .filter(Boolean);

                      return (
                        <Card key={question.id} className="border-border/60 bg-card/70">
                          <CardContent className="space-y-3 p-4">
                            <p className="text-xs text-muted-foreground">
                              {normalizeText(question.meta?.stage) || "Bracket"} - Match{" "}
                              {toNumber(question.meta?.matchNo) ?? "-"}
                            </p>
                            <p className="text-sm font-semibold leading-relaxed">
                              {question.question}
                            </p>

                            <div className="space-y-2">
                              {options.map((optionLabel) => {
                                const selected = isOptionSelected(questionId, optionLabel);
                                return (
                                  <button
                                    key={`${question.id}-${optionLabel}`}
                                    type="button"
                                    onClick={() =>
                                      selectSingleOption(questionId, optionLabel)
                                    }
                                    className={cn(
                                      "w-full rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors",
                                      selected
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border bg-muted/40 hover:bg-muted",
                                    )}
                                  >
                                    {optionLabel}
                                  </button>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {sectionedQuestions.swiss.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-bold">Swiss</h3>
          <div className="grid gap-4">
            {sectionedQuestions.swiss.map((question) => {
              const questionId = Number(question.id);
              const options = toOptionArray(question.options)
                .map((option) => toOptionLabel(option))
                .filter(Boolean);
              const pickCount = Math.max(toNumber(question.maxChoose) ?? 1, 1);
              const selectedCount = (answersByQuestion[questionId] ?? []).length;

              return (
                <Card key={question.id} className="border-border/70 bg-card/70">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base leading-relaxed">
                      {question.question}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Chon toi da {pickCount} doi ({selectedCount}/{pickCount})
                    </p>
                  </CardHeader>
                  <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {options.map((optionLabel) => {
                      const selected = isOptionSelected(questionId, optionLabel);
                      const disableSelect =
                        !selected &&
                        selectedCount >= pickCount &&
                        !isOptionSelected(questionId, optionLabel);

                      return (
                        <button
                          key={`${question.id}-${optionLabel}`}
                          type="button"
                          onClick={() => toggleMultiOption(question, optionLabel)}
                          disabled={disableSelect}
                          className={cn(
                            "rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-muted/40 hover:bg-muted",
                            disableSelect && "cursor-not-allowed opacity-50",
                          )}
                        >
                          {optionLabel}
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      {sectionedQuestions.prop.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-bold">Prop Questions</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {sectionedQuestions.prop.map((question) => {
              const questionId = Number(question.id);
              const options = toOptionArray(question.options)
                .map((option) => toOptionLabel(option))
                .filter(Boolean);

              return (
                <Card key={question.id} className="border-border/70 bg-card/70">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base leading-relaxed">
                      {question.question}
                    </CardTitle>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {normalizeText(question.meta?.statKey) || question.type}
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-2">
                    {options.map((optionLabel) => {
                      const selected = isOptionSelected(questionId, optionLabel);
                      return (
                        <button
                          key={`${question.id}-${optionLabel}`}
                          type="button"
                          onClick={() => selectSingleOption(questionId, optionLabel)}
                          className={cn(
                            "w-full rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-muted/40 hover:bg-muted",
                          )}
                        >
                          {optionLabel}
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      {sectionedQuestions.other.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-bold">Cau hoi khac</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {sectionedQuestions.other.map((question) => {
              const questionId = Number(question.id);
              const maxChoose = Math.max(toNumber(question.maxChoose) ?? 1, 1);
              const selectedCount = (answersByQuestion[questionId] ?? []).length;
              const options = toOptionArray(question.options)
                .map((option) => toOptionLabel(option))
                .filter(Boolean);

              return (
                <Card key={question.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{question.question}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Chon toi da {maxChoose} dap an
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {options.map((optionLabel) => {
                      const selected = isOptionSelected(questionId, optionLabel);
                      const disableSelect = !selected && selectedCount >= maxChoose;

                      return (
                        <button
                          key={`${question.id}-${optionLabel}`}
                          type="button"
                          disabled={disableSelect}
                          onClick={() => {
                            if (maxChoose === 1) {
                              selectSingleOption(questionId, optionLabel);
                            } else {
                              toggleMultiOption(question, optionLabel);
                            }
                          }}
                          className={cn(
                            "w-full rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-muted/40 hover:bg-muted",
                            disableSelect && "cursor-not-allowed opacity-50",
                          )}
                        >
                          {optionLabel}
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      {questions.length > 0 ? (
        <Card className="border-border/70 bg-card/70">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              {!user ? (
                <p className="text-sm text-muted-foreground">
                  Dang nhap de luu du doan Pick'em cua ban.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Co the doi lua chon va bam luu nhieu lan truoc khi khoa cau hoi.
                </p>
              )}
            </div>

            <Button
              onClick={() => submitMutation.mutate()}
              disabled={!user || submitMutation.isPending || selectedAnswerCount === 0}
            >
              {submitMutation.isPending ? "Dang luu..." : "Luu du doan"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default PickemPage;
