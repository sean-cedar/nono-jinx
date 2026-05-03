// MLB Stats API response types (statsapi.mlb.com)

export interface ScheduleResponse {
  dates: ScheduleDate[];
}

export interface ScheduleDate {
  date: string;
  games: ScheduleGame[];
}

export interface ScheduleGame {
  gamePk: number;
  gameDate: string;
  status: GameStatus;
  teams: {
    away: ScheduleTeamInfo;
    home: ScheduleTeamInfo;
  };
}

export interface GameStatus {
  abstractGameState: "Preview" | "Live" | "Final";
  detailedState: string;
  statusCode: string;
}

export interface ScheduleTeamInfo {
  team: { id: number; name: string };
  score?: number;
}

// Linescore

export interface LinescoreResponse {
  currentInning: number;
  currentInningOrdinal: string;
  inningState: "Top" | "Middle" | "Bottom" | "End";
  inningHalf: "Top" | "Bottom";
  scheduledInnings: number;
  innings: LinescoreInning[];
  teams: {
    home: LinescoreTeamTotal;
    away: LinescoreTeamTotal;
  };
  defense: {
    pitcher: PlayerRef;
  };
  offense: {
    batter?: PlayerRef;
  };
}

export interface LinescoreInning {
  num: number;
  ordinalNum: string;
  home: InningLine;
  away: InningLine;
}

export interface InningLine {
  runs?: number;
  hits?: number;
  errors?: number;
  leftOnBase?: number;
}

export interface LinescoreTeamTotal {
  runs: number;
  hits: number;
  errors: number;
  leftOnBase: number;
}

export interface PlayerRef {
  id: number;
  fullName: string;
  link: string;
}

// Boxscore

export interface BoxscoreResponse {
  teams: {
    away: BoxscoreTeam;
    home: BoxscoreTeam;
  };
}

export interface BoxscoreTeam {
  team: { id: number; name: string };
  teamStats: {
    batting: BoxscoreBattingStats;
    pitching: BoxscorePitchingStats;
    fielding: BoxscoreFieldingStats;
  };
  players: Record<string, BoxscorePlayer>;
  pitchers: number[];
  batters: number[];
}

export interface BoxscoreBattingStats {
  runs: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  strikeOuts: number;
  baseOnBalls: number;
  hitByPitch: number;
  atBats: number;
  stolenBases: number;
  leftOnBase: number;
}

export interface BoxscorePitchingStats {
  runs: number;
  hits: number;
  earnedRuns: number;
  baseOnBalls: number;
  strikeOuts: number;
  hitByPitch: number;
  numberOfPitches: number;
  inningsPitched: string;
  era: string;
}

export interface BoxscoreFieldingStats {
  errors: number;
  assists: number;
  putOuts: number;
}

export interface BoxscorePlayer {
  person: PlayerRef;
  position: { code: string; name: string; type: string; abbreviation: string };
  stats: {
    batting?: Record<string, unknown>;
    pitching?: Record<string, unknown>;
    fielding?: Record<string, unknown>;
  };
  gameStatus?: {
    isCurrentBatter?: boolean;
    isCurrentPitcher?: boolean;
    isOnBench?: boolean;
    isSubstitute?: boolean;
  };
}

// Internal event types

export type NoHitterEventType =
  | "no_hitter_in_progress"
  | "perfect_game_in_progress"
  | "no_hitter_broken"
  | "no_hitter_complete"
  | "perfect_game_complete"
  | "pitcher_replaced";

export interface NoHitterEvent {
  type: NoHitterEventType;
  gamePk: number;
  pitcherName: string;
  pitchingTeam: string;
  battingTeam: string;
  inning: number;
  inningOrdinal: string;
  inningHalf: "Top" | "Bottom";
  isPerfectGame: boolean;
  isCombinedNoHitter: boolean;
  pitcherCount: number;
  startingPitcherName: string;
  pitchCount?: number;
  strikeouts?: number;
  gameDate: string;
}

export interface NoHitterState {
  gamePk: number;
  pitcherName: string;
  startingPitcherName: string;
  pitcherCount: number;
  pitchingTeam: string;
  battingTeam: string;
  lastReportedInning: number;
  lastReportedHalf: "Top" | "Bottom";
  isPerfectGame: boolean;
  startedAt: string;
}
