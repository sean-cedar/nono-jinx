import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getScheduleWithPitchers } from "./mlb/client.js";
import { loadPrompt } from "./agent/prompt-loader.js";
import { runAgentWithMessage } from "./agent/runner.js";
import { hasPosted, markPosted, logPost, hasRedisConfig } from "./state/redis.js";
import { notifyPost, notifyError } from "./notify.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let teamXHandles: Record<string, string> | null = null;

function loadTeamHandles(): Record<string, string> {
  if (teamXHandles) return teamXHandles;
  try {
    const raw = readFileSync(resolve(__dirname, "../data/team-x-handles.json"), "utf-8");
    teamXHandles = JSON.parse(raw);
    return teamXHandles!;
  } catch {
    return {};
  }
}

function getTeamHandle(teamName: string): string | null {
  const handles = loadTeamHandles();
  return handles[teamName] ?? null;
}

function etNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
}

function formatGameTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export async function checkDailyPreview(date: string): Promise<boolean> {
  const hour = etNow().getHours();
  if (hour < 12) return false;

  const dedupKey = `daily-preview-${date}`;
  if (await hasPosted(dedupKey)) return false;

  const games = await getScheduleWithPitchers(date);
  const upcoming = games.filter(
    (g) => g.status.abstractGameState === "Preview",
  );

  if (upcoming.length === 0) {
    console.log("Daily preview: no upcoming games to preview.");
    return false;
  }

  const lines: string[] = [
    `Event: daily_preview`,
    `Date: ${formatDateLabel(date)}`,
    `Games Today: ${games.length}`,
    "",
  ];

  upcoming.forEach((game, i) => {
    const awayPitcher =
      game.teams.away.probablePitcher?.fullName ?? "TBD";
    const homePitcher =
      game.teams.home.probablePitcher?.fullName ?? "TBD";
    const time = formatGameTime(game.gameDate);
    const awayName = game.teams.away.team.name;
    const homeName = game.teams.home.team.name;
    const awayHandle = getTeamHandle(awayName);
    const homeHandle = getTeamHandle(homeName);
    const awayLabel = awayHandle ? `${awayName} (@${awayHandle})` : awayName;
    const homeLabel = homeHandle ? `${homeName} (@${homeHandle})` : homeName;
    lines.push(
      `${i + 1}. ${awayLabel} (${awayPitcher}) @ ${homeLabel} (${homePitcher}) — ${time} ET`,
    );
  });

  lines.push("");
  lines.push(
    "Craft a pre-game preview post highlighting the matchups you find most interesting.",
  );

  console.log(
    `Daily preview: ${upcoming.length} upcoming games, generating post...`,
  );

  try {
    const prompt = loadPrompt("jinx-daily-preview.md");
    const result = await runAgentWithMessage(prompt, lines.join("\n"));

    if (result.posted) {
      console.log(`Daily preview posted: "${result.text}"`);
      await markPosted(dedupKey);

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
        } catch (e) {
          console.error("Failed to log preview post:", e);
        }
      }

      try {
        await notifyPost(
          result.text ?? "",
          "Daily Preview",
          "All Games",
        );
      } catch {}

      return true;
    }

    console.warn("Daily preview: agent did not post.");
    return false;
  } catch (err) {
    console.error("Daily preview error:", err);
    try {
      await notifyError("Daily preview generation", err);
    } catch {}
    return false;
  }
}
