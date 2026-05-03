import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

export interface ToolParameterProperty {
  type: string;
  description?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

export interface PromptConfig {
  model: string;
  temperature: number;
  max_tokens: number;
  tools: ToolDefinition[];
  systemPrompt: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "../../prompts");

export function loadPrompt(filename: string): PromptConfig {
  const filePath = resolve(PROMPTS_DIR, filename);
  const raw = readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  return {
    model: data.model ?? "gpt-4o-mini",
    temperature: data.temperature ?? 0.9,
    max_tokens: data.max_tokens ?? 280,
    tools: (data.tools ?? []) as ToolDefinition[],
    systemPrompt: content.trim(),
  };
}

const EVENT_TO_PROMPT: Record<string, string> = {
  no_hitter_in_progress: "jinx-in-progress.md",
  perfect_game_in_progress: "jinx-in-progress.md",
  no_hitter_broken: "jinx-broken.md",
  no_hitter_complete: "jinx-complete.md",
  perfect_game_complete: "jinx-complete.md",
  pitcher_replaced: "jinx-pitcher-replaced.md",
};

export function loadPromptForEvent(eventType: string): PromptConfig {
  const filename = EVENT_TO_PROMPT[eventType];
  if (!filename) {
    throw new Error(`No prompt file mapped for event type: ${eventType}`);
  }
  return loadPrompt(filename);
}
