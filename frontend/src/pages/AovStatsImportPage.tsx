import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Clipboard,
  ClipboardPaste,
  ExternalLink,
  Loader2,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import {
  generateAovStagingStats,
  type AovParsedPayload,
  type AovPlayerRow,
  type AovStagingResult,
} from "@/api/aovStats";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const allowedRoleIds = new Set([1, 2, 3]);

const JSON_TEMPLATE = JSON.stringify(
  {
    match_id: null,
    game: {
      blue_kills: 19,
      red_kills: 1,
      duration_sec: 474,
      winner_side: "blue",
    },
    players: {
      blue: [
        {
          slot: 1,
          ign: "TenInGame1",
          performance_score: 14.8,
          kills: 10,
          deaths: 0,
          assists: 4,
          gold: 6947,
        },
      ],
      red: [
        {
          slot: 1,
          ign: "TenInGame3",
          performance_score: 5.6,
          kills: 0,
          deaths: 2,
          assists: 1,
          gold: 4079,
        },
      ],
    },
  },
  null,
  2,
);

const emptyPlayer = (slot: number): AovPlayerRow => ({
  slot,
  ign: "",
  performance_score: null,
  kills: 0,
  deaths: 0,
  assists: 0,
  gold: null,
});

const normalizeParsed = (raw: Record<string, unknown>): AovParsedPayload => {
  const game = (raw.game ?? {}) as AovParsedPayload["game"];
  const players = (raw.players ?? {}) as AovParsedPayload["players"];

  const padSide = (side: AovPlayerRow[]) => {
    const list = [...(side ?? [])];
    while (list.length < 5) list.push(emptyPlayer(list.length + 1));
    return list.slice(0, 5).map((row, index) => ({ ...row, slot: index + 1 }));
  };

  return {
    game: {
      blue_kills: Number(game.blue_kills) || 0,
      red_kills: Number(game.red_kills) || 0,
      duration_sec: game.duration_sec ?? null,
      winner_side: game.winner_side === "red" ? "red" : "blue",
    },
    players: {
      blue: padSide(players.blue ?? []),
      red: padSide(players.red ?? []),
    },
  };
};

const copyText = async (label: string, value: string) => {
  try {
    await navigator.clipboard.writeText(value);
    toast({ title: `Đã copy ${label}`, description: value });
  } catch {
    toast({ title: "Không copy được", variant: "destructive" });
  }
};

type PlayerTableProps = {
  title: string;
  side: "blue" | "red";
  players: AovPlayerRow[];
  onChange: (
    side: "blue" | "red",
    index: number,
    key: keyof AovPlayerRow,
    value: string,
  ) => void;
};

const PlayerTable = ({ title, side, players, onChange }: PlayerTableProps) => (
  <div className="space-y-2">
    <h3 className="text-sm font-semibold">{title}</h3>
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/40 text-left">
          <tr>
            <th className="px-2 py-2">#</th>
            <th className="px-2 py-2">IGN</th>
            <th className="px-2 py-2">Điểm</th>
            <th className="px-2 py-2">K</th>
            <th className="px-2 py-2">D</th>
            <th className="px-2 py-2">A</th>
            <th className="px-2 py-2">Vàng</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, index) => (
            <tr key={`${side}-${player.slot}`} className="border-t border-border/60">
              <td className="px-2 py-1.5 text-muted-foreground">{player.slot}</td>
              <td className="px-2 py-1.5">
                <Input
                  value={player.ign}
                  onChange={(e) => onChange(side, index, "ign", e.target.value)}
                  className="h-8"
                />
              </td>
              <td className="px-2 py-1.5">
                <Input
                  value={player.performance_score ?? ""}
                  onChange={(e) =>
                    onChange(side, index, "performance_score", e.target.value)
                  }
                  className="h-8 w-20"
                />
              </td>
              <td className="px-2 py-1.5">
                <Input
                  value={player.kills}
                  onChange={(e) => onChange(side, index, "kills", e.target.value)}
                  className="h-8 w-16"
                />
              </td>
              <td className="px-2 py-1.5">
                <Input
                  value={player.deaths}
                  onChange={(e) => onChange(side, index, "deaths", e.target.value)}
                  className="h-8 w-16"
                />
              </td>
              <td className="px-2 py-1.5">
                <Input
                  value={player.assists}
                  onChange={(e) =>
                    onChange(side, index, "assists", e.target.value)
                  }
                  className="h-8 w-16"
                />
              </td>
              <td className="px-2 py-1.5">
                <Input
                  value={player.gold ?? ""}
                  onChange={(e) => onChange(side, index, "gold", e.target.value)}
                  className="h-8 w-24"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const AovStatsImportPage = () => {
  const navigate = useNavigate();
  const { user, token, isLoading } = useAuth();

  const [jsonInput, setJsonInput] = useState(JSON_TEMPLATE);
  const [parsed, setParsed] = useState<AovParsedPayload | null>(null);
  const [generated, setGenerated] = useState<AovStagingResult | null>(null);
  const [generating, setGenerating] = useState(false);

  const hasAccess = allowedRoleIds.has(Number(user?.role_id));

  useEffect(() => {
    if (isLoading) return;
    if (!user || !token) {
      navigate(`/login?returnTo=${encodeURIComponent("/ops/aov-import")}`, {
        replace: true,
      });
      return;
    }
    if (!hasAccess) {
      toast({ title: "Không có quyền truy cập", variant: "destructive" });
      navigate("/profile", { replace: true });
    }
  }, [hasAccess, isLoading, navigate, token, user]);

  const handleParseJson = () => {
    try {
      const raw = JSON.parse(jsonInput) as Record<string, unknown>;
      setParsed(normalizeParsed(raw));
      toast({ title: "Đã parse JSON", description: "Kiểm tra bảng rồi Generate match_id." });
    } catch (error) {
      toast({
        title: "JSON không hợp lệ",
        description: error instanceof Error ? error.message : "Kiểm tra lại cú pháp",
        variant: "destructive",
      });
    }
  };

  const updatePlayerField = (
    side: "blue" | "red",
    index: number,
    key: keyof AovPlayerRow,
    value: string,
  ) => {
    setParsed((prev) => {
      if (!prev) return prev;
      const list = [...prev.players[side]];
      const current = { ...list[index] };

      if (key === "ign") current.ign = value;
      else if (key === "performance_score" || key === "gold") {
        current[key] = value.trim() === "" ? null : Number(value);
      } else if (key === "kills" || key === "deaths" || key === "assists") {
        current[key] = Number(value) || 0;
      }

      list[index] = current;
      return { ...prev, players: { ...prev.players, [side]: list } };
    });
  };

  const handleGenerate = async () => {
    if (!parsed) {
      toast({ title: "Parse JSON trước", variant: "destructive" });
      return;
    }

    const payload: AovParsedPayload = {
      ...parsed,
      players: {
        blue: parsed.players.blue.filter((p) => p.ign.trim()),
        red: parsed.players.red.filter((p) => p.ign.trim()),
      },
    };

    setGenerating(true);
    try {
      const response = await generateAovStagingStats(payload);
      const result = response.data?.data;
      setGenerated(result ?? null);

      if (result) {
        setJsonInput(JSON.stringify(result.data, null, 2));
      }

      toast({
        title: "Đã tạo match_id",
        description: result?.match_id
          ? `${result.match_id} — dán vào Score Control`
          : undefined,
      });
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Generate thất bại";
      toast({ title: message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading || !user || !token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Đang kiểm tra quyền...
      </div>
    );
  }

  if (!hasAccess) return null;

  const scoreControlUrl = generated?.match_id
    ? `/ops/score-control?infoGameId=${encodeURIComponent(generated.match_id)}`
    : "/ops/score-control";

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <button
          type="button"
          onClick={() => navigate("/ops/score-control")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Score Control
        </button>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Tạo match_id AOV / Liên Quân</h1>
              <p className="text-sm text-muted-foreground">
                Trang này chỉ nhập stats và generate <strong>match_id</strong> (vd:
                aov:abc123). Không gắn trực tiếp vào trận giải. Sang Score Control
                dán match_id vào ô <strong>info_game_id</strong> của trận cần gán.
              </p>
            </div>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>1. Nhập stats (JSON)</CardTitle>
            <CardDescription>
              blue = team A (trái), red = team B (phải). Chưa có match_id cho đến
              khi bấm Generate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              className="w-full min-h-[320px] rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setJsonInput(JSON_TEMPLATE);
                  setParsed(null);
                  setGenerated(null);
                }}
              >
                <ClipboardPaste className="h-4 w-4 mr-2" />
                Dùng mẫu
              </Button>
              <Button type="button" onClick={handleParseJson}>
                Parse JSON
              </Button>
            </div>
          </CardContent>
        </Card>

        {parsed ? (
          <Card>
            <CardHeader>
              <CardTitle>2. Kiểm tra &amp; Generate match_id</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <label className="text-xs text-muted-foreground">Blue kills</label>
                  <Input
                    value={parsed.game.blue_kills}
                    onChange={(e) =>
                      setParsed({
                        ...parsed,
                        game: {
                          ...parsed.game,
                          blue_kills: Number(e.target.value) || 0,
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Red kills</label>
                  <Input
                    value={parsed.game.red_kills}
                    onChange={(e) =>
                      setParsed({
                        ...parsed,
                        game: {
                          ...parsed.game,
                          red_kills: Number(e.target.value) || 0,
                        },
                      })
                    }
                  />
                </div>
              </div>
              <PlayerTable
                title="Đội xanh (team A)"
                side="blue"
                players={parsed.players.blue}
                onChange={updatePlayerField}
              />
              <PlayerTable
                title="Đội đỏ (team B)"
                side="red"
                players={parsed.players.red}
                onChange={updatePlayerField}
              />
              <Button
                type="button"
                className="gap-2"
                disabled={generating}
                onClick={() => void handleGenerate()}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate match_id
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {generated?.match_id ? (
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle>3. Dán vào Score Control</CardTitle>
              <CardDescription>
                Mở Score Control → chọn trận giải → thêm info_game_id → dán match_id
                bên dưới → chọn Game 1/2/3 (BO) → Lưu. Stats tự áp vào trận đó.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-border p-4 space-y-2">
                <p className="text-xs text-muted-foreground">match_id (dán vào info_game_id)</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-base font-semibold">{generated.match_id}</code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyText("match_id", generated.match_id)}
                  >
                    <Clipboard className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                onClick={() => navigate(scoreControlUrl)}
              >
                <ExternalLink className="h-4 w-4" />
                Mở Score Control
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
};

export default AovStatsImportPage;
