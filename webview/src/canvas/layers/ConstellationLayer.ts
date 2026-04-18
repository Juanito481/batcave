/**
 * Constellation Layer (v5.5+) — pixel-art knowledge graph on the right wall.
 *
 * Renders up to 10 Oracle god nodes as stars with brightness proportional to
 * their edge count. Stars are connected by sparse sibling lines colored by
 * their (deterministic) community hash. A brief pulse decays ~1.5s after
 * each oracle_rebuild or oracle_query event.
 *
 * Zero external data beyond world.getOracleGodNodes() and seed()-deterministic
 * positioning — constellation stays stable across sessions while the graph
 * does not change.
 */

import { RenderContext, P, seed, outlineRect } from "./render-context";
import { OracleGodNodeState } from "../../world/BatCave";

// Shared palette — Signal Room tones.
const C = {
  FRAME_DARK: "#0c1624",   // bg-raised
  FRAME_LIGHT: "#162030",  // surface
  STAR_CORE: "#c8ddef",    // Fox text — cold white
  STAR_DIM: "#4a6a88",     // text-muted
  LINE_DIM: "#0f4a80",     // accent-secondary
  LINE_LIT: "#1E7FD8",     // accent
  BADGE_BG: "#162030",     // surface
  BADGE_TEXT: "#c8ddef",   // text
  PULSE_TINT: "#1E7FD8",   // accent
} as const;

// Distinct community hues — Signal Room semantic colors.
const COMMUNITY_HUES = [
  "#1E7FD8",  // accent
  "#1fa35c",  // success
  "#c0392b",  // danger
  "#b07d20",  // warn
  "#7a40b0",  // purple
  "#18a080",  // teal
  "#c8a820",  // gold
  "#c0186a",  // hot-pink
];

export function drawConstellation(rc: RenderContext): void {
  const godNodes = rc.world.getOracleGodNodes();
  if (!godNodes || godNodes.length === 0) return;

  const { ctx, zoom, layout, wallH, width, now } = rc;
  const z = zoom;

  // Panel: right wall, mirror position of the mission board on the left.
  const panelW = z * 34;
  const panelH = z * 22;
  const panelX = Math.round(width - panelW - z * 3);
  const panelY = Math.round(wallH * 0.18);

  // Decay fades from 1.0 -> 0 over 1500ms after last pulse.
  const pulseElapsed = now - rc.world.getOraclePulseMs();
  const pulse =
    pulseElapsed >= 0 && pulseElapsed < 1500 ? 1 - pulseElapsed / 1500 : 0;

  // Back panel glow.
  ctx.fillStyle = C.FRAME_DARK;
  ctx.fillRect(panelX, panelY, panelW, panelH);

  // Subtle frame top-left bevel.
  ctx.fillStyle = C.FRAME_LIGHT;
  ctx.fillRect(panelX, panelY, panelW, Math.max(1, Math.round(z * 0.4)));
  ctx.fillRect(panelX, panelY, Math.max(1, Math.round(z * 0.4)), panelH);

  // Pulse tint overlay — gentle blue wash while active.
  if (pulse > 0) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(0.35, pulse * 0.35));
    ctx.fillStyle = C.PULSE_TINT;
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.restore();
  }

  // Background speckle — "night sky" dust.
  const specks = 30;
  for (let i = 0; i < specks; i++) {
    const sx = panelX + Math.round(seed(i * 7) * (panelW - z));
    const sy = panelY + Math.round(seed(i * 11 + 3) * (panelH - z));
    ctx.fillStyle = seed(i * 13) < 0.6 ? "#16263a" : "#1e3a58";
    const sz = Math.max(1, Math.round(z * 0.25));
    ctx.fillRect(sx, sy, sz, sz);
  }

  // Header: tiny three-dot motif + label area.
  ctx.fillStyle = C.BADGE_BG;
  const headerH = Math.max(z * 2, 4);
  ctx.fillRect(panelX + z, panelY + z, panelW - z * 2, headerH);
  const dotSize = Math.max(1, Math.round(z * 0.4));
  const dotY = panelY + z + Math.floor((headerH - dotSize) / 2);
  ctx.fillStyle = C.BADGE_TEXT;
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(panelX + z * 2 + i * (dotSize + z), dotY, dotSize, dotSize);
  }

  // Body area (inside header).
  const bodyX = panelX + z * 2;
  const bodyY = panelY + z + headerH + z;
  const bodyW = panelW - z * 4;
  const bodyH = panelH - z * 3 - headerH;

  // Deterministic star positions from god node index + name hash.
  const positions = godNodes.map((node, i) => {
    const h = hashName(node.name);
    return {
      x: bodyX + Math.round(((h % 1000) / 1000) * (bodyW - z * 2)) + z,
      y: bodyY + Math.round((((h >> 10) % 1000) / 1000) * (bodyH - z * 2)) + z,
      edges: node.edges,
      idx: i,
      communityIdx: h % COMMUNITY_HUES.length,
    };
  });

  // Sparse connections: closest-neighbor pairs (each star links to the 1-2
  // nearest others) — avoids a noisy hairball and reads as constellations.
  for (let i = 0; i < positions.length; i++) {
    const a = positions[i];
    const neighbors = positions
      .filter((_, j) => j !== i)
      .map((b) => ({ b, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
      .sort((x, y) => x.d - y.d)
      .slice(0, a.idx % 2 === 0 ? 2 : 1);
    for (const { b } of neighbors) {
      drawPixelLine(
        ctx,
        a.x,
        a.y,
        b.x,
        b.y,
        pulse > 0.1 ? C.LINE_LIT : C.LINE_DIM,
      );
    }
  }

  // Stars — size + brightness scale with edge count.
  const maxEdges = Math.max(1, ...positions.map((p) => p.edges));
  for (const p of positions) {
    const ratio = p.edges / maxEdges;
    const starSize = Math.max(z, Math.round(z * (0.8 + ratio * 1.6)));
    const hue = COMMUNITY_HUES[p.communityIdx];
    // Outer halo.
    ctx.fillStyle = hue;
    ctx.fillRect(
      p.x - Math.floor(starSize / 2),
      p.y - Math.floor(starSize / 2),
      starSize,
      starSize,
    );
    // Inner core.
    const coreSize = Math.max(1, Math.round(starSize * 0.5));
    ctx.fillStyle = C.STAR_CORE;
    ctx.fillRect(
      p.x - Math.floor(coreSize / 2),
      p.y - Math.floor(coreSize / 2),
      coreSize,
      coreSize,
    );
    // Pulse bloom: during a pulse, extra 1-pixel glow around each star.
    if (pulse > 0.2) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.5, pulse);
      ctx.fillStyle = hue;
      ctx.fillRect(
        p.x - Math.floor(starSize / 2) - 1,
        p.y - Math.floor(starSize / 2) - 1,
        starSize + 2,
        starSize + 2,
      );
      ctx.restore();
    }
  }

  // Outline the panel — Herald contrast over the cave wall.
  outlineRect(ctx, panelX, panelY, panelW, panelH, z, P.OUTLINE);
}

function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function drawPixelLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
): void {
  // Bresenham integer line, one pixel thick — keeps things pixel-perfect.
  ctx.fillStyle = color;
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  let steps = 0;
  const MAX_STEPS = 512;
  while (steps++ < MAX_STEPS) {
    ctx.fillRect(x, y, 1, 1);
    if (x === x1 && y === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}
