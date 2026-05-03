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
