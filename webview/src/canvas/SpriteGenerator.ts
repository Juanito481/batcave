/**
 * Procedural pixel art sprite generator — Pokemon FireRed style.
 *
 * Generates 16x32 pixel character sprites directly on offscreen canvases.
 * Each character has: idle (4 frames), walk (4 frames x 4 directions),
 * and action animations (typing, thinking, reading).
 *
 * No external PNG files needed — all art is computed.
 */

export interface SpriteSheet {
  canvas: OffscreenCanvas;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, { row: number; frames: number; speed: number }>;
}

interface CharacterPalette {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  accent: string;
  eyes: string;
}

// ── Palettes for each character ──────────────────────────────────

const PALETTES: Record<string, CharacterPalette> = {
  claude: {
    skin: "#E8A080",
    hair: "#C06040",
    shirt: "#D97757",
    pants: "#B85A3A",
    accent: "#FFFFFF",
    eyes: "#1a1a2e",
  },
  king: {
    skin: "#F0D0A0",
    hair: "#FFD700",
    shirt: "#4A0E6B",
    pants: "#380854",
    accent: "#FFD700",
    eyes: "#1a1a2e",
  },
  queen: {
    skin: "#F0D0A0",
    hair: "#8B0000",
    shirt: "#1E7FD8",
    pants: "#155FA0",
    accent: "#FFD700",
    eyes: "#1a1a2e",
  },
  "white-rook": {
    skin: "#F0D0A0",
    hair: "#808090",
    shirt: "#C0C0D0",
    pants: "#A0A0B0",
    accent: "#1E7FD8",
    eyes: "#1a1a2e",
  },
  bishop: {
    skin: "#F0D0A0",
    hair: "#2C2C3C",
    shirt: "#2A2A3A",
    pants: "#1A1A2A",
    accent: "#E74C3C",
    eyes: "#1a1a2e",
  },
  knight: {
    skin: "#F0D0A0",
    hair: "#4A3728",
    shirt: "#2E8B57",
    pants: "#1D6B3F",
    accent: "#90EE90",
    eyes: "#1a1a2e",
  },
  pawn: {
    skin: "#F0D0A0",
    hair: "#6B4226",
    shirt: "#8B7355",
    pants: "#6B5335",
    accent: "#D2B48C",
    eyes: "#1a1a2e",
  },
  "black-rook": {
    skin: "#D0B090",
    hair: "#1A1A1A",
    shirt: "#2C0A0A",
    pants: "#1A0606",
    accent: "#FF4444",
    eyes: "#FF4444",
  },
  "black-bishop": {
    skin: "#D0B090",
    hair: "#3A3A3A",
    shirt: "#404050",
    pants: "#303040",
    accent: "#9B59B6",
    eyes: "#1a1a2e",
  },
  "black-knight": {
    skin: "#D0B090",
    hair: "#1A1A1A",
    shirt: "#333344",
    pants: "#222233",
    accent: "#E67E22",
    eyes: "#E67E22",
  },
  chancellor: {
    skin: "#F0D0A0",
    hair: "#4A4A5A",
    shirt: "#34495E",
    pants: "#2C3E50",
    accent: "#3498DB",
    eyes: "#1a1a2e",
  },
  cardinal: {
    skin: "#F0D0A0",
    hair: "#F5F5F5",
    shirt: "#FFFFFF",
    pants: "#E0E0E0",
    accent: "#2ECC71",
    eyes: "#1a1a2e",
  },
  scout: {
    skin: "#F0D0A0",
    hair: "#2C6B2F",
    shirt: "#2E4A1E",
    pants: "#1E3A0E",
    accent: "#7CFC00",
    eyes: "#1a1a2e",
  },
  ship: {
    skin: "#C0C0D0",
    hair: "#808090",
    shirt: "#505060",
    pants: "#404050",
    accent: "#1E7FD8",
    eyes: "#1E7FD8",
  },
};

// ── Pixel art templates (12 wide x 20 tall, drawn into 16x32 frame) ──
// Legend: H=hair, S=skin, T=shirt, P=pants, A=accent, E=eyes, .=empty

const BASE_TEMPLATE = [
  "....HHHH....",  // hair top
  "...HHHHHH...",  // hair full
  "..HHHHHHHH..",  // hair wide
  "..HHSSSSHH..",  // forehead + hair sides
  "..HSSEESSH..",  // face with eyes
  "..HSSSSSSH..",  // cheeks
  "...SSSSSS...",  // jaw
  "....SSSS....",  // chin
  "....TTTT....",  // collar
  "...TTTTTT...",  // shirt top
  ".SSTTATTAS..",  // arms (skin) + shirt + accent
  ".SSTTTTTTS..",  // arms + shirt
  ".SSTTTTTTS..",  // arms + shirt
  "..STTTTTTS..",  // forearms + shirt
  "...TTTTTT...",  // shirt bottom
  "...PPPPPP...",  // waist
  "...PPPPPP...",  // pants upper
  "...PP..PP...",  // legs
  "...PP..PP...",  // legs lower
  "..PP....PP..",  // feet
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

/** Generate a complete sprite sheet for a character. */
export function generateSpriteSheet(characterId: string): SpriteSheet {
  const palette = PALETTES[characterId] || PALETTES.pawn;
  const frameW = 16;
  const frameH = 32;
  const cols = 4; // 4 frames per animation
  const rows = 4; // idle, walk-down, walk-side, action

  const canvas = new OffscreenCanvas(frameW * cols, frameH * rows);
  const ctx = canvas.getContext("2d")!;

  // Row 0: idle (4 frames with subtle bob)
  for (let f = 0; f < 4; f++) {
    const bobY = f === 1 || f === 2 ? -1 : 0;
    drawCharacter(ctx, f * frameW, bobY, frameH, palette, characterId, false);
  }

  // Row 1: walk down (4 frames with leg movement)
  for (let f = 0; f < 4; f++) {
    const bobY = f % 2 === 0 ? 0 : -1;
    drawCharacter(ctx, f * frameW, frameH + bobY, frameH, palette, characterId, false);
    // Animate legs by shifting one leg forward.
    if (f % 2 === 1) {
      const templateH = BASE_TEMPLATE.length;
      const baseY = frameH + bobY + (ACCESSORY_TEMPLATES[characterId]?.length ?? 0) + 2;
      // Clear and redraw offset legs.
      ctx.fillStyle = palette.pants;
      ctx.clearRect(f * frameW + 3, baseY + templateH - 3, 3, 2);
      ctx.fillRect(f * frameW + 4, baseY + templateH - 3, 3, 2);
    }
  }

  // Row 2: walk side (4 frames)
  for (let f = 0; f < 4; f++) {
    drawCharacter(ctx, f * frameW, frameH * 2 + (f % 2 === 0 ? 0 : -1), frameH, palette, characterId, true);
  }

  // Row 3: action (typing/working — arms move + sparkles)
  for (let f = 0; f < 4; f++) {
    drawCharacter(ctx, f * frameW, frameH * 3, frameH, palette, characterId, false);
    // Action sparkle at arm level.
    ctx.fillStyle = palette.accent;
    const sparkleY = frameH * 3 + (ACCESSORY_TEMPLATES[characterId]?.length ?? 0) + 14;
    if (f % 2 === 0) {
      ctx.fillRect(f * frameW + 1 + f, sparkleY, 1, 1);
      ctx.fillRect(f * frameW + 13 - f, sparkleY + 1, 1, 1);
    } else {
      ctx.fillRect(f * frameW + 2, sparkleY - 1, 1, 1);
      ctx.fillRect(f * frameW + 12, sparkleY, 1, 1);
    }
  }

  return {
    canvas,
    frameWidth: frameW,
    frameHeight: frameH,
    animations: {
      idle: { row: 0, frames: 4, speed: 400 },
      "walk-down": { row: 1, frames: 4, speed: 200 },
      "walk-side": { row: 2, frames: 4, speed: 200 },
      action: { row: 3, frames: 4, speed: 250 },
    },
  };
}

function drawCharacter(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  frameH: number,
  palette: CharacterPalette,
  characterId: string,
  flipped: boolean
): void {
  const colorMap: Record<string, string> = {
    H: palette.hair,
    S: palette.skin,
    T: palette.shirt,
    P: palette.pants,
    A: palette.accent,
    E: palette.eyes,
  };

  // Draw accessory (crown, helmet, etc.) first if exists.
  const accessory = ACCESSORY_TEMPLATES[characterId];
  if (accessory) {
    for (let row = 0; row < accessory.length; row++) {
      const line = flipped ? accessory[row].split("").reverse().join("") : accessory[row];
      for (let col = 0; col < line.length; col++) {
        const ch = line[col];
        if (ch !== "." && colorMap[ch]) {
          ctx.fillStyle = colorMap[ch];
          ctx.fillRect(x + col + 2, y + row, 1, 1);
        }
      }
    }
  }

  // Draw body from template.
  const startY = accessory ? accessory.length : 0;
  for (let row = 0; row < BASE_TEMPLATE.length; row++) {
    const line = flipped
      ? BASE_TEMPLATE[row].split("").reverse().join("")
      : BASE_TEMPLATE[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch !== "." && colorMap[ch]) {
        ctx.fillStyle = colorMap[ch];
        ctx.fillRect(x + col + 2, y + startY + row + 2, 1, 1);
      }
    }
  }

  // Shadow — positioned relative to frame height.
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(x + 3, y + frameH - 4, 10, 2);
}

/** Pre-generate all character sprite sheets. Returns a Map<id, SpriteSheet>. */
export function generateAllSprites(): Map<string, SpriteSheet> {
  const sprites = new Map<string, SpriteSheet>();
  for (const id of Object.keys(PALETTES)) {
    sprites.set(id, generateSpriteSheet(id));
  }
  return sprites;
}
