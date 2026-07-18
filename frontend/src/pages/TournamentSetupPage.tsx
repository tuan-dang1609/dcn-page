import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, Loader2, Plus, Save, Trash2 } from "lucide-react";
import {
  createMilestones,
  createPrizes,
  createRequirements,
  createRules,
  createTournament,
  getAllTournaments,
  getGames,
  getRankGames,
  getTournamentInfoById,
  syncMilestones,
  syncPrizes,
  syncRules,
  updateRequirements,
  updateTournament,
  type GameOption,
  type MilestonePayload,
  type PrizePayload,
  type RankGame,
  type RulePayload,
  type TournamentPayload,
} from "@/api/tournaments";
import { useAuth } from "@/contexts/AuthContext";
import PageLoader from "@/components/PageLoader";
import { uploadImageToSupabase } from "@/lib/supabaseUpload";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import axios from "axios";

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
  }

  const data = error.response?.data as {
    error?: string | { code?: string; message?: string };
    message?: string;
  };

  const payloadError = data?.error;
  if (typeof payloadError === "string" && payloadError.trim()) {
    return payloadError;
  }
  if (
    payloadError &&
    typeof payloadError === "object" &&
    typeof payloadError.message === "string" &&
    payloadError.message.trim()
  ) {
    return payloadError.message;
  }

  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message;
  }

  if (error.message) return error.message;
  return fallback;
};

const allowedRoleIds = new Set([1, 2, 3]);
const stepLabels = [
  "Giải đấu",
  "Milestones",
  "Rules",
  "Giải thưởng",
  "Requirements",
] as const;

type StepIndex = 1 | 2 | 3 | 4 | 5;

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

interface PrizeDraft {
  id?: string;
  place_label: string;
  place_order: string;
  prize: string;
  description: string;
}

const defaultPrizeDrafts = (): PrizeDraft[] => [
  { place_label: "🥇 1st", place_order: "1", prize: "", description: "" },
  { place_label: "🥈 2nd", place_order: "2", prize: "", description: "" },
  { place_label: "🥉 3rd", place_order: "3", prize: "", description: "" },
  { place_label: "4th", place_order: "4", prize: "", description: "" },
];

type TournamentListItem = {
  id: number;
  name: string;
  slug?: string | null;
  game_id?: number | null;
  season?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  register_start?: string | null;
  register_end?: string | null;
  check_in_start?: string | null;
  check_in_end?: string | null;
  max_player_per_team?: number | null;
  max_participate?: number | null;
  banner_url?: string | null;
  registration_mode?: "org" | "individual" | string | null;
};

type TournamentRequirementApi = {
  rank_min?: string;
  rank_max?: string;
  device?: string[] | string | null;
  discord?: boolean | null;
  pner_only?: boolean | null;
} | null;

type TournamentMilestoneApi = {
  id?: number | string;
  title?: string | null;
  context?: string | null;
  milestone_time?: string | null;
};

type TournamentRuleApi = {
  id?: number | string;
  title?: string | null;
  content?: string | null;
};

type TournamentPrizeApi = {
  id?: number | string;
  place_label?: string | null;
  place_order?: number | string | null;
  prize?: string | null;
  amount?: number | string | null;
  description?: string | null;
};

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

const toInputValue = (value: unknown) =>
  value === null || value === undefined ? "" : String(value);

const toGmt7InputDateTime = (value?: string | null) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";

  const hasTimeZone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed);
  if (!hasTimeZone) {
    return trimmed.replace(" ", "T").slice(0, 16);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";

  const gmt7 = new Date(parsed.getTime() + 7 * 60 * 60 * 1000);
  const year = gmt7.getUTCFullYear();
  const month = String(gmt7.getUTCMonth() + 1).padStart(2, "0");
  const day = String(gmt7.getUTCDate()).padStart(2, "0");
  const hour = String(gmt7.getUTCHours()).padStart(2, "0");
  const minute = String(gmt7.getUTCMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
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

const normalizeRankKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

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
    5: false,
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
    registration_mode: "org" as "org" | "individual",
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

  const [prizeMode, setPrizeMode] = useState<"post" | "patch">("patch");
  const [prizes, setPrizes] = useState<PrizeDraft[]>(defaultPrizeDrafts);

  const [requirementMode, setRequirementMode] = useState<"post" | "patch">(
    "patch",
  );
  const [requirements, setRequirements] = useState({
    rank_min: "",
    rank_max: "",
    devices_csv: "",
    discord_required: "false",
    pner_only: "false",
  });
  const [gameOptions, setGameOptions] = useState<GameOption[]>([]);
  const [tournamentOptions, setTournamentOptions] = useState<
    TournamentListItem[]
  >([]);
  const [rankOptions, setRankOptions] = useState<RankGame[]>([]);
  const [pendingRequirement, setPendingRequirement] =
    useState<TournamentRequirementApi>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

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
    const loadTournaments = async () => {
      try {
        const response = await getAllTournaments();
        setTournamentOptions((response.data ?? []) as TournamentListItem[]);
      } catch {
        setTournamentOptions([]);
      }
    };

    void loadTournaments();
  }, []);

  useEffect(() => {
    const loadGameOptions = async () => {
      try {
        const response = await getGames();
        setGameOptions(response.data?.data ?? []);
      } catch {
        setGameOptions([]);
      }
    };

    void loadGameOptions();
  }, []);

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
  const rankIdByName = useMemo(() => {
    const entries = rankOptions.map((rank) => [
      normalizeRankKey(rank.name),
      String(rank.id),
    ]);
    return new Map(entries);
  }, [rankOptions]);
  const gameById = useMemo(() => {
    const entries = gameOptions.map((game) => [String(game.id), game]);
    return new Map(entries);
  }, [gameOptions]);
  const tournamentById = useMemo(() => {
    const entries = tournamentOptions.map((item) => [String(item.id), item]);
    return new Map(entries);
  }, [tournamentOptions]);
  const tournamentOptionsSorted = useMemo(
    () =>
      [...tournamentOptions].sort(
        (a, b) => Number(b.id ?? 0) - Number(a.id ?? 0),
      ),
    [tournamentOptions],
  );
  const selectedGameId = tournamentForm.game_id;
  const selectedGame = gameById.get(String(selectedGameId));
  const selectedGameSlug = String(selectedGame?.short_name ?? "")
    .trim()
    .toLowerCase();
  const isTftGame = ["tft", "teamfighttactics", "teamfight_tactics"].includes(
    selectedGameSlug,
  );
  const isIndividualMode = tournamentForm.registration_mode === "individual";
  const hasGameIdOption = gameOptions.some(
    (game) => String(game.id) === selectedGameId,
  );
  const selectedPreviewSlug = tournamentForm.preview_game_slug.trim();
  const hasPreviewOption = gameOptions.some(
    (game) => String(game.short_name) === selectedPreviewSlug,
  );
  const hasTournamentIdOption = tournamentOptions.some(
    (item) => String(item.id) === tournamentIdInput,
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

  const applyRequirementFromApi = (requirement: TournamentRequirementApi) => {
    if (!requirement) {
      setRequirements({
        rank_min: "",
        rank_max: "",
        devices_csv: "",
        discord_required: "false",
        pner_only: "false",
      });
      setPendingRequirement(null);
      return;
    }

    const rankMinId = rankIdByName.get(normalizeRankKey(requirement.rank_min));
    const rankMaxId = rankIdByName.get(normalizeRankKey(requirement.rank_max));
    const devices = Array.isArray(requirement.device)
      ? requirement.device
      : requirement.device
        ? [String(requirement.device)]
        : [];
    const devicesCsv = devices.map((item) => String(item).trim()).join(", ");

    setRequirements({
      rank_min: rankMinId ?? "",
      rank_max: rankMaxId ?? "",
      devices_csv: devicesCsv,
      discord_required: requirement.discord ? "true" : "false",
      pner_only: requirement.pner_only ? "true" : "false",
    });
    setPendingRequirement(null);
  };

  const applyTournamentDetails = (
    details: NonNullable<
      Awaited<ReturnType<typeof getTournamentInfoById>>["data"]["info"]
    >,
  ) => {
    const nextMilestones = Array.isArray(details.milestones)
      ? (details.milestones as TournamentMilestoneApi[]).map((item) => ({
          id: item?.id !== undefined && item?.id !== null ? String(item.id) : "",
          title: String(item?.title ?? ""),
          context: String(item?.context ?? ""),
          milestone_time: toGmt7InputDateTime(item?.milestone_time),
        }))
      : [];
    const nextRules = Array.isArray(details.rule)
      ? (details.rule as TournamentRuleApi[]).map((item) => ({
          id: item?.id !== undefined && item?.id !== null ? String(item.id) : "",
          title: String(item?.title ?? ""),
          content: String(item?.content ?? ""),
        }))
      : [];
    const nextPrizes = Array.isArray(details.prizes)
      ? (details.prizes as TournamentPrizeApi[]).map((item, index) => ({
          id: item?.id !== undefined && item?.id !== null ? String(item.id) : "",
          place_label: String(item?.place_label ?? ""),
          place_order: toInputValue(item?.place_order ?? index + 1),
          prize: toInputValue(item?.prize ?? item?.amount),
          description: String(item?.description ?? ""),
        }))
      : [];

    setMilestones(
      nextMilestones.length
        ? nextMilestones
        : [{ title: "", context: "", milestone_time: "" }],
    );
    setRules(
      nextRules.length ? nextRules : [{ title: "", content: "" }],
    );
    setPrizes(nextPrizes.length ? nextPrizes : defaultPrizeDrafts());
    setMilestoneMode("patch");
    setRuleMode("patch");
    setPrizeMode("patch");
    setRequirementMode("patch");
    setPendingRequirement(
      (details.requirement ?? null) as TournamentRequirementApi,
    );

    setCompletedSteps({
      1: true,
      2: nextMilestones.some(
        (item) => item.title.trim() && item.context.trim(),
      ),
      3: nextRules.some((item) => item.title.trim() && item.content.trim()),
      4: nextPrizes.some(
        (item) => item.place_label.trim() && item.prize.trim(),
      ),
      5: Boolean(details.requirement),
    });
  };

  const applyTournamentToForm = (selected: TournamentListItem) => {
    const selectedGame = gameById.get(String(selected.game_id ?? ""));
    const fallbackCheckInStart =
      selected.check_in_start ?? selected.register_start ?? null;
    const fallbackCheckInEnd =
      selected.check_in_end ?? selected.register_end ?? null;

    setTournamentForm((prev) => ({
      ...prev,
      name: selected.name ?? "",
      game_id: toInputValue(selected.game_id),
      season: toInputValue(selected.season),
      date_start: toGmt7InputDateTime(selected.date_start),
      date_end: toGmt7InputDateTime(selected.date_end),
      register_start: toGmt7InputDateTime(selected.register_start),
      register_end: toGmt7InputDateTime(selected.register_end),
      check_in_start: toGmt7InputDateTime(fallbackCheckInStart),
      check_in_end: toGmt7InputDateTime(fallbackCheckInEnd),
      max_player_per_team: toInputValue(selected.max_player_per_team),
      max_participate: toInputValue(selected.max_participate),
      registration_mode:
        String(selected.registration_mode ?? "").toLowerCase() === "individual"
          ? "individual"
          : "org",
      preview_game_slug: selectedGame?.short_name ?? prev.preview_game_slug,
    }));

    if (selected.id !== undefined && selected.id !== null) {
      setTournamentIdInput(String(selected.id));
      setWorkflowTournamentId(String(selected.id));
    }

    setBannerFile(null);
  };

  const handleTournamentSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextId = event.target.value;
    setTournamentIdInput(nextId);

    if (!nextId) {
      setMilestones([{ title: "", context: "", milestone_time: "" }]);
      setRules([{ title: "", content: "" }]);
      setPrizes(defaultPrizeDrafts());
      applyRequirementFromApi(null);
      return;
    }
    const selected = tournamentById.get(nextId);
    if (!selected) return;

    setTournamentMode("update");
    applyTournamentToForm(selected);

    setDetailsLoading(true);
    void getTournamentInfoById(nextId)
      .then((response) => {
        const info = response.data?.info;
        if (info) applyTournamentDetails(info);
      })
      .catch((error: unknown) => {
        toast({
          title: "Không tải được chi tiết giải đấu",
          description: getApiErrorMessage(error, "Vui lòng thử lại."),
          variant: "destructive",
        });
      })
      .finally(() => {
        setDetailsLoading(false);
      });
  };

  useEffect(() => {
    if (!pendingRequirement) return;
    if (!rankOptions.length) return;
    applyRequirementFromApi(pendingRequirement);
  }, [pendingRequirement, rankOptions]);

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
        ...(tournamentForm.registration_mode === "individual"
          ? {
              registration_mode: "individual" as const,
              max_player_per_team: 1,
            }
          : {
              registration_mode: "org" as const,
              ...(toNumber(tournamentForm.max_player_per_team)
                ? {
                    max_player_per_team: Number(
                      tournamentForm.max_player_per_team,
                    ),
                  }
                : {}),
            }),
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
        description: getApiErrorMessage(error, "Vui lòng thử lại."),
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
        description: getApiErrorMessage(error, "Vui lòng thử lại."),
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
        description: getApiErrorMessage(error, "Vui lòng thử lại."),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitPrizes = async () => {
    const tournamentId = ensureTournamentId();
    if (!tournamentId) return;

    const payload: PrizePayload[] = prizes
      .filter((item) => item.place_label.trim() && item.prize.trim())
      .map((item, index) => {
        const placeOrder = toNumber(item.place_order) ?? index + 1;

        return {
          ...(toNumber(item.id) ? { id: Number(item.id) } : {}),
          place_label: item.place_label.trim(),
          place_order: placeOrder,
          prize: item.prize.trim(),
          ...(item.description.trim()
            ? { description: item.description.trim() }
            : {}),
        };
      });

    if (!payload.length) {
      toast({
        title: "Giải thưởng rỗng",
        description: "Hãy nhập ít nhất 1 hạng giải với số tiền hợp lệ.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      if (prizeMode === "post") {
        await createPrizes(tournamentId, payload);
      } else {
        await syncPrizes(tournamentId, payload);
      }

      markStepCompleted(4);
      setStep(5);

      toast({
        title: "Lưu giải thưởng thành công",
        description: `Đã ${prizeMode === "post" ? "tạo" : "đồng bộ"} prizes cho tournament #${tournamentId}.`,
      });
    } catch (error: any) {
      toast({
        title: "Lưu giải thưởng thất bại",
        description: getApiErrorMessage(error, "Vui lòng thử lại."),
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

    const devices = requirements.devices_csv
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    const payload = {
      rank_min: rankMin,
      rank_max: rankMax,
      devices,
      discord: requirements.discord_required === "true",
      pner_only: requirements.pner_only === "true",
    };

    setSubmitting(true);

    try {
      if (requirementMode === "post") {
        await createRequirements(tournamentId, payload);
      } else {
        await updateRequirements(tournamentId, payload);
      }

      markStepCompleted(5);
      setStep(5);

      toast({
        title: "Lưu requirements thành công",
        description: `Đã ${requirementMode === "post" ? "tạo" : "cập nhật"} requirements cho tournament #${tournamentId}. Bấm \"Qua trang tạo bracket\" để tiếp tục.`,
      });
    } catch (error: any) {
      toast({
        title: "Lưu requirements thất bại",
        description: getApiErrorMessage(error, "Vui lòng thử lại."),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || !user || !token) {
    return <PageLoader label="Đang kiểm tra quyền truy cập..." />;
  }

  if (!hasAccess) return null;

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <button
          onClick={() => navigate("/profile")}
          className="flex items-center gap-2text-[#EEEEEE] hover:text-foreground text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Về trang hồ sơ
        </button>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Tournament Setup Wizard</h1>
              <p className="text-smtext-[#EEEEEE]">
                Luồng tuần tự: Tạo giải, Milestones, Rules, Giải thưởng, Requirements.
              </p>
            </div>
            <Badge variant="outline">
              Tournament ID: {activeTournamentId ?? "chưa có"}
            </Badge>
          </div>

          <div className="grid gap-2 md:grid-cols-5">
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
              {tournamentMode === "update" ? (
                <div className="space-y-1">
                  <label className="text-xstext-[#EEEEEE]">
                    Chọn giải đấu
                  </label>
                  <select
                    value={tournamentIdInput}
                    onChange={handleTournamentSelect}
                    disabled={detailsLoading}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">
                      {detailsLoading ? "Đang tải..." : "Chọn tournament_id"}
                    </option>
                    {tournamentIdInput && !hasTournamentIdOption ? (
                      <option value={tournamentIdInput}>
                        ID {tournamentIdInput}
                      </option>
                    ) : null}
                    {tournamentOptionsSorted.map((item) => {
                      const game = gameById.get(String(item.game_id ?? ""));
                      const gameLabel = game
                        ? ` - ${game.name} (${game.short_name})`
                        : "";

                      return (
                        <option key={item.id} value={String(item.id)}>
                          #{item.id} - {item.name}
                          {gameLabel}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : null}
              <Input
                value={workflowTournamentId}
                onChange={(event) =>
                  setWorkflowTournamentId(event.target.value)
                }
                placeholder="ID dùng cho các bước sau"
                inputMode="numeric"
              />
              <div className="space-y-1">
                <label className="text-xstext-[#EEEEEE]">Game</label>
                <select
                  value={tournamentForm.game_id}
                  onChange={(event) => {
                    const nextGameId = event.target.value;
                    const nextGame = gameById.get(nextGameId);
                    const nextSlug = String(nextGame?.short_name ?? "")
                      .trim()
                      .toLowerCase();
                    const nextIsTft = [
                      "tft",
                      "teamfighttactics",
                      "teamfight_tactics",
                    ].includes(nextSlug);

                    setTournamentForm((prev) => ({
                      ...prev,
                      game_id: nextGameId,
                      preview_game_slug:
                        nextGame?.short_name ?? prev.preview_game_slug,
                      ...(nextIsTft
                        ? {}
                        : {
                            registration_mode: "org" as const,
                          }),
                    }));
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Chọn game (game_id)</option>
                  {selectedGameId && !hasGameIdOption ? (
                    <option value={selectedGameId}>
                      ID {selectedGameId}
                    </option>
                  ) : null}
                  {gameOptions.map((game) => (
                    <option key={game.id} value={String(game.id)}>
                      {game.name} ({game.short_name})
                    </option>
                  ))}
                </select>
              </div>
              {isTftGame ? (
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xstext-[#EEEEEE]">
                    Hình thức đăng ký (TFT)
                  </label>
                  <select
                    value={tournamentForm.registration_mode}
                    onChange={(event) => {
                      const nextMode =
                        event.target.value === "individual"
                          ? "individual"
                          : "org";
                      setTournamentForm((prev) => ({
                        ...prev,
                        registration_mode: nextMode,
                        ...(nextMode === "individual"
                          ? { max_player_per_team: "1" }
                          : {}),
                      }));
                    }}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="org">Theo tổ chức / đội (hiện tại)</option>
                    <option value="individual">
                      Cá nhân / TFT solo (không cần đội, cần Riot ID)
                    </option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Cá nhân: mỗi user tự đăng ký 1 suất; bắt buộc có
                    riot_account.
                  </p>
                </div>
              ) : null}
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
              <div className="space-y-1">
                <label className="text-xstext-[#EEEEEE]">
                  Game slug preview
                </label>
                <select
                  value={tournamentForm.preview_game_slug}
                  onChange={(event) =>
                    setTournamentForm((prev) => ({
                      ...prev,
                      preview_game_slug: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Chọn game slug</option>
                  {selectedPreviewSlug && !hasPreviewOption ? (
                    <option value={selectedPreviewSlug}>
                      {selectedPreviewSlug}
                    </option>
                  ) : null}
                  {gameOptions.map((game) => (
                    <option
                      key={`${game.id}-${game.short_name}`}
                      value={game.short_name}
                    >
                      {game.name} ({game.short_name})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xstext-[#EEEEEE]">
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
                <label className="text-xstext-[#EEEEEE]">
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
                <label className="text-xstext-[#EEEEEE]">
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
                <label className="text-xstext-[#EEEEEE]">
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
                <label className="text-xstext-[#EEEEEE]">
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
                <label className="text-xstext-[#EEEEEE]">
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
                value={
                  isIndividualMode ? "1" : tournamentForm.max_player_per_team
                }
                onChange={(event) =>
                  setTournamentForm((prev) => ({
                    ...prev,
                    max_player_per_team: event.target.value,
                  }))
                }
                placeholder="max_player_per_team"
                inputMode="numeric"
                disabled={isIndividualMode}
              />
              <Input
                value={tournamentForm.max_participate}
                onChange={(event) =>
                  setTournamentForm((prev) => ({
                    ...prev,
                    max_participate: event.target.value,
                  }))
                }
                placeholder={
                  isIndividualMode
                    ? "max_participate (số suất cá nhân)"
                    : "max_participate"
                }
                inputMode="numeric"
              />
            </div>

            <p className="text-xstext-[#EEEEEE]">
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
                <p className="text-smtext-[#EEEEEE]">Chưa có banner preview.</p>
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
                <p className="text-smtext-[#EEEEEE]">
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
              <h2 className="text-lg font-semibold">Bước 4: Giải thưởng</h2>
              <select
                value={prizeMode}
                onChange={(event) =>
                  setPrizeMode(event.target.value as "post" | "patch")
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="patch">PATCH /api/tournaments/prizes/:id</option>
                <option value="post">POST /api/tournaments/prizes/:id</option>
              </select>
            </div>

            <div className="space-y-3">
              {prizes.map((item, index) => (
                <div
                  key={index}
                  className="rounded-md border border-border p-3 space-y-2"
                >
                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                    <Input
                      value={item.id ?? ""}
                      onChange={(event) =>
                        setPrizes((prev) =>
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
                      value={item.place_label}
                      onChange={(event) =>
                        setPrizes((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, place_label: event.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="Hạng giải (vd: 🥇 1st)"
                    />
                    <Input
                      value={item.place_order}
                      onChange={(event) =>
                        setPrizes((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, place_order: event.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="Thứ tự"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <Input
                      value={item.prize}
                      onChange={(event) =>
                        setPrizes((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, prize: event.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="Giải thưởng (vd: 2.000.000 VND, Skin bundle...)"
                    />
                    <Input
                      value={item.description}
                      onChange={(event) =>
                        setPrizes((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, description: event.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="Mô tả (tùy chọn)"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() =>
                      setPrizes((prev) =>
                        prev.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                    disabled={prizes.length <= 1}
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
                  setPrizes((prev) => [
                    ...prev,
                    {
                      place_label: "",
                      place_order: String(prev.length + 1),
                      prize: "",
                      description: "",
                    },
                  ])
                }
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Thêm hạng giải
              </Button>
              <Button
                type="button"
                onClick={handleSubmitPrizes}
                disabled={submitting}
              >
                Lưu bước 4
              </Button>
            </div>
          </section>
        ) : null}

        {step === 5 ? (
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Bước 5: Requirements</h2>
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
                <label className="text-xstext-[#EEEEEE]">Rank tối thiểu</label>
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
                  <option value="">All rank</option>
                  {rankOptions.map((rank) => (
                    <option key={rank.id} value={String(rank.id)}>
                      {rank.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xstext-[#EEEEEE]">Rank tối đa</label>
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
                  <option value="">All rank</option>
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
                <label className="text-xstext-[#EEEEEE]">
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
              <div className="space-y-1">
                <label className="text-xstext-[#EEEEEE]">Trường</label>
                <select
                  value={requirements.pner_only}
                  onChange={(event) =>
                    setRequirements((prev) => ({
                      ...prev,
                      pner_only: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="false">false - Tất cả</option>
                  <option value="true">true - Phú Nhuận</option>
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
                Lưu bước 5
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
