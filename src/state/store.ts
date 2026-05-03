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

/**
 * DynamoDB-backed store for production use.
 * Stores the entire state map as a single item keyed by date.
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

  private dateKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  async load(): Promise<Record<string, NoHitterState>> {
    const client = await this.getClient();
    const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
    const result = await client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: this.dateKey() },
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
          pk: this.dateKey(),
          state,
          updatedAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 86400 * 2,
        },
      }),
    );
  }
}

export function createStore(): StateStore {
  if (process.env.USE_DYNAMODB === "true" && process.env.DYNAMODB_TABLE_NAME) {
    return new DynamoStore();
  }
  return new MemoryStore();
}
