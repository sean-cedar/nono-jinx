import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadPrompt } from "./agent/prompt-loader.js";
import { runAgentWithMessage } from "./agent/runner.js";
import { notifyError, notifyPost } from "./notify.js";
import { replyToTweet, postTweet } from "./x/client.js";

type Command = "post" | "reply" | "agent";

interface ParsedArgs {
  command: Command;
  text?: string;
  replyToId?: string;
  promptFile?: string;
  instruction?: string;
}

function initializeEnv(): void {
  const explicitEnvFile = process.env.NOJINX_ENV_FILE;
  const candidates = explicitEnvFile
    ? [explicitEnvFile]
    : [".env.vercel.local", ".env"];

  for (const candidate of candidates) {
    const envPath = resolve(process.cwd(), candidate);
    if (!existsSync(envPath)) continue;
    loadEnv({ path: envPath, override: true });
    console.log(`Loaded environment from ${candidate}`);
    return;
  }
}

function usage(): never {
  console.error(`Usage:
  npm run post -- post --text "your post text"
  npm run post -- reply --tweet-id 1234567890 --text "your reply text"
  npm run post -- agent --prompt jinx-daily-preview.md --instruction "Post about today's slate"
  npm run post -- agent-reply --tweet-id 1234567890 --instruction "Reply to the original post confirming the clip"

Options:
  --text       Text to post directly to X
  --tweet-id   Tweet ID to reply to
  --prompt     Prompt file in ./prompts for AI-generated ad hoc posts
  --instruction User instruction passed to the agent
`);
  process.exit(1);
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Missing value for ${flag}`);
    usage();
  }
  return value;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[2] as Command | "agent-reply" | undefined;
  if (!command || !["post", "reply", "agent", "agent-reply"].includes(command)) {
    usage();
  }

  const parsed: ParsedArgs = { command: command as Command };

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--text":
        parsed.text = requireValue(argv, i, arg);
        i++;
        break;
      case "--tweet-id":
        parsed.replyToId = requireValue(argv, i, arg);
        i++;
        break;
      case "--prompt":
        parsed.promptFile = requireValue(argv, i, arg);
        i++;
        break;
      case "--instruction":
        parsed.instruction = requireValue(argv, i, arg);
        i++;
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        usage();
    }
  }

  if (parsed.command === "post" && !parsed.text) {
    console.error("--text is required for post");
    usage();
  }

  if (parsed.command === "reply" && (!parsed.text || !parsed.replyToId)) {
    console.error("--tweet-id and --text are required for reply");
    usage();
  }

  if (parsed.command === "agent" && (!parsed.promptFile || !parsed.instruction)) {
    console.error("--prompt and --instruction are required for agent");
    usage();
  }

  if ((command as string) === "agent-reply" && (!parsed.replyToId || !parsed.instruction)) {
    console.error("--tweet-id and --instruction are required for agent-reply");
    usage();
  }

  return parsed;
}

async function runDirectPost(text: string): Promise<void> {
  const result = await postTweet(text);
  console.log(`Posted successfully: ${result.id}`);
  await notifyPost(text, "Ad hoc post", "Direct terminal command");
}

async function runDirectReply(replyToId: string, text: string): Promise<void> {
  const result = await replyToTweet(text, replyToId);
  console.log(`Reply posted successfully: ${result.id} -> ${replyToId}`);
  await notifyPost(text, "Ad hoc reply", `Reply to ${replyToId}`);
}

async function runAgentPost(promptFile: string, instruction: string): Promise<void> {
  const prompt = loadPrompt(promptFile);
  const result = await runAgentWithMessage(prompt, instruction);

  if (!result.posted || !result.tweetId) {
    throw new Error(`Agent did not post. Response: ${result.text ?? "No response"}`);
  }

  console.log(`Agent posted successfully: ${result.tweetId}`);
  if (result.text) {
    await notifyPost(result.text, "Ad hoc agent post", `Prompt ${promptFile}`);
  }
}

async function runAgentReply(replyToId: string, instruction: string): Promise<void> {
  const { setDefaultReplyTweetId } = await import("./agent/tools.js");
  try {
    setDefaultReplyTweetId(replyToId);
    const prompt = loadPrompt("jinx-reply.md");
    const result = await runAgentWithMessage(prompt, instruction);

    if (!result.posted || !result.tweetId) {
      throw new Error(`Agent did not reply. Response: ${result.text ?? "No response"}`);
    }

    console.log(`Agent reply posted successfully: ${result.tweetId} -> ${replyToId}`);
    if (result.text) {
      await notifyPost(result.text, "Ad hoc agent reply", `Reply to ${replyToId}`);
    }
  } finally {
    setDefaultReplyTweetId(null);
  }
}

async function main(): Promise<void> {
  initializeEnv();
  const parsed = parseArgs(process.argv);

  switch (parsed.command) {
    case "post":
      await runDirectPost(parsed.text!);
      return;
    case "reply":
      await runDirectReply(parsed.replyToId!, parsed.text!);
      return;
    case "agent":
      await runAgentPost(parsed.promptFile!, parsed.instruction!);
      return;
  }

  if ((process.argv[2] as string) === "agent-reply") {
    await runAgentReply(parsed.replyToId!, parsed.instruction!);
    return;
  }
}

main().catch(async (err) => {
  console.error("Post command failed:", err);
  await notifyError("Manual post command", err);
  process.exit(1);
});
