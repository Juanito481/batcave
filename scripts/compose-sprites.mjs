#!/usr/bin/env node
/**
 * Build-time sprite composer.
 *
 * Reads raw frames from `assets-raw/` (Superdark NPC pack + 0x72 DungeonTileset)
 * and produces one composed PNG per agent in `webview/assets/sprites/`.
 *
 * Output format per agent: a single row-based sprite sheet.
 *   Row 0: idle (4 frames)
 *   Row 1: walk (4 frames)
 *
 * Frame size: 32x32 (Superdark native). 0x72 creatures (16x16 or similar)
 * are upscaled with nearest-neighbor to 32x32 for visual consistency.
 */
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SUPERDARK = path.join(ROOT, "assets-raw/superdark");
const O72 = path.join(ROOT, "assets-raw/0x72/frames");
const OUT = path.join(ROOT, "webview/assets/sprites");
const FRAME_SIZE = 32;
const COLS = 4; // 4 frames per animation

/**
 * Mapping from Batcave agent id to Superdark source folder + optional recolor.
 * Special sources:
 *   - starts with "0x72:": use 0x72 creature (upscaled 2x)
 *   - recolor: run palette transform after load
 */
const AGENT_MAP = {
  alfred: { src: "Magic Shopkeeper", prefix: "MagicShopkeeper" },
  giovanni: { src: "Large Knight - Elite", prefix: "LargeKnight_Elite", recolor: "batman" },
  king: { src: "King", prefix: "King" },
  queen: { src: "Queen", prefix: "Queen" },
  heretic: { src: "Nun - Normal", prefix: "Nun_N" },
  knight: { src: "Knight - Standard", prefix: "Knight" },
  weaver: { src: "Alchemist", prefix: "Alchemist" },
  sculptor: { src: "Blacksmith", prefix: "Blacksmith" },
  herald: { src: "Herald", prefix: "Herald" },
  bishop: { src: "Bishop", prefix: "Bishop" },
  cardinal: { src: "Nun - Tall", prefix: "Nun_T" },
  scout: { src: "Archer", prefix: "Archer" },
  specter: { src: "Nun - Fat", prefix: "Nun_F", recolor: "ghost" },
  rook: { src: "Knight - Heavy", prefix: "Knight_H" },
  marauder: { src: "Butcher", prefix: "Butcher" },
  marshal: { src: "Mountain King", prefix: "MountainKing" },
  chancellor: { src: "Merchant", prefix: "Merchant" },
  ship: { src: "Large Knight - Standard", prefix: "LargeKnight_Standard" },
  pawn: { src: "Townsfolk - Male", prefix: "Townsfolk_M" },
  oracle: { src: "Mage", prefix: "Mage" },
  thief: { src: "Thief", prefix: "Thief" },
  loop: { src: "Townsfolk - Female", prefix: "Townsfolk_F" },
  princess: { src: "Princess", prefix: "Princess" }, // also used for polymorph base
};

/** 8 creatures that Polymorph cycles through (from 0x72 pack, 16x16 upscaled). */
const POLYMORPH_CREATURES = [
  "big_demon",
  "skelet",
  "big_zombie",
  "imp",
  "ogre",
  "masked_orc",
  "necromancer",
  "pumpkin_dude",
];

// ── Palette recolors ─────────────────────────────────────

/** Batman palette: cowl-black torso, grey cape, blue accent. */
function batmanRecolor(pixel) {
  const [r, g, b, a] = pixel;
  if (a === 0) return pixel;
  // Very loose mapping — dim warm tones into cool Batman palette.
  const luminance = (r + g + b) / 3;
  if (luminance < 60) return [10, 10, 20, a]; // outline / dark
  if (luminance < 120) return [30, 30, 50, a]; // cowl / cape dark
  if (luminance < 180) return [60, 60, 90, a]; // mid
  // Highlights: tint toward accent blue.
  return [30, 127, 216, a];
}

/** Ghost palette: pale blue-white with cold shadows, low saturation. */
function ghostRecolor(pixel) {
  const [r, g, b, a] = pixel;
  if (a === 0) return pixel;
  const luminance = (r + g + b) / 3;
  if (luminance < 50) return [40, 60, 90, a];
  if (luminance < 120) return [120, 160, 200, a];
  return [200, 220, 240, a];
}

const RECOLORS = { batman: batmanRecolor, ghost: ghostRecolor };

async function applyRecolor(buffer, recolorName) {
  if (!recolorName) return buffer;
  const fn = RECOLORS[recolorName];
  if (!fn) return buffer;
  const { data, info } = await sharp(buffer)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = fn([data[i], data[i + 1], data[i + 2], data[i + 3]]);
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 }}).png().toBuffer();
}

// ── Frame discovery ─────────────────────────────────────

/** Find the 4 idle frames for a Superdark character. Returns absolute paths. */
async function findSuperdarkFrames(folderName, prefix, type) {
  const dir = path.join(SUPERDARK, folderName);
  const files = await fs.readdir(dir);
  // Multiple naming conventions exist in the pack.
  const candidates = [
    (i) => `${prefix}_${type}_${i}.png`,
    (i) => `${prefix}_${type} + Walk_${i}.png`, // e.g. "Bishop_Idle + Walk_1.png"
    (i) => `${prefix}_Idle + Walk_${i}.png`,
  ];
  const frames = [];
  for (let i = 1; i <= 4; i++) {
    let found = null;
    for (const gen of candidates) {
      const name = gen(i);
      if (files.includes(name)) { found = path.join(dir, name); break; }
    }
    if (!found) {
      // Last resort: walk all files with matching index number
      const guess = files.find((f) => f.includes(`_${i}.png`) && f.toLowerCase().includes(type.toLowerCase()));
      if (guess) found = path.join(dir, guess);
      else {
        // For characters with combined "Idle + Walk" in a single 4-frame sequence,
        // reuse idle frames for walk.
        const fallback = files.find((f) => f.includes(`_${i}.png`));
        if (fallback) found = path.join(dir, fallback);
      }
    }
    if (!found) throw new Error(`no frame ${i} for ${folderName}/${prefix}/${type}`);
    frames.push(found);
  }
  return frames;
}

/** Find 4 idle + 4 walk for 0x72 creature. */
async function find0x72Frames(name) {
  const idleBase = path.join(O72, `${name}_idle_anim_f`);
  const runBase = path.join(O72, `${name}_run_anim_f`);
  const altBase = path.join(O72, `${name}_anim_f`); // some use just _anim_
  const idle = [];
  const walk = [];
  for (let i = 0; i < 4; i++) {
    const tryPaths = [idleBase + i + ".png", altBase + i + ".png"];
    let p = null;
    for (const tp of tryPaths) {
      try { await fs.access(tp); p = tp; break; } catch {}
    }
    if (!p) throw new Error(`0x72 missing idle ${i} for ${name}`);
    idle.push(p);
  }
  for (let i = 0; i < 4; i++) {
    const tryPaths = [runBase + i + ".png", altBase + i + ".png"];
    let p = null;
    for (const tp of tryPaths) {
      try { await fs.access(tp); p = tp; break; } catch {}
    }
    if (!p) p = idle[i]; // fall back to idle frame
    walk.push(p);
  }
  return { idle, walk };
}

// ── Composing ───────────────────────────────────────────

/** Pad/center a buffer onto a FRAME_SIZE canvas. Source can be any size. */
async function normalizeFrame(input, upscale = false) {
  let img = sharp(input).ensureAlpha();
  const meta = await sharp(input).metadata();
  const w = meta.width, h = meta.height;
  // If source is smaller than FRAME_SIZE, either upscale (for 0x72 16x16) or center.
  if (w <= FRAME_SIZE / 2 && upscale) {
    img = img.resize(FRAME_SIZE, FRAME_SIZE, { kernel: "nearest" });
  } else if (w !== FRAME_SIZE || h !== FRAME_SIZE) {
    img = img.resize(FRAME_SIZE, FRAME_SIZE, { kernel: "nearest", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }});
  }
  return img.png().toBuffer();
}

async function composeAgent(agentId, config) {
  const { src, prefix, recolor } = config;
  const idle = await findSuperdarkFrames(src, prefix, "Idle");
  let walk;
  try {
    walk = await findSuperdarkFrames(src, prefix, "Walk");
  } catch {
    walk = idle; // packs with combined Idle+Walk reuse frames
  }
  const sheetW = FRAME_SIZE * COLS;
  const sheetH = FRAME_SIZE * 2;
  const composites = [];
  for (let i = 0; i < COLS; i++) {
    composites.push({ input: await normalizeFrame(idle[i]), top: 0, left: i * FRAME_SIZE });
    composites.push({ input: await normalizeFrame(walk[i]), top: FRAME_SIZE, left: i * FRAME_SIZE });
  }
  let buffer = await sharp({
    create: { width: sheetW, height: sheetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 }},
  }).composite(composites).png().toBuffer();
  buffer = await applyRecolor(buffer, recolor);
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, `${agentId}.png`), buffer);
}

async function composePolymorph() {
  const sheetW = FRAME_SIZE * COLS;
  const sheetH = FRAME_SIZE * 2;
  await fs.mkdir(path.join(OUT, "polymorph"), { recursive: true });
  for (let i = 0; i < POLYMORPH_CREATURES.length; i++) {
    const name = POLYMORPH_CREATURES[i];
    const { idle, walk } = await find0x72Frames(name);
    const composites = [];
    for (let j = 0; j < COLS; j++) {
      composites.push({ input: await normalizeFrame(idle[j], true), top: 0, left: j * FRAME_SIZE });
      composites.push({ input: await normalizeFrame(walk[j], true), top: FRAME_SIZE, left: j * FRAME_SIZE });
    }
    const buffer = await sharp({
      create: { width: sheetW, height: sheetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 }},
    }).composite(composites).png().toBuffer();
    await fs.writeFile(path.join(OUT, "polymorph", `${i}_${name}.png`), buffer);
  }
}

// ── Main ────────────────────────────────────────────────

async function main() {
  const agents = Object.entries(AGENT_MAP);
  console.log(`Composing ${agents.length} agents + ${POLYMORPH_CREATURES.length} polymorph creatures…`);
  for (const [id, cfg] of agents) {
    try {
      await composeAgent(id, cfg);
      console.log(`  ✓ ${id}`);
    } catch (e) {
      console.error(`  ✗ ${id}: ${e.message}`);
    }
  }
  try {
    await composePolymorph();
    console.log(`  ✓ polymorph (${POLYMORPH_CREATURES.length} creatures)`);
  } catch (e) {
    console.error(`  ✗ polymorph: ${e.message}`);
  }
  console.log("Done. Sheets in webview/assets/sprites/");
}

main().catch((e) => { console.error(e); process.exit(1); });
