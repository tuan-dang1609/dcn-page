import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, Loader2, Plus, Save, Trash2 } from "lucide-react";
import {
  createMilestones,
  createRequirements,
  createRules,
  createTournament,
  getRankGames,
  syncMilestones,
  syncRules,
  updateRequirements,
  updateTournament,
  type MilestonePayload,
  type RankGame,
  type RulePayload,
  type TournamentPayload,
} from "@/api/tournaments";
import { useAuth } from "@/contexts/AuthContext";
import { uploadImageToSupabase } from "@/lib/supabaseUpload";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const allowedRoleIds = new Set([1, 2, 3]);
const stepLabels = ["Giải đấu", "Milestones", "Rules", "Requirements"] as const;

type StepIndex = 1 | 2 | 3 | 4;

interface MilestoneDraft {
  id?: string;
  title: string;
  context: string;
  milestone_time: string;
}

interface RuleDraft {
  id?: string;
  title: string;
  content: string;
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const slugify = (raw: string) =>
  String(raw || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const openDateTimePicker = (event: { currentTarget: HTMLInputElement }) => {
  const input = event.currentTarget as HTMLInputElement & {
    showPicker?: () => void;
  };

  if (typeof input.showPicker === "function") {
    input.showPicker();
  }
};

const toGmt7OffsetDateTime = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;

  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed}:00`
    : trimmed;

  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(normalized)) {
    return normalized;
  }

  return `${normalized}+07:00`;
};

const TournamentSetupPage = () => {
  const navigate = useNavigate();
  const { user, token, isLoading } = useAuth();

  const [step, setStep] = useState<StepIndex>(1);
  const [completedSteps, setCompletedSteps] = useState<
    Record<StepIndex, boolean>
  >({
    1: false,
    2: false,
    3: false,
    4: false,
  });

  const [tournamentMode, setTournamentMode] = useState<"create" | "update">(
    "create",
  );
  const [tournamentIdInput, setTournamentIdInput] = useState("");
  const [workflowTournamentId, setWorkflowTournamentId] = useState("");

  const [tournamentForm, setTournamentForm] = useState({
    name: "",
    game_id: "",
    season: "",
    date_start: "",
    date_end: "",
    register_start: "",
    register_end: "",
    check_in_start: "",
    check_in_end: "",
    max_player_per_team: "",
    max_participate: "",
    preview_game_slug: "valorant",
  });
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreviewFromFile, setBannerPreviewFromFile] = useState("");

  const [milestoneMode, setMilestoneMode] = useState<"post" | "patch">("patch");
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    { title: "", context: "", milestone_time: "" },
  ]);

  const [ruleMode, setRuleMode] = useState<"post" | "patch">("patch");
  const [rules, setRules] = useState<RuleDraft[]>([{ title: "", content: "" }]);

  const [requirementMode, setRequirementMode] = useState<"post" | "patch">(
    "patch",
  );
  const [requirements, setRequirements] = useState({
    rank_min: "",
    rank_max: "",
    devices_csv: "",
    discord_required: "false",
  });
  const [rankOptions, setRankOptions] = useState<RankGame[]>([]);

  const [submitting, setSubmitting] = useState(false);

  const roleId = Number(user?.role_id);
  const hasAccess = allowedRoleIds.has(roleId);

  useEffect(() => {
    if (isLoading) return;

    if (!user || !token) {
      navigate(
        `/login?returnTo=${encodeURIComponent("/ops/tournament-setup")}`,
        {
          replace: true,
        },
      );
      return;
    }

    if (!allowedRoleIds.has(Number(user.role_id))) {
      toast({
        title: "Không có quyền truy cập",
        description: "Trang này chỉ dành cho role 1, 2, 3.",
        variant: "destructive",
      });
      navigate("/profile", { replace: true });
    }
  }, [isLoading, navigate, token, user]);

  useEffect(() => {
    if (!bannerFile) {
      setBannerPreviewFromFile("");
      return;
    }

    const objectUrl = URL.createObjectURL(bannerFile);
    setBannerPreviewFromFile(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [bannerFile]);

  useEffect(() => {
    const loadRankOptions = async () => {
      try {
        const response = await getRankGames();
        setRankOptions(response.data?.data ?? []);
      } catch {
        setRankOptions([]);
      }
    };

    void loadRankOptions();
  }, []);

  const activeTournamentId =
    toNumber(workflowTournamentId) ?? toNumber(tournamentIdInput);

  const computedSlug = useMemo(
    () => slugify(tournamentForm.name),
    [tournamentForm.name],
  );

  const bannerPreview = bannerPreviewFromFile || undefined;

  const previewPath =
    computedSlug && tournamentForm.preview_game_slug.trim()
      ? `/tournament/${tournamentForm.preview_game_slug.trim()}/${computedSlug}`
      : "";

  const previewUrl = previewPath
    ? `${window.location.origin}${previewPath}`
    : "";

  const markStepCompleted = (stepIndex: StepIndex) => {
    setCompletedSteps((prev) => ({ ...prev, [stepIndex]: true }));
  };

  const canEnterStep = (targetStep: StepIndex) => {
    if (targetStep === 1) return true;

    for (let i = 1; i < targetStep; i += 1) {
      if (!completedSteps[i as StepIndex]) return false;
    }

    return true;
  };

  const handleStepChange = (targetStep: StepIndex) => {
    if (!canEnterStep(targetStep)) {
      toast({
        title: "Hoàn thành bước trước",
        description: "Vui lòng submit các bước trước khi chuyển tiếp.",
        variant: "destructive",
      });
      return;
    }

    setStep(targetStep);
  };

  const ensureTournamentId = () => {
    if (!activeTournamentId) {
      toast({
        title: "Thiếu tournament_id",
        description: "Hãy hoàn thành bước Giải đấu hoặc nhập tournament_id.",
        variant: "destructive",
      });
      return null;
    }

    return activeTournamentId;
  };

  const handleSubmitTournament = async () => {
    const gameId = toNumber(tournamentForm.game_id);

    if (!tournamentForm.name.trim() || !gameId) {
      toast({
        title: "Thiếu dữ liệu bắt buộc",
        description: "Cần name và game_id để lưu giải đấu.",
        variant: "destructive",
      });
      return;
    }

    if (tournamentMode === "update" && !toNumber(tournamentIdInput)) {
      toast({
        title: "Thiếu ID update",
        description: "Chế độ cập nhật cần tournament_id hợp lệ.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      let nextBannerUrl = "";

      if (bannerFile) {
        nextBannerUrl = await uploadImageToSupabase(bannerFile);
      }

      const payload: TournamentPayload = {
        name: tournamentForm.name.trim(),
        game_id: gameId,
        ...(nextBannerUrl ? { banner_url: nextBannerUrl } : {}),
        ...(tournamentForm.season.trim()
          ? { season: tournamentForm.season.trim() }
          : {}),
        ...(toGmt7OffsetDateTime(tournamentForm.date_start)
          ? { date_start: toGmt7OffsetDateTime(tournamentForm.date_start) }
          : {}),
        ...(toGmt7OffsetDateTime(tournamentForm.date_end)
          ? { date_end: toGmt7OffsetDateTime(tournamentForm.date_end) }
          : {}),
        ...(toGmt7OffsetDateTime(tournamentForm.register_start)
          ? {
              register_start: toGmt7OffsetDateTime(
                tournamentForm.register_start,
              ),
            }
          : {}),
        ...(toGmt7OffsetDateTime(tournamentForm.register_end)
          ? { register_end: toGmt7OffsetDateTime(tournamentForm.register_end) }
          : {}),
        ...(toGmt7OffsetDateTime(tournamentForm.check_in_start)
          ? {
              check_in_start: toGmt7OffsetDateTime(
                tournamentForm.check_in_start,
              ),
            }
          : {}),
        ...(toGmt7OffsetDateTime(tournamentForm.check_in_end)
          ? { check_in_end: toGmt7OffsetDateTime(tournamentForm.check_in_end) }
          : {}),
        ...(toNumber(tournamentForm.max_player_per_team)
          ? { max_player_per_team: Number(tournamentForm.max_player_per_team) }
          : {}),
        ...(toNumber(tournamentForm.max_participate)
          ? { max_participate: Number(tournamentForm.max_participate) }
          : {}),
      };

      const response =
        tournamentMode === "create"
          ? await createTournament(payload)
          : await updateTournament(Number(tournamentIdInput), payload);

      const savedTournament = response.data?.data ?? response.data ?? {};
      const savedTournamentId =
        toNumber(savedTournament?.id) ?? toNumber(tournamentIdInput);

      if (savedTournamentId) {
        setTournamentIdInput(String(savedTournamentId));
        setWorkflowTournamentId(String(savedTournamentId));
      }

      if (savedTournament?.slug) {
        setTournamentForm((prev) => ({
          ...prev,
          name: savedTournament.name || prev.name,
        }));
      }

      setBannerFile(null);
      markStepCompleted(1);
      setStep(2);

      toast({
        title: "Lưu giải đấu thành công",
        description:
          tournamentMode === "create"
            ? `Đã tạo tournament #${savedTournamentId ?? "?"}.`
            : `Đã cập nhật tournament #${savedTournamentId ?? "?"}.`,
      });
    } catch (error: any) {
      toast({
        title: "Lưu giải đấu thất bại",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitMilestones = async () => {
    const tournamentId = ensureTournamentId();
    if (!tournamentId) return;

    const payload: MilestonePayload[] = milestones
      .filter((item) => item.title.trim() && item.context.trim())
      .map((item) => ({
        ...(toNumber(item.id) ? { id: Number(item.id) } : {}),
        title: item.title.trim(),
        context: item.context.trim(),
        ...(toGmt7OffsetDateTime(item.milestone_time)
          ? { milestone_time: toGmt7OffsetDateTime(item.milestone_time) }
          : {}),
      }));

    if (!payload.length) {
      toast({
        title: "Milestones rỗng",
        description: "Hãy nhập ít nhất 1 milestone hợp lệ.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      if (milestoneMode === "post") {
        await createMilestones(tournamentId, payload);
      } else {
        await syncMilestones(tournamentId, payload);
      }

      markStepCompleted(2);
      setStep(3);

      toast({
        title: "Lưu milestones thành công",
        description: `Đã ${milestoneMode === "post" ? "tạo" : "đồng bộ"} milestones cho tournament #${tournamentId}.`,
      });
    } catch (error: any) {
      toast({
        title: "Lưu milestones thất bại",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitRules = async () => {
    const tournamentId = ensureTournamentId();
    if (!tournamentId) return;

    const payload: RulePayload[] = rules
      .filter((item) => item.title.trim() && item.content.trim())
      .map((item) => ({
        ...(toNumber(item.id) ? { id: Number(item.id) } : {}),
        title: item.title.trim(),
        content: item.content.trim(),
      }));

    if (!payload.length) {
      toast({
        title: "Rules rỗng",
        description: "Hãy nhập ít nhất 1 rule hợp lệ.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      if (ruleMode === "post") {
        await createRules(tournamentId, payload);
      } else {
        await syncRules(tournamentId, payload);
      }

      markStepCompleted(3);
      setStep(4);

      toast({
        title: "Lưu rules thành công",
        description: `Đã ${ruleMode === "post" ? "tạo" : "đồng bộ"} rules cho tournament #${tournamentId}.`,
      });
    } catch (error: any) {
      toast({
        title: "Lưu rules thất bại",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitRequirements = async () => {
    const tournamentId = ensureTournamentId();
    if (!tournamentId) return;

    const rankMin = toNumber(requirements.rank_min);
    const rankMax = toNumber(requirements.rank_max);

    if (rankMin === null || rankMax === null) {
      toast({
        title: "Thiếu rank",
        description: "Cần rank_min và rank_max hợp lệ.",
        variant: "destructive",
      });
      return;
    }

    const devices = requirements.devices_csv
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    const payload = {
      rank_min: rankMin,
      rank_max: rankMax,
      devices,
      discord: requirements.discord_required === "true",
    };

    setSubmitting(true);

    try {
      if (requirementMode === "post") {
        await createRequirements(tournamentId, payload);
      } else {
        await updateRequirements(tournamentId, payload);
      }

      markStepCompleted(4);
      setStep(4);

      toast({
        title: "Lưu requirements thành công",
        description: `Đã ${requirementMode === "post" ? "tạo" : "cập nhật"} requirements cho tournament #${tournamentId}. Bấm \"Qua trang tạo bracket\" để tiếp tục.`,
      });
    } catch (error: any) {
      toast({
        title: "Lưu requirements thất bại",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || !user || !token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Đang kiểm tra quyền truy cập...</span>
      </div>
    );
  }

  if (!hasAccess) return null;

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <button
          onClick={() => navigate("/profile")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Về trang hồ sơ
        </button>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Tournament Setup Wizard</h1>
              <p className="text-sm text-muted-foreground">
                Luồng tuần tự: Tạo giải, Milestones, Rules, Requirements.
              </p>
            </div>
            <Badge variant="outline">
              Tournament ID: {activeTournamentId ?? "chưa có"}
            </Badge>
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            {stepLabels.map((label, index) => {
              const stepIndex = (index + 1) as StepIndex;
              const canEnter = canEnterStep(stepIndex);
              const isActive = step === stepIndex;

              return (
                <Button
                  key={label}
                  type="button"
                  variant={isActive ? "default" : "outline"}
                  disabled={!canEnter}
                  onClick={() => handleStepChange(stepIndex)}
                  className="justify-start"
                >
                  {index + 1}. {label}
                </Button>
              );
            })}
          </div>
        </section>

        {step === 1 ? (
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                Bước 1: Tạo/Cập nhật giải đấu
              </h2>
              <select
                value={tournamentMode}
                onChange={(event) =>
                  setTournamentMode(event.target.value as "create" | "update")
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="create">POST /api/tournaments/</option>
                <option value="update">PATCH /api/tournaments/:id</option>
              </select>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Input
                value={tournamentIdInput}
                onChange={(event) => setTournamentIdInput(event.target.value)}
                placeholder="tournament_id (khi update)"
                inputMode="numeric"
              />
              <Input
                value={workflowTournamentId}
                onChange={(event) =>
                  setWorkflowTournamentId(event.target.value)
                }
                placeholder="ID dùng cho các bước sau"
                inputMode="numeric"
              />
              <Input
                value={tournamentForm.game_id}
                onChange={(event) =>
                  setTournamentForm((prev) => ({
                    ...prev,
                    game_id: event.target.value,
                  }))
                }
                placeholder="game_id"
                inputMode="numeric"
              />
              <Input
                value={tournamentForm.name}
                onChange={(event) =>
                  setTournamentForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                placeholder="Tên giải đấu"
              />
              <Input
                value={tournamentForm.season}
                onChange={(event) =>
                  setTournamentForm((prev) => ({
                    ...prev,
                    season: event.target.value,
                  }))
                }
                placeholder="season (vd: 2026-S1)"
              />
              <Input
                value={tournamentForm.preview_game_slug}
                onChange={(event) =>
                  setTournamentForm((prev) => ({
                    ...prev,
                    preview_game_slug: event.target.value,
                  }))
                }
                placeholder="game slug preview (valorant/tft...)"
              />
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Date start (GMT+7)
                </label>
                <Input
                  type="datetime-local"
                  step={60}
                  title="Ngày bắt đầu - GMT+7"
                  value={tournamentForm.date_start}
                  onFocus={openDateTimePicker}
                  onClick={openDateTimePicker}
                  onChange={(event) =>
                    setTournamentForm((prev) => ({
                      ...prev,
                      date_start: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Date end (GMT+7)
                </label>
                <Input
                  type="datetime-local"
                  step={60}
                  title="Ngày kết thúc - GMT+7"
                  value={tournamentForm.date_end}
                  onFocus={openDateTimePicker}
                  onClick={openDateTimePicker}
                  onChange={(event) =>
                    setTournamentForm((prev) => ({
                      ...prev,
                      date_end: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Register start (GMT+7)
                </label>
                <Input
                  type="datetime-local"
                  step={60}
                  title="Mở đăng ký - GMT+7"
                  value={tournamentForm.register_start}
                  onFocus={openDateTimePicker}
                  onClick={openDateTimePicker}
                  onChange={(event) =>
                    setTournamentForm((prev) => ({
                      ...prev,
                      register_start: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Register end (GMT+7)
                </label>
                <Input
                  type="datetime-local"
                  step={60}
                  title="Đóng đăng ký - GMT+7"
                  value={tournamentForm.register_end}
                  onFocus={openDateTimePicker}
                  onClick={openDateTimePicker}
                  onChange={(event) =>
                    setTournamentForm((prev) => ({
                      ...prev,
                      register_end: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Check-in start (GMT+7)
                </label>
                <Input
                  type="datetime-local"
                  step={60}
                  title="Mở check-in - GMT+7"
                  value={tournamentForm.check_in_start}
                  onFocus={openDateTimePicker}
                  onClick={openDateTimePicker}
                  onChange={(event) =>
                    setTournamentForm((prev) => ({
                      ...prev,
                      check_in_start: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Check-in end (GMT+7)
                </label>
                <Input
                  type="datetime-local"
                  step={60}
                  title="Đóng check-in - GMT+7"
                  value={tournamentForm.check_in_end}
                  onFocus={openDateTimePicker}
                  onClick={openDateTimePicker}
                  onChange={(event) =>
                    setTournamentForm((prev) => ({
                      ...prev,
                      check_in_end: event.target.value,
                    }))
                  }
                />
              </div>
              <Input
                value={tournamentForm.max_player_per_team}
                onChange={(event) =>
                  setTournamentForm((prev) => ({
                    ...prev,
                    max_player_per_team: event.target.value,
                  }))
                }
                placeholder="max_player_per_team"
                inputMode="numeric"
              />
              <Input
                value={tournamentForm.max_participate}
                onChange={(event) =>
                  setTournamentForm((prev) => ({
                    ...prev,
                    max_participate: event.target.value,
                  }))
                }
                placeholder="max_participate"
                inputMode="numeric"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Tất cả mốc thời gian đang chọn theo GMT+7 khi submit.
            </p>

            <div className="space-y-2">
              <label className="text-sm font-medium">Upload banner</label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border py-3 text-sm hover:bg-muted/40 transition-colors">
                <Plus className="h-4 w-4" />
                <span>{bannerFile ? bannerFile.name : "Chọn ảnh banner"}</span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(event) =>
                    setBannerFile(event.target.files?.[0] ?? null)
                  }
                />
              </label>
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium">Xem trước trước khi submit</p>
              {bannerPreview ? (
                <img
                  src={bannerPreview}
                  alt="Banner preview"
                  className="w-full max-h-64 rounded-md object-cover border border-border"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Chưa có banner preview.
                </p>
              )}

              {previewPath ? (
                <div className="rounded-md border border-border bg-background p-3 text-sm space-y-2">
                  <p className="font-medium">Preview route</p>
                  <p className="text-muted-foreground">{previewPath}</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() =>
                      window.open(previewUrl, "_blank", "noopener,noreferrer")
                    }
                  >
                    <Eye className="h-4 w-4" />
                    Xem web trước
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nhập tên giải + game slug preview để tạo link xem trước.
                </p>
              )}
            </div>

            <Button
              type="button"
              onClick={handleSubmitTournament}
              disabled={submitting}
              className="gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Lưu bước 1
                </>
              )}
            </Button>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Bước 2: Milestones</h2>
              <select
                value={milestoneMode}
                onChange={(event) =>
                  setMilestoneMode(event.target.value as "post" | "patch")
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="patch">
                  PATCH /api/tournaments/milestones/:id
                </option>
                <option value="post">
                  POST /api/tournaments/milestones/:id
                </option>
              </select>
            </div>

            <div className="space-y-3">
              {milestones.map((item, index) => (
                <div
                  key={index}
                  className="rounded-md border border-border p-3 space-y-2"
                >
                  <div className="grid gap-2 md:grid-cols-3">
                    <Input
                      value={item.id ?? ""}
                      title="ID milestone để update (nếu có)"
                      onChange={(event) =>
                        setMilestones((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, id: event.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="id (để update, tùy chọn)"
                      inputMode="numeric"
                    />
                    <Input
                      value={item.title}
                      title="Tiêu đề milestone"
                      onChange={(event) =>
                        setMilestones((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, title: event.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="title"
                    />
                    <Input
                      type="datetime-local"
                      step={60}
                      title="Thời gian milestone - GMT+7"
                      value={item.milestone_time}
                      onFocus={openDateTimePicker}
                      onClick={openDateTimePicker}
                      onChange={(event) =>
                        setMilestones((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, milestone_time: event.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </div>
                  <textarea
                    className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={item.context}
                    onChange={(event) =>
                      setMilestones((prev) =>
                        prev.map((row, rowIndex) =>
                          rowIndex === index
                            ? { ...row, context: event.target.value }
                            : row,
                        ),
                      )
                    }
                    placeholder="context"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() =>
                      setMilestones((prev) =>
                        prev.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                    disabled={milestones.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                    Xóa
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setMilestones((prev) => [
                    ...prev,
                    { title: "", context: "", milestone_time: "" },
                  ])
                }
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Thêm milestone
              </Button>

              <Button
                type="button"
                onClick={handleSubmitMilestones}
                disabled={submitting}
              >
                Lưu bước 2
              </Button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Bước 3: Rules</h2>
              <select
                value={ruleMode}
                onChange={(event) =>
                  setRuleMode(event.target.value as "post" | "patch")
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="patch">PATCH /api/tournaments/rules/:id</option>
                <option value="post">POST /api/tournaments/rules/:id</option>
              </select>
            </div>

            <div className="space-y-3">
              {rules.map((item, index) => (
                <div
                  key={index}
                  className="rounded-md border border-border p-3 space-y-2"
                >
                  <div className="grid gap-2 md:grid-cols-2">
                    <Input
                      value={item.id ?? ""}
                      onChange={(event) =>
                        setRules((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, id: event.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="id (để update, tùy chọn)"
                      inputMode="numeric"
                    />
                    <Input
                      value={item.title}
                      onChange={(event) =>
                        setRules((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, title: event.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="title"
                    />
                  </div>
                  <textarea
                    className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={item.content}
                    onChange={(event) =>
                      setRules((prev) =>
                        prev.map((row, rowIndex) =>
                          rowIndex === index
                            ? { ...row, content: event.target.value }
                            : row,
                        ),
                      )
                    }
                    placeholder="content"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() =>
                      setRules((prev) =>
                        prev.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                    disabled={rules.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                    Xóa
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setRules((prev) => [...prev, { title: "", content: "" }])
                }
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Thêm rule
              </Button>
              <Button
                type="button"
                onClick={handleSubmitRules}
                disabled={submitting}
              >
                Lưu bước 3
              </Button>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Bước 4: Requirements</h2>
              <select
                value={requirementMode}
                onChange={(event) =>
                  setRequirementMode(event.target.value as "post" | "patch")
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="patch">
                  PATCH /api/tournaments/requirements/:id
                </option>
                <option value="post">
                  POST /api/tournaments/requirements/:id
                </option>
              </select>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Rank tối thiểu
                </label>
                <select
                  value={requirements.rank_min}
                  onChange={(event) =>
                    setRequirements((prev) => ({
                      ...prev,
                      rank_min: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Chọn rank_min</option>
                  {rankOptions.map((rank) => (
                    <option key={rank.id} value={String(rank.id)}>
                      {rank.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Rank tối đa
                </label>
                <select
                  value={requirements.rank_max}
                  onChange={(event) =>
                    setRequirements((prev) => ({
                      ...prev,
                      rank_max: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Chọn rank_max</option>
                  {rankOptions.map((rank) => (
                    <option key={rank.id} value={String(rank.id)}>
                      {rank.name}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                value={requirements.devices_csv}
                onChange={(event) =>
                  setRequirements((prev) => ({
                    ...prev,
                    devices_csv: event.target.value,
                  }))
                }
                placeholder="devices, ngăn cách bởi dấu phẩy"
              />
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Yêu cầu vào Discord
                </label>
                <select
                  value={requirements.discord_required}
                  onChange={(event) =>
                    setRequirements((prev) => ({
                      ...prev,
                      discord_required: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="false">false - Không bắt buộc</option>
                  <option value="true">true - Bắt buộc vào Discord</option>
                </select>
              </div>
            </div>

            {rankOptions.length === 0 ? (
              <p className="text-xs text-amber-600">
                Chưa tải được danh sách rank từ `rank_game`. Vui lòng kiểm tra
                API `/api/tournaments/requirements/ranks`.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleSubmitRequirements}
                disabled={submitting}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                Lưu bước 4
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const tournamentId = ensureTournamentId();
                  if (!tournamentId) return;
                  navigate(`/ops/bracket-setup?tournamentId=${tournamentId}`);
                }}
              >
                Qua trang tạo bracket
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
};

export default TournamentSetupPage;
