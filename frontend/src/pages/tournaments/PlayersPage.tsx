import { useMemo, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { TOURNAMENT_LOGO } from "@/data/tournament";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TOURNAMENT_PAGE_BG_CLASS,
  TOURNAMENT_PAGE_TITLE_CLASS,
  TOURNAMENT_PANEL_CLASS,
  TOURNAMENT_TABLE_HEADER_CLASS,
  TOURNAMENT_TABLE_HEADER_ROW_CLASS,
  TOURNAMENT_TABLE_MIN_CLASS,
  TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS,
  TOURNAMENT_TABLE_TAG_CLASS,
  TOURNAMENT_TEAM_TAG_BADGE_CLASS,
  isRiotGameSlug,
} from "@/components/tournamentTheme";
import TeamRosterDialog from "@/components/TeamRosterDialog";

type RegisteredTeam = {
  id?: number | string;
  team_id?: number | string;
  name?: string;
  short_name?: string;
  logo_url?: string;
  team_color_hex?: string;
  isCheckedIn?: boolean;
};

type PlayersOutletContext = {
  tournament?: {
    id?: number | string;
    short_name?: string;
    register_start?: string;
    register_end?: string;
    check_in_start?: string;
    check_in_end?: string;
    registered?: RegisteredTeam[];
    registered_count?: number;
    max_participate?: number;
  };
  isLoading?: boolean;
  refetch?: () => Promise<unknown>;
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const PlayersPage = () => {
  const { tournament, isLoading } = useOutletContext<PlayersOutletContext>();
  const { game } = useParams();
  const { user } = useAuth();
  const [selectedTournamentTeamId, setSelectedTournamentTeamId] = useState<
    number | null
  >(null);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);

  const apiPlayersRaw = tournament?.registered ?? [];
  const showRiotId = isRiotGameSlug(game ?? tournament?.short_name);

  const checkedInCount = useMemo(
    () => apiPlayersRaw.filter((team) => team.isCheckedIn).length,
    [apiPlayersRaw],
  );

  const selectedTeam = useMemo(() => {
    if (selectedTournamentTeamId === null) return null;
    return (
      apiPlayersRaw.find(
        (team) => toNumber(team.id) === selectedTournamentTeamId,
      ) ?? null
    );
  }, [apiPlayersRaw, selectedTournamentTeamId]);

  const openTeamModal = (tournamentTeamId: number | null) => {
    if (tournamentTeamId === null) return;
    setSelectedTournamentTeamId(tournamentTeamId);
    setIsTeamModalOpen(true);
  };

  const registeredCount =
    tournament?.registered_count ?? apiPlayersRaw.length ?? 0;
  const maxParticipate = tournament?.max_participate ?? null;

  return (
    <div className={`space-y-5 ${TOURNAMENT_PAGE_BG_CLASS}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className={TOURNAMENT_PAGE_TITLE_CLASS}>Danh sách</h2>
          <p className="mt-1 text-xs font-bold uppercase tracking-wider text-neutral-500">
            {registeredCount}
            {maxParticipate ? ` / ${maxParticipate}` : ""} đội đăng ký
            {apiPlayersRaw.length > 0
              ? ` · ${checkedInCount} đã check-in`
              : ""}
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400">Đang tải danh sách đội...</p>
      ) : null}

      {!isLoading && apiPlayersRaw.length === 0 ? (
        <div
          className={`${TOURNAMENT_PANEL_CLASS} px-4 py-10 text-center text-sm text-neutral-400`}
        >
          Chưa có đội nào đăng ký giải này.
        </div>
      ) : null}

      {!isLoading && apiPlayersRaw.length > 0 ? (
        <div className={`${TOURNAMENT_PANEL_CLASS} w-full overflow-x-auto`}>
          <Table className={TOURNAMENT_TABLE_MIN_CLASS}>
            <TableHeader>
              <TableRow className={TOURNAMENT_TABLE_HEADER_ROW_CLASS}>
                <TableHead
                  className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-16 text-center whitespace-nowrap`}
                >
                  #
                </TableHead>
                <TableHead
                  className={`${TOURNAMENT_TABLE_HEADER_CLASS} min-w-[260px] whitespace-nowrap`}
                >
                  Đội
                </TableHead>
                <TableHead
                  className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-32 whitespace-nowrap`}
                >
                  Tag
                </TableHead>
                <TableHead
                  className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-36 text-center whitespace-nowrap`}
                >
                  Check-in
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiPlayersRaw.map((participant, index) => {
                const tournamentTeamId = toNumber(participant.id);
                const isMine =
                  toNumber(participant.team_id) === Number(user?.team_id);
                const isCheckedIn = Boolean(participant.isCheckedIn);

                return (
                  <TableRow
                    key={`${participant.id ?? participant.team_id}-${participant.name ?? "team"}`}
                    className={`${TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS} cursor-pointer ${
                      tournamentTeamId === selectedTournamentTeamId
                        ? "bg-[#1c1c1c]"
                        : ""
                    } ${isMine ? "border-l-[3px] border-l-neutral-400" : ""}`}
                    onClick={() => openTeamModal(tournamentTeamId)}
                  >
                    <TableCell className="text-center text-sm font-bold text-neutral-400">
                      {String(index + 1).padStart(2, "0")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <img
                          src={participant.logo_url || TOURNAMENT_LOGO}
                          alt={participant.name || "Team logo"}
                          className="h-10 w-10 shrink-0 object-contain"
                        />
                        <span className="font-bold text-white">
                          {participant.name || "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {participant.short_name ? (
                        <span className={TOURNAMENT_TEAM_TAG_BADGE_CLASS}>
                          {participant.short_name}
                        </span>
                      ) : (
                        <span className={TOURNAMENT_TABLE_TAG_CLASS}>—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-block border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider whitespace-nowrap ${
                          isCheckedIn
                            ? "border-emerald-500/70 bg-emerald-950/40 text-emerald-200"
                            : "border-rose-500/60 bg-rose-950/30 text-rose-200"
                        }`}
                      >
                        {isCheckedIn ? "Đã check-in" : "Chưa check-in"}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <TeamRosterDialog
        open={isTeamModalOpen}
        onOpenChange={setIsTeamModalOpen}
        teamId={selectedTournamentTeamId}
        teamName={selectedTeam?.name || null}
        teamShortName={selectedTeam?.short_name || null}
        teamLogoUrl={selectedTeam?.logo_url || null}
        showRiotId={showRiotId}
      />
    </div>
  );
};

export default PlayersPage;
