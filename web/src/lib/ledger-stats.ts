import { computeJinxRate } from "../../../lib-stats/jinx-rate.js";
import { tallyBoxscoreSides } from "../../../lib-stats/ledger-tally.js";

const MLB_BASE = "https://statsapi.mlb.com";

/** May 3, 2026 Sunday Night Baseball — first tracked game (Rangers @ Tigers). */
export const TRACKING_SNB_GAME_PK = 824285;
/** Full slates count from May 4 onward (ET). */
export const TRACKING_FULL_SLATE_START = "2026-05-04";

export { computeJinxRate, tallyBoxscoreSides };

export interface LedgerOutcome {
  jinxed: number;
  completed: number;
  jinxRate: number;
  survivedIsCombined: boolean;
}

interface ScheduleGame {
  gamePk: number;
  status: { abstractGameState: string; detailedState: string };
}

interface BoxscoreTeam {
  team: { name: string };
  teamStats: { batting: { hits: number } };
  pitchers: number[];
}

interface Boxscore {
  teams: { away: BoxscoreTeam; home: BoxscoreTeam };
}

export function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function* dateRange(from: string, to: string): Generator<string> {
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

async function fetchFinalGamePks(date: string): Promise<number[]> {
  const res = await fetch(`${MLB_BASE}/api/v1/schedule?sportId=1&date=${date}`);
  if (!res.ok) throw new Error(`MLB schedule ${date}: ${res.status}`);
  const data = await res.json();
  const games = (data.dates?.[0]?.games ?? []) as ScheduleGame[];
  return games
    .filter(
      (g) =>
        g.status.abstractGameState === "Final" &&
        g.status.detailedState !== "Postponed",
    )
    .map((g) => g.gamePk);
}

async function fetchBoxscore(gamePk: number): Promise<Boxscore> {
  const res = await fetch(`${MLB_BASE}/api/v1/game/${gamePk}/boxscore`);
  if (!res.ok) throw new Error(`MLB boxscore ${gamePk}: ${res.status}`);
  return res.json();
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function computeLedgerStats(
  endDate = todayET(),
): Promise<LedgerOutcome> {
  const gamePks: number[] = [TRACKING_SNB_GAME_PK];

  for (const date of dateRange(TRACKING_FULL_SLATE_START, endDate)) {
    gamePks.push(...(await fetchFinalGamePks(date)));
  }

  const boxscores = await mapConcurrent(gamePks, 15, fetchBoxscore);

  let jinxed = 0;
  let completed = 0;
  let survivedIsCombined = false;

  for (const box of boxscores) {
    const side = tallyBoxscoreSides(box);
    jinxed += side.jinxed;
    completed += side.completed;
    survivedIsCombined ||= side.survivedIsCombined;
  }

  return {
    jinxed,
    completed,
    jinxRate: computeJinxRate(jinxed, completed),
    survivedIsCombined,
  };
}
