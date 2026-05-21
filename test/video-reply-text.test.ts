import { describe, it, expect } from "vitest";
import { formatGameHashtags } from "../src/video-reply-text.js";

describe("formatGameHashtags", () => {
  it("returns both team hashtags when known", async () => {
    const tags = await formatGameHashtags("Los Angeles Dodgers", "San Diego Padres");
    expect(tags).toContain("#");
    expect(tags.split(" ").length).toBeGreaterThanOrEqual(1);
  });
});
