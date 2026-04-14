/**
 * Loads composed PNG sprite sheets (produced by `scripts/compose-sprites.mjs`)
 * and wraps them in the same SpriteSheet shape the procedural generator returns.
 *
 * Format expected: one PNG per agent at `{baseUri}/{agentId}.png`, layout:
 *   Row 0: idle (4 frames of 32x32)
 *   Row 1: walk (4 frames of 32x32)
 *
 * Polymorph is special: cycles through 8 creature sprite sheets. Files live
 * under `{baseUri}/polymorph/{index}_{name}.png`.
 */

import { SpriteSheet } from "./SpriteGenerator";

const FRAME_WIDTH = 32;
const FRAME_HEIGHT = 32;

const ANIMATIONS: SpriteSheet["animations"] = {
  idle: { row: 0, frames: 4, speed: 260 },
  walk: { row: 1, frames: 4, speed: 140 },
  action: { row: 1, frames: 4, speed: 140 },
  entering: { row: 0, frames: 4, speed: 260 },
  exiting: { row: 0, frames: 4, speed: 260 },
};

export const POLYMORPH_CREATURES = [
  "big_demon",
  "skelet",
  "big_zombie",
  "imp",
  "ogre",
  "masked_orc",
  "necromancer",
  "pumpkin_dude",
];

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

function imgToSheet(img: HTMLImageElement): SpriteSheet {
  const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  return {
    canvas,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    animations: ANIMATIONS,
  };
}

/**
 * Load a single agent sprite sheet.
 * Returns null if asset missing (caller falls back to procedural).
 */
export async function loadAgentSheet(
  baseUri: string,
  agentId: string,
): Promise<SpriteSheet | null> {
  try {
    const img = await loadImage(`${baseUri}/${agentId}.png`);
    return imgToSheet(img);
  } catch {
    return null;
  }
}

/** Load the 8 polymorph creature sheets in parallel. */
export async function loadPolymorphCreatures(
  baseUri: string,
): Promise<SpriteSheet[]> {
  const promises = POLYMORPH_CREATURES.map(async (name, i) => {
    try {
      const img = await loadImage(`${baseUri}/polymorph/${i}_${name}.png`);
      return imgToSheet(img);
    } catch {
      return null;
    }
  });
  const results = await Promise.all(promises);
  return results.filter((s): s is SpriteSheet => s !== null);
}
