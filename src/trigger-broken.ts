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

let teamXHandles: Record<string, string> | null = null;
function loadTeamHandles(): Record<string, string> {
  if (teamXHandles) return teamXHandles;
  try {
    const raw = readFileSync(resolve(__dirname, "../data/team-x-handles.json"), "utf-8");
    teamXHandles = JSON.parse(raw);
    return teamXHandles!;
  } catch { return {}; }
}

async function main() {
  const pitcherName = "Shane Baz";
  const pitchingTeam = "Baltimore Orioles";
  const battingTeam = "New York Yankees";

  const handles = loadTeamHandles();
  const pitchingHandle = handles[pitchingTeam];
  const battingHandle = handles[battingTeam];
  const pitcherHandle = await getHandle(pitcherName);

  const lines = [
    `Event: no_hitter_broken`,
    `Current Pitcher: ${pitcherName}`,
    `Starting Pitcher: ${pitcherName}`,
    `Pitching Team: ${pitchingTeam}`,
    `Batting Team: ${battingTeam}`,
    `No-Hit Innings Completed: 0 (through 0th)`,
    `Perfect Game: No`,
    `Combined No-Hitter: No`,
    `Pitchers Used: 1`,
    `Breakup Hit: Double by Trent Grisham`,
    `Play Description: Trent Grisham doubles to right field.`,
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
          inning: "1st (broken in 1st)",
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
