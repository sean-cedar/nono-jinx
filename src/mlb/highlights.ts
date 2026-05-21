const BASE_URL = "https://statsapi.mlb.com";

interface Playback {
  name: string;
  url: string;
}

interface HighlightItem {
  guid?: string;
  title: string;
  description: string;
  keywordsAll?: { value: string }[];
  playbacks: Playback[];
}

interface GameContentResponse {
  highlights?: {
    highlights?: {
      items?: HighlightItem[];
    };
  };
}

export async function findBreakupHighlight(
  gamePk: number,
  playId: string,
): Promise<string | null> {
  try {
    const url = `${BASE_URL}/api/v1/game/${gamePk}/content`;
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`Highlights API returned ${response.status} for game ${gamePk}`);
      return null;
    }

    const data = (await response.json()) as GameContentResponse;
    const items = data.highlights?.highlights?.items;
    if (!items || items.length === 0) {
      console.log(`No highlight items found for game ${gamePk}`);
      return null;
    }

    const match = items.find((item) => item.guid === playId);

    if (!match) {
      console.log(`No highlight matching playId "${playId}" for game ${gamePk}`);
      return null;
    }

    const mp4 = match.playbacks.find((p) => p.name === "mp4Avc");
    if (!mp4) {
      console.log(`Found highlight for playId "${playId}" but no mp4Avc playback available`);
      return null;
    }

    console.log(`Found breakup highlight for playId "${playId}": ${mp4.url}`);
    return mp4.url;
  } catch (err) {
    console.error(`Error fetching highlights for game ${gamePk}:`, err);
    return null;
  }
}

const HOMER_KEYWORDS = ["homer", "home run"];

/**
 * Last-resort match for home-run breakups when playId guid is not yet in the feed.
 * Only matches highlights whose title/description mention the batter and a homer.
 */
export async function findHomerHighlightFallback(
  gamePk: number,
  batterName: string,
): Promise<string | null> {
  try {
    const url = `${BASE_URL}/api/v1/game/${gamePk}/content`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = (await response.json()) as GameContentResponse;
    const items = data.highlights?.highlights?.items;
    if (!items || items.length === 0) return null;

    const batterLower = batterName.toLowerCase();
    const match = items.find((item) => {
      const haystack = `${item.title ?? ""} ${item.description ?? ""}`.toLowerCase();
      if (!haystack.includes(batterLower)) return false;
      return HOMER_KEYWORDS.some((kw) => haystack.includes(kw));
    });

    if (!match) {
      console.log(`No homer fallback highlight for "${batterName}" in game ${gamePk}`);
      return null;
    }

    const mp4 = match.playbacks.find((p) => p.name === "mp4Avc");
    if (!mp4) return null;

    console.log(`Found homer fallback highlight for "${batterName}": ${mp4.url}`);
    return mp4.url;
  } catch (err) {
    console.error(`Error fetching homer fallback for game ${gamePk}:`, err);
    return null;
  }
}
