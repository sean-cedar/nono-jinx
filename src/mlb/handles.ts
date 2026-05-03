import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HANDLES_PATH = resolve(__dirname, "../../data/x-handles.json");

let handleMap: Record<string, string> | null = null;

function loadHandles(): Record<string, string> {
  if (handleMap) return handleMap;
  try {
    const raw = readFileSync(HANDLES_PATH, "utf-8");
    handleMap = JSON.parse(raw);
    return handleMap!;
  } catch {
    handleMap = {};
    return handleMap;
  }
}

/**
 * Look up a player's verified X handle.
 * Returns "@Handle" if found, or the player's full name if not.
 */
export function resolvePlayerTag(fullName: string): string {
  const handles = loadHandles();
  const handle = handles[fullName];
  if (handle) return `@${handle}`;
  return fullName;
}

/**
 * Returns the handle without @ prefix, or null if not found.
 */
export function getHandle(fullName: string): string | null {
  const handles = loadHandles();
  return handles[fullName] ?? null;
}
