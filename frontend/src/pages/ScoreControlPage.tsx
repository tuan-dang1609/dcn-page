import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Clipboard,
  Link2,
  Loader2,
  Plus,
  RotateCw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  createMatchGameId,
  deleteMatchGameId,
  getBracketsByTournamentId,
  getMatchGameIds,
  getMatchesByBracketId,
  pairSwissNextRound,
  updateMatchGameId,
  updateMatchScore,
  type Bracket,
  type Match,
  type MatchGameIdRecord,
} from "@/api/tournaments";
import { initRoundBanPick } from "@/api/banpick";
import { tournamentsBaseUrl } from "@/api/tournaments/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const allowedRoleIds = new Set([1, 2, 3]);
const providerOptions = [
  { value: "", label: "Auto theo game của tournament" },
  { value: "valorant", label: "Valorant" },
  { value: "lol", label: "LoL" },
  { value: "tft", label: "TFT" },
];

const gameNoOptions = Array.from({ length: 7 }, (_, index) => index + 1);

type BanPickFormat = "BO1" | "BO3" | "BO5";

const banPickFormatOptions: Array<{ value: BanPickFormat; label: string }> = [
  { value: "BO1", label: "BO1" },
  { value: "BO3", label: "BO3" },
  { value: "BO5", label: "BO5" },
];

interface EditableMatch extends Match {
  draftScoreA: string;
  draftScoreB: string;
  draftWinnerTeamId: string;
  draftDateScheduled: string;
  saving?: boolean;
  scheduleSaving?: boolean;
}

interface NewGameIdDraft {
  infoGameId: string;
  provider: string;
  gameNo: string;
  saving?: boolean;
}

interface EditGameIdDraft {
  infoGameId: string;
  provider: string;
  gameNo: string;
  saving?: boolean;
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const normalizeProviderKey = (value?: string | null) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) return "";
  if (["valo", "val", "valorant"].includes(normalized)) return "valorant";
  if (["lol", "leagueoflegends", "league_of_legends"].includes(normalized))
    return "lol";
  if (["tft", "teamfighttactics", "teamfight_tactics"].includes(normalized))
    return "tft";

  return normalized;
};

const getInfoGameIdPlaceholder = (provider?: string) => {
  const normalizedProvider = normalizeProviderKey(provider);

  if (normalizedProvider === "valorant") {
    return "Dán link/UUID Valorant match";
  }

  if (normalizedProvider === "lol") {
    return "Dán link/ID LoL match";
  }

  if (normalizedProvider === "tft") {
    return "Dán link/ID TFT match";
  }

  return "Dán link match hoặc nhập ID";
};

const normalizeInfoGameIdInput = (rawValue: string, provider?: string) => {
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) return "";

  const normalizedProvider = normalizeProviderKey(provider);
  const uuidPattern =
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

  const uuidInText = trimmed.match(uuidPattern)?.[0] ?? "";
  if (normalizedProvider === "valorant" && uuidInText) {
    return uuidInText;
  }

  try {
    const url = new URL(trimmed);
    const queryId =
      url.searchParams.get("matchId") ??
      url.searchParams.get("match_id") ??
      url.searchParams.get("id");

    if (queryId?.trim()) {
      const fromQuery = queryId.trim();
      if (normalizedProvider === "valorant") {
        return fromQuery.match(uuidPattern)?.[0] ?? fromQuery;
      }
      return fromQuery;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    const matchSegmentIndex = segments.findIndex(
      (segment) => segment.toLowerCase() === "match",
    );

    const candidateFromPath =
      matchSegmentIndex >= 0 && segments[matchSegmentIndex + 1]
        ? decodeURIComponent(segments[matchSegmentIndex + 1])
        : decodeURIComponent(segments[segments.length - 1] ?? "");

    const cleaned = candidateFromPath.trim();
    if (cleaned) {
      if (normalizedProvider === "valorant") {
        return cleaned.match(uuidPattern)?.[0] ?? cleaned;
      }

      return cleaned;
    }
  } catch {
    // fallback to raw pattern extraction below
  }

  const fromMatchPath = trimmed.match(/match\/([^/?#]+)/i)?.[1] ?? "";
  if (fromMatchPath) {
    const candidate = decodeURIComponent(fromMatchPath.trim());
    if (normalizedProvider === "valorant") {
      return candidate.match(uuidPattern)?.[0] ?? candidate;
    }
    return candidate;
  }

  return trimmed;
};

const toDatetimeLocalInput = (value?: string | null) => {
  if (!value) return "";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const fromDatetimeLocalInput = (value: string) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString();
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "Chưa hẹn giờ";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Chưa hẹn giờ";

  return parsed.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildScoreControlRoundSlug = ({
  tournamentId,
  roundNumber,
  matchNo,
  matchId,
}: {
  tournamentId?: number | null;
  roundNumber?: number | null;
  matchNo?: number | null;
  matchId: number;
}) => {
  const safeTournament = toNumber(tournamentId) ?? 0;
  const safeRound = toNumber(roundNumber) ?? 0;
  const safeMatchNo = toNumber(matchNo) ?? matchId;

  return `ops-t${safeTournament}-r${safeRound}-m${safeMatchNo}-${matchId}`;
};

const hydrateMatches = (matches: Match[]): EditableMatch[] =>
  matches.map((match) => ({
    ...match,
    draftScoreA:
      match.score_a === null || match.score_a === undefined
        ? ""
        : String(match.score_a),
    draftScoreB:
      match.score_b === null || match.score_b === undefined
        ? ""
        : String(match.score_b),
    draftWinnerTeamId:
      match.winner_team_id === null || match.winner_team_id === undefined
        ? "auto"
        : String(match.winner_team_id),
    draftDateScheduled: toDatetimeLocalInput(match.date_scheduled),
    saving: false,
    scheduleSaving: false,
  }));

const createEmptyNewGameIdDraft = (): NewGameIdDraft => ({
  infoGameId: "",
  provider: "",
  gameNo: "",
  saving: false,
});

const createEditGameIdDraft = (item: MatchGameIdRecord): EditGameIdDraft => ({
  infoGameId: item.info_game_id ?? "",
  provider: normalizeProviderKey(
    item.external_provider ?? item.resolved_provider,
  ),
  gameNo:
    item.game_no === null || item.game_no === undefined
      ? ""
      : String(item.game_no),
  saving: false,
});

const ScoreControlPage = () => {
  const navigate = useNavigate();
  const { user, token, isLoading } = useAuth();

  const [tournamentIdInput, setTournamentIdInput] = useState("");
  const [brackets, setBrackets] = useState<Bracket[]>([]);
  const [selectedBracketId, setSelectedBracketId] = useState("");
  const [matches, setMatches] = useState<EditableMatch[]>([]);

  const [loadingBrackets, setLoadingBrackets] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [pairingSwiss, setPairingSwiss] = useState(false);
  const [targetSwissRound, setTargetSwissRound] = useState("");
  const [gameIdsByMatch, setGameIdsByMatch] = useState<
    Record<number, MatchGameIdRecord[]>
  >({});
  const [loadingGameIdsByMatch, setLoadingGameIdsByMatch] = useState<
    Record<number, boolean>
  >({});
  const [newGameIdDraftByMatch, setNewGameIdDraftByMatch] = useState<
    Record<number, NewGameIdDraft>
  >({});
  const [editGameIdDraftByRow, setEditGameIdDraftByRow] = useState<
    Record<number, EditGameIdDraft>
  >({});
  const [banPickFormatByMatch, setBanPickFormatByMatch] = useState<
    Record<number, BanPickFormat>
  >({});
  const [settingUpBanPickByMatch, setSettingUpBanPickByMatch] = useState<
    Record<number, boolean>
  >({});

  const roleId = Number(user?.role_id);
  const hasAccess = allowedRoleIds.has(roleId);

  useEffect(() => {
    if (isLoading) return;

    if (!user || !token) {
      navigate(`/login?returnTo=${encodeURIComponent("/ops/score-control")}`, {
        replace: true,
      });
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

  const selectedBracket = useMemo(
    () => brackets.find((bracket) => String(bracket.id) === selectedBracketId),
    [brackets, selectedBracketId],
  );

  const isSwissBracket =
    String(selectedBracket?.format_type || "").toLowerCase() === "swiss";

  const loadMatches = async (bracketId: number) => {
    setLoadingMatches(true);

    try {
      const response = await getMatchesByBracketId(bracketId);
      const nextMatches = hydrateMatches(response.data?.data ?? []);
      setMatches(nextMatches);
      setGameIdsByMatch({});
      setLoadingGameIdsByMatch({});
      setNewGameIdDraftByMatch({});
      setEditGameIdDraftByRow({});
      setBanPickFormatByMatch({});
      setSettingUpBanPickByMatch({});
    } catch (error: any) {
      toast({
        title: "Không thể tải danh sách trận",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
      setMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  };

  const setLoadingGameIds = (matchId: number, loading: boolean) => {
    setLoadingGameIdsByMatch((prev) => ({
      ...prev,
      [matchId]: loading,
    }));
  };

  const loadGameIdsForMatch = async (matchId: number) => {
    setLoadingGameIds(matchId, true);

    try {
      const response = await getMatchGameIds(matchId);
      const items = response.data?.data ?? [];

      setGameIdsByMatch((prev) => ({
        ...prev,
        [matchId]: items,
      }));

      setEditGameIdDraftByRow((prev) => {
        const next = { ...prev };
        items.forEach((item) => {
          next[item.id] = createEditGameIdDraft(item);
        });
        return next;
      });
    } catch (error: any) {
      toast({
        title: "Không tải được info_game_id",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setLoadingGameIds(matchId, false);
    }
  };

  const updateNewGameIdDraft = (
    matchId: number,
    key: keyof NewGameIdDraft,
    value: string | boolean,
  ) => {
    setNewGameIdDraftByMatch((prev) => ({
      ...prev,
      [matchId]: {
        ...(prev[matchId] ?? createEmptyNewGameIdDraft()),
        [key]: value,
      },
    }));
  };

  const updateEditGameIdDraft = (
    rowId: number,
    key: keyof EditGameIdDraft,
    value: string | boolean,
  ) => {
    setEditGameIdDraftByRow((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] ?? {
          infoGameId: "",
          provider: "",
          gameNo: "",
          saving: false,
        }),
        [key]: value,
      },
    }));
  };

  const handleCreateGameId = async (matchId: number) => {
    const draft = newGameIdDraftByMatch[matchId] ?? createEmptyNewGameIdDraft();
    const infoGameId = normalizeInfoGameIdInput(
      draft.infoGameId,
      draft.provider,
    );

    if (!infoGameId) {
      toast({
        title: "Thiếu info_game_id",
        description: "Vui lòng dán link hoặc nhập ID trận game trước khi thêm.",
        variant: "destructive",
      });
      return;
    }

    updateNewGameIdDraft(matchId, "saving", true);

    try {
      const payload: {
        match_id_info: string;
        info_game_id?: string;
        external_provider?: string | null;
        game_no?: number;
      } = {
        match_id_info: infoGameId,
      };

      const gameNo = toNumber(draft.gameNo);
      if (gameNo !== null) payload.game_no = gameNo;
      const normalizedProvider = normalizeProviderKey(draft.provider);
      if (normalizedProvider) payload.external_provider = normalizedProvider;

      await createMatchGameId(matchId, payload);

      toast({
        title: "Đã thêm info_game_id",
        description: `Match #${matchId} đã thêm ID game mới.`,
      });

      setNewGameIdDraftByMatch((prev) => ({
        ...prev,
        [matchId]: createEmptyNewGameIdDraft(),
      }));

      await loadGameIdsForMatch(matchId);
    } catch (error: any) {
      toast({
        title: "Thêm info_game_id thất bại",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      updateNewGameIdDraft(matchId, "saving", false);
    }
  };

  const handlePasteInfoGameId = async (matchId: number) => {
    try {
      if (!navigator?.clipboard?.readText) {
        toast({
          title: "Không thể đọc clipboard",
          description: "Trình duyệt chưa hỗ trợ đọc clipboard.",
          variant: "destructive",
        });
        return;
      }

      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText.trim()) {
        toast({
          title: "Clipboard đang trống",
          description: "Hãy copy link/ID trước khi bấm dán.",
          variant: "destructive",
        });
        return;
      }

      updateNewGameIdDraft(matchId, "infoGameId", clipboardText);
    } catch {
      toast({
        title: "Không thể dán từ clipboard",
        description: "Vui lòng cho phép quyền đọc clipboard hoặc dán thủ công.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateGameId = async (matchId: number, rowId: number) => {
    const draft = editGameIdDraftByRow[rowId];
    if (!draft) return;

    updateEditGameIdDraft(rowId, "saving", true);

    try {
      const normalizedInfoGameId = normalizeInfoGameIdInput(
        draft.infoGameId,
        draft.provider,
      );

      const payload: {
        match_id_info?: string | null;
        info_game_id?: string | null;
        external_provider?: string | null;
        game_no?: number;
      } = {};

      payload.match_id_info = normalizedInfoGameId || null;
      payload.info_game_id = normalizedInfoGameId || null;
      const normalizedProvider = normalizeProviderKey(draft.provider);
      if (normalizedProvider) {
        payload.external_provider = normalizedProvider;
      }

      const gameNo = toNumber(draft.gameNo);
      if (gameNo !== null) payload.game_no = gameNo;

      await updateMatchGameId(matchId, rowId, payload);

      toast({
        title: "Đã cập nhật info_game_id",
        description: `Game row #${rowId} đã được cập nhật.`,
      });

      await loadGameIdsForMatch(matchId);
    } catch (error: any) {
      toast({
        title: "Cập nhật info_game_id thất bại",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      updateEditGameIdDraft(rowId, "saving", false);
    }
  };

  const handleDeleteGameId = async (matchId: number, rowId: number) => {
    updateEditGameIdDraft(rowId, "saving", true);

    try {
      await deleteMatchGameId(matchId, rowId);

      toast({
        title: "Đã xóa info_game_id",
        description: `Game row #${rowId} đã được xóa khỏi match #${matchId}.`,
      });

      await loadGameIdsForMatch(matchId);
    } catch (error: any) {
      toast({
        title: "Xóa info_game_id thất bại",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      updateEditGameIdDraft(rowId, "saving", false);
    }
  };

  const handleLoadBrackets = async () => {
    const tournamentId = toNumber(tournamentIdInput);

    if (!tournamentId) {
      toast({
        title: "Thiếu tournament_id",
        description: "Vui lòng nhập tournament_id hợp lệ.",
        variant: "destructive",
      });
      return;
    }

    setLoadingBrackets(true);

    try {
      const response = await getBracketsByTournamentId(tournamentId);
      const nextBrackets = response.data?.data ?? [];

      setBrackets(nextBrackets);
      setMatches([]);
      setGameIdsByMatch({});
      setLoadingGameIdsByMatch({});
      setNewGameIdDraftByMatch({});
      setEditGameIdDraftByRow({});
      setBanPickFormatByMatch({});
      setSettingUpBanPickByMatch({});

      if (!nextBrackets.length) {
        setSelectedBracketId("");
        toast({
          title: "Chưa có bracket",
          description: "Tournament này chưa có bracket để cập nhật điểm.",
        });
        return;
      }

      const preferred =
        nextBrackets.find(
          (item) => String(item.stage || "").toLowerCase() === "main",
        ) ?? nextBrackets[0];

      setSelectedBracketId(String(preferred.id));
      await loadMatches(Number(preferred.id));

      toast({
        title: "Đã tải bracket",
        description: `Tìm thấy ${nextBrackets.length} bracket cho tournament #${tournamentId}.`,
      });
    } catch (error: any) {
      toast({
        title: "Không thể tải bracket",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setLoadingBrackets(false);
    }
  };

  const handleLoadMatches = async () => {
    const bracketId = toNumber(selectedBracketId);
    if (!bracketId) return;
    await loadMatches(bracketId);
  };

  const updateDraftMatch = (
    matchId: number,
    key:
      | "draftScoreA"
      | "draftScoreB"
      | "draftWinnerTeamId"
      | "draftDateScheduled",
    value: string,
  ) => {
    setMatches((prev) =>
      prev.map((item) =>
        item.id === matchId ? { ...item, [key]: value } : item,
      ),
    );
  };

  const setSavingForMatch = (matchId: number, saving: boolean) => {
    setMatches((prev) =>
      prev.map((item) => (item.id === matchId ? { ...item, saving } : item)),
    );
  };

  const setScheduleSavingForMatch = (
    matchId: number,
    scheduleSaving: boolean,
  ) => {
    setMatches((prev) =>
      prev.map((item) =>
        item.id === matchId ? { ...item, scheduleSaving } : item,
      ),
    );
  };

  const getDefaultBanPickFormatForMatch = (
    match: EditableMatch,
  ): BanPickFormat => {
    const bestOf = toNumber((match as Match & { best_of?: unknown }).best_of);
    if (bestOf === 1) return "BO1";
    if (bestOf === 5) return "BO5";
    return "BO3";
  };

  const getBanPickFormatForMatch = (match: EditableMatch): BanPickFormat =>
    banPickFormatByMatch[match.id] ?? getDefaultBanPickFormatForMatch(match);

  const setBanPickFormatForMatch = (matchId: number, format: BanPickFormat) => {
    setBanPickFormatByMatch((prev) => ({
      ...prev,
      [matchId]: format,
    }));
  };

  const setSettingUpBanPick = (matchId: number, value: boolean) => {
    setSettingUpBanPickByMatch((prev) => ({
      ...prev,
      [matchId]: value,
    }));
  };

  const getBanPickLinkForMatch = (
    match: EditableMatch,
    format: BanPickFormat,
  ) => {
    const roundSlug = buildScoreControlRoundSlug({
      tournamentId: toNumber(tournamentIdInput),
      roundNumber: toNumber(match.round_number),
      matchNo: toNumber(match.match_no),
      matchId: match.id,
    });

    const params = new URLSearchParams({
      matchId: String(match.id),
      format,
    });

    return `/round/${roundSlug}?${params.toString()}`;
  };

  const handleSetupBanPick = async (match: EditableMatch) => {
    const selectedFormat = getBanPickFormatForMatch(match);
    const roundSlug = buildScoreControlRoundSlug({
      tournamentId: toNumber(tournamentIdInput),
      roundNumber: toNumber(match.round_number),
      matchNo: toNumber(match.match_no),
      matchId: match.id,
    });

    setSettingUpBanPick(match.id, true);

    try {
      await initRoundBanPick(
        roundSlug,
        {
          match_id: match.id,
          format: selectedFormat,
        },
        token,
      );

      toast({
        title: "Đã setup Ban/Pick",
        description: `Match #${match.id} đã sẵn sàng với format ${selectedFormat}.`,
      });
    } catch (error: any) {
      toast({
        title: "Setup Ban/Pick thất bại",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setSettingUpBanPick(match.id, false);
    }
  };

  const handleOpenBanPick = (match: EditableMatch) => {
    const selectedFormat = getBanPickFormatForMatch(match);
    const link = getBanPickLinkForMatch(match, selectedFormat);
    navigate(link);
  };

  const handleSaveMatch = async (match: EditableMatch) => {
    const scoreA = toNumber(match.draftScoreA);
    const scoreB = toNumber(match.draftScoreB);

    if (scoreA === null || scoreB === null) {
      toast({
        title: "Điểm không hợp lệ",
        description: "score_a và score_b phải là số.",
        variant: "destructive",
      });
      return;
    }

    const winnerSelection = String(match.draftWinnerTeamId || "auto");

    const payload: {
      score_a: number;
      score_b: number;
      status: string;
      winner_team_id?: number | null;
    } = {
      score_a: scoreA,
      score_b: scoreB,
      status: "completed",
    };

    if (winnerSelection === "none") {
      payload.winner_team_id = null;
    } else if (winnerSelection !== "auto") {
      const winnerTeamId = toNumber(winnerSelection);
      if (winnerTeamId !== null) {
        payload.winner_team_id = winnerTeamId;
      }
    }

    setSavingForMatch(match.id, true);

    try {
      await updateMatchScore(match.id, payload);
      toast({
        title: "Cập nhật điểm thành công",
        description: `Match #${match.id} đã được cập nhật.`,
      });

      const bracketId = toNumber(selectedBracketId);
      if (bracketId) {
        await loadMatches(bracketId);
      }
    } catch (error: any) {
      toast({
        title: "Cập nhật điểm thất bại",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setSavingForMatch(match.id, false);
    }
  };

  const handleSaveMatchSchedule = async (match: EditableMatch) => {
    const nextDateScheduled = fromDatetimeLocalInput(match.draftDateScheduled);

    if (String(match.draftDateScheduled).trim() !== "" && !nextDateScheduled) {
      toast({
        title: "Ngày giờ không hợp lệ",
        description: "Vui lòng nhập đúng định dạng ngày giờ.",
        variant: "destructive",
      });
      return;
    }

    setScheduleSavingForMatch(match.id, true);

    try {
      await axios.patch(
        `${tournamentsBaseUrl}/matches/matches/${match.id}/schedule`,
        { date_scheduled: nextDateScheduled },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      toast({
        title: "Cập nhật lịch thi đấu thành công",
        description: `Match #${match.id} đã cập nhật date_scheduled.`,
      });

      const bracketId = toNumber(selectedBracketId);
      if (bracketId) {
        await loadMatches(bracketId);
      }
    } catch (error: any) {
      toast({
        title: "Cập nhật lịch thi đấu thất bại",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setScheduleSavingForMatch(match.id, false);
    }
  };

  const handlePairSwissRound = async () => {
    const tournamentId = toNumber(tournamentIdInput);
    const bracketId = toNumber(selectedBracketId);

    if (!isSwissBracket) {
      toast({
        title: "Không phải Swiss bracket",
        description: "Chức năng roll round chỉ áp dụng cho Swiss.",
        variant: "destructive",
      });
      return;
    }

    if (!tournamentId || !bracketId) {
      toast({
        title: "Thiếu dữ liệu",
        description: "Cần tournament_id và bracket_id hợp lệ để pair round.",
        variant: "destructive",
      });
      return;
    }

    const roundNumber = toNumber(targetSwissRound);

    setPairingSwiss(true);

    try {
      const response = await pairSwissNextRound(tournamentId, bracketId, {
        ...(roundNumber !== null ? { round_number: roundNumber } : {}),
      });

      toast({
        title: "Pair Swiss thành công",
        description:
          response.data?.message || "Đã roll cặp đấu cho round tiếp theo.",
      });

      await loadMatches(bracketId);
    } catch (error: any) {
      toast({
        title: "Pair Swiss thất bại",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setPairingSwiss(false);
    }
  };

  if (isLoading || !user || !token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-centertext-[#EEEEEE] gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Đang kiểm tra quyền truy cập...</span>
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

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
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Score Control Panel</h1>
              <p className="text-smtext-[#EEEEEE]">
                Trang riêng cho role 1, 2, 3 để cập nhật điểm và roll Swiss
                round.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
            <Input
              value={tournamentIdInput}
              onChange={(event) => setTournamentIdInput(event.target.value)}
              placeholder="Nhập tournament_id"
              inputMode="numeric"
            />
            <select
              value={selectedBracketId}
              onChange={(event) => setSelectedBracketId(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Chọn bracket</option>
              {brackets.map((bracket) => (
                <option key={bracket.id} value={String(bracket.id)}>
                  #{bracket.id} - {bracket.name || "Bracket"} (
                  {bracket.format_type || "unknown"})
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleLoadBrackets}
                disabled={loadingBrackets}
              >
                {loadingBrackets ? "Đang tải..." : "Tải bracket"}
              </Button>
              <Button
                type="button"
                onClick={handleLoadMatches}
                disabled={!selectedBracketId || loadingMatches}
              >
                {loadingMatches ? "Đang tải..." : "Tải matches"}
              </Button>
            </div>
          </div>

          {isSwissBracket ? (
            <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-smtext-[#EEEEEE]">
                Swiss stage: có thể roll cặp đấu round tiếp theo sau khi cập
                nhật điểm.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={targetSwissRound}
                  onChange={(event) => setTargetSwissRound(event.target.value)}
                  placeholder="round_number (để trống = auto)"
                  className="w-64"
                  inputMode="numeric"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handlePairSwissRound}
                  disabled={pairingSwiss}
                  className="gap-2"
                >
                  {pairingSwiss ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Đang pair...
                    </>
                  ) : (
                    <>
                      <RotateCw className="h-4 w-4" />
                      Pair next round
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Danh sách match</h2>
            <span className="text-smtext-[#EEEEEE]">{matches.length} trận</span>
          </div>

          {loadingMatches ? (
            <div className="py-12 flex items-center justify-centertext-[#EEEEEE] gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tải matches...
            </div>
          ) : null}

          {!loadingMatches && matches.length === 0 ? (
            <div className="py-12 text-centertext-[#EEEEEE]">
              Chưa có dữ liệu match. Hãy chọn tournament và bracket rồi bấm "Tải
              matches".
            </div>
          ) : null}

          {!loadingMatches && matches.length > 0 ? (
            <div className="space-y-3">
              {matches.map((match) => {
                const teamAId = toNumber(match.team_a_id);
                const teamBId = toNumber(match.team_b_id);

                return (
                  <div
                    key={match.id}
                    className="rounded-lg border border-border p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-smtext-[#EEEEEE]">
                        Match #{match.id} - Round {match.round_number || "?"} -
                        No. {match.match_no || "?"}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {match.status || "scheduled"}
                        </div>
                        <div className="text-xstext-[#EEEEEE] mt-0.5">
                          {formatDateTime(match.date_scheduled)}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-xstext-[#EEEEEE] mb-1">Team A</p>
                        <p className="font-medium">
                          {match.team_a?.name || `Team #${teamAId ?? "?"}`}
                        </p>
                      </div>
                      <div>
                        <p className="text-xstext-[#EEEEEE] mb-1">Team B</p>
                        <p className="font-medium">
                          {match.team_b?.name || `Team #${teamBId ?? "?"}`}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-[120px_120px_1fr_auto]">
                      <Input
                        value={match.draftScoreA}
                        onChange={(event) =>
                          updateDraftMatch(
                            match.id,
                            "draftScoreA",
                            event.target.value,
                          )
                        }
                        placeholder="score_a"
                        inputMode="numeric"
                      />
                      <Input
                        value={match.draftScoreB}
                        onChange={(event) =>
                          updateDraftMatch(
                            match.id,
                            "draftScoreB",
                            event.target.value,
                          )
                        }
                        placeholder="score_b"
                        inputMode="numeric"
                      />
                      <select
                        value={match.draftWinnerTeamId}
                        onChange={(event) =>
                          updateDraftMatch(
                            match.id,
                            "draftWinnerTeamId",
                            event.target.value,
                          )
                        }
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="auto">Tự xác định theo score</option>
                        <option value="none">Không có winner</option>
                        {teamAId ? (
                          <option value={String(teamAId)}>
                            Winner: {match.team_a?.name || `Team #${teamAId}`}
                          </option>
                        ) : null}
                        {teamBId ? (
                          <option value={String(teamBId)}>
                            Winner: {match.team_b?.name || `Team #${teamBId}`}
                          </option>
                        ) : null}
                      </select>

                      <Button
                        type="button"
                        onClick={() => void handleSaveMatch(match)}
                        disabled={Boolean(match.saving)}
                        className="gap-2"
                      >
                        {match.saving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Đang lưu
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            Lưu điểm
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                      <Input
                        type="datetime-local"
                        value={match.draftDateScheduled}
                        onChange={(event) =>
                          updateDraftMatch(
                            match.id,
                            "draftDateScheduled",
                            event.target.value,
                          )
                        }
                        placeholder="date_scheduled"
                      />

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleSaveMatchSchedule(match)}
                        disabled={Boolean(match.scheduleSaving)}
                        className="gap-2"
                      >
                        {match.scheduleSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Đang lưu lịch
                          </>
                        ) : (
                          <>
                            <Calendar className="h-4 w-4" />
                            Lưu lịch đấu
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">Ban/Pick Setup</p>
                          <p className="text-xstext-[#EEEEEE]">
                            Tạo hoặc mở trang Ban/Pick riêng cho match này.
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-2 md:grid-cols-[140px_auto_auto]">
                        <select
                          value={getBanPickFormatForMatch(match)}
                          onChange={(event) =>
                            setBanPickFormatForMatch(
                              match.id,
                              event.target.value as BanPickFormat,
                            )
                          }
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          {banPickFormatOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>

                        <Button
                          type="button"
                          className="gap-2"
                          onClick={() => void handleSetupBanPick(match)}
                          disabled={Boolean(settingUpBanPickByMatch[match.id])}
                        >
                          {settingUpBanPickByMatch[match.id] ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Đang setup...
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="h-4 w-4" />
                              Setup Ban/Pick
                            </>
                          )}
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          className="gap-2"
                          onClick={() => handleOpenBanPick(match)}
                        >
                          <Link2 className="h-4 w-4" />
                          Mở trang Ban/Pick
                        </Button>
                      </div>

                      <p className="text-xstext-[#EEEEEE] break-all">
                        Link:{" "}
                        {getBanPickLinkForMatch(
                          match,
                          getBanPickFormatForMatch(match),
                        )}
                      </p>
                    </div>

                    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">Info Game IDs</p>
                          <p className="text-xstext-[#EEEEEE]">
                            All Maps = tổng/trung bình. Từng row bên dưới là ID
                            của từng trận game (LOL/TFT/Valorant).
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="gap-2"
                          disabled={Boolean(loadingGameIdsByMatch[match.id])}
                          onClick={() => void loadGameIdsForMatch(match.id)}
                        >
                          {loadingGameIdsByMatch[match.id] ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Đang tải IDs
                            </>
                          ) : (
                            <>
                              <Link2 className="h-4 w-4" />
                              Tải IDs
                            </>
                          )}
                        </Button>
                      </div>

                      {(gameIdsByMatch[match.id] ?? []).length > 0 ? (
                        <div className="space-y-2">
                          {(gameIdsByMatch[match.id] ?? []).map((item) => {
                            const draft =
                              editGameIdDraftByRow[item.id] ??
                              createEditGameIdDraft(item);

                            return (
                              <div
                                key={item.id}
                                className="rounded-md border border-border bg-card p-2.5 space-y-2"
                              >
                                <div className="grid gap-2 md:grid-cols-[140px_1fr_220px_120px_auto_auto]">
                                  <select
                                    value={draft.gameNo}
                                    onChange={(event) =>
                                      updateEditGameIdDraft(
                                        item.id,
                                        "gameNo",
                                        event.target.value,
                                      )
                                    }
                                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                  >
                                    <option value="">Auto game_no</option>
                                    {gameNoOptions.map((gameNo) => (
                                      <option
                                        key={gameNo}
                                        value={String(gameNo)}
                                      >
                                        Game {gameNo}
                                      </option>
                                    ))}
                                  </select>
                                  <Input
                                    value={draft.infoGameId}
                                    onChange={(event) =>
                                      updateEditGameIdDraft(
                                        item.id,
                                        "infoGameId",
                                        event.target.value,
                                      )
                                    }
                                    placeholder={getInfoGameIdPlaceholder(
                                      draft.provider,
                                    )}
                                  />
                                  <select
                                    value={draft.provider}
                                    onChange={(event) =>
                                      updateEditGameIdDraft(
                                        item.id,
                                        "provider",
                                        event.target.value,
                                      )
                                    }
                                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                  >
                                    {providerOptions.map((option) => (
                                      <option
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="h-10 flex items-center rounded-md border border-border px-3 text-xstext-[#EEEEEE] bg-background">
                                    #{item.id}
                                  </div>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    className="gap-1"
                                    disabled={Boolean(draft.saving)}
                                    onClick={() =>
                                      void handleUpdateGameId(match.id, item.id)
                                    }
                                  >
                                    {draft.saving ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Save className="h-4 w-4" />
                                    )}
                                    Lưu
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    className="gap-1"
                                    disabled={Boolean(draft.saving)}
                                    onClick={() =>
                                      void handleDeleteGameId(match.id, item.id)
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Xóa
                                  </Button>
                                </div>

                                <p className="text-xstext-[#EEEEEE] break-all">
                                  Route:{" "}
                                  {item.route_preview ||
                                    item.route_template ||
                                    "Không xác định được route game"}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-md border border-dashed border-border px-3 py-2 text-xstext-[#EEEEEE]">
                          Chưa có info_game_id. Bấm "Tải IDs" hoặc thêm mới ở
                          form bên dưới.
                        </div>
                      )}

                      <div className="rounded-md border border-border bg-card p-2.5 space-y-2">
                        <div className="grid gap-2 md:grid-cols-[140px_1fr_220px_auto_auto]">
                          <select
                            value={
                              (
                                newGameIdDraftByMatch[match.id] ??
                                createEmptyNewGameIdDraft()
                              ).gameNo
                            }
                            onChange={(event) =>
                              updateNewGameIdDraft(
                                match.id,
                                "gameNo",
                                event.target.value,
                              )
                            }
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="">Auto game_no</option>
                            {gameNoOptions.map((gameNo) => (
                              <option key={gameNo} value={String(gameNo)}>
                                Game {gameNo}
                              </option>
                            ))}
                          </select>
                          <Input
                            value={
                              (
                                newGameIdDraftByMatch[match.id] ??
                                createEmptyNewGameIdDraft()
                              ).infoGameId
                            }
                            onChange={(event) =>
                              updateNewGameIdDraft(
                                match.id,
                                "infoGameId",
                                event.target.value,
                              )
                            }
                            placeholder={getInfoGameIdPlaceholder(
                              (
                                newGameIdDraftByMatch[match.id] ??
                                createEmptyNewGameIdDraft()
                              ).provider,
                            )}
                          />
                          <select
                            value={
                              (
                                newGameIdDraftByMatch[match.id] ??
                                createEmptyNewGameIdDraft()
                              ).provider
                            }
                            onChange={(event) =>
                              updateNewGameIdDraft(
                                match.id,
                                "provider",
                                event.target.value,
                              )
                            }
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                          >
                            {providerOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            variant="outline"
                            className="gap-2"
                            onClick={() => void handlePasteInfoGameId(match.id)}
                          >
                            <Clipboard className="h-4 w-4" />
                            Dán
                          </Button>
                          <Button
                            type="button"
                            className="gap-2"
                            onClick={() => void handleCreateGameId(match.id)}
                            disabled={Boolean(
                              (
                                newGameIdDraftByMatch[match.id] ??
                                createEmptyNewGameIdDraft()
                              ).saving,
                            )}
                          >
                            {(
                              newGameIdDraftByMatch[match.id] ??
                              createEmptyNewGameIdDraft()
                            ).saving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Plus className="h-4 w-4" />
                            )}
                            Thêm ID
                          </Button>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Mẹo: chỉ cần dán link match, hệ thống sẽ tự bóc
                          info_game_id.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default ScoreControlPage;
