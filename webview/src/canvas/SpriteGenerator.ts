/**
 * Procedural pixel art sprite generator — Pokemon FireRed style.
 *
 * GBA-authentic rendering techniques:
 * - 1px dark outline around all silhouettes
 * - Directional shadow/highlight shading (light from top-left)
 * - Palette-based shadows (no alpha transparency)
 * - Walk animation with distinct leg positions
 *
 * No external PNG files — all art is computed at init.
 */

export interface SpriteSheet {
  canvas: OffscreenCanvas;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, { row: number; frames: number; speed: number }>;
}

// ── Color utilities ──────────────────────────────────────

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).slice(1);
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

// ── Outline & ground shadow (near-black with warm cave tint) ─

const OUTLINE = "#0c0810";
const GROUND_SHADOW_DARK = "#080610";
const GROUND_SHADOW_MID = "#0c0a14";

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
  claude: {
    skin: "#E8A080", hair: "#C06040", shirt: "#D97757",
    pants: "#B85A3A", accent: "#FFFFFF", eyes: "#1a1a2e",
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
};

// ── Pixel templates (12 wide x 20 tall → drawn into 16x32 frame) ─
// Legend: H=hair, S=skin, T=shirt, P=pants, A=accent, E=eyes, .=empty

const BASE_TEMPLATE = [
  "....HHHH....",
  "...HHHHHH...",
  "..HHHHHHHH..",
  "..HHSSSSHH..",
  "..HSSEESSH..",
  "..HSSSSSSH..",
  "...SSSSSS...",
  "....SSSS....",
  "....TTTT....",
  "...TTTTTT...",
  ".SSTTATTAS..",
  ".SSTTTTTTS..",
  ".SSTTTTTTS..",
  "..STTTTTTS..",
  "...TTTTTT...",
  "...PPPPPP...",
  "...PPPPPP...",
  "...PP..PP...",
  "...PP..PP...",
  "..PP....PP..",
];

// Walk leg variants (replace last 3 rows of BASE_TEMPLATE).
const LEGS_NORMAL = [
  "...PP..PP...",
  "...PP..PP...",
  "..PP....PP..",
];

const LEGS_STRIDE = [
  "...PP..PP...",
  "..PP....PP..",
  ".PP......PP.",
];

const ACCESSORY_TEMPLATES: Record<string, string[]> = {
  king: [
    "..A.AAAA.A..",
    "...AAAAAA...",
  ],
  queen: [
    "....A..A....",
    "...AAAAAA...",
  ],
  "white-rook": [
    "..AAA..AAA..",
    "..AAAAAAAA..",
  ],
  knight: [
    "............",
    "..A.........",
  ],
  "black-rook": [
    "..A......A..",
    "............",
  ],
  chancellor: [
    "............",
    "...A....A...",
  ],
  cardinal: [
    "............",
    "....AAAA....",
  ],
  scout: [
    "AAAAAAAAAAAA",
    "............",
  ],
};

// ── Pixel map building ───────────────────────────────────

type PixelMap = (string | null)[][];

const FW = 16;
const FH = 32;

function buildPixelMap(characterId: string, legVariant?: string[]): PixelMap {
  const map: PixelMap = Array.from({ length: FH }, () => Array(FW).fill(null));
  const accessory = ACCESSORY_TEMPLATES[characterId];
  const ox = 2;
  let oy = 2;

  if (accessory) {
    for (let r = 0; r < accessory.length; r++) {
      for (let c = 0; c < accessory[r].length && c + ox < FW; c++) {
        if (accessory[r][c] !== ".") map[oy + r][ox + c] = accessory[r][c];
      }
    }
    oy += accessory.length;
  }

  const body = legVariant
    ? [...BASE_TEMPLATE.slice(0, -3), ...legVariant]
    : BASE_TEMPLATE;

  for (let r = 0; r < body.length; r++) {
    const ty = oy + r;
    if (ty >= FH) break;
    for (let c = 0; c < body[r].length && c + ox < FW; c++) {
      if (body[r][c] !== ".") map[ty][ox + c] = body[r][c];
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

  // Pass 2 — Fill with directional shading (light from top-left).
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      const key = map[y][x];
      if (key === null) continue;

      const px = flipped ? fx + FW - 1 - x : fx + x;

      // Outer-edge detection (null neighbors).
      const rightNull = x >= FW - 1 || map[y][x + 1] === null;
      const belowNull = y >= FH - 1 || map[y + 1][x] === null;
      const leftNull = x <= 0 || map[y][x - 1] === null;
      const aboveNull = y <= 0 || map[y - 1][x] === null;

      const shadow = rightNull || belowNull;
      const highlight = leftNull || aboveNull;

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

  // Ground shadow (opaque palette colors, no rgba).
  ctx.fillStyle = GROUND_SHADOW_DARK;
  ctx.fillRect(fx + 3, fy + FH - 3, 10, 1);
  ctx.fillStyle = GROUND_SHADOW_MID;
  ctx.fillRect(fx + 4, fy + FH - 2, 8, 1);
}

// ── Sprite sheet generation ──────────────────────────────

export function generateSpriteSheet(characterId: string): SpriteSheet {
  const palette = PALETTES[characterId] || PALETTES.pawn;
  const shades = deriveShades(palette);
  const cols = 4;
  const rows = 4;

  const canvas = new OffscreenCanvas(FW * cols, FH * rows);
  const ctx = canvas.getContext("2d")!;

  const baseMap = buildPixelMap(characterId);
  const bobs = [0, -1, -1, 0];

  // Row 0 — Idle (subtle bob).
  for (let f = 0; f < 4; f++) {
    renderFrame(ctx, f * FW, 0, offsetMap(baseMap, bobs[f]), shades, false);
  }

  // Row 1 — Walk down (alternating stride + bob).
  const legFrames = [LEGS_NORMAL, LEGS_STRIDE, LEGS_NORMAL, LEGS_STRIDE];
  const walkBobs = [0, -1, 0, -1];
  for (let f = 0; f < 4; f++) {
    const walkMap = buildPixelMap(characterId, legFrames[f]);
    renderFrame(ctx, f * FW, FH, offsetMap(walkMap, walkBobs[f]), shades, false);
  }

  // Row 2 — Walk side (same stride pattern, flipped).
  for (let f = 0; f < 4; f++) {
    const walkMap = buildPixelMap(characterId, legFrames[f]);
    renderFrame(ctx, f * FW, FH * 2, offsetMap(walkMap, walkBobs[f]), shades, true);
  }

  // Row 3 — Action (bob + sparkle overlay at arms).
  for (let f = 0; f < 4; f++) {
    renderFrame(ctx, f * FW, FH * 3, offsetMap(baseMap, bobs[f]), shades, false);
    // Sparkle accent pixels near the hands.
    const accH = ACCESSORY_TEMPLATES[characterId]?.length ?? 0;
    const sy = FH * 3 + accH + 14 + bobs[f];
    ctx.fillStyle = palette.accent;
    if (f % 2 === 0) {
      ctx.fillRect(f * FW + 1 + f, sy, 1, 1);
      ctx.fillRect(f * FW + 13 - f, sy + 1, 1, 1);
    } else {
      ctx.fillRect(f * FW + 2, sy - 1, 1, 1);
      ctx.fillRect(f * FW + 12, sy, 1, 1);
    }
  }

  return {
    canvas,
    frameWidth: FW,
    frameHeight: FH,
    animations: {
      idle: { row: 0, frames: 4, speed: 400 },
      "walk-down": { row: 1, frames: 4, speed: 200 },
      "walk-side": { row: 2, frames: 4, speed: 200 },
      action: { row: 3, frames: 4, speed: 250 },
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
