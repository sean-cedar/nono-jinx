const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

interface NotifyOptions {
  title: string;
  message: string;
  color?: number;
}

export async function notify({ title, message, color = 0xd42b2b }: NotifyOptions): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) return;

  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title,
          description: message,
          color,
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch (err) {
    console.error("Notification failed:", err);
  }
}

export async function notifyPost(tweetText: string, pitcherName: string, teams: string): Promise<void> {
  await notify({
    title: "Jinx Posted",
    message: `**${pitcherName}** — ${teams}\n\n> ${tweetText}`,
    color: 0x2a9d2a,
  });
}

export async function notifyError(context: string, error: unknown): Promise<void> {
  await notify({
    title: "Error",
    message: `**${context}**\n\`\`\`${String(error)}\`\`\``,
    color: 0xd42b2b,
  });
}
