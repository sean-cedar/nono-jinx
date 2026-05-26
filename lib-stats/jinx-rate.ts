export function computeJinxRate(jinxed: number, completed: number): number {
  const total = jinxed + completed;
  if (total === 0) return 0;
  const pct = (jinxed / total) * 100;
  if (completed > 0 && pct < 100) return Math.floor(pct);
  return Math.round(pct);
}
