import { describe, it, expect } from "vitest";
import { tallyBoxscoreSides } from "../lib-stats/ledger-tally";

function box(
  awayHits: number,
  homeHits: number,
  awayPitchers = 1,
  homePitchers = 1,
) {
  return {
    teams: {
      away: {
        team: { name: "Away" },
        teamStats: { batting: { hits: awayHits } },
        pitchers: Array.from({ length: awayPitchers }, (_, i) => i + 1),
      },
      home: {
        team: { name: "Home" },
        teamStats: { batting: { hits: homeHits } },
        pitchers: Array.from({ length: homePitchers }, (_, i) => i + 100),
      },
    },
  };
}

describe("tallyBoxscoreSides", () => {
  it("counts both sides as jinxed when each team got a hit", () => {
    expect(tallyBoxscoreSides(box(5, 3))).toEqual({
      jinxed: 2,
      completed: 0,
      survivedIsCombined: false,
    });
  });

  it("counts a solo no-hitter as survived without combined flag", () => {
    expect(tallyBoxscoreSides(box(0, 4, 1, 1))).toEqual({
      jinxed: 1,
      completed: 1,
      survivedIsCombined: false,
    });
  });

  it("flags team/combined no-hitters when multiple pitchers threw", () => {
    expect(tallyBoxscoreSides(box(0, 2, 1, 3))).toEqual({
      jinxed: 1,
      completed: 1,
      survivedIsCombined: true,
    });
  });
});
