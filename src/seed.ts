import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setHandles, setHashtags } from "./state/redis.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in .env");
    process.exit(1);
  }

  const handlesPath = resolve(__dirname, "../data/x-handles.json");
  const hashtagsPath = resolve(__dirname, "../data/team-hashtags.json");

  const handles = JSON.parse(readFileSync(handlesPath, "utf-8"));
  const hashtags = JSON.parse(readFileSync(hashtagsPath, "utf-8"));

  console.log(`Seeding ${Object.keys(handles).length} player handles...`);
  await setHandles(handles);

  console.log(`Seeding ${Object.keys(hashtags).length} team hashtags...`);
  await setHashtags(hashtags);

  console.log("Done. Data is now in Redis.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
