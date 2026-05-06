import "dotenv/config";
import { loadPrompt } from "./agent/prompt-loader.js";
import { runAgentWithMessage } from "./agent/runner.js";
import { logPost, hasRedisConfig } from "./state/redis.js";
import { notifyPost } from "./notify.js";

async function main() {
  const systemPrompt = loadPrompt("jinx-all-clear.md");

  const userMessage = `Event: story_time

You have some downtime between game slates. Time for a special segment: "Story Time with Jinxy" (or a fun variation of that name).

Tell a nostalgic story about your GREAT GRANDFATHER, Ebenezer Jinx, who was jinxing no-hitters back in the early 1900s-1920s. You come from a LONG LINE of jinxers — this is a family tradition.

Use REAL players and teams from that era (e.g., Cy Young, Walter Johnson, Christy Mathewson, Ty Cobb, the Boston Americans, the Pittsburgh Pirates, the New York Giants, etc.). Reference a real no-hitter from that era if possible, or create a believable scenario.

Make it nostalgic, warm, and funny. Reminisce about Great Grandpa Ebenezer. Maybe he jinxed from the bleachers, or whispered it to a telegraph operator, or yelled it from a rooftop. The jinx runs in the family.

Keep it UNDER 280 characters. This is a fun, character-building post — engage the audience, make them laugh, and remind them that jinxing is in your BLOOD.

Post this using post_to_x.`;

  console.log("User message:\n" + userMessage + "\n");

  const result = await runAgentWithMessage(systemPrompt, userMessage);

  if (result.posted) {
    console.log(`\nPosted: "${result.text}"`);
    if (hasRedisConfig()) {
      try {
        await logPost({
          timestamp: new Date().toISOString(),
          eventType: "story_time",
          pitcherName: "",
          pitchingTeam: "",
          battingTeam: "",
          inning: "",
          tweetText: result.text ?? "",
        });
      } catch {}
    }
    try { await notifyPost(result.text ?? "", "Story Time with Jinxy", "Ebenezer Jinx"); } catch {}
  } else {
    console.log("Agent did not post.");
  }
}

main().catch(console.error);
