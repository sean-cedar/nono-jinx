import "dotenv/config";
import { loadPrompt } from "./agent/prompt-loader.js";
import { runAgentWithMessage } from "./agent/runner.js";
import { logPost, hasRedisConfig } from "./state/redis.js";
import { notifyPost } from "./notify.js";
import { getHandle } from "./mlb/handles.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const teamXHandles = JSON.parse(
  readFileSync(resolve(__dirname, "../data/team-x-handles.json"), "utf-8")
);

async function main() {
  const pitcherName = "J.T. Ginn";
  const pitchingTeam = "Athletics";
  const battingTeam = "Los Angeles Angels";
  const pitchingHandle = teamXHandles[pitchingTeam];
  const battingHandle = teamXHandles[battingTeam];
  const pitcherHandle = await getHandle(pitcherName);

  const lines = [
    "Event: no_hitter_broken",
    "Game Start Time: 6:38 PM PT (evening game)",
    "Venue: Angel Stadium",
    "Current Pitcher: J.T. Ginn",
    "Starting Pitcher: J.T. Ginn",
    "Pitching Team: Athletics",
    "Batting Team: Los Angeles Angels",
    "Broken Up In: the 9th inning (the hit came DURING this inning — the pitcher did NOT complete 9 full innings)",
    "Outs Away From CG No-No: 3 (pitcher had recorded 24 outs)",
    "Perfect Game: No",
    "Combined No-Hitter: No",
    "Pitchers Used: 1",
    "Breakup Hit: Single by Adam Frazier",
    "Play Description: Adam Frazier singles on a sharp line drive to center fielder Henry Bolte.",
  ];

  if (pitcherHandle) lines.push(`Current Pitcher X Handle: @${pitcherHandle}`);
  if (pitchingHandle) lines.push(`Pitching Team X Handle: @${pitchingHandle}`);
  if (battingHandle) lines.push(`Batting Team X Handle: @${battingHandle}`);

  console.log("User message:\n" + lines.join("\n") + "\n");

  const prompt = loadPrompt("jinx-broken.md");
  const result = await runAgentWithMessage(prompt, lines.join("\n"));

  if (result.posted) {
    console.log(`\nPosted: "${result.text}"`);
    if (hasRedisConfig()) {
      try {
        await logPost({
          timestamp: new Date().toISOString(),
          eventType: "no_hitter_broken",
          pitcherName,
          pitchingTeam,
          battingTeam,
          inning: "Broken in 9th",
          tweetText: result.text ?? "",
        });
      } catch {}
    }
    try { await notifyPost(result.text ?? "", pitcherName, `${pitchingTeam} vs ${battingTeam}`); } catch {}
  } else {
    console.log("Agent did not post.");
  }
}

main().catch(console.error);
