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

// Post history — stored as a Redis list, newest first, capped at 500 entries
const HISTORY_KEY = "nonojinx:history";
const HISTORY_MAX = 500;

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

// Stats counters — atomic increments for accurate lifetime stats
const STATS_JINXED_KEY = "nonojinx:stats:jinxed";
const STATS_COMPLETED_KEY = "nonojinx:stats:completed";

export async function incrementJinxCount(): Promise<void> {
  if (!hasRedisConfig()) return;
  const redis = await getRedis();
  await redis.incr(STATS_JINXED_KEY);
}

export async function incrementCompletedCount(): Promise<void> {
  if (!hasRedisConfig()) return;
  const redis = await getRedis();
  await redis.incr(STATS_COMPLETED_KEY);
}

export async function getStatsCounters(): Promise<{ jinxed: number; completed: number }> {
  const redis = await getRedis();
  const [jinxed, completed] = await Promise.all([
    redis.get<number>(STATS_JINXED_KEY),
    redis.get<number>(STATS_COMPLETED_KEY),
  ]);
  return { jinxed: jinxed ?? 0, completed: completed ?? 0 };
}

// Deduplication — prevent double-posting for the same pitcher/inning combination.
// Keys expire after 6 hours (well beyond a single game).
const DEDUP_TTL = 6 * 60 * 60;

export async function hasPosted(eventKey: string): Promise<boolean> {
  if (!hasRedisConfig()) return false;
  const redis = await getRedis();
  const val = await redis.get(`nonojinx:posted:${eventKey}`);
  return val !== null;
}

export async function markPosted(eventKey: string, ttl?: number): Promise<void> {
  if (!hasRedisConfig()) return;
  const redis = await getRedis();
  await redis.set(`nonojinx:posted:${eventKey}`, "1", { ex: ttl ?? DEDUP_TTL });
}
