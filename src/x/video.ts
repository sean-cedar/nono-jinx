import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TwitterApi } from "twitter-api-v2";

function getClient(): TwitterApi {
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error("Missing X API credentials in environment variables");
  }

  return new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
}

export async function uploadVideoToX(mp4Url: string): Promise<string | null> {
  const dryRun = process.env.DRY_RUN === "true";
  const tempFilePath = join(tmpdir(), `nonojinx-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);

  try {
    console.log(`Downloading video from: ${mp4Url}`);
    const response = await fetch(mp4Url);
    if (!response.ok) {
      console.error(`Video download failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(tempFilePath, buffer);
    console.log(`Video downloaded: ${buffer.length} bytes → ${tempFilePath}`);

    if (dryRun) {
      console.log("[DRY RUN] Would upload video to X, returning fake media_id");
      return "dry-run-media-" + Date.now();
    }

    console.log("Uploading video to X (chunked upload)...");
    const twitter = getClient();
    const mediaId = await twitter.v1.uploadMedia(tempFilePath, { mimeType: "video/mp4" });
    console.log(`Video uploaded to X, media_id: ${mediaId}`);
    return mediaId;
  } catch (err) {
    console.error("Video upload failed (post will continue without video):", err);
    return null;
  } finally {
    try {
      await unlink(tempFilePath);
    } catch {
      // temp file may not exist if download failed
    }
  }
}
