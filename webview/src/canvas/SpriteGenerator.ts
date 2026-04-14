/**
 * Procedural pixel art sprite generator — Pokemon FireRed style.
 *
 * GBA-authentic rendering techniques:
 * - 1px dark outline around all silhouettes
 * - Directional shadow/highlight shading (light from top-left)
 * - Palette-based shadows (no alpha transparency)
 * - 4-direction walk animation with distinct leg positions
 * - UNIQUE body templates per agent archetype (v2)
 *
 * No external PNG files — all art is computed at init.
 */

import { darken, lighten } from "../helpers/color";
import { AGENT_PERSONALITIES, BodyType } from "../data/agent-personalities";

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
  // GBA-style 16-color budget: 6 base + 4 shadow (H,S,T,P) + 4 highlight (H,S,T,A) + outline + transparent.
  return {
    base: {
      H: p.hair,
      S: p.skin,
      T: p.shirt,
      P: p.pants,
      A: p.accent,
      E: p.eyes,
    },
    shadow: {
      H: darken(p.hair, 0.3),
      S: darken(p.skin, 0.22),
      T: darken(p.shirt, 0.25),
      P: darken(p.pants, 0.25),
      A: p.accent, // no separate shadow — budget
      E: p.eyes, // no separate shadow — budget
    },
    highlight: {
      H: lighten(p.hair, 0.18),
      S: lighten(p.skin, 0.15),
      T: lighten(p.shirt, 0.15),
      P: p.pants, // no separate highlight — budget
      A: lighten(p.accent, 0.2),
      E: p.eyes, // no separate highlight — budget
    },
  };
}

// ── Character palettes ───────────────────────────────────

const PALETTES: Record<string, CharacterPalette> = {
  alfred: {
    // P0: shirt #1A1A2A → #2A2A3E, pants #101820 → #1A1A2E for visibility.
    skin: "#E8C0A0",
    hair: "#4A4A5A",
    shirt: "#2A2A3E",
    pants: "#1A1A2E",
    accent: "#FFFFFF",
    eyes: "#1a1a2e",
  },
  giovanni: {
    skin: "#D8B090",
    hair: "#1a1a2a",
    shirt: "#5a6070",
    pants: "#3a3a4a",
    accent: "#FFD700",
    eyes: "#FFFFFF",
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
  rook: {
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
  marauder: {
    skin: "#D0B090",
    hair: "#1A1A1A",
    shirt: "#2C0A0A",
    pants: "#1A0606",
    accent: "#FF4444",
    eyes: "#FF4444",
  },
  specter: {
    skin: "#D0B090",
    hair: "#3A3A3A",
    shirt: "#404050",
    pants: "#303040",
    accent: "#9B59B6",
    eyes: "#9B59B6",
  },
  heretic: {
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
  herald: {
    skin: "#F0D0A0",
    hair: "#5A3D22",
    shirt: "#1E7FD8",
    pants: "#155FA0",
    accent: "#FFD700",
    eyes: "#1a1a2e",
  },
  sculptor: {
    skin: "#F0D0A0",
    hair: "#8B5A2B",
    shirt: "#F5F5F5",
    pants: "#D0D0D8",
    accent: "#1E7FD8",
    eyes: "#1a1a2e",
  },
  weaver: {
    skin: "#F0D0A0",
    hair: "#4A3728",
    shirt: "#3A4A60",
    pants: "#2A3A50",
    accent: "#1ABC9C",
    eyes: "#1a1a2e",
  },
  marshal: {
    skin: "#F0D0A0",
    hair: "#2A2A2A",
    shirt: "#8B6B2F",
    pants: "#6B4F1F",
    accent: "#C0C0C0",
    eyes: "#1a1a2e",
  },
  polymorph: {
    skin: "#D0B090",
    hair: "#6A4A8B",
    shirt: "#4A2A6B",
    pants: "#3A1A5B",
    accent: "#E91E63",
    eyes: "#E91E63",
  },
  thief: {
    skin: "#D0B090",
    hair: "#1A1A1A",
    shirt: "#2C2C2C",
    pants: "#1A1A1A",
    accent: "#FFD700",
    eyes: "#FFD700",
  },
  oracle: {
    skin: "#F0D0A0",
    hair: "#6B2B8B",
    shirt: "#301B5B",
    pants: "#201040",
    accent: "#9B59B6",
    eyes: "#9B59B6",
  },
  loop: {
    skin: "#F0D0A0",
    hair: "#6B5335",
    shirt: "#2E7D6E",
    pants: "#1E6D5E",
    accent: "#F39C12",
    eyes: "#1a1a2e",
  },
  ab: {
    skin: "#C8A882",
    hair: "#3D2B1F",
    shirt: "#1A1A1A",
    pants: "#2B4570",
    accent: "#333333",
    eyes: "#1a1a2e",
  },
  andrea: {
    skin: "#F0D0A0",
    hair: "#A0724A",
    shirt: "#5B6B3D",
    pants: "#4A5A2D",
    accent: "#8B7355",
    eyes: "#1a1a2e",
  },
  arturo: {
    skin: "#E0C8A8",
    hair: "#B83200",
    shirt: "#0E0E0E",
    pants: "#101010",
    accent: "#1A1A1A",
    eyes: "#1a1a2e",
  },
  francesco: {
    skin: "#E8C8A0",
    hair: "#1A1A2A",
    shirt: "#2C3E50",
    pants: "#3A3A3A",
    accent: "#4A6A7A",
    eyes: "#1a1a2e",
  },
};

// ── Body templates per archetype ────────────────────────
// Each template: 17 rows (body) + legs are appended separately.
// Legend: H=hair, S=skin, T=shirt, P=pants, A=accent, E=eyes, .=empty
// All rows MUST be exactly 16 characters wide.

// Standard humanoid (default for knight, chancellor, NPCs).
// Lowercase = forced shadow, digits 1-6 = forced highlight (1=H,2=S,3=T,4=P,5=A,6=E).
const BODY_STANDARD = [
  "......HHHH......",
  ".....H1HhHH.....",
  "....HHhH1HHH....",
  "....HhSSSSHH....",
  "....HSSEESSH....",
  "....HSSsSSH.....",
  ".....SSSSSS.....",
  "......SSSS......",
  ".....AATTAA.....",
  "....3TTtTTTT....",
  "...STTTaTTTTS...",
  "...STTTtTTTTS...",
  "...sTTTTTTTTs...",
  "....TTtAATTT....",
  ".....TTTTTT.....",
  ".....PPPPPP.....",
  ".....Pp..pP.....",
];

// Batman — tall cowl ears, mask w/ white eyes, grey suit, dark cape, gold belt.
// Symmetric 16px-wide. H=cowl(dark), T=cape(dark), S=skin(chin),
// 3=suit highlight, t=suit shadow for grey torso.
// P=pants(dark grey legs), A=belt(gold), E=eyes(white).
const BODY_BATMAN = [
  "....H......H....", // cowl ear tips (tall, narrow, symmetric)
  "...HH......HH...", // ear shafts
  "...HHHHHHHHHH...", // ears merge into skull
  "..HHHHHHHHHHHH..", // full cowl width
  "..HHhEEHHEEhHH..", // brow + white angular eyes
  "..HHHHHHHHHHHH..", // nose bridge
  "....HHSSSSHH....", // lower face (tiny skin window)
  ".....SSSSSS.....", // chin
  "......SSSS......", // neck
  "..tTT3TT3TTTt...", // shoulders — cape wraps grey suit
  "..TTTTTTTTTTTT..", // upper chest — wide cape
  "..tTT3TT3TTTt...", // mid chest — suit visible under cape
  "..TTTTtTtTTTTT..", // lower chest
  "..tTTTTTTTTTTt..", // waist cape
  "...TAAAAAAT.....", // gold utility belt
  "...TTPPPPPPTT...", // upper legs under cape
  "...TTPp..pPTT...", // lower legs + boots
];

// Caped — King: wide cape draping from shoulders, regal silhouette.
const BODY_CAPED = [
  "......HHHH......",
  ".....H1HhHH.....",
  "....HHhH1HHH....",
  "....HhSSSSHH....",
  "....HSSEESSH....",
  "....HSSsSSH.....",
  ".....SSSSSS.....",
  "......SASS......",
  "...5AATTTTAA5...",
  "..AATTT3TTTAA...",
  "..AsTTTTTTTTsA..",
  "..ATTTtTtTTTA...",
  "..aTTTTTTTTTa...",
  "...aTTAATTTa....",
  "...AATTTTTTAA...",
  "...AAPPPPPPaA...",
  "...AAPp..pPAA...",
];

// Robed — Queen: elegant dress that widens at the bottom.
const BODY_ROBED = [
  "......HHHH......",
  ".....1HhH1H.....",
  "....HHhHH1HH....",
  "....HhSSSSHH....",
  "....HSSEESSH....",
  "....HSSsSSH.....",
  ".....SSSSSS.....",
  "......sASs......",
  ".....AATTAA.....",
  "....3TTtTTTT....",
  "...STTTaTTTTS...",
  "...sTTTTTTTTs...",
  "....TTtATTTT....",
  "....TTTtTTTT....",
  "...TTTTTTTTTT...",
  "..3TTTTtTTTTT...",
  "..tTTTTtTTTTt...",
];

// Armored — Rook / Marshal: wide, stocky, boxy torso with shield.
const BODY_ARMORED = [
  "......HHHH......",
  ".....HHHHHH.....",
  "....HHHHHHHH....",
  "....HhSSSSHH....",
  "....HSSEESSH....",
  "....HSSsSSH.....",
  ".....SSSSSS.....",
  "......SSSS......",
  "....AATTTTAA....",
  "...3TTTTTTTT3...",
  "..STTAAATTTTS...",
  "..sTTTtTTTTTsA..",
  "..sTTTTtTTTTsA..",
  "...TTtAATAATT...",
  "...TTTTTTTTTT...",
  "....PPPPPPPP....",
  "....Pp....pP....",
];

// Coated — Bishop: long detective coat extending below waist.
const BODY_COATED = [
  "......HHHH......",
  ".....H1HhHH.....",
  "....HHhHHHHH....",
  "....HhSSSSHH....",
  "....HSSEESSH....",
  "....HSSsSSH.....",
  ".....SSSSSS.....",
  "......SSSS......",
  ".....AATTAA.....",
  "....3TTtTTTT....",
  "...STTTaTTTTS...",
  "...sTTATTTATs...",
  "...sTTTtTTTTs...",
  "....TTTtTTTT....",
  "....TaATTTTT....",
  "....TTTtTTTT....",
  "....TT.Pp.TT....",
];

// Hooded — Marauder / Thief: cloak with hood, narrow and sinister.
const BODY_HOODED = [
  ".....HHHHHH.....",
  "....HhHHH1HH....",
  "...HhHHHHHHHH...",
  "...HHHhSShHHH...",
  "....HSSEESSH....",
  "....HSSsSSH.....",
  ".....SSSSSS.....",
  "......SSSS......",
  ".....aTTTTa.....",
  "....TTTTTTTT....",
  "...hTTTaTTTTh...",
  "...hTTTtTTTTh...",
  "...hTTTTTTTTh...",
  "....hHhHhHhH....",
  "....HHTTTTHH....",
  ".....PPPPPP.....",
  ".....Pp..pP.....",
];

// Heavy — Specter: very wide shoulders, demolition build.
const BODY_HEAVY = [
  "......HHHH......",
  ".....HhHHHH.....",
  "....HHHHHHHH....",
  "....HhSSSSHH....",
  "....HSSEESSH....",
  "....HSSsSSH.....",
  ".....SSSSSS.....",
  "......SSSS......",
  "...AAATTTTAAA...",
  "..3TTTTtTTTTT3..",
  ".SATTTTaTTTTAS..",
  ".sTTTTTtTTTTTs..",
  "..sTTTTTTTTTTs..",
  "..TTTTAATTtTTT..",
  "...TTTTTTTTTT...",
  "....PPPPPPPP....",
  "....Pp....pP....",
];

// Glitch — Heretic / Polymorph: asymmetric, irregular silhouette.
const BODY_GLITCH = [
  ".....HHHHH......",
  "....HhHHHH.H....",
  "....HhHHH1HH....",
  "....HhSSSSHH....",
  "...HSSEESSH.....",
  "....HSSsSSH.....",
  ".....SSSSSS.....",
  "......SSSS......",
  "....aTaTTAa.....",
  "...TTTtTTTTT....",
  "..SATTaTTTTs....",
  "...sTTTtTTTTs...",
  "..sTTTTTaTTs....",
  "...TTaTTTtTTT...",
  "....TTTTTTT.....",
  "....pPPPPPP.....",
  ".....Pp.pP......",
];

// Lab coat — Cardinal: clean white coat, neat proportions.
const BODY_LABCOAT = [
  "......HHHH......",
  ".....HHHHHH.....",
  "....HHhHH1HH....",
  "....HhSSSSHH....",
  "....HSSEESSH....",
  "....HSSsSSH.....",
  ".....SSSSSS.....",
  "......SSSS......",
  ".....AATTAA.....",
  "....3TTtTTTT....",
  "...STTTaTTTTS...",
  "...sTTATTTATs...",
  "...sTTTtTTTTs...",
  "....TTTtTTTT....",
  "....TTaATTTT....",
  "....TTPPpPTT....",
  "....TT.Pp.TT....",
];

// Geared — Scout: vest with equipment bumps, utility look.
const BODY_GEARED = [
  "......HHHH......",
  ".....H1HhHH.....",
  "....HHhHHHHH....",
  "....HhSSSSHH....",
  "....HSSEESSH....",
  "....HSSsSSH.....",
  ".....SSSSSS.....",
  "......SSSS......",
  "....AAaTTAAA....",
  "....3TTtTTTT....",
  "...SATTaTTTTS...",
  "...sTTTaTTATs...",
  "...sTTTtTTTTs...",
  "....TaATAATT....",
  ".....TTTTTT.....",
  ".....PPPPPP.....",
  ".....Pp..pP.....",
];

// Compact — Pawn: shorter body, pushed down in frame.
const BODY_COMPACT = [
  "......HHHH......",
  ".....H1HhHH.....",
  "....HHhHHHHH....",
  "....HhSSSSHH....",
  "....HSSEESSH....",
  "....HSSsSSH.....",
  ".....SSSSSS.....",
  "......AaSs......",
  ".....AATTAA.....",
  "....3TTtTTTT....",
  "...STTTtTTTTS...",
  "...sTTTTTTTTs...",
  "....TTtTTTTT....",
  ".....TTTTTT.....",
  ".....PPPPPP.....",
  ".....PPppPP.....",
  ".....Pp..pP.....",
];

// Naval — Ship: broad shoulders, captain's coat with buttons.
const BODY_NAVAL = [
  "......HHHH......",
  ".....HHHHHH.....",
  "....HHHHHHHH....",
  "....HhSSSSHH....",
  "....HSSEESSH....",
  "....HSSsSSH.....",
  ".....SSSSSS.....",
  "......SSSS......",
  "....AATTTTAA....",
  "...3TTTtTTTT3...",
  "..STTAATTTtTTS..",
  "..sTTTTaTTTTs...",
  "..sTTTTaTTTTs...",
  "...TTTTtTTTTT...",
  "....TTTtTTTT....",
  "....PPPPPPPP....",
  "....Pp....pP....",
];

// Map body type string to template.
const BODY_TEMPLATES: Record<BodyType, string[]> = {
  standard: BODY_STANDARD,
  batman: BODY_BATMAN,
  caped: BODY_CAPED,
  robed: BODY_ROBED,
  armored: BODY_ARMORED,
  coated: BODY_COATED,
  hooded: BODY_HOODED,
  heavy: BODY_HEAVY,
  glitch: BODY_GLITCH,
  labcoat: BODY_LABCOAT,
  geared: BODY_GEARED,
  compact: BODY_COMPACT,
  naval: BODY_NAVAL,
};

// Back-facing variants with interior shading.
const BACK_STANDARD = [
  "......HHHH......",
  ".....HhHHHH.....",
  "....HhHHHHHH....",
  "....HhHHH1HH....",
  "....HhHHHHHH....",
  "....HHHHHHHH....",
  ".....HHHHHH.....",
  "......SSSS......",
  ".....AATTAA.....",
  "....3TTtTTTT....",
  "...STTTtTTTTS...",
  "...sTTTTTTTTs...",
  "...sTTTTTTTTs...",
  "....TTtTTTTT....",
  ".....TTTTTT.....",
  ".....PPPPPP.....",
  ".....Pp..pP.....",
];

const BACK_BATMAN = [
  "....H......H....", // cowl ear tips (symmetric)
  "...HH......HH...", // ear shafts
  "...HHHHHHHHHH...", // ears merge into skull
  "..HHHHHHHHHHHH..", // full cowl
  "..HHHHHHHHHHHH..", // back of cowl
  "..HHHHHHHHHHHH..", // back of cowl
  "....HHHHHHHH....", // cowl narrows
  ".....HHHHHH.....", // lower cowl
  "......SSSS......", // neck
  "..tTTTTTTTTTTt..", // shoulders
  "..TTTTTTTTTTTT..", // upper back — cape
  "..tTTTTtTTTTTt..", // mid back
  "..TTTTTTTTTTTT..", // lower back
  "..tTTTTTTTTTTt..", // waist
  "...TAAAAAAT.....", // belt
  "...TTPPPPPPTT...", // upper legs
  "...TTPp..pPTT...", // lower legs
];

const BACK_CAPED = [
  "......HHHH......",
  ".....HhHHHH.....",
  "....HhHHH1HH....",
  "....HhHHHHHH....",
  "....HHHHHHHH....",
  "....HHHHHHHH....",
  ".....HHHHHH.....",
  "......SSSS......",
  "...5AATTTTAA5...",
  "..AATTTtTTTTAA..",
  "..aATTTTTTTTAa..",
  "..AATTTtTTTTAA..",
  "..aATTTTTTTTAa..",
  "...AATTtTTTAA...",
  "...AATTTTTTAA...",
  "...AAPPPPPPaA...",
  "...AAPp..pPAA...",
];

const BACK_ROBED = [
  "......HHHH......",
  ".....HhHHHH.....",
  "....HhHHH1HH....",
  "....HhHHHHHH....",
  "....HHHHHHHH....",
  "....HHHHHHHH....",
  ".....HHHHHH.....",
  "......SSSS......",
  ".....AATTAA.....",
  "....3TTtTTTT....",
  "...STTTtTTTTS...",
  "...sTTTTTTTTs...",
  "....TTtTTTTT....",
  "....TTTtTTTT....",
  "...TTTTTTTTTT...",
  "..3TTTTtTTTTT...",
  "..tTTTTtTTTTt...",
];

const BACK_HOODED = [
  ".....HHHHHH.....",
  "....hHHHH1HH....",
  "...hHHHHHHHHH...",
  "...hHHHHHHHHH...",
  "...HHHHHHHHHH...",
  "...HHHHHHHHHH...",
  "....HHHHHHHH....",
  "......SSSS......",
  ".....TTTTTT.....",
  "....TTTtTTTT....",
  "...hTTTtTTTTh...",
  "...hTTTTTTTTh...",
  "...hTTTTTTTTh...",
  "....hHhHhHhH....",
  "....HHTTTTHH....",
  ".....PPPPPP.....",
  ".....Pp..pP.....",
];

function getBackTemplate(bodyType: BodyType): string[] {
  switch (bodyType) {
    case "batman":
      return BACK_BATMAN;
    case "caped":
      return BACK_CAPED;
    case "robed":
      return BACK_ROBED;
    case "hooded":
      return BACK_HOODED;
    default:
      return BACK_STANDARD;
  }
}

// ── Leg variants ─────────────────────────────────────────

// Standard legs with shoe detail (H=shoe color via hair palette).
const LEGS_FRONT: string[][] = [
  [".....PP..PP.....", ".....Pp..pP.....", ".....HH..HH....."],
  [".....PP..PP.....", "....Pp....pP....", "....HH....HH...."],
  [".....PPPPPP.....", ".....Pp..pP.....", ".....HH..HH....."],
  [".....PP..PP.....", "....Pp....pP....", "....HH....HH...."],
];

const LEGS_BACK: string[][] = [
  [".....PP..PP.....", ".....Pp..pP.....", ".....HH..HH....."],
  [".....PP..PP.....", "....Pp....pP....", "....HH....HH...."],
  [".....PPPPPP.....", ".....Pp..pP.....", ".....HH..HH....."],
  [".....PP..PP.....", "....Pp....pP....", "....HH....HH...."],
];

const LEGS_SIDE: string[][] = [
  [".....PP..PP.....", ".....Pp..pP.....", ".....HH..HH....."],
  ["....PPP.PP......", "....Pp..pP......", "....HH...HH....."],
  [".....PP..PP.....", ".....Pp..pP.....", ".....HH..HH....."],
  ["......PP.PPP....", "......Pp..pP....", ".....HH...HH...."],
];

// Batman legs — dark cape (T-colored) drapes over legs.
const LEGS_BATMAN: string[][] = [
  ["..tTTPP..PPTt...", "..tTTPp..pPTT...", "....HH....HH...."],
  ["..tTTPP..PPTt...", "..tTPp....pPT...", "....HH....HH...."],
  ["..tTTPPPPPPTt...", "..tTTPp..pPTT...", "....HH....HH...."],
  ["..tTTPP..PPTt...", "..tTPp....pPT...", "....HH....HH...."],
];

// Caped legs — cape drapes over legs with shoe detail.
const LEGS_CAPED: string[][] = [
  ["...AAPP..PPaA...", "...AAPp..pPAA...", "....HH....HH...."],
  ["...AAPP..PPaA...", "...APp....pPA...", "....HH....HH...."],
  ["...AAPPPPPPaA...", "...AAPp..pPAA...", "....HH....HH...."],
  ["...AAPP..PPaA...", "...APp....pPA...", "....HH....HH...."],
];

// Robed legs — dress/robe bottom, no visible legs.
const LEGS_ROBED: string[][] = [
  [".3TTTTTTTTTTT3..", ".tTTTTTTTTTTTt..", "..tTTTTTTTTTt..."],
  [".3TTTTTTTTTTT3..", "..tTTTTTTTTTt...", "..tTTTTTTTTTt..."],
  ["..3TTTTTTTTTT3..", ".tTTTTTTTTTTTt..", "..tTTTTTTTTTt..."],
  ["..3TTTTTTTTTT3..", ".tTTTTTTTTTTTt..", "..tTTTTTTTTTt..."],
];

// Armored legs — wider stance with shoe detail.
const LEGS_ARMORED: string[][] = [
  ["....PP....PP....", "....Pp....pP....", "...HHH....HHH..."],
  ["....PP....PP....", "...Pp......pP...", "...HH......HH..."],
  ["....PPPPPPPP....", "....Pp....pP....", "....HH....HH...."],
  ["....PP....PP....", "...Pp......pP...", "...HH......HH..."],
];

// Hooded legs — cloak over standard legs with shoe detail.
const LEGS_HOODED: string[][] = [
  ["....hHPPPPPH....", ".....Pp..pP.....", ".....HH..HH....."],
  ["....hHPP.PPH....", "....Pp....pP....", "....HH....HH...."],
  ["....hHPPPPPH....", ".....Pp..pP.....", ".....HH..HH....."],
  ["....hHPP.PPH....", "....Pp....pP....", "....HH....HH...."],
];

function getFrontLegs(bodyType: BodyType): string[][] {
  switch (bodyType) {
    case "batman":
      return LEGS_BATMAN;
    case "caped":
      return LEGS_CAPED;
    case "robed":
      return LEGS_ROBED;
    case "armored":
      return LEGS_ARMORED;
    case "hooded":
      return LEGS_HOODED;
    default:
      return LEGS_FRONT;
  }
}

function getBackLegs(bodyType: BodyType): string[][] {
  switch (bodyType) {
    case "batman":
      return LEGS_BATMAN;
    case "caped":
      return LEGS_CAPED;
    case "robed":
      return LEGS_ROBED;
    default:
      return LEGS_BACK;
  }
}

// ── Accessories (head/hat overlays) ─────────────────────

const ACCESSORY_TEMPLATES: Record<string, string[]> = {
  giovanni: [],
  king: ["......A.AA......", ".....AAAAAA.....", "....A.AAAA.A...."],
  queen: ["......A..A......", ".....AAAAAA....."],
  rook: ["....AAA..AAA....", "....AAAAAAAA...."],
  knight: ["................", "....A..........."],
  marauder: ["....A......A....", "................"],
  specter: ["....AAAAAAAA....", "....AAAAAAAA...."],
  chancellor: ["................", ".....A....A....."],
  cardinal: ["................", "......AAAA......"],
  scout: ["..AAAAAAAAAAAA..", "...AAAAAAAAAA..."],
  ship: ["....AAAAAAAA....", ".....AAAAAA....."],
};

// ── Resolve body type for a character ───────────────────

function getBodyType(characterId: string): BodyType {
  if (characterId === "giovanni") return "batman";
  return AGENT_PERSONALITIES[characterId]?.bodyType ?? "standard";
}

// ── Pixel map building ───────────────────────────────────

type PixelMap = (string | null)[][];

const FW = 16;
const FH = 32;

function buildPixelMap(
  characterId: string,
  bodyTemplate: string[],
  legVariant?: string[],
): PixelMap {
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
  // Any non-null pixel (uppercase, lowercase, digit) counts as filled.
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
  // Lowercase letters = forced shadow (h→H shadow, t→T shadow, etc.)
  // Digit 1-6 = forced highlight (1→H, 2→S, 3→T, 4→P, 5→A, 6→E)
  const FORCED_HIGHLIGHT: Record<string, string> = {
    "1": "H",
    "2": "S",
    "3": "T",
    "4": "P",
    "5": "A",
    "6": "E",
  };

  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      const raw = map[y][x];
      if (raw === null) continue;

      const px = flipped ? fx + FW - 1 - x : fx + x;

      // Check forced shading.
      const isLower = raw >= "a" && raw <= "z";
      const isDigit = FORCED_HIGHLIGHT[raw] !== undefined;
      const key = isLower
        ? raw.toUpperCase()
        : isDigit
          ? FORCED_HIGHLIGHT[raw]
          : raw;

      let color: string;
      if (isLower) {
        color = shades.shadow[key] || shades.base[key] || OUTLINE;
      } else if (isDigit) {
        color = shades.highlight[key] || shades.base[key] || OUTLINE;
      } else {
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

        if (shadow && !highlight) {
          color = shades.shadow[key];
        } else if (highlight && !shadow) {
          color = shades.highlight[key];
        } else {
          color = shades.base[key];
        }
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
  const bodyType = getBodyType(characterId);
  const bodyFront = BODY_TEMPLATES[bodyType] || BODY_STANDARD;
  const bodyBack = getBackTemplate(bodyType);
  const legsFront = getFrontLegs(bodyType);
  const legsBack = getBackLegs(bodyType);
  const cols = 3;
  const rows = 5; // idle, walk-down, walk-up, walk-side, action

  const canvas = new OffscreenCanvas(FW * cols, FH * rows);
  const ctx = canvas.getContext("2d")!;

  const bobs = [0, -1, 0];
  // Leg pose indices: stand (0), step-left (1), step-right (3) — skip merged pose (2).
  const legFrames = [0, 1, 3];

  // Row 0 — Idle (subtle bob, front-facing).
  for (let f = 0; f < 3; f++) {
    const map = buildPixelMap(characterId, bodyFront);
    renderFrame(ctx, f * FW, 0, offsetMap(map, bobs[f]), shades, false, true);
  }

  // Row 1 — Walk down (3 distinct leg poses).
  const walkBobs = [0, -1, 0];
  for (let f = 0; f < 3; f++) {
    const map = buildPixelMap(characterId, bodyFront, legsFront[legFrames[f]]);
    renderFrame(
      ctx,
      f * FW,
      FH,
      offsetMap(map, walkBobs[f]),
      shades,
      false,
      true,
    );
  }

  // Row 2 — Walk up (3 distinct leg poses, back-facing).
  for (let f = 0; f < 3; f++) {
    const map = buildPixelMap(characterId, bodyBack, legsBack[legFrames[f]]);
    renderFrame(
      ctx,
      f * FW,
      FH * 2,
      offsetMap(map, walkBobs[f]),
      shades,
      false,
      true,
    );
  }

  // Row 3 — Walk side (flipped, with corrected shading direction).
  for (let f = 0; f < 3; f++) {
    const map = buildPixelMap(characterId, bodyFront, LEGS_SIDE[legFrames[f]]);
    renderFrame(
      ctx,
      f * FW,
      FH * 3,
      offsetMap(map, walkBobs[f]),
      shades,
      true,
      false,
    );
  }

  // Row 4 — Action (bob + sparkle overlay at arms).
  for (let f = 0; f < 3; f++) {
    const map = buildPixelMap(characterId, bodyFront);
    renderFrame(
      ctx,
      f * FW,
      FH * 4,
      offsetMap(map, bobs[f]),
      shades,
      false,
      true,
    );
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

  // P1: Agent accent stripe — 2px horizontal bar at shoulder row (~row 6 in body).
  // Applied to all rows/frames so the stripe is visible in every animation state.
  if (characterId !== "giovanni" && characterId !== "alfred") {
    const stripeY = 4 + (ACCESSORY_TEMPLATES[characterId]?.length ?? 0) + 6; // acc offset + body row 6
    ctx.fillStyle = palette.accent;
    for (let row = 0; row < 5; row++) {
      for (let f = 0; f < 3; f++) {
        // 2px stripe across the shoulder width (cols 4-11, centered in 16px).
        ctx.fillRect(f * FW + 4, row * FH + stripeY, 8, 1);
        ctx.fillRect(f * FW + 4, row * FH + stripeY + 1, 8, 1);
      }
    }
  }

  // P2: Giovanni ear tip — 1-2px #FFD700 at the cowl ear tips (row 4 offset 0,
  // Batman body rows 0-1: ear tip positions col 4 and col 11).
  if (characterId === "giovanni") {
    const accH = ACCESSORY_TEMPLATES["giovanni"]?.length ?? 0;
    ctx.fillStyle = "#FFD700";
    for (let row = 0; row < 5; row++) {
      for (let f = 0; f < 3; f++) {
        const baseX = f * FW;
        const baseY = row * FH + 4 + accH; // sprite start Y within frame
        // Row 0 ear tips: col 4, col 11.
        ctx.fillRect(baseX + 4, baseY + 0, 1, 1);
        ctx.fillRect(baseX + 11, baseY + 0, 1, 1);
      }
    }
  }

  return {
    canvas,
    frameWidth: FW,
    frameHeight: FH,
    animations: {
      idle: { row: 0, frames: 3, speed: 400 },
      "walk-down": { row: 1, frames: 3, speed: 180 },
      "walk-up": { row: 2, frames: 3, speed: 180 },
      "walk-side": { row: 3, frames: 3, speed: 180 },
      action: { row: 4, frames: 3, speed: 300 },
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
