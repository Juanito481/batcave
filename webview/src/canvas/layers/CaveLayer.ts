import { RenderContext, P, seed, outlineRect } from "./render-context";
import { lighten, darken } from "../../helpers/color";

// ── Floor tile with texture ────────────────────────────

function drawFloorTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zt: number,
  zoom: number,
  isLight: boolean,
  seedIdx: number,
): void {
  // Base fill.
  ctx.fillStyle = isLight ? P.FLOOR_B : P.FLOOR_A;
  ctx.fillRect(x, y, zt, zt);

  const s1 = seed(seedIdx);
  const s2 = seed(seedIdx + 37);
  const s3 = seed(seedIdx + 71);

  // Dark specks (dirt, cracks).
  ctx.fillStyle = P.FLOOR_DARK;
  if (s1 > 0.55) ctx.fillRect(x + zoom * 2, y + zoom * 3, zoom, zoom);
  if (s2 > 0.65) ctx.fillRect(x + zoom * 5, y + zoom * 1, zoom, zoom);
  if (s1 > 0.8 && s2 > 0.4) {
    // Small crack.
    ctx.fillRect(x + zoom * 3, y + zoom * 5, zoom * 2, zoom);
  }

  // Light mineral speck.
  ctx.fillStyle = P.FLOOR_SPECK;
  if (s3 > 0.82) ctx.fillRect(x + zoom * 4, y + zoom * 2, zoom, zoom);
  if (s1 > 0.9) ctx.fillRect(x + zoom * 1, y + zoom * 6, zoom, zoom);

  // Corner rivets (metallic grid joints).
  ctx.fillStyle = P.FLOOR_RIVET;
  if (s1 > 0.3) ctx.fillRect(x, y, zoom, zoom);
  if (s2 > 0.3) ctx.fillRect(x + zt - zoom, y, zoom, zoom);
  if (s3 > 0.3) ctx.fillRect(x, y + zt - zoom, zoom, zoom);
  if (s1 > 0.4 && s2 > 0.4)
    ctx.fillRect(x + zt - zoom, y + zt - zoom, zoom, zoom);
}

// ── Wall tile with rock texture ────────────────────────

function drawWallTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zt: number,
  zoom: number,
  row: number,
  totalRows: number,
  seedIdx: number,
): void {
  const colors =
    totalRows === 3
      ? [P.WALL_TOP, P.WALL_MID, P.WALL_BOT]
      : [P.WALL_TOP, P.WALL_MID];
  ctx.fillStyle = colors[row];
  ctx.fillRect(x, y, zt, zt);

  // Rock texture: scattered darker/lighter pixels.
  for (let p = 0; p < 4; p++) {
    const s = seed(seedIdx + p * 41);
    const s2 = seed(seedIdx + p * 53 + 17);
    const px = Math.floor(s * (zt - zoom));
    const py = Math.floor(s2 * (zt - zoom));

    if (s > 0.4) {
      ctx.fillStyle = P.WALL_DARK;
      ctx.fillRect(x + px, y + py, zoom, zoom);
    }
    if (s2 > 0.7) {
      ctx.fillStyle = P.WALL_LIGHT;
      ctx.fillRect(
        x + Math.floor(s2 * (zt - zoom * 2)),
        y + Math.floor(s * (zt - zoom * 2)),
        zoom,
        zoom,
      );
    }
  }

  // Horizontal seam at bottom of each row.
  if (row < totalRows - 1) {
    ctx.fillStyle = P.WALL_DARK;
    ctx.fillRect(x, y + zt - zoom, zt, zoom);
  }
}

// ── Stalactites ────────────────────────────────────────

/**
 * Draws one layer of stalactites with a horizontal parallax offset.
 * @param offsetX - Integer pixel shift applied to all stalactites in this layer.
 * @param seedBase - Seed offset so background/foreground layers use different shapes.
 * @param step - Column sampling step (background uses every 7th, foreground every 5th).
 * @param darken - Whether to tint the layer darker (background = less contrast).
 */
function drawStalactiteLayer(
  ctx: CanvasRenderingContext2D,
  cols: number,
  zt: number,
  zoom: number,
  wallH: number,
  offsetX: number,
  seedBase: number,
  step: number,
  darken: boolean,
): void {
  for (let x = 0; x < cols + 1; x++) {
    const s1 = seed(x + seedBase);
    const s2 = seed(x * 3 + 7 + seedBase);

    if (x % step === 0 && s1 > 0.2) {
      const h = Math.floor(zoom * (4 + s1 * 7));
      const w = zoom * (2 + Math.floor(s2 * 2));
      const sx = Math.floor(x * zt + zt / 2 - w / 2 + offsetX);

      // Body — slightly darker for background layer to sell the depth.
      ctx.fillStyle = darken ? P.WALL_DARK : P.WALL_EDGE;
      ctx.fillRect(sx, wallH, w, h);
      // Tip.
      ctx.fillStyle = darken ? "#060810" : P.WALL_MID;
      ctx.fillRect(sx + Math.floor(w / 4), wallH + h, Math.ceil(w / 2), zoom);
      // Highlight.
      ctx.fillStyle = darken ? P.WALL_EDGE : P.WALL_LIGHT;
      ctx.fillRect(sx, wallH, Math.max(1, Math.floor(zoom / 2)), h);
      // Shadow.
      ctx.fillStyle = darken ? "#040608" : P.WALL_DARK;
      ctx.fillRect(
        sx + w - Math.max(1, Math.floor(zoom / 2)),
        wallH,
        Math.max(1, Math.floor(zoom / 2)),
        h,
      );
    }
  }
}

/**
 * Draws bioluminescent glow dots at the tip of every 5th stalactite when the
 * "glow-stalactites" upgrade is active (Lv5). Pulses independently per column
 * so tips breathe at different rates, avoiding a uniform heartbeat effect.
 *
 * @param cols - Number of tile columns.
 * @param zt - Tile size in pixels.
 * @param zoom - Integer pixel scale factor.
 * @param wallH - Y coordinate where the ceiling ends and the cave floor begins.
 * @param now - Current timestamp (ms) from RenderContext.
 */
function drawStalactiteGlow(
  ctx: CanvasRenderingContext2D,
  cols: number,
  zt: number,
  zoom: number,
  wallH: number,
  now: number,
): void {
  const GLOW_COLORS = ["#1a5a5a", "#2a7a7a", "#1a6a6a"];
  for (let x = 0; x < cols + 1; x++) {
    const s1 = seed(x);
    if (x % 5 === 0 && s1 > 0.2) {
      const h = Math.floor(zoom * (4 + s1 * 7));
      const w = zoom * (2 + Math.floor(seed(x * 3 + 7) * 2));
      const sx = Math.floor(x * zt + zt / 2 - w / 2);
      const tipY = wallH + h;
      // Pulsing glow at the tip.
      const pulse = Math.sin(now / 1200 + x * 0.7) * 0.5 + 0.5;
      const glowSize = Math.max(1, Math.floor(zoom * (1 + pulse)));
      ctx.fillStyle = GLOW_COLORS[x % 3];
      ctx.fillRect(sx + Math.floor(w / 4), tipY, Math.ceil(w / 2), glowSize);
      // Core bright dot.
      if (pulse > 0.6) {
        ctx.fillStyle = "#3a9a9a";
        ctx.fillRect(sx + Math.floor(w / 2), tipY, zoom, zoom);
      }
    }
  }
}

/**
 * Draws two parallax stalactite layers — background moves slower than foreground,
 * giving a subtle sense of cave depth without any alpha transparency.
 * Motion uses Date.now() internally so no extra parameters are needed.
 */
function drawStalactites(
  ctx: CanvasRenderingContext2D,
  cols: number,
  zt: number,
  zoom: number,
  wallH: number,
): void {
  const now = Date.now();

  // Background layer — far wall, slow drift (seed offset 100 to vary shapes).
  const bgOffset = Math.floor(Math.sin(now / 80000) * 2 * zoom);
  drawStalactiteLayer(ctx, cols, zt, zoom, wallH, bgOffset, 100, 7, true);

  // Foreground layer — closer ceiling, faster drift.
  const fgOffset = Math.floor(Math.sin(now / 50000) * 1 * zoom);
  drawStalactiteLayer(ctx, cols, zt, zoom, wallH, fgOffset, 0, 5, false);
}

// ── Stalagmites (from floor) ──────────────────────────

function drawStalagmites(
  ctx: CanvasRenderingContext2D,
  cols: number,
  zt: number,
  zoom: number,
  height: number,
): void {
  for (let x = 0; x < cols; x++) {
    const s1 = seed(x * 5 + 43);
    const s2 = seed(x * 7 + 89);

    // Every 4-5 tiles, a stalagmite from the floor.
    if (x % 4 === 2 && s1 > 0.3) {
      const h = Math.floor(zoom * (3 + s1 * 6));
      const w = Math.floor(zoom * (1.5 + s2));
      const sx = x * zt + zt / 2 - Math.floor(w / 2);
      const baseY = height;

      // Body.
      ctx.fillStyle = P.WALL_EDGE;
      ctx.fillRect(sx, baseY - h, w, h);
      // Tip (narrower).
      ctx.fillStyle = P.WALL_MID;
      ctx.fillRect(
        sx + Math.floor(w / 4),
        baseY - h - zoom,
        Math.ceil(w / 2),
        zoom,
      );
      // Highlight on left.
      ctx.fillStyle = P.WALL_LIGHT;
      ctx.fillRect(sx, baseY - h, Math.max(1, Math.floor(zoom / 2)), h);
      // Shadow on right.
      ctx.fillStyle = P.WALL_DARK;
      ctx.fillRect(
        sx + w - Math.max(1, Math.floor(zoom / 2)),
        baseY - h,
        Math.max(1, Math.floor(zoom / 2)),
        h,
      );
    }

    // Smaller rubble between stalagmites.
    if (x % 4 !== 2 && s2 > 0.65) {
      const h = Math.floor(zoom * (1 + s1 * 2));
      ctx.fillStyle = P.WALL_EDGE;
      ctx.fillRect(x * zt + zt / 2, height - h, zoom, h);
    }
  }
}

// ── Wall details (pipes, LED strip, panels) ───────────

function drawWallDetails(
  ctx: CanvasRenderingContext2D,
  zt: number,
  zoom: number,
  wallH: number,
  width: number,
  height: number,
  now: number,
  world: RenderContext["world"],
): void {
  // Horizontal pipe running along the wall.
  const pipeY = wallH - Math.floor(zt * 0.3);
  ctx.fillStyle = "#141428";
  ctx.fillRect(0, pipeY, width, zoom * 2);
  // Pipe highlight (top edge).
  ctx.fillStyle = P.HIGHLIGHT;
  ctx.fillRect(0, pipeY, width, Math.max(1, Math.floor(zoom / 2)));
  // Pipe shadow (bottom edge).
  ctx.fillStyle = "#0a0a18";
  ctx.fillRect(0, pipeY + zoom * 2, width, Math.max(1, Math.floor(zoom / 2)));

  // Pipe brackets every few tiles.
  for (let x = zt * 2; x < width - zt; x += zt * 3) {
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(x, pipeY - zoom, zoom * 2, zoom * 4);
    ctx.fillStyle = P.OUTLINE;
    ctx.fillRect(x, pipeY - zoom, zoom * 2, Math.max(1, Math.floor(zoom / 2)));
  }

  // LED strip along wall bottom — state-reactive + repo-themed.
  const ledY = wallH - zoom;
  const state = world.getAlfredState();
  const stateColor =
    state === "thinking"
      ? "#1e4478"
      : state === "writing"
        ? "#1e5432"
        : "#1a3a5a";
  const stateDim =
    state === "thinking"
      ? "#0e2440"
      : state === "writing"
        ? "#0e2a16"
        : "#0e1e30";

  // Cave reaction: wall flash overrides LED strip color.
  const reactions = world.getCaveReactions();
  let ledColor = stateColor;
  let ledDim = stateDim;
  if (reactions.wallFlashColor) {
    ledColor = reactions.wallFlashColor;
    ledDim = darken(reactions.wallFlashColor, 0.5);
  }

  // Speed up pulse when active.
  const ledSpeed = state === "idle" ? 1200 : 600;

  // Agent enter pulse — bright wave traveling along the strip for 1.5s after agent_enter.
  const pulseStart = world.getAgentPulseStart();
  const pulseAge = now - pulseStart;
  const pulseActive = pulseStart > 0 && pulseAge < 1500;
  const pulsePos = pulseActive ? (pulseAge / 1500) * width : -1;

  for (let x = 0; x < width; x += zoom * 6) {
    const phase = Math.sin(now / ledSpeed + x * 0.01);
    let color = phase > 0.3 ? ledColor : ledDim;

    // Wave overlay — bright accent near the pulse wavefront.
    if (pulseActive) {
      const dist = Math.abs(x - pulsePos);
      if (dist < zoom * 12) {
        color = "#2ECC71"; // Green flash for agent arrival.
      }
    }

    ctx.fillStyle = color;
    ctx.fillRect(x, ledY, zoom * 4, zoom);
  }

  // Wall-mounted monitor (right side) — git log.
  const monX = width - zt * 4;
  const monY = Math.floor(wallH * 0.25);
  const monW = zt * 2;
  const monH = Math.floor(zt * 1.2);
  const font = `"DM Mono", monospace`;
  const smallFont = Math.max(8, zoom * 2.5);

  // Bezel.
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(monX - zoom, monY - zoom, monW + zoom * 2, monH + zoom * 2);
  // Screen.
  ctx.fillStyle = "#060610";
  ctx.fillRect(monX, monY, monW, monH);
  // Content background — dark green terminal.
  const monPulse = Math.sin(now / 1500 + 3);
  ctx.fillStyle = monPulse > 0 ? "#0a2a0a" : "#081e08";
  ctx.fillRect(monX + zoom, monY + zoom, monW - zoom * 2, monH - zoom * 2);
  // Scanlines — 1px pitch per zoom unit for crisp pixel-art density.
  ctx.fillStyle = "#040408";
  for (let sl = 0; sl < monH; sl += zoom) {
    ctx.fillRect(monX, monY + sl, monW, Math.max(1, Math.floor(zoom / 2)));
  }

  // Git log content.
  const gitLog = world.getGitLog();
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "#335533";
  ctx.fillText("GIT", monX + zoom * 2, monY + zoom * 3);

  if (gitLog.length > 0) {
    const lineH = Math.max(zoom * 3, smallFont + zoom);
    const maxLines = Math.min(
      gitLog.length,
      Math.floor((monH - zoom * 5) / lineH),
    );
    const visible = gitLog.slice(-maxLines);
    for (let g = 0; g < visible.length; g++) {
      const entry = visible[g];
      const gy = monY + zoom * 5 + g * lineH;
      ctx.fillStyle = entry.type === "commit" ? "#2ECC71" : "#F39C12";
      const prefix = entry.type === "commit" ? "\u25CF " : "\u25B2 ";
      const maxChars = Math.max(
        6,
        Math.floor((monW - zoom * 4) / (smallFont * 0.6)),
      );
      const msg =
        entry.message.length > maxChars
          ? entry.message.slice(0, maxChars - 1) + "\u2026"
          : entry.message;
      ctx.fillText(prefix + msg, monX + zoom * 2, gy);
    }
  } else {
    ctx.fillStyle = "#1a3a1a";
    ctx.fillText("no commits", monX + zoom * 2, monY + zoom * 7);
  }

  // Mount bracket.
  ctx.fillStyle = "#141428";
  ctx.fillRect(
    monX + Math.floor(monW / 2) - zoom,
    monY + monH,
    zoom * 2,
    zoom * 2,
  );
}

// ── Wall torches ───────────────────────────────────────

/**
 * Torch flame color palette — 3 discrete steps, GBA-style flicker (no interpolation).
 * Order: bright yellow → orange → dark red, cycled based on frame index.
 */
const TORCH_FLAMES = ["#FFD700", "#E67E22", "#C0392B"] as const;

/**
 * Draws a single wall-mounted torch sprite with flickering flame and a floor light pool.
 *
 * @param x - Pixel X of the torch bracket center.
 * @param wallY - Y coordinate of the wall/floor boundary (torch mounts here).
 * @param flameFrame - 0-2 discrete frame index, advanced by caller based on state speed.
 * @param floorY - Bottom of the canvas — where the light pool is drawn.
 * @param torchBoost - Intensity multiplier from CaveReactionSystem (1.0 = normal, up to 2.0).
 */
function drawTorch(
  ctx: CanvasRenderingContext2D,
  x: number,
  wallY: number,
  zoom: number,
  flameFrame: number,
  floorY: number,
  torchBoost: number = 1.0,
): void {
  const tx = Math.floor(x);
  const ty = Math.floor(wallY);

  // Floor light pool — scaled by torchBoost on agent arrivals.
  // Brighter pool color when heavily boosted (> 1.2) to sell the effect.
  const poolW = Math.floor(zoom * 8 * torchBoost);
  const poolH = Math.floor(zoom * 3 * torchBoost);
  const poolX = tx - Math.floor(poolW / 2);
  const poolY = floorY - poolH;
  ctx.fillStyle = torchBoost > 1.2 ? "#222230" : "#1a1a22";
  ctx.fillRect(poolX, poolY, poolW, poolH);

  // Bracket — 2px wide dark base (wall mount).
  ctx.fillStyle = "#5a3a1a";
  ctx.fillRect(tx - zoom, ty - zoom * 2, zoom * 2, zoom * 2);

  // Bowl — 3px wide holder.
  ctx.fillStyle = "#6b4520";
  ctx.fillRect(tx - zoom, ty - zoom * 3, zoom * 3, zoom);

  // Flame — 3 discrete frames, each a small pixel cluster.
  const flameColor = TORCH_FLAMES[flameFrame % 3];
  ctx.fillStyle = flameColor;
  if (flameFrame === 0) {
    // Tall, narrow flame.
    ctx.fillRect(tx, ty - zoom * 7, zoom, zoom * 4);
    ctx.fillRect(tx - zoom, ty - zoom * 5, zoom, zoom * 2);
    ctx.fillRect(tx + zoom, ty - zoom * 5, zoom, zoom);
  } else if (flameFrame === 1) {
    // Wide, mid flame.
    ctx.fillRect(tx - zoom, ty - zoom * 6, zoom * 3, zoom * 3);
    ctx.fillRect(tx, ty - zoom * 7, zoom, zoom);
  } else {
    // Low, flickering ember.
    ctx.fillRect(tx, ty - zoom * 5, zoom * 2, zoom * 2);
    ctx.fillRect(tx - zoom, ty - zoom * 4, zoom, zoom * 2);
    // Ember tip.
    ctx.fillStyle = "#FFD700";
    ctx.fillRect(tx, ty - zoom * 6, zoom, zoom);
  }
}

/**
 * Draws 3 wall torches at fixed positions along the cave wall.
 * Flicker speed scales with Alfred's state — faster when Claude is active.
 * Uses Date.now() for frame advancement so no extra state is needed.
 *
 * @param alfredState - Current Claude state, controls flicker interval.
 * @param floorY - Canvas bottom (used to position the light pool).
 * @param torchBoost - Intensity multiplier from CaveReactionSystem (1.0 = normal, up to 2.0).
 */
function drawTorches(
  ctx: CanvasRenderingContext2D,
  width: number,
  wallH: number,
  zoom: number,
  alfredState: "idle" | "thinking" | "writing",
  floorY: number,
  torchBoost: number = 1.0,
): void {
  // Flicker interval per state (ms per flame frame step).
  // Torch boost also speeds up flicker — agent arrivals animate faster.
  const flickerMs =
    alfredState === "writing" ? 150 : alfredState === "thinking" ? 250 : 400;

  const now = Date.now();
  // Discrete frame: integer division gives a step that advances every flickerMs.
  // Each torch gets a phase offset so they don't all flicker in sync.
  const baseFrame = Math.floor(now / flickerMs);

  // Three torches — left wall, center-left, right wall.
  const torchXPositions = [
    Math.floor(width * 0.12),
    Math.floor(width * 0.45),
    Math.floor(width * 0.82),
  ];

  for (let i = 0; i < torchXPositions.length; i++) {
    const frame = (baseFrame + i * 7) % 3; // offset each torch by 7 frames
    drawTorch(ctx, torchXPositions[i], wallH, zoom, frame, floorY, torchBoost);
  }
}

// ── Main orchestrator ──────────────────────────────────

export function drawCaveEnvironment(rc: RenderContext): void {
  const { ctx, zoom, zt, cols, rows, wallRows, wallH, width, height } = rc;

  // ── Floor tiles (textured) ──
  for (let y = wallRows; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      drawFloorTile(
        ctx,
        x * zt,
        y * zt,
        zt,
        zoom,
        (x + y) % 2 === 0,
        x * 17 + y * 31,
      );
    }
  }

  // Lv25 upgrade: lava cracks in floor tiles.
  if (rc.world.getProgression().hasUpgrade("lava-cracks")) {
    for (let y = wallRows; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const s = seed(x * 17 + y * 31 + 99);
        if (s > 0.88) {
          // ~12% of tiles
          const tx = x * zt;
          const ty = y * zt;
          const pulse = Math.sin(rc.now / 800 + s * 20) * 0.5 + 0.5;
          ctx.fillStyle = pulse > 0.5 ? "#6a3018" : "#4a2010";
          // Crack shape: diagonal line.
          ctx.fillRect(tx + zoom * 2, ty + zoom * 3, zoom * 3, zoom);
          ctx.fillRect(tx + zoom * 4, ty + zoom * 4, zoom * 2, zoom);
          // Glow beneath.
          if (pulse > 0.7) {
            ctx.fillStyle = "#8a4020";
            ctx.fillRect(tx + zoom * 3, ty + zoom * 3, zoom, zoom);
          }
        }
      }
    }
  }

  // ── Screen glow on floor (static lightened tiles near Batcomputer) ──
  const bcTilesW = Math.min(5, Math.ceil(width / zt) - 1);
  const bcCenterTile = Math.floor(width / zt / 2);
  const bcStartTile = bcCenterTile - Math.floor(bcTilesW / 2);
  const bcEndTile = bcStartTile + bcTilesW;
  const bcRowTile = wallRows; // row just below wall
  const glowColor = lighten(P.FLOOR_A, 0.08);
  for (let y = bcRowTile; y <= bcRowTile + 1 && y < rows; y++) {
    for (let x = bcStartTile - 1; x <= bcEndTile; x++) {
      if (x < 0 || x >= cols) continue;
      ctx.fillStyle = glowColor;
      ctx.fillRect(x * zt, y * zt, zt, zt);
    }
  }

  // ── Cave ceiling (textured wall rows) ──
  for (let x = 0; x < cols; x++) {
    for (let r = 0; r < wallRows; r++) {
      drawWallTile(ctx, x * zt, r * zt, zt, zoom, r, wallRows, x * 13 + r * 7);
    }
  }

  // ── Stalactites ──
  drawStalactites(ctx, cols, zt, zoom, wallH);

  // Lv5 upgrade: bioluminescent stalactite tips.
  if (rc.world.getProgression().hasUpgrade("glow-stalactites")) {
    drawStalactiteGlow(ctx, cols, zt, zoom, wallH, rc.now);
  }

  // Wall bottom edge (opaque, no rgba).
  ctx.fillStyle = P.OUTLINE;
  ctx.fillRect(0, wallH, width, zoom);

  // ── Stalagmites (from floor, before furniture) ──
  drawStalagmites(ctx, cols, zt, zoom, height);

  // ── Wall details (pipes, LED strip, panels) ──
  drawWallDetails(ctx, zt, zoom, wallH, width, height, rc.now, rc.world);

  // ── Wall torches (state-reactive flicker) ──
  const torchBoost = rc.world.getCaveReactions().torchBoost;
  drawTorches(ctx, width, wallH, zoom, rc.alfredState, height, torchBoost);

  // ── Time-of-day tint ──
  const hour = new Date().getHours();
  // Night (21-5): blue tint. Day (10-16): warm tint. Dawn/dusk: neutral.
  if (hour >= 21 || hour < 5) {
    ctx.save();
    ctx.fillStyle = "#060818";
    ctx.globalAlpha = 0.12;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else if (hour >= 10 && hour <= 16) {
    ctx.save();
    ctx.fillStyle = "#181008";
    ctx.globalAlpha = 0.08;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // ── Easter egg: floor eye crack ──
  const easterEggs = rc.world.getEasterEggs();
  if (easterEggs.floorEyeActive) {
    const eyeX = Math.floor(easterEggs.floorEyeX);
    const eyeY = Math.floor(easterEggs.floorEyeY);
    const ez = Math.max(1, zoom);
    const fadeRatio = easterEggs.floorEyeTimer / 2000;

    ctx.save();
    ctx.globalAlpha = fadeRatio;

    // Crack lines (3 diagonal dark lines radiating from center).
    ctx.fillStyle = "#040408";
    ctx.fillRect(eyeX - ez * 4, eyeY - ez, ez * 3, ez);
    ctx.fillRect(eyeX + ez * 2, eyeY, ez * 3, ez);
    ctx.fillRect(eyeX - ez, eyeY + ez * 2, ez, ez * 2);
    ctx.fillRect(eyeX, eyeY - ez * 3, ez, ez * 2);

    // Eye socket (dark oval).
    ctx.fillStyle = "#020204";
    ctx.fillRect(eyeX - ez * 2, eyeY - ez, ez * 4, ez * 3);

    // Eyeball (white).
    ctx.fillStyle = "#c0c0c0";
    ctx.fillRect(eyeX - ez, eyeY, ez * 3, ez);
    ctx.fillRect(eyeX - ez * 2, eyeY, ez, ez);
    ctx.fillRect(eyeX + ez * 2, eyeY, ez, ez);

    // Pupil (red, looking up).
    ctx.fillStyle = "#8a1a1a";
    ctx.fillRect(eyeX, eyeY, ez, ez);

    ctx.restore();
  }

  // ── Bat Signal (context 100%) ──
  if (rc.world.isBatSignalActive()) {
    drawBatSignal(ctx, width, wallH, zoom);
  }
}

function drawBatSignal(
  ctx: CanvasRenderingContext2D,
  width: number,
  wallH: number,
  zoom: number,
): void {
  const cx = Math.floor(width / 2);
  const cy = Math.floor(wallH * 0.4);
  const r = zoom * 12;

  // Brightness pulse — sin wave oscillates between 0.70 and 1.00.
  const pulse = Math.sin(Date.now() / 400) * 0.15 + 0.85;

  // Outer glow rect — slightly larger, dimmer, drawn first so the main
  // spotlight sits on top and reads as a brighter core.
  const glow = Math.floor(r * 1.18);
  // Dim the glow color proportional to pulse so it breathes with the core.
  const glowAlpha = pulse * 0.6; // 0.42–0.60 range, subtle halo
  ctx.save();
  ctx.globalAlpha = glowAlpha;
  ctx.fillStyle = "#252540";
  ctx.fillRect(cx - glow, cy - glow, glow * 2, glow * 2);
  ctx.restore();

  // Main spotlight — brighter base color, further modulated by pulse.
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = "#252540";
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  // Bat silhouette — darker fill for maximum contrast on brighter spotlight.
  const s = Math.max(1, zoom);
  ctx.fillStyle = "#060610";
  // Body (wider).
  ctx.fillRect(cx - s * 3, cy - s, s * 6, s * 3);
  // Head.
  ctx.fillRect(cx - s, cy - s * 3, s * 2, s * 2);
  // Ears.
  ctx.fillRect(cx - s * 2, cy - s * 4, s, s);
  ctx.fillRect(cx + s, cy - s * 4, s, s);
  // Left wing (8s span, with internal shape).
  ctx.fillRect(cx - s * 8, cy - s, s * 5, s * 2);
  ctx.fillRect(cx - s * 9, cy, s * 2, s);
  ctx.fillRect(cx - s * 7, cy - s * 2, s * 2, s);
  // Right wing (mirror).
  ctx.fillRect(cx + s * 3, cy - s, s * 5, s * 2);
  ctx.fillRect(cx + s * 7, cy, s * 2, s);
  ctx.fillRect(cx + s * 5, cy - s * 2, s * 2, s);
}
