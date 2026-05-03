const X_HANDLE = "nono_jinx";

export interface Tweet {
  id: string;
  text: string;
  created_at: string;
}

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

export async function getRecentTweets(limit = 10): Promise<Tweet[]> {
  const bearer = getBearerToken();
  if (!bearer) return [];

  if (!cachedUserId) {
    cachedUserId = await getUserId(bearer);
  }
  if (!cachedUserId) return [];

  const params = new URLSearchParams({
    max_results: String(Math.min(Math.max(limit, 5), 100)),
    "tweet.fields": "created_at",
    exclude: "retweets,replies",
  });

  const res = await fetch(
    `https://api.twitter.com/2/users/${cachedUserId}/tweets?${params}`,
    { headers: { Authorization: `Bearer ${bearer}` } }
  );

  if (!res.ok) return [];
  const json = await res.json();
  return (json.data ?? []) as Tweet[];
}
