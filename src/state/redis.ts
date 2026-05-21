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

export async function clearPosted(eventKey: string): Promise<void> {
  if (!hasRedisConfig()) return;
  const redis = await getRedis();
  await redis.del(`nonojinx:posted:${eventKey}`);
}

const VIDEO_REPLY_JOB_LIST_KEY = "nonojinx:video-reply:pending";
const VIDEO_REPLY_JOB_KEY_PREFIX = "nonojinx:video-reply:job:";
const VIDEO_REPLY_LOG_KEY = "nonojinx:video-reply:log";
const VIDEO_REPLY_LOG_MAX = 500;
const VIDEO_REPLY_JOB_TTL = 24 * 60 * 60;

export interface VideoReplyJob {
  gamePk: number;
  batterName: string;
  pitchingTeam?: string;
  battingTeam?: string;
  pitcherName?: string;
  breakupPlay?: string;
  breakupDescription?: string;
  breakupPlayId?: string;
  originalTweetId: string;
  eventType: string;
  attempts: number;
  createdAt: string;
  lastAttemptAt?: string;
}

export interface VideoReplyLogEntry {
  timestamp: string;
  originalTweetId: string;
  gamePk: number;
  batterName: string;
  stage:
    | "scheduled"
    | "resumed"
    | "attempt"
    | "highlight_found"
    | "highlight_missing"
    | "upload_failed"
    | "reply_posted"
    | "reply_failed"
    | "exhausted";
  message: string;
  meta?: Record<string, unknown>;
}

function videoReplyJobKey(originalTweetId: string): string {
  return `${VIDEO_REPLY_JOB_KEY_PREFIX}${originalTweetId}`;
}

export async function enqueuePendingVideoReply(job: VideoReplyJob): Promise<void> {
  if (!hasRedisConfig()) return;
  const redis = await getRedis();
  const key = videoReplyJobKey(job.originalTweetId);
  const existing = await redis.get<VideoReplyJob>(key);
  await redis.set(key, job, { ex: VIDEO_REPLY_JOB_TTL });
  if (!existing) {
    await redis.lpush(VIDEO_REPLY_JOB_LIST_KEY, job.originalTweetId);
  }
}

export async function updatePendingVideoReply(job: VideoReplyJob): Promise<void> {
  if (!hasRedisConfig()) return;
  const redis = await getRedis();
  await redis.set(videoReplyJobKey(job.originalTweetId), job, { ex: VIDEO_REPLY_JOB_TTL });
}

export async function removePendingVideoReply(originalTweetId: string): Promise<void> {
  if (!hasRedisConfig()) return;
  const redis = await getRedis();
  await redis.del(videoReplyJobKey(originalTweetId));
  await redis.lrem(VIDEO_REPLY_JOB_LIST_KEY, 0, originalTweetId);
}

export async function getPendingVideoReplies(limit = 100): Promise<VideoReplyJob[]> {
  if (!hasRedisConfig()) return [];
  const redis = await getRedis();
  const ids = await redis.lrange<string>(VIDEO_REPLY_JOB_LIST_KEY, 0, limit - 1);
  const jobs = await Promise.all(
    ids.map((id) => redis.get<VideoReplyJob>(videoReplyJobKey(id))),
  );
  return jobs.filter((job): job is VideoReplyJob => job !== null);
}

export async function logVideoReply(entry: VideoReplyLogEntry): Promise<void> {
  if (!hasRedisConfig()) return;
  const redis = await getRedis();
  await redis.lpush(VIDEO_REPLY_LOG_KEY, JSON.stringify(entry));
  await redis.ltrim(VIDEO_REPLY_LOG_KEY, 0, VIDEO_REPLY_LOG_MAX - 1);
}
