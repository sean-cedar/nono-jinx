import type { NoHitterState } from "../mlb/types.js";

export interface StateStore {
  load(): Promise<Record<string, NoHitterState>>;
  save(state: Record<string, NoHitterState>): Promise<void>;
}

export class MemoryStore implements StateStore {
  private state: Record<string, NoHitterState> = {};

  async load(): Promise<Record<string, NoHitterState>> {
    return { ...this.state };
  }

  async save(state: Record<string, NoHitterState>): Promise<void> {
    this.state = { ...state };
  }
}

function dateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `nonojinx:${y}-${m}-${d}`;
}

/**
 * Upstash Redis-backed store for production.
 * Stores the state map as a JSON string keyed by date, with a 48-hour TTL.
 */
export class RedisStore implements StateStore {
  private client: import("@upstash/redis").Redis | null = null;

  private async getClient() {
    if (this.client) return this.client;
    const { Redis } = await import("@upstash/redis");
    this.client = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    return this.client;
  }

  async load(): Promise<Record<string, NoHitterState>> {
    const redis = await this.getClient();
    const data = await redis.get<Record<string, NoHitterState>>(dateKey());
    return data ?? {};
  }

  async save(state: Record<string, NoHitterState>): Promise<void> {
    const redis = await this.getClient();
    await redis.set(dateKey(), state, { ex: 86400 * 2 });
  }
}

export function createStore(): StateStore {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.log("Using Upstash Redis state store");
    return new RedisStore();
  }
  console.log("Using in-memory state store");
  return new MemoryStore();
}
