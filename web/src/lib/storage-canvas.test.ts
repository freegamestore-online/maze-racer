import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { syncCanvasSize } from "./canvas";
import { readWins, writeWins } from "./wins";

describe("syncCanvasSize", () => {
  it("only assigns width/height when the size changes", () => {
    let writes = 0;
    let w = 0, h = 0;
    const canvas = {
      get width() { return w; }, set width(v) { writes++; w = v; },
      get height() { return h; }, set height(v) { writes++; h = v; },
    };
    expect(syncCanvasSize(canvas, 100, 50)).toBe(true);
    expect(writes).toBe(2);
    expect(syncCanvasSize(canvas, 100, 50)).toBe(false);
    expect(writes).toBe(2);
    expect(syncCanvasSize(canvas, 120, 50)).toBe(true);
  });
});

describe("wins persistence", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("round-trips the win count", () => {
    expect(readWins()).toBe(0);
    writeWins(3);
    expect(readWins()).toBe(3);
  });

  it("treats garbage as zero", () => {
    localStorage.setItem("mazeracer_wins", "abc");
    expect(readWins()).toBe(0);
  });

  it("survives storage being unavailable", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } });
    expect(readWins()).toBe(0);
    expect(() => writeWins(1)).not.toThrow();
  });
});
