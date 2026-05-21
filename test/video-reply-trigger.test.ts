import { describe, it, expect } from "vitest";
import { shouldScheduleVideoReply } from "../src/video-reply.js";

describe("shouldScheduleVideoReply", () => {
  it("includes hit-based no-hitter breakups", () => {
    expect(shouldScheduleVideoReply("no_hitter_broken", "Home Run")).toBe(true);
    expect(shouldScheduleVideoReply("no_hitter_broken", "Single")).toBe(true);
  });

  it("excludes non-hit no-hitter breakups", () => {
    expect(shouldScheduleVideoReply("no_hitter_broken", "Walk")).toBe(false);
  });

  it("includes scoring changes and completed milestones", () => {
    expect(shouldScheduleVideoReply("scoring_change_hit")).toBe(true);
    expect(shouldScheduleVideoReply("no_hitter_complete")).toBe(true);
    expect(shouldScheduleVideoReply("perfect_game_complete")).toBe(true);
  });

  it("excludes in-progress and perfect-game-broken events", () => {
    expect(shouldScheduleVideoReply("no_hitter_in_progress")).toBe(false);
    expect(shouldScheduleVideoReply("perfect_game_in_progress")).toBe(false);
    expect(shouldScheduleVideoReply("perfect_game_broken")).toBe(false);
    expect(shouldScheduleVideoReply("perfect_game_broken", "Walk")).toBe(false);
  });
});
