/** Rang écrit : « 1er », « 2e », « 3e ». */
export function rankLabel(rank: number): string {
  return rank === 1 ? "1er" : `${rank}e`;
}
