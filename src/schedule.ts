/**
 * Time-aware scheduling for the polling loop.
 * All times are in US Eastern (America/New_York).
 */

const ET = "America/New_York";

function etNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: ET }));
}

/**
 * MLB regular season typically runs late March through early October.
 * Postseason extends into early November.
 * Spring Training starts in mid-February.
 * We poll from mid-February through early November to cover everything.
 */
const SEASON_START_MONTH = 2;   // February
const SEASON_START_DAY = 15;
const SEASON_END_MONTH = 11;    // November
const SEASON_END_DAY = 10;

export function isInSeason(): boolean {
  const now = etNow();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  if (month > SEASON_START_MONTH && month < SEASON_END_MONTH) return true;
  if (month === SEASON_START_MONTH && day >= SEASON_START_DAY) return true;
  if (month === SEASON_END_MONTH && day <= SEASON_END_DAY) return true;
  return false;
}

/**
 * Games can start as early as 11:30am ET (day games) and run past midnight
 * on the west coast. We poll from 11am–2am ET to cover everything including
 * extra-inning west coast games.
 */
const POLL_START_HOUR = 11;  // 11:00 AM ET
const POLL_END_HOUR = 2;     // 2:00 AM ET (next day)

export function isGameHours(): boolean {
  const hour = etNow().getHours();
  // Active window wraps midnight: 11am–2am
  return hour >= POLL_START_HOUR || hour < POLL_END_HOUR;
}

export function shouldPoll(): boolean {
  return isInSeason() && isGameHours();
}

/**
 * Returns the number of milliseconds until the next poll window opens.
 * Used to sleep efficiently during off-hours instead of busy-waiting.
 */
export function msUntilNextPollWindow(): number {
  const now = etNow();
  const hour = now.getHours();

  if (!isInSeason()) {
    // Sleep until February 15 of the next applicable year
    const year = now.getMonth() + 1 >= SEASON_START_MONTH && now.getDate() >= SEASON_START_DAY
      ? now.getFullYear() + 1
      : now.getFullYear();
    const seasonStart = new Date(year, SEASON_START_MONTH - 1, SEASON_START_DAY, POLL_START_HOUR, 0, 0);
    return Math.max(seasonStart.getTime() - now.getTime(), 60_000);
  }

  // Off-hours: between 2am and 11am ET — sleep until 11am today
  if (hour >= POLL_END_HOUR && hour < POLL_START_HOUR) {
    const nextStart = new Date(now);
    nextStart.setHours(POLL_START_HOUR, 0, 0, 0);
    return Math.max(nextStart.getTime() - now.getTime(), 60_000);
  }

  // Shouldn't reach here if shouldPoll() is false, but safety fallback
  return 60_000;
}

export function formatSleepDuration(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
