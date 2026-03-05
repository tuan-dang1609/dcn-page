import type { Match as ApiMatch } from "@/api/tournaments/types";

type RegisteredTeam = {
  id?: number | string;
  team_id?: number | string;
  name?: string;
  short_name?: string;
  logo_url?: string;
};

type TeamSeed = {
  id: number;
  name: string;
  short_name: string;
  logo_url: string;
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const fallbackLogo = (index: number) =>
  `https://placehold.co/48x48/1f2937/e5e7eb?text=T${index + 1}`;

const buildSeedTeams = (
  teamCount: number,
  registeredTeams: RegisteredTeam[],
) => {
  const picks = (registeredTeams ?? []).slice(0, teamCount);
  const teams: TeamSeed[] = [];

  for (let i = 0; i < teamCount; i += 1) {
    const item = picks[i];
    const id = toNumber(item?.team_id ?? item?.id) ?? i + 1;
    teams.push({
      id,
      name: item?.name || item?.short_name || `Team ${i + 1}`,
      short_name: item?.short_name || `T${i + 1}`,
      logo_url: item?.logo_url || fallbackLogo(i),
    });
  }

  return teams;
};

const teamRef = (team?: TeamSeed | null) =>
  team
    ? {
        id: team.id,
        name: team.name,
        short_name: team.short_name,
        logo_url: team.logo_url,
        team_color_hex: null,
      }
    : null;

const makeMatch = ({
  id,
  bracketId,
  round,
  matchNo,
  teamA,
  teamB,
  scoreA,
  scoreB,
  winner,
}: {
  id: number;
  bracketId: number;
  round: number;
  matchNo: number;
  teamA?: TeamSeed | null;
  teamB?: TeamSeed | null;
  scoreA: number | null;
  scoreB: number | null;
  winner?: TeamSeed | null;
}): ApiMatch => ({
  id,
  bracket_id: bracketId,
  round_number: round,
  match_no: matchNo,
  team_a_id: teamA?.id ?? null,
  team_b_id: teamB?.id ?? null,
  score_a: scoreA,
  score_b: scoreB,
  winner_team_id: winner?.id ?? null,
  status: scoreA !== null || scoreB !== null ? "completed" : "scheduled",
  team_a: teamRef(teamA),
  team_b: teamRef(teamB),
});

const buildEightTeamMatches = (
  teams: TeamSeed[],
  bracketId: number,
): ApiMatch[] => {
  const [t1, t2, t3, t4, t5, t6, t7, t8] = teams;

  return [
    makeMatch({
      id: 1,
      bracketId,
      round: 1,
      matchNo: 1,
      teamA: t1,
      teamB: t8,
      scoreA: 2,
      scoreB: 0,
      winner: t1,
    }),
    makeMatch({
      id: 2,
      bracketId,
      round: 1,
      matchNo: 2,
      teamA: t4,
      teamB: t5,
      scoreA: 1,
      scoreB: 2,
      winner: t5,
    }),
    makeMatch({
      id: 3,
      bracketId,
      round: 1,
      matchNo: 3,
      teamA: t2,
      teamB: t7,
      scoreA: 2,
      scoreB: 1,
      winner: t2,
    }),
    makeMatch({
      id: 4,
      bracketId,
      round: 1,
      matchNo: 4,
      teamA: t3,
      teamB: t6,
      scoreA: 0,
      scoreB: 2,
      winner: t6,
    }),

    makeMatch({
      id: 5,
      bracketId,
      round: 2,
      matchNo: 1,
      teamA: t1,
      teamB: t5,
      scoreA: 2,
      scoreB: 1,
      winner: t1,
    }),
    makeMatch({
      id: 6,
      bracketId,
      round: 2,
      matchNo: 2,
      teamA: t2,
      teamB: t6,
      scoreA: 1,
      scoreB: 2,
      winner: t6,
    }),

    makeMatch({
      id: 7,
      bracketId,
      round: 3,
      matchNo: 1,
      teamA: t1,
      teamB: t6,
      scoreA: 1,
      scoreB: 2,
      winner: t6,
    }),

    makeMatch({
      id: 8,
      bracketId,
      round: 4,
      matchNo: 1,
      teamA: t8,
      teamB: t4,
      scoreA: 0,
      scoreB: 2,
      winner: t4,
    }),
    makeMatch({
      id: 9,
      bracketId,
      round: 4,
      matchNo: 2,
      teamA: t7,
      teamB: t3,
      scoreA: 1,
      scoreB: 2,
      winner: t3,
    }),

    makeMatch({
      id: 10,
      bracketId,
      round: 5,
      matchNo: 1,
      teamA: t4,
      teamB: t5,
      scoreA: 1,
      scoreB: 2,
      winner: t5,
    }),
    makeMatch({
      id: 11,
      bracketId,
      round: 5,
      matchNo: 2,
      teamA: t3,
      teamB: t2,
      scoreA: 0,
      scoreB: 2,
      winner: t2,
    }),

    makeMatch({
      id: 12,
      bracketId,
      round: 6,
      matchNo: 1,
      teamA: t5,
      teamB: t2,
      scoreA: 2,
      scoreB: 0,
      winner: t5,
    }),
    makeMatch({
      id: 13,
      bracketId,
      round: 7,
      matchNo: 1,
      teamA: t5,
      teamB: t1,
      scoreA: 1,
      scoreB: 2,
      winner: t1,
    }),
    makeMatch({
      id: 14,
      bracketId,
      round: 8,
      matchNo: 1,
      teamA: t6,
      teamB: t1,
      scoreA: 2,
      scoreB: 1,
      winner: t6,
    }),
  ];
};

const buildSixTeamMatches = (
  teams: TeamSeed[],
  bracketId: number,
): ApiMatch[] => {
  const [t1, t2, t3, t4, t5, t6] = teams;

  return [
    makeMatch({
      id: 1,
      bracketId,
      round: 1,
      matchNo: 1,
      teamA: t3,
      teamB: t6,
      scoreA: 2,
      scoreB: 1,
      winner: t3,
    }),
    makeMatch({
      id: 2,
      bracketId,
      round: 1,
      matchNo: 2,
      teamA: t4,
      teamB: t5,
      scoreA: 0,
      scoreB: 2,
      winner: t5,
    }),

    makeMatch({
      id: 3,
      bracketId,
      round: 2,
      matchNo: 1,
      teamA: t1,
      teamB: t3,
      scoreA: 2,
      scoreB: 0,
      winner: t1,
    }),
    makeMatch({
      id: 4,
      bracketId,
      round: 2,
      matchNo: 2,
      teamA: t2,
      teamB: t5,
      scoreA: 1,
      scoreB: 2,
      winner: t5,
    }),

    makeMatch({
      id: 5,
      bracketId,
      round: 3,
      matchNo: 1,
      teamA: t1,
      teamB: t5,
      scoreA: 2,
      scoreB: 1,
      winner: t1,
    }),

    makeMatch({
      id: 6,
      bracketId,
      round: 4,
      matchNo: 1,
      teamA: t6,
      teamB: t4,
      scoreA: 0,
      scoreB: 2,
      winner: t4,
    }),
    makeMatch({
      id: 7,
      bracketId,
      round: 5,
      matchNo: 1,
      teamA: t4,
      teamB: t3,
      scoreA: 0,
      scoreB: 2,
      winner: t3,
    }),
    makeMatch({
      id: 8,
      bracketId,
      round: 6,
      matchNo: 1,
      teamA: t3,
      teamB: t2,
      scoreA: 1,
      scoreB: 2,
      winner: t2,
    }),
    makeMatch({
      id: 9,
      bracketId,
      round: 7,
      matchNo: 1,
      teamA: t2,
      teamB: t5,
      scoreA: 0,
      scoreB: 2,
      winner: t5,
    }),
    makeMatch({
      id: 10,
      bracketId,
      round: 8,
      matchNo: 1,
      teamA: t1,
      teamB: t5,
      scoreA: 2,
      scoreB: 0,
      winner: t1,
    }),
  ];
};

export const getMockDoubleElimMatches = async ({
  teamCount,
  registeredTeams,
  bracketId,
}: {
  teamCount: number;
  registeredTeams: RegisteredTeam[];
  bracketId: number;
}): Promise<ApiMatch[]> => {
  const effectiveTeamCount = teamCount === 6 ? 6 : 8;
  const teams = buildSeedTeams(effectiveTeamCount, registeredTeams);

  if (effectiveTeamCount === 6) {
    return buildSixTeamMatches(teams, bracketId);
  }

  return buildEightTeamMatches(teams, bracketId);
};
