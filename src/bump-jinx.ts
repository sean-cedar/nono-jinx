import "dotenv/config";
import { Redis } from "@upstash/redis";

async function main() {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  const before = await redis.get("nonojinx:stats:jinxed");
  console.log("Before:", before);
  const after = await redis.incr("nonojinx:stats:jinxed");
  console.log("After:", after);
}

main().catch(console.error);
