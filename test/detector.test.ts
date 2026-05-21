import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectNoHitters } from "../src/mlb/detector.js";
import type { ScheduleGame, NoHitterState } from "../src/mlb/types.js";

import linescoreNoHitter from "./fixtures/linescore-no-hitter.json";
import linescoreNormal from "./fixtures/linescore-normal.json";
import boxscorePerfect from "./fixtures/boxscore-perfect.json";
import boxscoreWithWalk from "./fixtures/boxscore-no-hitter-with-walk.json";

vi.mock("../src/mlb/client.js", () => ({
  getLinescore: vi.fn(),
  getBoxscore: vi.fn(),
  getPlayByPlay: vi.fn(),
}));

import { getLinescore, getBoxscore, getPlayByPlay } from "../src/mlb/client.js";
const mockGetLinescore = vi.mocked(getLinescore);
const mockGetBoxscore = vi.mocked(getBoxscore);
const mockGetPlayByPlay = vi.mocked(getPlayByPlay);

function makeGame(gamePk: number, state: "Live" | "Final" = "Live"): ScheduleGame {
  return {
    gamePk,
    gameDate: "2026-05-03T23:05:00Z",
    status: {
      abstractGameState: state,
      detailedState: state === "Live" ? "In Progress" : "Final",
      statusCode: state === "Live" ? "I" : "F",
    },
    teams: {
      away: { team: { id: 119, name: "Los Angeles Dodgers" } },
      home: { team: { id: 147, name: "New York Yankees" } },
    },
  };
}

function makeState(overrides: Partial<NoHitterState> = {}): NoHitterState {
  return {
    gamePk: 12345,
    pitcherName: "Gerrit Cole",
    startingPitcherName: "Gerrit Cole",
    pitcherCount: 1,
    pitchingTeam: "New York Yankees",
    battingTeam: "Los Angeles Dodgers",
    lastReportedInning: 4,
    lastReportedHalf: "Bottom",
    lastCompletedHalves: 4,
    isPerfectGame: true,
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Clone a boxscore fixture with a different number of pitchers on a side */
function withPitcherCount(fixture: any, side: "home" | "away", count: number) {
  const clone = JSON.parse(JSON.stringify(fixture));
  const ids = Array.from({ length: count }, (_, i) => 543037 + i);
  clone.teams[side].pitchers = ids;
  // Add player entries so resolveStartingPitcher can find names
  for (let i = 0; i < ids.length; i++) {
    clone.teams[side].players[`ID${ids[i]}`] = {
      person: {
        id: ids[i],
        fullName: i === 0 ? "Gerrit Cole" : `Reliever ${i}`,
        link: `/api/v1/people/${ids[i]}`,
      },
      position: { code: "1", name: "Pitcher", type: "Pitcher", abbreviation: "P" },
      stats: {},
    };
  }
  return clone;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MIN_INNING_THRESHOLD = "1";
  mockGetPlayByPlay.mockResolvedValue({ allPlays: [] } as any);
});

describe("detectNoHitters", () => {
  it("detects a new no-hitter in progress", async () => {
    const boxscore = withPitcherCount(boxscorePerfect, "home", 1);
    mockGetLinescore.mockResolvedValue(linescoreNoHitter as any);
    mockGetBoxscore.mockResolvedValue(boxscore as any);

    const result = await detectNoHitters([makeGame(12345)], [], {});

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe("perfect_game_in_progress");
    expect(result.events[0].pitchingTeam).toBe("New York Yankees");
    expect(result.events[0].battingTeam).toBe("Los Angeles Dodgers");
    expect(result.events[0].inning).toBe(6);
    expect(result.events[0].isCombinedNoHitter).toBe(false);
    expect(result.events[0].pitcherCount).toBe(1);

    const stateKey = Object.keys(result.updatedState)[0];
    expect(result.updatedState[stateKey].pitchingTeam).toBe("New York Yankees");
    expect(result.updatedState[stateKey].pitcherCount).toBe(1);
  });

  it("attaches a video candidate for inning-complete in-progress posts", async () => {
    const boxscore = withPitcherCount(boxscorePerfect, "home", 1);
    mockGetLinescore.mockResolvedValue(linescoreNoHitter as any);
    mockGetBoxscore.mockResolvedValue(boxscore as any);
    mockGetPlayByPlay.mockResolvedValue({
      allPlays: [
        {
          result: {
            type: "atBat",
            event: "Strikeout",
            description: "Mookie Betts strikes out swinging.",
          },
          matchup: {
            batter: { fullName: "Mookie Betts" },
            pitcher: { fullName: "Gerrit Cole" },
          },
          about: {
            halfInning: "top",
            inning: 6,
            isComplete: true,
          },
          playEvents: [
            {
              details: { isInPlay: false },
              playId: "strikeout-play-id",
            },
          ],
        },
      ],
    } as any);

    const result = await detectNoHitters([makeGame(12345)], [], {});

    expect(result.events[0].videoBatterName).toBe("Mookie Betts");
    expect(result.events[0].videoPitcherName).toBe("Gerrit Cole");
    expect(result.events[0].videoPlay).toBe("Strikeout");
    expect(result.events[0].videoPlayId).toBe("strikeout-play-id");
  });

  it("detects a no-hitter with walks (not perfect)", async () => {
    mockGetLinescore.mockResolvedValue(linescoreNoHitter as any);
    mockGetBoxscore.mockResolvedValue(boxscoreWithWalk as any);

    const result = await detectNoHitters([makeGame(12345)], [], {});

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe("no_hitter_in_progress");
    expect(result.events[0].isPerfectGame).toBe(false);
  });

  it("does not emit for a normal game with hits on both sides", async () => {
    mockGetLinescore.mockResolvedValue(linescoreNormal as any);
    mockGetBoxscore.mockResolvedValue(boxscoreWithWalk as any);

    const result = await detectNoHitters([makeGame(12345)], [], {});

    expect(result.events).toHaveLength(0);
    expect(Object.keys(result.updatedState)).toHaveLength(0);
  });

  it("emits inning-advanced event when no-hitter progresses", async () => {
    const boxscore = withPitcherCount(boxscorePerfect, "home", 1);
    mockGetLinescore.mockResolvedValue(linescoreNoHitter as any);
    mockGetBoxscore.mockResolvedValue(boxscore as any);

    const result = await detectNoHitters(
      [makeGame(12345)],
      [],
      { "12345-home": makeState({ lastReportedInning: 4 }) },
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe("perfect_game_in_progress");
    expect(result.events[0].inning).toBe(6);
  });

  it("does not emit when same inning/half (dedup)", async () => {
    const boxscore = withPitcherCount(boxscorePerfect, "home", 1);
    mockGetLinescore.mockResolvedValue(linescoreNoHitter as any);
    mockGetBoxscore.mockResolvedValue(boxscore as any);

    const result = await detectNoHitters(
      [makeGame(12345)],
      [],
      { "12345-home": makeState({ lastReportedInning: 6, lastReportedHalf: "Bottom", lastCompletedHalves: 6 }) },
    );

    expect(result.events).toHaveLength(0);
    expect(Object.keys(result.updatedState)).toHaveLength(1);
  });

  it("detects a broken no-hitter", async () => {
    mockGetLinescore.mockResolvedValue(linescoreNormal as any);
    mockGetBoxscore.mockResolvedValue(boxscoreWithWalk as any);

    const result = await detectNoHitters(
      [makeGame(12345)],
      [],
      { "12345-home": makeState({ isPerfectGame: false }) },
    );

    const brokenEvents = result.events.filter((e) => e.type === "no_hitter_broken");
    expect(brokenEvents).toHaveLength(1);
    expect(brokenEvents[0].pitcherName).toBe("Gerrit Cole");
    expect(result.updatedState["12345-home"]?.broken).toBe(true);
  });

  it("detects a completed no-hitter", async () => {
    const boxscore = withPitcherCount(boxscorePerfect, "home", 1);
    mockGetLinescore.mockResolvedValue({
      ...linescoreNoHitter,
      currentInning: 9,
      currentInningOrdinal: "9th",
      inningState: "End",
    } as any);
    mockGetBoxscore.mockResolvedValue(boxscore as any);

    const result = await detectNoHitters(
      [],
      [makeGame(12345, "Final")],
      { "12345-home": makeState({ lastReportedInning: 8 }) },
    );

    const completeEvents = result.events.filter(
      (e) => e.type === "perfect_game_complete" || e.type === "no_hitter_complete",
    );
    expect(completeEvents).toHaveLength(1);
    expect(completeEvents[0].type).toBe("perfect_game_complete");
  });

  it("emits pitcher_replaced when pitcher count increases", async () => {
    const boxscore = withPitcherCount(boxscorePerfect, "home", 2);
    mockGetLinescore.mockResolvedValue(linescoreNoHitter as any);
    mockGetBoxscore.mockResolvedValue(boxscore as any);

    const result = await detectNoHitters(
      [makeGame(12345)],
      [],
      { "12345-home": makeState({ pitcherCount: 1 }) },
    );

    const replacedEvents = result.events.filter((e) => e.type === "pitcher_replaced");
    expect(replacedEvents).toHaveLength(1);
    expect(replacedEvents[0].startingPitcherName).toBe("Gerrit Cole");
    expect(replacedEvents[0].isCombinedNoHitter).toBe(true);
    expect(replacedEvents[0].pitcherCount).toBe(2);

    // Perfect game should be false now (multiple pitchers)
    expect(replacedEvents[0].isPerfectGame).toBe(false);

    // State should reflect the updated pitcher count
    expect(result.updatedState["12345-home"].pitcherCount).toBe(2);
  });

  it("marks combined no-hitter correctly after pitcher change", async () => {
    const boxscore = withPitcherCount(boxscorePerfect, "home", 2);
    mockGetLinescore.mockResolvedValue(linescoreNoHitter as any);
    mockGetBoxscore.mockResolvedValue(boxscore as any);

    const result = await detectNoHitters([makeGame(12345)], [], {});

    expect(result.events).toHaveLength(1);
    expect(result.events[0].isCombinedNoHitter).toBe(true);
    expect(result.events[0].isPerfectGame).toBe(false);
    expect(result.events[0].pitcherCount).toBe(2);
  });

  it("does not re-emit pitcher_replaced on subsequent polls", async () => {
    const boxscore = withPitcherCount(boxscorePerfect, "home", 2);
    mockGetLinescore.mockResolvedValue(linescoreNoHitter as any);
    mockGetBoxscore.mockResolvedValue(boxscore as any);

    const result = await detectNoHitters(
      [makeGame(12345)],
      [],
      { "12345-home": makeState({ pitcherCount: 2, lastReportedInning: 6, lastReportedHalf: "Bottom" }) },
    );

    expect(result.events.filter((e) => e.type === "pitcher_replaced")).toHaveLength(0);
  });

  it("does not emit all_jinxed immediately when the broken state is retained", async () => {
    mockGetLinescore.mockResolvedValue(linescoreNormal as any);
    mockGetBoxscore.mockResolvedValue(boxscoreWithWalk as any);

    const result = await detectNoHitters(
      [makeGame(12345)],
      [],
      { "12345-home": makeState({ isPerfectGame: false }) },
    );

    const allJinxed = result.events.filter((e) => e.type === "all_jinxed");
    expect(allJinxed).toHaveLength(0);
    expect(result.updatedState["12345-home"]?.broken).toBe(true);
  });

  it("does not emit all_jinxed when a no-hitter is completed", async () => {
    const boxscore = withPitcherCount(boxscorePerfect, "home", 1);
    mockGetLinescore.mockResolvedValue({
      ...linescoreNoHitter,
      currentInning: 9,
      currentInningOrdinal: "9th",
      inningState: "End",
    } as any);
    mockGetBoxscore.mockResolvedValue(boxscore as any);

    const result = await detectNoHitters(
      [],
      [makeGame(12345, "Final")],
      { "12345-home": makeState({ lastReportedInning: 8 }) },
    );

    const allJinxed = result.events.filter((e) => e.type === "all_jinxed");
    expect(allJinxed).toHaveLength(0);
  });

  it("does not emit all_jinxed when active no-hitters remain", async () => {
    const boxscore = withPitcherCount(boxscorePerfect, "home", 1);
    mockGetLinescore.mockResolvedValue(linescoreNoHitter as any);
    mockGetBoxscore.mockResolvedValue(boxscore as any);

    // Game 12345 still has an active no-hitter, game 99999 is broken
    mockGetLinescore.mockImplementation(async (gamePk: number) => {
      if (gamePk === 99999) return linescoreNormal as any;
      return linescoreNoHitter as any;
    });
    mockGetBoxscore.mockResolvedValue(boxscore as any);

    const result = await detectNoHitters(
      [makeGame(12345), makeGame(99999)],
      [],
      {
        "12345-home": makeState({ lastReportedInning: 4 }),
        "99999-home": makeState({ gamePk: 99999, isPerfectGame: false }),
      },
    );

    const allJinxed = result.events.filter((e) => e.type === "all_jinxed");
    expect(allJinxed).toHaveLength(0);
  });

  it("does not emit all_jinxed when no previous state existed", async () => {
    mockGetLinescore.mockResolvedValue(linescoreNormal as any);
    mockGetBoxscore.mockResolvedValue(boxscoreWithWalk as any);

    const result = await detectNoHitters([makeGame(12345)], [], {});

    const allJinxed = result.events.filter((e) => e.type === "all_jinxed");
    expect(allJinxed).toHaveLength(0);
  });
});
