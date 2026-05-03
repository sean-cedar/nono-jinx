import type { NoHitterState } from "../mlb/types.js";

export interface StateStore {
  load(): Promise<Record<string, NoHitterState>>;
  save(state: Record<string, NoHitterState>): Promise<void>;
}

/**
 * In-memory store for local development and testing.
 */
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

/**
 * DynamoDB-backed store (kept for AWS Lambda deployments).
 */
export class DynamoStore implements StateStore {
  private tableName: string;
  private client: import("@aws-sdk/lib-dynamodb").DynamoDBDocumentClient | null = null;

  constructor(tableName?: string) {
    this.tableName = tableName ?? process.env.DYNAMODB_TABLE_NAME ?? "nonojinx-state";
  }

  private async getClient() {
    if (this.client) return this.client;
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");
    const raw = new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" });
    this.client = DynamoDBDocumentClient.from(raw);
    return this.client;
  }

  async load(): Promise<Record<string, NoHitterState>> {
    const client = await this.getClient();
    const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
    const result = await client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: dateKey() },
      }),
    );
    if (!result.Item?.state) return {};
    return result.Item.state as Record<string, NoHitterState>;
  }

  async save(state: Record<string, NoHitterState>): Promise<void> {
    const client = await this.getClient();
    const { PutCommand } = await import("@aws-sdk/lib-dynamodb");
    await client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: dateKey(),
          state,
          updatedAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 86400 * 2,
        },
      }),
    );
  }
}

export function createStore(): StateStore {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.log("Using Upstash Redis state store");
    return new RedisStore();
  }
  if (process.env.USE_DYNAMODB === "true" && process.env.DYNAMODB_TABLE_NAME) {
    console.log("Using DynamoDB state store");
    return new DynamoStore();
  }
  console.log("Using in-memory state store");
  return new MemoryStore();
}
