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

export async function postTweet(text: string, mediaId?: string): Promise<{ id: string; text: string }> {
  const dryRun = process.env.DRY_RUN === "true";

  if (dryRun) {
    console.log(`[DRY RUN] Would post to X: ${text}${mediaId ? ` (with media: ${mediaId})` : ""}`);
    return { id: "dry-run-" + Date.now(), text };
  }

  const api = getClient();
  const tweetOptions: Parameters<typeof api.v2.tweet>[0] = { text };
  if (mediaId) {
    tweetOptions.media = { media_ids: [mediaId] };
  }
  const result = await api.v2.tweet(tweetOptions);
  console.log(`Posted to X: ${result.data.id}${mediaId ? " (with video)" : ""}`);
  return { id: result.data.id, text: result.data.text };
}
