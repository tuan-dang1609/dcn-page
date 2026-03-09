import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, WandSparkles } from "lucide-react";
import {
  generateBracket,
  pairSwissNextRound,
  type BracketType,
} from "@/api/tournaments";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const allowedRoleIds = new Set([1, 2, 3]);

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const parseTeamIds = (csv: string) => {
  if (!csv.trim()) return undefined;

  return csv
    .split(",")
    .map((part) => Number(part.trim()))
    .filter(Number.isFinite);
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
    team_ids_csv: "",
    swiss_round: "",
  });

  const [generatedBracketId, setGeneratedBracketId] = useState<number | null>(null);
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
      const parsedTeamIds = parseTeamIds(form.team_ids_csv);

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
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground gap-2">
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
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay về Tournament Setup
        </button>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Bracket Setup</h1>
              <p className="text-sm text-muted-foreground">
                Tạo bracket riêng theo loại cho tournament.
              </p>
            </div>
            {generatedBracketId ? (
              <Badge variant="outline">Bracket ID: {generatedBracketId}</Badge>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Input
              value={tournamentIdInput}
              onChange={(event) => setTournamentIdInput(event.target.value)}
              placeholder="tournament_id"
              inputMode="numeric"
            />
            <select
              value={form.type}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, type: event.target.value as BracketType }))
              }
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="single-elimination">single-elimination</option>
              <option value="double-elimination">double-elimination</option>
              <option value="swiss">swiss</option>
              <option value="round-robin">round-robin</option>
            </select>
            <Input
              value={form.format_id}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, format_id: event.target.value }))
              }
              placeholder="format_id"
              inputMode="numeric"
            />
            <Input
              value={form.best_of}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, best_of: event.target.value }))
              }
              placeholder="best_of"
              inputMode="numeric"
            />
            <Input
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="name"
            />
            <Input
              value={form.stage}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, stage: event.target.value }))
              }
              placeholder="stage"
            />
          </div>

          <Input
            value={form.status}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, status: event.target.value }))
            }
            placeholder="status"
          />

          <Input
            value={form.team_ids_csv}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, team_ids_csv: event.target.value }))
            }
            placeholder="team_ids CSV (vd: 11,22,33,44) - để trống = lấy tournament_teams"
          />

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleGenerateBracket} disabled={submitting}>
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
                    setForm((prev) => ({ ...prev, swiss_round: event.target.value }))
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
