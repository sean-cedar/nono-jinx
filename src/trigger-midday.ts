import "dotenv/config";
import { loadPrompt } from "./agent/prompt-loader.js";
import { runAgentWithMessage } from "./agent/runner.js";
import { logPost, hasRedisConfig } from "./state/redis.js";
import { notifyPost } from "./notify.js";
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
  const lines = [
    "Event: mid_day_update",
    "",
    "The early slate of games is DONE. Every single no-hitter from the early games has been broken up. Not a single one survived.",
    "",
    "Now here comes the evening slate — 9 more games, 18 more chances to jinx:",
    "",
    "6:40 PM — Red Sox (Sonny Gray) @ Tigers (Jack Flaherty)",
    "6:40 PM — Athletics (Jeffrey Springs) @ Phillies (Zack Wheeler)",
    "6:40 PM — Orioles (Brandon Young) @ Marlins (Eury Pérez)",
    "6:45 PM — Twins (Bailey Ober) @ Nationals (Miles Mikolas)",
    "7:05 PM — Rangers (Nathan Eovaldi) @ Yankees (Will Warren)",
    "7:40 PM — Reds (Brady Singer) @ Cubs (Colin Rea)",
    "7:40 PM — Guardians (Joey Cantillo) @ Royals (Cole Ragans)",
    "9:20 PM — Mets (Freddy Peralta) @ Rockies (Michael Lorenzen)",
    "9:40 PM — Pirates (Paul Skenes) @ Diamondbacks (Michael Soroka)",
    "",
    "Team X Handles: @RedSox, @tigers, @Athletics, @Phillies, @Orioles, @Marlins, @Twins, @Nationals, @Rangers, @Yankees, @Reds, @Cubs, @CleGuardians, @Royals, @Mets, @Rockies, @Pirates, @Dbacks",
    "",
    "Craft a post celebrating that the early slate is DONE (all broken up), then hype up the evening slate. Engage Jinx Nation. Taunt the haters. Pick 1-2 matchups worth calling out. Keep it UNDER 280 characters.",
  ];

  console.log("User message:\n" + lines.join("\n") + "\n");

  const prompt = loadPrompt("jinx-all-clear.md");
  const result = await runAgentWithMessage(prompt, lines.join("\n"));

  if (result.posted) {
    console.log(`\nPosted: "${result.text}"`);
    if (hasRedisConfig()) {
      try {
        await logPost({
          timestamp: new Date().toISOString(),
          eventType: "mid_day_update",
          pitcherName: "",
          pitchingTeam: "",
          battingTeam: "",
          inning: "",
          tweetText: result.text ?? "",
        });
      } catch {}
    }
    try { await notifyPost(result.text ?? "", "Mid-Day Update", "Evening Slate Preview"); } catch {}
  } else {
    console.log("Agent did not post.");
  }
}

main().catch(console.error);
