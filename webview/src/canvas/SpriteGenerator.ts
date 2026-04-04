/**
 * Procedural pixel art sprite generator — Pokemon FireRed style.
 *
 * GBA-authentic rendering techniques:
 * - 1px dark outline around all silhouettes
 * - Directional shadow/highlight shading (light from top-left)
 * - Palette-based shadows (no alpha transparency)
 * - 4-direction walk animation with distinct leg positions
 *
 * No external PNG files — all art is computed at init.
 */

import { darken, lighten } from "../helpers/color";

export interface SpriteSheet {
  canvas: OffscreenCanvas;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, { row: number; frames: number; speed: number }>;
}

// ── Outline (near-black with warm cave tint) ────────────

const OUTLINE = "#0c0810";

// ── Palette & shading ────────────────────────────────────

interface CharacterPalette {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  accent: string;
  eyes: string;
}

interface DerivedShades {
  base: Record<string, string>;
  shadow: Record<string, string>;
  highlight: Record<string, string>;
}

function deriveShades(p: CharacterPalette): DerivedShades {
  return {
    base: { H: p.hair, S: p.skin, T: p.shirt, P: p.pants, A: p.accent, E: p.eyes },
    shadow: {
      H: darken(p.hair, 0.30),
      S: darken(p.skin, 0.22),
      T: darken(p.shirt, 0.25),
      P: darken(p.pants, 0.25),
      A: darken(p.accent, 0.25),
      E: p.eyes,
    },
    highlight: {
      H: lighten(p.hair, 0.18),
      S: lighten(p.skin, 0.15),
      T: lighten(p.shirt, 0.15),
      P: lighten(p.pants, 0.12),
      A: lighten(p.accent, 0.20),
      E: lighten(p.eyes, 0.08),
    },
  };
}

// ── Character palettes ───────────────────────────────────

const PALETTES: Record<string, CharacterPalette> = {
  alfred: {
    skin: "#E8C0A0", hair: "#4A4A5A", shirt: "#1A1A2A",
    pants: "#101820", accent: "#FFFFFF", eyes: "#1a1a2e",
  },
  giovanni: {
    skin: "#E8C0A0", hair: "#101820", shirt: "#2A2A3A",
    pants: "#1A1A2A", accent: "#1E7FD8", eyes: "#FFFFFF",
  },
  king: {
    skin: "#F0D0A0", hair: "#FFD700", shirt: "#4A0E6B",
    pants: "#380854", accent: "#FFD700", eyes: "#1a1a2e",
  },
  queen: {
    skin: "#F0D0A0", hair: "#8B0000", shirt: "#1E7FD8",
    pants: "#155FA0", accent: "#FFD700", eyes: "#1a1a2e",
  },
  "white-rook": {
    skin: "#F0D0A0", hair: "#808090", shirt: "#C0C0D0",
    pants: "#A0A0B0", accent: "#1E7FD8", eyes: "#1a1a2e",
  },
  bishop: {
    skin: "#F0D0A0", hair: "#2C2C3C", shirt: "#2A2A3A",
    pants: "#1A1A2A", accent: "#E74C3C", eyes: "#1a1a2e",
  },
  knight: {
    skin: "#F0D0A0", hair: "#4A3728", shirt: "#2E8B57",
    pants: "#1D6B3F", accent: "#90EE90", eyes: "#1a1a2e",
  },
  pawn: {
    skin: "#F0D0A0", hair: "#6B4226", shirt: "#8B7355",
    pants: "#6B5335", accent: "#D2B48C", eyes: "#1a1a2e",
  },
  "black-rook": {
    skin: "#D0B090", hair: "#1A1A1A", shirt: "#2C0A0A",
    pants: "#1A0606", accent: "#FF4444", eyes: "#FF4444",
  },
  "black-bishop": {
    skin: "#D0B090", hair: "#3A3A3A", shirt: "#404050",
    pants: "#303040", accent: "#9B59B6", eyes: "#1a1a2e",
  },
  "black-knight": {
    skin: "#D0B090", hair: "#1A1A1A", shirt: "#333344",
    pants: "#222233", accent: "#E67E22", eyes: "#E67E22",
  },
  chancellor: {
    skin: "#F0D0A0", hair: "#4A4A5A", shirt: "#34495E",
    pants: "#2C3E50", accent: "#3498DB", eyes: "#1a1a2e",
  },
  cardinal: {
    skin: "#F0D0A0", hair: "#F5F5F5", shirt: "#FFFFFF",
    pants: "#E0E0E0", accent: "#2ECC71", eyes: "#1a1a2e",
  },
  scout: {
    skin: "#F0D0A0", hair: "#2C6B2F", shirt: "#2E4A1E",
    pants: "#1E3A0E", accent: "#7CFC00", eyes: "#1a1a2e",
  },
  ship: {
    skin: "#C0C0D0", hair: "#808090", shirt: "#505060",
    pants: "#404050", accent: "#1E7FD8", eyes: "#1E7FD8",
  },
  ab: {
    skin: "#C8A882", hair: "#3D2B1F", shirt: "#1A1A1A",
    pants: "#2B4570", accent: "#333333", eyes: "#1a1a2e",
  },
  andrea: {
    skin: "#F0D0A0", hair: "#A0724A", shirt: "#5B6B3D",
    pants: "#4A5A2D", accent: "#8B7355", eyes: "#1a1a2e",
  },
  arturo: {
    skin: "#E0C8A8", hair: "#B83200", shirt: "#0E0E0E",
    pants: "#101010", accent: "#1A1A1A", eyes: "#1a1a2e",
  },
  francesco: {
    skin: "#E8C8A0", hair: "#1A1A2A", shirt: "#2C3E50",
    pants: "#3A3A3A", accent: "#4A6A7A", eyes: "#1a1a2e",
  },
};

// ── Pixel templates (14 wide x 22 tall → drawn into 16x32 frame) ─
// Legend: H=hair, S=skin, T=shirt, P=pants, A=accent, E=eyes, .=empty

const BASE_FRONT = [
  "......HHHH......",
  ".....HHHHHH.....",
  "....HHHHHHHH....",
  "....HHSSSSHH....",
  "....HSSEESSH....",
  "....HSSSSSSH....",
  ".....SSSSSS.....",
  "......SSSS......",
  ".....AATTAA.....",
  "....TTTTTTTT....",
  "...STTTATTTTS...",
  "...STTTTTTTTS...",
  "...STTTTTTTTS...",
  "....TTTTTTTT....",
  ".....TTTTTT.....",
  ".....PPPPPP.....",
  ".....PPPPPP.....",
  ".....PP..PP.....",
  ".....PP..PP.....",
  "....PP....PP....",
];

const BASE_BACK = [
  "......HHHH......",
  ".....HHHHHH.....",
  "....HHHHHHHH....",
  "....HHHHHHHH....",
  "....HHHHHHHH....",
  "....HHHHHHHH....",
  ".....HHHHHH.....",
  "......SSSS......",
  ".....AATTAA.....",
  "....TTTTTTTT....",
  "...STTTTTTTTS...",
  "...STTTTTTTTS...",
  "...STTTTTTTTS...",
  "....TTTTTTTT....",
  ".....TTTTTT.....",
  ".....PPPPPP.....",
  ".....PPPPPP.....",
  ".....PP..PP.....",
  ".....PP..PP.....",
  "....PP....PP....",
];

// Walk leg variants — 4 distinct poses for smoother animation.
const LEGS_FRONT: string[][] = [
  // Pose 0 — standing
  [".....PP..PP.....", ".....PP..PP.....", "....PP....PP...."],
  // Pose 1 — right step forward
  [".....PP..PP.....", "....PP....PP....", "...PP......PP..."],
  // Pose 2 — passing (feet together)
  [".....PPPPPP.....", ".....PP..PP.....", ".....PP..PP....."],
  // Pose 3 — left step forward
  [".....PP..PP.....", "....PP....PP....", "...PP......PP..."],
];

const LEGS_BACK: string[][] = [
  [".....PP..PP.....", ".....PP..PP.....", "....PP....PP...."],
  [".....PP..PP.....", "....PP....PP....", "...PP......PP..."],
  [".....PPPPPP.....", ".....PP..PP.....", ".....PP..PP....."],
  [".....PP..PP.....", "....PP....PP....", "...PP......PP..."],
];

const LEGS_SIDE: string[][] = [
  [".....PP..PP.....", ".....PP..PP.....", ".....PP..PP....."],
  ["....PPP.PP......", "....PP..PP......", "....PP...PP....."],
  [".....PP..PP.....", ".....PP..PP.....", ".....PP..PP....."],
  ["......PP.PPP....", "......PP..PP....", ".....PP...PP...."],
];

const ACCESSORY_TEMPLATES: Record<string, string[]> = {
  giovanni: [
    "....A.AAAA.A....",
    "....AAAAAAAA....",
  ],
  king: [
    "....A.AAAA.A....",
    ".....AAAAAA.....",
  ],
  queen: [
    "......A..A......",
    ".....AAAAAA.....",
  ],
  "white-rook": [
    "....AAA..AAA....",
    "....AAAAAAAA....",
  ],
  knight: [
    "................",
    "....A...........",
  ],
  "black-rook": [
    "....A......A....",
    "................",
  ],
  chancellor: [
    "................",
    ".....A....A.....",
  ],
  cardinal: [
    "................",
    "......AAAA......",
  ],
  scout: [
    "..AAAAAAAAAAAA..",
    "................",
  ],
};

// ── Pixel map building ───────────────────────────────────

type PixelMap = (string | null)[][];

const FW = 16;
const FH = 32;

function buildPixelMap(characterId: string, bodyTemplate: string[], legVariant?: string[]): PixelMap {
  const map: PixelMap = Array.from({ length: FH }, () => Array(FW).fill(null));
  const accessory = ACCESSORY_TEMPLATES[characterId];
  let oy = 4; // Start offset for vertical centering in 32px frame.

  if (accessory) {
    for (let r = 0; r < accessory.length; r++) {
      for (let c = 0; c < Math.min(accessory[r].length, FW); c++) {
        if (accessory[r][c] !== ".") map[oy + r][c] = accessory[r][c];
      }
    }
    oy += accessory.length;
  }

  const body = legVariant
    ? [...bodyTemplate.slice(0, -3), ...legVariant]
    : bodyTemplate;

  for (let r = 0; r < body.length; r++) {
    const ty = oy + r;
    if (ty >= FH) break;
    for (let c = 0; c < Math.min(body[r].length, FW); c++) {
      if (body[r][c] !== ".") map[ty][c] = body[r][c];
    }
  }

  return map;
}

function offsetMap(map: PixelMap, dy: number): PixelMap {
  if (dy === 0) return map;
  const out: PixelMap = Array.from({ length: FH }, () => Array(FW).fill(null));
  for (let y = 0; y < FH; y++) {
    const sy = y - dy;
    if (sy >= 0 && sy < FH) {
      for (let x = 0; x < FW; x++) out[y][x] = map[sy][x];
    }
  }
  return out;
}

// ── Frame rendering (outline + directional shading) ──────

function renderFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  fx: number,
  fy: number,
  map: PixelMap,
  shades: DerivedShades,
  flipped: boolean,
  lightFromLeft: boolean,
): void {
  // Pass 1 — Outline: empty pixels with a filled 4-neighbor.
  ctx.fillStyle = OUTLINE;
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      if (map[y][x] !== null) continue;
      const adj =
        (y > 0 && map[y - 1][x] !== null) ||
        (y < FH - 1 && map[y + 1][x] !== null) ||
        (x > 0 && map[y][x - 1] !== null) ||
        (x < FW - 1 && map[y][x + 1] !== null);
      if (adj) {
        const px = flipped ? fx + FW - 1 - x : fx + x;
        ctx.fillRect(px, fy + y, 1, 1);
      }
    }
  }

  // Pass 2 — Fill with directional shading.
  // lightFromLeft=true: light from top-left (default). false: light from top-right (for flipped sprites).
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      const key = map[y][x];
      if (key === null) continue;

      const px = flipped ? fx + FW - 1 - x : fx + x;

      const rightNull = x >= FW - 1 || map[y][x + 1] === null;
      const belowNull = y >= FH - 1 || map[y + 1][x] === null;
      const leftNull = x <= 0 || map[y][x - 1] === null;
      const aboveNull = y <= 0 || map[y - 1][x] === null;

      let shadow: boolean;
      let highlight: boolean;

      if (lightFromLeft) {
        shadow = rightNull || belowNull;
        highlight = leftNull || aboveNull;
      } else {
        shadow = leftNull || belowNull;
        highlight = rightNull || aboveNull;
      }

      let color: string;
      if (shadow && !highlight) {
        color = shades.shadow[key];
      } else if (highlight && !shadow) {
        color = shades.highlight[key];
      } else {
        color = shades.base[key];
      }

      ctx.fillStyle = color;
      ctx.fillRect(px, fy + y, 1, 1);
    }
  }
}

// ── Sprite sheet generation ──────────────────────────────

export function generateSpriteSheet(characterId: string): SpriteSheet {
  const palette = PALETTES[characterId] || PALETTES.pawn;
  const shades = deriveShades(palette);
  const cols = 4;
  const rows = 5; // idle, walk-down, walk-up, walk-side, action

  const canvas = new OffscreenCanvas(FW * cols, FH * rows);
  const ctx = canvas.getContext("2d")!;

  const bobs = [0, -1, -1, 0];

  // Row 0 — Idle (subtle bob, front-facing).
  for (let f = 0; f < 4; f++) {
    const map = buildPixelMap(characterId, BASE_FRONT);
    renderFrame(ctx, f * FW, 0, offsetMap(map, bobs[f]), shades, false, true);
  }

  // Row 1 — Walk down (4 distinct leg poses).
  const walkBobs = [0, -1, 0, -1];
  for (let f = 0; f < 4; f++) {
    const map = buildPixelMap(characterId, BASE_FRONT, LEGS_FRONT[f]);
    renderFrame(ctx, f * FW, FH, offsetMap(map, walkBobs[f]), shades, false, true);
  }

  // Row 2 — Walk up (4 distinct leg poses, back-facing).
  for (let f = 0; f < 4; f++) {
    const map = buildPixelMap(characterId, BASE_BACK, LEGS_BACK[f]);
    renderFrame(ctx, f * FW, FH * 2, offsetMap(map, walkBobs[f]), shades, false, true);
  }

  // Row 3 — Walk side (flipped, with corrected shading direction).
  for (let f = 0; f < 4; f++) {
    const map = buildPixelMap(characterId, BASE_FRONT, LEGS_SIDE[f]);
    // Flipped sprite: light should come from top-right to maintain consistent lighting.
    renderFrame(ctx, f * FW, FH * 3, offsetMap(map, walkBobs[f]), shades, true, false);
  }

  // Row 4 — Action (bob + sparkle overlay at arms).
  for (let f = 0; f < 4; f++) {
    const map = buildPixelMap(characterId, BASE_FRONT);
    renderFrame(ctx, f * FW, FH * 4, offsetMap(map, bobs[f]), shades, false, true);
    const accH = ACCESSORY_TEMPLATES[characterId]?.length ?? 0;
    const sy = FH * 4 + accH + 16 + bobs[f];
    ctx.fillStyle = palette.accent;
    if (f % 2 === 0) {
      ctx.fillRect(f * FW + 2 + f, sy, 1, 1);
      ctx.fillRect(f * FW + 13 - f, sy + 1, 1, 1);
    } else {
      ctx.fillRect(f * FW + 3, sy - 1, 1, 1);
      ctx.fillRect(f * FW + 12, sy, 1, 1);
    }
  }

  return {
    canvas,
    frameWidth: FW,
    frameHeight: FH,
    animations: {
      idle: { row: 0, frames: 4, speed: 400 },
      "walk-down": { row: 1, frames: 4, speed: 180 },
      "walk-up": { row: 2, frames: 4, speed: 180 },
      "walk-side": { row: 3, frames: 4, speed: 180 },
      action: { row: 4, frames: 4, speed: 250 },
    },
  };
}

/** Pre-generate all character sprite sheets. */
export function generateAllSprites(): Map<string, SpriteSheet> {
  const sprites = new Map<string, SpriteSheet>();
  for (const id of Object.keys(PALETTES)) {
    sprites.set(id, generateSpriteSheet(id));
  }
  return sprites;
}
