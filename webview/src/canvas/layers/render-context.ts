import { BatCaveWorld, RepoTheme } from "../../world/BatCave";
import { ReplayEngine } from "../../systems/ReplayEngine";

/** Snapshot of render state, built once per frame by Renderer. */
export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  world: BatCaveWorld;
  replay: ReplayEngine;
  width: number;
  height: number;
  zoom: number;
  zt: number;
  wallH: number;
  cols: number;
  rows: number;
  wallRows: number;
  theme: RepoTheme;
  now: number;
}

// ── Shared palette (opaque, no transparency) ─────────────

export const P = {
  BG: "#0a0a12",
  FLOOR_A: "#13131e",
  FLOOR_B: "#161624",
  FLOOR_DARK: "#0e0e18",
  FLOOR_SPECK: "#1c1c2a",
  WALL_TOP: "#0c0c18",
  WALL_MID: "#161628",
  WALL_BOT: "#1a1a30",
  WALL_DARK: "#08081a",
  WALL_LIGHT: "#1e1e34",
  WALL_EDGE: "#1e1e30",
  ACCENT: "#1E7FD8",
  OUTLINE: "#060410",
  HIGHLIGHT: "#222238",
  LED_COLORS: ["#2ECC71", "#1E7FD8", "#E74C3C", "#F39C12", "#2ECC71"],
} as const;

// ── Seeded random (deterministic procedural detail) ──────

const _seeds: number[] = [];
for (let i = 0; i < 400; i++) {
  _seeds[i] = Math.sin(i * 127.1 + 311.7) * 0.5 + 0.5;
}

export function seed(i: number): number {
  return _seeds[((i % 400) + 400) % 400];
}

// ── Outline rect helper ─────────────────────────────────

export function outlineRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, zoom: number,
): void {
  ctx.fillStyle = P.OUTLINE;
  ctx.fillRect(x, y, w, zoom);
  ctx.fillRect(x, y + h - zoom, w, zoom);
  ctx.fillRect(x, y, zoom, h);
  ctx.fillRect(x + w - zoom, y, zoom, h);
}
