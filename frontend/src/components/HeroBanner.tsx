import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LogIn, LogOut, Trophy, User, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import TournamentRegistration from "@/components/TournamentRegistration";

interface HeroBannerProps {
  tournament?: {
    banner_url?: string;
    id?: number | string;
    max_player_per_team?: number | string;
    register_start?: string;
    register_end?: string;
  } | null;
}

const HeroBanner = ({ tournament }: HeroBannerProps) => {
  const { user, logout, isRegistered } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [regOpen, setRegOpen] = useState(false);

  const now = Date.now();
  const registerStartMs = Number(new Date(tournament?.register_start ?? ""));
  const registerEndMs = Number(new Date(tournament?.register_end ?? ""));
  const isRegistrationOpen =
    Number.isFinite(registerStartMs) &&
    Number.isFinite(registerEndMs) &&
    now >= registerStartMs &&
    now <= registerEndMs;

  const handleLoginClick = () => {
    const returnTo = location.pathname + location.search;
    navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  };

  return (
    <>
      <div className="relative w-full h-[350px] md:h-[420px] overflow-hidden bg-muted">
        <div
          className="absolute inset-0 bg-cover bg-center scale-105"
          style={{ backgroundImage: `url(${tournament?.banner_url})` }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

        {/* Bottom: tournament info left + auth area right (stacks on small screens) */}
        <div className="absolute left-0 right-0 bottom-0 p-4 sm:p-6 md:p-10 flex flex-col md:flex-row items-center md:items-end justify-between gap-4">
          {/* Left: tournament info (center on small, left on md+) */}
          <div className="min-w-0 w-full md:w-auto text-center md:text-left">
            <span className="inline-block bg-primary/10 text-primary border border-primary/20 backdrop-blur-sm px-3 py-1 text-xs sm:text-xs md:text-sm font-semibold tracking-widest uppercase rounded-full mb-3">
              KẾT THÚC • MON, 01 SEPT 2025, 20:30 GMT+7
            </span>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight mb-2 max-w-[720px] mx-auto md:mx-0">
              TFT Set 15 – KO Coliseum
            </h1>
            <p className="text-sm sm:text-sm md:text-base text-muted-foreground">
              Tổ chức bởi{" "}
              <span className="font-semibold text-primary">
                Dong Chuyen Nghiep
              </span>
            </p>
          </div>

          {/* Right: auth area (move below on small screens) */}
          <div className="flex items-center gap-3 shrink-0 mt-3 md:mt-0">
            {user ? (
              <>
                <div className="flex items-center gap-2 bg-card/80 backdrop-blur-sm border border-border rounded-lg px-3 py-2">
                  <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                    <img src={user.profile_picture} alt="" />
                  </div>
                  <span className="text-sm font-semibold">{user.nickname}</span>
                </div>
                {isRegistrationOpen ? (
                  <Button
                    size="sm"
                    onClick={() => setRegOpen(true)}
                    className="gap-1.5"
                    variant={isRegistered ? "outline" : "default"}
                  >
                    {isRegistered ? (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        <span className="hidden sm:inline">Cập nhật</span>
                      </>
                    ) : (
                      <>
                        <Trophy className="w-4 h-4" />
                        <span className="hidden sm:inline">Đăng ký giải</span>
                      </>
                    )}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={logout}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={handleLoginClick} className="gap-1.5">
                <LogIn className="w-4 h-4" />
                Đăng nhập
              </Button>
            )}
          </div>
        </div>
      </div>

      <TournamentRegistration
        open={regOpen}
        onOpenChange={setRegOpen}
        tournamentId={tournament?.id}
        requiredPlayerCount={tournament?.max_player_per_team}
      />
    </>
  );
};

export default HeroBanner;
