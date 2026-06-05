/**
 * Maze Racer — FreeGameStore game
 *
 * Race a FAGS heuristic AI through a procedurally generated maze.
 * The AI uses the maze-solver agent from FreeAgentStore (vendored).
 * Arrow keys / WASD / swipe to move. Beat the purple AI to the red exit.
 *
 * Cross-store demo: FGS game consuming a FAGS agent as a library.
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
const AI_STEP_MS = 100;

type Phase = "menu" | "playing" | "won" | "lost";

export default function App() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [size, setSize] = useState(21);
  const [strategy, setStrategy] = useState<Strategy>("astar");
  const [maze, setMaze] = useState<Maze>(() => generateMaze(21, 21));
  const [playerSteps, setPlayerSteps] = useState(0);
  const [aiSteps, setAiSteps] = useState(0);
  const [score, setScore] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerPos = useRef<Pos>([...maze.start]);
  const playerTrail = useRef<Set<string>>(new Set());
  const aiRunner = useRef<MazeRunner | null>(null);
  const aiTrail = useRef<Set<string>>(new Set());
  const aiTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetGame = useCallback((newSize?: number) => {
    const s = newSize ?? size;
    const m = generateMaze(s, s);
    setMaze(m);
    setPhase("menu");
    setPlayerSteps(0);
    setAiSteps(0);
    playerPos.current = [...m.start];
    playerTrail.current = new Set([`${m.start[0]},${m.start[1]}`]);
    aiTrail.current = new Set();
    if (aiTimer.current) clearInterval(aiTimer.current);
    aiRunner.current = null;
  }, [size]);

  const startRace = useCallback(() => {
    setPhase("playing");
    playerTrail.current = new Set([`${maze.start[0]},${maze.start[1]}`]);
    aiTrail.current = new Set([`${maze.start[0]},${maze.start[1]}`]);
    playerPos.current = [...maze.start];
    setPlayerSteps(0);
    setAiSteps(0);

    const runner = createRunner(maze, strategy);
    aiRunner.current = runner;

    aiTimer.current = setInterval(() => {
      if (!aiRunner.current || aiRunner.current.done) {
        if (aiTimer.current) clearInterval(aiTimer.current);
        if (aiRunner.current?.won) {
          setPhase((p) => (p === "playing" ? "lost" : p));
        }
        return;
      }
      aiRunner.current.step();
      const [r, c] = aiRunner.current.pos;
      aiTrail.current.add(`${r},${c}`);
      setAiSteps(aiRunner.current.steps);
    }, AI_STEP_MS);
  }, [maze, strategy]);

  // Player keyboard input
  useEffect(() => {
    const move = (dr: number, dc: number) => {
      if (phase !== "playing") return;
      const [cr, cc] = playerPos.current;
      const nr = cr + dr;
      const nc = cc + dc;
      if (nr >= 0 && nr < maze.rows && nc >= 0 && nc < maze.cols && maze.grid[nr]![nc] === 0) {
        playerPos.current = [nr, nc];
        playerTrail.current.add(`${nr},${nc}`);
        setPlayerSteps((s) => s + 1);
        if (nr === maze.exit[0] && nc === maze.exit[1]) {
          setPhase("won");
          setScore((s) => s + 1);
          if (aiTimer.current) clearInterval(aiTimer.current);
        }
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, [number, number]> = {
        ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
        w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
      };
      const dir = map[e.key];
      if (dir) { e.preventDefault(); move(dir[0], dir[1]); }
    };

    // Touch/swipe support
    let touchStart: { x: number; y: number } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) touchStart = { x: t.clientX, y: t.clientY };
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        move(0, dx > 0 ? 1 : -1);
      } else {
        move(dy > 0 ? 1 : -1, 0);
      }
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [phase, maze]);

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf: number;

    const draw = () => {
      const w = maze.cols * CELL;
      const h = maze.rows * CELL;
      canvas.width = w;
      canvas.height = h;

      const isDark = matchMedia("(prefers-color-scheme: dark)").matches;

      for (let r = 0; r < maze.rows; r++) {
        for (let c = 0; c < maze.cols; c++) {
          const k = `${r},${c}`;
          const isWall = maze.grid[r]![c] === 1;
          ctx.fillStyle = isWall
            ? (isDark ? "#1a1a1a" : "#d1d5db")
            : playerTrail.current.has(k)
              ? (isDark ? "rgba(34,197,94,0.15)" : "rgba(34,197,94,0.2)")
              : aiTrail.current.has(k)
                ? (isDark ? "rgba(124,58,237,0.15)" : "rgba(124,58,237,0.15)")
                : (isDark ? "#262626" : "#ffffff");
          ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
        }
      }

      // Start (blue) / Exit (red)
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(maze.start[1] * CELL + 2, maze.start[0] * CELL + 2, CELL - 4, CELL - 4);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(maze.exit[1] * CELL + 2, maze.exit[0] * CELL + 2, CELL - 4, CELL - 4);

      // AI (purple circle)
      if (aiRunner.current) {
        const [ar, ac] = aiRunner.current.pos;
        ctx.fillStyle = "#7c3aed";
        ctx.beginPath();
        ctx.arc(ac * CELL + CELL / 2, ar * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Player (green circle)
      const [pr, pc] = playerPos.current;
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(pc * CELL + CELL / 2, pr * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [maze]);

  // Cleanup
  useEffect(() => () => { if (aiTimer.current) clearInterval(aiTimer.current); }, []);

  const optimal = solve(maze, "astar");

  const topbarActions = (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <select
        value={size}
        onChange={(e) => { const v = Number(e.target.value); setSize(v); resetGame(v); }}
        style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: "4px 8px", fontSize: 12, color: "var(--ink)" }}
      >
        <option value={11}>11x11</option>
        <option value={15}>15x15</option>
        <option value={21}>21x21</option>
        <option value={31}>31x31</option>
      </select>
      <select
        value={strategy}
        onChange={(e) => setStrategy(e.target.value as Strategy)}
        style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: "4px 8px", fontSize: 12, color: "var(--ink)" }}
      >
        <option value="astar">A*</option>
        <option value="bfs">BFS</option>
        <option value="greedy">Greedy</option>
        <option value="wall-follower">Wall Follower</option>
        <option value="dead-end-fill">Dead-End Fill</option>
      </select>
    </div>
  );

  return (
    <GameShell topbar={<GameTopbar title="Maze Racer" score={score} actions={topbarActions} />}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, padding: 16 }}>

        {/* Scoreboard */}
        <div style={{ display: "flex", gap: 24, fontSize: 13 }}>
          <span>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#22c55e", marginRight: 4 }} />
            You: <b>{playerSteps}</b>
          </span>
          <span>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#7c3aed", marginRight: 4 }} />
            AI ({strategy}): <b>{aiSteps}</b>
          </span>
          <span style={{ color: "var(--muted)", fontSize: 11 }}>
            Optimal: {optimal.path.length - 1} steps
          </span>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          style={{ borderRadius: "var(--radius)", border: "1px solid var(--line)", imageRendering: "pixelated", maxWidth: "100%", maxHeight: "60vh" }}
        />

        {/* Controls */}
        {phase === "menu" && (
          <div style={{ textAlign: "center" }}>
            <button
              onClick={startRace}
              style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius)", padding: "10px 32px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              Start Race
            </button>
            <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>
              Arrow keys / WASD / swipe. Beat the purple AI to the red exit.
            </p>
            <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 4, opacity: 0.6 }}>
              AI powered by <code>@freeagentstore/maze-solver</code> — vendored from FAGS
            </p>
          </div>
        )}

        {phase === "won" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "var(--success)", fontWeight: 700, fontSize: 18, fontFamily: "Fraunces, serif" }}>
              You Win!
            </p>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              You: {playerSteps} steps — AI: {aiSteps} steps
            </p>
            <button
              onClick={() => resetGame()}
              style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius)", padding: "8px 24px", fontSize: 13, fontWeight: 600, marginTop: 8, cursor: "pointer" }}
            >
              Play Again
            </button>
          </div>
        )}

        {phase === "lost" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "var(--error)", fontWeight: 700, fontSize: 18, fontFamily: "Fraunces, serif" }}>
              AI Wins
            </p>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              AI: {aiSteps} steps — You: {playerSteps} steps
            </p>
            <button
              onClick={() => resetGame()}
              style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius)", padding: "8px 24px", fontSize: 13, fontWeight: 600, marginTop: 8, cursor: "pointer" }}
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </GameShell>
  );
}
