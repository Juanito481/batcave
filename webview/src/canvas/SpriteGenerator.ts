/**
 * Procedural pixel art sprite generator — Burrow style.
 *
 * Rendering technique (24×48px, zoom×2 = 48×96px on screen):
 * - 3-layer color: shadow (darken 25%), mid (base), highlight (lighten 18%)
 * - 2×2 dithering on body transition zones for organic texture
 * - Irregular outline: 1px standard, +1px on shoulders/torso/cape-lower-edge
 * - Signal Room palette for cave/CRT aesthetic
 *
 * No external PNG files — all art computed at init.
 */

import { darken, lighten } from "../helpers/color";
import { AGENT_PERSONALITIES, BodyType } from "../data/agent-personalities";

export interface SpriteSheet {
  canvas: OffscreenCanvas;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, { row: number; frames: number; speed: number }>;
}

// ── Dimensions ───────────────────────────────────────────
// Sprite canvas is 24×48px. Rendered on-screen at zoom×2 → 48×96px.
// Matches previous 16×32 × zoom×3 = same final footprint.

const FW = 24;
const FH = 48;

// ── Outline color (cool-cave near-black) ────────────────

const OUTLINE = "#0a0c14";

// ── Palette definition ───────────────────────────────────

interface CharacterPalette {
  skin: string;
  hair: string;
  shirt: string;  // body primary
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
    base: {
      H: p.hair,
      S: p.skin,
      T: p.shirt,
      P: p.pants,
      A: p.accent,
      E: p.eyes,
    },
    shadow: {
      H: darken(p.hair, 0.28),
      S: darken(p.skin, 0.22),
      T: darken(p.shirt, 0.25),
      P: darken(p.pants, 0.25),
      A: darken(p.accent, 0.15),
      E: p.eyes,
    },
    highlight: {
      H: lighten(p.hair, 0.18),
      S: lighten(p.skin, 0.15),
      T: lighten(p.shirt, 0.18),
      P: lighten(p.pants, 0.12),
      A: lighten(p.accent, 0.22),
      E: p.eyes,
    },
  };
}

// ── Agent palettes — Signal Room colors ─────────────────

const PALETTES: Record<string, CharacterPalette> = {
  alfred: {
    // Smoking scuro con colletto bianco: dark charcoal coat, CRT-white collar
    skin: "#d8b898",
    hair: "#2a2a3a",
    shirt: "#1a2028",   // near-black smoking
    pants: "#0a0e14",   // black trousers
    accent: "#c8ddef",  // Fox text — white collar/cuffs
    eyes: "#c8ddef",
  },
  giovanni: {
    // Cowl grigio con accent blu Fox sull'elmo
    skin: "#c8a880",
    hair: "#1a1a2a",
    shirt: "#2a3038",   // grey cowl mid
    pants: "#1a2028",   // dark grey suit
    accent: "#1E7FD8",  // Fox blue — helmet accent
    eyes: "#c8ddef",
  },
  king: {
    skin: "#e8c8a0",
    hair: "#c8a820",    // gold crown
    shirt: "#3a0860",   // deep purple robe
    pants: "#280650",
    accent: "#c8a820",  // gold
    eyes: "#c8ddef",
  },
  queen: {
    skin: "#e8c8a0",
    hair: "#8a1820",
    shirt: "#1E7FD8",   // Fox blue dress
    pants: "#0f4a80",
    accent: "#c8ddef",
    eyes: "#c8ddef",
  },
  rook: {
    skin: "#e0c8a0",
    hair: "#6a7080",
    shirt: "#b0b8c8",   // steel armour
    pants: "#8890a0",
    accent: "#1E7FD8",
    eyes: "#c8ddef",
  },
  bishop: {
    skin: "#e0c8a0",
    hair: "#282830",
    shirt: "#282838",   // dark detective coat
    pants: "#181828",
    accent: "#c0392b",  // danger red — bishop accent
    eyes: "#c0392b",
  },
  knight: {
    skin: "#e0c8a0",
    hair: "#3a2818",
    shirt: "#1e6040",   // Forest armour — distinct from rook
    pants: "#143828",
    accent: "#6aee90",
    eyes: "#c8ddef",
  },
  pawn: {
    skin: "#e0c8a0",
    hair: "#5a3818",
    shirt: "#7a6848",   // tan utility
    pants: "#5a4830",
    accent: "#b8a880",
    eyes: "#c8ddef",
  },
  marauder: {
    skin: "#c8a080",
    hair: "#181818",
    shirt: "#280808",   // deep crimson cloak
    pants: "#180404",
    accent: "#c0392b",
    eyes: "#c0392b",
  },
  specter: {
    skin: "#c8a888",
    hair: "#303040",
    shirt: "#383848",   // dark demolition gear
    pants: "#282838",
    accent: "#7a40b0",  // purple
    eyes: "#7a40b0",
  },
  heretic: {
    skin: "#c8a880",
    hair: "#181818",
    shirt: "#2a2a40",   // asymmetric dark
    pants: "#181828",
    accent: "#b07d20",  // warn amber — disruption
    eyes: "#b07d20",
  },
  chancellor: {
    skin: "#e0c8a0",
    hair: "#3a3848",
    shirt: "#2a3848",   // slate blue coat
    pants: "#1e2838",
    accent: "#1E7FD8",
    eyes: "#c8ddef",
  },
  cardinal: {
    skin: "#e0c8a0",
    hair: "#e8e8f0",
    shirt: "#e0e8f0",   // white lab coat
    pants: "#c8d0d8",
    accent: "#1fa35c",  // success green
    eyes: "#c8ddef",
  },
  scout: {
    skin: "#e0c8a0",
    hair: "#205028",
    shirt: "#1e3818",   // camo vest
    pants: "#162810",
    accent: "#60d820",
    eyes: "#c8ddef",
  },
  ship: {
    skin: "#b0b8c8",
    hair: "#606878",
    shirt: "#404858",   // naval coat
    pants: "#303848",
    accent: "#1E7FD8",
    eyes: "#1E7FD8",
  },
  herald: {
    skin: "#e0c8a0",
    hair: "#4a2e18",
    shirt: "#1E7FD8",   // Fox blue coat
    pants: "#0f4a80",
    accent: "#c8a820",
    eyes: "#c8ddef",
  },
  sculptor: {
    skin: "#e0c8a0",
    hair: "#7a4818",
    shirt: "#e8e8f0",   // white lab coat (same archetype as cardinal but different accent)
    pants: "#c0c8d0",
    accent: "#1E7FD8",
    eyes: "#c8ddef",
  },
  weaver: {
    skin: "#e0c8a0",
    hair: "#3a2818",
    shirt: "#283848",   // deep blue-grey
    pants: "#182838",
    accent: "#18a080",  // teal
    eyes: "#c8ddef",
  },
  marshal: {
    skin: "#e0c8a0",
    hair: "#202020",
    shirt: "#705020",   // bronze armour
    pants: "#503810",
    accent: "#b0b8c0",  // silver
    eyes: "#c8ddef",
  },
  polymorph: {
    skin: "#c8a080",
    hair: "#502870",
    shirt: "#381858",   // glitch purple
    pants: "#281048",
    accent: "#c0186a",  // hot pink
    eyes: "#c0186a",
  },
  thief: {
    skin: "#c8a080",
    hair: "#181818",
    shirt: "#202020",   // all-black
    pants: "#141414",
    accent: "#c8a820",  // gold glint
    eyes: "#c8a820",
  },
  oracle: {
    skin: "#e0c8a0",
    hair: "#5a1870",
    shirt: "#201048",   // deep violet robe
    pants: "#160a30",
    accent: "#7a40b0",
    eyes: "#7a40b0",
  },
  loop: {
    skin: "#e0c8a0",
    hair: "#5a4028",
    shirt: "#1e6858",   // teal-green
    pants: "#145048",
    accent: "#b07d20",  // amber cycle indicator
    eyes: "#c8ddef",
  },
  // Human companions
  ab: {
    skin: "#b89070",
    hair: "#2e1e10",
    shirt: "#181818",
    pants: "#1a3060",
    accent: "#283038",
    eyes: "#c8ddef",
  },
  andrea: {
    skin: "#e0c8a0",
    hair: "#8a5830",
    shirt: "#485830",
    pants: "#384828",
    accent: "#786848",
    eyes: "#c8ddef",
  },
  arturo: {
    skin: "#d8b888",
    hair: "#a02800",
    shirt: "#0e0e0e",
    pants: "#101010",
    accent: "#181818",
    eyes: "#c8ddef",
  },
  francesco: {
    skin: "#d8c090",
    hair: "#181828",
    shirt: "#202e40",
    pants: "#282828",
    accent: "#384858",
    eyes: "#c8ddef",
  },
};

// ── Body templates (24 wide, 26 body rows + 3 leg rows = 29 rows total) ─────
// Frame Y: oy=4 (accessory offset), then 26 body rows + legs.
// Legend: H=hair, S=skin, T=shirt, P=pants, A=accent, E=eyes, .=empty
// Lowercase = forced shadow, digits 1-6 = forced highlight.
// All rows MUST be exactly 24 characters.

// Standard humanoid — Knight, Weaver, Chancellor, NPCs.
const BODY_STANDARD = [
  "..........HHHH..........",
  ".........H1HhHH.........",
  "........HHhH1HHH........",
  "........HhSSSSHH........",
  "........HSSEESSH........",
  "........HSSsSSH.........",
  ".........SSSSSS.........",
  "..........SSSS..........",
  ".........AATTAA.........",
  "........3TTtTTTT........",
  ".......STTTaTTTTS.......",
  ".......STTTtTTTTS.......",
  ".......sTTTTTTTTs.......",
  "........TTtAATTT........",
  ".........TTTTTT.........",
  // Dithering zone on mid torso
  ".......TtTtTtTtT.......",
  ".......tTtTtTtTtT......",
  ".........PPPPPP.........",
  ".........Pp..pP.........",
];

// Batman — Giovanni's sprite: tall cowl, cape, utility belt.
const BODY_BATMAN = [
  "......H..........H......", // cowl ears
  ".....HH..........HH.....",
  ".....HHHHHHHHHHHHHH.....",
  "....HHHHHHHHHHHHHHHH....",
  "....HHhEEHHHHEEhHHH.....", // angular white eyes
  "....HHHHHHHHHHHHHHHH....",
  "......HHhSSShHHH........", // chin window
  ".......SSSSSSSS.........",
  "........SSSSSS..........",
  "...tTT3TT3TTT3TTTt......", // shoulders — cape
  "...TTTTTTTTTTTTTTTT.....",
  "...tTT3TT3TTT3TTTt......",
  "...TTTTtTtTTTTTTTT......",
  "...tTTTTTTTTTTTTTt......",
  "....TAAAAAAAAAAAAT......", // belt
  // Dithering on cape lower edge
  "...TtTtTtTtTtTtTtT.....",
  "...TTTTTTTTTTTTTTTT.....",
  "...TTPPPPPPPPPPPPTT.....",
  "...TTPp........pPTT.....",
];

// Caped — King: wide cape draping from shoulders, regal silhouette.
const BODY_CAPED = [
  "..........HHHH..........",
  ".........H1HhHH.........",
  "........HHhH1HHH........",
  "........HhSSSSHH........",
  "........HSSEESSH........",
  "........HSSsSSH.........",
  ".........SSSSSS.........",
  "..........SASS..........",
  ".......5AATTTTAA5.......",
  "......AATTT3TTTAA.......",
  "......AsTTTTTTTTsA......",
  "......ATTTtTtTTTA.......",
  "......aTTTTTTTTTa.......",
  ".......aTTAATTTa........",
  ".......AATTTTTAA........",
  // Dithering cape lower
  "......AtAtAtAtAtA.......",
  "......aAaAaAaAaAa.......",
  ".......AAPPPPPPaA.......",
  ".......AAPp..pPAA.......",
];

// Robed — Queen, Oracle: elegant dress that widens at the bottom.
const BODY_ROBED = [
  "..........HHHH..........",
  ".........1HhH1H.........",
  "........HHhHH1HH........",
  "........HhSSSSHH........",
  "........HSSEESSH........",
  "........HSSsSSH.........",
  ".........SSSSSS.........",
  "..........sASs..........",
  ".........AATTAA.........",
  "........3TTtTTTT........",
  ".......STTTaTTTTS.......",
  ".......sTTTTTTTTs.......",
  "........TTtATTTT........",
  "........TTTtTTTT........",
  ".......TTTTTTTTTT.......",
  // Dithering on robe hem
  "......TtTtTtTtTtTT......",
  "......3TTTTtTTTTTT......",
  "......tTTTTtTTTTTt......",
  "......tTTTTtTTTTTt......",
];

// Armored — Rook, Marshal: wide stocky boxy torso.
const BODY_ARMORED = [
  "..........HHHH..........",
  ".........HHHHHH.........",
  "........HHHHHHHH........",
  "........HhSSSSHH........",
  "........HSSEESSH........",
  "........HSSsSSH.........",
  ".........SSSSSS.........",
  "..........SSSS..........",
  "........AATTTTAA........",
  ".......3TTTTTTTT3.......",
  "......STTAAATTTTS.......",
  // Dithering on armour plating
  "......sAtTtTtATTs.......",
  "......sTtATtATtTs.......",
  ".......TTtAATAAT........",
  ".......TTTTTTTTTT.......",
  ".......TTTTTTTTT........",
  "........PPPPPPPP........",
  "........Pp....pP........",
  "........HH....HH........",
];

// Coated — Bishop, Herald: long detective coat.
const BODY_COATED = [
  "..........HHHH..........",
  ".........H1HhHH.........",
  "........HHhHHHHH........",
  "........HhSSSSHH........",
  "........HSSEESSH........",
  "........HSSsSSH.........",
  ".........SSSSSS.........",
  "..........SSSS..........",
  ".........AATTAA.........",
  "........3TTtTTTT........",
  ".......STTTaTTTTS.......",
  ".......sTTATTTATs.......",
  ".......sTTTtTTTTs.......",
  "........TTTtTTTT........",
  "........TaATTTTT........",
  // Dithering coat lower
  "......TtTtTtTtTt........",
  "........TTTtTTTT........",
  "........TT.Pp.TT........",
  "........TT.HH.TT........",
];

// Hooded — Marauder, Thief: narrow sinister cloak.
const BODY_HOODED = [
  ".........HHHHHH.........",
  "........HhHHH1HH........",
  ".......HhHHHHHHHH.......",
  ".......HHHhSShHHH.......",
  "........HSSEESSH........",
  "........HSSsSSH.........",
  ".........SSSSSS.........",
  "..........SSSS..........",
  ".........aTTTTa.........",
  "........TTTTTTTT........",
  ".......hTTTaTTTTh.......",
  ".......hTTTtTTTTh.......",
  ".......hTTTTTTTTh.......",
  // Dithering cloak body
  ".......HhHhHhHhHh.......",
  "........HhHhHhHh........",
  "........HHTTTTHH........",
  ".........PPPPPP.........",
  ".........Pp..pP.........",
  ".........HH..HH.........",
];

// Heavy — Specter: very wide shoulders, demolition build.
const BODY_HEAVY = [
  "..........HHHH..........",
  ".........HhHHHH.........",
  "........HHHHHHHH........",
  "........HhSSSSHH........",
  "........HSSEESSH........",
  "........HSSsSSH.........",
  ".........SSSSSS.........",
  "..........SSSS..........",
  ".......AAATTTTAAA.......",
  "......3TTTTtTTTTT3......",
  ".....SATTTTaTTTTAS......",
  // Dithering heavy armour
  ".....sTtATtTtATtTs......",
  ".....AtTtTtTtTtATs......",
  "......sTTTTTTTTTs.......",
  "......TTTTAATTtTT.......",
  ".......TTTTTTTTTT.......",
  ".......PPPPPPPP.........",
  ".......Pp....pP.........",
  ".......HH....HH.........",
];

// Glitch — Heretic, Polymorph: asymmetric irregular silhouette.
const BODY_GLITCH = [
  ".........HHHHH..........",
  "........HhHHHH.H........",
  "........HhHHH1HH........",
  "........HhSSSSHH........",
  ".......HSSEESSH.........",
  "........HSSsSSH.........",
  ".........SSSSSS.........",
  "..........SSSS..........",
  "........aTaTTAa.........",
  ".......TTTtTTTTT........",
  "......SATTaTTTTs........",
  ".......sTTTtTTTTs.......",
  // Dithering glitch body — intentionally misaligned
  "......sAaTtTtTaTa.......",
  ".......TTaTTTtTTT.......",
  "........TTTTTTT.........",
  "........pPPPPPP.........",
  ".........Pp.pP..........",
  ".........HH.HH..........",
];

// Lab coat — Cardinal, Sculptor: clean white coat.
const BODY_LABCOAT = [
  "..........HHHH..........",
  ".........HHHHHH.........",
  "........HHhHH1HH........",
  "........HhSSSSHH........",
  "........HSSEESSH........",
  "........HSSsSSH.........",
  ".........SSSSSS.........",
  "..........SSSS..........",
  ".........AATTAA.........",
  "........3TTtTTTT........",
  ".......STTTaTTTTS.......",
  ".......sTTATTTATs.......",
  ".......sTTTtTTTTs.......",
  "........TTTtTTTT........",
  "........TTaATTTT........",
  // Dithering coat pocket seam
  "......3TtTtTtTtTT.......",
  "........TTPPpPTT........",
  "........TT.Pp.TT........",
  "........TT.HH.TT........",
];

// Geared — Scout: vest with equipment bumps.
const BODY_GEARED = [
  "..........HHHH..........",
  ".........H1HhHH.........",
  "........HHhHHHHH........",
  "........HhSSSSHH........",
  "........HSSEESSH........",
  "........HSSsSSH.........",
  ".........SSSSSS.........",
  "..........SSSS..........",
  "........AAaTTAAA........",
  "........3TTtTTTT........",
  ".......SATTaTTTTS.......",
  // Dithering on vest
  ".......sTtTaTtATs.......",
  ".......sTTTtTtTTs.......",
  "........TaATAATT........",
  ".........TTTTTT.........",
  ".........TTTTTT.........",
  ".........PPPPPP.........",
  ".........Pp..pP.........",
  ".........HH..HH.........",
];

// Compact — Pawn, Loop: shorter body pushed down.
const BODY_COMPACT = [
  "..........HHHH..........",
  ".........H1HhHH.........",
  "........HHhHHHHH........",
  "........HhSSSSHH........",
  "........HSSEESSH........",
  "........HSSsSSH.........",
  ".........SSSSSS.........",
  "..........AaSs..........",
  ".........AATTAA.........",
  "........3TTtTTTT........",
  ".......STTTtTTTTS.......",
  ".......sTTTTTTTTs.......",
  "........TTtTTTTT........",
  // Dithering compact mid
  ".......TtTtTtTtT........",
  ".........TTTTTT.........",
  ".........PPPPPP.........",
  ".........PPppPP.........",
  ".........Pp..pP.........",
  ".........HH..HH.........",
];

// Naval — Ship: broad shoulders, captain's coat.
const BODY_NAVAL = [
  "..........HHHH..........",
  ".........HHHHHH.........",
  "........HHHHHHHH........",
  "........HhSSSSHH........",
  "........HSSEESSH........",
  "........HSSsSSH.........",
  ".........SSSSSS.........",
  "..........SSSS..........",
  "........AATTTTAA........",
  ".......3TTTtTTTT3.......",
  "......STTAATTTtTTS......",
  "......sTTTTaTTTTs.......",
  // Dithering naval coat
  "......sAtTtTtATTs.......",
  ".......TTTTtTTTTT.......",
  "........TTTtTTTT........",
  "........TTTTTTTT........",
  "........PPPPPPPP........",
  "........Pp....pP........",
  "........HH....HH........",
];

// Back variants (always use BACK_STANDARD unless archetype needs custom).
const BACK_STANDARD = [
  "..........HHHH..........",
  ".........HhHHHH.........",
  "........HhHHHHHH........",
  "........HhHHH1HH........",
  "........HhHHHHHH........",
  "........HHHHHHHH........",
  ".........HHHHHH.........",
  "..........SSSS..........",
  ".........AATTAA.........",
  "........3TTtTTTT........",
  ".......STTTtTTTTS.......",
  ".......sTTTTTTTTs.......",
  ".......sTTTTTTTTs.......",
  "........TTtTTTTT........",
  ".........TTTTTT.........",
  // Dithering back
  ".......TtTtTtTtT........",
  ".......tTtTtTtTtT.......",
  ".........PPPPPP.........",
  ".........Pp..pP.........",
];

const BACK_BATMAN = [
  "......H..........H......",
  ".....HH..........HH.....",
  ".....HHHHHHHHHHHHHH.....",
  "....HHHHHHHHHHHHHHHH....",
  "....HHHHHHHHHHHHHHHH....",
  "....HHHHHHHHHHHHHHHH....",
  "......HHHHHHHHHHHH......",
  ".......HHHHHHHHHH.......",
  "........SSSSSSSS........",
  "...tTTTTTTTTTTTTTTt.....",
  "...TTTTTTTTTTTTTTTT.....",
  "...tTTTTtTTTTTTTTTt.....",
  "...TTTTTTTTTTTTTTTT.....",
  "...tTTTTTTTTTTTTTTt.....",
  "....TAAAAAAAAAAAAT......",
  // Dithering cape back
  "...TtTtTtTtTtTtTtT.....",
  "...TTTTTTTTTTTTTTTT.....",
  "...TTPPPPPPPPPPPPTT.....",
  "...TTPp........pPTT.....",
];

const BACK_CAPED = [
  "..........HHHH..........",
  ".........HhHHHH.........",
  "........HhHHH1HH........",
  "........HhHHHHHH........",
  "........HHHHHHHH........",
  "........HHHHHHHH........",
  ".........HHHHHH.........",
  "..........SSSS..........",
  ".......5AATTTTAA5.......",
  "......AATTTtTTTTAA......",
  "......aATTTTTTTTAa......",
  "......AATTTtTTTTAA......",
  "......aATTTTTTTTAa......",
  ".......AATTtTTTAA.......",
  ".......AATTTTTAA........",
  "......AtAtAtAtAtA.......",
  "......aAaAaAaAaAa.......",
  ".......AAPPPPPPaA.......",
  ".......AAPp..pPAA.......",
];

const BACK_ROBED = [
  "..........HHHH..........",
  ".........HhHHHH.........",
  "........HhHHH1HH........",
  "........HhHHHHHH........",
  "........HHHHHHHH........",
  "........HHHHHHHH........",
  ".........HHHHHH.........",
  "..........SSSS..........",
  ".........AATTAA.........",
  "........3TTtTTTT........",
  ".......STTTtTTTTS.......",
  ".......sTTTTTTTTs.......",
  "........TTtTTTTT........",
  "........TTTtTTTT........",
  ".......TTTTTTTTTT.......",
  "......TtTtTtTtTtTT......",
  "......3TTTTtTTTTTT......",
  "......tTTTTtTTTTTt......",
  "......tTTTTtTTTTTt......",
];

const BACK_HOODED = [
  ".........HHHHHH.........",
  "........hHHHH1HH........",
  ".......hHHHHHHHHH.......",
  ".......hHHHHHHHHH.......",
  ".......HHHHHHHHHH.......",
  ".......HHHHHHHHHH.......",
  "........HHHHHHHH........",
  "..........SSSS..........",
  ".........TTTTTT.........",
  "........TTTtTTTT........",
  ".......hTTTtTTTTh.......",
  ".......hTTTTTTTTh.......",
  ".......hTTTTTTTTh.......",
  ".......HhHhHhHhHh.......",
  "........HhHhHhHh........",
  "........HHTTTTHH........",
  ".........PPPPPP.........",
  ".........Pp..pP.........",
  ".........HH..HH.........",
];

// Map body type to front/back templates.
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

function getBackTemplate(bodyType: BodyType): string[] {
  switch (bodyType) {
    case "batman": return BACK_BATMAN;
    case "caped":  return BACK_CAPED;
    case "robed":  return BACK_ROBED;
    case "hooded": return BACK_HOODED;
    default:       return BACK_STANDARD;
  }
}

// ── Leg variants (24px wide, 3 rows each) ────────────────

// Standard legs — 3 rows: upper, mid, shoe.
const LEGS_FRONT: string[][] = [
  ["..........PP..PP........", "..........Pp..pP........", "..........HH..HH........"],
  ["..........PP..PP........", ".........Pp....pP.......", ".........HH....HH......."],
  ["..........PPPPPP........", "..........Pp..pP........", "..........HH..HH........"],
  ["..........PP..PP........", ".........Pp....pP.......", ".........HH....HH......."],
];

const LEGS_BACK: string[][] = [
  ["..........PP..PP........", "..........Pp..pP........", "..........HH..HH........"],
  ["..........PP..PP........", ".........Pp....pP.......", ".........HH....HH......."],
  ["..........PPPPPP........", "..........Pp..pP........", "..........HH..HH........"],
  ["..........PP..PP........", ".........Pp....pP.......", ".........HH....HH......."],
];

const LEGS_SIDE: string[][] = [
  ["..........PP..PP........", "..........Pp..pP........", "..........HH..HH........"],
  [".........PPP.PP.........", ".........Pp..pP.........", ".........HH...HH........"],
  ["..........PP..PP........", "..........Pp..pP........", "..........HH..HH........"],
  ["..........PP.PPP........", "..........Pp..pP........", ".........HH...HH........"],
];

// Batman legs — cape-covered.
const LEGS_BATMAN: string[][] = [
  ["....tTTPP..PPTt........", "....tTTPp..pPTT........", ".......HH....HH........."],
  ["....tTTPP..PPTt........", "....tTPp....pPT........", ".......HH....HH........."],
  ["....tTTPPPPPPTt........", "....tTTPp..pPTT........", ".......HH....HH........."],
  ["....tTTPP..PPTt........", "....tTPp....pPT........", ".......HH....HH........."],
];

// Caped legs — cape over legs.
const LEGS_CAPED: string[][] = [
  [".......AAPP..PPaA.......", ".......AAPp..pPAA.......", "........HH....HH........"],
  [".......AAPP..PPaA.......", "......APp....pPA........", "........HH....HH........"],
  [".......AAPPPPPPaA.......", ".......AAPp..pPAA.......", "........HH....HH........"],
  [".......AAPP..PPaA.......", "......APp....pPA........", "........HH....HH........"],
];

// Robed legs — dress bottom, no visible legs.
const LEGS_ROBED: string[][] = [
  ["...3TTTTTTTTTTTTTTT3...", "...tTTTTTTTTTTTTTTTt...", "....tTTTTTTTTTTTTTt....."],
  ["...3TTTTTTTTTTTTTTT3...", "....tTTTTTTTTTTTTTt....", "....tTTTTTTTTTTTTTt....."],
  ["....3TTTTTTTTTTTTTT3...", "...tTTTTTTTTTTTTTTTt...", "....tTTTTTTTTTTTTTt....."],
  ["....3TTTTTTTTTTTTTT3...", "...tTTTTTTTTTTTTTTTt...", "....tTTTTTTTTTTTTTt....."],
];

// Armored legs — wide stance.
const LEGS_ARMORED: string[][] = [
  [".........PP....PP.......", ".........Pp....pP.......", "........HHH....HHH......"],
  [".........PP....PP.......", "........Pp......pP......", "........HH......HH......"],
  [".........PPPPPPPP.......", ".........Pp....pP.......", ".........HH....HH......."],
  [".........PP....PP.......", "........Pp......pP......", "........HH......HH......"],
];

// Hooded legs — cloak over standard.
const LEGS_HOODED: string[][] = [
  [".........hHPPPPPH.......", "..........Pp..pP........", "..........HH..HH........"],
  [".........hHPP.PPH.......", ".........Pp....pP.......", ".........HH....HH......."],
  [".........hHPPPPPH.......", "..........Pp..pP........", "..........HH..HH........"],
  [".........hHPP.PPH.......", ".........Pp....pP.......", ".........HH....HH......."],
];

function getFrontLegs(bodyType: BodyType): string[][] {
  switch (bodyType) {
    case "batman":  return LEGS_BATMAN;
    case "caped":   return LEGS_CAPED;
    case "robed":   return LEGS_ROBED;
    case "armored": return LEGS_ARMORED;
    case "hooded":  return LEGS_HOODED;
    default:        return LEGS_FRONT;
  }
}

function getBackLegs(bodyType: BodyType): string[][] {
  switch (bodyType) {
    case "batman":  return LEGS_BATMAN;
    case "caped":   return LEGS_CAPED;
    case "robed":   return LEGS_ROBED;
    default:        return LEGS_BACK;
  }
}

// ── Accessories ──────────────────────────────────────────

const ACCESSORY_TEMPLATES: Record<string, string[]> = {
  giovanni: [],
  king: ["...........A.AA.........", "..........AAAAAA........", ".........A.AAAA.A......."],
  queen: ["...........A..A.........", "..........AAAAAA........"],
  rook: [".........AAA..AAA.......", ".........AAAAAAAA......."],
  knight: ["........................", ".........A.............."],
  marauder: [".........A......A.......", "........................"],
  specter: [".........AAAAAAAA.......", ".........AAAAAAAA......."],
  chancellor: ["........................", "..........A....A........"],
  cardinal: ["........................", "...........AAAA........."],
  scout: ["...AAAAAAAAAAAAAAAAAA...", "....AAAAAAAAAAAAAAA....."],
  ship: [".........AAAAAAAA.......", "..........AAAAAA........"],
};

// ── Resolve body type ────────────────────────────────────

function getBodyType(characterId: string): BodyType {
  if (characterId === "giovanni") return "batman";
  return AGENT_PERSONALITIES[characterId]?.bodyType ?? "standard";
}

// ── Pixel map building ───────────────────────────────────

type PixelMap = (string | null)[][];

function buildPixelMap(
  characterId: string,
  bodyTemplate: string[],
  legVariant?: string[],
): PixelMap {
  const map: PixelMap = Array.from({ length: FH }, () => Array(FW).fill(null));
  const accessory = ACCESSORY_TEMPLATES[characterId];
  // Start body at row 4 to leave headroom and centering space.
  let oy = 4;

  if (accessory) {
    for (let r = 0; r < accessory.length; r++) {
      for (let c = 0; c < Math.min(accessory[r].length, FW); c++) {
        if (accessory[r][c] !== ".") map[oy + r][c] = accessory[r][c];
      }
    }
    oy += accessory.length;
  }

  // Body: replace last 3 rows with legVariant if provided.
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

// ── Dithering helpers ─────────────────────────────────────
// Returns true when pixel (x,y) should receive dithering treatment.
// 2x2 checkerboard — even sum coords get alternate shade.

function isDitherPixel(x: number, y: number): boolean {
  return (x + y) % 2 === 0;
}

// ── Frame rendering ───────────────────────────────────────
// Outline is irregularly 1–2px wide on shoulders/upper-torso/cape-lower-edge
// (rows that mark silhouette extremes). This is approximated by widening the
// outline pass on specific row bands rather than per-pixel checking.

function renderFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  fx: number,
  fy: number,
  map: PixelMap,
  shades: DerivedShades,
  flipped: boolean,
  lightFromLeft: boolean,
): void {
  // ── Pass 1: Outline ──────────────────────────────────────
  // Any adjacent empty pixel bordering a filled pixel gets the outline color.
  // Rows 6–10 (shoulders/upper torso) get extra outline width (+1px outward).
  ctx.fillStyle = OUTLINE;
  for (let y = 0; y < FH; y++) {
    const broadOutline = y >= 6 && y <= 12; // shoulder/torso region
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
        // Broader outline on silhouette extremes — mimics heavy fabric.
        if (broadOutline) {
          if (y > 0 && map[y - 1][x] === null) {
            ctx.fillRect(px, fy + y - 1, 1, 1);
          }
        }
      }
    }
  }

  // ── Pass 2: Fill with Burrow shading ─────────────────────
  // Lowercase = forced shadow, digits 1-6 = forced highlight.
  // On transition (border) pixels, apply 2x2 dither between shadow and mid.
  const FORCED_HIGHLIGHT: Record<string, string> = {
    "1": "H", "2": "S", "3": "T", "4": "P", "5": "A", "6": "E",
  };

  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      const raw = map[y][x];
      if (raw === null) continue;

      const px = flipped ? fx + FW - 1 - x : fx + x;

      const isLower = raw >= "a" && raw <= "z";
      const isDigit = FORCED_HIGHLIGHT[raw] !== undefined;
      const key = isLower
        ? raw.toUpperCase()
        : isDigit
          ? FORCED_HIGHLIGHT[raw]
          : raw;

      let color: string;

      if (isLower) {
        // Forced shadow — use dither between shadow and base for organic texture.
        color = isDitherPixel(x, y)
          ? shades.shadow[key] || shades.base[key] || OUTLINE
          : shades.base[key] || OUTLINE;
      } else if (isDigit) {
        color = shades.highlight[key] || shades.base[key] || OUTLINE;
      } else {
        // Standard: check neighbor context for edge shading.
        const rightNull = x >= FW - 1 || map[y][x + 1] === null;
        const belowNull = y >= FH - 1 || map[y + 1][x] === null;
        const leftNull  = x <= 0     || map[y][x - 1] === null;
        const aboveNull = y <= 0     || map[y - 1][x] === null;

        let isShadow: boolean;
        let isHighlight: boolean;

        if (lightFromLeft) {
          isShadow    = rightNull || belowNull;
          isHighlight = leftNull  || aboveNull;
        } else {
          isShadow    = leftNull  || belowNull;
          isHighlight = rightNull || aboveNull;
        }

        if (isShadow && !isHighlight) {
          // Dither shadow/mid on border pixels for the Burrow organic look.
          color = isDitherPixel(x, y)
            ? shades.shadow[key] || OUTLINE
            : shades.base[key]   || OUTLINE;
        } else if (isHighlight && !isShadow) {
          color = shades.highlight[key] || shades.base[key] || OUTLINE;
        } else {
          color = shades.base[key] || OUTLINE;
        }
      }

      ctx.fillStyle = color;
      ctx.fillRect(px, fy + y, 1, 1);
    }
  }
}

// ── Sprite sheet generation ──────────────────────────────

export function generateSpriteSheet(characterId: string): SpriteSheet {
  const palette  = PALETTES[characterId] || PALETTES.pawn;
  const shades   = deriveShades(palette);
  const bodyType = getBodyType(characterId);
  const bodyFront = BODY_TEMPLATES[bodyType] || BODY_STANDARD;
  const bodyBack  = getBackTemplate(bodyType);
  const legsFront = getFrontLegs(bodyType);
  const legsBack  = getBackLegs(bodyType);
  const cols = 3;
  const rows = 5; // idle, walk-down, walk-up, walk-side, action

  const canvas = new OffscreenCanvas(FW * cols, FH * rows);
  const ctx = canvas.getContext("2d")!;

  const bobs = [0, -1, 0];
  const legFrames = [0, 1, 3]; // stand, step-left, step-right

  // Row 0 — Idle (subtle bob, front-facing).
  for (let f = 0; f < 3; f++) {
    const map = buildPixelMap(characterId, bodyFront);
    renderFrame(ctx, f * FW, 0, offsetMap(map, bobs[f]), shades, false, true);
  }

  // Row 1 — Walk down.
  for (let f = 0; f < 3; f++) {
    const map = buildPixelMap(characterId, bodyFront, legsFront[legFrames[f]]);
    renderFrame(ctx, f * FW, FH, offsetMap(map, bobs[f]), shades, false, true);
  }

  // Row 2 — Walk up (back-facing).
  for (let f = 0; f < 3; f++) {
    const map = buildPixelMap(characterId, bodyBack, legsBack[legFrames[f]]);
    renderFrame(ctx, f * FW, FH * 2, offsetMap(map, bobs[f]), shades, false, true);
  }

  // Row 3 — Walk side (flipped, light from right).
  for (let f = 0; f < 3; f++) {
    const map = buildPixelMap(characterId, bodyFront, LEGS_SIDE[legFrames[f]]);
    renderFrame(ctx, f * FW, FH * 3, offsetMap(map, bobs[f]), shades, true, false);
  }

  // Row 4 — Action (bob + accent sparkle at arms).
  for (let f = 0; f < 3; f++) {
    const map = buildPixelMap(characterId, bodyFront);
    renderFrame(ctx, f * FW, FH * 4, offsetMap(map, bobs[f]), shades, false, true);
    // Accent sparkle at arm level.
    const accH = ACCESSORY_TEMPLATES[characterId]?.length ?? 0;
    const sy = FH * 4 + accH + 20 + bobs[f];
    ctx.fillStyle = palette.accent;
    if (f % 2 === 0) {
      ctx.fillRect(f * FW + 3 + f, sy, 1, 1);
      ctx.fillRect(f * FW + 19 - f, sy + 1, 1, 1);
    } else {
      ctx.fillRect(f * FW + 4, sy - 1, 1, 1);
      ctx.fillRect(f * FW + 18, sy, 1, 1);
    }
  }

  // P1: Accent stripe — 2px horizontal bar at shoulder row (body row 6 offset).
  // Excludes alfred and giovanni (they have distinct palette elements).
  if (characterId !== "giovanni" && characterId !== "alfred") {
    const stripeY = 4 + (ACCESSORY_TEMPLATES[characterId]?.length ?? 0) + 6;
    ctx.fillStyle = palette.accent;
    for (let row = 0; row < 5; row++) {
      for (let f = 0; f < 3; f++) {
        ctx.fillRect(f * FW + 6, row * FH + stripeY, 12, 1);
        ctx.fillRect(f * FW + 6, row * FH + stripeY + 1, 12, 1);
      }
    }
  }

  // P2: Alfred white collar highlight — 2px white at neck row.
  if (characterId === "alfred") {
    const accH = ACCESSORY_TEMPLATES["alfred"]?.length ?? 0;
    ctx.fillStyle = "#c8ddef"; // Fox text — CRT white collar
    for (let row = 0; row < 5; row++) {
      for (let f = 0; f < 3; f++) {
        const collarY = row * FH + 4 + accH + 8;
        ctx.fillRect(f * FW + 10, collarY, 4, 1);
        ctx.fillRect(f * FW + 10, collarY + 1, 4, 1);
      }
    }
  }

  // P3: Alfred smoking trama — dense 2x2 dither on coat body rows (rows 4+acc+12 to +20).
  if (characterId === "alfred") {
    const accH = ACCESSORY_TEMPLATES["alfred"]?.length ?? 0;
    for (let row = 0; row < 5; row++) {
      for (let f = 0; f < 3; f++) {
        for (let dy = 12; dy < 20; dy++) {
          const py = row * FH + 4 + accH + dy;
          for (let dx = 7; dx < 17; dx++) {
            if ((dx + dy) % 2 === 0) {
              ctx.fillStyle = "#2a3038"; // slightly lighter than shirt black
              ctx.fillRect(f * FW + dx, py, 1, 1);
            }
          }
        }
      }
    }
  }

  // P4: Giovanni blue helmet accent — 2px #1E7FD8 on cowl top.
  if (characterId === "giovanni") {
    const accH = ACCESSORY_TEMPLATES["giovanni"]?.length ?? 0;
    ctx.fillStyle = "#1E7FD8";
    for (let row = 0; row < 5; row++) {
      for (let f = 0; f < 3; f++) {
        const baseY = row * FH + 4 + accH;
        // Ear tip accent (rows 0-1, cols 5 and 18 in 24px frame).
        ctx.fillRect(f * FW + 5,  baseY,     1, 2);
        ctx.fillRect(f * FW + 18, baseY,     1, 2);
        // Forehead accent stripe.
        ctx.fillRect(f * FW + 7,  baseY + 4, 10, 1);
      }
    }
  }

  // P5: Giovanni rocky texture — irregular dither on suit body.
  if (characterId === "giovanni") {
    const accH = ACCESSORY_TEMPLATES["giovanni"]?.length ?? 0;
    for (let row = 0; row < 5; row++) {
      for (let f = 0; f < 3; f++) {
        for (let dy = 10; dy < 22; dy++) {
          const py = row * FH + 4 + accH + dy;
          for (let dx = 5; dx < 19; dx++) {
            // Rocky texture: irregular 3x2 blocks, not perfect checkerboard.
            if ((dx % 3 === 0) && (dy % 2 === 0)) {
              ctx.fillStyle = "#3a4048"; // lighter grey — rock highlight
              ctx.fillRect(f * FW + dx, py, 1, 1);
            } else if ((dx % 3 === 2) && (dy % 3 === 1)) {
              ctx.fillStyle = "#1a2028"; // darker — rock shadow
              ctx.fillRect(f * FW + dx, py, 1, 1);
            }
          }
        }
      }
    }
  }

  return {
    canvas,
    frameWidth: FW,
    frameHeight: FH,
    animations: {
      idle:        { row: 0, frames: 3, speed: 400 },
      "walk-down": { row: 1, frames: 3, speed: 180 },
      "walk-up":   { row: 2, frames: 3, speed: 180 },
      "walk-side": { row: 3, frames: 3, speed: 180 },
      action:      { row: 4, frames: 3, speed: 300 },
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
