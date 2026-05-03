import "dotenv/config";
import { getLiveGames, getFinishedGames, getSchedule, todayDateString } from "./mlb/client.js";
import { detectNoHitters } from "./mlb/detector.js";
import { createStore } from "./state/store.js";
import { loadPromptForEvent } from "./agent/prompt-loader.js";
import { runAgent } from "./agent/runner.js";
import type { NoHitterEvent } from "./mlb/types.js";

const store = createStore();

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
      return true;
    } else {
      console.warn(`Agent did not post for event ${event.type}`);
      return false;
    }
  } catch (err) {
    console.error(`Error processing event ${event.type}:`, err);
    return false;
  }
}

export async function handler(): Promise<{
  eventsDetected: number;
  eventsPosted: number;
}> {
  const date = todayDateString();
  console.log(`NoJinx polling for ${date}`);

  // Early exit if no games today
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

  let posted = 0;
  for (const event of events) {
    const success = await processEvent(event);
    if (success) posted++;
  }

  await store.save(updatedState);

  return { eventsDetected: events.length, eventsPosted: posted };
}

// Lambda handler export
export const lambdaHandler = async (): Promise<{ statusCode: number; body: string }> => {
  try {
    const result = await handler();
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("Handler error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(err) }),
    };
  }
};

// Local polling loop
async function pollLoop(): Promise<never> {
  const intervalMs = parseInt(process.env.POLL_INTERVAL_MS ?? "60000", 10);
  console.log(`NoJinx polling loop started (every ${intervalMs / 1000}s). Press Ctrl+C to stop.\n`);

  while (true) {
    try {
      const result = await handler();
      if (result.eventsDetected > 0) {
        console.log(`  → ${result.eventsDetected} event(s), ${result.eventsPosted} posted\n`);
      }
    } catch (err) {
      console.error("Poll error:", err);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// Direct invocation for local dev
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("index.ts") || process.argv[1].endsWith("index.js"));

if (isDirectRun) {
  const useLoop = process.argv.includes("--poll");
  if (useLoop) {
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
