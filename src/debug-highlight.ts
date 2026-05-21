const BASE_URL = "https://statsapi.mlb.com";

interface Playback {
  name: string;
  url: string;
}

interface HighlightItem {
  title?: string;
  description?: string;
  playbacks?: Playback[];
}

interface GameContentResponse {
  highlights?: {
    highlights?: {
      items?: HighlightItem[];
    };
  };
}

interface LiveFeedResponse {
  liveData?: {
    plays?: {
      allPlays?: Array<{
        about?: {
          inning?: number;
          halfInning?: string;
        };
        result?: {
          event?: string;
          description?: string;
        };
        matchup?: {
          batter?: {
            fullName?: string;
          };
          pitcher?: {
            fullName?: string;
          };
        };
      }>;
    };
  };
}

function usage(): never {
  console.error("Usage: tsx src/debug-highlight.ts <gamePk> <batter name>");
  process.exit(1);
}

async function main(): Promise<void> {
  const gamePkArg = process.argv[2];
  const batterName = process.argv.slice(3).join(" ").trim();

  if (!gamePkArg || !batterName) {
    usage();
  }

  const gamePk = Number(gamePkArg);
  if (!Number.isFinite(gamePk)) {
    console.error(`Invalid gamePk: ${gamePkArg}`);
    process.exit(1);
  }

  const batterLower = batterName.toLowerCase();

  const [contentResponse, liveResponse] = await Promise.all([
    fetch(`${BASE_URL}/api/v1/game/${gamePk}/content`),
    fetch(`${BASE_URL}/api/v1.1/game/${gamePk}/feed/live`),
  ]);

  if (!contentResponse.ok) {
    throw new Error(`Game content request failed: ${contentResponse.status}`);
  }
  if (!liveResponse.ok) {
    throw new Error(`Live feed request failed: ${liveResponse.status}`);
  }

  const content = await contentResponse.json() as GameContentResponse;
  const live = await liveResponse.json() as LiveFeedResponse;

  const highlightItems = content.highlights?.highlights?.items ?? [];
  const matchingHighlights = highlightItems.filter((item) => {
    const haystack = `${item.title ?? ""} ${item.description ?? ""}`.toLowerCase();
    return haystack.includes(batterLower);
  });

  const plays = live.liveData?.plays?.allPlays ?? [];
  const matchingPlays = plays.filter((play) => {
    const batter = play.matchup?.batter?.fullName?.toLowerCase() ?? "";
    const description = play.result?.description?.toLowerCase() ?? "";
    return batter.includes(batterLower) || description.includes(batterLower);
  });

  console.log(`Game: ${gamePk}`);
  console.log(`Batter: ${batterName}`);
  console.log("");

  console.log(`Matching live plays: ${matchingPlays.length}`);
  for (const play of matchingPlays) {
    console.log(JSON.stringify({
      inning: play.about?.inning,
      half: play.about?.halfInning,
      event: play.result?.event,
      description: play.result?.description,
      batter: play.matchup?.batter?.fullName,
      pitcher: play.matchup?.pitcher?.fullName,
    }, null, 2));
  }

  console.log("");
  console.log(`Matching highlights: ${matchingHighlights.length}`);
  for (const item of matchingHighlights) {
    const playbackNames = (item.playbacks ?? []).map((playback) => playback.name);
    console.log(JSON.stringify({
      title: item.title,
      description: item.description,
      playbacks: playbackNames,
      hasMp4Avc: playbackNames.includes("mp4Avc"),
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
