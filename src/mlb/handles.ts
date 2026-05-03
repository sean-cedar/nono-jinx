import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hasRedisConfig, getHandles as getRedisHandles } from "../state/redis.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HANDLES_PATH = resolve(__dirname, "../../data/x-handles.json");

let handleMap: Record<string, string> | null = null;
let lastLoadedAt = 0;
const CACHE_TTL_MS = 120_000; // refresh from Redis every 2 minutes

function loadFromFile(): Record<string, string> {
  try {
    const raw = readFileSync(HANDLES_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function loadHandles(): Promise<Record<string, string>> {
  const now = Date.now();
  if (handleMap && now - lastLoadedAt < CACHE_TTL_MS) return handleMap;

  if (hasRedisConfig()) {
    try {
      handleMap = await getRedisHandles();
      lastLoadedAt = now;
      return handleMap;
    } catch {
      if (handleMap) return handleMap;
    }
  }

  handleMap = loadFromFile();
  lastLoadedAt = now;
  return handleMap;
}

export async function resolvePlayerTag(fullName: string): Promise<string> {
  const handles = await loadHandles();
  const handle = handles[fullName];
  if (handle) return `@${handle}`;
  return fullName;
}

export async function getHandle(fullName: string): Promise<string | null> {
  const handles = await loadHandles();
  return handles[fullName] ?? null;
}
