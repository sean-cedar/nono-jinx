# NoJinx

MLB no-hitter jinxing bot for X. Detects no-hitters in progress via the MLB Stats API, generates jinx posts using an AI agent, and publishes them to X.

## How it works

1. **Poll** -- A cron-triggered Lambda polls the MLB Stats API every 60 seconds during game hours
2. **Detect** -- Compares live game linescores against stored state to detect no-hitter events:
   - New no-hitter in progress (or perfect game)
   - Inning advanced with no-hitter still intact
   - No-hitter broken up
   - No-hitter completed
3. **Generate** -- An AI agent loads the appropriate markdown prompt file and generates a witty, jinx-themed post
4. **Post** -- The agent calls the `post_to_x` tool to publish the post to X

## Project structure

```
prompts/           Markdown prompt files with YAML frontmatter (model, tools, system prompt)
src/mlb/           MLB Stats API client and no-hitter detection engine
src/agent/         Prompt loader, tool implementations, and LLM agent runner
src/x/             X API v2 client
src/state/         State persistence (DynamoDB / in-memory)
src/index.ts       Lambda handler entry point
test/              Vitest tests with fixture data
infrastructure/    AWS SAM template for deployment
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

# Run locally (dry run mode)
DRY_RUN=true npm run dev
```

## Prompt files

Prompts live in `prompts/` as markdown files with YAML frontmatter:

```markdown
---
model: gpt-4o-mini
temperature: 0.9
max_tokens: 280
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

## Deploy

```bash
npm run build
cd infrastructure
sam build
sam deploy --guided  # First time -- prompts for API keys
sam deploy           # Subsequent deploys
```

## Required credentials

- **X API**: Developer account at developer.x.com with Read+Write permissions
- **OpenAI**: API key from platform.openai.com
- **AWS**: Credentials with Lambda + DynamoDB + EventBridge access
