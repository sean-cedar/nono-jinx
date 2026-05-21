import { findBreakupHighlight, findHomerHighlightFallback } from "./mlb/highlights.js";
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
import { notifyVideoReply } from "./notify.js";

const QUIPS = [
  "The receipts.",
  "Footage of the crime.",
  "Roll the tape.",
  "The evidence.",
  "Watch it again.",
  "In case you missed it.",
];

const HIT_EVENTS = new Set(["Single", "Double", "Triple", "Home Run"]);

const VIDEO_REPLY_EVENT_TYPES = new Set([
  "no_hitter_broken",
  "scoring_change_hit",
  "no_hitter_complete",
  "perfect_game_complete",
]);

const DEFAULT_INITIAL_DELAY_MS = 60_000;
const HOMER_INITIAL_DELAY_MS = 90_000;
const POLL_INTERVAL_MS = 30_000;
const DEFAULT_MAX_RETRIES = 20;
const HOMER_MAX_RETRIES = 35;

let quipIndex = 0;

function nextQuip(): string {
  const quip = QUIPS[quipIndex % QUIPS.length];
  quipIndex++;
  return quip;
}

/**
 * Only schedule video for event types where MLB commonly publishes highlights.
 * In-progress and walk/HBP perfect-game breaks are excluded.
 */
export function shouldScheduleVideoReply(eventType: string, breakupPlay?: string): boolean {
  if (!VIDEO_REPLY_EVENT_TYPES.has(eventType)) return false;
  if (eventType === "no_hitter_broken" && breakupPlay && !HIT_EVENTS.has(breakupPlay)) {
    return false;
  }
  return true;
}

function pollConfig(breakupPlay?: string): { initialDelayMs: number; maxRetries: number } {
  if (breakupPlay === "Home Run") {
    return { initialDelayMs: HOMER_INITIAL_DELAY_MS, maxRetries: HOMER_MAX_RETRIES };
  }
  return { initialDelayMs: DEFAULT_INITIAL_DELAY_MS, maxRetries: DEFAULT_MAX_RETRIES };
}

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

async function postVideoReply(job: VideoReplyJob, highlightUrl: string, source: "playId" | "homer_fallback"): Promise<boolean> {
  await logStage(job, "highlight_found", `Found highlight for ${job.batterName}`, { highlightUrl, source });
  const mediaId = await uploadVideoToX(highlightUrl);
  if (!mediaId) {
    await logStage(job, "upload_failed", `Video upload failed for ${job.batterName}`, { highlightUrl });
    await removePendingVideoReply(job.originalTweetId);
    await notifyVideoReply("upload_failed", job.batterName, job.eventType, `Upload failed (${source})`);
    return false;
  }

  const quip = nextQuip();
  try {
    const reply = await replyToTweet(quip, job.originalTweetId, mediaId);
    await logStage(job, "reply_posted", `Video reply posted (${reply.id})`, { replyId: reply.id, text: quip, source });
    await removePendingVideoReply(job.originalTweetId);
    await notifyVideoReply("posted", job.batterName, job.eventType, `Reply ${reply.id}: "${quip}"`);
    return true;
  } catch (err) {
    await logStage(job, "reply_failed", `Reply to ${job.originalTweetId} failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
    await removePendingVideoReply(job.originalTweetId);
    await notifyVideoReply("reply_failed", job.batterName, job.eventType, String(err));
    throw err;
  }
}

async function pollAndReply(job: VideoReplyJob, initialDelayMs: number, maxRetries: number): Promise<void> {
  if (activeReplies.has(job.originalTweetId)) return;
  activeReplies.add(job.originalTweetId);

  try {
    if (initialDelayMs > 0) {
      await new Promise((r) => setTimeout(r, initialDelayMs));
    }

    if (!job.breakupPlayId) {
      await logStage(job, "exhausted", "Skipping video reply because no deterministic playId was captured");
      await removePendingVideoReply(job.originalTweetId);
      await notifyVideoReply("skipped", job.batterName, job.eventType, "No playId captured");
      return;
    }

    for (let attempt = job.attempts; attempt < maxRetries; attempt++) {
      job.attempts = attempt + 1;
      job.lastAttemptAt = new Date().toISOString();
      if (hasRedisConfig()) {
        await updatePendingVideoReply(job);
      }
      await logStage(job, "attempt", `Checking highlight availability (attempt ${job.attempts}/${maxRetries})`);

      const highlightUrl = await findBreakupHighlight(job.gamePk, job.breakupPlayId);
      if (highlightUrl) {
        await postVideoReply(job, highlightUrl, "playId");
        return;
      }

      await logStage(job, "highlight_missing", `No highlight yet for ${job.batterName}`, {
        breakupPlay: job.breakupPlay,
      });
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    }

    if (job.breakupPlay === "Home Run") {
      await logStage(job, "attempt", "Trying homer fallback match");
      const fallbackUrl = await findHomerHighlightFallback(job.gamePk, job.batterName);
      if (fallbackUrl) {
        await postVideoReply(job, fallbackUrl, "homer_fallback");
        return;
      }
    }

    await logStage(job, "exhausted", `No highlight found after ${maxRetries} attempts`);
    await removePendingVideoReply(job.originalTweetId);
    await notifyVideoReply(
      "exhausted",
      job.batterName,
      job.eventType,
      `No clip after ${maxRetries} polls${job.breakupPlay === "Home Run" ? " (incl. homer fallback)" : ""}`,
    );
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
  if (!shouldScheduleVideoReply(eventType, breakupPlay)) {
    console.log(`Skipping video reply for ${eventType} (${breakupPlay ?? "no play"})`);
    return;
  }

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

  const { initialDelayMs, maxRetries } = pollConfig(breakupPlay);

  console.log(`Scheduling video reply for ${batterName} (game ${gamePk}, tweet ${originalTweetId})`);
  void logStage(job, "scheduled", `Scheduled video reply for ${batterName}`, {
    breakupPlay,
    eventType,
    initialDelayMs,
    maxRetries,
  });
  if (hasRedisConfig()) {
    void enqueuePendingVideoReply(job);
  }
  pollAndReply(job, initialDelayMs, maxRetries).catch((err) => {
    console.error(`Video reply background task failed for ${batterName}:`, err);
    void notifyVideoReply("reply_failed", batterName, eventType, String(err));
  });
}

export async function resumePendingVideoReplies(): Promise<void> {
  if (!hasRedisConfig()) return;
  const jobs = await getPendingVideoReplies();
  for (const job of jobs) {
    if (!shouldScheduleVideoReply(job.eventType, job.breakupPlay)) {
      await removePendingVideoReply(job.originalTweetId);
      continue;
    }
    const { maxRetries } = pollConfig(job.breakupPlay);
    await logStage(job, "resumed", `Resuming pending video reply for ${job.batterName}`, {
      attempts: job.attempts,
    });
    pollAndReply(job, 0, maxRetries).catch((err) =>
      console.error(`Resumed video reply task failed for ${job.batterName}:`, err),
    );
  }
}
