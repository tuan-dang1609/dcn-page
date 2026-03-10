// Match detail data — flexible per game type
// CS2/Valorant: maps with round scores, player stats (K/D/+/-/ADR/HS%)
// LoL/Wild Rift: single game stats (K/D/A/CS/DMG)
// TFT 4v4: placement per round, no traditional K/D

export type GameType = "cs2" | "valorant" | "lol" | "wildrift" | "tft";

export interface MapScore {
  mapName: string;
  mapImage?: string;
  team1Score: number;
  team2Score: number;
}

export interface PlayerStat {
  name: string;
  icon: string; // emoji icon
  avatar?: string;
  // FPS games (CS2, Valorant)
  kills?: number;
  deaths?: number;
  plusMinus?: number;
  adr?: number;
  hsPercent?: string;
  // MOBA games (LoL, WR)
  assists?: number;
  cs?: number;
  damage?: number;
  // TFT
  placement?: number;
  // Generic
  role?: string;
  firstDeaths?: number;
  firstKills?: number;
  multiKills?: number;
  acs?: number;
}

export interface TeamRoster {
  teamName: string;
  teamLogo: string;
  teamTag: string;
  players: PlayerStat[];
}

export interface FPSMapRoster {
  label: string;
  team1Roster: TeamRoster;
  team2Roster: TeamRoster;
}

export interface MatchDetail {
  id: string;
  tournamentName: string;
  roundName: string;
  format: string; // "BO3", "BO5", "BO1"
  date: string;
  gameType: GameType;

  team1: {
    name: string;
    tag: string;
    logo: string;
    score: number;
    rank?: string;
  };
  team2: {
    name: string;
    tag: string;
    logo: string;
    score: number;
    rank?: string;
  };

  maps?: MapScore[];
  team1Roster: TeamRoster;
  team2Roster: TeamRoster;

  // For stat tabs per map (FPS) or per game
  statTabs?: string[];
  fpsMapRosters?: FPSMapRoster[];
}

// Sample match details
export const matchDetails: Record<string, MatchDetail> = {
  // CS2 match
  "cs2-match-1": {
    id: "cs2-match-1",
    tournamentName: "CS2 Arena Invitational",
    roundName: "Bán kết 1",
    format: "BO3",
    date: "2025-07-18",
    gameType: "cs2",
    team1: {
      name: "Shadow Wolves",
      tag: "SHW",
      logo: "https://placehold.co/80x80/EF4444/FFFFFF?text=SHW",
      score: 2,
      rank: "#1",
    },
    team2: {
      name: "Phoenix Rising",
      tag: "PHX",
      logo: "https://placehold.co/80x80/F59E0B/FFFFFF?text=PHX",
      score: 1,
      rank: "#4",
    },
    maps: [
      { mapName: "INFERNO", team1Score: 13, team2Score: 10 },
      { mapName: "ANUBIS", team1Score: 9, team2Score: 13 },
      { mapName: "MIRAGE", team1Score: 13, team2Score: 6 },
    ],
    team1Roster: {
      teamName: "Shadow Wolves",
      teamLogo: "https://placehold.co/80x80/EF4444/FFFFFF?text=SHW",
      teamTag: "SHW",
      players: [
        {
          name: "WolfAlpha",
          icon: "🇻🇳",
          kills: 48,
          deaths: 41,
          plusMinus: 7,
          adr: 88,
          hsPercent: "39%",
          acs: 10,
        },
        {
          name: "ShadowBlade",
          icon: "🇻🇳",
          kills: 39,
          deaths: 42,
          plusMinus: -3,
          adr: 80,
          hsPercent: "46%",
          acs: 10,
        },
        {
          name: "NightHowl",
          icon: "🇻🇳",
          kills: 37,
          deaths: 40,
          plusMinus: -3,
          adr: 73,
          hsPercent: "42%",
          acs: 10,
        },
        {
          name: "IronFang",
          icon: "🇻🇳",
          kills: 42,
          deaths: 38,
          plusMinus: 4,
          adr: 82,
          hsPercent: "35%",
          acs: 10,
        },
        {
          name: "DarkMoon",
          icon: "🇻🇳",
          kills: 35,
          deaths: 39,
          plusMinus: -4,
          adr: 70,
          hsPercent: "50%",
          acs: 10,
        },
      ],
    },
    team2Roster: {
      teamName: "Phoenix Rising",
      teamLogo: "https://placehold.co/80x80/F59E0B/FFFFFF?text=PHX",
      teamTag: "PHX",
      players: [
        {
          name: "Blaze",
          icon: "🇻🇳",
          kills: 46,
          deaths: 37,
          plusMinus: 9,
          adr: 92,
          hsPercent: "58%",
          acs: 10,
        },
        {
          name: "Ember",
          icon: "🇻🇳",
          kills: 41,
          deaths: 41,
          plusMinus: 0,
          adr: 91,
          hsPercent: "60%",
          acs: 10,
        },
        {
          name: "Flare",
          icon: "🇻🇳",
          kills: 54,
          deaths: 37,
          plusMinus: 17,
          adr: 88,
          hsPercent: "27%",
          acs: 10,
        },
        {
          name: "Pyro",
          icon: "🇻🇳",
          kills: 30,
          deaths: 44,
          plusMinus: -14,
          adr: 65,
          hsPercent: "33%",
          acs: 10,
        },
        {
          name: "Ash",
          icon: "🇻🇳",
          kills: 29,
          deaths: 42,
          plusMinus: -13,
          adr: 61,
          hsPercent: "41%",
          acs: 10,
        },
      ],
    },
    statTabs: ["All Maps", "Inferno", "Anubis", "Mirage"],
  },

  // Valorant match
  "val-match-1": {
    id: "val-match-1",
    tournamentName: "Valorant Showdown #1",
    roundName: "Chung kết",
    format: "BO3",
    date: "2025-10-15",
    gameType: "valorant",
    team1: {
      name: "Dong Chuyen Nghiep",
      tag: "DCN",
      logo: "https://dongchuyennghiep.vercel.app/image/waiting.png",
      score: 2,
      rank: "#1",
    },
    team2: {
      name: "Beacon Esports",
      tag: "BCN",
      logo: "https://placehold.co/80x80/4F46E5/FFFFFF?text=BCN",
      score: 0,
      rank: "#2",
    },
    maps: [
      { mapName: "HAVEN", team1Score: 13, team2Score: 8 },
      { mapName: "BIND", team1Score: 13, team2Score: 11 },
    ],
    team1Roster: {
      teamName: "Dong Chuyen Nghiep",
      teamLogo: "https://dongchuyennghiep.vercel.app/image/waiting.png",
      teamTag: "DCN",
      players: [
        {
          name: "ProVN",
          icon: "🇻🇳",
          role: "Duelist",
          kills: 38,
          deaths: 22,
          plusMinus: 16,
          adr: 210,
          hsPercent: "28%",
          acs: 10,
        },
        {
          name: "SageMain",
          icon: "🇻🇳",
          role: "Sentinel",
          kills: 25,
          deaths: 20,
          plusMinus: 5,
          adr: 155,
          hsPercent: "22%",
          acs: 10,
        },
        {
          name: "SmokeMaster",
          icon: "🇻🇳",
          role: "Controller",
          kills: 22,
          deaths: 24,
          plusMinus: -2,
          adr: 140,
          hsPercent: "18%",
          acs: 10,
        },
        {
          name: "FlashKing",
          icon: "🇻🇳",
          role: "Initiator",
          kills: 30,
          deaths: 19,
          plusMinus: 11,
          adr: 180,
          hsPercent: "32%",
          acs: 10,
        },
        {
          name: "WallGod",
          icon: "🇻🇳",
          role: "Sentinel",
          kills: 19,
          deaths: 21,
          plusMinus: -2,
          adr: 130,
          hsPercent: "25%",
          acs: 10,
        },
      ],
    },
    team2Roster: {
      teamName: "Beacon Esports",
      teamLogo: "https://placehold.co/80x80/4F46E5/FFFFFF?text=BCN",
      teamTag: "BCN",
      players: [
        {
          name: "Ace",
          icon: "🇻🇳",
          role: "Duelist",
          kills: 30,
          deaths: 28,
          plusMinus: 2,
          adr: 185,
          hsPercent: "30%",
          acs: 10,
        },
        {
          name: "Shield",
          icon: "🇻🇳",
          role: "Sentinel",
          kills: 18,
          deaths: 26,
          plusMinus: -8,
          adr: 120,
          hsPercent: "20%",
          acs: 10,
        },
        {
          name: "Viper",
          icon: "🇻🇳",
          role: "Controller",
          kills: 20,
          deaths: 27,
          plusMinus: -7,
          adr: 135,
          hsPercent: "24%",
          acs: 10,
        },
        {
          name: "Spark",
          icon: "🇻🇳",
          role: "Initiator",
          kills: 24,
          deaths: 25,
          plusMinus: -1,
          adr: 150,
          hsPercent: "26%",
          acs: 10,
        },
        {
          name: "Echo",
          icon: "🇻🇳",
          role: "Flex",
          kills: 14,
          deaths: 28,
          plusMinus: -14,
          adr: 100,
          hsPercent: "15%",
          acs: 10,
        },
      ],
    },
    statTabs: ["All Maps", "Haven", "Bind"],
  },

  // LoL match
  "lol-match-1": {
    id: "lol-match-1",
    tournamentName: "League of Legends – Clash Cup",
    roundName: "Tứ kết",
    format: "BO3",
    date: "2025-11-02",
    gameType: "lol",
    team1: {
      name: "Arctic Storm",
      tag: "ARC",
      logo: "https://placehold.co/80x80/06B6D4/FFFFFF?text=ARC",
      score: 2,
      rank: "#3",
    },
    team2: {
      name: "Crimson Guard",
      tag: "CRG",
      logo: "https://placehold.co/80x80/DC2626/FFFFFF?text=CRG",
      score: 1,
      rank: "#6",
    },
    maps: [
      { mapName: "GAME 1", team1Score: 1, team2Score: 0 },
      { mapName: "GAME 2", team1Score: 0, team2Score: 1 },
      { mapName: "GAME 3", team1Score: 1, team2Score: 0 },
    ],
    team1Roster: {
      teamName: "Arctic Storm",
      teamLogo: "https://placehold.co/80x80/06B6D4/FFFFFF?text=ARC",
      teamTag: "ARC",
      players: [
        {
          name: "IceTop",
          icon: "🇻🇳",
          role: "Top",
          kills: 12,
          deaths: 8,
          assists: 15,
          cs: 580,
          damage: 22000,
          acs: 10,
        },
        {
          name: "FrostJG",
          icon: "🇻🇳",
          role: "Jungle",
          kills: 8,
          deaths: 10,
          assists: 28,
          cs: 420,
          damage: 15000,
          acs: 10,
        },
        {
          name: "BlizzMid",
          icon: "🇻🇳",
          role: "Mid",
          kills: 18,
          deaths: 7,
          assists: 12,
          cs: 640,
          damage: 28000,
          acs: 10,
        },
        {
          name: "ColdADC",
          icon: "🇻🇳",
          role: "ADC",
          kills: 20,
          deaths: 6,
          assists: 10,
          cs: 700,
          damage: 32000,
          acs: 10,
        },
        {
          name: "SnowSup",
          icon: "🇻🇳",
          role: "Support",
          kills: 3,
          deaths: 12,
          assists: 35,
          cs: 80,
          damage: 8000,
          acs: 10,
        },
      ],
    },
    team2Roster: {
      teamName: "Crimson Guard",
      teamLogo: "https://placehold.co/80x80/DC2626/FFFFFF?text=CRG",
      teamTag: "CRG",
      players: [
        {
          name: "RedBaron",
          icon: "🇻🇳",
          role: "Top",
          kills: 10,
          deaths: 14,
          assists: 8,
          cs: 520,
          damage: 18000,
          acs: 10,
        },
        {
          name: "BloodJG",
          icon: "🇻🇳",
          role: "Jungle",
          kills: 6,
          deaths: 12,
          assists: 20,
          cs: 380,
          damage: 12000,
          acs: 10,
        },
        {
          name: "CrimsonMid",
          icon: "🇻🇳",
          role: "Mid",
          kills: 14,
          deaths: 11,
          assists: 10,
          cs: 600,
          damage: 24000,
          acs: 10,
        },
        {
          name: "ScarletADC",
          icon: "🇻🇳",
          role: "ADC",
          kills: 15,
          deaths: 10,
          assists: 6,
          cs: 650,
          damage: 27000,
          acs: 10,
        },
        {
          name: "RubySup",
          icon: "🇻🇳",
          role: "Support",
          kills: 2,
          deaths: 14,
          assists: 30,
          cs: 60,
          damage: 6000,
          acs: 10,
        },
      ],
    },
    statTabs: ["All Games", "Game 1", "Game 2", "Game 3"],
  },

  // TFT 4v4 match
  "tft-match-1": {
    id: "tft-match-1",
    tournamentName: "TFT Set 15 – KO Coliseum",
    roundName: "Bán kết",
    format: "BO3",
    date: "2025-09-03",
    gameType: "tft",
    team1: {
      name: "Dong Chuyen Nghiep",
      tag: "DCN",
      logo: "https://dongchuyennghiep.vercel.app/image/waiting.png",
      score: 2,
    },
    team2: {
      name: "Lunar Knights",
      tag: "LNK",
      logo: "https://placehold.co/80x80/8B5CF6/FFFFFF?text=LNK",
      score: 1,
    },
    maps: [
      { mapName: "GAME 1", team1Score: 1, team2Score: 0 },
      { mapName: "GAME 2", team1Score: 0, team2Score: 1 },
      { mapName: "GAME 3", team1Score: 1, team2Score: 0 },
    ],
    team1Roster: {
      teamName: "Dong Chuyen Nghiep",
      teamLogo: "https://dongchuyennghiep.vercel.app/image/waiting.png",
      teamTag: "DCN",
      players: [
        { name: "TFTGod", icon: "🇻🇳", placement: 1, acs: 10 },
        { name: "ChessKing", icon: "🇻🇳", placement: 3, acs: 10 },
        { name: "BoardMaster", icon: "🇻🇳", placement: 2, acs: 10 },
        { name: "TacticPro", icon: "🇻🇳", placement: 4, acs: 10 },
      ],
    },
    team2Roster: {
      teamName: "Lunar Knights",
      teamLogo: "https://placehold.co/80x80/8B5CF6/FFFFFF?text=LNK",
      teamTag: "LNK",
      players: [
        { name: "MoonTFT", icon: "🇻🇳", placement: 5, acs: 10 },
        { name: "StarPlan", icon: "🇻🇳", placement: 6, acs: 10 },
        { name: "NightTactic", icon: "🇻🇳", placement: 7, acs: 10 },
        { name: "LunarSet", icon: "🇻🇳", placement: 8, acs: 10 },
      ],
    },
    statTabs: ["All Games", "Game 1", "Game 2", "Game 3"],
  },
};
