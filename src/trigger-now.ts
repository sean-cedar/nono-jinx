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

const ordinals = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

async function postForInning(inning: number) {
  const pitcherName = "Ben Brown";
  const pitchingTeam = "Chicago Cubs";
  const battingTeam = "Texas Rangers";

  const handles = loadTeamHandles();
  const pitchingHandle = handles[pitchingTeam];
  const battingHandle = handles[battingTeam];
  const pitcherHandle = await getHandle(pitcherName);

  const totalOuts = inning * 3;
  const outsRemaining = 27 - totalOuts;

  const lines = [
    `Event: no_hitter_in_progress`,
    `Game Start Time: 7:05 PM CT (evening game)`,
    `Venue: Globe Life Field`,
    `Current Pitcher: ${pitcherName}`,
    `Starting Pitcher: ${pitcherName}`,
    `Pitching Team: ${pitchingTeam}`,
    `Batting Team: ${battingTeam}`,
    `No-Hit Innings Completed: ${inning} (through ${ordinals[inning]})`,
    `Outs Away From CG No-No: ${outsRemaining} (pitcher has recorded ${totalOuts} outs)`,
    `Perfect Game: No`,
    `Combined No-Hitter: No`,
    `Pitchers Used: 1`,
  ];

  if (pitcherHandle) lines.push(`Current Pitcher X Handle: @${pitcherHandle}`);
  if (pitchingHandle) lines.push(`Pitching Team X Handle: @${pitchingHandle}`);
  if (battingHandle) lines.push(`Batting Team X Handle: @${battingHandle}`);

  console.log(`\n=== INNING ${inning} ===`);
  console.log("User message:\n" + lines.join("\n") + "\n");

  const prompt = loadPrompt("jinx-in-progress.md");
  const result = await runAgentWithMessage(prompt, lines.join("\n"));

  if (result.posted) {
    console.log(`Posted: "${result.text}"`);
    if (hasRedisConfig()) {
      try {
        await logPost({
          timestamp: new Date().toISOString(),
          eventType: "no_hitter_in_progress",
          pitcherName,
          pitchingTeam,
          battingTeam,
          inning: `Through ${ordinals[inning]}`,
          tweetText: result.text ?? "",
        });
      } catch {}
    }
    try { await notifyPost(result.text ?? "", pitcherName, `${pitchingTeam} vs ${battingTeam}`); } catch {}
  } else {
    console.log("Agent did not post.");
  }
}

async function main() {
  for (let i = 1; i <= 5; i++) {
    await postForInning(i);
  }
}

main().catch(console.error);
