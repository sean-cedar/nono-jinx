interface BoxscoreTeam {
  team: { name: string };
  teamStats: { batting: { hits: number } };
  pitchers: number[];
}

interface Boxscore {
  teams: { away: BoxscoreTeam; home: BoxscoreTeam };
}

export function tallyBoxscoreSides(box: Boxscore): {
  jinxed: number;
  completed: number;
  survivedIsCombined: boolean;
} {
  let jinxed = 0;
  let completed = 0;
  let survivedIsCombined = false;

  for (const pitchingSide of ["home", "away"] as const) {
    const battingSide = pitchingSide === "home" ? "away" : "home";
    const hits = box.teams[battingSide].teamStats.batting.hits;
    if (hits === 0) {
      completed++;
      if (box.teams[pitchingSide].pitchers.length > 1) {
        survivedIsCombined = true;
      }
    } else {
      jinxed++;
    }
  }

  return { jinxed, completed, survivedIsCombined };
}
