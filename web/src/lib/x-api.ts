import { getRedis } from "./redis";

const X_HANDLE = "nono_jinx";

export interface Tweet {
  id: string;
  text: string;
  created_at: string;
}

interface TweetCache {
  tweets: Tweet[];
  cachedAt: number;
}

const TWEET_CACHE_KEY = "nonojinx:tweet-cache";
const TWEET_CACHE_FRESH_SECONDS = 300;
// Keep stale data around for 24h so we can serve it if X API is down
const TWEET_CACHE_MAX_TTL = 86400;

function getBearerToken(): string | null {
  return (
    (import.meta.env.X_BEARER_TOKEN ?? process.env.X_BEARER_TOKEN) || null
  );
}

async function getUserId(bearer: string): Promise<string | null> {
  const res = await fetch(
    `https://api.twitter.com/2/users/by/username/${X_HANDLE}`,
    { headers: { Authorization: `Bearer ${bearer}` } }
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json.data?.id ?? null;
}

let cachedUserId: string | null = null;

async function fetchFromXApi(bearer: string, limit: number): Promise<Tweet[] | null> {
  if (!cachedUserId) {
    cachedUserId = await getUserId(bearer);
  }
  if (!cachedUserId) return null;

  const params = new URLSearchParams({
    max_results: String(Math.min(Math.max(limit, 5), 100)),
    "tweet.fields": "created_at",
    exclude: "retweets,replies",
  });

  const res = await fetch(
    `https://api.twitter.com/2/users/${cachedUserId}/tweets?${params}`,
    { headers: { Authorization: `Bearer ${bearer}` } }
  );

  if (!res.ok) {
    console.log(`[x-api] X API responded ${res.status}`);
    return null;
  }

  const json = await res.json();
  return (json.data ?? []) as Tweet[];
}

export async function getRecentTweets(limit = 10): Promise<Tweet[]> {
  const bearer = getBearerToken();
  if (!bearer) return [];

  let cached: TweetCache | null = null;
  try {
    cached = await getRedis().get<TweetCache>(TWEET_CACHE_KEY);
  } catch (e) {
    console.log("[x-api] Redis read error:", e);
  }

  if (cached) {
    const ageSeconds = (Date.now() - cached.cachedAt) / 1000;
    if (ageSeconds < TWEET_CACHE_FRESH_SECONDS) {
      console.log(`[x-api] Cache hit (${Math.round(ageSeconds)}s old)`);
      return cached.tweets.slice(0, limit);
    }
    console.log(`[x-api] Cache stale (${Math.round(ageSeconds)}s old) — refreshing`);
  } else {
    console.log("[x-api] Cache miss — fetching from X API");
  }

  const tweets = await fetchFromXApi(bearer, limit);

  if (tweets === null) {
    if (cached) {
      console.log("[x-api] X API failed — serving stale cache");
      return cached.tweets.slice(0, limit);
    }
    return [];
  }

  try {
    const entry: TweetCache = { tweets, cachedAt: Date.now() };
    await getRedis().set(TWEET_CACHE_KEY, entry, { ex: TWEET_CACHE_MAX_TTL });
    console.log(`[x-api] Cached ${tweets.length} tweets (TTL ${TWEET_CACHE_MAX_TTL}s)`);
  } catch (e) {
    console.log("[x-api] Redis write error:", e);
  }

  return tweets;
}
