import { describe, it, expect } from "vitest";
import { loadPrompt, loadPromptForEvent } from "../src/agent/prompt-loader.js";

describe("prompt-loader", () => {
  it("loads jinx-in-progress.md with correct frontmatter", () => {
    const prompt = loadPrompt("jinx-in-progress.md");

    expect(prompt.model).toBe("gpt-4o-mini");
    expect(prompt.temperature).toBe(0.9);
    expect(prompt.max_tokens).toBe(512);
    expect(prompt.tools).toHaveLength(2);
    expect(prompt.tools[0].name).toBe("get_no_hitter_context");
    expect(prompt.tools[1].name).toBe("post_to_x");
    expect(prompt.systemPrompt).toContain("No No Jinx");
    expect(prompt.systemPrompt).toContain("JINX");
  });

  it("loads jinx-broken.md", () => {
    const prompt = loadPrompt("jinx-broken.md");

    expect(prompt.tools).toHaveLength(1);
    expect(prompt.tools[0].name).toBe("post_to_x");
    expect(prompt.systemPrompt).toContain("BROKEN UP");
  });

  it("loads jinx-complete.md", () => {
    const prompt = loadPrompt("jinx-complete.md");

    expect(prompt.tools).toHaveLength(1);
    expect(prompt.tools[0].name).toBe("post_to_x");
    expect(prompt.systemPrompt).toContain("COMPLETED");
  });

  it("loads jinx-pitcher-replaced.md", () => {
    const prompt = loadPrompt("jinx-pitcher-replaced.md");

    expect(prompt.tools).toHaveLength(1);
    expect(prompt.tools[0].name).toBe("post_to_x");
    expect(prompt.systemPrompt).toContain("PULLED");
  });

  it("maps event types to correct prompt files", () => {
    const inProgress = loadPromptForEvent("no_hitter_in_progress");
    expect(inProgress.systemPrompt).toContain("JINX");

    const perfect = loadPromptForEvent("perfect_game_in_progress");
    expect(perfect.systemPrompt).toContain("JINX");

    const broken = loadPromptForEvent("no_hitter_broken");
    expect(broken.systemPrompt).toContain("BROKEN");

    const complete = loadPromptForEvent("no_hitter_complete");
    expect(complete.systemPrompt).toContain("COMPLETED");

    const perfectComplete = loadPromptForEvent("perfect_game_complete");
    expect(perfectComplete.systemPrompt).toContain("COMPLETED");

    const replaced = loadPromptForEvent("pitcher_replaced");
    expect(replaced.systemPrompt).toContain("PULLED");
  });

  it("throws for unknown event type", () => {
    expect(() => loadPromptForEvent("unknown_event")).toThrow(
      "No prompt file mapped for event type: unknown_event",
    );
  });
});
