import { Redis } from "@upstash/redis";

let client: Redis | null = null;

function getRedis(): Redis {
  if (client) return client;
  const url = import.meta.env.UPSTASH_REDIS_REST_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = import.meta.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
  client = new Redis({ url, token });
  return client;
}

const HANDLES_KEY = "nonojinx:handles";
const HASHTAGS_KEY = "nonojinx:hashtags";

export async function getHandles(): Promise<Record<string, string>> {
  const data = await getRedis().get<Record<string, string>>(HANDLES_KEY);
  return data ?? {};
}

export async function setHandles(data: Record<string, string>): Promise<void> {
  await getRedis().set(HANDLES_KEY, data);
}

export async function getHashtags(): Promise<Record<string, string>> {
  const data = await getRedis().get<Record<string, string>>(HASHTAGS_KEY);
  return data ?? {};
}

export async function setHashtags(data: Record<string, string>): Promise<void> {
  await getRedis().set(HASHTAGS_KEY, data);
}

const HISTORY_KEY = "nonojinx:history";
const STATS_JINXED_KEY = "nonojinx:stats:jinxed";
const STATS_COMPLETED_KEY = "nonojinx:stats:completed";

export interface PostHistoryEntry {
  timestamp: string;
  eventType: string;
  pitcherName: string;
  pitchingTeam: string;
  battingTeam: string;
  inning: string;
  tweetText: string;
}

export async function getPostHistory(limit = 10): Promise<PostHistoryEntry[]> {
  const raw = await getRedis().lrange<string>(HISTORY_KEY, 0, limit - 1);
  return raw.map((item) => typeof item === "string" ? JSON.parse(item) : item as unknown as PostHistoryEntry);
}

export async function getStats(): Promise<{ jinxed: number; completed: number; jinxRate: number }> {
  const redis = getRedis();
  const [jinxed, completed] = await Promise.all([
    redis.get<number>(STATS_JINXED_KEY),
    redis.get<number>(STATS_COMPLETED_KEY),
  ]);
  const j = jinxed ?? 0;
  const c = completed ?? 0;
  const total = j + c;
  const jinxRate = total > 0 ? Math.round((j / total) * 100) : 0;
  return { jinxed: j, completed: c, jinxRate };
}
