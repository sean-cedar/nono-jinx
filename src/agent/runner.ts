import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { PromptConfig } from "./prompt-loader.js";
import type { NoHitterEvent } from "../mlb/types.js";
import { executeTool } from "./tools.js";
import { getHandle } from "../mlb/handles.js";
import { hasRedisConfig, getHashtags as getRedisHashtags } from "../state/redis.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let teamHashtags: Record<string, string> | null = null;
let hashtagsLoadedAt = 0;
const CACHE_TTL_MS = 120_000;

function loadHashtagsFromFile(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(__dirname, "../../data/team-hashtags.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function loadHashtags(): Promise<Record<string, string>> {
  const now = Date.now();
  if (teamHashtags && now - hashtagsLoadedAt < CACHE_TTL_MS) return teamHashtags;

  if (hasRedisConfig()) {
    try {
      teamHashtags = await getRedisHashtags();
      hashtagsLoadedAt = now;
      return teamHashtags;
    } catch {
      if (teamHashtags) return teamHashtags;
    }
  }

  teamHashtags = loadHashtagsFromFile();
  hashtagsLoadedAt = now;
  return teamHashtags;
}

async function getTeamHashtag(teamName: string): Promise<string | null> {
  const hashtags = await loadHashtags();
  return hashtags[teamName] ?? null;
}

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (openaiClient) return openaiClient;
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

function buildToolDefs(prompt: PromptConfig): ChatCompletionTool[] {
  return prompt.tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

async function buildUserMessage(event: NoHitterEvent): Promise<string> {
  if (event.type === "all_jinxed") {
    return [
      "Event: all_jinxed",
      "All no-hitters today have been broken up. Not a single one survived.",
      "Craft a celebratory end-of-day post.",
    ].join("\n");
  }

  const lines = [
    `Event: ${event.type}`,
    `Game PK: ${event.gamePk}`,
    `Current Pitcher: ${event.pitcherName}`,
    `Starting Pitcher: ${event.startingPitcherName}`,
    `Pitching Team: ${event.pitchingTeam}`,
    `Batting Team: ${event.battingTeam}`,
    `Inning: ${event.inningHalf} of the ${event.inningOrdinal}`,
    `Perfect Game: ${event.isPerfectGame ? "Yes" : "No"}`,
    `Combined No-Hitter: ${event.isCombinedNoHitter ? "Yes" : "No"}`,
    `Pitchers Used: ${event.pitcherCount}`,
  ];
  if (event.pitchCount !== undefined) lines.push(`Pitch Count: ${event.pitchCount}`);
  if (event.strikeouts !== undefined) lines.push(`Strikeouts: ${event.strikeouts}`);
  if (event.breakupBatter && event.breakupPlay) {
    lines.push(`Breakup Hit: ${event.breakupPlay} by ${event.breakupBatter}`);
  }
  if (event.breakupDescription) {
    lines.push(`Play Description: ${event.breakupDescription}`);
  }

  const currentHandle = await getHandle(event.pitcherName);
  const starterHandle = await getHandle(event.startingPitcherName);
  if (currentHandle) lines.push(`Current Pitcher X Handle: @${currentHandle}`);
  if (starterHandle && event.startingPitcherName !== event.pitcherName) {
    lines.push(`Starting Pitcher X Handle: @${starterHandle}`);
  }

  const pitchingTag = await getTeamHashtag(event.pitchingTeam);
  const battingTag = await getTeamHashtag(event.battingTeam);
  const tags = [pitchingTag, battingTag].filter(Boolean);
  if (tags.length > 0) lines.push(`Game Hashtags: ${tags.join(" ")}`);

  return lines.join("\n");
}

const MAX_TOOL_ROUNDS = 3;

export async function runAgentWithMessage(
  prompt: PromptConfig,
  userMessage: string,
): Promise<{ posted: boolean; text?: string }> {
  const openai = getOpenAI();
  const tools = buildToolDefs(prompt);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: prompt.systemPrompt },
    { role: "user", content: userMessage },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await openai.chat.completions.create({
      model: prompt.model,
      temperature: prompt.temperature,
      max_tokens: prompt.max_tokens,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    });

    const choice = response.choices[0];
    if (!choice) {
      console.error("No choice returned from LLM");
      return { posted: false };
    }

    const message = choice.message;
    messages.push(message);

    if (choice.finish_reason === "stop" || !message.tool_calls?.length) {
      console.warn("Agent finished without tool calls. Response:", message.content);
      return { posted: false, text: message.content ?? undefined };
    }

    for (const toolCall of message.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments);
      console.log(`Tool call: ${toolCall.function.name}(${JSON.stringify(args)})`);

      const result = await executeTool(toolCall.function.name, args);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });

      if (toolCall.function.name === "post_to_x" && result.success) {
        return { posted: true, text: args.text };
      }
    }
  }

  console.warn("Agent exhausted tool rounds without posting");
  return { posted: false };
}

export async function runAgent(
  prompt: PromptConfig,
  event: NoHitterEvent,
): Promise<{ posted: boolean; text?: string }> {
  return runAgentWithMessage(prompt, await buildUserMessage(event));
}
