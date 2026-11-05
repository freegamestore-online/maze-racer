/** localStorage-backed total wins, so the score survives a reload. */
const KEY = "mazeracer_wins";

export function readWins(): number {
  try {
    const v = parseInt(localStorage.getItem(KEY) ?? "", 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function writeWins(wins: number): void {
  try {
    localStorage.setItem(KEY, String(wins));
  } catch {
    // storage unavailable — ignore
  }
}
