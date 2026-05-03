import { TwitterApi } from "twitter-api-v2";

let client: TwitterApi | null = null;

function getClient(): TwitterApi {
  if (client) return client;

  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error("Missing X API credentials in environment variables");
  }

  client = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
  return client;
}

export async function postTweet(text: string): Promise<{ id: string; text: string }> {
  const dryRun = process.env.DRY_RUN === "true";

  if (dryRun) {
    console.log(`[DRY RUN] Would post to X: ${text}`);
    return { id: "dry-run-" + Date.now(), text };
  }

  const api = getClient();
  const result = await api.v2.tweet(text);
  console.log(`Posted to X: ${result.data.id}`);
  return { id: result.data.id, text: result.data.text };
}
