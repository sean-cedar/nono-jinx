import "dotenv/config";
import { createServer } from "node:http";
import { getLiveGames, getFinishedGames, getSchedule, todayDateString } from "./mlb/client.js";
import { detectNoHitters } from "./mlb/detector.js";
import { createStore } from "./state/store.js";
import { loadPromptForEvent } from "./agent/prompt-loader.js";
import { runAgent } from "./agent/runner.js";
import { shouldPoll, msUntilNextPollWindow, formatSleepDuration } from "./schedule.js";
import { hasRedisConfig, logPost, hasPosted, markPosted } from "./state/redis.js";
import { notifyPost, notifyError } from "./notify.js";
import type { NoHitterEvent } from "./mlb/types.js";

const store = createStore();
const startedAt = new Date();
let lastPollAt: Date | null = null;
let lastPollResult: { eventsDetected: number; eventsPosted: number } | null = null;
let processing = false;

async function hasGamesToday(): Promise<boolean> {
  const games = await getSchedule(todayDateString());
  return games.length > 0;
}

async function processEvent(event: NoHitterEvent): Promise<boolean> {
  console.log(`Processing event: ${event.type} — ${event.pitcherName} (${event.pitchingTeam} vs ${event.battingTeam}), ${event.inningHalf} ${event.inningOrdinal}`);

  try {
    const prompt = loadPromptForEvent(event.type);
    const result = await runAgent(prompt, event);

    if (result.posted) {
      console.log(`Posted: "${result.text}"`);
      const teams = `${event.pitchingTeam} vs ${event.battingTeam}`;
      if (hasRedisConfig()) {
        try {
          await logPost({
            timestamp: new Date().toISOString(),
            eventType: event.type,
            pitcherName: event.pitcherName,
            pitchingTeam: event.pitchingTeam,
            battingTeam: event.battingTeam,
            inning: `${event.inningHalf} ${event.inningOrdinal}`,
            tweetText: result.text ?? "",
          });
        } catch (err) {
          console.error("Failed to log post to history:", err);
        }
      }
      await notifyPost(result.text ?? "", event.pitcherName, teams);
      return true;
    } else {
      console.warn(`Agent did not post for event ${event.type}`);
      return false;
    }
  } catch (err) {
    console.error(`Error processing event ${event.type}:`, err);
    await notifyError(`Processing ${event.type} for ${event.pitcherName}`, err);
    return false;
  }
}

export async function handler(): Promise<{
  eventsDetected: number;
  eventsPosted: number;
}> {
  const date = todayDateString();
  console.log(`NoJinx polling for ${date}`);

  if (!(await hasGamesToday())) {
    console.log("No games today. Exiting.");
    return { eventsDetected: 0, eventsPosted: 0 };
  }

  const [liveGames, finishedGames] = await Promise.all([
    getLiveGames(date),
    getFinishedGames(date),
  ]);

  console.log(`Live games: ${liveGames.length}, Finished games: ${finishedGames.length}`);

  if (liveGames.length === 0 && finishedGames.length === 0) {
    console.log("No live or finished games. Exiting.");
    return { eventsDetected: 0, eventsPosted: 0 };
  }

  const currentState = await store.load();
  const { events, updatedState } = await detectNoHitters(liveGames, finishedGames, currentState);

  console.log(`Detected ${events.length} event(s)`);

  // Save state BEFORE processing events so a container restart won't
  // re-detect the same no-hitter from stale state.
  await store.save(updatedState);

  processing = true;
  let posted = 0;
  for (const event of events) {
    const dedupKey = `${event.gamePk}-${event.pitcherName}-${event.type}-${event.inning}`;
    if (await hasPosted(dedupKey)) {
      console.log(`Skipping duplicate: ${dedupKey}`);
      continue;
    }
    const success = await processEvent(event);
    if (success) {
      await markPosted(dedupKey);
      posted++;
    }
  }
  processing = false;

  return { eventsDetected: events.length, eventsPosted: posted };
}

// Lambda handler export
export const lambdaHandler = async (): Promise<{ statusCode: number; body: string }> => {
  try {
    const result = await handler();
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error("Handler error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};

// Health check HTTP server for Railway
function startHealthServer(): void {
  const port = parseInt(process.env.PORT ?? "3000", 10);

  const server = createServer((_req, res) => {
    const uptimeMs = Date.now() - startedAt.getTime();
    const polling = shouldPoll();
    const status = {
      status: "ok",
      uptime: `${Math.floor(uptimeMs / 60000)}m`,
      startedAt: startedAt.toISOString(),
      polling,
      nextPollWindow: polling ? "now" : formatSleepDuration(msUntilNextPollWindow()),
      lastPollAt: lastPollAt?.toISOString() ?? null,
      lastPollResult,
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status));
  });

  server.listen(port, () => {
    console.log(`Health check server listening on port ${port}`);
  });
}

// Polling loop with time-aware scheduling
async function pollLoop(): Promise<never> {
  const intervalMs = parseInt(process.env.POLL_INTERVAL_MS ?? "60000", 10);
  console.log(`NoJinx polling loop started (every ${intervalMs / 1000}s during game hours).\n`);

  while (true) {
    if (!shouldPoll()) {
      const sleepMs = msUntilNextPollWindow();
      console.log(`Outside game hours/season. Sleeping for ${formatSleepDuration(sleepMs)}...`);
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
      continue;
    }

    try {
      const result = await handler();
      lastPollAt = new Date();
      lastPollResult = result;
      if (result.eventsDetected > 0) {
        console.log(`  → ${result.eventsDetected} event(s), ${result.eventsPosted} posted\n`);
      }
    } catch (err) {
      console.error("Poll error:", err);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, shutting down gracefully.");
  if (processing) {
    console.log("Waiting for in-flight event processing to finish...");
    const start = Date.now();
    while (processing && Date.now() - start < 25_000) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  process.exit(0);
});

// Entry point
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("index.ts") || process.argv[1].endsWith("index.js"));

if (isDirectRun) {
  const useLoop = process.argv.includes("--poll") || process.env.RAILWAY_ENVIRONMENT;

  if (useLoop) {
    if (process.env.PORT || process.env.RAILWAY_ENVIRONMENT) {
      startHealthServer();
    }
    pollLoop();
  } else {
    handler()
      .then((result) => {
        console.log("Done:", result);
        process.exit(0);
      })
      .catch((err) => {
        console.error("Fatal:", err);
        process.exit(1);
      });
  }
}
