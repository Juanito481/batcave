import { BatCaveWorld, RepoTheme } from "../../world/BatCave";
import { ReplayEngine } from "../../systems/ReplayEngine";
import { Director } from "../../systems/Director";

/** Snapshot of render state, built once per frame by Renderer. */
export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  world: BatCaveWorld;
  replay: ReplayEngine;
  director: Director;
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
  BG: "#101820",
  FLOOR_A: "#151c24",
  FLOOR_B: "#161d25",
  FLOOR_DARK: "#0e1418",
  FLOOR_SPECK: "#1e2830",
  WALL_TOP: "#0c1018",
  WALL_MID: "#162028",
  WALL_BOT: "#1a2430",
  WALL_DARK: "#081018",
  WALL_LIGHT: "#222e3a",
  WALL_EDGE: "#1e2830",
  ACCENT: "#1E7FD8",
  OUTLINE: "#060a10",
  HIGHLIGHT: "#2a3240",
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

// ── Contact shadow — grounding strip at base of furniture ──

export function contactShadow(
  ctx: CanvasRenderingContext2D,
  x: number, baseY: number, w: number, zoom: number,
): void {
  const brd = Math.max(1, Math.round(zoom * 0.5));
  // Primary dark strip.
  ctx.fillStyle = "#060a10";
  ctx.fillRect(x, baseY, w, brd);
  // Softer secondary strip below.
  ctx.fillStyle = "#0a1018";
  ctx.fillRect(x + brd, baseY + brd, w - brd * 2, Math.max(1, Math.round(zoom * 0.3)));
}

// ── Cast shadow — offset dark projection to the right (light from top-left) ──

export function castShadow(
  ctx: CanvasRenderingContext2D,
  x: number, baseY: number, w: number, h: number, zoom: number,
): void {
  const shadowW = Math.round(w * 0.8);
  const shadowH = Math.round(h * 0.15);
  const offX = Math.round(w * 0.15);
  const brd = Math.max(1, Math.round(zoom * 0.5));
  // Outer shadow (larger, lighter).
  ctx.fillStyle = "#0a0e14";
  ctx.fillRect(x + offX, baseY - brd, shadowW, shadowH + brd);
  // Inner shadow (darker core).
  ctx.fillStyle = "#060a10";
  ctx.fillRect(x + offX + brd, baseY, shadowW - brd * 2, Math.max(1, Math.round(shadowH * 0.6)));
}
