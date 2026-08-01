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
  DEFAULT_USER_AVATAR_URL,
  TOURNAMENT_PAGE_BG_CLASS,
  TOURNAMENT_PAGE_TITLE_CLASS,
  TOURNAMENT_PANEL_CLASS,
  TOURNAMENT_SECTION_META_CLASS,
  TOURNAMENT_TABLE_CELL_CLASS,
  TOURNAMENT_TABLE_HEADER_CLASS,
  TOURNAMENT_TABLE_HEADER_ROW_CLASS,
  TOURNAMENT_TABLE_MIN_CLASS,
  TOURNAMENT_TABLE_ROW_CLASS,
  TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS,
  TOURNAMENT_TABLE_TAG_CLASS,
  TOURNAMENT_TEAM_TAG_BADGE_CLASS,
  isRiotGameSlug,
} from "@/components/tournamentTheme";
import TeamRosterDialog from "@/components/TeamRosterDialog";
import PageLoader from "@/components/PageLoader";

type RegisteredTeam = {
  id?: number | string;
  team_id?: number | string;
  name?: string;
  short_name?: string;
  logo_url?: string;
  team_color_hex?: string;
  nickname?: string | null;
  profile_picture?: string | null;
  isCheckedIn?: boolean;
  primary_riot_account?: string | null;
  primary_profile_picture?: string | null;
};

type PlayersOutletContext = {
  tournament?: {
    id?: number | string;
    short_name?: string;
    registration_mode?: "org" | "individual" | string;
    registered?: RegisteredTeam[];
    registered_count?: number;
    max_participate?: number;
  };
  isLoading?: boolean;
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const CheckInBadge = ({ checkedIn }: { checkedIn: boolean }) => (
  <span
    className={`inline-block border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap sm:px-2.5 sm:text-[11px] ${
      checkedIn
        ? "border-emerald-500/70 bg-emerald-950/40 text-emerald-200"
        : "border-rose-500/60 bg-rose-950/30 text-rose-200"
    }`}
  >
    {checkedIn ? "Đã check-in" : "Chưa"}
  </span>
);

/** TFT solo / individual — UI riêng, không dùng chung layout đội. */
const IndividualPlayersTable = ({
  rows,
  userId,
  userRiotAccount,
}: {
  rows: RegisteredTeam[];
  userId: number | null;
  userRiotAccount: string;
}) => (
  <div className={`${TOURNAMENT_PANEL_CLASS} w-full overflow-x-auto`}>
    <Table className="w-full min-w-0">
      <TableHeader>
        <TableRow className={TOURNAMENT_TABLE_HEADER_ROW_CLASS}>
          <TableHead
            className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-10 text-center whitespace-nowrap sm:w-12`}
          >
            #
          </TableHead>
          <TableHead
            className={`${TOURNAMENT_TABLE_HEADER_CLASS} min-w-0 whitespace-nowrap`}
          >
            Thành viên
          </TableHead>
          <TableHead
            className={`${TOURNAMENT_TABLE_HEADER_CLASS} min-w-[9rem] whitespace-nowrap`}
          >
            Riot ID
          </TableHead>
          <TableHead
            className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-24 text-center whitespace-nowrap sm:w-28`}
          >
            Check-in
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((participant, index) => {
          const myUserId = userId;
          const riotId = String(participant.primary_riot_account ?? "").trim();
          const isMine =
            myUserId !== null &&
            (String(participant.short_name ?? "").trim() === `S${myUserId}` ||
              (Boolean(userRiotAccount) &&
                riotId.toLowerCase() === userRiotAccount.toLowerCase()));
          const displayName =
            participant.nickname || participant.name || "—";
          const avatarSrc =
            participant.primary_profile_picture ||
            participant.profile_picture ||
            participant.logo_url ||
            DEFAULT_USER_AVATAR_URL;

          return (
            <TableRow
              key={`${participant.id ?? participant.team_id}-${displayName}`}
              className={`${TOURNAMENT_TABLE_ROW_CLASS}${
                isMine ? " border-l-[3px] border-l-neutral-400" : ""
              }`}
            >
              <TableCell
                className={`${TOURNAMENT_TABLE_CELL_CLASS} text-center font-semibold text-neutral-400 tabular-nums`}
              >
                {String(index + 1).padStart(2, "0")}
              </TableCell>
              <TableCell className={TOURNAMENT_TABLE_CELL_CLASS}>
                <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                  <img
                    src={avatarSrc}
                    alt={displayName}
                    className="h-9 w-9 shrink-0 rounded-sm object-cover sm:h-10 sm:w-10"
                  />
                  <span className="block min-w-0 truncate font-semibold text-white">
                    {displayName}
                  </span>
                </div>
              </TableCell>
              <TableCell className={TOURNAMENT_TABLE_CELL_CLASS}>
                <span className="block max-w-[16rem] truncate font-semibold text-neutral-200">
                  {riotId || "—"}
                </span>
              </TableCell>
              <TableCell
                className={`${TOURNAMENT_TABLE_CELL_CLASS} text-center`}
              >
                <CheckInBadge checkedIn={Boolean(participant.isCheckedIn)} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </div>
);

/** Giải đồng đội — giữ UI gốc (# / Đội / Tag / Check-in). */
const TeamPlayersTable = ({
  rows,
  userTeamId,
  selectedTournamentTeamId,
  onOpenTeam,
}: {
  rows: RegisteredTeam[];
  userTeamId: number | null;
  selectedTournamentTeamId: number | null;
  onOpenTeam: (tournamentTeamId: number | null) => void;
}) => (
  <div className={`${TOURNAMENT_PANEL_CLASS} w-full overflow-x-auto`}>
    <Table className={TOURNAMENT_TABLE_MIN_CLASS}>
      <TableHeader>
        <TableRow className={TOURNAMENT_TABLE_HEADER_ROW_CLASS}>
          <TableHead
            className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-10 text-center whitespace-nowrap sm:w-12`}
          >
            #
          </TableHead>
          <TableHead
            className={`${TOURNAMENT_TABLE_HEADER_CLASS} min-w-0 whitespace-nowrap`}
          >
            Đội
          </TableHead>
          <TableHead
            className={`${TOURNAMENT_TABLE_HEADER_CLASS} hidden w-20 whitespace-nowrap sm:table-cell`}
          >
            Tag
          </TableHead>
          <TableHead
            className={`${TOURNAMENT_TABLE_HEADER_CLASS} w-24 text-center whitespace-nowrap sm:w-28`}
          >
            Check-in
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((participant, index) => {
          const tournamentTeamId = toNumber(participant.id);
          const isMine =
            userTeamId !== null &&
            toNumber(participant.team_id) === userTeamId;
          const isCheckedIn = Boolean(participant.isCheckedIn);

          return (
            <TableRow
              key={`${participant.id ?? participant.team_id}-${participant.name ?? "team"}`}
              className={`${TOURNAMENT_TABLE_ROW_INTERACTIVE_CLASS} cursor-pointer ${
                tournamentTeamId === selectedTournamentTeamId
                  ? "bg-[#1c1c1c]"
                  : ""
              } ${isMine ? "border-l-[3px] border-l-neutral-400" : ""}`}
              onClick={() => onOpenTeam(tournamentTeamId)}
            >
              <TableCell
                className={`${TOURNAMENT_TABLE_CELL_CLASS} text-center font-semibold text-neutral-400 tabular-nums`}
              >
                {String(index + 1).padStart(2, "0")}
              </TableCell>
              <TableCell className={TOURNAMENT_TABLE_CELL_CLASS}>
                <div className="flex min-w-0 items-center gap-2">
                  <img
                    src={participant.logo_url || TOURNAMENT_LOGO}
                    alt={participant.name || "Team logo"}
                    className="h-7 w-7 shrink-0 object-contain sm:h-8 sm:w-8"
                  />
                  <div className="min-w-0 leading-snug">
                    <span className="block truncate font-semibold text-white">
                      {participant.name || "—"}
                    </span>
                    {participant.short_name ? (
                      <span className="mt-0.5 block text-[10px] font-semibold uppercase text-neutral-500 sm:hidden">
                        {participant.short_name}
                      </span>
                    ) : null}
                  </div>
                </div>
              </TableCell>
              <TableCell
                className={`${TOURNAMENT_TABLE_CELL_CLASS} hidden sm:table-cell`}
              >
                {participant.short_name ? (
                  <span className={TOURNAMENT_TEAM_TAG_BADGE_CLASS}>
                    {participant.short_name}
                  </span>
                ) : (
                  <span className={TOURNAMENT_TABLE_TAG_CLASS}>—</span>
                )}
              </TableCell>
              <TableCell
                className={`${TOURNAMENT_TABLE_CELL_CLASS} text-center`}
              >
                <CheckInBadge checkedIn={isCheckedIn} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </div>
);

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
  const isIndividualMode =
    String(tournament?.registration_mode ?? "org").toLowerCase() ===
    "individual";

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
  const unitLabel = isIndividualMode ? "thành viên" : "đội";
  const userId = Number.isFinite(Number(user?.id)) ? Number(user?.id) : null;
  const userTeamId = Number.isFinite(Number(user?.team_id))
    ? Number(user?.team_id)
    : null;

  return (
    <div className={`space-y-5 ${TOURNAMENT_PAGE_BG_CLASS}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className={TOURNAMENT_PAGE_TITLE_CLASS}>Danh sách</h2>
          <p className={TOURNAMENT_SECTION_META_CLASS}>
            {registeredCount}
            {maxParticipate ? ` / ${maxParticipate}` : ""} {unitLabel} đăng ký
            {apiPlayersRaw.length > 0
              ? ` · ${checkedInCount} đã check-in`
              : ""}
          </p>
        </div>
      </div>

      {isLoading ? (
        <PageLoader
          label={
            isIndividualMode
              ? "Đang tải danh sách thành viên..."
              : "Đang tải danh sách đội..."
          }
          fullScreen={false}
        />
      ) : null}

      {!isLoading && apiPlayersRaw.length === 0 ? (
        <div
          className={`${TOURNAMENT_PANEL_CLASS} px-4 py-10 text-center text-sm text-neutral-400`}
        >
          {isIndividualMode
            ? "Chưa có thành viên nào đăng ký giải này."
            : "Chưa có đội nào đăng ký giải này."}
        </div>
      ) : null}

      {!isLoading && apiPlayersRaw.length > 0 ? (
        isIndividualMode ? (
          <IndividualPlayersTable
            rows={apiPlayersRaw}
            userId={userId}
            userRiotAccount={String(user?.riot_account ?? "").trim()}
          />
        ) : (
          <TeamPlayersTable
            rows={apiPlayersRaw}
            userTeamId={userTeamId}
            selectedTournamentTeamId={selectedTournamentTeamId}
            onOpenTeam={openTeamModal}
          />
        )
      ) : null}

      {!isIndividualMode ? (
        <TeamRosterDialog
          open={isTeamModalOpen}
          onOpenChange={setIsTeamModalOpen}
          teamId={selectedTournamentTeamId}
          teamName={selectedTeam?.name || null}
          teamShortName={selectedTeam?.short_name || null}
          teamLogoUrl={selectedTeam?.logo_url || null}
          showRiotId={showRiotId}
        />
      ) : null}
    </div>
  );
};

export default PlayersPage;
