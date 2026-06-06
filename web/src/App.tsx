/**
 * Maze Racer — FreeGameStore game
 *
 * Race a FAGS heuristic AI through a procedurally generated maze.
 * Pac-Man style: set direction, auto-run until wall.
 * AI explores blind — never pre-solves. Smartness = how often it
 * picks the best neighbor vs random.
 *
 * Input buffering: queues next direction so you can press ahead of
 * turns. Held keys tracked so diagonal input (up+right) tries both.
 */

import { GameShell, GameTopbar } from "@freegamestore/games";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  generateMaze,
  solve,
  createBlindRunner,
  type Maze,
  type Pos,
  type MazeRunner,
} from "./lib/maze-solver";

const CELL = 18;

interface Difficulty {
  label: string;
  size: number;
  smartness: number;
  desc: string;
}

const DIFFS: Record<string, Difficulty> = {
  easy:   { label: "Easy",   size: 11, smartness: 0.2, desc: "drunk" },
  medium: { label: "Medium", size: 15, smartness: 0.5, desc: "coin-flip" },
  hard:   { label: "Hard",   size: 21, smartness: 0.8, desc: "smart" },
  expert: { label: "Expert", size: 31, smartness: 0.95, desc: "genius" },
};

interface AISpeed { label: string; ms: number }
const AI_SPEEDS: AISpeed[] = [
  { label: "Frozen",  ms: 9999 },
  { label: "Slow",    ms: 300 },
  { label: "Normal",  ms: 150 },
  { label: "Fast",    ms: 80 },
  { label: "Insane",  ms: 30 },
];

type Phase = "menu" | "playing" | "won" | "lost";
type Facing = "right" | "left" | "up" | "down";

export default function App() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [diffKey, setDiffKey] = useState("hard");
  const diff = DIFFS[diffKey]!;
  const [aiSpeedIdx, setAiSpeedIdx] = useState(2);
  const aiSpeed = AI_SPEEDS[aiSpeedIdx]!;
  const [maze, setMaze] = useState<Maze>(() => generateMaze(diff.size, diff.size));
  const [playerSteps, setPlayerSteps] = useState(0);
  const [aiSteps, setAiSteps] = useState(0);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [bestTime, setBestTime] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerPos = useRef<Pos>([...maze.start]);
  const playerFace = useRef<Facing>("right");
  // Current movement direction
  const playerDr = useRef(0);
  const playerDc = useRef(0);
  // Input buffer: queued next direction (applied when current direction hits wall)
  const bufDr = useRef(0);
  const bufDc = useRef(0);
  const hasBuf = useRef(false);
  // Currently held keys (for simultaneous press)
  const heldKeys = useRef(new Set<string>());
  const playerTrail = useRef(new Set([`${maze.start[0]},${maze.start[1]}`]));
  const aiRunner = useRef<MazeRunner | null>(null);
  const aiFace = useRef<Facing>("right");
  const aiTrail = useRef(new Set<string>());
  const aiTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const moveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTime = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const mazeRef = useRef(maze);
  mazeRef.current = maze;
  const aiMsRef = useRef(aiSpeed.ms);
  aiMsRef.current = aiSpeed.ms;

  const clearTimers = () => {
    if (aiTimer.current) { clearInterval(aiTimer.current); aiTimer.current = null; }
    if (moveTimer.current) { clearInterval(moveTimer.current); moveTimer.current = null; }
    if (clockTimer.current) { clearInterval(clockTimer.current); clockTimer.current = null; }
  };

  const newMaze = useCallback((dk?: string) => {
    const d = DIFFS[dk ?? diffKey]!;
    const m = generateMaze(d.size, d.size);
    setMaze(m);
    setPhase("menu");
    setPlayerSteps(0);
    setAiSteps(0);
    setElapsed(0);
    playerPos.current = [...m.start];
    playerFace.current = "right";
    playerDr.current = 0;
    playerDc.current = 0;
    bufDr.current = 0;
    bufDc.current = 0;
    hasBuf.current = false;
    heldKeys.current.clear();
    playerTrail.current = new Set([`${m.start[0]},${m.start[1]}`]);
    aiFace.current = "right";
    aiTrail.current = new Set();
    clearTimers();
    aiRunner.current = null;
  }, [diffKey]);

  const finishWin = useCallback(() => {
    setPhase("won");
    setScore(s => s + 1);
    clearTimers();
    const t = (performance.now() - startTime.current) / 1000;
    setElapsed(t);
    setBestTime(prev => prev === null ? t : Math.min(prev, t));
  }, []);

  const canMove = (mz: Maze, cr: number, cc: number, dr: number, dc: number) => {
    const nr = cr + dr, nc = cc + dc;
    return nr >= 0 && nr < mz.rows && nc >= 0 && nc < mz.cols && mz.grid[nr]![nc] === 0;
  };

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
    bufDr.current = 0;
    bufDc.current = 0;
    hasBuf.current = false;
    heldKeys.current.clear();
    setPlayerSteps(0);
    setAiSteps(0);
    setElapsed(0);
    startTime.current = performance.now();

    clockTimer.current = setInterval(() => {
      if (phaseRef.current === "playing") setElapsed((performance.now() - startTime.current) / 1000);
    }, 100);

    // AI — always blind, never pre-solves
    const runner = createBlindRunner(m, d.smartness);
    aiRunner.current = runner;
    aiFace.current = "right";

    let aiAccum = 0;
    let lastAiTick = performance.now();
    aiTimer.current = setInterval(() => {
      if (!aiRunner.current || aiRunner.current.done) {
        if (aiRunner.current?.won) {
          setPhase(p => p === "playing" ? "lost" : p);
          clearTimers();
          setElapsed((performance.now() - startTime.current) / 1000);
        }
        return;
      }
      const now = performance.now();
      aiAccum += now - lastAiTick;
      lastAiTick = now;
      const ms = aiMsRef.current;
      while (aiAccum >= ms && aiRunner.current && !aiRunner.current.done) {
        const dir = aiRunner.current.step();
        if (dir) aiFace.current = dir as Facing;
        const [r, c] = aiRunner.current.pos;
        aiTrail.current.add(`${r},${c}`);
        setAiSteps(aiRunner.current.steps);
        aiAccum -= ms;
      }
    }, 16);

    // Player auto-move with input buffering
    moveTimer.current = setInterval(() => {
      if (phaseRef.current !== "playing") return;
      const mz = mazeRef.current;
      const [cr, cc] = playerPos.current;
      let dr = playerDr.current, dc = playerDc.current;

      // If buffered direction exists and current direction is blocked, switch
      if (hasBuf.current && !canMove(mz, cr, cc, dr, dc)) {
        dr = bufDr.current;
        dc = bufDc.current;
        playerDr.current = dr;
        playerDc.current = dc;
        hasBuf.current = false;
        if (dc > 0) playerFace.current = "right";
        else if (dc < 0) playerFace.current = "left";
        else if (dr < 0) playerFace.current = "up";
        else if (dr > 0) playerFace.current = "down";
      }

      // Also try buffered direction if it's passable (even if current isn't blocked yet)
      if (hasBuf.current && canMove(mz, cr, cc, bufDr.current, bufDc.current)) {
        dr = bufDr.current;
        dc = bufDc.current;
        playerDr.current = dr;
        playerDc.current = dc;
        hasBuf.current = false;
        if (dc > 0) playerFace.current = "right";
        else if (dc < 0) playerFace.current = "left";
        else if (dr < 0) playerFace.current = "up";
        else if (dr > 0) playerFace.current = "down";
      }

      if (dr === 0 && dc === 0) return;

      if (canMove(mz, cr, cc, dr, dc)) {
        const nr = cr + dr, nc = cc + dc;
        playerPos.current = [nr, nc];
        playerTrail.current.add(`${nr},${nc}`);
        setPlayerSteps(s => s + 1);
        if (nr === mz.exit[0] && nc === mz.exit[1]) finishWin();
      }
      // Wall: keep direction, wait for buffer or new input
    }, 90);
  }, [diffKey, finishWin]);

  // Input: track held keys, buffer directions
  useEffect(() => {
    const dirMap: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
      w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
    };

    const applyDir = (dr: number, dc: number) => {
      if (phaseRef.current !== "playing") return;
      const face: Facing = dc > 0 ? "right" : dc < 0 ? "left" : dr < 0 ? "up" : "down";
      // If this is a different direction than current, buffer it
      if (dr !== playerDr.current || dc !== playerDc.current) {
        // If player is currently stopped or this direction works immediately, apply it
        const mz = mazeRef.current;
        const [cr, cc] = playerPos.current;
        if ((playerDr.current === 0 && playerDc.current === 0) || canMove(mz, cr, cc, dr, dc)) {
          playerDr.current = dr;
          playerDc.current = dc;
          playerFace.current = face;
          hasBuf.current = false;
        } else {
          // Buffer it for the next tick
          bufDr.current = dr;
          bufDc.current = dc;
          hasBuf.current = true;
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const dir = dirMap[e.key];
      if (dir) {
        e.preventDefault();
        heldKeys.current.add(e.key);
        applyDir(dir[0], dir[1]);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (phaseRef.current === "menu") startRace();
        else if (phaseRef.current === "won" || phaseRef.current === "lost") newMaze();
      }
      if (e.key === "n" || e.key === "N") { e.preventDefault(); newMaze(); }
      if (e.key === "1") { setDiffKey("easy"); newMaze("easy"); }
      if (e.key === "2") { setDiffKey("medium"); newMaze("medium"); }
      if (e.key === "3") { setDiffKey("hard"); newMaze("hard"); }
      if (e.key === "4") { setDiffKey("expert"); newMaze("expert"); }
      if (e.key === "-" || e.key === "[") { e.preventDefault(); setAiSpeedIdx(i => Math.max(0, i - 1)); }
      if (e.key === "=" || e.key === "+" || e.key === "]") { e.preventDefault(); setAiSpeedIdx(i => Math.min(AI_SPEEDS.length - 1, i + 1)); }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeys.current.delete(e.key);
      // If current direction key was released, check if another direction is still held
      if (dirMap[e.key] && phaseRef.current === "playing") {
        // Find a still-held direction key
        for (const held of heldKeys.current) {
          const d = dirMap[held];
          if (d) { applyDir(d[0], d[1]); return; }
        }
      }
    };

    let touchXY: { x: number; y: number } | null = null;
    const onTS = (e: TouchEvent) => { const t = e.touches[0]; if (t) touchXY = { x: t.clientX, y: t.clientY }; };
    const onTE = (e: TouchEvent) => {
      if (!touchXY) return;
      const t = e.changedTouches[0]; if (!t) return;
      const dx = t.clientX - touchXY.x, dy = t.clientY - touchXY.y;
      touchXY = null;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) applyDir(0, dx > 0 ? 1 : -1);
      else applyDir(dy > 0 ? 1 : -1, 0);
    };

    // Expose for d-pad
    (window as any).__mazeSetDir = applyDir;

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("touchstart", onTS, { passive: true });
    window.addEventListener("touchend", onTE, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("touchstart", onTS);
      window.removeEventListener("touchend", onTE);
    };
  }, [startRace, newMaze]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf: number;
    let frame = 0;

    const pacman = (cx: number, cy: number, r: number, face: Facing, color: string) => {
      const angles: Record<Facing, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
      const ang = angles[face];
      const mouth = 0.05 + Math.abs(Math.sin(frame * 0.15)) * 0.35;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, ang + mouth, ang + Math.PI * 2 - mouth);
      ctx.closePath();
      ctx.fill();
      const ed = r * 0.35, ea = ang - 0.55;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ea) * ed, cy + Math.sin(ea) * ed, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ea) * ed + 0.5, cy + Math.sin(ea) * ed - 0.5, r * 0.06, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = () => {
      frame++;
      const mz = mazeRef.current;
      canvas.width = mz.cols * CELL;
      canvas.height = mz.rows * CELL;
      const dk = matchMedia("(prefers-color-scheme: dark)").matches;

      for (let r = 0; r < mz.rows; r++) {
        for (let c = 0; c < mz.cols; c++) {
          const k = `${r},${c}`;
          const wall = mz.grid[r]![c] === 1;
          if (wall) {
            ctx.fillStyle = dk ? "#1e1b4b" : "#6366f1";
            ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
            ctx.fillStyle = dk ? "#2e1f6b" : "#818cf8";
            ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2);
          } else {
            ctx.fillStyle = playerTrail.current.has(k) ? (dk ? "rgba(250,204,21,0.08)" : "rgba(250,204,21,0.12)")
              : aiTrail.current.has(k) ? (dk ? "rgba(168,85,247,0.08)" : "rgba(168,85,247,0.08)")
              : (dk ? "#0a0a0a" : "#f8fafc");
            ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
          }
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

      // Exit — pulsing
      const pulse = 0.7 + Math.sin(frame * 0.08) * 0.3;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(mz.exit[1] * CELL + CELL / 2, mz.exit[0] * CELL + CELL / 2, CELL / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = dk ? "#0a0a0a" : "#fff";
      ctx.font = `bold ${CELL - 4}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\u2605", mz.exit[1] * CELL + CELL / 2, mz.exit[0] * CELL + CELL / 2 + 1);

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

  const fmtTime = (t: number) => t < 60 ? `${t.toFixed(1)}s` : `${Math.floor(t / 60)}:${(t % 60).toFixed(0).padStart(2, "0")}`;

  // Only compute optimal on win/loss (never during play — no cheating)
  const optSteps = (phase === "won" || phase === "lost") ? solve(maze, "astar").path.length - 1 : null;

  const dpad = (label: string, dr: number, dc: number) => (
    <button
      onPointerDown={(e) => { e.preventDefault(); (window as any).__mazeSetDir?.(dr, dc); }}
      style={{ width: 44, height: 44, borderRadius: 10, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)", fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", touchAction: "manipulation", userSelect: "none" }}
    >{label}</button>
  );

  return (
    <GameShell topbar={
      <GameTopbar title={`Maze Racer  Lvl ${level}`} score={score} actions={
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          {Object.entries(DIFFS).map(([k, d]) => (
            <button key={k} onClick={() => { setDiffKey(k); newMaze(k); }}
              style={{ background: diffKey === k ? "var(--accent)" : "var(--panel)", color: diffKey === k ? "#fff" : "var(--muted)", border: `1px solid ${diffKey === k ? "var(--accent)" : "var(--line)"}`, borderRadius: 8, padding: "2px 7px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              {d.label}
            </button>
          ))}
          <span style={{ color: "var(--line)", fontSize: 10 }}>|</span>
          <span style={{ fontSize: 10, color: "var(--muted)" }}>AI:</span>
          {AI_SPEEDS.map((s, i) => (
            <button key={s.label} onClick={() => setAiSpeedIdx(i)}
              style={{ background: aiSpeedIdx === i ? "#a855f7" : "var(--panel)", color: aiSpeedIdx === i ? "#fff" : "var(--muted)", border: `1px solid ${aiSpeedIdx === i ? "#a855f7" : "var(--line)"}`, borderRadius: 8, padding: "2px 6px", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
              {s.label}
            </button>
          ))}
        </div>
      } />
    }>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 6, padding: 8 }}>

        {/* Scoreboard */}
        <div style={{ display: "flex", gap: 12, fontSize: 12, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
          <span style={{ color: "#facc15", fontWeight: 600 }}>You: {playerSteps}</span>
          <span style={{ color: "#a855f7", fontWeight: 600 }}>AI ({diff.desc}): {aiSteps}</span>
          <span style={{ fontFamily: "monospace", color: "var(--muted)", fontSize: 13 }}>{fmtTime(elapsed)}</span>
          {bestTime !== null && <span style={{ color: "var(--muted)", fontSize: 10 }}>Best: {fmtTime(bestTime)}</span>}
        </div>

        {/* Canvas */}
        <canvas ref={canvasRef} style={{ borderRadius: "var(--radius)", border: "2px solid var(--line)", imageRendering: "pixelated", maxWidth: "100%", maxHeight: "50vh" }} />

        {/* Mobile D-pad */}
        <div style={{ display: "grid", gridTemplateColumns: "44px 44px 44px", gridTemplateRows: "44px 44px", gap: 4 }}>
          <div />
          {dpad("\u25B2", -1, 0)}
          <div />
          {dpad("\u25C0", 0, -1)}
          {dpad("\u25BC", 1, 0)}
          {dpad("\u25B6", 0, 1)}
        </div>

        {phase === "menu" && (
          <div style={{ textAlign: "center" }}>
            <button onClick={startRace} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius)", padding: "10px 32px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Start Race
            </button>
            <p style={{ color: "var(--muted)", fontSize: 10, marginTop: 4 }}>
              Arrows/WASD = steer (buffered) | Space = start | N = new | 1-4 = maze | -/+ = AI speed
            </p>
          </div>
        )}

        {phase === "won" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "var(--success)", fontWeight: 700, fontSize: 16, fontFamily: "Fraunces, serif" }}>You Win Level {level}!</p>
            <p style={{ color: "var(--muted)", fontSize: 11 }}>
              {fmtTime(elapsed)} | You: {playerSteps} | AI: {aiSteps}{optSteps != null ? ` | Optimal: ${optSteps}` : ""}
            </p>
            <button onClick={() => { setLevel(l => l + 1); const keys = Object.keys(DIFFS); const ni = Math.min(keys.indexOf(diffKey) + 1, keys.length - 1); setDiffKey(keys[ni]!); newMaze(keys[ni]!); }}
              style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius)", padding: "8px 24px", fontSize: 13, fontWeight: 600, marginTop: 4, cursor: "pointer" }}>
              Next Level
            </button>
          </div>
        )}

        {phase === "lost" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "var(--error)", fontWeight: 700, fontSize: 16, fontFamily: "Fraunces, serif" }}>AI Wins</p>
            <p style={{ color: "var(--muted)", fontSize: 11 }}>AI: {aiSteps} | You: {playerSteps}{optSteps != null ? ` | Optimal: ${optSteps}` : ""} | {fmtTime(elapsed)}</p>
            <button onClick={() => newMaze()}
              style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius)", padding: "8px 24px", fontSize: 13, fontWeight: 600, marginTop: 4, cursor: "pointer" }}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </GameShell>
  );
}
