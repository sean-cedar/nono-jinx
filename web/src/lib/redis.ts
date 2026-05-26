import { Redis } from "@upstash/redis";
import { computeJinxRate } from "./jinx-rate";

let client: Redis | null = null;

export function getRedis(): Redis {
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

const HISTORY_MAX = 500;

export async function logPost(entry: PostHistoryEntry): Promise<void> {
  const redis = getRedis();
  await redis.lpush(HISTORY_KEY, JSON.stringify(entry));
  await redis.ltrim(HISTORY_KEY, 0, HISTORY_MAX - 1);
}

export async function getPostHistory(limit = 10): Promise<PostHistoryEntry[]> {
  const raw = await getRedis().lrange<string>(HISTORY_KEY, 0, limit - 1);
  return raw.map((item) => typeof item === "string" ? JSON.parse(item) : item as unknown as PostHistoryEntry);
}

export async function getActiveNoHitterCount(): Promise<number> {
  const redis = getRedis();
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const key = `nonojinx:${dateStr}`;
  const data = await redis.get<Record<string, { broken?: boolean }>>(key);
  if (!data || typeof data !== "object") return 0;
  return Object.values(data).filter((entry) => !entry?.broken).length;
}

import { computeLedgerStats, type LedgerOutcome } from "./ledger-stats";

const LEDGER_CACHE_KEY = "nonojinx:ledger-stats:v1";
const LEDGER_CACHE_TTL_SEC = 900;

export interface SiteStats extends LedgerOutcome {
  inProgress: number;
}

async function getCachedLedgerStats(): Promise<LedgerOutcome> {
  const redis = getRedis();
  const cached = await redis.get<LedgerOutcome>(LEDGER_CACHE_KEY);
  if (cached) return cached;

  const computed = await computeLedgerStats();
  await redis.set(LEDGER_CACHE_KEY, computed, { ex: LEDGER_CACHE_TTL_SEC });
  return computed;
}

async function getLedgerStatsWithFallback(): Promise<LedgerOutcome> {
  const redis = getRedis();
  try {
    return await getCachedLedgerStats();
  } catch {
    const stale = await redis.get<LedgerOutcome>(LEDGER_CACHE_KEY);
    if (stale) return stale;

    const [jinxed, completed] = await Promise.all([
      redis.get<number>(STATS_JINXED_KEY),
      redis.get<number>(STATS_COMPLETED_KEY),
    ]);
    const j = jinxed ?? 0;
    const c = completed ?? 0;
    return {
      jinxed: j,
      completed: c,
      jinxRate: computeJinxRate(j, c),
      survivedIsCombined: c > 0,
    };
  }
}

export async function getStats(): Promise<SiteStats> {
  const [ledger, inProgress] = await Promise.all([
    getLedgerStatsWithFallback(),
    getActiveNoHitterCount(),
  ]);
  return { ...ledger, inProgress };
}
