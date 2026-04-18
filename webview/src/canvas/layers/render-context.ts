import { BatCaveWorld, RepoTheme } from "../../world/BatCave";
import { ReplayEngine } from "../../systems/ReplayEngine";
import { Director } from "../../systems/Director";
import { CaveLayout } from "../layout";

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
  /** Claude's current activity state — drives torch flicker speed. */
  alfredState: "idle" | "thinking" | "writing";
  /** Centralized furniture positions — single source of truth. */
  layout: CaveLayout;
  /** Responsive layout mode based on canvas width. */
  layoutMode: "placeholder" | "compact" | "narrow" | "normal" | "wide";
  /** True when canvas is significantly taller than wide (e.g. portrait panel). */
  verticalMode: boolean;
}

// ── Shared palette — Signal Room (Fox tokens, opaque only) ──────────────────
// These hex values are canonical. Do not hardcode hex in layers — reference P.

export const P = {
  // Base surfaces
  BG: "#101820",          // Fox black — cave background
  BG_RAISED: "#0c1624",   // Muro sfondo, leggermente più blu
  SURFACE: "#162030",     // Furniture fill, server rack panels

  // Floor tiles (derived from BG family)
  FLOOR_A: "#162030",     // Even tile (was 1A1A2E — now signal-room surface tone)
  FLOOR_B: "#1a2838",     // Odd tile
  FLOOR_DARK: "#0c1624",  // Dark specks
  FLOOR_SPECK: "#1e3040", // Mineral speck
  FLOOR_RIVET: "#0f4a80", // accent-secondary at floor rivets

  // Wall tiles (cave rock in bg-raised family)
  WALL_TOP: "#0c1624",    // Top wall row
  WALL_MID: "#101820",    // Mid wall row
  WALL_BOT: "#162030",    // Bottom wall row (near floor)
  WALL_DARK: "#080e18",   // Shadow pixel in rock texture
  WALL_LIGHT: "#1e3040",  // Highlight pixel in rock texture
  WALL_EDGE: "#1a2838",   // Seam / edge color

  // Accent
  ACCENT: "#1E7FD8",      // Fox blue — primary accent
  ACCENT_SEC: "#0f4a80",  // Fox blue attenuato — furniture outline, inactive

  // Text
  TEXT: "#c8ddef",        // Cold white — CRT read color
  TEXT_MUTED: "#4a6a88",  // Secondary, caption, label spenti

  // Semantic
  SUCCESS: "#1fa35c",     // Verde — agent-enter, writing state
  DANGER: "#c0392b",      // Rosso — alert, Bat Signal at 100%
  WARN: "#b07d20",        // Ambra — warning only

  // Outline / chrome
  OUTLINE: "#060a10",     // Near-black with cool cave tint
  HIGHLIGHT: "#1e3040",   // Subtle surface lift

  // LED strip preset — green / blue / red / amber (opaque)
  LED_COLORS: ["#1fa35c", "#1E7FD8", "#c0392b", "#b07d20", "#1fa35c"],

  // Furniture chrome (P2 Herald visibility)
  FURNITURE_OUTLINE: "#0f4a80", // accent-secondary for furniture outlines
  FURNITURE_BG: "#162030",      // surface tone for furniture fills
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

/**
 * Draws a 1-zoom-pixel border around a rectangle.
 * @param color - Override border color (defaults to P.OUTLINE). Pass P.FURNITURE_OUTLINE for furniture.
 */
export function outlineRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
  color?: string,
): void {
  ctx.fillStyle = color ?? P.OUTLINE;
  ctx.fillRect(x, y, w, zoom);
  ctx.fillRect(x, y + h - zoom, w, zoom);
  ctx.fillRect(x, y, zoom, h);
  ctx.fillRect(x + w - zoom, y, zoom, h);
}

// ── Contact shadow — grounding strip at base of furniture ──

export function contactShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  w: number,
  zoom: number,
): void {
  const brd = Math.max(1, Math.round(zoom * 0.5));
  // Primary dark strip.
  ctx.fillStyle = P.OUTLINE;
  ctx.fillRect(x, baseY, w, brd);
  // Softer secondary strip below.
  ctx.fillStyle = P.BG_RAISED;
  ctx.fillRect(
    x + brd,
    baseY + brd,
    w - brd * 2,
    Math.max(1, Math.round(zoom * 0.3)),
  );
}

// ── Cast shadow — offset dark projection to the right (light from top-left) ──

export function castShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  w: number,
  h: number,
  zoom: number,
): void {
  const shadowW = Math.round(w * 0.8);
  const shadowH = Math.round(h * 0.15);
  const offX = Math.round(w * 0.15);
  const brd = Math.max(1, Math.round(zoom * 0.5));
  // Outer shadow (larger, lighter).
  ctx.fillStyle = P.BG_RAISED;
  ctx.fillRect(x + offX, baseY - brd, shadowW, shadowH + brd);
  // Inner shadow (darker core).
  ctx.fillStyle = P.OUTLINE;
  ctx.fillRect(
    x + offX + brd,
    baseY,
    shadowW - brd * 2,
    Math.max(1, Math.round(shadowH * 0.6)),
  );
}
