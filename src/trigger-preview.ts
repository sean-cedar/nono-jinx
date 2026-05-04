import "dotenv/config";
import { getScheduleWithPitchers, todayDateString } from "./mlb/client.js";
import { loadPrompt } from "./agent/prompt-loader.js";
import { runAgentWithMessage } from "./agent/runner.js";
import { logPost, hasRedisConfig, markPosted } from "./state/redis.js";
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

function getTeamHandle(name: string): string | null {
  return loadTeamHandles()[name] ?? null;
}

function formatGameTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York", hour: "numeric", minute: "2-digit",
  });
}

function formatDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

async function main() {
  const date = todayDateString();
  console.log(`Triggering daily preview for ${date}...`);

  const games = await getScheduleWithPitchers(date);
  const upcoming = games.filter((g) => g.status.abstractGameState === "Preview");
  console.log(`${upcoming.length} upcoming games out of ${games.length} total.`);

  if (upcoming.length === 0) {
    console.log("No upcoming games to preview.");
    return;
  }

  const lines: string[] = [
    `Event: daily_preview`,
    `Date: ${formatDateLabel(date)}`,
    `Games Today: ${games.length}`,
    "",
  ];

  upcoming.forEach((game, i) => {
    const awayP = game.teams.away.probablePitcher?.fullName ?? "TBD";
    const homeP = game.teams.home.probablePitcher?.fullName ?? "TBD";
    const time = formatGameTime(game.gameDate);
    const aN = game.teams.away.team.name;
    const hN = game.teams.home.team.name;
    const aH = getTeamHandle(aN);
    const hH = getTeamHandle(hN);
    const aL = aH ? `${aN} (@${aH})` : aN;
    const hL = hH ? `${hN} (@${hH})` : hN;
    lines.push(`${i + 1}. ${aL} (${awayP}) @ ${hL} (${homeP}) — ${time} ET`);
  });

  lines.push("");
  lines.push("Craft a pre-game preview post highlighting the matchups you find most interesting.");

  console.log("\nUser message:\n" + lines.join("\n") + "\n");

  const prompt = loadPrompt("jinx-daily-preview.md");
  const result = await runAgentWithMessage(prompt, lines.join("\n"));

  if (result.posted) {
    console.log(`\nPosted: "${result.text}"`);
    await markPosted(`daily-preview-${date}`);
    if (hasRedisConfig()) {
      try {
        await logPost({
          timestamp: new Date().toISOString(),
          eventType: "daily_preview",
          pitcherName: "N/A",
          pitchingTeam: "N/A",
          battingTeam: "N/A",
          inning: "Pre-Game",
          tweetText: result.text ?? "",
        });
      } catch {}
    }
    try { await notifyPost(result.text ?? "", "Daily Preview", "All Games"); } catch {}
  } else {
    console.log("Agent did not post.");
  }
}

main().catch(console.error);
