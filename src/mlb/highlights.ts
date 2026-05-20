const BASE_URL = "https://statsapi.mlb.com";

interface Playback {
  name: string;
  url: string;
}

interface HighlightItem {
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
  batterName: string,
  hitType?: string,
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

    const batterLower = batterName.toLowerCase();

    const match = items.find((item) => {
      const title = item.title?.toLowerCase() ?? "";
      const desc = item.description?.toLowerCase() ?? "";
      return title.includes(batterLower) || desc.includes(batterLower);
    });

    if (!match) {
      console.log(`No highlight matching batter "${batterName}" for game ${gamePk}`);
      return null;
    }

    const mp4 = match.playbacks.find((p) => p.name === "mp4Avc");
    if (!mp4) {
      console.log(`Found highlight for "${batterName}" but no mp4Avc playback available`);
      return null;
    }

    console.log(`Found breakup highlight for "${batterName}": ${mp4.url}`);
    return mp4.url;
  } catch (err) {
    console.error(`Error fetching highlights for game ${gamePk}:`, err);
    return null;
  }
}
