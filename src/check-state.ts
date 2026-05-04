import "dotenv/config";
import { getRedis } from "./state/redis.js";

async function main() {
  const redis = await getRedis();
  
  // Check both date keys
  const state03 = await redis.get("nonojinx:2026-05-03");
  const state04 = await redis.get("nonojinx:2026-05-04");
  console.log("=== State 2026-05-03 ===");
  console.log(JSON.stringify(state03, null, 2));
  console.log("\n=== State 2026-05-04 ===");
  console.log(JSON.stringify(state04, null, 2));

  // Check recent history
  const history = await redis.lrange("nonojinx:history", 0, 3);
  console.log("\n=== Recent History ===");
  for (const h of history) {
    const entry = typeof h === "string" ? JSON.parse(h) : h;
    console.log(`  ${entry.timestamp} | ${entry.eventType} | ${entry.pitcherName}`);
  }

  // Check dedup keys
  const keys = await redis.keys("nonojinx:posted:*");
  console.log("\n=== Dedup Keys ===");
  for (const k of keys) {
    console.log(`  ${k}`);
  }
}
main();
