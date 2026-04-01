import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  deleteBracket,
  generateBracket,
  getBracketsByTournamentId,
  pairSwissNextRound,
  getTournamentTeams,
  type Bracket,
  type BracketType,
  type TournamentTeamRecord,
} from "@/api/tournaments";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

const allowedRoleIds = new Set([1, 2, 3]);

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const getTeamLabel = (team: TournamentTeamRecord) =>
  team.short_name?.trim() || team.name?.trim() || `Team #${team.team_id}`;

const orderTeamIdsByTournament = (
  ids: number[],
  teams: TournamentTeamRecord[],
) => {
  const idSet = new Set(ids);
  return teams
    .filter((team) => idSet.has(team.team_id))
    .map((team) => team.team_id);
};

const BracketSetupPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, token, isLoading } = useAuth();

  const [tournamentIdInput, setTournamentIdInput] = useState(
    searchParams.get("tournamentId") ?? "",
  );

  const [form, setForm] = useState({
    type: "single-elimination" as BracketType,
    format_id: "",
    best_of: "1",
    name: "",
    stage: "",
    status: "scheduled",
    swiss_round: "",
  });

  const [tournamentTeams, setTournamentTeams] = useState<
    TournamentTeamRecord[]
  >([]);
  const [existingBrackets, setExistingBrackets] = useState<Bracket[]>([]);
  const [loadingBrackets, setLoadingBrackets] = useState(false);
  const [deletingBracketId, setDeletingBracketId] = useState<number | null>(
    null,
  );
  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>([]);
  const [draftTeamIds, setDraftTeamIds] = useState<number[]>([]);
  const [quickPickCountInput, setQuickPickCountInput] = useState("8");
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);

  const [generatedBracketId, setGeneratedBracketId] = useState<number | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  const roleId = Number(user?.role_id);
  const hasAccess = allowedRoleIds.has(roleId);

  useEffect(() => {
    if (isLoading) return;

    if (!user || !token) {
      navigate(`/login?returnTo=${encodeURIComponent("/ops/bracket-setup")}`, {
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

  useEffect(() => {
    const tournamentId = toNumber(tournamentIdInput);

    if (!tournamentId) {
      setTournamentTeams([]);
      setExistingBrackets([]);
      setLoadingBrackets(false);
      setSelectedTeamIds([]);
      setDraftTeamIds([]);
      setTeamPickerOpen(false);
      return;
    }

    let cancelled = false;
    setLoadingBrackets(true);

    (async () => {
      try {
        const [teamsResponse, bracketsResponse] = await Promise.all([
          getTournamentTeams(tournamentId),
          getBracketsByTournamentId(tournamentId),
        ]);
        if (cancelled) return;

        const teams =
          teamsResponse.data?.teams ?? teamsResponse.data?.data?.teams ?? [];
        const brackets = bracketsResponse.data?.data ?? [];

        setTournamentTeams(teams);
        setExistingBrackets(brackets);

        const validIds = new Set(teams.map((team) => team.team_id));
        setSelectedTeamIds((prev) => prev.filter((id) => validIds.has(id)));
        setDraftTeamIds((prev) => prev.filter((id) => validIds.has(id)));
      } catch (err) {
        if (cancelled) return;
        setTournamentTeams([]);
        setExistingBrackets([]);
        setSelectedTeamIds([]);
        setDraftTeamIds([]);
      } finally {
        if (!cancelled) {
          setLoadingBrackets(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tournamentIdInput]);

  const selectedTeams = tournamentTeams.filter((team) =>
    selectedTeamIds.includes(team.team_id),
  );

  const toggleDraftTeam = (teamId: number) => {
    setDraftTeamIds((prev) => {
      if (prev.includes(teamId)) return prev.filter((id) => id !== teamId);
      return [...prev, teamId];
    });
  };

  const applyDraftSelection = () => {
    setSelectedTeamIds(orderTeamIdsByTournament(draftTeamIds, tournamentTeams));
    setTeamPickerOpen(false);
  };

  const handleQuickPickCount = () => {
    const count = toNumber(quickPickCountInput);
    if (count === null || count <= 0) {
      toast({
        title: "Số lượng không hợp lệ",
        description: "Nhập số đội lớn hơn 0 để chọn nhanh.",
        variant: "destructive",
      });
      return;
    }

    const nextIds = tournamentTeams.slice(0, count).map((team) => team.team_id);
    setDraftTeamIds(nextIds);
  };

  const removeSelectedTeam = (teamId: number) => {
    setSelectedTeamIds((prev) => prev.filter((id) => id !== teamId));
    setDraftTeamIds((prev) => prev.filter((id) => id !== teamId));
  };

  const reloadBrackets = async (tournamentId: number) => {
    const response = await getBracketsByTournamentId(tournamentId);
    const brackets = response.data?.data ?? [];
    setExistingBrackets(brackets);
    return brackets;
  };

  const handleGenerateBracket = async () => {
    const tournamentId = toNumber(tournamentIdInput);
    const formatId = toNumber(form.format_id);

    if (!tournamentId || !formatId) {
      toast({
        title: "Thiếu dữ liệu bắt buộc",
        description: "Cần tournament_id và format_id hợp lệ.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const parsedTeamIds = selectedTeamIds.length
        ? selectedTeamIds
        : undefined;

      const response = await generateBracket(tournamentId, form.type, {
        format_id: formatId,
        ...(toNumber(form.best_of) ? { best_of: Number(form.best_of) } : {}),
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
        ...(form.stage.trim() ? { stage: form.stage.trim() } : {}),
        ...(form.status.trim() ? { status: form.status.trim() } : {}),
        ...(parsedTeamIds?.length ? { team_ids: parsedTeamIds } : {}),
      });

      const bracketId = toNumber(response.data?.data?.bracket_id);
      setGeneratedBracketId(bracketId);

      await reloadBrackets(tournamentId);

      toast({
        title: "Tạo bracket thành công",
        description: `Bracket #${bracketId ?? "?"} đã được tạo cho tournament #${tournamentId}.`,
      });
    } catch (error: any) {
      toast({
        title: "Tạo bracket thất bại",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBracket = async (bracketId: number) => {
    const tournamentId = toNumber(tournamentIdInput);

    if (!tournamentId) {
      toast({
        title: "Thiếu tournament_id",
        description: "Vui lòng nhập tournament_id hợp lệ trước khi xóa.",
        variant: "destructive",
      });
      return;
    }

    const targetBracket = existingBrackets.find(
      (bracket) => Number(bracket.id) === bracketId,
    );

    const confirmed = window.confirm(
      `Xóa bracket #${bracketId}${targetBracket?.name ? ` (${targetBracket.name})` : ""}?\nDữ liệu matches và pick'em liên quan cũng sẽ bị xóa.`,
    );

    if (!confirmed) return;

    setDeletingBracketId(bracketId);

    try {
      const response = await deleteBracket(bracketId);
      await reloadBrackets(tournamentId);

      if (generatedBracketId === bracketId) {
        setGeneratedBracketId(null);
      }

      const deletedMatches =
        toNumber(response.data?.data?.deleted_matches) ?? 0;

      toast({
        title: "Xóa bracket thành công",
        description: `Bracket #${bracketId} đã được xóa (${deletedMatches} matches).`,
      });
    } catch (error: any) {
      toast({
        title: "Xóa bracket thất bại",
        description:
          error?.response?.data?.error || error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setDeletingBracketId(null);
    }
  };

  const handlePairSwiss = async () => {
    const tournamentId = toNumber(tournamentIdInput);

    if (!tournamentId || !generatedBracketId) {
      toast({
        title: "Thiếu dữ liệu Swiss",
        description: "Cần tournament_id và bracket_id hợp lệ.",
        variant: "destructive",
      });
      return;
    }

    const roundNumber = toNumber(form.swiss_round);

    setSubmitting(true);

    try {
      await pairSwissNextRound(tournamentId, generatedBracketId, {
        ...(roundNumber !== null ? { round_number: roundNumber } : {}),
      });

      toast({
        title: "Pair Swiss thành công",
        description: `Đã pair next round cho bracket #${generatedBracketId}.`,
      });
    } catch (error: any) {
      toast({
        title: "Pair Swiss thất bại",
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
      <div className="min-h-screen bg-background flex items-center justify-centertext-[#EEEEEE] gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Đang kiểm tra quyền truy cập...</span>
      </div>
    );
  }

  if (!hasAccess) return null;

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <button
          onClick={() => navigate("/ops/tournament-setup")}
          className="flex items-center gap-2text-[#EEEEEE] hover:text-foreground text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay về Tournament Setup
        </button>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Bracket Setup</h1>
              <p className="text-smtext-[#EEEEEE]">
                Tạo bracket riêng theo loại cho tournament.
              </p>
            </div>
            {generatedBracketId ? (
              <Badge variant="outline">Bracket ID: {generatedBracketId}</Badge>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Tournament ID</Label>
              <Input
                value={tournamentIdInput}
                onChange={(event) => setTournamentIdInput(event.target.value)}
                placeholder="tournament_id"
                inputMode="numeric"
              />
            </div>

            <div>
              <Label>Bracket Type</Label>
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    type: event.target.value as BracketType,
                  }))
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              >
                <option value="single-elimination">single-elimination</option>
                <option value="double-elimination">double-elimination</option>
                <option value="swiss">swiss</option>
                <option value="round-robin">round-robin</option>
              </select>
            </div>

            <div>
              <Label>Format ID</Label>
              <Input
                value={form.format_id}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    format_id: event.target.value,
                  }))
                }
                placeholder="format_id"
                inputMode="numeric"
              />
            </div>

            <div>
              <Label>Best Of</Label>
              <Input
                value={form.best_of}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, best_of: event.target.value }))
                }
                placeholder="best_of"
                inputMode="numeric"
              />
            </div>

            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="name"
              />
            </div>

            <div>
              <Label>Stage</Label>
              <Input
                value={form.stage}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, stage: event.target.value }))
                }
                placeholder="stage"
              />
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <Input
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, status: event.target.value }))
              }
              placeholder="status"
            />
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Bracket hiện có</p>
              {loadingBrackets ? (
                <span className="text-xs text-muted-foreground">
                  Đang tải...
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {existingBrackets.length} bracket
                </span>
              )}
            </div>

            {!toNumber(tournamentIdInput) ? (
              <p className="text-xs text-muted-foreground">
                Nhập Tournament ID để xem và xóa bracket.
              </p>
            ) : null}

            {toNumber(tournamentIdInput) &&
            !loadingBrackets &&
            !existingBrackets.length ? (
              <p className="text-xs text-muted-foreground">
                Tournament này chưa có bracket.
              </p>
            ) : null}

            {existingBrackets.length > 0 ? (
              <div className="space-y-2">
                {existingBrackets.map((bracket) => {
                  const bracketId = toNumber(bracket.id);
                  if (!bracketId) return null;

                  const isDeleting = deletingBracketId === bracketId;

                  return (
                    <div
                      key={bracketId}
                      className="rounded-md border border-border bg-card p-2.5 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">
                            {bracket.name || `Bracket #${bracketId}`}
                          </p>
                          {generatedBracketId === bracketId ? (
                            <Badge variant="outline">Vừa tạo</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          #{bracketId} · stage: {bracket.stage || "main"} ·
                          status: {bracket.status || "scheduled"} · format:{" "}
                          {bracket.format_type ||
                            bracket.format_name ||
                            "unknown"}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="gap-1"
                        disabled={isDeleting || submitting}
                        onClick={() => void handleDeleteBracket(bracketId)}
                      >
                        {isDeleting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Xóa
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Teams</Label>

            <Popover open={teamPickerOpen} onOpenChange={setTeamPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full justify-between font-normal"
                  disabled={tournamentTeams.length === 0}
                >
                  <span className="truncate text-left">
                    {tournamentTeams.length === 0
                      ? tournamentIdInput
                        ? "Không có đội cho tournament này"
                        : "Nhập Tournament ID để tải đội"
                      : selectedTeamIds.length > 0
                        ? `Đã chọn ${selectedTeamIds.length} đội`
                        : "Mở dropdown để chọn đội"}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-70" />
                </Button>
              </PopoverTrigger>

              <PopoverContent
                align="start"
                className="w-115 max-w-[calc(100vw-2rem)] p-3"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={quickPickCountInput}
                      onChange={(event) =>
                        setQuickPickCountInput(event.target.value)
                      }
                      inputMode="numeric"
                      placeholder="Số đội"
                      className="w-32"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleQuickPickCount}
                      disabled={tournamentTeams.length === 0}
                    >
                      Chọn nhanh N đội
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setDraftTeamIds(
                          tournamentTeams.map((team) => team.team_id),
                        )
                      }
                      disabled={tournamentTeams.length === 0}
                    >
                      Chọn tất cả
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setDraftTeamIds([])}
                      disabled={tournamentTeams.length === 0}
                    >
                      Bỏ chọn
                    </Button>
                  </div>

                  <ScrollArea className="h-64 rounded-md border border-border">
                    <div className="space-y-1 p-2">
                      {tournamentTeams.length === 0 ? (
                        <p className="text-sm text-muted-foreground px-2 py-4">
                          Chưa có đội để chọn.
                        </p>
                      ) : (
                        tournamentTeams.map((team) => {
                          const checked = draftTeamIds.includes(team.team_id);

                          return (
                            <label
                              key={team.team_id}
                              className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent"
                            >
                              <span className="flex items-center gap-2">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() =>
                                    toggleDraftTeam(team.team_id)
                                  }
                                />
                                <span className="text-sm">
                                  {getTeamLabel(team)}
                                </span>
                              </span>
                              <span className="text-xs text-muted-foreground">
                                #{team.team_id}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Tạm chọn: {draftTeamIds.length} đội
                    </span>
                    <Button
                      type="button"
                      onClick={applyDraftSelection}
                      disabled={tournamentTeams.length === 0}
                    >
                      Áp dụng đội đã chọn
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div className="text-xs text-muted-foreground">
              Chọn đội trong dropdown, bấm "Áp dụng đội đã chọn" để cập nhật vào
              bracket.
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="text-sm font-medium">
                Đội đã áp dụng ({selectedTeams.length})
              </div>
              {selectedTeams.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Chưa có đội nào được áp dụng. Nếu để trống, backend sẽ tự lấy
                  tournament teams.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedTeams.map((team) => (
                    <Badge
                      key={team.team_id}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      <span>{getTeamLabel(team)}</span>
                      <button
                        type="button"
                        className="rounded-sm p-0.5 hover:bg-background/60"
                        onClick={() => removeSelectedTeam(team.team_id)}
                        aria-label={`Xóa ${getTeamLabel(team)}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleGenerateBracket}
              disabled={submitting}
            >
              {submitting ? "Đang tạo..." : "Tạo bracket"}
            </Button>
          </div>

          {form.type === "swiss" ? (
            <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
              <p className="text-sm font-medium">Swiss action</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={form.swiss_round}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      swiss_round: event.target.value,
                    }))
                  }
                  placeholder="round_number (để trống = auto)"
                  className="w-72"
                  inputMode="numeric"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={handlePairSwiss}
                  disabled={!generatedBracketId || submitting}
                >
                  <WandSparkles className="h-4 w-4" />
                  Pair next round
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default BracketSetupPage;
