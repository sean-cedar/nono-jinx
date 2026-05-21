import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { loadPrompt } from "./agent/prompt-loader.js";
import { hasRedisConfig, getHashtags as getRedisHashtags } from "./state/redis.js";
import type { VideoReplyJob } from "./state/redis.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FALLBACK_QUIPS = [
  "The receipts.",
  "Footage of the crime.",
  "Roll the tape.",
  "The evidence.",
  "Watch it again.",
  "In case you missed it.",
];

let teamHashtags: Record<string, string> | null = null;
let hashtagsLoadedAt = 0;
const CACHE_TTL_MS = 120_000;

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (openaiClient) return openaiClient;
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

function loadHashtagsFromFile(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(__dirname, "../data/team-hashtags.json"), "utf-8");
    return JSON.parse(raw) as Record<string, string>;
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

export async function formatGameHashtags(
  pitchingTeam?: string,
  battingTeam?: string,
): Promise<string> {
  const hashtags = await loadHashtags();
  const tags = [pitchingTeam, battingTeam]
    .map((team) => (team ? hashtags[team] : null))
    .filter((tag): tag is string => !!tag);
  return tags.join(" ");
}

function randomFallbackQuip(): string {
  return FALLBACK_QUIPS[Math.floor(Math.random() * FALLBACK_QUIPS.length)]!;
}

function buildUserMessage(job: VideoReplyJob, gameHashtags: string): string {
  const lines = [
    "Write the video reply caption for this clip.",
    `Event: ${job.eventType}`,
    `Batter: ${job.batterName}`,
  ];
  if (job.pitcherName) lines.push(`Pitcher: ${job.pitcherName}`);
  if (job.breakupPlay) lines.push(`Play: ${job.breakupPlay}`);
  if (job.breakupDescription) lines.push(`Description: ${job.breakupDescription}`);
  if (job.pitchingTeam) lines.push(`Pitching Team: ${job.pitchingTeam}`);
  if (job.battingTeam) lines.push(`Batting Team: ${job.battingTeam}`);
  if (gameHashtags) lines.push(`Game Hashtags: ${gameHashtags}`);
  return lines.join("\n");
}

function appendHashtags(text: string, gameHashtags: string): string {
  if (!gameHashtags || text.includes(gameHashtags)) return text;
  return `${text} ${gameHashtags}`.trim();
}

/**
 * Generate varied video-reply text via LLM (temperature-sampled), like main jinx posts.
 * Falls back to a random canned quip if the API is unavailable.
 */
export async function generateVideoReplyText(job: VideoReplyJob): Promise<string> {
  const gameHashtags = await formatGameHashtags(job.pitchingTeam, job.battingTeam);

  if (!process.env.OPENAI_API_KEY) {
    const quip = randomFallbackQuip();
    return gameHashtags ? appendHashtags(quip, gameHashtags) : quip;
  }

  try {
    const prompt = loadPrompt("jinx-video-reply.md");
    const response = await getOpenAI().chat.completions.create({
      model: prompt.model,
      temperature: prompt.temperature,
      max_tokens: prompt.max_tokens,
      messages: [
        { role: "system", content: prompt.systemPrompt },
        { role: "user", content: buildUserMessage(job, gameHashtags) },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim().replace(/^["']|["']$/g, "");
    if (raw && raw.length > 0 && raw.length <= 280) {
      return gameHashtags ? appendHashtags(raw, gameHashtags) : raw;
    }
  } catch (err) {
    console.error("Video reply caption generation failed:", err);
  }

  const quip = randomFallbackQuip();
  return gameHashtags ? appendHashtags(quip, gameHashtags) : quip;
}
