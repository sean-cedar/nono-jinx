import { describe, it, expect, vi, beforeEach } from "vitest";
import { findBreakupHighlight } from "../src/mlb/highlights.js";

describe("findBreakupHighlight", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when the deterministic playId does not match any highlight guid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: {
          highlights: {
            items: [
              {
                title: "Shohei Ohtani steals second",
                description: "Shohei Ohtani steals second base in the 3rd inning",
                playbacks: [{ name: "mp4Avc", url: "https://example.com/steal.mp4" }],
              },
              {
                title: "Shohei Ohtani's RBI forceout",
                description: "Shohei Ohtani hits into a forceout and ties the game",
                playbacks: [{ name: "mp4Avc", url: "https://example.com/forceout.mp4" }],
              },
            ],
          },
        },
      }),
    } as Response);

    const result = await findBreakupHighlight(123, "missing-guid");
    expect(result).toBeNull();
  });

  it("uses deterministic playId to match the correct highlight guid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: {
          highlights: {
            items: [
              {
                guid: "other-guid",
                title: "Shohei Ohtani steals second",
                description: "Shohei Ohtani steals second base in the 3rd inning",
                playbacks: [{ name: "mp4Avc", url: "https://example.com/steal.mp4" }],
              },
              {
                guid: "target-guid",
                title: "Shohei Ohtani's RBI forceout",
                description: "Shohei Ohtani hits into a forceout and ties the game",
                playbacks: [{ name: "mp4Avc", url: "https://example.com/forceout.mp4" }],
              },
            ],
          },
        },
      }),
    } as Response);

    const result = await findBreakupHighlight(123, "target-guid");
    expect(result).toBe("https://example.com/forceout.mp4");
  });
});
