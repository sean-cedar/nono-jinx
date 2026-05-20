import { findBreakupHighlight } from "./mlb/highlights.js";
import { uploadVideoToX } from "./x/video.js";
import { replyToTweet } from "./x/client.js";

const QUIPS = [
  "The receipts.",
  "Footage of the crime.",
  "Roll the tape.",
  "The evidence.",
  "Watch it again.",
  "In case you missed it.",
];

let quipIndex = 0;

function nextQuip(): string {
  const quip = QUIPS[quipIndex % QUIPS.length];
  quipIndex++;
  return quip;
}

const INITIAL_DELAY_MS = 60_000;
const POLL_INTERVAL_MS = 30_000;
const MAX_RETRIES = 8;

async function pollAndReply(
  gamePk: number,
  batterName: string,
  breakupPlay: string | undefined,
  originalTweetId: string,
): Promise<void> {
  await new Promise((r) => setTimeout(r, INITIAL_DELAY_MS));

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const highlightUrl = await findBreakupHighlight(gamePk, batterName, breakupPlay);

    if (highlightUrl) {
      const mediaId = await uploadVideoToX(highlightUrl);
      if (!mediaId) {
        console.log(`Video upload failed for ${batterName} highlight, giving up on reply`);
        return;
      }

      const quip = nextQuip();
      const reply = await replyToTweet(quip, originalTweetId, mediaId);
      console.log(`Video reply posted (${reply.id}): "${quip}" → reply to ${originalTweetId}`);
      return;
    }

    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  console.log(`No highlight found for ${batterName} in game ${gamePk} after ${MAX_RETRIES} attempts`);
}

export function scheduleVideoReply(
  gamePk: number,
  batterName: string,
  breakupPlay: string | undefined,
  originalTweetId: string,
): void {
  console.log(`Scheduling video reply for ${batterName} (game ${gamePk}, tweet ${originalTweetId})`);
  pollAndReply(gamePk, batterName, breakupPlay, originalTweetId).catch((err) =>
    console.error(`Video reply background task failed for ${batterName}:`, err),
  );
}
