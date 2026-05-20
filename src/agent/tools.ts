import { postTweet } from "../x/client.js";
import { getLinescore, getBoxscore } from "../mlb/client.js";

export interface ToolResult {
  success: boolean;
  data: unknown;
}

let pendingMediaId: string | null = null;

export function setMediaId(id: string | null): void {
  pendingMediaId = id;
}

async function handleGetNoHitterContext(args: { gamePk: number }): Promise<ToolResult> {
  try {
    const [linescore, boxscore] = await Promise.all([
      getLinescore(args.gamePk),
      getBoxscore(args.gamePk),
    ]);

    const pitchingStats = (side: "home" | "away") => {
      const team = boxscore.teams[side];
      return {
        teamName: team.team.name,
        pitching: team.teamStats.pitching,
      };
    };

    return {
      success: true,
      data: {
        currentInning: linescore.currentInning,
        inningOrdinal: linescore.currentInningOrdinal,
        inningState: linescore.inningState,
        awayHits: linescore.teams.away.hits,
        homeHits: linescore.teams.home.hits,
        pitcher: linescore.defense?.pitcher?.fullName,
        homePitching: pitchingStats("home"),
        awayPitching: pitchingStats("away"),
      },
    };
  } catch (err) {
    return {
      success: false,
      data: { error: String(err) },
    };
  }
}

async function handlePostToX(args: { text: string }): Promise<ToolResult> {
  try {
    const cleanText = args.text.replace(/\\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    const mediaId = pendingMediaId ?? undefined;
    const result = await postTweet(cleanText, mediaId);
    return { success: true, data: result };
  } catch (err: any) {
    const errorDetail = err?.data ? JSON.stringify(err.data) : String(err);
    console.error(`X API post failed: ${errorDetail}`);
    return {
      success: false,
      data: { error: errorDetail },
    };
  }
}

const TOOL_HANDLERS: Record<string, (args: Record<string, unknown>) => Promise<ToolResult>> = {
  get_no_hitter_context: (args) => handleGetNoHitterContext(args as { gamePk: number }),
  post_to_x: (args) => handlePostToX(args as { text: string }),
};

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return { success: false, data: { error: `Unknown tool: ${name}` } };
  }
  return handler(args);
}
