/**
 * Mission Board Layer — renders Scacchiera chains as pixel-art quest cards.
 *
 * Wall-mounted cork board on the left wall, above the entrance. Each active
 * chain shows as a quest card with:
 *   - letter badge for chain type (B=build, R=review, S=security, ...)
 *   - progress dots (filled = done steps)
 *   - flag color border (green=clean, yellow=warn, red=block)
 *
 * Freshly-updated cards pulse for ~1.2s via a brightness modulation.
 * Archived chains emit a fade-out before removal (handled in BatCaveWorld).
 */

import { RenderContext, P, outlineRect } from "./render-context";
import { ChainCardState } from "../../world/BatCave";

// Board palette (wood + cork).
const C = {
  FRAME_DARK: "#3a2418",
  FRAME_LIGHT: "#5a3828",
  CORK_DARK: "#6b4a2c",
  CORK_MID: "#8a6038",
  CORK_SPECK: "#4a3420",
  PIN_RED: "#c93838",
  PIN_BRASS: "#b8883a",
  CARD_BG: "#f0ead6",
  CARD_LINE: "#c8c0a8",
  CARD_TEXT: "#1a1a1a",
  FLAG_CLEAN: "#2ECC71",
  FLAG_WARN: "#F39C12",
  FLAG_BLOCK: "#E74C3C",
  HEADER_BG: "#2a1a10",
  HEADER_TEXT: "#d4a860",
} as const;

// Type letter mapping — one glyph per chain type.
const TYPE_LETTER: Record<string, string> = {
  build: "B",
  security: "S",
  release: "R",
  quality: "Q",
  design: "D",
  review: "V",
  improve: "I",
  onboard: "O",
  audit: "A",
  incident: "!",
};

export function drawMissionBoard(rc: RenderContext): void {
  const chains = rc.world.getChainCards();
  if (!chains || chains.length === 0) return;

  const { ctx, zoom, layout, wallH } = rc;
  const z = zoom;

  // Placement: left wall, below the top edge. Anchor high on the wall so the
  // board reads as wall-mounted art rather than furniture.
  const boardW = z * 32;
  const boardH = z * 22;
  const boardX = Math.round(z * 3);
  const boardY = Math.round(wallH * 0.18);

  // Frame shadow cast into cave (dark offset).
  ctx.fillStyle = P.WALL_DARK;
  ctx.fillRect(boardX + z, boardY + z, boardW, boardH);

  // Outer frame.
  ctx.fillStyle = C.FRAME_DARK;
  ctx.fillRect(boardX, boardY, boardW, boardH);
  // Frame highlight (top + left bevel).
  ctx.fillStyle = C.FRAME_LIGHT;
  ctx.fillRect(boardX, boardY, boardW, Math.max(1, Math.round(z * 0.5)));
  ctx.fillRect(boardX, boardY, Math.max(1, Math.round(z * 0.5)), boardH);

  // Header strip.
  const headerH = Math.max(z * 2, 4);
  ctx.fillStyle = C.HEADER_BG;
  ctx.fillRect(boardX + z, boardY + z, boardW - z * 2, headerH);
  // Header text glyphs — dot-pattern "MISSIONS" stylized as 2-3 bullets.
  const dotSize = Math.max(1, Math.round(z * 0.4));
  const dotY = boardY + z + Math.floor((headerH - dotSize) / 2);
  ctx.fillStyle = C.HEADER_TEXT;
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(
      boardX + z * 2 + i * (dotSize + z),
      dotY,
      dotSize,
      dotSize,
    );
  }

  // Cork body.
  const corkX = boardX + z;
  const corkY = boardY + z + headerH;
  const corkW = boardW - z * 2;
  const corkH = boardH - z * 2 - headerH;
  ctx.fillStyle = C.CORK_DARK;
  ctx.fillRect(corkX, corkY, corkW, corkH);
  // Cork speckle (procedural).
  const speckCount = Math.max(6, Math.floor(corkW * corkH * 0.005));
  for (let i = 0; i < speckCount; i++) {
    const sx = corkX + ((i * 47) % corkW);
    const sy = corkY + ((i * 31) % corkH);
    ctx.fillStyle = i % 3 === 0 ? C.CORK_MID : C.CORK_SPECK;
    ctx.fillRect(sx, sy, Math.max(1, Math.round(z * 0.3)), Math.max(1, Math.round(z * 0.3)));
  }

  // Quest cards — up to 4 visible.
  const maxCards = 4;
  const visible = chains.slice(0, maxCards);
  const cardW = Math.floor((corkW - z * 2) / 2);
  const cardH = Math.floor((corkH - z * 2) / 2);
  const gap = Math.max(1, Math.round(z * 0.5));

  visible.forEach((card, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const cx = corkX + z + col * (cardW + gap);
    const cy = corkY + z + row * (cardH + gap);
    drawQuestCard(ctx, cx, cy, cardW, cardH, z, card, rc.now);
  });

  // If more than 4 chains active, badge the overflow count in header.
  if (chains.length > maxCards) {
    const badgeX = boardX + boardW - z * 3;
    const badgeY = boardY + z;
    ctx.fillStyle = C.PIN_RED;
    ctx.fillRect(badgeX, badgeY, z * 2, headerH);
    ctx.fillStyle = C.CARD_BG;
    const pdot = Math.max(1, Math.round(z * 0.35));
    ctx.fillRect(
      badgeX + z - Math.floor(pdot / 2),
      badgeY + Math.floor(headerH / 2) - Math.floor(pdot / 2),
      pdot,
      pdot,
    );
  }

  // Outline the whole board for herald contrast against cave wall.
  outlineRect(ctx, boardX, boardY, boardW, boardH, z, P.OUTLINE);
}

function drawQuestCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  card: ChainCardState,
  now: number,
): void {
  // Pulse on recent update (brightness modulation, 1200ms decay).
  const elapsed = now - (card.lastUpdateMs || 0);
  const pulseActive = elapsed >= 0 && elapsed < 1200;
  const pulseT = pulseActive ? 1 - elapsed / 1200 : 0;

  // Card shadow (subtle cast).
  ctx.fillStyle = "#000000";
  ctx.fillRect(x + 1, y + 1, w, h);

  // Card body — paper.
  const bg = pulseActive ? brighten(C.CARD_BG, pulseT * 0.15) : C.CARD_BG;
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);

  // Flag border — color by chain flag.
  const flagColor =
    card.flag === "warn"
      ? C.FLAG_WARN
      : card.flag === "block"
        ? C.FLAG_BLOCK
        : C.FLAG_CLEAN;
  outlineRect(ctx, x, y, w, h, Math.max(1, Math.round(z * 0.35)), flagColor);

  // Pin (brass tack at top).
  const pinR = Math.max(1, Math.round(z * 0.5));
  const pinX = x + Math.floor(w / 2) - Math.floor(pinR / 2);
  const pinY = y - Math.floor(pinR / 2);
  ctx.fillStyle = C.PIN_BRASS;
  ctx.fillRect(pinX, pinY, pinR, pinR);

  // Type letter badge (top-left).
  const letter = TYPE_LETTER[card.chainType] ?? "?";
  drawLetter(
    ctx,
    letter,
    x + Math.round(z * 0.6),
    y + Math.round(z * 0.6),
    Math.max(1, Math.round(z * 0.4)),
    C.CARD_TEXT,
  );

  // Progress dots (bottom) — one dot per step, filled for completed.
  const totalSteps = Math.max(1, Math.min(card.step.total, 6));
  const currentSteps = Math.min(card.step.current, totalSteps);
  const dotSize = Math.max(1, Math.round(z * 0.4));
  const dotGap = Math.max(1, Math.round(z * 0.3));
  const dotsW = totalSteps * dotSize + (totalSteps - 1) * dotGap;
  const dotsX = x + Math.floor((w - dotsW) / 2);
  const dotsY = y + h - dotSize - Math.round(z * 0.6);
  for (let i = 0; i < totalSteps; i++) {
    ctx.fillStyle = i < currentSteps ? flagColor : C.CARD_LINE;
    ctx.fillRect(dotsX + i * (dotSize + dotGap), dotsY, dotSize, dotSize);
  }

  // Target repo as tiny divider line (middle).
  const lineY = y + Math.floor(h / 2);
  ctx.fillStyle = C.CARD_LINE;
  ctx.fillRect(
    x + Math.round(z * 0.5),
    lineY,
    w - Math.round(z),
    Math.max(1, Math.round(z * 0.15)),
  );
}

/**
 * Minimal 3x5 pixel-font for single capital letter / punctuation.
 * Supports chain-type glyphs plus "?".
 */
const GLYPHS: Record<string, string[]> = {
  B: ["110", "101", "110", "101", "110"],
  S: ["011", "100", "010", "001", "110"],
  R: ["110", "101", "110", "110", "101"],
  Q: ["010", "101", "101", "101", "011"],
  D: ["110", "101", "101", "101", "110"],
  V: ["101", "101", "101", "101", "010"],
  I: ["111", "010", "010", "010", "111"],
  O: ["010", "101", "101", "101", "010"],
  A: ["010", "101", "111", "101", "101"],
  "!": ["010", "010", "010", "000", "010"],
  "?": ["110", "001", "010", "000", "010"],
};

function drawLetter(
  ctx: CanvasRenderingContext2D,
  letter: string,
  x: number,
  y: number,
  px: number,
  color: string,
): void {
  const glyph = GLYPHS[letter] ?? GLYPHS["?"];
  ctx.fillStyle = color;
  for (let r = 0; r < 5; r++) {
    const row = glyph[r];
    for (let c = 0; c < 3; c++) {
      if (row[c] === "1") {
        ctx.fillRect(x + c * px, y + r * px, px, px);
      }
    }
  }
}

function brighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) * (1 + amount)));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) * (1 + amount)));
  const b = Math.min(255, Math.round((n & 0xff) * (1 + amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
