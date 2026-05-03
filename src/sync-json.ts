import "dotenv/config";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getHandles, getHashtags, hasRedisConfig } from "./state/redis.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  if (!hasRedisConfig()) {
    console.error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
    process.exit(1);
  }

  const handlesPath = resolve(__dirname, "../data/x-handles.json");
  const hashtagsPath = resolve(__dirname, "../data/team-hashtags.json");

  const handles = await getHandles();
  const hashtags = await getHashtags();

  writeFileSync(handlesPath, JSON.stringify(handles, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(handles).length} handles to ${handlesPath}`);

  writeFileSync(hashtagsPath, JSON.stringify(hashtags, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(hashtags).length} hashtags to ${hashtagsPath}`);

  console.log("Done. JSON files synced from Redis.");
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
