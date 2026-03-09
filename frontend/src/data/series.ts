export interface Tournament {
  id: string;
  title: string;
  game: string;
  gameIcon: string;
  bannerUrl: string;
  short_name: string;
  status: "upcoming" | "ongoing" | "completed";
  startDate: string;
  endDate: string;
  prizePool: string;
  maxPlayers: number;
  registeredPlayers: number;
  organizer: string;
  format: string;
  teamSize: string;
  description: string;
  tags: string[];
  winner?: string;
  slug: string;
  registered_count: number;
}

export interface Team {
  name: string;
  shortName: string;
  logoUrl: string;
  color: string;
}

export const seriesInfo = {
  name: "DCN Championship Series",
  season: "Season 1 · 2025",
  description:
    "Chuỗi giải đấu đa bộ môn quy tụ những tay chơi hàng đầu, tranh tài qua nhiều tựa game khác nhau trong hệ sinh thái Dong Chuyen Nghiep.",
  totalPrize: "3,800,000 VND",
  totalTournaments: 6,
  totalPlayers: 98,
};

// Points per placement: 1st=10, 2nd=7, 3rd=5, 4th=4, 5th=3, 6th=2, 7th=1, 8th=0
export const placementPoints = [10, 7, 5, 4, 3, 2, 1, 0];

export interface LeaderboardEntry {
  team: string;
  // Each tournament result: placement (1-8) or null if didn't participate
  results: Record<string, number | null>;
}

const tournamentIds = [
  "tft-set14",
  "wr-open",
  "cs2-arena",
  "tft-set15",
  "valorant-showdown",
  "lol-clash",
];

export const leaderboardEntries: LeaderboardEntry[] = [
  {
    team: "Dong Chuyen Nghiep",
    results: {
      "tft-set14": 2,
      "wr-open": 3,
      "cs2-arena": 1,
      "tft-set15": 1,
      "valorant-showdown": null,
      "lol-clash": null,
    },
  },
  {
    team: "Shadow Wolves",
    results: {
      "tft-set14": 4,
      "wr-open": 1,
      "cs2-arena": 2,
      "tft-set15": 3,
      "valorant-showdown": null,
      "lol-clash": null,
    },
  },
  {
    team: "Phoenix Rising",
    results: {
      "tft-set14": 1,
      "wr-open": 2,
      "cs2-arena": 5,
      "tft-set15": 4,
      "valorant-showdown": null,
      "lol-clash": null,
    },
  },
  {
    team: "Beacon Esports",
    results: {
      "tft-set14": 3,
      "wr-open": 5,
      "cs2-arena": 3,
      "tft-set15": 2,
      "valorant-showdown": null,
      "lol-clash": null,
    },
  },
  {
    team: "Arctic Storm",
    results: {
      "tft-set14": 5,
      "wr-open": 4,
      "cs2-arena": 4,
      "tft-set15": 5,
      "valorant-showdown": null,
      "lol-clash": null,
    },
  },
  {
    team: "Crimson Guard",
    results: {
      "tft-set14": 6,
      "wr-open": 6,
      "cs2-arena": 6,
      "tft-set15": 6,
      "valorant-showdown": null,
      "lol-clash": null,
    },
  },
  {
    team: "Lunar Knights",
    results: {
      "tft-set14": 7,
      "wr-open": 7,
      "cs2-arena": 7,
      "tft-set15": 7,
      "valorant-showdown": null,
      "lol-clash": null,
    },
  },
  {
    team: "Iron Phalanx",
    results: {
      "tft-set14": 8,
      "wr-open": 8,
      "cs2-arena": 8,
      "tft-set15": 8,
      "valorant-showdown": null,
      "lol-clash": null,
    },
  },
];

export { tournamentIds };
