import { findBreakupHighlight } from "./mlb/highlights.js";
import { uploadVideoToX } from "./x/video.js";
import { replyToTweet } from "./x/client.js";
import {
  enqueuePendingVideoReply,
  getPendingVideoReplies,
  hasRedisConfig,
  logVideoReply,
  removePendingVideoReply,
  updatePendingVideoReply,
  type VideoReplyJob,
} from "./state/redis.js";

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
const MAX_RETRIES = 20;
const activeReplies = new Set<string>();

async function logStage(job: VideoReplyJob, stage: Parameters<typeof logVideoReply>[0]["stage"], message: string, meta?: Record<string, unknown>): Promise<void> {
  console.log(`[video-reply:${stage}] ${message}`);
  await logVideoReply({
    timestamp: new Date().toISOString(),
    originalTweetId: job.originalTweetId,
    gamePk: job.gamePk,
    batterName: job.batterName,
    stage,
    message,
    meta,
  });
}

async function pollAndReply(job: VideoReplyJob, initialDelayMs: number): Promise<void> {
  if (activeReplies.has(job.originalTweetId)) return;
  activeReplies.add(job.originalTweetId);

  try {
    if (initialDelayMs > 0) {
      await new Promise((r) => setTimeout(r, initialDelayMs));
    }

    for (let attempt = job.attempts; attempt < MAX_RETRIES; attempt++) {
      if (!job.breakupPlayId) {
        await logStage(job, "exhausted", "Skipping video reply because no deterministic playId was captured");
        await removePendingVideoReply(job.originalTweetId);
        return;
      }

      job.attempts = attempt + 1;
      job.lastAttemptAt = new Date().toISOString();
      if (hasRedisConfig()) {
        await updatePendingVideoReply(job);
      }
      await logStage(job, "attempt", `Checking highlight availability (attempt ${job.attempts}/${MAX_RETRIES})`);

      const highlightUrl = await findBreakupHighlight(
        job.gamePk,
        job.breakupPlayId,
      );

      if (highlightUrl) {
        await logStage(job, "highlight_found", `Found highlight for ${job.batterName}`, { highlightUrl });
        const mediaId = await uploadVideoToX(highlightUrl);
        if (!mediaId) {
          await logStage(job, "upload_failed", `Video upload failed for ${job.batterName}`, { highlightUrl });
          await removePendingVideoReply(job.originalTweetId);
          return;
        }

        const quip = nextQuip();
        try {
          const reply = await replyToTweet(quip, job.originalTweetId, mediaId);
          await logStage(job, "reply_posted", `Video reply posted (${reply.id})`, { replyId: reply.id, text: quip });
          await removePendingVideoReply(job.originalTweetId);
          return;
        } catch (err) {
          await logStage(job, "reply_failed", `Reply to ${job.originalTweetId} failed`, {
            error: err instanceof Error ? err.message : String(err),
          });
          await removePendingVideoReply(job.originalTweetId);
          throw err;
        }
      }

      await logStage(job, "highlight_missing", `No highlight yet for ${job.batterName}`, {
        breakupPlay: job.breakupPlay,
      });
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    }

    await logStage(job, "exhausted", `No highlight found after ${MAX_RETRIES} attempts`);
    await removePendingVideoReply(job.originalTweetId);
  } finally {
    activeReplies.delete(job.originalTweetId);
  }
}

export function scheduleVideoReply(
  gamePk: number,
  batterName: string,
  breakupPlay: string | undefined,
  originalTweetId: string,
  eventType = "no_hitter_broken",
  breakupDescription?: string,
  breakupPlayId?: string,
  pitcherName?: string,
): void {
  const job: VideoReplyJob = {
    gamePk,
    batterName,
    pitcherName,
    breakupPlay,
    breakupDescription,
    breakupPlayId,
    originalTweetId,
    eventType,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  console.log(`Scheduling video reply for ${batterName} (game ${gamePk}, tweet ${originalTweetId})`);
  void logStage(job, "scheduled", `Scheduled video reply for ${batterName}`, {
    breakupPlay,
    eventType,
  });
  if (hasRedisConfig()) {
    void enqueuePendingVideoReply(job);
  }
  pollAndReply(job, INITIAL_DELAY_MS).catch((err) =>
    console.error(`Video reply background task failed for ${batterName}:`, err),
  );
}

export async function resumePendingVideoReplies(): Promise<void> {
  if (!hasRedisConfig()) return;
  const jobs = await getPendingVideoReplies();
  for (const job of jobs) {
    await logStage(job, "resumed", `Resuming pending video reply for ${job.batterName}`, {
      attempts: job.attempts,
    });
    pollAndReply(job, 0).catch((err) =>
      console.error(`Resumed video reply task failed for ${job.batterName}:`, err),
    );
  }
}
