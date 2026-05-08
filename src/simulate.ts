import "dotenv/config";
import { loadPromptForEvent } from "./agent/prompt-loader.js";
import { runAgent } from "./agent/runner.js";
import type { NoHitterEvent, NoHitterEventType } from "./mlb/types.js";

const scenarios: NoHitterEvent[] = [
  {
    type: "no_hitter_in_progress",
    gamePk: 999001,
    pitcherName: "Gerrit Cole",
    startingPitcherName: "Gerrit Cole",
    pitchingTeam: "New York Yankees",
    battingTeam: "Los Angeles Dodgers",
    inning: 6,
    inningOrdinal: "6th",
    inningHalf: "Top",
    isPerfectGame: false,
    isCombinedNoHitter: false,
    pitcherCount: 1,
    pitchCount: 78,
    strikeouts: 8,
    totalOuts: 18,
    gameDate: "2026-05-07T23:05:00Z",
    venueTimeZone: "America/New_York",
  },
  {
    type: "perfect_game_in_progress",
    gamePk: 999002,
    pitcherName: "Spencer Strider",
    startingPitcherName: "Spencer Strider",
    pitchingTeam: "Atlanta Braves",
    battingTeam: "Chicago Cubs",
    inning: 7,
    inningOrdinal: "7th",
    inningHalf: "Bottom",
    isPerfectGame: true,
    isCombinedNoHitter: false,
    pitcherCount: 1,
    pitchCount: 85,
    strikeouts: 11,
    totalOuts: 21,
    gameDate: "2026-05-07T23:20:00Z",
    venueTimeZone: "America/New_York",
  },
  {
    type: "no_hitter_broken",
    gamePk: 999003,
    pitcherName: "Corbin Burnes",
    startingPitcherName: "Corbin Burnes",
    pitchingTeam: "Baltimore Orioles",
    battingTeam: "Boston Red Sox",
    inning: 5,
    inningOrdinal: "5th",
    inningHalf: "Top",
    isPerfectGame: false,
    isCombinedNoHitter: false,
    pitcherCount: 1,
    pitchCount: 72,
    strikeouts: 6,
    totalOuts: 13,
    gameDate: "2026-05-07T23:05:00Z",
    venueTimeZone: "America/New_York",
  },
  {
    type: "pitcher_replaced",
    gamePk: 999004,
    pitcherName: "Devin Williams",
    startingPitcherName: "Freddy Peralta",
    pitchingTeam: "Milwaukee Brewers",
    battingTeam: "St. Louis Cardinals",
    inning: 7,
    inningOrdinal: "7th",
    inningHalf: "Bottom",
    isPerfectGame: false,
    isCombinedNoHitter: true,
    pitcherCount: 2,
    pitchCount: 98,
    strikeouts: 9,
    totalOuts: 21,
    gameDate: "2026-05-08T00:10:00Z",
    venueTimeZone: "America/Chicago",
  },
];

const selected = process.argv[2] as NoHitterEventType | undefined;

async function main() {
  const toRun = selected
    ? scenarios.filter((s) => s.type === selected)
    : scenarios;

  if (toRun.length === 0) {
    console.log(`No scenario found for type: ${selected}`);
    console.log(`Available: ${scenarios.map((s) => s.type).join(", ")}`);
    process.exit(1);
  }

  for (const event of toRun) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Scenario: ${event.type}`);
    console.log(`${event.pitcherName} (${event.pitchingTeam}) vs ${event.battingTeam}`);
    console.log(`${"=".repeat(60)}\n`);

    const prompt = loadPromptForEvent(event.type);
    const result = await runAgent(prompt, event);

    if (result.posted) {
      console.log(`\nGenerated tweet:\n  "${result.text}"\n`);
    } else {
      console.log(`\nAgent did not post. Raw response: ${result.text}\n`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
