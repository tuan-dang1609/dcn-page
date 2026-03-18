import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  generateSeriesPickemChallenge,
  getPickemQuestions,
  upsertPickemQuestions,
} from "@/api/pickem";
import { getSeriesById } from "@/api/series";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

const defaultManualPayload = `[
  {
    "id": 900001,
    "question": "[Demo] Team nao vo dich chung cuoc?",
    "type": "tft-champion",
    "options": ["Team A", "Team B", "Team C"],
    "score": 2,
    "maxChoose": 1,
    "correctAnswer": [],
    "game_short": "tft",
    "bracket_id": null,
    "meta": {
      "section": "prop",
      "statKey": "champion",
      "tournamentId": null,
      "tournamentName": "Custom"
    }
  }
]`;

const SeriesPickemSetupPage = () => {
  const [searchParams] = useSearchParams();
  const initialSeries = searchParams.get("series") ?? "";

  const [seriesInput, setSeriesInput] = useState(initialSeries);
  const [manualPayloadText, setManualPayloadText] = useState(defaultManualPayload);
  const [apiKey, setApiKey] = useState("");

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canManagePickem = useMemo(() => {
    const roleId = toNumber(user?.role_id);
    return roleId !== null && [1, 2, 3].includes(roleId);
  }, [user?.role_id]);

  const seriesQuery = useQuery({
    queryKey: ["series-pickem-setup", seriesInput],
    enabled: Boolean(seriesInput),
    queryFn: async () => {
      const response = await getSeriesById(seriesInput);
      return response.data?.info;
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const leagueId = toNumber(seriesQuery.data?.id);

  const pickemQuestionsQuery = useQuery({
    queryKey: ["series-pickem-setup-questions", leagueId],
    enabled: Boolean(leagueId),
    queryFn: async () => {
      const response = await getPickemQuestions({
        leagueId: leagueId!,
        gameShort: "all",
        type: "all",
      });
      return response.data;
    },
    staleTime: 10000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (seriesQuery.isError) {
      toast({
        title: "Khong tim thay series",
        description: toErrorMessage(seriesQuery.error, "Kiem tra lai slug/id series."),
        variant: "destructive",
      });
    }
  }, [seriesQuery.error, seriesQuery.isError, toast]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!leagueId) throw new Error("Series id khong hop le");
      return generateSeriesPickemChallenge(leagueId, {
        leagueId,
        gameShort: "all",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["series-pickem-setup-questions", leagueId],
      });
      toast({
        title: "Da tao challenge",
        description: "Pick'em cho series da duoc tao tu dong.",
      });
    },
    onError: (error) => {
      toast({
        title: "Tao challenge that bai",
        description: toErrorMessage(error, "Vui long thu lai."),
        variant: "destructive",
      });
    },
  });

  const manualUpsertMutation = useMutation({
    mutationFn: async () => {
      if (!leagueId) throw new Error("Series id khong hop le");
      if (!normalizeText(apiKey)) {
        throw new Error("Can API key de goi endpoint addquestion");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(manualPayloadText);
      } catch {
        throw new Error("JSON payload khong hop le");
      }

      if (!parsed || (typeof parsed !== "object" && !Array.isArray(parsed))) {
        throw new Error("Payload phai la object hoac array");
      }

      return upsertPickemQuestions(leagueId, parsed as never, normalizeText(apiKey));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["series-pickem-setup-questions", leagueId],
      });

      toast({
        title: "Da cap nhat cau hoi",
        description: "Payload question da duoc ghi vao he thong.",
      });
    },
    onError: (error) => {
      toast({
        title: "Cap nhat that bai",
        description: toErrorMessage(error, "Kiem tra payload va API key."),
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Ops / Series Pick'em Setup
          </p>
          <h1 className="text-2xl font-bold">Tao Pick'em cho Series</h1>
          <p className="text-sm text-muted-foreground">
            Trang nay de tao challenge tu dong theo toan bo tournament trong series,
            hoac them/sua question thu cong.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/">Ve trang chu</Link>
            </Button>
            {seriesQuery.data?.slug ? (
              <Button asChild variant="outline" size="sm">
                <Link to={`/series/${seriesQuery.data.slug}/pickem`}>Mo trang choi</Link>
              </Button>
            ) : null}
          </div>
        </div>

        {!canManagePickem ? (
          <Card className="border-destructive/40">
            <CardContent className="p-4 text-sm text-destructive">
              Ban can quyen Admin/Manager de tao hoac cap nhat Pick'em.
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">1) Chon Series</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={seriesInput}
              onChange={(event) => setSeriesInput(event.target.value)}
              placeholder="Nhap series slug hoac series id"
            />

            {seriesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Dang tai thong tin series...</p>
            ) : null}

            {seriesQuery.data ? (
              <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                <p>
                  <span className="font-semibold">Series:</span> {seriesQuery.data.name}
                </p>
                <p>
                  <span className="font-semibold">ID:</span> {seriesQuery.data.id}
                </p>
                <p>
                  <span className="font-semibold">Slug:</span> {seriesQuery.data.slug}
                </p>
                <p>
                  <span className="font-semibold">So tournament:</span>{" "}
                  {seriesQuery.data.all_tournaments?.length ?? 0}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2) Tao Question Tu Dong</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              He thong se tao question cho single/double/swiss va prop theo game cua
              tung tournament trong series.
            </p>

            <Button
              onClick={() => generateMutation.mutate()}
              disabled={!canManagePickem || !leagueId || generateMutation.isPending}
            >
              {generateMutation.isPending
                ? "Dang tao..."
                : "Tao Pick'em tu dong cho series"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">3) Them/Sua Question Thu Cong (JSON)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Nhap x-api-key de goi /addquestion"
            />
            <Textarea
              value={manualPayloadText}
              onChange={(event) => setManualPayloadText(event.target.value)}
              className="min-h-65 font-mono text-xs"
            />
            <Button
              onClick={() => manualUpsertMutation.mutate()}
              disabled={!canManagePickem || !leagueId || manualUpsertMutation.isPending}
              variant="outline"
            >
              {manualUpsertMutation.isPending
                ? "Dang cap nhat..."
                : "Upsert question thu cong"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">4) Kiem Tra Danh Sach Question</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                Tong so question: {pickemQuestionsQuery.data?.count ?? 0}
              </Badge>
              <Badge variant="secondary">
                Tong diem toi da: {pickemQuestionsQuery.data?.totalPointAll ?? 0}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => pickemQuestionsQuery.refetch()}
                disabled={!leagueId || pickemQuestionsQuery.isFetching}
              >
                {pickemQuestionsQuery.isFetching ? "Dang tai..." : "Tai lai"}
              </Button>
            </div>

            <div className="space-y-2">
              {(pickemQuestionsQuery.data?.questions ?? []).slice(0, 12).map((question) => (
                <div key={question.id} className="rounded-md border border-border p-3 text-sm">
                  <p className="font-semibold">[{question.type}] {question.question}</p>
                  <p className="text-xs text-muted-foreground">
                    id={question.id} | game={question.game_short ?? "-"} | maxChoose={question.maxChoose}
                  </p>
                </div>
              ))}

              {!pickemQuestionsQuery.isLoading &&
              (pickemQuestionsQuery.data?.questions?.length ?? 0) > 12 ? (
                <p className="text-xs text-muted-foreground">
                  Dang hien thi 12 question dau tien.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SeriesPickemSetupPage;
