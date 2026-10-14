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
  matchAovUsernames,
  type AovParsedPayload,
  type AovPlayerRow,
  type AovStagingResult,
} from "@/api/aovStats";
import { useAuth } from "@/contexts/AuthContext";
import PageLoader from "@/components/PageLoader";
import {
  disposeScoreboardOcr,
  OcrCancelledError,
  readAovScoreboards,
  type OcrProgress,
  type ScoreboardReadResult,
} from "@/lib/aovScoreboardOcr";
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
  [
    {
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
  ],
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
      winner_side: game.winner_side === "red" || game.winner_side === "blue" ? game.winner_side : null,
    },
    players: {
      blue: padSide(players.blue ?? []),
      red: padSide(players.red ?? []),
    },
  };
};

/** 1 object = 1 ván; mảng / { games } / { data } = nhiều ván */
const parseImportGames = (raw: unknown): AovParsedPayload[] => {
  let list: unknown[] = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.games)) list = obj.games;
    else if (Array.isArray(obj.data)) list = obj.data;
    else list = [raw];
  }

  return list
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    )
    .map((item) => normalizeParsed(item))
    .filter(
      (game) =>
        game.players.blue.some((p) => p.ign.trim()) ||
        game.players.red.some((p) => p.ign.trim()),
    );
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
                  value={player.kills ?? ""}
                  onChange={(e) => onChange(side, index, "kills", e.target.value)}
                  className="h-8 w-16"
                />
              </td>
              <td className="px-2 py-1.5">
                <Input
                  value={player.deaths ?? ""}
                  onChange={(e) => onChange(side, index, "deaths", e.target.value)}
                  className="h-8 w-16"
                />
              </td>
              <td className="px-2 py-1.5">
                <Input
                  value={player.assists ?? ""}
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
  const [games, setGames] = useState<AovParsedPayload[]>([]);
  const [activeGame, setActiveGame] = useState(0);
  const [generatedItems, setGeneratedItems] = useState<AovStagingResult[]>([]);
  const [generating, setGenerating] = useState(false);

  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [ocrReports, setOcrReports] = useState<ScoreboardReadResult[]>([]);
  /**
   * Ghép tên đọc được với USERNAME tài khoản trên hệ thống (backend: so theo số ký tự trùng với
   * nickname / username). Khớp → ign = username, matched_from_ign = tên đọc được.
   * Trả các ván đã ghép + cảnh báo theo từng ván.
   */
  const snapGamesToUsernames = async (list: AovParsedPayload[]) => {
    const sourceName = (p: AovPlayerRow) => (p.matched_from_ign || p.ign || "").trim();
    const { data } = await matchAovUsernames(
      list.map((game) => ({ blue: game.players.blue.map(sourceName), red: game.players.red.map(sourceName) })),
    );
    return list.map((game, gameIndex) => {
      const warnings: string[] = [];
      const apply = (side: "blue" | "red") =>
        game.players[side].map((player, index) => {
          const name = sourceName(player);
          const hit = data.data?.[gameIndex]?.[side]?.[index];
          if (!name) return player;
          if (!hit?.matched || !hit.username) {
            warnings.push(`${side === "blue" ? "Xanh" : "Đỏ"} #${player.slot}: "${name}" không khớp tài khoản nào — giữ tên đọc được`);
            return { ...player, ign: name, matched_from_ign: undefined, matched_user_id: null };
          }
          return { ...player, ign: hit.username, matched_from_ign: name, matched_user_id: hit.user_id };
        });
      return { game: { ...game, players: { blue: apply("blue"), red: apply("red") } }, warnings };
    });
  };

  /** Ghép username cho tất cả ván đang có (dùng cả khi dán JSON tay). */
  const handleSnapAll = async () => {
    try {
      const snapped = await snapGamesToUsernames(games);
      setGames(snapped.map((item) => item.game));
      const notes = snapped.reduce((sum, item) => sum + item.warnings.length, 0);
      toast({ title: "Đã ghép tên với username", description: notes ? `${notes} tên không khớp tài khoản nào` : undefined });
    } catch {
      toast({ title: "Không ghép được username", variant: "destructive" });
    }
  };

  const hasAccess = allowedRoleIds.has(Number(user?.role_id));
  const parsed = games[activeGame] ?? null;

  useEffect(() => () => void disposeScoreboardOcr(), []);

  /** Đọc ảnh tổng kết (mỗi ảnh 1 ván) → JSON đúng định dạng nhập → bảng kiểm tra bên dưới. */
  const handleReadImages = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    setOcrBusy(true);
    setOcrReports([]);
    try {
      const reports = await readAovScoreboards(files, setOcrProgress);
      const ok = reports.filter((report) => report.result);
      const gamesJson = ok.map((report) => report.result);
      setJsonInput(JSON.stringify(gamesJson, null, 2));
      // 1 ảnh = 1 ván, kể cả khi chưa đọc được tên nào (sửa tay trong bảng)
      let nextGames = gamesJson.map((game) => normalizeParsed(game as unknown as Record<string, unknown>));
      try {
        const okReports = reports.filter((report) => report.result);
        const snapped = await snapGamesToUsernames(nextGames);
        nextGames = snapped.map((item, index) => {
          okReports[index].warnings.push(...item.warnings.map((message) => ({ key: "name-snap", message })));
          return item.game;
        });
        setJsonInput(JSON.stringify(nextGames, null, 2));
      } catch {
        toast({ title: "Không ghép được username — tên giữ như đọc được", variant: "destructive" });
      }
      setGames(nextGames);
      setActiveGame(0);
      setGeneratedItems([]);
      setOcrReports(reports);
      const failed = reports.length - ok.length;
      toast({
        title: `Đã đọc ${ok.length}/${reports.length} ảnh`,
        description: failed
          ? `${failed} ảnh lỗi (xem bên dưới) — các ván còn lại đã điền vào bảng.`
          : "Kiểm tra các ô được đánh dấu rồi sửa trong bảng bên dưới trước khi Generate.",
        variant: failed ? "destructive" : undefined,
      });
    } catch (error) {
      if (error instanceof OcrCancelledError) return;
      toast({
        title: "Không đọc được ảnh",
        description: error instanceof Error ? error.message : "Thử lại hoặc nhập JSON tay",
        variant: "destructive",
      });
    } finally {
      setOcrBusy(false);
      setOcrProgress(null);
    }
  };

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
      const raw = JSON.parse(jsonInput) as unknown;
      const nextGames = parseImportGames(raw);
      if (!nextGames.length) {
        toast({
          title: "Không có ván hợp lệ",
          description: "Cần ít nhất 1 object có players.blue/red",
          variant: "destructive",
        });
        return;
      }
      setGames(nextGames);
      setOcrReports([]);
      setActiveGame(0);
      setGeneratedItems([]);
      toast({
        title: `Đã parse ${nextGames.length} ván`,
        description:
          nextGames.length === 1
            ? "Kiểm tra bảng rồi Generate match_id."
            : "Mỗi ván sẽ ra 1 match_id riêng khi Generate.",
      });
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
    setGames((prev) => {
      const next = [...prev];
      const currentGame = next[activeGame];
      if (!currentGame) return prev;

      const list = [...currentGame.players[side]];
      const current = { ...list[index] };

      if (key === "ign") current.ign = value;
      else if (key === "performance_score" || key === "gold") {
        current[key] = value.trim() === "" ? null : Number(value);
      } else if (key === "kills" || key === "deaths" || key === "assists") {
        current[key] = value.trim() === "" ? null : Number(value) || 0;
      }

      list[index] = current;
      next[activeGame] = {
        ...currentGame,
        players: { ...currentGame.players, [side]: list },
      };
      return next;
    });
  };

  const updateGameField = (field: "blue_kills" | "red_kills" | "winner_side", value: string) => {
    setGames((prev) => {
      const next = [...prev];
      const currentGame = next[activeGame];
      if (!currentGame) return prev;
      const game = { ...currentGame.game };
      if (field === "winner_side") {
        game.winner_side = value === "red" || value === "blue" ? value : null;
      } else {
        game[field] = Number(value) || 0;
        // Chưa chọn đội thắng → suy theo tỉ số vừa sửa (vẫn cần xác nhận)
        if (game.winner_side === null && game.blue_kills !== game.red_kills) {
          game.winner_side = game.blue_kills > game.red_kills ? "blue" : "red";
        }
      }
      next[activeGame] = { ...currentGame, game };
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!games.length) {
      toast({ title: "Parse JSON trước", variant: "destructive" });
      return;
    }

    const missingWinner = games.findIndex((game) => game.game.winner_side === null);
    if (missingWinner >= 0) {
      toast({ title: `Ván ${missingWinner + 1}: chưa chọn đội thắng`, variant: "destructive" });
      setActiveGame(missingWinner);
      return;
    }
    const missingStats = games.findIndex((game) =>
      [...game.players.blue, ...game.players.red].some(
        (p) => p.ign.trim() && (p.kills === null || p.deaths === null || p.assists === null),
      ),
    );
    if (missingStats >= 0) {
      toast({ title: `Ván ${missingStats + 1}: còn ô K/D/A trống`, variant: "destructive" });
      setActiveGame(missingStats);
      return;
    }

    const payload = games.map((game) => ({
      ...game,
      players: {
        blue: game.players.blue.filter((p) => p.ign.trim()),
        red: game.players.red.filter((p) => p.ign.trim()),
      },
    }));

    setGenerating(true);
    try {
      const response = await generateAovStagingStats(
        payload.length === 1 ? payload[0] : payload,
      );
      const batch = response.data?.data;
      const items = batch?.items?.length
        ? batch.items
        : batch?.match_id
          ? [{ match_id: batch.match_id, data: batch.data! }]
          : [];

      setGeneratedItems(items);

      toast({
        title:
          items.length === 1
            ? "Đã tạo match_id"
            : `Đã tạo ${items.length} match_id`,
        description:
          items.length === 1
            ? `${items[0].match_id} — dán vào Score Control (Game 1)`
            : "Dán lần lượt vào Game 1, Game 2, … trên Score Control",
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
    return <PageLoader label="Đang kiểm tra quyền..." />;
  }

  if (!hasAccess) return null;

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
                Paste <strong>1 object</strong> → 1 match_id · Paste{" "}
                <strong>mảng 2+ ván</strong> → mỗi ván một match_id. Sang Score
                Control dán vào Game 1 / Game 2 / …
              </p>
            </div>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>0. Đọc từ ảnh tổng kết trận</CardTitle>
            <CardDescription>
              Chọn ảnh chụp màn hình kết quả sau trận (mỗi ảnh 1 ván, theo thứ tự ván). Ảnh được đọc ngay trên
              máy bạn rồi điền JSON bên dưới. Lần đầu cần tải bộ đọc chữ (~vài chục MB). Dùng ảnh gốc, không cắt
              hay thu nhỏ.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label
              className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-input px-4 text-center text-sm ${
                ocrBusy ? "pointer-events-none opacity-60" : "hover:border-foreground"
              }`}
            >
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={ocrBusy}
                onChange={(event) => {
                  void handleReadImages(event.target.files);
                  event.target.value = "";
                }}
              />
              {ocrBusy ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {ocrProgress
                    ? `Đang đọc ảnh ${ocrProgress.file}/${ocrProgress.files} · ô ${ocrProgress.cell}/${ocrProgress.cells}`
                    : "Đang tải bộ đọc chữ…"}
                </span>
              ) : (
                <>
                  <span className="font-semibold">Chọn ảnh tổng kết trận</span>
                  <span className="text-xs text-muted-foreground">PNG / JPG · chọn nhiều ảnh cho Bo3 / Bo5</span>
                </>
              )}
            </label>

            {ocrReports.map((report, index) => (
              <div key={`${report.fileName}-${index}`} className="border-t border-border pt-3 text-sm">
                <div className="font-semibold">
                  Ván {index + 1} · {report.fileName}
                </div>
                {report.error ? (
                  <p className="mt-1 text-destructive">Không đọc được: {report.error}</p>
                ) : report.warnings.length ? (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                    {report.warnings.map((warning, warningIndex) => (
                      <li key={`${warning.key}-${warningIndex}`}>{warning.message}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-muted-foreground">Không có ô nào cần kiểm tra.</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>1. Nhập stats (JSON)</CardTitle>
            <CardDescription>
              blue = team A (trái), red = team B (phải). Hỗ trợ object đơn hoặc
              mảng <code className="text-xs">[ game1, game2 ]</code>.
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
                  setOcrReports([]);
                  setGames([]);
                  setActiveGame(0);
                  setGeneratedItems([]);
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

        {games.length ? (
          <Card>
            <CardHeader>
              <CardTitle>
                2. Kiểm tra &amp; Generate{" "}
                {games.length > 1 ? `${games.length} match_id` : "match_id"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {games.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {games.map((_, index) => (
                    <Button
                      key={`game-tab-${index}`}
                      type="button"
                      size="sm"
                      variant={activeGame === index ? "default" : "outline"}
                      onClick={() => setActiveGame(index)}
                    >
                      Ván {index + 1}
                    </Button>
                  ))}
                </div>
              ) : null}

              {parsed ? (
                <>
                  <div className="grid grid-cols-2 gap-3 max-w-md">
                    <div>
                      <label className="text-xs text-muted-foreground">
                        Blue kills
                      </label>
                      <Input
                        value={parsed.game.blue_kills}
                        onChange={(e) =>
                          updateGameField("blue_kills", e.target.value)
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">
                        Red kills
                      </label>
                      <Input
                        value={parsed.game.red_kills}
                        onChange={(e) =>
                          updateGameField("red_kills", e.target.value)
                        }
                      />
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleSnapAll()}>
                    Ghép tên với username trên hệ thống
                  </Button>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Đội thắng</span>
                    <div className="flex gap-2">
                      {(["blue", "red"] as const).map((side) => (
                        <Button
                          key={side}
                          type="button"
                          size="sm"
                          variant={parsed.game.winner_side === side ? "default" : "outline"}
                          onClick={() => updateGameField("winner_side", side)}
                        >
                          {side === "blue" ? "Xanh (team A)" : "Đỏ (team B)"}
                        </Button>
                      ))}
                      {parsed.game.winner_side === null ? (
                        <span className="self-center text-xs text-destructive">Chưa chọn</span>
                      ) : null}
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
                </>
              ) : null}

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
                {games.length > 1
                  ? `Generate ${games.length} match_id`
                  : "Generate match_id"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {generatedItems.length ? (
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle>3. Dán vào Score Control</CardTitle>
              <CardDescription>
                {generatedItems.length === 1
                  ? "Dán match_id vào info_game_id (Game 1)."
                  : `Có ${generatedItems.length} ván — dán Ván 1 → Game 1, Ván 2 → Game 2, …`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {generatedItems.map((item, index) => (
                <div
                  key={item.match_id}
                  className="rounded-md border border-border p-4 space-y-2"
                >
                  <p className="text-xs text-muted-foreground">
                    Ván {index + 1} → dán vào Game {index + 1} (info_game_id)
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-base font-semibold">
                      {item.match_id}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void copyText("match_id", item.match_id)}
                    >
                      <Clipboard className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                onClick={() =>
                  navigate(
                    generatedItems[0]
                      ? `/ops/score-control?infoGameId=${encodeURIComponent(generatedItems[0].match_id)}`
                      : "/ops/score-control",
                  )
                }
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
