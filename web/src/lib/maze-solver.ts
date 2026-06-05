/**
 * Maze Solver — heuristic pathfinding agent.
 *
 * Solves grid mazes with multiple strategies. Each strategy is a
 * self-contained heuristic — deterministic, zero-model, sub-millisecond.
 *
 * The maze is a 2D grid: 0 = open, 1 = wall.
 * Coordinates are [row, col].
 *
 * Strategies:
 * - bfs: Breadth-first search (optimal path, explores everything)
 * - astar: A* with Manhattan distance (optimal, explores less)
 * - wall-follower: Right-hand rule (fast, not always optimal)
 * - dead-end-fill: Fill dead ends then walk (fast preprocessing)
 * - greedy: Always move toward exit (fast, gets stuck in traps)
 *
 * This agent is importable by FGS games:
 *   import { solve, step, createRunner } from '@freeagentstore/maze-solver'
 */

export type Cell = 0 | 1; // 0 = open, 1 = wall
export type Pos = [number, number]; // [row, col]
export type Strategy = 'bfs' | 'astar' | 'wall-follower' | 'dead-end-fill' | 'greedy';
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Maze {
  grid: Cell[][];
  rows: number;
  cols: number;
  start: Pos;
  exit: Pos;
}

export interface SolveResult {
  path: Pos[];
  explored: number;
  strategy: Strategy;
  timeMs: number;
  solved: boolean;
}

export interface MazeRunner {
  pos: Pos;
  path: Pos[];
  done: boolean;
  won: boolean;
  steps: number;
  /** Advance one step. Returns the direction moved. */
  step(): Direction | null;
}

const DIRS: [number, number, Direction][] = [
  [-1, 0, 'up'], [1, 0, 'down'], [0, -1, 'left'], [0, 1, 'right'],
];

// --- Core: solve the full path ---

export function solve(maze: Maze, strategy: Strategy = 'astar'): SolveResult {
  const start = performance.now();
  let result: { path: Pos[]; explored: number };

  switch (strategy) {
    case 'bfs': result = solveBFS(maze); break;
    case 'astar': result = solveAStar(maze); break;
    case 'wall-follower': result = solveWallFollower(maze); break;
    case 'dead-end-fill': result = solveDeadEndFill(maze); break;
    case 'greedy': result = solveGreedy(maze); break;
    default: result = solveAStar(maze);
  }

  return {
    path: result.path,
    explored: result.explored,
    strategy,
    timeMs: performance.now() - start,
    solved: result.path.length > 0,
  };
}

// --- Step-by-step runner (for animation / racing) ---

export function createRunner(maze: Maze, strategy: Strategy = 'astar'): MazeRunner {
  const { path } = solve(maze, strategy);
  let idx = 0;

  return {
    get pos() { return path[idx] ?? maze.start; },
    get path() { return path.slice(0, idx + 1); },
    get done() { return idx >= path.length - 1 || path.length === 0; },
    get won() { return path.length > 0 && idx >= path.length - 1; },
    get steps() { return idx; },

    step(): Direction | null {
      if (idx >= path.length - 1 || path.length === 0) return null;
      idx++;
      const [pr, pc] = path[idx - 1];
      const [cr, cc] = path[idx];
      if (cr < pr) return 'up';
      if (cr > pr) return 'down';
      if (cc < pc) return 'left';
      return 'right';
    },
  };
}

// --- Maze generation ---

export function generateMaze(rows: number, cols: number, seed?: number): Maze {
  // Ensure odd dimensions for proper maze generation
  const r = rows % 2 === 0 ? rows + 1 : rows;
  const c = cols % 2 === 0 ? cols + 1 : cols;

  // Start with all walls
  const grid: Cell[][] = Array.from({ length: r }, () => Array(c).fill(1) as Cell[]);

  // Simple seeded random
  let s = seed ?? (Date.now() % 100000);
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

  // Recursive backtracker
  const stack: Pos[] = [[1, 1]];
  grid[1][1] = 0;

  while (stack.length > 0) {
    const [cr, cc] = stack[stack.length - 1];
    const neighbors: Pos[] = [];

    for (const [dr, dc] of [[0, 2], [0, -2], [2, 0], [-2, 0]]) {
      const nr = cr + dr;
      const nc = cc + dc;
      if (nr > 0 && nr < r - 1 && nc > 0 && nc < c - 1 && grid[nr][nc] === 1) {
        neighbors.push([nr, nc]);
      }
    }

    if (neighbors.length === 0) {
      stack.pop();
    } else {
      const [nr, nc] = neighbors[Math.floor(rand() * neighbors.length)];
      // Carve passage
      grid[(cr + nr) / 2][(cc + nc) / 2] = 0;
      grid[nr][nc] = 0;
      stack.push([nr, nc]);
    }
  }

  const start: Pos = [1, 0];
  const exit: Pos = [r - 2, c - 1];
  grid[start[0]][start[1]] = 0;
  grid[exit[0]][exit[1]] = 0;

  return { grid, rows: r, cols: c, start, exit };
}

// --- Strategy implementations ---

function solveBFS(maze: Maze): { path: Pos[]; explored: number } {
  const { grid, rows, cols, start, exit } = maze;
  const visited = new Set<string>();
  const parent = new Map<string, string>();
  const queue: Pos[] = [start];
  visited.add(key(start));
  let explored = 0;

  while (queue.length > 0) {
    const pos = queue.shift()!;
    explored++;

    if (pos[0] === exit[0] && pos[1] === exit[1]) {
      return { path: reconstructPath(parent, start, exit), explored };
    }

    for (const [dr, dc] of DIRS) {
      const nr = pos[0] + dr;
      const nc = pos[1] + dc;
      const nk = `${nr},${nc}`;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === 0 && !visited.has(nk)) {
        visited.add(nk);
        parent.set(nk, key(pos));
        queue.push([nr, nc]);
      }
    }
  }

  return { path: [], explored };
}

function solveAStar(maze: Maze): { path: Pos[]; explored: number } {
  const { grid, rows, cols, start, exit } = maze;
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const parent = new Map<string, string>();
  const openSet: Pos[] = [start];
  const closed = new Set<string>();
  let explored = 0;

  const h = (p: Pos) => Math.abs(p[0] - exit[0]) + Math.abs(p[1] - exit[1]);

  gScore.set(key(start), 0);
  fScore.set(key(start), h(start));

  while (openSet.length > 0) {
    // Find lowest fScore
    let bestIdx = 0;
    let bestF = fScore.get(key(openSet[0])) ?? Infinity;
    for (let i = 1; i < openSet.length; i++) {
      const f = fScore.get(key(openSet[i])) ?? Infinity;
      if (f < bestF) { bestF = f; bestIdx = i; }
    }

    const pos = openSet.splice(bestIdx, 1)[0];
    const pk = key(pos);
    explored++;

    if (pos[0] === exit[0] && pos[1] === exit[1]) {
      return { path: reconstructPath(parent, start, exit), explored };
    }

    closed.add(pk);

    for (const [dr, dc] of DIRS) {
      const nr = pos[0] + dr;
      const nc = pos[1] + dc;
      const nk = `${nr},${nc}`;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || grid[nr][nc] === 1 || closed.has(nk)) continue;

      const tentativeG = (gScore.get(pk) ?? Infinity) + 1;
      if (tentativeG < (gScore.get(nk) ?? Infinity)) {
        parent.set(nk, pk);
        gScore.set(nk, tentativeG);
        fScore.set(nk, tentativeG + h([nr, nc]));
        if (!openSet.some(p => key(p) === nk)) openSet.push([nr, nc]);
      }
    }
  }

  return { path: [], explored };
}

function solveWallFollower(maze: Maze): { path: Pos[]; explored: number } {
  const { grid, rows, cols, start, exit } = maze;
  const path: Pos[] = [start];
  let [cr, cc] = start;
  let dir = 1; // 0=up 1=right 2=down 3=left
  const drs = [-1, 0, 1, 0];
  const dcs = [0, 1, 0, -1];
  let explored = 0;
  const maxSteps = rows * cols * 4;

  while (explored < maxSteps) {
    if (cr === exit[0] && cc === exit[1]) break;
    explored++;

    // Right-hand rule: try right, forward, left, back
    const tryOrder = [(dir + 1) % 4, dir, (dir + 3) % 4, (dir + 2) % 4];
    let moved = false;

    for (const d of tryOrder) {
      const nr = cr + drs[d];
      const nc = cc + dcs[d];
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === 0) {
        cr = nr; cc = nc; dir = d;
        path.push([cr, cc]);
        moved = true;
        break;
      }
    }

    if (!moved) break;
  }

  return { path: (cr === exit[0] && cc === exit[1]) ? path : [], explored };
}

function solveDeadEndFill(maze: Maze): { path: Pos[]; explored: number } {
  const { grid, rows, cols } = maze;
  // Copy grid — fill dead ends with walls
  const filled: Cell[][] = grid.map(r => [...r]);
  let changed = true;
  let explored = 0;

  while (changed) {
    changed = false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (filled[r][c] === 1) continue;
        if (r === maze.start[0] && c === maze.start[1]) continue;
        if (r === maze.exit[0] && c === maze.exit[1]) continue;

        // Count open neighbors
        let open = 0;
        for (const [dr, dc] of DIRS) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && filled[nr][nc] === 0) open++;
        }

        if (open <= 1) {
          filled[r][c] = 1;
          changed = true;
          explored++;
        }
      }
    }
  }

  // Now BFS on the filled maze
  const result = solveBFS({ ...maze, grid: filled });
  return { path: result.path, explored: explored + result.explored };
}

function solveGreedy(maze: Maze): { path: Pos[]; explored: number } {
  const { grid, rows, cols, start, exit } = maze;
  const visited = new Set<string>();
  const path: Pos[] = [start];
  let [cr, cc] = start;
  visited.add(key(start));
  let explored = 0;
  const maxSteps = rows * cols;

  while (explored < maxSteps) {
    if (cr === exit[0] && cc === exit[1]) break;
    explored++;

    // Pick neighbor closest to exit (Manhattan)
    let bestDist = Infinity;
    let bestPos: Pos | null = null;

    for (const [dr, dc] of DIRS) {
      const nr = cr + dr;
      const nc = cc + dc;
      const nk = `${nr},${nc}`;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === 0 && !visited.has(nk)) {
        const dist = Math.abs(nr - exit[0]) + Math.abs(nc - exit[1]);
        if (dist < bestDist) { bestDist = dist; bestPos = [nr, nc]; }
      }
    }

    if (!bestPos) {
      // Stuck — backtrack
      path.pop();
      if (path.length === 0) break;
      [cr, cc] = path[path.length - 1];
    } else {
      visited.add(key(bestPos));
      path.push(bestPos);
      [cr, cc] = bestPos;
    }
  }

  return { path: (cr === exit[0] && cc === exit[1]) ? path : [], explored };
}

// --- Helpers ---

function key(p: Pos): string { return `${p[0]},${p[1]}`; }

function reconstructPath(parent: Map<string, string>, start: Pos, end: Pos): Pos[] {
  const path: Pos[] = [];
  let current = key(end);
  while (current) {
    const [r, c] = current.split(',').map(Number);
    path.unshift([r, c] as Pos);
    if (r === start[0] && c === start[1]) break;
    current = parent.get(current)!;
  }
  return path;
}
