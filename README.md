# NoJinx

MLB no-hitter jinxing bot for X. Detects no-hitters in progress via the MLB Stats API, generates jinx posts using an AI agent, and publishes them to X.

## How it works

1. **Poll** — Continuously polls the MLB Stats API every 60 seconds during game hours
2. **Detect** — Compares live game linescores against stored state to detect no-hitter events:
   - New no-hitter in progress (or perfect game)
   - Inning advanced with no-hitter still intact
   - Pitcher replaced during a no-hitter
   - No-hitter broken up
   - No-hitter completed
3. **Generate** — An AI agent loads the appropriate markdown prompt file and generates a witty, jinx-themed post
4. **Post** — The agent calls the `post_to_x` tool to publish the post to X

## Project structure

```
prompts/           Markdown prompt files with YAML frontmatter (model, tools, system prompt)
src/mlb/           MLB Stats API client and no-hitter detection engine
src/agent/         Prompt loader, tool implementations, and LLM agent runner
src/x/             X API v2 client
src/state/         State persistence (Redis / DynamoDB / in-memory)
src/index.ts       Entry point with polling loop and health check server
data/              Curated lookup tables (player X handles, team hashtags)
test/              Vitest tests with fixture data
```

## Setup

```bash
npm install
cp .env.example .env  # Fill in your API keys
```

## Development

```bash
# Type check
npm run lint

# Run tests
npm test

# Run once (single poll)
npm run dev

# Run continuously (local polling loop)
npm run poll

# Test AI agent output without posting
npm run simulate
```

## Prompt files

Prompts live in `prompts/` as markdown files with YAML frontmatter:

```markdown
---
model: gpt-4o-mini
temperature: 0.9
max_tokens: 512
tools:
  - name: post_to_x
    description: Post a message to X
    parameters:
      type: object
      properties:
        text:
          type: string
      required: [text]
---

Your system prompt goes here...
```

Edit these files to change the bot's personality, model, or available tools.

## Deploy to Railway

### 1. Create Railway project

1. Sign up at [railway.app](https://railway.app)
2. Click **New Project** → **Deploy from GitHub repo**
3. Connect the `sean-cedar/nono-jinx` repository
4. Railway auto-detects Node.js and will run `npm run build` then `npm run start`

### 2. Set environment variables

In the Railway dashboard, go to your service → **Variables** and add:

| Variable | Value |
|---|---|
| `X_API_KEY` | Your X Consumer Key |
| `X_API_SECRET` | Your X Consumer Key Secret |
| `X_ACCESS_TOKEN` | Your X Access Token |
| `X_ACCESS_SECRET` | Your X Access Token Secret |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `MIN_INNING_THRESHOLD` | `1` |
| `POLL_INTERVAL_MS` | `60000` |

Do **not** set `DRY_RUN` (defaults to false in production).

### 3. Add Upstash Redis (optional but recommended)

Redis gives your bot crash-recovery persistence. Without it, the bot uses in-memory state and may re-post after a restart.

1. In your Railway project, click **+ New** → **Database** → **Redis** (Upstash)
2. Railway automatically injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
3. The bot detects these variables and uses Redis automatically

### 4. Verify

- The health check server responds on the assigned `PORT` with bot status (uptime, last poll time)
- Check the Railway logs to see polling output
- Check your X profile to see the jinx posts

## Required credentials

- **X API**: Developer account at [developer.x.com](https://developer.x.com) with Read+Write permissions
- **OpenAI**: API key from [platform.openai.com](https://platform.openai.com)
