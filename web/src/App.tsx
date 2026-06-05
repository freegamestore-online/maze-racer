/**
 * Maze Racer — FreeGameStore game
 *
 * Race a FAGS heuristic AI through a procedurally generated maze.
 * Pac-Man style: set direction, auto-run until wall.
 * Both pac-mans show facing direction with open mouth.
 * Difficulty levels control AI speed + maze size + strategy.
 *
 * Cross-store demo: FGS game consuming FAGS maze-solver agent.
 */

import { GameShell, GameTopbar } from "@freegamestore/games";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  generateMaze,
  solve,
  createRunner,
  type Maze,
  type Strategy,
  type Pos,
  type MazeRunner,
} from "./lib/maze-solver";

const CELL = 18;

interface Difficulty {
  label: string;
  size: number;
  aiMs: number;
  strategy: Strategy;
}

const DIFFS: Record<string, Difficulty> = {
  easy:   { label: "Easy",   size: 11, aiMs: 200, strategy: "greedy" },
  medium: { label: "Medium", size: 15, aiMs: 140, strategy: "wall-follower" },
  hard:   { label: "Hard",   size: 21, aiMs: 100, strategy: "astar" },
  expert: { label: "Expert", size: 31, aiMs: 60,  strategy: "astar" },
};

type Phase = "menu" | "playing" | "won" | "lost";
type Facing = "right" | "left" | "up" | "down";

export default function App() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [diffKey, setDiffKey] = useState("hard");
  const diff = DIFFS[diffKey]!;
  const [maze, setMaze] = useState<Maze>(() => generateMaze(diff.size, diff.size));
  const [playerSteps, setPlayerSteps] = useState(0);
  const [aiSteps, setAiSteps] = useState(0);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerPos = useRef<Pos>([...maze.start]);
  const playerFace = useRef<Facing>("right");
  const playerDr = useRef(0);
  const playerDc = useRef(1);
  const playerTrail = useRef(new Set([`${maze.start[0]},${maze.start[1]}`]));
  const aiRunner = useRef<MazeRunner | null>(null);
  const aiFace = useRef<Facing>("right");
  const aiTrail = useRef(new Set<string>());
  const aiTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const moveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const mazeRef = useRef(maze);
  mazeRef.current = maze;

  const clearTimers = () => {
    if (aiTimer.current) { clearInterval(aiTimer.current); aiTimer.current = null; }
    if (moveTimer.current) { clearInterval(moveTimer.current); moveTimer.current = null; }
  };

  const newMaze = useCallback((dk?: string) => {
    const d = DIFFS[dk ?? diffKey]!;
    const m = generateMaze(d.size, d.size);
    setMaze(m);
    setPhase("menu");
    setPlayerSteps(0);
    setAiSteps(0);
    playerPos.current = [...m.start];
    playerFace.current = "right";
    playerDr.current = 0;
    playerDc.current = 0;
    playerTrail.current = new Set([`${m.start[0]},${m.start[1]}`]);
    aiFace.current = "right";
    aiTrail.current = new Set();
    clearTimers();
    aiRunner.current = null;
  }, [diffKey]);

  const startRace = useCallback(() => {
    const d = DIFFS[diffKey]!;
    const m = mazeRef.current;
    setPhase("playing");
    playerTrail.current = new Set([`${m.start[0]},${m.start[1]}`]);
    aiTrail.current = new Set([`${m.start[0]},${m.start[1]}`]);
    playerPos.current = [...m.start];
    playerFace.current = "right";
    playerDr.current = 0;
    playerDc.current = 0;
    setPlayerSteps(0);
    setAiSteps(0);

    const runner = createRunner(m, d.strategy);
    aiRunner.current = runner;
    aiFace.current = "right";

    aiTimer.current = setInterval(() => {
      if (!aiRunner.current || aiRunner.current.done) {
        if (aiTimer.current) clearInterval(aiTimer.current);
        if (aiRunner.current?.won) {
          setPhase(p => p === "playing" ? "lost" : p);
          if (moveTimer.current) clearInterval(moveTimer.current);
        }
        return;
      }
      const dir = aiRunner.current.step();
      if (dir === "right") aiFace.current = "right";
      else if (dir === "left") aiFace.current = "left";
      else if (dir === "up") aiFace.current = "up";
      else if (dir === "down") aiFace.current = "down";
      const [r, c] = aiRunner.current.pos;
      aiTrail.current.add(`${r},${c}`);
      setAiSteps(aiRunner.current.steps);
    }, d.aiMs);

    // Player auto-move (pac-man: runs in set direction until wall)
    moveTimer.current = setInterval(() => {
      if (phaseRef.current !== "playing") return;
      const dr = playerDr.current;
      const dc = playerDc.current;
      if (dr === 0 && dc === 0) return;
      const mz = mazeRef.current;
      const [cr, cc] = playerPos.current;
      const nr = cr + dr;
      const nc = cc + dc;
      if (nr >= 0 && nr < mz.rows && nc >= 0 && nc < mz.cols && mz.grid[nr]![nc] === 0) {
        playerPos.current = [nr, nc];
        playerTrail.current.add(`${nr},${nc}`);
        setPlayerSteps(s => s + 1);
        if (nr === mz.exit[0] && nc === mz.exit[1]) {
          setPhase("won");
          setScore(s => s + 1);
          clearTimers();
        }
      }
      // Wall hit: stop auto-run, keep facing direction
    }, 90);
  }, [diffKey]);

  // Keyboard / touch: set direction
  useEffect(() => {
    const setDir = (dr: number, dc: number) => {
      if (phaseRef.current !== "playing") return;
      playerDr.current = dr;
      playerDc.current = dc;
      if (dc > 0) playerFace.current = "right";
      else if (dc < 0) playerFace.current = "left";
      else if (dr < 0) playerFace.current = "up";
      else if (dr > 0) playerFace.current = "down";
    };

    const onKey = (e: KeyboardEvent) => {
      // Game controls
      const dirs: Record<string, [number, number]> = {
        ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
        w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
      };
      const dir = dirs[e.key];
      if (dir) { e.preventDefault(); setDir(dir[0], dir[1]); return; }

      // Keyboard shortcuts
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (phaseRef.current === "menu") startRace();
        else if (phaseRef.current === "won" || phaseRef.current === "lost") newMaze();
      }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); newMaze(); }
      if (e.key === "1") { setDiffKey("easy"); newMaze("easy"); }
      if (e.key === "2") { setDiffKey("medium"); newMaze("medium"); }
      if (e.key === "3") { setDiffKey("hard"); newMaze("hard"); }
      if (e.key === "4") { setDiffKey("expert"); newMaze("expert"); }
    };

    let touchXY: { x: number; y: number } | null = null;
    const onTS = (e: TouchEvent) => { const t = e.touches[0]; if (t) touchXY = { x: t.clientX, y: t.clientY }; };
    const onTE = (e: TouchEvent) => {
      if (!touchXY) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - touchXY.x, dy = t.clientY - touchXY.y;
      touchXY = null;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) setDir(0, dx > 0 ? 1 : -1);
      else setDir(dy > 0 ? 1 : -1, 0);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTS, { passive: true });
    window.addEventListener("touchend", onTE, { passive: true });
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("touchstart", onTS); window.removeEventListener("touchend", onTE); };
  }, [startRace, newMaze]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf: number;

    const pacman = (cx: number, cy: number, r: number, face: Facing, color: string) => {
      const a: Record<Facing, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
      const ang = a[face];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, ang + 0.3, ang + Math.PI * 2 - 0.3);
      ctx.closePath();
      ctx.fill();
      // Eye
      const ed = r * 0.35, ea = ang - 0.5;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ea) * ed, cy + Math.sin(ea) * ed, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = () => {
      const mz = mazeRef.current;
      canvas.width = mz.cols * CELL;
      canvas.height = mz.rows * CELL;
      const dk = matchMedia("(prefers-color-scheme: dark)").matches;

      for (let r = 0; r < mz.rows; r++) {
        for (let c = 0; c < mz.cols; c++) {
          const k = `${r},${c}`;
          const wall = mz.grid[r]![c] === 1;
          ctx.fillStyle = wall ? (dk ? "#1e1b4b" : "#6366f1")
            : playerTrail.current.has(k) ? (dk ? "rgba(250,204,21,0.1)" : "rgba(250,204,21,0.15)")
            : aiTrail.current.has(k) ? (dk ? "rgba(168,85,247,0.1)" : "rgba(168,85,247,0.1)")
            : (dk ? "#0a0a0a" : "#f8fafc");
          ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
        }
      }

      // Dots
      ctx.fillStyle = dk ? "#333" : "#cbd5e1";
      for (let r = 0; r < mz.rows; r++) {
        for (let c = 0; c < mz.cols; c++) {
          if (mz.grid[r]![c] === 1) continue;
          const k = `${r},${c}`;
          if (playerTrail.current.has(k) || aiTrail.current.has(k)) continue;
          ctx.beginPath();
          ctx.arc(c * CELL + CELL / 2, r * CELL + CELL / 2, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Exit
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(mz.exit[1] * CELL + CELL / 2, mz.exit[0] * CELL + CELL / 2, CELL / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dk ? "#0a0a0a" : "#fff";
      ctx.font = `bold ${CELL - 6}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("X", mz.exit[1] * CELL + CELL / 2, mz.exit[0] * CELL + CELL / 2 + 1);

      // AI
      if (aiRunner.current) {
        const [ar, ac] = aiRunner.current.pos;
        pacman(ac * CELL + CELL / 2, ar * CELL + CELL / 2, CELL / 2 - 1, aiFace.current, "#a855f7");
      }

      // Player
      const [pr, pc] = playerPos.current;
      pacman(pc * CELL + CELL / 2, pr * CELL + CELL / 2, CELL / 2 - 1, playerFace.current, "#facc15");

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [maze]);

  useEffect(() => () => clearTimers(), []);

  const opt = solve(maze, "astar");

  return (
    <GameShell topbar={
      <GameTopbar title={`Maze Racer  Lvl ${level}`} score={score} actions={
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {Object.entries(DIFFS).map(([k, d]) => (
            <button key={k} onClick={() => { setDiffKey(k); newMaze(k); }}
              style={{ background: diffKey === k ? "var(--accent)" : "var(--panel)", color: diffKey === k ? "#fff" : "var(--muted)", border: `1px solid ${diffKey === k ? "var(--accent)" : "var(--line)"}`, borderRadius: 8, padding: "2px 7px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              {d.label}
            </button>
          ))}
        </div>
      } />
    }>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, padding: 8 }}>

        <div style={{ display: "flex", gap: 16, fontSize: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <span>&#x1F7E1; You: <b>{playerSteps}</b></span>
          <span>&#x1F7E3; AI ({diff.strategy}): <b>{aiSteps}</b></span>
          <span style={{ color: "var(--muted)", fontSize: 11 }}>Best: {opt.path.length - 1} | {diff.aiMs}ms</span>
        </div>

        <canvas ref={canvasRef} style={{ borderRadius: "var(--radius)", border: "2px solid var(--line)", imageRendering: "pixelated", maxWidth: "100%", maxHeight: "55vh" }} />

        {phase === "menu" && (
          <div style={{ textAlign: "center" }}>
            <button onClick={startRace} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius)", padding: "10px 32px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Start Race
            </button>
            <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 6 }}>
              Arrows/WASD = direction (auto-runs). Space/Enter = start. R = new maze. 1-4 = difficulty.
            </p>
          </div>
        )}

        {phase === "won" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "var(--success)", fontWeight: 700, fontSize: 18, fontFamily: "Fraunces, serif" }}>You Win Level {level}!</p>
            <p style={{ color: "var(--muted)", fontSize: 12 }}>You: {playerSteps} | AI: {aiSteps} | Best: {opt.path.length - 1}</p>
            <button onClick={() => { setLevel(l => l + 1); const keys = Object.keys(DIFFS); const ni = Math.min(keys.indexOf(diffKey) + 1, keys.length - 1); setDiffKey(keys[ni]!); newMaze(keys[ni]!); }}
              style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius)", padding: "8px 24px", fontSize: 13, fontWeight: 600, marginTop: 6, cursor: "pointer" }}>
              Next Level (Enter)
            </button>
          </div>
        )}

        {phase === "lost" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "var(--error)", fontWeight: 700, fontSize: 18, fontFamily: "Fraunces, serif" }}>AI Wins</p>
            <p style={{ color: "var(--muted)", fontSize: 12 }}>AI: {aiSteps} | You: {playerSteps}</p>
            <button onClick={() => newMaze()}
              style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius)", padding: "8px 24px", fontSize: 13, fontWeight: 600, marginTop: 6, cursor: "pointer" }}>
              Try Again (Enter)
            </button>
          </div>
        )}
      </div>
    </GameShell>
  );
}
