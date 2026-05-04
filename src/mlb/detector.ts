import type {
  ScheduleGame,
  LinescoreResponse,
  BoxscoreResponse,
  NoHitterEvent,
  NoHitterState,
  PlayByPlayEntry,
} from "./types.js";
import { getLinescore, getBoxscore, getPlayByPlay } from "./client.js";

const MIN_INNING = parseInt(process.env.MIN_INNING_THRESHOLD ?? "1", 10);

function toOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

interface ActiveNoHitter {
  gamePk: number;
  side: "home" | "away";
  currentPitcherName: string;
  startingPitcherName: string;
  pitcherCount: number;
  pitchingTeam: string;
  battingTeam: string;
  inning: number;
  inningOrdinal: string;
  inningHalf: "Top" | "Bottom";
  completedHalves: number;
  isPerfectGame: boolean;
  pitchCount?: number;
  strikeouts?: number;
}

/**
 * Check if a perfect game is intact by examining the boxscore.
 * Perfect game = 0 hits, 0 walks, 0 errors, 0 HBP for the batting side,
 * AND only one pitcher has been used.
 */
function checkPerfectGame(
  boxscore: BoxscoreResponse,
  battingSide: "home" | "away",
  pitchingSide: "home" | "away",
): boolean {
  const batting = boxscore.teams[battingSide].teamStats.batting;
  const fielding = boxscore.teams[pitchingSide].teamStats.fielding;
  const pitcherCount = boxscore.teams[pitchingSide].pitchers.length;
  return (
    batting.hits === 0 &&
    batting.baseOnBalls === 0 &&
    batting.hitByPitch === 0 &&
    fielding.errors === 0 &&
    pitcherCount === 1
  );
}

/**
 * Resolve the starting pitcher's name from the boxscore.
 * The pitchers array is ordered by appearance; index 0 is the starter.
 */
function resolveStartingPitcher(
  boxscore: BoxscoreResponse,
  pitchingSide: "home" | "away",
): string {
  const team = boxscore.teams[pitchingSide];
  const starterId = team.pitchers[0];
  if (!starterId) return "Unknown Pitcher";
  const playerKey = `ID${starterId}`;
  const player = team.players[playerKey];
  return player?.person?.fullName ?? "Unknown Pitcher";
}

function completedHalfInnings(
  linescore: LinescoreResponse,
  battingSide: "home" | "away",
): number {
  const { currentInning, inningState } = linescore;
  if (!currentInning) return 0;

  if (battingSide === "away") {
    // Away bats in the top half. During "Top" they're still batting,
    // so subtract 1. At any other state the top half is done.
    return inningState === "Top" ? currentInning - 1 : currentInning;
  } else {
    // Home bats in the bottom half. Only at "End" is the bottom
    // half complete. During "Top", "Middle", or "Bottom" the home
    // team hasn't finished batting in the current inning.
    return inningState === "End" ? currentInning : currentInning - 1;
  }
}

const HIT_EVENTS = new Set(["Single", "Double", "Triple", "Home Run"]);

const PERFECT_GAME_BREAKER_EVENTS = new Set([
  "Walk",
  "Intent Walk",
  "Hit By Pitch",
  "Field Error",
  "Balk",
  "Interference",
  "Catcher Interference",
]);

/**
 * Find the play that broke the perfect game (walk, HBP, error, etc.).
 * Searches in reverse so the most recent breaker is found first.
 */
function findPerfectGameBreaker(
  plays: PlayByPlayEntry[],
  pitchingSide: "home" | "away",
): { batter: string; event: string; description: string } | null {
  const battingHalf = pitchingSide === "home" ? "top" : "bottom";
  for (let i = plays.length - 1; i >= 0; i--) {
    const play = plays[i];
    if (
      play.about.halfInning === battingHalf &&
      play.about.isComplete &&
      PERFECT_GAME_BREAKER_EVENTS.has(play.result.event)
    ) {
      return {
        batter: play.matchup.batter.fullName,
        event: play.result.event,
        description: play.result.description,
      };
    }
  }
  return null;
}

/**
 * Find the first hit by the batting side in the play-by-play data.
 * pitchingSide refers to the state key side (the team pitching the no-hitter).
 * If pitchingSide is "home", the batting side bats in the "top" half.
 * If pitchingSide is "away", the batting side bats in the "bottom" half.
 * Searches in reverse to find the most recent hit.
 */
function findBreakupHit(
  plays: PlayByPlayEntry[],
  pitchingSide: "home" | "away",
): { batter: string; event: string; description: string } | null {
  const battingHalf = pitchingSide === "home" ? "top" : "bottom";
  for (let i = plays.length - 1; i >= 0; i--) {
    const play = plays[i];
    if (
      play.about.halfInning === battingHalf &&
      play.about.isComplete &&
      HIT_EVENTS.has(play.result.event)
    ) {
      return {
        batter: play.matchup.batter.fullName,
        event: play.result.event,
        description: play.result.description,
      };
    }
  }
  return null;
}

/**
 * Scan a live game for active no-hitters on either side.
 */
async function detectInGame(
  game: ScheduleGame,
): Promise<ActiveNoHitter[]> {
  const [linescore, boxscore] = await Promise.all([
    getLinescore(game.gamePk),
    getBoxscore(game.gamePk),
  ]);

  const results: ActiveNoHitter[] = [];

  const sides: Array<{ battingSide: "home" | "away"; pitchingSide: "home" | "away" }> = [
    { battingSide: "away", pitchingSide: "home" },
    { battingSide: "home", pitchingSide: "away" },
  ];

  for (const { battingSide, pitchingSide } of sides) {
    const totalHits = linescore.teams[battingSide].hits;
    if (totalHits !== 0) continue;

    const completedHalves = completedHalfInnings(linescore, battingSide);

    // Ensure at least one at-bat has actually occurred — guards against
    // pre-game states where hits=0 simply because nobody has batted yet.
    const atBats = boxscore.teams[battingSide].teamStats.batting.atBats;
    const walks = boxscore.teams[battingSide].teamStats.batting.baseOnBalls;
    const hbp = boxscore.teams[battingSide].teamStats.batting.hitByPitch;
    if (atBats + walks + hbp === 0) continue;

    const pitcherIds = boxscore.teams[pitchingSide].pitchers;
    const pitcherCount = pitcherIds.length;
    const isPerfect = checkPerfectGame(boxscore, battingSide, pitchingSide);
    const currentPitcherId = pitcherIds[pitcherIds.length - 1];
    const currentPitcherName = currentPitcherId
      ? boxscore.teams[pitchingSide].players[`ID${currentPitcherId}`]?.person?.fullName ?? "Unknown Pitcher"
      : "Unknown Pitcher";
    const startingPitcherName = resolveStartingPitcher(boxscore, pitchingSide);
    const pitchingStats = boxscore.teams[pitchingSide].teamStats.pitching;

    results.push({
      gamePk: game.gamePk,
      side: pitchingSide,
      currentPitcherName,
      startingPitcherName,
      pitcherCount,
      pitchingTeam: game.teams[pitchingSide].team.name,
      battingTeam: game.teams[battingSide].team.name,
      inning: completedHalves,
      inningOrdinal: toOrdinal(completedHalves),
      inningHalf: linescore.inningHalf,
      completedHalves,
      isPerfectGame: isPerfect,
      pitchCount: pitchingStats.numberOfPitches,
      strikeouts: pitchingStats.strikeOuts,
    });
  }

  return results;
}

export interface DetectionResult {
  events: NoHitterEvent[];
  updatedState: Record<string, NoHitterState>;
}

function makeEvent(
  type: NoHitterEvent["type"],
  active: ActiveNoHitter | NoHitterState,
  overrides: Partial<NoHitterEvent> = {},
): NoHitterEvent {
  const isCombined = "pitcherCount" in active
    ? active.pitcherCount > 1
    : false;
  return {
    type,
    gamePk: active.gamePk,
    pitcherName: "currentPitcherName" in active ? active.currentPitcherName : active.pitcherName,
    pitchingTeam: active.pitchingTeam,
    battingTeam: active.battingTeam,
    inning: "inning" in active ? active.inning : active.lastReportedInning,
    inningOrdinal: "inningOrdinal" in active ? active.inningOrdinal : `${active.lastReportedInning}th`,
    inningHalf: "inningHalf" in active ? active.inningHalf : active.lastReportedHalf,
    isPerfectGame: active.isPerfectGame,
    isCombinedNoHitter: isCombined,
    pitcherCount: active.pitcherCount,
    startingPitcherName: active.startingPitcherName,
    pitchCount: "pitchCount" in active ? active.pitchCount : undefined,
    strikeouts: "strikeouts" in active ? active.strikeouts : undefined,
    gameDate: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Core detection pipeline. Compares current game states against stored state
 * and emits events for new, progressed, broken, completed, and pitcher-changed
 * no-hitters.
 */
export async function detectNoHitters(
  liveGames: ScheduleGame[],
  finishedGames: ScheduleGame[],
  currentState: Record<string, NoHitterState>,
  allGames?: ScheduleGame[],
): Promise<DetectionResult> {
  const events: NoHitterEvent[] = [];
  const updatedState: Record<string, NoHitterState> = {};

  const allActive: ActiveNoHitter[] = [];
  for (const game of liveGames) {
    try {
      const found = await detectInGame(game);
      allActive.push(...found);
    } catch (err) {
      console.error(`Error checking game ${game.gamePk}:`, err);
    }
  }

  const activeKeys = new Set<string>();

  for (const active of allActive) {
    const key = `${active.gamePk}-${active.side}`;
    activeKeys.add(key);

    const existing = currentState[key];

    if (!existing) {
      // New no-hitter detected — only post "in progress" after MIN_INNING
      if (active.completedHalves >= MIN_INNING) {
        const type = active.isPerfectGame
          ? "perfect_game_in_progress"
          : "no_hitter_in_progress";
        events.push(makeEvent(type, active));
      }

      // Retroactively detect a perfect game that was broken before we started tracking
      if (!active.isPerfectGame && active.completedHalves <= 2) {
        const pitchingSide = active.side;
        const battingSide = pitchingSide === "home" ? "away" : "home";
        try {
          const boxscore = await getBoxscore(active.gamePk);
          const batting = boxscore.teams[battingSide].teamStats.batting;
          const fielding = boxscore.teams[pitchingSide].teamStats.fielding;
          const hadPerfectGameBreaker =
            batting.baseOnBalls > 0 || batting.hitByPitch > 0 || fielding.errors > 0;
          if (hadPerfectGameBreaker) {
            const breakerOverrides: Partial<NoHitterEvent> = {};
            try {
              const pbp = await getPlayByPlay(active.gamePk);
              const breaker = findPerfectGameBreaker(pbp.allPlays, pitchingSide);
              if (breaker) {
                breakerOverrides.breakupBatter = breaker.batter;
                breakerOverrides.breakupPlay = breaker.event;
                breakerOverrides.breakupDescription = breaker.description;
              }
            } catch { /* best-effort */ }
            events.push(makeEvent("perfect_game_broken", active, breakerOverrides));
          }
        } catch { /* best-effort — still emit the no_hitter_in_progress event */ }
      }
    } else {
      // Check for pitcher replacement
      const prevPitcherCount = existing.pitcherCount ?? 1;
      if (active.pitcherCount > prevPitcherCount) {
        events.push(
          makeEvent("pitcher_replaced", active, {
            startingPitcherName: existing.startingPitcherName,
          }),
        );
      }

      // Perfect game broken but no-hitter continues (walk, HBP, error, etc.)
      if (existing.isPerfectGame && !active.isPerfectGame) {
        const breakerOverrides: Partial<NoHitterEvent> = {};
        try {
          const pbp = await getPlayByPlay(active.gamePk);
          const breaker = findPerfectGameBreaker(pbp.allPlays, active.side);
          if (breaker) {
            breakerOverrides.breakupBatter = breaker.batter;
            breakerOverrides.breakupPlay = breaker.event;
            breakerOverrides.breakupDescription = breaker.description;
          }
        } catch { /* best-effort */ }
        events.push(makeEvent("perfect_game_broken", active, breakerOverrides));
      }

      // Only post again when the batting side has completed another half-inning,
      // not when the game clock advances for the other side's at-bat.
      const prevHalves = existing.lastCompletedHalves ?? 0;
      const advanced = active.completedHalves > prevHalves;

      if (advanced && active.completedHalves >= MIN_INNING) {
        const type = active.isPerfectGame
          ? "perfect_game_in_progress"
          : "no_hitter_in_progress";
        events.push(makeEvent(type, active));
      }
    }

    updatedState[key] = {
      gamePk: active.gamePk,
      pitcherName: active.currentPitcherName,
      startingPitcherName: existing?.startingPitcherName ?? active.startingPitcherName,
      pitcherCount: active.pitcherCount,
      pitchingTeam: active.pitchingTeam,
      battingTeam: active.battingTeam,
      lastReportedInning: active.inning,
      lastReportedHalf: active.inningHalf,
      lastCompletedHalves: active.completedHalves,
      isPerfectGame: active.isPerfectGame,
      startedAt: existing?.startedAt ?? new Date().toISOString(),
    };
  }

  // Check for broken no-hitters and completed games
  const liveGamePks = new Set(liveGames.map((g) => g.gamePk));
  for (const [key, state] of Object.entries(currentState)) {
    if (activeKeys.has(key)) continue;

    const gamePk = state.gamePk;

    if (liveGamePks.has(gamePk)) {
      // Game is still live but no-hitter is gone -- broken up
      const overrides: Partial<NoHitterEvent> = { isPerfectGame: false };
      try {
        const linescore = await getLinescore(gamePk);
        overrides.inning = linescore.currentInning;
        overrides.inningOrdinal = linescore.currentInningOrdinal;
        overrides.inningHalf = linescore.inningHalf;
      } catch { /* use defaults from state */ }

      try {
        const pitchingSide = key.split("-")[1] as "home" | "away";
        const pbp = await getPlayByPlay(gamePk);
        const hit = findBreakupHit(pbp.allPlays, pitchingSide);
        if (hit) {
          overrides.breakupBatter = hit.batter;
          overrides.breakupPlay = hit.event;
          overrides.breakupDescription = hit.description;
        }
      } catch { /* best-effort — still emit event without breakup details */ }

      events.push(makeEvent("no_hitter_broken", state, overrides));
    }

    const finishedGame = finishedGames.find((g) => g.gamePk === gamePk);
    if (finishedGame) {
      try {
        const linescore = await getLinescore(gamePk);
        const side = key.split("-")[1] as "home" | "away";
        const battingSide = side === "home" ? "away" : "home";
        if (linescore.teams[battingSide].hits === 0) {
          const boxscore = await getBoxscore(gamePk);
          const isPerfect = checkPerfectGame(boxscore, battingSide, side);
          events.push(
            makeEvent(isPerfect ? "perfect_game_complete" : "no_hitter_complete", state, {
              inning: linescore.currentInning,
              inningOrdinal: linescore.currentInningOrdinal,
              inningHalf: linescore.inningHalf,
              isPerfectGame: isPerfect,
              pitcherCount: boxscore.teams[side].pitchers.length,
              isCombinedNoHitter: boxscore.teams[side].pitchers.length > 1,
            }),
          );
        }
      } catch (err) {
        console.error(`Error checking finished game ${gamePk}:`, err);
      }
    }
    // Either way, remove from updated state (game over or broken)
  }

  // Emit all_jinxed when every tracked no-hitter is gone, at least one was
  // broken this cycle, none were completed, AND no games are still waiting to
  // start (so we don't celebrate prematurely between game slots).
  const hadActiveNoHitters = Object.keys(currentState).length > 0;
  const noneRemaining = Object.keys(updatedState).length === 0;
  const brokenThisCycle = events.some((e) => e.type === "no_hitter_broken");
  const anyCompleted = events.some(
    (e) => e.type === "no_hitter_complete" || e.type === "perfect_game_complete",
  );
  const gamesYetToStart = allGames
    ? allGames.some((g) => g.status.abstractGameState === "Preview")
    : false;

  if (hadActiveNoHitters && noneRemaining && brokenThisCycle && !anyCompleted && !gamesYetToStart) {
    events.push({
      type: "all_jinxed",
      gamePk: 0,
      pitcherName: "",
      pitchingTeam: "",
      battingTeam: "",
      inning: 0,
      inningOrdinal: "",
      inningHalf: "Top",
      isPerfectGame: false,
      isCombinedNoHitter: false,
      pitcherCount: 0,
      startingPitcherName: "",
      gameDate: new Date().toISOString(),
    });
  }

  return { events, updatedState };
}
