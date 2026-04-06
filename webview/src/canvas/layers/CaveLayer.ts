import { RenderContext, P, seed, outlineRect } from "./render-context";

// ── Floor tile with texture ────────────────────────────

function drawFloorTile(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, zt: number, zoom: number,
  isLight: boolean, seedIdx: number,
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
}

// ── Wall tile with rock texture ────────────────────────

function drawWallTile(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, zt: number, zoom: number,
  row: number, totalRows: number, seedIdx: number,
): void {
  const colors = totalRows === 3
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
      ctx.fillRect(x + Math.floor(s2 * (zt - zoom * 2)), y + Math.floor(s * (zt - zoom * 2)), zoom, zoom);
    }
  }

  // Horizontal seam at bottom of each row.
  if (row < totalRows - 1) {
    ctx.fillStyle = P.WALL_DARK;
    ctx.fillRect(x, y + zt - zoom, zt, zoom);
  }
}

// ── Stalactites ────────────────────────────────────────

function drawStalactites(
  ctx: CanvasRenderingContext2D,
  cols: number, zt: number, zoom: number, wallH: number,
): void {
  for (let x = 0; x < cols; x++) {
    const s1 = seed(x);
    const s2 = seed(x * 3 + 7);

    if (x % 5 === 0 && s1 > 0.2) {
      const h = Math.floor(zoom * (5 + s1 * 8));
      const w = zoom * (2 + Math.floor(s2 * 2));
      const sx = x * zt + zt / 2 - w / 2;

      // Body.
      ctx.fillStyle = P.WALL_EDGE;
      ctx.fillRect(sx, wallH, w, h);
      // Tip (narrower).
      ctx.fillStyle = P.WALL_MID;
      ctx.fillRect(sx + Math.floor(w / 4), wallH + h, Math.ceil(w / 2), zoom);
      // Highlight on left edge.
      ctx.fillStyle = P.WALL_LIGHT;
      ctx.fillRect(sx, wallH, Math.max(1, Math.floor(zoom / 2)), h);
      // Shadow on right edge.
      ctx.fillStyle = P.WALL_DARK;
      ctx.fillRect(sx + w - Math.max(1, Math.floor(zoom / 2)), wallH, Math.max(1, Math.floor(zoom / 2)), h);
    }
  }
}

// ── Stalagmites (from floor) ──────────────────────────

function drawStalagmites(
  ctx: CanvasRenderingContext2D,
  cols: number, zt: number, zoom: number, height: number,
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
      ctx.fillRect(sx + Math.floor(w / 4), baseY - h - zoom, Math.ceil(w / 2), zoom);
      // Highlight on left.
      ctx.fillStyle = P.WALL_LIGHT;
      ctx.fillRect(sx, baseY - h, Math.max(1, Math.floor(zoom / 2)), h);
      // Shadow on right.
      ctx.fillStyle = P.WALL_DARK;
      ctx.fillRect(sx + w - Math.max(1, Math.floor(zoom / 2)), baseY - h, Math.max(1, Math.floor(zoom / 2)), h);
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
  zt: number, zoom: number, wallH: number,
  width: number, height: number, now: number,
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
  const stateColor = state === "thinking" ? "#1e4478"
    : state === "writing" ? "#1e5432"
    : "#1a3a5a";
  const stateDim = state === "thinking" ? "#0e2440"
    : state === "writing" ? "#0e2a16"
    : "#0e1e30";

  // Speed up pulse when active.
  const ledSpeed = state === "idle" ? 1200 : 600;

  // Agent enter pulse — bright wave traveling along the strip for 1.5s after agent_enter.
  const pulseStart = world.getAgentPulseStart();
  const pulseAge = now - pulseStart;
  const pulseActive = pulseStart > 0 && pulseAge < 1500;
  const pulsePos = pulseActive ? (pulseAge / 1500) * width : -1;

  for (let x = 0; x < width; x += zoom * 6) {
    const phase = Math.sin(now / ledSpeed + x * 0.01);
    let color = phase > 0.3 ? stateColor : stateDim;

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
  // Scanlines.
  ctx.fillStyle = "#040408";
  for (let sl = 0; sl < monH; sl += zoom * 2) {
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
    const maxLines = Math.min(gitLog.length, Math.floor((monH - zoom * 5) / lineH));
    const visible = gitLog.slice(-maxLines);
    for (let g = 0; g < visible.length; g++) {
      const entry = visible[g];
      const gy = monY + zoom * 5 + g * lineH;
      ctx.fillStyle = entry.type === "commit" ? "#2ECC71" : "#F39C12";
      const prefix = entry.type === "commit" ? "\u25CF " : "\u25B2 ";
      const maxChars = Math.max(6, Math.floor((monW - zoom * 4) / (smallFont * 0.6)));
      const msg = entry.message.length > maxChars
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
  ctx.fillRect(monX + Math.floor(monW / 2) - zoom, monY + monH, zoom * 2, zoom * 2);
}

// ── Main orchestrator ──────────────────────────────────

export function drawCaveEnvironment(rc: RenderContext): void {
  const { ctx, zoom, zt, cols, rows, wallRows, wallH, width, height } = rc;

  // ── Floor tiles (textured) ──
  for (let y = wallRows; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      drawFloorTile(ctx, x * zt, y * zt, zt, zoom, (x + y) % 2 === 0, x * 17 + y * 31);
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

  // Wall bottom edge (opaque, no rgba).
  ctx.fillStyle = P.OUTLINE;
  ctx.fillRect(0, wallH, width, zoom);

  // ── Stalagmites (from floor, before furniture) ──
  drawStalagmites(ctx, cols, zt, zoom, height);

  // ── Wall details (pipes, LED strip, panels) ──
  drawWallDetails(ctx, zt, zoom, wallH, width, height, rc.now, rc.world);

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

  // ── Bat Signal (context 100%) ──
  if (rc.world.isBatSignalActive()) {
    drawBatSignal(ctx, width, wallH, zoom);
  }
}

function drawBatSignal(
  ctx: CanvasRenderingContext2D,
  width: number, wallH: number, zoom: number,
): void {
  // Light circle on ceiling.
  const cx = Math.floor(width / 2);
  const cy = Math.floor(wallH * 0.4);
  const r = zoom * 12;
  ctx.fillStyle = "#1a1a30";
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // Bat silhouette (negative space) — pixel art.
  const s = Math.max(1, zoom);
  ctx.fillStyle = "#0a0a12";
  // Body.
  ctx.fillRect(cx - s * 2, cy - s, s * 4, s * 3);
  // Head.
  ctx.fillRect(cx - s, cy - s * 2, s * 2, s);
  // Ears.
  ctx.fillRect(cx - s * 2, cy - s * 3, s, s);
  ctx.fillRect(cx + s, cy - s * 3, s, s);
  // Left wing.
  ctx.fillRect(cx - s * 6, cy - s, s * 4, s * 2);
  ctx.fillRect(cx - s * 7, cy, s * 2, s);
  // Right wing.
  ctx.fillRect(cx + s * 2, cy - s, s * 4, s * 2);
  ctx.fillRect(cx + s * 5, cy, s * 2, s);
}
