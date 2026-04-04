import { darken, lighten } from "../../helpers/color";
import { RenderContext, P, seed, outlineRect } from "./render-context";

// ── Batcomputer ────────────────────────────────────────

function drawBatcomputer(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, zt: number, zoom: number, tilesW: number,
  now: number, world: RenderContext["world"],
): void {
  const state = world.getAlfredState();
  const totalW = zt * tilesW;
  const totalH = Math.floor(zt * 1.5);

  // Desk body.
  ctx.fillStyle = "#1c1c2e";
  ctx.fillRect(x, y, totalW, totalH);
  ctx.fillStyle = P.HIGHLIGHT;
  ctx.fillRect(x, y, totalW, zoom);
  ctx.fillStyle = "#141422";
  ctx.fillRect(x, y + totalH - zoom, totalW, zoom);
  outlineRect(ctx, x, y, totalW, totalH, zoom);

  // 3 screens.
  const gap = Math.floor(zoom * 3);
  const screenAreaW = totalW - gap * 4;
  const sw = Math.floor(screenAreaW / 3);
  const sh = totalH - gap * 2;

  const screenColors = state === "thinking"
    ? [P.ACCENT, P.ACCENT, "#1a3a5a"]
    : state === "writing"
    ? ["#1a3a1a", "#2ECC71", "#1a3a1a"]
    : ["#1a1a2a", "#1a1a2a", "#1a1a2a"];

  const tremor = state === "writing" ? Math.floor(Math.sin(now / 80) * zoom * 0.5) : 0;
  const font = `"DM Mono", monospace`;
  const smallFont = Math.max(5, zoom * 2.5);
  const labelFont = Math.max(6, zoom * 3);

  for (let i = 0; i < 3; i++) {
    const sx = x + gap + i * (sw + gap);

    // Bezel.
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(sx - zoom, y + gap - zoom, sw + zoom * 2, sh + zoom * 2);
    // Screen surface.
    ctx.fillStyle = "#060610";
    ctx.fillRect(sx, y + gap, sw, sh);
    // Screen glow.
    const phase = Math.sin(now / 800 + i * 2.1);
    const glowBase = screenColors[i];
    const glow = phase > 0 ? lighten(glowBase, phase * 0.15) : glowBase;
    ctx.fillStyle = glow;
    ctx.fillRect(sx + zoom + tremor, y + gap + zoom, sw - zoom * 2, sh - zoom * 2);
    // Scanlines.
    ctx.fillStyle = "#040408";
    for (let sl = 0; sl < sh; sl += zoom * 2) {
      ctx.fillRect(sx, y + gap + sl, sw, zoom);
    }
  }

  // ── Left screen: recent files ──
  const leftX = x + gap;
  const screenY = y + gap;
  const files = world.getRecentFiles();
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "left";

  // Screen header.
  ctx.fillStyle = "#555570";
  ctx.fillText("FILES", leftX + zoom * 2, screenY + zoom * 3);

  if (files.length > 0) {
    const lineH = Math.max(zoom * 3, smallFont + zoom);
    const maxLines = Math.min(files.length, Math.floor((sh - zoom * 5) / lineH));
    const visible = files.slice(-maxLines);
    for (let f = 0; f < visible.length; f++) {
      const file = visible[f];
      const fy = screenY + zoom * 5 + f * lineH;
      // Color by tool type.
      const toolCat = ["Edit", "Write", "NotebookEdit"].includes(file.tool) ? "write"
        : ["Read", "Grep", "Glob"].includes(file.tool) ? "read" : "other";
      ctx.fillStyle = toolCat === "write" ? "#2ECC71" : toolCat === "read" ? "#5a8ab8" : "#888899";
      // Truncate filename.
      const maxChars = Math.max(6, Math.floor((sw - zoom * 4) / (smallFont * 0.6)));
      const display = file.name.length > maxChars
        ? file.name.slice(0, maxChars - 1) + "\u2026"
        : file.name;
      ctx.fillText(display, leftX + zoom * 2, fy);
    }
  } else {
    ctx.fillStyle = "#333348";
    ctx.fillText("no files", leftX + zoom * 2, screenY + zoom * 7);
  }

  // ── Center screen: active tool + state ──
  const centerX = x + gap + sw + gap;
  const activeData = world.getActiveToolDisplay();

  // State label (big).
  ctx.font = `bold ${labelFont}px ${font}`;
  ctx.textAlign = "center";
  ctx.fillStyle = state === "thinking" ? P.ACCENT
    : state === "writing" ? "#2ECC71" : "#555566";
  ctx.fillText(activeData.state, centerX + sw / 2 + tremor, screenY + Math.floor(sh * 0.35));

  // Current tool name.
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillStyle = "#888899";
  const toolDisplay = activeData.tool.length > 10
    ? activeData.tool.slice(0, 9) + "\u2026"
    : activeData.tool;
  ctx.fillText(toolDisplay, centerX + sw / 2 + tremor, screenY + Math.floor(sh * 0.55));

  // Divider line.
  ctx.fillStyle = "#1a1a30";
  ctx.fillRect(centerX + zoom * 2, screenY + Math.floor(sh * 0.62), sw - zoom * 4, Math.max(1, Math.floor(zoom / 2)));

  // Active agents count.
  const agentCount = world.getActiveAgentNames().length;
  if (agentCount > 0) {
    ctx.fillStyle = "#2ECC71";
    ctx.fillText(`${agentCount} agent${agentCount > 1 ? "s" : ""}`, centerX + sw / 2, screenY + Math.floor(sh * 0.78));
  }

  // ── Right screen: session stats ──
  const rightX = x + gap + (sw + gap) * 2;
  const stats = world.getSessionStats();
  const theme = world.getRepoTheme();

  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "left";

  // Header.
  ctx.fillStyle = "#555570";
  ctx.fillText("STATS", rightX + zoom * 2, screenY + zoom * 3);

  // Context %.
  const ctxColor = stats.contextPct < 50 ? "#2ECC71" : stats.contextPct < 80 ? "#F39C12" : "#E74C3C";
  ctx.fillStyle = ctxColor;
  ctx.fillText(`CTX ${stats.contextPct}%`, rightX + zoom * 2, screenY + zoom * 7);

  // Tool count.
  ctx.fillStyle = theme.accent;
  ctx.fillText(`${stats.toolCount} tools`, rightX + zoom * 2, screenY + zoom * 11);

  // Duration.
  ctx.fillStyle = "#888899";
  ctx.fillText(stats.duration, rightX + zoom * 2, screenY + zoom * 15);

  // Desk legs.
  ctx.fillStyle = "#141424";
  const legW = zoom * 2;
  ctx.fillRect(x + gap, y + totalH, legW, zoom * 3);
  ctx.fillRect(x + totalW - gap - legW, y + totalH, legW, zoom * 3);
}

// ── Server rack ────────────────────────────────────────

function drawServerRack(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, zt: number, zoom: number,
  now: number,
): void {
  const w = zt * 2;
  const h = zt * 3;

  // Body.
  ctx.fillStyle = "#111120";
  ctx.fillRect(x, y, w, h);
  // Front panel (slightly darker).
  ctx.fillStyle = "#0e0e1a";
  ctx.fillRect(x + zoom, y + zoom, w - zoom * 2, h - zoom * 2);
  // Top highlight.
  ctx.fillStyle = P.HIGHLIGHT;
  ctx.fillRect(x, y, w, zoom);
  // Outline.
  outlineRect(ctx, x, y, w, h, zoom);

  // Rack unit dividers.
  ctx.fillStyle = "#1a1a2e";
  const units = 5;
  const unitH = Math.floor((h - zoom * 2) / units);
  for (let i = 1; i < units; i++) {
    ctx.fillRect(x + zoom * 2, y + zoom + i * unitH, w - zoom * 4, zoom);
  }

  // Blinking LEDs (opaque).
  const ledColors = P.LED_COLORS;
  for (let i = 0; i < units; i++) {
    const ledY = y + zoom * 2 + i * unitH + Math.floor(unitH / 2);
    const phase = Math.sin(now / 400 + i * 1.7);
    const on = phase > -0.3;
    ctx.fillStyle = on ? ledColors[i % ledColors.length] : "#0a0a12";
    ctx.fillRect(x + zoom * 2, ledY, zoom, zoom);
    // Second LED.
    const phase2 = Math.sin(now / 600 + i * 2.3);
    ctx.fillStyle = phase2 > 0 ? ledColors[(i + 2) % ledColors.length] : "#0a0a12";
    ctx.fillRect(x + zoom * 4, ledY, zoom, zoom);
  }

  // Ventilation holes.
  ctx.fillStyle = "#080812";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(x + w - zoom * 3, y + zoom * 3 + i * zoom * 3, zoom * 2, zoom);
  }
}

// ── Workbench ──────────────────────────────────────────

function drawWorkbench(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, zt: number, zoom: number,
  now: number,
): void {
  const w = zt * 3;
  const h = Math.floor(zt * 1.5);

  // Table top.
  ctx.fillStyle = "#1a1a2a";
  ctx.fillRect(x, y, w, zoom * 2);
  ctx.fillStyle = P.HIGHLIGHT;
  ctx.fillRect(x, y, w, zoom);
  // Table body.
  ctx.fillStyle = "#141422";
  ctx.fillRect(x, y + zoom * 2, w, h - zoom * 2);
  // Outline.
  outlineRect(ctx, x, y, w, h, zoom);

  // Table legs.
  ctx.fillStyle = "#101018";
  ctx.fillRect(x + zoom, y + h, zoom * 2, zoom * 3);
  ctx.fillRect(x + w - zoom * 3, y + h, zoom * 2, zoom * 3);

  // Small screen on the workbench.
  const screenW = zoom * 8;
  const screenH = zoom * 5;
  const screenX = x + zoom * 2;
  const screenY = y - screenH - zoom;

  // Screen stand.
  ctx.fillStyle = "#141422";
  ctx.fillRect(screenX + Math.floor(screenW / 2) - zoom, y - zoom, zoom * 2, zoom);

  // Bezel.
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(screenX - zoom, screenY - zoom, screenW + zoom * 2, screenH + zoom * 2);
  // Surface.
  ctx.fillStyle = "#060610";
  ctx.fillRect(screenX, screenY, screenW, screenH);
  // Screen glow — terracotta (opaque cycling).
  const pulse = Math.sin(now / 1200);
  ctx.fillStyle = pulse > 0 ? "#3a2218" : "#2e1a12";
  ctx.fillRect(screenX + zoom, screenY + zoom, screenW - zoom * 2, screenH - zoom * 2);
  // Scanlines.
  ctx.fillStyle = "#040408";
  for (let sl = 0; sl < screenH; sl += zoom * 2) {
    ctx.fillRect(screenX, screenY + sl, screenW, zoom);
  }

  // Small items on table surface.
  ctx.fillStyle = P.HIGHLIGHT;
  ctx.fillRect(x + w - zoom * 6, y - zoom, zoom * 3, zoom);
  ctx.fillStyle = "#2a2a40";
  ctx.fillRect(x + w - zoom * 3, y - zoom, zoom * 2, zoom);
}

// ── Display panel (wall-mounted, right side) — agent tracker ──

function drawDisplayPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, zt: number, zoom: number,
  now: number, world: RenderContext["world"],
): void {
  const w = Math.floor(zt * 2.5);
  const h = Math.floor(zt * 1.8);
  const theme = world.getRepoTheme();
  const font = `"DM Mono", monospace`;
  const smallFont = Math.max(5, zoom * 2.5);

  // Mounting bracket.
  ctx.fillStyle = "#141428";
  ctx.fillRect(x + Math.floor(w / 2) - zoom * 2, y + h, zoom * 4, zoom * 3);

  // Panel body.
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(x, y, w, zoom);
  outlineRect(ctx, x, y, w, h, zoom);

  // Single screen area.
  const gap = zoom * 2;
  const screenW = w - gap * 2;
  const screenH = h - gap * 2;
  const sx = x + gap;
  const sy = y + gap;

  ctx.fillStyle = "#060610";
  ctx.fillRect(sx, sy, screenW, screenH);
  // Background glow.
  ctx.fillStyle = darken(theme.accentDark, 0.3);
  ctx.fillRect(sx + zoom, sy + zoom, screenW - zoom * 2, screenH - zoom * 2);
  // Scanlines.
  ctx.fillStyle = "#040408";
  for (let sl = 0; sl < screenH; sl += zoom * 2) {
    ctx.fillRect(sx, sy + sl, screenW, Math.max(1, Math.floor(zoom / 2)));
  }

  // Header.
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "#555570";
  ctx.fillText("AGENTS", sx + zoom * 2, sy + zoom * 3);

  // Agent history.
  const history = world.getAgentHistory();
  if (history.length > 0) {
    const lineH = Math.max(zoom * 3, smallFont + zoom);
    const maxLines = Math.min(history.length, Math.floor((screenH - zoom * 5) / lineH));
    const visible = history.slice(-maxLines);
    for (let a = 0; a < visible.length; a++) {
      const entry = visible[a];
      const ay = sy + zoom * 5 + a * lineH;
      ctx.fillStyle = entry.action === "enter" ? "#2ECC71" : "#E74C3C";
      const arrow = entry.action === "enter" ? "\u25B6" : "\u25C0";
      const maxChars = Math.max(6, Math.floor((screenW - zoom * 4) / (smallFont * 0.6)));
      const label = entry.name.length > maxChars
        ? entry.name.slice(0, maxChars - 1) + "\u2026"
        : entry.name;
      ctx.fillText(`${arrow} ${label}`, sx + zoom * 2, ay);
    }
  } else {
    ctx.fillStyle = "#333348";
    ctx.fillText("no agents", sx + zoom * 2, sy + zoom * 7);
  }

  // LED indicators.
  const activeCount = world.getActiveAgentNames().length;
  for (let i = 0; i < 4; i++) {
    const lx = x + zoom * 3 + i * zoom * 4;
    ctx.fillStyle = i < activeCount ? "#2ECC71" : "#0a0a12";
    ctx.fillRect(lx, y + h - zoom * 2, zoom, zoom);
  }
}

// ── Cables ─────────────────────────────────────────────

function drawCables(
  ctx: CanvasRenderingContext2D,
  bcX: number, bcY: number, zt: number, zoom: number, bcTilesW: number,
): void {
  const bcW = zt * bcTilesW;
  const rackRightX = bcX - zt;
  const cableY = bcY + Math.floor(zt * 1.5) + zoom * 2;

  ctx.fillStyle = "#0e0e1c";
  ctx.fillRect(rackRightX, cableY, zt + zoom, zoom);
  ctx.fillRect(rackRightX, cableY + zoom * 2, zt + zoom, zoom);
  ctx.fillStyle = "#0c0c18";
  ctx.fillRect(bcX + bcW, cableY + zoom, zt, zoom);

  // Cable texture dots (opaque accent tint).
  ctx.fillStyle = "#101828";
  for (let i = 0; i < 6; i++) {
    const cx = rackRightX + i * zoom * 3;
    if (cx < bcX) ctx.fillRect(cx, cableY, zoom, zoom);
  }

  // Floor connector.
  ctx.fillStyle = "#161628";
  ctx.fillRect(rackRightX - zoom, cableY - zoom, zoom * 2, zoom * 4);
}

// ── Floor objects (crates, chair, debris) ──────────────

function drawFloorObjects(
  ctx: CanvasRenderingContext2D,
  bcX: number, bcY: number, zt: number, zoom: number, bcTilesW: number,
  width: number, height: number,
): void {
  const bcW = zt * bcTilesW;
  const bcBottom = bcY + Math.floor(zt * 1.5) + zoom * 3;

  // Chair in front of batcomputer.
  const chairX = Math.floor(bcX + bcW / 2 - zoom * 3);
  const chairY = bcBottom + zoom * 4;
  // Seat.
  ctx.fillStyle = "#1a1a2a";
  ctx.fillRect(chairX, chairY, zoom * 6, zoom * 2);
  ctx.fillStyle = P.HIGHLIGHT;
  ctx.fillRect(chairX, chairY, zoom * 6, Math.max(1, Math.floor(zoom / 2)));
  // Backrest.
  ctx.fillStyle = "#161624";
  ctx.fillRect(chairX + zoom, chairY - zoom * 3, zoom * 4, zoom * 3);
  ctx.fillStyle = P.HIGHLIGHT;
  ctx.fillRect(chairX + zoom, chairY - zoom * 3, zoom * 4, Math.max(1, Math.floor(zoom / 2)));
  // Legs.
  ctx.fillStyle = "#101018";
  ctx.fillRect(chairX + zoom, chairY + zoom * 2, zoom, zoom * 2);
  ctx.fillRect(chairX + zoom * 4, chairY + zoom * 2, zoom, zoom * 2);
  // Outline.
  outlineRect(ctx, chairX, chairY - zoom * 3, zoom * 6, zoom * 7, zoom);

  // Crate (left side, near workbench).
  const crateX = Math.floor(bcX - zt * 5);
  const crateY = height - zoom * 10;
  const crateW = zoom * 7;
  const crateH = zoom * 6;
  // Body.
  ctx.fillStyle = "#1e1a14";
  ctx.fillRect(crateX, crateY, crateW, crateH);
  // Top highlight.
  ctx.fillStyle = "#2a2418";
  ctx.fillRect(crateX, crateY, crateW, zoom);
  // Shadow on right.
  ctx.fillStyle = "#141210";
  ctx.fillRect(crateX + crateW - zoom, crateY, zoom, crateH);
  // Cross planks.
  ctx.fillStyle = "#24200a";
  ctx.fillRect(crateX + zoom, crateY + Math.floor(crateH / 2) - Math.max(1, Math.floor(zoom / 2)), crateW - zoom * 2, zoom);
  ctx.fillRect(crateX + Math.floor(crateW / 2) - Math.max(1, Math.floor(zoom / 2)), crateY + zoom, zoom, crateH - zoom * 2);
  // Outline.
  outlineRect(ctx, crateX, crateY, crateW, crateH, zoom);

  // Second smaller crate stacked on top.
  const crate2W = zoom * 5;
  const crate2H = zoom * 4;
  const crate2X = crateX + zoom;
  const crate2Y = crateY - crate2H;
  ctx.fillStyle = "#1a1610";
  ctx.fillRect(crate2X, crate2Y, crate2W, crate2H);
  ctx.fillStyle = "#262010";
  ctx.fillRect(crate2X, crate2Y, crate2W, zoom);
  ctx.fillStyle = "#12100c";
  ctx.fillRect(crate2X + crate2W - zoom, crate2Y, zoom, crate2H);
  outlineRect(ctx, crate2X, crate2Y, crate2W, crate2H, zoom);

  // Crate (right side, near bookshelf).
  const crateRX = bcX + bcW + zt * 3 + zoom * 2;
  const crateRY = height - zoom * 8;
  const crateRW = zoom * 6;
  const crateRH = zoom * 5;
  ctx.fillStyle = "#1a1614";
  ctx.fillRect(crateRX, crateRY, crateRW, crateRH);
  ctx.fillStyle = "#242018";
  ctx.fillRect(crateRX, crateRY, crateRW, zoom);
  ctx.fillStyle = "#121010";
  ctx.fillRect(crateRX + crateRW - zoom, crateRY, zoom, crateRH);
  outlineRect(ctx, crateRX, crateRY, crateRW, crateRH, zoom);

  // Floor debris / scattered tools.
  const debrisSeeds = [17, 53, 89, 127, 163];
  for (const dSeed of debrisSeeds) {
    const s = seed(dSeed);
    const dx = s * (width - zt * 2) + zt;
    const dy = height - zoom * (2 + s * 3);
    ctx.fillStyle = s > 0.5 ? "#1a1a28" : "#181822";
    ctx.fillRect(Math.floor(dx), Math.floor(dy), zoom, zoom);
  }

  // Floor cable running from server rack area.
  const cableStartX = Math.floor(bcX - zt * 2);
  const cableEndX = Math.floor(bcX - zt * 5.5);
  const cableY = height - zoom * 3;
  ctx.fillStyle = "#0e0e1c";
  ctx.fillRect(cableEndX, cableY, cableStartX - cableEndX, zoom);
  // Cable connector dot.
  ctx.fillStyle = "#1a2a1a";
  ctx.fillRect(cableEndX, cableY - zoom, zoom * 2, zoom * 3);
}

// ── Weapon rack (wall-mounted, left side) ──────────────

function drawWeaponRack(
  ctx: CanvasRenderingContext2D,
  zt: number, zoom: number, wallH: number,
): void {
  const rackX = Math.floor(zt * 0.5);
  const rackY = Math.floor(wallH * 0.3);
  const rackW = Math.floor(zt * 1.8);
  const rackH = Math.floor(zt * 1.2);

  // Back board.
  ctx.fillStyle = "#141220";
  ctx.fillRect(rackX, rackY, rackW, rackH);
  ctx.fillStyle = P.HIGHLIGHT;
  ctx.fillRect(rackX, rackY, rackW, zoom);
  outlineRect(ctx, rackX, rackY, rackW, rackH, zoom);

  // Horizontal pegs (2 rows).
  const pegY1 = rackY + Math.floor(rackH * 0.3);
  const pegY2 = rackY + Math.floor(rackH * 0.7);
  ctx.fillStyle = "#1e1e30";
  ctx.fillRect(rackX + zoom * 2, pegY1, rackW - zoom * 4, zoom);
  ctx.fillRect(rackX + zoom * 2, pegY2, rackW - zoom * 4, zoom);

  // Batarang silhouette (top peg) — simple diamond shape.
  const batX = rackX + zoom * 4;
  ctx.fillStyle = "#1a2a3a";
  ctx.fillRect(batX, pegY1 - zoom * 2, zoom * 4, zoom);
  ctx.fillRect(batX + zoom, pegY1 - zoom * 3, zoom * 2, zoom);
  ctx.fillRect(batX + zoom, pegY1 - zoom, zoom * 2, zoom);

  // Grapple hook shape (bottom peg).
  const grX = rackX + zoom * 5;
  ctx.fillStyle = "#222236";
  ctx.fillRect(grX, pegY2 - zoom * 2, zoom, zoom * 3);
  ctx.fillRect(grX - zoom, pegY2 + zoom, zoom * 3, zoom);
  // Hook tip.
  ctx.fillStyle = "#2a2a40";
  ctx.fillRect(grX - zoom, pegY2, zoom, zoom);
  ctx.fillRect(grX + zoom, pegY2, zoom, zoom);
}

// ── Barrel (right side, near crates) ──────────────────

function drawBarrel(
  ctx: CanvasRenderingContext2D,
  bcX: number, bcW: number, zt: number, zoom: number,
  height: number,
): void {
  const bx = bcX + bcW + Math.floor(zt * 3.5);
  const by = height - zoom * 14;
  const bw = zoom * 8;
  const bh = zoom * 10;

  // Body.
  ctx.fillStyle = "#1a1612";
  ctx.fillRect(bx, by, bw, bh);
  // Top rim (lighter).
  ctx.fillStyle = "#24201a";
  ctx.fillRect(bx, by, bw, zoom * 2);
  // Bottom rim.
  ctx.fillStyle = "#1e1a14";
  ctx.fillRect(bx, by + bh - zoom * 2, bw, zoom * 2);
  // Metal bands.
  ctx.fillStyle = "#222230";
  ctx.fillRect(bx, by + zoom * 3, bw, zoom);
  ctx.fillRect(bx, by + bh - zoom * 4, bw, zoom);
  // Left highlight.
  ctx.fillStyle = "#201c16";
  ctx.fillRect(bx, by, zoom, bh);
  // Right shadow.
  ctx.fillStyle = "#14120e";
  ctx.fillRect(bx + bw - zoom, by, zoom, bh);
  // Outline.
  outlineRect(ctx, bx, by, bw, bh, zoom);
}

// ── Map/planning table (left side, in front of workbench area) ──

function drawMapTable(
  ctx: CanvasRenderingContext2D,
  zt: number, zoom: number, wallH: number,
): void {
  const tx = Math.floor(zt * 1.5);
  const ty = wallH + Math.floor(zt * 2.5);
  const tw = Math.floor(zt * 2);
  const th = zoom * 4;

  // Table top surface.
  ctx.fillStyle = "#1a1a28";
  ctx.fillRect(tx, ty, tw, th);
  ctx.fillStyle = P.HIGHLIGHT;
  ctx.fillRect(tx, ty, tw, zoom);
  // Outline.
  outlineRect(ctx, tx, ty, tw, th, zoom);

  // Legs.
  ctx.fillStyle = "#121220";
  ctx.fillRect(tx + zoom, ty + th, zoom, zoom * 4);
  ctx.fillRect(tx + tw - zoom * 2, ty + th, zoom, zoom * 4);

  // Map/blueprint on table (scrolled paper).
  const mapX = tx + zoom * 2;
  const mapY = ty - zoom * 2;
  const mapW = tw - zoom * 4;
  const mapH = zoom * 3;
  ctx.fillStyle = "#1e2028";
  ctx.fillRect(mapX, mapY, mapW, mapH);
  // Grid lines on map.
  ctx.fillStyle = "#242838";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(mapX + Math.floor(i * mapW / 4), mapY, Math.max(1, Math.floor(zoom / 2)), mapH);
  }
  ctx.fillRect(mapX, mapY + Math.floor(mapH / 2), mapW, Math.max(1, Math.floor(zoom / 2)));
  // Pin/marker on map.
  ctx.fillStyle = "#3a1a1a";
  ctx.fillRect(mapX + Math.floor(mapW * 0.6), mapY + zoom, zoom, zoom);
}

// ── Tool board (wall-mounted, between server rack and workbench) ──

function drawToolBoard(
  ctx: CanvasRenderingContext2D,
  zt: number, zoom: number, wallH: number,
): void {
  const bx = Math.floor(zt * 3.5);
  const by = Math.floor(wallH * 0.4);
  const bw = Math.floor(zt * 1.2);
  const bh = Math.floor(zt * 0.8);

  // Pegboard background.
  ctx.fillStyle = "#161424";
  ctx.fillRect(bx, by, bw, bh);
  outlineRect(ctx, bx, by, bw, bh, zoom);

  // Peg holes grid.
  ctx.fillStyle = "#0e0c1a";
  for (let py = 0; py < 3; py++) {
    for (let px = 0; px < 4; px++) {
      ctx.fillRect(
        bx + zoom * 2 + px * zoom * 3,
        by + zoom * 2 + py * zoom * 3,
        zoom, zoom
      );
    }
  }

  // Hanging tools.
  // Wrench shape.
  ctx.fillStyle = "#2a2a3e";
  ctx.fillRect(bx + zoom * 2, by + zoom * 2, zoom, zoom * 4);
  ctx.fillRect(bx + zoom, by + zoom * 2, zoom * 3, zoom);

  // Screwdriver.
  ctx.fillStyle = "#282838";
  ctx.fillRect(bx + zoom * 6, by + zoom * 3, zoom, zoom * 5);
  ctx.fillStyle = "#3a2a1a";
  ctx.fillRect(bx + zoom * 6, by + zoom * 2, zoom, zoom);

  // Small hammer.
  ctx.fillStyle = "#2a2a3e";
  ctx.fillRect(bx + zoom * 9, by + zoom * 3, zoom, zoom * 4);
  ctx.fillRect(bx + zoom * 8, by + zoom * 2, zoom * 3, zoom * 2);
}

// ── Locker (tall, far right) ──────────────────────────

function drawLocker(
  ctx: CanvasRenderingContext2D,
  zt: number, zoom: number, wallH: number,
  width: number,
): void {
  const lx = width - Math.floor(zt * 2.2);
  const ly = wallH + zoom * 4;
  const lw = Math.floor(zt * 1.4);
  const lh = Math.floor(zt * 2.8);

  // Body.
  ctx.fillStyle = "#101020";
  ctx.fillRect(lx, ly, lw, lh);
  // Top highlight.
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(lx, ly, lw, zoom);
  // Right shadow.
  ctx.fillStyle = "#0a0a16";
  ctx.fillRect(lx + lw - zoom, ly, zoom, lh);
  outlineRect(ctx, lx, ly, lw, lh, zoom);

  // Door divider (vertical center line).
  ctx.fillStyle = P.OUTLINE;
  ctx.fillRect(lx + Math.floor(lw / 2), ly + zoom, zoom, lh - zoom * 2);

  // Door handles.
  ctx.fillStyle = "#2a2a40";
  ctx.fillRect(lx + Math.floor(lw / 2) - zoom * 2, ly + Math.floor(lh * 0.4), zoom, zoom * 3);
  ctx.fillRect(lx + Math.floor(lw / 2) + zoom, ly + Math.floor(lh * 0.4), zoom, zoom * 3);

  // Ventilation slits (top of each door).
  ctx.fillStyle = "#080812";
  for (let i = 0; i < 3; i++) {
    const sy = ly + zoom * 3 + i * zoom * 2;
    ctx.fillRect(lx + zoom * 2, sy, Math.floor(lw / 2) - zoom * 4, zoom);
    ctx.fillRect(lx + Math.floor(lw / 2) + zoom * 2, sy, Math.floor(lw / 2) - zoom * 4, zoom);
  }

  // Feet.
  ctx.fillStyle = "#0c0c1a";
  ctx.fillRect(lx + zoom, ly + lh, zoom * 2, zoom * 2);
  ctx.fillRect(lx + lw - zoom * 3, ly + lh, zoom * 2, zoom * 2);
}

// ── Whiteboard (wall-mounted) — todo / task board ──

function drawWhiteboard(
  ctx: CanvasRenderingContext2D,
  zt: number, zoom: number, wallH: number,
  world: RenderContext["world"],
): void {
  const bx = Math.floor(zt * 5.5);
  const by = Math.floor(wallH * 0.2);
  const bw = Math.floor(zt * 2);
  const bh = Math.floor(zt * 1);
  const font = `"DM Mono", monospace`;
  const smallFont = Math.max(5, zoom * 2);

  // Board surface.
  ctx.fillStyle = "#1e1e30";
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = "#242438";
  ctx.fillRect(bx + zoom, by + zoom, bw - zoom * 2, bh - zoom * 2);
  outlineRect(ctx, bx, by, bw, bh, zoom);
  // Marker tray.
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(bx, by + bh, bw, zoom * 2);
  outlineRect(ctx, bx, by + bh, bw, zoom * 2, Math.max(1, Math.floor(zoom / 2)));

  // Todo content.
  const todos = world.getTodoList();
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "left";

  if (todos.length > 0) {
    const lineH = Math.max(zoom * 2.5, smallFont + Math.floor(zoom * 0.5));
    const maxLines = Math.min(todos.length, Math.floor((bh - zoom * 2) / lineH));
    const visible = todos.slice(0, maxLines);
    for (let t = 0; t < visible.length; t++) {
      const todo = visible[t];
      const ty = by + zoom * 2 + t * lineH;
      // Status indicator.
      const statusColor = todo.status === "completed" ? "#2ECC71"
        : todo.status === "in_progress" ? "#F39C12" : "#555570";
      const statusChar = todo.status === "completed" ? "\u2713"
        : todo.status === "in_progress" ? "\u25B6" : "\u25CB";
      ctx.fillStyle = statusColor;
      // Truncate task name.
      const maxChars = Math.max(5, Math.floor((bw - zoom * 4) / (smallFont * 0.6)));
      const label = todo.content.length > maxChars
        ? todo.content.slice(0, maxChars - 1) + "\u2026"
        : todo.content;
      ctx.fillText(`${statusChar} ${label}`, bx + zoom * 2, ty);
    }
  } else {
    // Fallback: decorative scribbles when no todos.
    const theme = world.getRepoTheme();
    ctx.fillStyle = theme.accent;
    ctx.fillRect(bx + zoom * 2, by + zoom * 3, bw - zoom * 6, Math.max(1, Math.floor(zoom / 2)));
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(bx + zoom * 3 + i * zoom * 2, by + zoom * 5 + i * zoom, zoom * 2, Math.max(1, Math.floor(zoom / 2)));
    }
  }

  // Markers on tray (status-colored).
  const markerColors = ["#2ECC71", "#F39C12", "#555570"];
  for (let i = 0; i < markerColors.length; i++) {
    ctx.fillStyle = markerColors[i];
    ctx.fillRect(bx + zoom * 2 + i * zoom * 3, by + bh + Math.max(1, Math.floor(zoom / 2)), zoom * 2, zoom);
  }
}

// ── Floor cable runs (more life on the floor) ─────────

function drawFloorCableRuns(
  ctx: CanvasRenderingContext2D,
  zt: number, zoom: number,
  width: number, height: number,
): void {
  // Long cable from far left to center-left (power run).
  const cableY1 = height - zoom * 5;
  ctx.fillStyle = "#0e0e1c";
  ctx.fillRect(zoom * 2, cableY1, Math.floor(zt * 4), zoom);
  // Cable tie dots.
  ctx.fillStyle = "#181830";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(zoom * 4 + i * zt, cableY1 - Math.max(1, Math.floor(zoom / 2)), zoom * 2, zoom * 2);
  }

  // Right side cable from display panel area toward locker.
  const cableY2 = height - zoom * 8;
  const startX = width - Math.floor(zt * 5);
  ctx.fillStyle = "#0c0c1a";
  ctx.fillRect(startX, cableY2, Math.floor(zt * 3), zoom);
  // 90-degree bend going down.
  ctx.fillRect(startX + Math.floor(zt * 3), cableY2, zoom, zoom * 5);

  // Scattered cable connector box.
  ctx.fillStyle = "#141428";
  ctx.fillRect(startX - zoom, cableY2 - zoom, zoom * 3, zoom * 3);
  ctx.fillStyle = "#2ECC71";
  ctx.fillRect(startX, cableY2, zoom, zoom); // green LED
}

// ── Floor scatter (tools, parts, debris) ──────────────

function drawFloorScatter(
  ctx: CanvasRenderingContext2D,
  zt: number, zoom: number,
  width: number, height: number,
): void {
  // Scattered bolts/screws.
  const scatterColors = ["#1a1a28", "#181822", "#1e1e2e", "#161620"];
  for (let i = 0; i < 12; i++) {
    const s1 = seed(i * 17 + 200);
    const s2 = seed(i * 23 + 210);
    const sx = Math.floor(s1 * (width - zt * 2) + zt);
    const sy = height - zoom * (2 + s2 * 6);
    ctx.fillStyle = scatterColors[i % scatterColors.length];
    ctx.fillRect(sx, sy, zoom, zoom);
    // Some are 2px (small parts).
    if (s1 > 0.7) {
      ctx.fillRect(sx + zoom, sy, zoom, zoom);
    }
  }

  // Oil stain near server rack area.
  ctx.fillStyle = "#0c0c14";
  const stainX = Math.floor(zt * 2.5);
  const stainY = height - zoom * 4;
  ctx.fillRect(stainX, stainY, zoom * 4, zoom * 2);
  ctx.fillRect(stainX + zoom, stainY - zoom, zoom * 2, zoom);
  ctx.fillRect(stainX + zoom, stainY + zoom * 2, zoom * 3, zoom);

  // Small toolbox on the floor (right side).
  const tbX = width - Math.floor(zt * 4);
  const tbY = height - zoom * 6;
  const tbW = zoom * 6;
  const tbH = zoom * 4;
  ctx.fillStyle = "#1a1420";
  ctx.fillRect(tbX, tbY, tbW, tbH);
  ctx.fillStyle = "#221a2a";
  ctx.fillRect(tbX, tbY, tbW, zoom);
  // Handle.
  ctx.fillStyle = "#2a2a3e";
  ctx.fillRect(tbX + zoom * 2, tbY - zoom, zoom * 2, zoom);
  // Latch.
  ctx.fillStyle = "#2a2a40";
  ctx.fillRect(tbX + Math.floor(tbW / 2), tbY + zoom, zoom, zoom);
  outlineRect(ctx, tbX, tbY, tbW, tbH, Math.max(1, Math.floor(zoom / 2)));

  // Coiled wire/rope near map table.
  const coilX = Math.floor(zt * 3.5);
  const coilY = height - zoom * 3;
  ctx.fillStyle = "#141428";
  // Elliptical coil — 3 overlapping rects.
  ctx.fillRect(coilX, coilY, zoom * 3, zoom);
  ctx.fillRect(coilX - zoom, coilY + zoom, zoom * 5, zoom);
  ctx.fillRect(coilX, coilY + zoom * 2, zoom * 3, zoom);
}

// ── Batcomputer light pool (floor glow, state-reactive) ──

function drawBatcomputerLightPool(
  ctx: CanvasRenderingContext2D,
  bcX: number, bcY: number, zt: number, zoom: number, bcTilesW: number,
  now: number, state?: "idle" | "thinking" | "writing",
): void {
  if (state === "idle") return; // No glow when idle — cave stays dark.

  const bcW = zt * bcTilesW;
  const bcBottom = bcY + Math.floor(zt * 1.5) + zoom * 3;

  // Pool color based on state.
  const poolColor = state === "thinking" ? "#0a1428" : "#0a1e0e";
  const poolBright = state === "thinking" ? "#0e1a30" : "#0e2814";

  // Breathing pulse.
  const pulse = Math.sin(now / 1200) * 0.5 + 0.5;
  const color = pulse > 0.5 ? poolBright : poolColor;

  // Main pool — wide, shallow rectangle below the desk.
  const poolW = bcW + zoom * 8;
  const poolH = zoom * 6;
  const poolX = bcX - zoom * 4;
  const poolY = bcBottom + zoom * 2;

  ctx.fillStyle = color;
  ctx.fillRect(poolX, poolY, poolW, poolH);

  // Softer outer edge (wider, dimmer).
  ctx.fillStyle = poolColor;
  ctx.fillRect(poolX - zoom * 2, poolY + poolH, poolW + zoom * 4, zoom * 3);
  ctx.fillRect(poolX + zoom * 2, poolY - zoom * 2, poolW - zoom * 4, zoom * 2);
}

// ── Orchestrator ───────────────────────────────────────

export function drawAllFurniture(rc: RenderContext): void {
  const { ctx, width, height, now, world, zoom, zt, cols, wallRows, wallH } = rc;

  // Batcomputer positioning (same as render() lines 113-116).
  const bcTilesW = Math.min(5, cols - 2);
  const bcW = zt * bcTilesW;
  const bcX = Math.floor((width - bcW) / 2);
  const bcY = wallH + zoom * 2;

  // Light pool on floor below Batcomputer — state-reactive ambient glow.
  drawBatcomputerLightPool(ctx, bcX, bcY, zt, zoom, bcTilesW, now, world.getAlfredState());

  drawCables(ctx, bcX, bcY, zt, zoom, bcTilesW);
  drawServerRack(ctx, bcX - zt * 3, Math.floor(bcY - zt * 1.5), zt, zoom, now);
  drawWorkbench(ctx, Math.floor(bcX - zt * 6.5), bcY, zt, zoom, now);
  drawDisplayPanel(ctx, bcX + bcW + zt, bcY - Math.floor(zt * 0.5), zt, zoom, now, world);
  drawBatcomputer(ctx, bcX, bcY, zt, zoom, bcTilesW, now, world);

  // Floor objects (crates, chair, debris).
  drawFloorObjects(ctx, bcX, bcY, zt, zoom, bcTilesW, width, height);

  // Extra furniture.
  drawWeaponRack(ctx, zt, zoom, wallH);
  drawBarrel(ctx, bcX, bcW, zt, zoom, height);
  drawMapTable(ctx, zt, zoom, wallH);
  drawToolBoard(ctx, zt, zoom, wallH);
  drawLocker(ctx, zt, zoom, wallH, width);
  drawWhiteboard(ctx, zt, zoom, wallH, world);
  drawFloorCableRuns(ctx, zt, zoom, width, height);
  drawFloorScatter(ctx, zt, zoom, width, height);

  // Cave evolution decorations.
  drawEvolutionDecorations(ctx, zoom, zt, wallH, width, height, now, world);
}

// ── Cave Evolution Decorations ────────────────────────

function drawEvolutionDecorations(
  ctx: CanvasRenderingContext2D,
  zoom: number, zt: number, wallH: number,
  width: number, height: number, now: number,
  world: RenderContext["world"],
): void {
  const level = world.getCaveLevel();
  if (level < 2) return;

  const font = `"DM Mono", monospace`;
  const smallFont = Math.max(5, zoom * 2.5);

  // Level 2+: Trophy on shelf (left wall).
  if (level >= 2) {
    const tx = zt * 2;
    const ty = wallH - zoom * 2;
    // Shelf.
    ctx.fillStyle = "#1c1c2e";
    ctx.fillRect(tx, ty, zoom * 8, zoom * 2);
    ctx.fillStyle = P.HIGHLIGHT;
    ctx.fillRect(tx, ty, zoom * 8, zoom);
    // Trophy (golden cup).
    ctx.fillStyle = "#FFD700";
    ctx.fillRect(tx + zoom * 3, ty - zoom * 4, zoom * 2, zoom * 3);
    ctx.fillRect(tx + zoom * 2, ty - zoom * 4, zoom * 4, zoom);
    ctx.fillRect(tx + zoom * 2, ty - zoom, zoom * 4, zoom);
    // Base.
    ctx.fillStyle = darken("#FFD700", 0.3);
    ctx.fillRect(tx + zoom * 2, ty - zoom, zoom * 4, zoom);
  }

  // Level 3+: Achievement plaques on wall.
  if (level >= 3) {
    const px = width - zt * 6;
    const py = Math.floor(wallH * 0.5);
    // Plaque 1.
    ctx.fillStyle = "#2a2a3e";
    ctx.fillRect(px, py, zoom * 6, zoom * 4);
    outlineRect(ctx, px, py, zoom * 6, zoom * 4, Math.max(1, Math.floor(zoom / 2)));
    ctx.fillStyle = "#FFD700";
    ctx.font = `${Math.max(4, zoom * 2)}px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText("100", px + zoom * 3, py + zoom * 3);
  }

  // Level 4+: Banner/flag on wall.
  if (level >= 4) {
    const bx = Math.floor(width * 0.15);
    const by = Math.floor(wallH * 0.3);
    // Pole.
    ctx.fillStyle = "#3a3a4e";
    ctx.fillRect(bx, by, zoom, zoom * 8);
    // Banner.
    const theme = world.getRepoTheme();
    ctx.fillStyle = theme.accent;
    ctx.fillRect(bx + zoom, by, zoom * 5, zoom * 4);
    ctx.fillStyle = darken(theme.accent, 0.3);
    ctx.fillRect(bx + zoom, by + zoom * 4, zoom * 4, zoom);
    ctx.fillRect(bx + zoom, by + zoom * 5, zoom * 3, zoom);
    // Text.
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.max(4, zoom * 2)}px ${font}`;
    ctx.textAlign = "left";
    ctx.fillText("250", bx + zoom * 2, by + zoom * 3);
  }

  // Level 5+: Gold trim on Batcomputer.
  if (level >= 5) {
    const bcTilesW = Math.min(5, Math.ceil(width / zt) - 1);
    const bcW = zt * bcTilesW;
    const bcX = Math.floor((width - bcW) / 2);
    const bcY = wallH + zoom * 2;
    ctx.fillStyle = "#FFD700";
    ctx.fillRect(bcX, bcY, bcW, zoom);
    ctx.fillRect(bcX, bcY + Math.floor(zt * 1.5) - zoom, bcW, zoom);
  }

  // Level 6: Legendary — pulsing ambient glow.
  if (level >= 6) {
    const pulse = Math.sin(now * 0.001) * 0.5 + 0.5;
    ctx.save();
    ctx.fillStyle = "#FFD700";
    ctx.globalAlpha = pulse * 0.03;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Cave level label (bottom-left).
  if (level >= 2) {
    ctx.fillStyle = "#333344";
    ctx.font = `${smallFont}px ${font}`;
    ctx.textAlign = "left";
    ctx.fillText(`LV${level} ${world.getCaveLevelName()}`, zoom * 3, height - zoom * 3);
  }
}
