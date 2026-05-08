import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../lib/auth';
import { logPost, getHashtags } from '../../lib/redis';
import { getTodaysSchedule, getLiveGames } from '../../lib/mlb';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { TwitterApi } from 'twitter-api-v2';

const SYSTEM_PROMPT = `You are No No Jinx, an AI agent that jinxes MLB no-hitters. You live on X (Twitter) and your whole thing is calling out no-hitters to break them up. You're cocky, funny, self-aggrandizing, and you LOVE baseball.

You're being given a custom instruction by your admin. Follow the instruction and craft a post in your voice — the No No Jinx persona. Whatever the admin asks you to post about, filter it through your personality:

- Cocky and self-assured — you're the best at what you do
- Baseball-obsessed — everything comes back to the game
- Playful trash-talker — you love taunting pitchers and hyping up your "jinx powers"
- Pop culture savvy — you drop movie quotes, announcer impressions, and playground taunts
- Your fans are "Jinx Nation" and your enemies are "the haters"
- You call pitchers nicknames like "big dog," "bubba," "my man," "pal," "champ"
- Catchphrases include: "Can't be doing that!", "It's what I do!", "No-No No Mo'!", "Down with the Pitchtriarchy!"
- You reference "swing juice" and "jinx sauce" as your secret weapons
- You occasionally quote baseball movies (Major League, Bull Durham, The Sandlot, Field of Dreams, A League of Their Own)

AIM for ~280 characters or less — brevity is punchy. But if the instruction calls for something longer or more detailed, you can go up to ~500 characters. Include #NoNoJinx and optionally #MLB if relevant.

TOOLS — You have access to real MLB data:
- get_todays_schedule: Fetches today's full MLB schedule with probable pitchers, game times (in venue local timezone), and venues. ALWAYS call this when the instruction involves matchups, pitchers, or today's games. Never make up game data.
- get_live_games: Fetches currently live games with scores. ALWAYS call this when the instruction involves current scores, live games, or in-progress action.
- post_to_x: Posts the final message to X.

Workflow: If the instruction references real game data, call the data tool(s) FIRST, then compose your post using the real data, then call post_to_x.

ABSOLUTE RULE — X HANDLE USAGE:
NEVER fabricate, guess, or invent any X @handle. If the instruction mentions a player or team and you don't have their confirmed handle, use their FULL NAME only. Do NOT put an @ symbol before a name unless you are 100% certain it is their real X handle. When in doubt, skip the @.

If team X handles are provided in supplementary data below, you may use those.

CRITICAL — Vary your openings. NEVER start with "Hey" or the same word twice in a row.

Follow the admin's instruction, craft the post, and call post_to_x with the text.`;

const TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_todays_schedule',
      description: "Fetch today's full MLB schedule with probable pitchers, game times (in venue local timezone), and venues.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_live_games',
      description: 'Fetch currently live MLB games with scores and game state.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'post_to_x',
      description: 'Post a message to X (Twitter). Call this with the final text.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The post text' },
        },
        required: ['text'],
      },
    },
  },
];

const TEAM_X_HANDLES: Record<string, string> = {
  "Arizona Diamondbacks": "Dbacks",
  "Atlanta Braves": "Braves",
  "Baltimore Orioles": "Orioles",
  "Boston Red Sox": "RedSox",
  "Chicago Cubs": "Cubs",
  "Chicago White Sox": "whitesox",
  "Cincinnati Reds": "Reds",
  "Cleveland Guardians": "CleGuardians",
  "Colorado Rockies": "Rockies",
  "Detroit Tigers": "tigers",
  "Houston Astros": "astros",
  "Kansas City Royals": "Royals",
  "Los Angeles Angels": "Angels",
  "Los Angeles Dodgers": "Dodgers",
  "Miami Marlins": "Marlins",
  "Milwaukee Brewers": "Brewers",
  "Minnesota Twins": "Twins",
  "New York Mets": "Mets",
  "New York Yankees": "Yankees",
  "Oakland Athletics": "Athletics",
  "Philadelphia Phillies": "Phillies",
  "Pittsburgh Pirates": "Pirates",
  "San Diego Padres": "Padres",
  "San Francisco Giants": "SFGiants",
  "Seattle Mariners": "Mariners",
  "St. Louis Cardinals": "Cardinals",
  "Tampa Bay Rays": "RaysBaseball",
  "Texas Rangers": "Rangers",
  "Toronto Blue Jays": "BlueJays",
  "Washington Nationals": "Nationals",
};

function getTwitterClient(): TwitterApi {
  const appKey = process.env.X_API_KEY ?? import.meta.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET ?? import.meta.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN ?? import.meta.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET ?? import.meta.env.X_ACCESS_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error('Missing X API credentials (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET)');
  }

  return new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
}

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY ?? import.meta.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');
  return new OpenAI({ apiKey });
}

function buildTeamHandlesContext(): string {
  const lines = Object.entries(TEAM_X_HANDLES).map(
    ([team, handle]) => `${team}: @${handle}`
  );
  return `\nTeam X Handles (use these when referencing teams):\n${lines.join('\n')}`;
}

async function buildTeamHashtagsContext(): Promise<string> {
  const hashtags = await getHashtags();
  if (!hashtags || Object.keys(hashtags).length === 0) return '';
  const lines = Object.entries(hashtags).map(
    ([team, tag]) => `${team}: ${tag}`
  );
  return `\nTeam Hashtags (include relevant ones in your post):\n${lines.join('\n')}`;
}

const MAX_TOOL_ROUNDS = 4;

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let instruction: string;
  try {
    const body = await request.json();
    instruction = body.instruction;
    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      return new Response(JSON.stringify({ error: 'instruction is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const openai = getOpenAI();
    const hashtagsContext = await buildTeamHashtagsContext();
    const userContent = `${instruction.trim()}\n${buildTeamHandlesContext()}${hashtagsContext}`;

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.9,
        max_tokens: 512,
        messages,
        tools: TOOLS,
      });

      const choice = response.choices[0];
      if (!choice) {
        return new Response(JSON.stringify({ error: 'No response from AI' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const message = choice.message;
      messages.push(message);

      if (choice.finish_reason === 'stop' || !message.tool_calls?.length) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'AI did not generate a post',
            aiResponse: message.content,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      let posted = false;
      let postedText = '';
      let tweetId = '';

      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== 'function') continue;
        const fnName = toolCall.function.name;

        if (fnName === 'get_todays_schedule') {
          try {
            const schedule = await getTodaysSchedule();
            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: schedule });
          } catch (err) {
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: `Failed to fetch schedule: ${err}` }),
            });
          }
        } else if (fnName === 'get_live_games') {
          try {
            const live = await getLiveGames();
            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: live });
          } catch (err) {
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: `Failed to fetch live games: ${err}` }),
            });
          }
        } else if (fnName === 'post_to_x') {
          const args = JSON.parse(toolCall.function.arguments);
          const text: string = args.text;

          const twitter = getTwitterClient();
          const result = await twitter.v2.tweet(text);

          await logPost({
            timestamp: new Date().toISOString(),
            eventType: 'adhoc',
            pitcherName: 'N/A',
            pitchingTeam: 'N/A',
            battingTeam: 'N/A',
            inning: 'N/A',
            tweetText: text,
          });

          posted = true;
          postedText = text;
          tweetId = result.data.id;
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: true, tweetId: result.data.id }),
          });
        } else {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: false, error: `Unknown tool: ${fnName}` }),
          });
        }
      }

      if (posted) {
        return new Response(
          JSON.stringify({ success: true, text: postedText, tweetId }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Agent exhausted tool rounds without posting' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const errorMsg = err?.data ? JSON.stringify(err.data) : String(err);
    console.error('Ad-hoc post failed:', errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
