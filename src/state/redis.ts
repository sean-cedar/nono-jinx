import type { Redis } from "@upstash/redis";

let client: Redis | null = null;

export async function getRedis(): Promise<Redis> {
  if (client) return client;
  const { Redis } = await import("@upstash/redis");
  client = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  return client;
}

export function hasRedisConfig(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

const HANDLES_KEY = "nonojinx:handles";
const HASHTAGS_KEY = "nonojinx:hashtags";

export async function getHandles(): Promise<Record<string, string>> {
  const redis = await getRedis();
  const data = await redis.get<Record<string, string>>(HANDLES_KEY);
  return data ?? {};
}

export async function setHandles(data: Record<string, string>): Promise<void> {
  const redis = await getRedis();
  await redis.set(HANDLES_KEY, data);
}

export async function getHashtags(): Promise<Record<string, string>> {
  const redis = await getRedis();
  const data = await redis.get<Record<string, string>>(HASHTAGS_KEY);
  return data ?? {};
}

export async function setHashtags(data: Record<string, string>): Promise<void> {
  const redis = await getRedis();
  await redis.set(HASHTAGS_KEY, data);
}

// Post history — stored as a Redis list, newest first, capped at 100 entries
const HISTORY_KEY = "nonojinx:history";
const HISTORY_MAX = 100;

export interface PostHistoryEntry {
  timestamp: string;
  eventType: string;
  pitcherName: string;
  pitchingTeam: string;
  battingTeam: string;
  inning: string;
  tweetText: string;
}

export async function logPost(entry: PostHistoryEntry): Promise<void> {
  const redis = await getRedis();
  await redis.lpush(HISTORY_KEY, JSON.stringify(entry));
  await redis.ltrim(HISTORY_KEY, 0, HISTORY_MAX - 1);
}

export async function getPostHistory(limit = 20): Promise<PostHistoryEntry[]> {
  const redis = await getRedis();
  const raw = await redis.lrange<string>(HISTORY_KEY, 0, limit - 1);
  return raw.map((item) => typeof item === "string" ? JSON.parse(item) : item as unknown as PostHistoryEntry);
}
