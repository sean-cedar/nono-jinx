import "dotenv/config";
import { loadPromptForEvent } from "./agent/prompt-loader.js";
import { runAgent } from "./agent/runner.js";
import type { NoHitterEvent } from "./mlb/types.js";

const event: NoHitterEvent = {
  type: "perfect_game_in_progress",
  gamePk: 824285,
  pitcherName: "Jack Leiter",
  pitchingTeam: "Texas Rangers",
  battingTeam: "Detroit Tigers",
  inning: 3,
  inningOrdinal: "3rd",
  inningHalf: "Bottom",
  isPerfectGame: true,
  isCombinedNoHitter: false,
  pitcherCount: 1,
  startingPitcherName: "Jack Leiter",
  gameDate: new Date().toISOString(),
};

async function main() {
  console.log("Loading prompt for perfect_game_in_progress...");
  const prompt = loadPromptForEvent("perfect_game_in_progress");

  console.log("Running agent...");
  const result = await runAgent(prompt, event);

  console.log("Posted:", result.posted);
  if (result.text) console.log("Text:", result.text);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
