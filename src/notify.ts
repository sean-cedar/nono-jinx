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

export async function notifyVideoReply(
  outcome: "posted" | "exhausted" | "upload_failed" | "reply_failed" | "skipped",
  batterName: string,
  eventType: string,
  detail: string,
): Promise<void> {
  const colors: Record<typeof outcome, number> = {
    posted: 0x2a9d2a,
    exhausted: 0xf4a261,
    upload_failed: 0xd42b2b,
    reply_failed: 0xd42b2b,
    skipped: 0x888888,
  };
  const titles: Record<typeof outcome, string> = {
    posted: "Video Reply Posted",
    exhausted: "Video Reply — No Clip",
    upload_failed: "Video Reply — Upload Failed",
    reply_failed: "Video Reply — Reply Failed",
    skipped: "Video Reply — Skipped",
  };
  await notify({
    title: titles[outcome],
    message: `**${batterName}** (${eventType})\n${detail}`,
    color: colors[outcome],
  });
}
