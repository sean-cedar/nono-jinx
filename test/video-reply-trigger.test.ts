import { describe, it, expect } from "vitest";

function shouldScheduleVideoReply(eventType: string): boolean {
  return (
    eventType === "no_hitter_in_progress" ||
    eventType === "perfect_game_in_progress" ||
    eventType === "no_hitter_broken" ||
    eventType === "no_hitter_complete" ||
    eventType === "perfect_game_complete" ||
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

  it("includes in-progress and completed no-hit milestones", () => {
    expect(shouldScheduleVideoReply("no_hitter_in_progress")).toBe(true);
    expect(shouldScheduleVideoReply("perfect_game_in_progress")).toBe(true);
    expect(shouldScheduleVideoReply("no_hitter_complete")).toBe(true);
    expect(shouldScheduleVideoReply("perfect_game_complete")).toBe(true);
  });
});
