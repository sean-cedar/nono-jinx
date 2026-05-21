import { describe, it, expect, vi, beforeEach } from "vitest";
import { findBreakupHighlight, findHomerHighlightFallback } from "../src/mlb/highlights.js";

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

  it("findHomerHighlightFallback matches batter name and homer keywords only", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: {
          highlights: {
            items: [
              {
                title: "Spencer Horwitz's solo homer (4)",
                description: "Horwitz belts a solo home run to right",
                playbacks: [{ name: "mp4Avc", url: "https://example.com/homer.mp4" }],
              },
              {
                title: "Spencer Horwitz singles",
                description: "Spencer Horwitz singles to left",
                playbacks: [{ name: "mp4Avc", url: "https://example.com/single.mp4" }],
              },
            ],
          },
        },
      }),
    } as Response);

    const result = await findHomerHighlightFallback(123, "Spencer Horwitz");
    expect(result).toBe("https://example.com/homer.mp4");
  });

  it("findHomerHighlightFallback returns null when no homer keyword match", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        highlights: {
          highlights: {
            items: [
              {
                title: "Spencer Horwitz singles",
                description: "Spencer Horwitz singles to left",
                playbacks: [{ name: "mp4Avc", url: "https://example.com/single.mp4" }],
              },
            ],
          },
        },
      }),
    } as Response);

    const result = await findHomerHighlightFallback(123, "Spencer Horwitz");
    expect(result).toBeNull();
  });
});
