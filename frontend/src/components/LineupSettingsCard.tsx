import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/api/groups";
import { getLineupSettings, saveLineupSettings } from "@/api/matchLineups";

/**
 * BTC (trang thiết lập giải): chốt đội hình ra sân —
 *   mở chốt trước giờ đấu bao nhiêu phút (trống = mở ngay khi có trận), hết hạn không chốt thì xử thua.
 * Hạn chốt: Valorant = giờ trận − 10 phút (đúng giờ trận tự mở ban/pick); game khác = giờ trận.
 */

const PRESETS: Array<{ label: string; minutes: number | null }> = [
  { label: "Mở ngay", minutes: null },
  { label: "30 phút", minutes: 30 },
  { label: "1 giờ", minutes: 60 },
  { label: "3 giờ", minutes: 180 },
  { label: "1 ngày", minutes: 1440 },
];

const LineupSettingsCard = ({ tournamentId, token }: { tournamentId: string; token: string | null }) => {
  const queryClient = useQueryClient();
  const [minutes, setMinutes] = useState("");
  const [forfeit, setForfeit] = useState(false);
  const [saving, setSaving] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["lineup-settings", tournamentId],
    enabled: Boolean(tournamentId && token),
    queryFn: async () => (await getLineupSettings(tournamentId, token!)).data.data,
  });
  const settings = settingsQuery.data;

  useEffect(() => {
    if (!settings) return;
    setMinutes(settings.lineup_open_minutes === null ? "" : String(settings.lineup_open_minutes));
    setForfeit(settings.lineup_forfeit);
  }, [settings]);

  if (!token || !tournamentId) return null;

  const save = async () => {
    const value = minutes.trim() === "" ? null : Number(minutes);
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      toast({ title: "Số phút phải là số nguyên ≥ 0, hoặc để trống", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveLineupSettings(tournamentId, { lineup_open_minutes: value, lineup_forfeit: forfeit }, token);
      toast({ title: "Đã lưu cài đặt chốt đội hình" });
      await queryClient.invalidateQueries({ queryKey: ["lineup-settings", tournamentId] });
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div>
        <p className="text-sm font-medium">Chốt đội hình ra sân</p>
        <p className="text-xs text-muted-foreground">
          Đội trưởng chọn người ra sân từng trận. Hạn chốt: Valorant 10 phút trước giờ trận (giờ trận = giờ ban/pick, phòng tự mở); game khác đúng giờ trận.
        </p>
      </div>
      {settingsQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">Đang tải…</p>
      ) : settings && !settings.ready ? (
        <p className="text-xs text-[#FF4A3D]">DB chưa có cột cài đặt — chạy backend/docs/match_lineup_settings.sql.</p>
      ) : (
        <>
          <div className="space-y-1">
            <label className="text-xs" htmlFor="lineup-open-minutes">
              Mở chốt trước giờ đấu (phút) — để trống = mở ngay khi có trận
            </label>
            <Input
              id="lineup-open-minutes"
              inputMode="numeric"
              placeholder="vd. 60"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value.replace(/[^\d]/g, ""))}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRESETS.map((preset) => {
                const on = (preset.minutes === null ? "" : String(preset.minutes)) === minutes;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setMinutes(preset.minutes === null ? "" : String(preset.minutes))}
                    className={`min-h-11 border px-3 text-xs font-bold ${
                      on ? "border-[#F2F0EB] bg-[#F2F0EB] text-[#0B0B0B]" : "border-[#2C2B29] text-[#9A9893]"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-[#F2F0EB]"
              checked={forfeit}
              onChange={(event) => setForfeit(event.target.checked)}
            />
            Hết hạn không chốt → xử thua (BO1 1-0, BO3 2-0, BO5 3-0)
          </label>
          <Button type="button" variant="outline" className="gap-2" disabled={saving || !settings} onClick={() => void save()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu cài đặt chốt đội hình
          </Button>
        </>
      )}
    </div>
  );
};

export default LineupSettingsCard;
