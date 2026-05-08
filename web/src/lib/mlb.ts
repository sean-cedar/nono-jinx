const BASE_URL = "https://statsapi.mlb.com";

function todayET(): string {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatGameTime(isoDate: string, timeZone = "America/New_York"): string {
  const dt = new Date(isoDate);
  const timeStr = dt.toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  const tzAbbrev = dt
    .toLocaleTimeString("en-US", { timeZone, timeZoneName: "short" })
    .split(" ")
    .pop() ?? "";
  return `${timeStr} ${tzAbbrev}`;
}

interface ScheduleGame {
  gamePk: number;
  gameDate: string;
  status: { abstractGameState: string; detailedState: string };
  venue?: { name: string; timeZone?: { id: string } };
  teams: {
    away: { team: { name: string }; score?: number; probablePitcher?: { fullName: string } };
    home: { team: { name: string }; score?: number; probablePitcher?: { fullName: string } };
  };
}

async function fetchSchedule(hydrate: string): Promise<ScheduleGame[]> {
  const date = todayET();
  const url = `${BASE_URL}/api/v1/schedule?sportId=1&date=${date}&hydrate=${hydrate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB API ${res.status}: ${res.statusText}`);
  const data = await res.json();
  if (!data.dates || data.dates.length === 0) return [];
  return data.dates[0].games as ScheduleGame[];
}

export async function getTodaysSchedule(): Promise<string> {
  const games = await fetchSchedule("probablePitcher(note),venue(timezone)");
  const date = todayET();

  if (games.length === 0) {
    return `No MLB games scheduled for ${date}.`;
  }

  const lines: string[] = [`MLB Schedule for ${date} — ${games.length} game(s):\n`];

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const awayName = g.teams.away.team.name;
    const homeName = g.teams.home.team.name;
    const awayPitcher = g.teams.away.probablePitcher?.fullName ?? "TBD";
    const homePitcher = g.teams.home.probablePitcher?.fullName ?? "TBD";
    const venueTz = g.venue?.timeZone?.id ?? "America/New_York";
    const time = formatGameTime(g.gameDate, venueTz);
    const venue = g.venue?.name ?? "Unknown";
    const state = g.status.detailedState;

    lines.push(
      `${i + 1}. ${awayName} (${awayPitcher}) @ ${homeName} (${homePitcher})`,
      `   ${time} at ${venue} — ${state}`,
    );
  }

  return lines.join("\n");
}

const PRE_PLAY_STATES = new Set([
  "Pre-Game", "Warmup", "Delayed Start", "Delayed", "Scheduled",
]);

export async function getLiveGames(): Promise<string> {
  const games = await fetchSchedule("linescore,venue(timezone)");
  const date = todayET();

  const live = games.filter(
    (g) =>
      g.status.abstractGameState === "Live" &&
      !PRE_PLAY_STATES.has(g.status.detailedState),
  );

  if (live.length === 0) {
    const previewCount = games.filter((g) => g.status.abstractGameState === "Preview").length;
    const finalCount = games.filter((g) => g.status.abstractGameState === "Final").length;
    return `No live games right now (${date}). ${previewCount} upcoming, ${finalCount} finished.`;
  }

  const lines: string[] = [`${live.length} live game(s) right now:\n`];

  for (const g of live) {
    const away = g.teams.away;
    const home = g.teams.home;
    const state = g.status.detailedState;
    lines.push(
      `• ${away.team.name} ${away.score ?? 0} @ ${home.team.name} ${home.score ?? 0} — ${state}`,
    );
  }

  return lines.join("\n");
}
