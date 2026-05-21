import { describe, it, expect } from "vitest";

function shouldScheduleVideoReply(eventType: string): boolean {
  return (
    eventType === "no_hitter_broken" ||
    eventType === "scoring_change_hit" ||
    eventType === "perfect_game_broken"
  );
}

describe("video reply trigger coverage", () => {
  it("includes perfect_game_broken events", () => {
    expect(shouldScheduleVideoReply("perfect_game_broken")).toBe(true);
  });

  it("still includes broken no-hitters and scoring changes", () => {
    expect(shouldScheduleVideoReply("no_hitter_broken")).toBe(true);
    expect(shouldScheduleVideoReply("scoring_change_hit")).toBe(true);
  });
});
