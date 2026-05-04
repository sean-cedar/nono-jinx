import type {
  ScheduleResponse,
  ScheduleGame,
  LinescoreResponse,
  BoxscoreResponse,
  PlayByPlayResponse,
} from "./types.js";

const BASE_URL = "https://statsapi.mlb.com";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MLB API error: ${response.status} ${response.statusText} for ${url}`);
  }
  return response.json() as Promise<T>;
}

export async function getSchedule(date: string): Promise<ScheduleGame[]> {
  const url = `${BASE_URL}/api/v1/schedule?sportId=1&date=${date}`;
  const data = await fetchJson<ScheduleResponse>(url);
  if (!data.dates || data.dates.length === 0) return [];
  return data.dates[0].games;
}

const PRE_PLAY_STATES = new Set([
  "Pre-Game", "Warmup", "Delayed Start", "Delayed", "Scheduled",
]);

export async function getLiveGames(date: string): Promise<ScheduleGame[]> {
  const games = await getSchedule(date);
  return games.filter(
    (g) =>
      g.status.abstractGameState === "Live" &&
      !PRE_PLAY_STATES.has(g.status.detailedState),
  );
}

export async function getFinishedGames(date: string): Promise<ScheduleGame[]> {
  const games = await getSchedule(date);
  return games.filter((g) => g.status.abstractGameState === "Final");
}

export async function getLinescore(gamePk: number): Promise<LinescoreResponse> {
  const url = `${BASE_URL}/api/v1/game/${gamePk}/linescore`;
  return fetchJson<LinescoreResponse>(url);
}

export async function getBoxscore(gamePk: number): Promise<BoxscoreResponse> {
  const url = `${BASE_URL}/api/v1/game/${gamePk}/boxscore`;
  return fetchJson<BoxscoreResponse>(url);
}

export async function getPlayByPlay(gamePk: number): Promise<PlayByPlayResponse> {
  const url = `${BASE_URL}/api/v1/game/${gamePk}/playByPlay`;
  return fetchJson<PlayByPlayResponse>(url);
}

export async function getScheduleWithPitchers(date: string): Promise<ScheduleGame[]> {
  const url = `${BASE_URL}/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher(note)`;
  const data = await fetchJson<ScheduleResponse>(url);
  if (!data.dates || data.dates.length === 0) return [];
  return data.dates[0].games;
}

export function todayDateString(): string {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
