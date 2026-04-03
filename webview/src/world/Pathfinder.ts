/**
 * Grid-based BFS pathfinder for characters to navigate around furniture.
 * Uses a coarse grid (tile-sized cells) for performance.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Pathfinder {
  private grid: boolean[][] = []; // true = walkable
  private gridCols = 0;
  private gridRows = 0;
  private cellSize = 32;

  /** Rebuild the walkability grid from obstacle rects. */
  buildGrid(worldWidth: number, worldHeight: number, cellSize: number, obstacles: Rect[]): void {
    this.cellSize = cellSize;
    this.gridCols = Math.ceil(worldWidth / cellSize);
    this.gridRows = Math.ceil(worldHeight / cellSize);

    this.grid = [];
    for (let r = 0; r < this.gridRows; r++) {
      this.grid[r] = [];
      for (let c = 0; c < this.gridCols; c++) {
        this.grid[r][c] = true;
      }
    }

    for (const obs of obstacles) {
      const c0 = Math.floor(obs.x / cellSize);
      const c1 = Math.ceil((obs.x + obs.w) / cellSize);
      const r0 = Math.floor(obs.y / cellSize);
      const r1 = Math.ceil((obs.y + obs.h) / cellSize);
      for (let r = Math.max(0, r0); r < Math.min(this.gridRows, r1); r++) {
        for (let c = Math.max(0, c0); c < Math.min(this.gridCols, c1); c++) {
          this.grid[r][c] = false;
        }
      }
    }
  }

  /** BFS from (startX,startY) to (endX,endY). Returns pixel-coordinate waypoints. */
  findPath(startX: number, startY: number, endX: number, endY: number): Point[] {
    const cs = this.cellSize;
    const clampC = (v: number) => Math.max(0, Math.min(this.gridCols - 1, Math.floor(v / cs)));
    const clampR = (v: number) => Math.max(0, Math.min(this.gridRows - 1, Math.floor(v / cs)));

    const sc = clampC(startX);
    const sr = clampR(startY);
    let ec = clampC(endX);
    let er = clampR(endY);

    // If target is blocked, find nearest walkable cell.
    if (!this.grid[er]?.[ec]) {
      const nearest = this.nearestWalkable(ec, er);
      if (nearest) {
        ec = nearest.c;
        er = nearest.r;
      } else {
        return [{ x: endX, y: endY }];
      }
    }

    // If start is blocked, also snap.
    let startCol = sc;
    let startRow = sr;
    if (!this.grid[sr]?.[sc]) {
      const nearest = this.nearestWalkable(sc, sr);
      if (nearest) {
        startCol = nearest.c;
        startRow = nearest.r;
      }
    }

    // Same cell — direct.
    if (startCol === ec && startRow === er) {
      return [{ x: endX, y: endY }];
    }

    // BFS.
    const key = (r: number, c: number) => r * this.gridCols + c;
    const visited = new Set<number>();
    const parent = new Map<number, number>();
    const queue: [number, number][] = [[startRow, startCol]];
    visited.add(key(startRow, startCol));

    // 8-directional movement.
    const dirs = [
      [0, 1], [0, -1], [1, 0], [-1, 0],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];

    let found = false;
    while (queue.length > 0) {
      const [r, c] = queue.shift()!;
      if (r === er && c === ec) {
        found = true;
        break;
      }

      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= this.gridRows || nc < 0 || nc >= this.gridCols) continue;
        if (!this.grid[nr][nc]) continue;
        const k = key(nr, nc);
        if (visited.has(k)) continue;

        // No corner-cutting for diagonals.
        if (dr !== 0 && dc !== 0) {
          if (!this.grid[r + dr]?.[c] || !this.grid[r]?.[c + dc]) continue;
        }

        visited.add(k);
        parent.set(k, key(r, c));
        queue.push([nr, nc]);
      }
    }

    if (!found) {
      return [{ x: endX, y: endY }];
    }

    // Reconstruct.
    const cells: Point[] = [];
    let curr = key(er, ec);
    const startKey = key(startRow, startCol);
    while (curr !== startKey) {
      const r = Math.floor(curr / this.gridCols);
      const c = curr % this.gridCols;
      cells.unshift({ x: c * cs + cs / 2, y: r * cs + cs / 2 });
      const p = parent.get(curr);
      if (p === undefined) break;
      curr = p;
    }

    // Replace last waypoint with exact target position.
    if (cells.length > 0) {
      cells[cells.length - 1] = { x: endX, y: endY };
    }

    return this.simplify(cells);
  }

  private nearestWalkable(col: number, row: number): { c: number; r: number } | null {
    const queue: [number, number][] = [[row, col]];
    const visited = new Set<number>();
    visited.add(row * this.gridCols + col);

    while (queue.length > 0) {
      const [r, c] = queue.shift()!;
      if (this.grid[r]?.[c]) return { r, c };

      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= this.gridRows || nc < 0 || nc >= this.gridCols) continue;
        const k = nr * this.gridCols + nc;
        if (visited.has(k)) continue;
        visited.add(k);
        queue.push([nr, nc]);
      }
    }
    return null;
  }

  /** Remove collinear intermediate waypoints. */
  private simplify(path: Point[]): Point[] {
    if (path.length <= 2) return path;

    const result: Point[] = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const prev = result[result.length - 1];
      const curr = path[i];
      const next = path[i + 1];
      const dx1 = Math.sign(curr.x - prev.x);
      const dy1 = Math.sign(curr.y - prev.y);
      const dx2 = Math.sign(next.x - curr.x);
      const dy2 = Math.sign(next.y - curr.y);
      if (dx1 !== dx2 || dy1 !== dy2) {
        result.push(curr);
      }
    }
    result.push(path[path.length - 1]);
    return result;
  }
}
