import { darken, lighten } from "../../helpers/color";
import {
  RenderContext,
  P,
  seed,
  outlineRect,
  contactShadow,
  castShadow,
} from "./render-context";
import {
  ACHIEVEMENTS,
  TIER_COLORS,
  ICON_PIXELS,
} from "../../data/gamification";
import { bus } from "../../systems/EventBus";
import type { CaveLayout } from "../layout";

// ── Batcomputer ────────────────────────────────────────

function drawBatcomputer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zt: number,
  zoom: number,
  tilesW: number,
  now: number,
  world: RenderContext["world"],
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

  const screenColors =
    state === "thinking"
      ? [P.ACCENT, P.ACCENT, "#1a3a5a"]
      : state === "writing"
        ? ["#1a3a1a", "#2ECC71", "#1a3a1a"]
        : ["#1e2438", "#222840", "#1e2438"];

  const tremor =
    state === "writing" ? Math.floor(Math.sin(now / 80) * zoom * 0.5) : 0;
  const font = `"DM Mono", monospace`;
  const smallFont = Math.max(8, zoom * 2.5);
  const labelFont = Math.max(10, zoom * 3);

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
    ctx.fillRect(
      sx + zoom + tremor,
      y + gap + zoom,
      sw - zoom * 2,
      sh - zoom * 2,
    );
    // Scanlines — 1px pitch per zoom unit for crisp pixel-art density.
    ctx.fillStyle = "#040408";
    for (let sl = 0; sl < sh; sl += zoom) {
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
  ctx.fillStyle = "#8888AA";
  ctx.fillText("FILES", leftX + zoom * 2, screenY + zoom * 3);

  if (files.length > 0) {
    const lineH = Math.max(zoom * 3, smallFont + zoom);
    const maxLines = Math.min(
      files.length,
      Math.floor((sh - zoom * 5) / lineH),
    );
    const visible = files.slice(-maxLines);
    for (let f = 0; f < visible.length; f++) {
      const file = visible[f];
      const fy = screenY + zoom * 5 + f * lineH;
      // Color by tool type.
      const toolCat = ["Edit", "Write", "NotebookEdit"].includes(file.tool)
        ? "write"
        : ["Read", "Grep", "Glob"].includes(file.tool)
          ? "read"
          : "other";
      ctx.fillStyle =
        toolCat === "write"
          ? "#2ECC71"
          : toolCat === "read"
            ? "#5a8ab8"
            : "#888899";
      // Truncate filename.
      const maxChars = Math.max(
        6,
        Math.floor((sw - zoom * 4) / (smallFont * 0.6)),
      );
      const display =
        file.name.length > maxChars
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
  ctx.fillStyle =
    state === "thinking"
      ? "#3399EE"
      : state === "writing"
        ? "#33DD88"
        : "#778899";
  ctx.fillText(
    activeData.state,
    centerX + sw / 2 + tremor,
    screenY + Math.floor(sh * 0.35),
  );

  // Current tool name.
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillStyle = "#888899";
  const toolDisplay =
    activeData.tool.length > 10
      ? activeData.tool.slice(0, 9) + "\u2026"
      : activeData.tool;
  ctx.fillText(
    toolDisplay,
    centerX + sw / 2 + tremor,
    screenY + Math.floor(sh * 0.55),
  );

  // Divider line.
  ctx.fillStyle = "#1a1a30";
  ctx.fillRect(
    centerX + zoom * 2,
    screenY + Math.floor(sh * 0.62),
    sw - zoom * 4,
    Math.max(1, Math.floor(zoom / 2)),
  );

  // Active agents count.
  const agentCount = world.getActiveAgentNames().length;
  if (agentCount > 0) {
    ctx.fillStyle = "#2ECC71";
    ctx.fillText(
      `${agentCount} agent${agentCount > 1 ? "s" : ""}`,
      centerX + sw / 2,
      screenY + Math.floor(sh * 0.78),
    );
  }

  // ── Right screen: agents ──
  const rightX = x + gap + (sw + gap) * 2;
  const activeAgentNames = world.getActiveAgentNames();

  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "left";

  // Header.
  ctx.fillStyle = "#8888AA";
  ctx.fillText("AGENTS", rightX + zoom * 2, screenY + zoom * 3);

  if (activeAgentNames.length > 0) {
    const lineH = Math.max(zoom * 3, smallFont + zoom);
    for (let a = 0; a < activeAgentNames.length && a < 4; a++) {
      const ay = screenY + zoom * 5 + a * lineH;
      ctx.fillStyle = "#2ECC71";
      ctx.fillRect(rightX + zoom * 2, ay, zoom, zoom);
      ctx.fillStyle = "#AAAACC";
      ctx.fillText(activeAgentNames[a], rightX + zoom * 4, ay + zoom);
    }
  } else {
    ctx.fillStyle = "#333348";
    ctx.fillText("idle", rightX + zoom * 2, screenY + zoom * 7);
  }

  // Desk legs.
  ctx.fillStyle = "#141424";
  const legW = zoom * 2;
  ctx.fillRect(x + gap, y + totalH, legW, zoom * 3);
  ctx.fillRect(x + totalW - gap - legW, y + totalH, legW, zoom * 3);

  // Desk surface items — keyboard and coffee mug.
  const deskSurfaceY = y + totalH - zoom * 2;
  // Keyboard (row of alternating light/dark keys).
  ctx.fillStyle = "#1e1e30";
  ctx.fillRect(x + zoom * 4, deskSurfaceY, zoom * 8, zoom);
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = k % 2 === 0 ? "#2a2a40" : "#222238";
    ctx.fillRect(x + zoom * 4 + k * zoom * 2, deskSurfaceY, zoom * 2, zoom);
  }
  // Coffee mug (2x3 with handle).
  ctx.fillStyle = "#2a2030";
  ctx.fillRect(
    x + totalW - zoom * 6,
    deskSurfaceY - zoom * 2,
    zoom * 2,
    zoom * 3,
  );
  ctx.fillStyle = "#342a3e";
  ctx.fillRect(x + totalW - zoom * 4, deskSurfaceY - zoom, zoom, zoom * 2);

  // Ground shadow.
  const deskBaseY = y + totalH + zoom * 3;
  contactShadow(ctx, x + gap, deskBaseY, totalW - gap * 2, zoom);
  castShadow(ctx, x, deskBaseY, totalW, totalH, zoom);
}

// ── Server rack ────────────────────────────────────────

function drawServerRack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zt: number,
  zoom: number,
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
  // Metal texture — dithered specks on front panel.
  ctx.fillStyle = "#14142a";
  for (let ty = 0; ty < h - zoom * 2; ty += zoom * 2) {
    for (let tx = 0; tx < w - zoom * 2; tx += zoom * 3) {
      if (seed(ty * 7 + tx * 3) > 0.6) {
        ctx.fillRect(x + zoom + tx, y + zoom + ty, zoom, zoom);
      }
    }
  }
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
    ctx.fillStyle =
      phase2 > 0 ? ledColors[(i + 2) % ledColors.length] : "#0a0a12";
    ctx.fillRect(x + zoom * 4, ledY, zoom, zoom);
  }

  // Right ventilation holes.
  ctx.fillStyle = "#080812";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(x + w - zoom * 3, y + zoom * 3 + i * zoom * 3, zoom * 2, zoom);
  }
  // Left ventilation — symmetric with right side.
  ctx.fillStyle = "#060a10";
  for (let v = 0; v < 3; v++) {
    ctx.fillRect(x + zoom * 2, y + zoom * 3 + v * zoom * 3, zoom * 2, zoom);
  }

  // Animated cooling fans (2 fans, alternating frames).
  // Speed is constant — fans always spin, future expansion could vary by agent count.
  const fanSpeed = 200; // ms per frame
  const fanFrame = Math.floor(now / fanSpeed) % 2;
  const fanY = y + Math.floor(h * 0.7);
  const fanSize = zoom * 3;

  for (let fi = 0; fi < 2; fi++) {
    const fx = x + zoom * 3 + fi * zoom * 6;
    // Fan housing.
    ctx.fillStyle = "#0c0c18";
    ctx.fillRect(fx, fanY, fanSize, fanSize);
    // Fan blades (2 frames: + shape and x shape).
    ctx.fillStyle = "#1a1a30";
    if (fanFrame === 0) {
      // + shape.
      ctx.fillRect(fx + zoom, fanY, zoom, fanSize);
      ctx.fillRect(fx, fanY + zoom, fanSize, zoom);
    } else {
      // x shape.
      ctx.fillRect(fx, fanY, zoom, zoom);
      ctx.fillRect(fx + zoom * 2, fanY, zoom, zoom);
      ctx.fillRect(fx + zoom, fanY + zoom, zoom, zoom);
      ctx.fillRect(fx, fanY + zoom * 2, zoom, zoom);
      ctx.fillRect(fx + zoom * 2, fanY + zoom * 2, zoom, zoom);
    }
  }

  // Ground shadow.
  contactShadow(ctx, x, y + h, w, zoom);
  castShadow(ctx, x, y + h, w, h, zoom);
}

// ── Workbench ──────────────────────────────────────────

function drawWorkbench(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zt: number,
  zoom: number,
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

  // Ground shadow.
  contactShadow(ctx, x, y + h + zoom * 3, w, zoom);

  // Small screen on the workbench.
  const screenW = zoom * 8;
  const screenH = zoom * 5;
  const screenX = x + zoom * 2;
  const screenY = y - screenH - zoom;

  // Screen stand — wider base for better proportion.
  ctx.fillStyle = "#141422";
  ctx.fillRect(
    screenX + Math.floor(screenW / 2) - zoom,
    y - zoom,
    zoom * 3,
    zoom,
  );

  // Bezel.
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(
    screenX - zoom,
    screenY - zoom,
    screenW + zoom * 2,
    screenH + zoom * 2,
  );
  // Surface.
  ctx.fillStyle = "#060610";
  ctx.fillRect(screenX, screenY, screenW, screenH);
  // Screen glow — terracotta (opaque cycling).
  const pulse = Math.sin(now / 1200);
  ctx.fillStyle = pulse > 0 ? "#3a2218" : "#2e1a12";
  ctx.fillRect(
    screenX + zoom,
    screenY + zoom,
    screenW - zoom * 2,
    screenH - zoom * 2,
  );
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

  // Pixel tools on workbench surface.
  // Soldering iron (horizontal).
  ctx.fillStyle = "#3a3a50";
  ctx.fillRect(x + zoom * 3, y + h - zoom * 3, zoom * 5, zoom);
  ctx.fillStyle = "#E67E22";
  ctx.fillRect(x + zoom * 8, y + h - zoom * 3, zoom, zoom); // hot tip
  // Wire coil.
  ctx.fillStyle = "#1E7FD8";
  ctx.fillRect(x + zt * 2, y + h - zoom * 4, zoom * 2, zoom * 2);
}

// ── Display panel (wall-mounted, right side) — agent tracker ──

function drawDisplayPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zt: number,
  zoom: number,
  now: number,
  world: RenderContext["world"],
): void {
  const w = Math.floor(zt * 2.5);
  const h = Math.floor(zt * 1.8);
  const theme = world.getRepoTheme();
  const font = `"DM Mono", monospace`;
  const smallFont = Math.max(8, zoom * 2.5);

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
    const maxLines = Math.min(
      history.length,
      Math.floor((screenH - zoom * 5) / lineH),
    );
    const visible = history.slice(-maxLines);
    for (let a = 0; a < visible.length; a++) {
      const entry = visible[a];
      const ay = sy + zoom * 5 + a * lineH;
      ctx.fillStyle = entry.action === "enter" ? "#2ECC71" : "#E74C3C";
      const arrow = entry.action === "enter" ? "\u25B6" : "\u25C0";
      const maxChars = Math.max(
        6,
        Math.floor((screenW - zoom * 4) / (smallFont * 0.6)),
      );
      const label =
        entry.name.length > maxChars
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
  bcX: number,
  bcY: number,
  zt: number,
  zoom: number,
  bcTilesW: number,
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
  bcX: number,
  bcY: number,
  zt: number,
  zoom: number,
  bcTilesW: number,
  width: number,
  height: number,
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
  ctx.fillRect(
    chairX + zoom,
    chairY - zoom * 3,
    zoom * 4,
    Math.max(1, Math.floor(zoom / 2)),
  );
  // Legs.
  ctx.fillStyle = "#101018";
  ctx.fillRect(chairX + zoom, chairY + zoom * 2, zoom, zoom * 2);
  ctx.fillRect(chairX + zoom * 4, chairY + zoom * 2, zoom, zoom * 2);
  // Separate outlines for backrest and seat (cleaner silhouette than a single rect).
  outlineRect(ctx, chairX + zoom, chairY - zoom * 3, zoom * 4, zoom * 3, zoom); // backrest
  outlineRect(ctx, chairX, chairY, zoom * 6, zoom * 2, zoom); // seat
  // Armrests.
  ctx.fillStyle = "#1a1a2a";
  ctx.fillRect(chairX, chairY - zoom, zoom, zoom * 2);
  ctx.fillRect(chairX + zoom * 5, chairY - zoom, zoom, zoom * 2);
  // Ground shadow.
  contactShadow(ctx, chairX, chairY + zoom * 4, zoom * 6, zoom);

  // Crate (left side, near workbench).
  const crateX = Math.floor(bcX - zt * 5);
  const crateY = height - zoom * 10;
  const crateW = zoom * 7;
  const crateH = zoom * 6;
  // Body.
  ctx.fillStyle = "#1e1a14";
  ctx.fillRect(crateX, crateY, crateW, crateH);
  // Wood grain texture.
  ctx.fillStyle = "#221e16";
  for (let ty = zoom; ty < crateH - zoom; ty += zoom * 2) {
    for (let tx = zoom; tx < crateW - zoom; tx += zoom * 2) {
      if (seed(tx * 5 + ty * 9 + 37) > 0.55) {
        ctx.fillRect(crateX + tx, crateY + ty, zoom, zoom);
      }
    }
  }
  // Top highlight.
  ctx.fillStyle = "#2a2418";
  ctx.fillRect(crateX, crateY, crateW, zoom);
  // Shadow on right.
  ctx.fillStyle = "#141210";
  ctx.fillRect(crateX + crateW - zoom, crateY, zoom, crateH);
  // Cross planks.
  ctx.fillStyle = "#24200a";
  ctx.fillRect(
    crateX + zoom,
    crateY + Math.floor(crateH / 2) - Math.max(1, Math.floor(zoom / 2)),
    crateW - zoom * 2,
    zoom,
  );
  ctx.fillRect(
    crateX + Math.floor(crateW / 2) - Math.max(1, Math.floor(zoom / 2)),
    crateY + zoom,
    zoom,
    crateH - zoom * 2,
  );
  // Nails at cross intersection.
  ctx.fillStyle = "#3a3a4a";
  ctx.fillRect(
    crateX + Math.floor(crateW / 2),
    crateY + Math.floor(crateH / 2),
    zoom,
    zoom,
  );
  // Outline.
  outlineRect(ctx, crateX, crateY, crateW, crateH, zoom);
  contactShadow(ctx, crateX, crateY + crateH, crateW, zoom);

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
  contactShadow(ctx, crateRX, crateRY + crateRH, crateRW, zoom);

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

// ── Arsenal Rack (weapon rack + tools merged, wall-mounted left side) ──

function drawWeaponRack(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  L: CaveLayout,
): void {
  const rackX = L.arsenalRack.x;
  const rackY = L.arsenalRack.y;
  const rackW = L.arsenalRack.w;
  const rackH = L.arsenalRack.h;

  // Back board.
  ctx.fillStyle = "#141220";
  ctx.fillRect(rackX, rackY, rackW, rackH);
  ctx.fillStyle = P.HIGHLIGHT;
  ctx.fillRect(rackX, rackY, rackW, zoom);
  outlineRect(ctx, rackX, rackY, rackW, rackH, zoom);

  // Mounting screws — 2 bright corner dots.
  ctx.fillStyle = "#3a3a4a";
  ctx.fillRect(rackX + zoom, rackY + zoom, zoom, zoom);
  ctx.fillRect(rackX + rackW - zoom * 2, rackY + zoom, zoom, zoom);

  // Horizontal pegs (2 rows).
  const pegY1 = rackY + Math.floor(rackH * 0.3);
  const pegY2 = rackY + Math.floor(rackH * 0.7);
  ctx.fillStyle = "#1e1e30";
  ctx.fillRect(rackX + zoom * 2, pegY1, rackW - zoom * 4, zoom);
  ctx.fillRect(rackX + zoom * 2, pegY2, rackW - zoom * 4, zoom);

  // Batarang — boomerang V shape.
  const batX = rackX + zoom * 4;
  ctx.fillStyle = "#2a3a4a";
  // Left arm: diagonal going up-left.
  ctx.fillRect(batX - zoom * 2, pegY1 - zoom * 3, zoom, zoom);
  ctx.fillRect(batX - zoom, pegY1 - zoom * 2, zoom, zoom);
  ctx.fillRect(batX, pegY1 - zoom, zoom * 2, zoom);
  // Right arm: diagonal going up-right.
  ctx.fillRect(batX + zoom * 3, pegY1 - zoom * 3, zoom, zoom);
  ctx.fillRect(batX + zoom * 2, pegY1 - zoom * 2, zoom, zoom);

  // Wrench on bottom peg (merged from Tool Board).
  const grX = rackX + zoom * 5;
  ctx.fillStyle = "#3a3a50";
  ctx.fillRect(grX, pegY2 - zoom * 2, zoom, zoom * 4);
  ctx.fillRect(grX - zoom, pegY2 - zoom * 2, zoom * 3, zoom);
  ctx.fillRect(grX - zoom, pegY2 + zoom, zoom * 3, zoom);
}

// ── Barrel (right side, near crates) ──────────────────

function drawBarrel(
  ctx: CanvasRenderingContext2D,
  bcX: number,
  bcW: number,
  zt: number,
  zoom: number,
  height: number,
): void {
  const bx = bcX + bcW + Math.floor(zt * 3.5);
  const by = height - zoom * 14;
  const bw = zoom * 8;
  const bh = zoom * 10;

  // Body.
  ctx.fillStyle = "#1a1612";
  ctx.fillRect(bx, by, bw, bh);
  // Wood grain texture — vertical dithered lines.
  ctx.fillStyle = "#1e1a14";
  for (let tx = zoom; tx < bw - zoom; tx += zoom * 2) {
    const grainSeed = seed(tx * 13);
    if (grainSeed > 0.3) {
      for (let ty = zoom * 2; ty < bh - zoom * 2; ty += zoom * 2) {
        if (seed(tx * 7 + ty * 11) > 0.5) {
          ctx.fillRect(bx + tx, by + ty, zoom, zoom);
        }
      }
    }
  }
  // Knot detail.
  ctx.fillStyle = "#161210";
  ctx.fillRect(
    bx + Math.floor(bw * 0.4),
    by + Math.floor(bh * 0.5),
    zoom,
    zoom,
  );
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
  // Metal band rivets.
  ctx.fillStyle = "#2a2a3a";
  ctx.fillRect(bx + zoom * 2, by + zoom * 3, zoom, zoom);
  ctx.fillRect(bx + bw - zoom * 3, by + zoom * 3, zoom, zoom);
  // Left highlight.
  ctx.fillStyle = "#201c16";
  ctx.fillRect(bx, by, zoom, bh);
  // Right shadow.
  ctx.fillStyle = "#14120e";
  ctx.fillRect(bx + bw - zoom, by, zoom, bh);
  // Outline.
  outlineRect(ctx, bx, by, bw, bh, zoom);

  // Ground shadow.
  contactShadow(ctx, bx, by + bh, bw, zoom);
}

// ── Map/planning table (left side, in front of workbench area) ──

function drawMapTable(
  ctx: CanvasRenderingContext2D,
  zt: number,
  zoom: number,
  wallH: number,
): void {
  const tx = Math.floor(zt * 1.5);
  const ty = wallH + Math.floor(zt * 2.5);
  const tw = Math.floor(zt * 2);
  // One full tile tall — much more visible than the original zoom*4 sliver.
  const th = zt;

  // Table top surface.
  ctx.fillStyle = "#1a1a28";
  ctx.fillRect(tx, ty, tw, th);
  ctx.fillStyle = P.HIGHLIGHT;
  ctx.fillRect(tx, ty, tw, zoom);
  // Outline.
  outlineRect(ctx, tx, ty, tw, th, zoom);

  // Legs — sturdier (zoom*2 wide, zoom*5 tall).
  ctx.fillStyle = "#121220";
  ctx.fillRect(tx + zoom, ty + th, zoom * 2, zoom * 5);
  ctx.fillRect(tx + tw - zoom * 3, ty + th, zoom * 2, zoom * 5);
  // Ground shadow.
  contactShadow(ctx, tx, ty + th + zoom * 5, tw, zoom);

  // Map/blueprint on table (scrolled paper).
  const mapX = tx + zoom * 2;
  const mapY = ty - zoom * 2;
  const mapW = tw - zoom * 4;
  // Taller blueprint — zoom*5 instead of zoom*3.
  const mapH = zoom * 5;
  ctx.fillStyle = "#1e2028";
  ctx.fillRect(mapX, mapY, mapW, mapH);
  // Grid lines slightly brighter.
  ctx.fillStyle = "#2a3040";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(
      mapX + Math.floor((i * mapW) / 4),
      mapY,
      Math.max(1, Math.floor(zoom / 2)),
      mapH,
    );
  }
  ctx.fillRect(
    mapX,
    mapY + Math.floor(mapH / 2),
    mapW,
    Math.max(1, Math.floor(zoom / 2)),
  );
  // Pin/marker — bright red, zoom*2 x zoom*3.
  ctx.fillStyle = "#E74C3C";
  ctx.fillRect(mapX + Math.floor(mapW * 0.6), mapY + zoom, zoom * 2, zoom * 3);
}

// ── Locker (tall, far right) ──────────────────────────

function drawLocker(
  ctx: CanvasRenderingContext2D,
  zt: number,
  zoom: number,
  wallH: number,
  width: number,
): void {
  const lx = width - Math.floor(zt * 2.2);
  const ly = wallH + zoom * 4;
  const lw = Math.floor(zt * 1.4);
  const lh = Math.floor(zt * 2.8);

  // Body.
  ctx.fillStyle = "#101020";
  ctx.fillRect(lx, ly, lw, lh);
  // Metal brushed texture — horizontal streaks.
  ctx.fillStyle = "#14142a";
  for (let ty = zoom * 2; ty < lh - zoom * 2; ty += zoom * 3) {
    if (seed(ty * 11) > 0.4) {
      ctx.fillRect(
        lx + zoom,
        ly + ty,
        lw - zoom * 2,
        Math.max(1, Math.floor(zoom / 2)),
      );
    }
  }
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
  ctx.fillRect(
    lx + Math.floor(lw / 2) - zoom * 2,
    ly + Math.floor(lh * 0.4),
    zoom,
    zoom * 3,
  );
  ctx.fillRect(
    lx + Math.floor(lw / 2) + zoom,
    ly + Math.floor(lh * 0.4),
    zoom,
    zoom * 3,
  );

  // Ventilation slits (top of each door).
  ctx.fillStyle = "#080812";
  for (let i = 0; i < 3; i++) {
    const sy = ly + zoom * 3 + i * zoom * 2;
    ctx.fillRect(lx + zoom * 2, sy, Math.floor(lw / 2) - zoom * 4, zoom);
    ctx.fillRect(
      lx + Math.floor(lw / 2) + zoom * 2,
      sy,
      Math.floor(lw / 2) - zoom * 4,
      zoom,
    );
  }

  // Feet.
  ctx.fillStyle = "#0c0c1a";
  ctx.fillRect(lx + zoom, ly + lh, zoom * 2, zoom * 2);
  ctx.fillRect(lx + lw - zoom * 3, ly + lh, zoom * 2, zoom * 2);

  // Ground shadow.
  contactShadow(ctx, lx, ly + lh + zoom * 2, lw, zoom);
  castShadow(ctx, lx, ly + lh + zoom * 2, lw, lh, zoom);
}

// ── Whiteboard (wall-mounted) — todo / task board ──

function drawWhiteboard(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  world: RenderContext["world"],
  L: CaveLayout,
): void {
  const bx = L.whiteboardX;
  const by = L.whiteboardY;
  const bw = L.whiteboardW;
  // Board surface height excludes marker tray (zoom*2).
  const bh = bw > 0 ? L.whiteboardH - zoom * 2 : 0;
  const font = `"DM Mono", monospace`;
  const smallFont = Math.max(8, zoom * 2);

  // Board surface.
  ctx.fillStyle = "#1e1e30";
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = "#e8e4da";
  ctx.fillRect(bx + zoom, by + zoom, bw - zoom * 2, bh - zoom * 2);
  outlineRect(ctx, bx, by, bw, bh, zoom);
  // Marker tray.
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(bx, by + bh, bw, zoom * 2);
  outlineRect(
    ctx,
    bx,
    by + bh,
    bw,
    zoom * 2,
    Math.max(1, Math.floor(zoom / 2)),
  );

  // Custom message (priority) or todo content.
  const boardMsg = world.getWhiteboardMessage();
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "left";

  if (boardMsg) {
    // Word-wrap the message on the whiteboard.
    const maxChars = Math.max(
      5,
      Math.floor((bw - zoom * 4) / (smallFont * 0.6)),
    );
    const lineH = Math.max(zoom * 2.5, smallFont + Math.floor(zoom * 0.5));
    const maxLines = Math.floor((bh - zoom * 3) / lineH);
    const words = boardMsg.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (test.length > maxChars) {
        if (current) lines.push(current);
        current =
          word.length > maxChars
            ? word.slice(0, maxChars - 1) + "\u2026"
            : word;
      } else {
        current = test;
      }
      if (lines.length >= maxLines) break;
    }
    if (current && lines.length < maxLines) lines.push(current);

    ctx.fillStyle = "#1a1a30";
    for (let l = 0; l < lines.length; l++) {
      ctx.fillText(lines[l], bx + zoom * 2, by + zoom * 3 + l * lineH);
    }
  } else {
    const todos = world.getTodoList();
    if (todos.length > 0) {
      const lineH = Math.max(zoom * 2.5, smallFont + Math.floor(zoom * 0.5));
      const maxLines = Math.min(
        todos.length,
        Math.floor((bh - zoom * 2) / lineH),
      );
      const visible = todos.slice(0, maxLines);
      for (let t = 0; t < visible.length; t++) {
        const todo = visible[t];
        const ty = by + zoom * 2 + t * lineH;
        const statusColor =
          todo.status === "completed"
            ? "#2ECC71"
            : todo.status === "in_progress"
              ? "#F39C12"
              : "#555570";
        const statusChar =
          todo.status === "completed"
            ? "\u2713"
            : todo.status === "in_progress"
              ? "\u25B6"
              : "\u25CB";
        ctx.fillStyle = statusColor;
        const maxChars = Math.max(
          5,
          Math.floor((bw - zoom * 4) / (smallFont * 0.6)),
        );
        const label =
          todo.content.length > maxChars
            ? todo.content.slice(0, maxChars - 1) + "\u2026"
            : todo.content;
        ctx.fillText(`${statusChar} ${label}`, bx + zoom * 2, ty);
      }
    } else {
      // Fallback: "click to write" hint.
      ctx.fillStyle = "#999990";
      ctx.fillText("click to write", bx + zoom * 2, by + Math.floor(bh / 2));
    }
  }

  // Markers on tray.
  const markerColors = ["#E74C3C", "#1E7FD8", "#2ECC71"];
  for (let i = 0; i < markerColors.length; i++) {
    ctx.fillStyle = markerColors[i];
    ctx.fillRect(
      bx + zoom * 2 + i * zoom * 3,
      by + bh + Math.max(1, Math.floor(zoom / 2)),
      zoom * 2,
      zoom,
    );
  }
}

// ── Scala / Exit (2x2 tile spiral staircase) ──────────

function drawScala(
  ctx: CanvasRenderingContext2D,
  zt: number,
  zoom: number,
  height: number,
): void {
  const sx = zt;
  const sy = height - zt * 3;
  const w = zt * 2;
  const h = zt * 2;

  // Dark hole.
  ctx.fillStyle = "#040408";
  ctx.fillRect(sx, sy, w, h);

  // Metallic steps (3 visible, spiraling).
  const stepH = Math.floor(h / 4);
  ctx.fillStyle = "#2a2a3e";
  ctx.fillRect(sx, sy + stepH, w, zoom * 2);
  ctx.fillStyle = "#222233";
  ctx.fillRect(sx + zoom * 2, sy + stepH * 2, w - zoom * 4, zoom * 2);
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(sx + zoom * 4, sy + stepH * 3, w - zoom * 8, zoom * 2);

  // Center void.
  const voidSize = Math.floor(zt * 0.6);
  ctx.fillStyle = "#020204";
  ctx.fillRect(
    sx + Math.floor((w - voidSize) / 2),
    sy + Math.floor((h - voidSize) / 2),
    voidSize,
    voidSize,
  );

  // Railing outline.
  outlineRect(ctx, sx, sy, w, h, zoom);

  // Down arrow (▼) instead of "EXIT" text.
  ctx.fillStyle = "#444458";
  const arrowX = sx + Math.floor(w / 2);
  const arrowY = sy - zoom * 3;
  const as = Math.max(1, zoom);
  ctx.fillRect(arrowX - as * 2, arrowY, as * 4, as);
  ctx.fillRect(arrowX - as, arrowY + as, as * 2, as);
  ctx.fillRect(arrowX - Math.floor(as / 2), arrowY + as * 2, as, as);
}

// ── Floor cable runs (more life on the floor) ─────────

function drawFloorCableRuns(
  ctx: CanvasRenderingContext2D,
  zt: number,
  zoom: number,
  width: number,
  height: number,
): void {
  // Long cable from far left to center-left (power run).
  const cableY1 = height - zoom * 5;
  ctx.fillStyle = "#0e0e1c";
  ctx.fillRect(zoom * 2, cableY1, Math.floor(zt * 4), zoom);
  // Cable tie dots.
  ctx.fillStyle = "#181830";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(
      zoom * 4 + i * zt,
      cableY1 - Math.max(1, Math.floor(zoom / 2)),
      zoom * 2,
      zoom * 2,
    );
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
  zt: number,
  zoom: number,
  width: number,
  height: number,
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

// ── Orchestrator ───────────────────────────────────────

export function drawAllFurniture(rc: RenderContext): void {
  const { ctx, width, height, now, world, zoom, zt, cols, wallRows, wallH } =
    rc;

  // Batcomputer positioning — read from centralized layout.
  const L = rc.layout;
  const bcX = L.bcX;
  const bcY = L.bcY;
  const bcW = L.bcW;
  const bcTilesW = L.bcTilesW;

  drawCables(ctx, bcX, bcY, zt, zoom, bcTilesW);
  drawServerRack(ctx, L.serverX, L.serverY, zt, zoom, now);

  // Server rack glow overlay (active during Bash commands).
  const reactions = world.getCaveReactions();
  if (reactions.serverGlow) {
    const rackX = L.serverX;
    const rackY = L.serverY;
    ctx.fillStyle = "#1a3a1a";
    ctx.fillRect(
      rackX + zoom,
      rackY + zoom,
      zt * 2 - zoom * 2,
      zt * 3 - zoom * 2,
    );
  }

  drawWorkbench(ctx, L.workbenchX, bcY, zt, zoom, now);

  // Workbench sparks when Bishop/Cardinal are active.
  if (reactions.workbenchSpark) {
    const sparkTimer = Math.floor(now / 400) % 3;
    if (sparkTimer === 0) {
      bus.emit("particle:spawn", {
        preset: "tool-spark",
        x: L.workbenchX + L.workbenchW / 2,
        y: L.workbenchY + zoom * 2,
      });
    }
  }

  drawDisplayPanel(ctx, bcX + bcW + zt, bcY - zt, zt, zoom, now, world);
  drawBatcomputer(ctx, bcX, bcY, zt, zoom, bcTilesW, now, world);

  // Scala / Exit — bottom-left, 2x2 tile.
  drawScala(ctx, zt, zoom, height);

  // Floor objects (crates, chair, debris).
  drawFloorObjects(ctx, bcX, bcY, zt, zoom, bcTilesW, width, height);

  // Floor cable runs.
  drawFloorCableRuns(ctx, zt, zoom, width, height);
  drawFloorScatter(ctx, zt, zoom, width, height);

  // Cave evolution decorations.
  drawEvolutionDecorations(ctx, zoom, zt, width, height, now, world, L);

  // Achievement trophy case (left wall, 5 columns).
  drawTrophyCase(ctx, zoom, now, world, L);

  // Whiteboard (wall-mounted, center-left).
  drawWhiteboard(ctx, zoom, world, L);

  // Arsenal rack (weapon + tools, right wall).
  drawWeaponRack(ctx, zoom, L);

  // Map table (left side floor, in front of workbench).
  drawMapTable(ctx, zt, zoom, wallH);

  // Barrel (right side, near crates).
  drawBarrel(ctx, bcX, bcW, zt, zoom, height);

  // Locker (far right wall).
  drawLocker(ctx, zt, zoom, wallH, width);
}

// ── Cave Evolution Decorations ────────────────────────

function drawEvolutionDecorations(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  zt: number,
  width: number,
  height: number,
  now: number,
  world: RenderContext["world"],
  L: CaveLayout,
): void {
  const level = world.getCaveLevel();
  if (level < 2) return;

  const font = `"DM Mono", monospace`;
  const smallFont = Math.max(8, zoom * 2.5);

  // Level 2+: Trophy on shelf (left wall).
  if (level >= 2) {
    const tx = L.trophyShelf.x;
    const ty = L.trophyShelf.y;
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

  // Level 3+: Achievement plaques on wall (right of trophy case).
  if (level >= 3) {
    const px = L.levelPlaques.x;
    const py = L.levelPlaques.y;
    // Plaque 1.
    ctx.fillStyle = "#2a2a3e";
    ctx.fillRect(px, py, zoom * 6, zoom * 4);
    outlineRect(
      ctx,
      px,
      py,
      zoom * 6,
      zoom * 4,
      Math.max(1, Math.floor(zoom / 2)),
    );
    ctx.fillStyle = "#FFD700";
    ctx.font = `${Math.max(8, zoom * 2)}px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText("100", px + zoom * 3, py + zoom * 3);
  }

  // Level 4+: Banner/flag on wall (center).
  if (level >= 4) {
    const bx = L.levelFlag.x;
    const by = L.levelFlag.y;
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
    ctx.font = `bold ${Math.max(8, zoom * 2)}px ${font}`;
    ctx.textAlign = "left";
    ctx.fillText("250", bx + zoom * 2, by + zoom * 3);
  }

  // Level 5+: Gold accent lines on Batcomputer edges (subtle, not bars).
  if (level >= 5) {
    const brd = Math.max(1, Math.floor(zoom / 2));
    ctx.fillStyle = "#FFD700";
    ctx.fillRect(L.bcX, L.bcY - brd, L.bcW, brd);
    ctx.fillRect(L.bcX, L.bcY + L.bcH, L.bcW, brd);
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

  // ── ProgressionSystem upgrades (permanent, XP-based) ──
  const prog = world.getProgression();

  // Lv3: Repo banner on wall (below trophy case).
  if (prog.hasUpgrade("repo-banner")) {
    const theme = world.getRepoTheme();
    const bannerX = L.repoBanner.x;
    const bannerY = L.repoBanner.y;
    const bannerW = L.repoBanner.w;
    const bannerH = L.repoBanner.h;
    // Banner fabric.
    ctx.fillStyle = theme.accentDark || "#122840";
    ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
    // Accent stripe at top.
    ctx.fillStyle = theme.accent;
    ctx.fillRect(bannerX, bannerY, bannerW, zoom);
    // Repo label.
    ctx.fillStyle = theme.accent;
    ctx.font = `bold ${Math.max(8, zoom * 2.5)}px "DM Mono", monospace`;
    ctx.textAlign = "center";
    ctx.fillText(
      theme.label || "---",
      bannerX + bannerW / 2,
      bannerY + bannerH / 2 + zoom,
    );
    ctx.textAlign = "left";
    // Mounting rod.
    ctx.fillStyle = "#2a2a3e";
    ctx.fillRect(bannerX - zoom, bannerY - zoom, bannerW + zoom * 2, zoom);
  }

  // Lv8: Bat-cat sleeping on server rack.
  if (prog.hasUpgrade("bat-cat")) {
    const rackTopX = L.serverX + Math.floor(L.serverW * 0.2);
    const rackTopY = L.serverY + zoom;
    const catS = Math.max(1, zoom);
    // Body (5x2).
    ctx.fillStyle = "#2a2030";
    ctx.fillRect(rackTopX, rackTopY - catS * 3, catS * 5, catS * 2);
    // Head (2x2).
    ctx.fillStyle = "#322838";
    ctx.fillRect(rackTopX - catS, rackTopY - catS * 4, catS * 2, catS * 2);
    // Ears.
    ctx.fillStyle = "#3a2e40";
    ctx.fillRect(rackTopX - catS, rackTopY - catS * 5, catS, catS);
    ctx.fillRect(rackTopX, rackTopY - catS * 5, catS, catS);
    // Tail (curves right).
    ctx.fillStyle = "#2a2030";
    ctx.fillRect(rackTopX + catS * 5, rackTopY - catS * 2, catS * 2, catS);
    ctx.fillRect(rackTopX + catS * 6, rackTopY - catS * 3, catS, catS);
    // Tail wag (animated — two positions alternating every 800ms).
    const wagFrame = Math.floor(now / 800) % 2;
    if (wagFrame === 1) {
      ctx.fillRect(rackTopX + catS * 7, rackTopY - catS * 3, catS, catS);
    } else {
      ctx.fillRect(rackTopX + catS * 7, rackTopY - catS * 2, catS, catS);
    }
    // Closed eyes (sleeping — just two dark dots).
    ctx.fillStyle = "#1a1020";
    ctx.fillRect(
      rackTopX - catS + Math.floor(catS * 0.3),
      rackTopY - catS * 3,
      catS,
      catS,
    );
  }

  // Lv12: Luminous crystals embedded in cave wall.
  if (prog.hasUpgrade("wall-crystals")) {
    const wH = L.wallH;
    const crystalPositions = [
      { x: width * 0.2, y: wH * 0.6, color: "#2a6a8a" },
      { x: width * 0.65, y: wH * 0.35, color: "#6a2a8a" },
      { x: width * 0.85, y: wH * 0.5, color: "#8a2a5a" },
      { x: width * 0.4, y: wH * 0.7, color: "#2a8a6a" },
    ];
    const crystalPulse = Math.sin(now / 1000) * 0.4 + 0.6;
    for (const cp of crystalPositions) {
      const cx = Math.floor(cp.x);
      const cy = Math.floor(cp.y);
      const cs = Math.max(1, zoom);
      // Crystal shape: triangle pointing up (3 rects stacked).
      ctx.fillStyle = cp.color;
      ctx.fillRect(cx, cy - cs * 3, cs, cs);
      ctx.fillRect(cx - cs, cy - cs * 2, cs * 3, cs);
      ctx.fillRect(cx - cs, cy - cs, cs * 3, cs * 2);
      // Glow halo (pulsing).
      if (crystalPulse > 0.7) {
        ctx.fillStyle = cp.color;
        ctx.fillRect(cx - cs * 2, cy - cs, cs, cs);
        ctx.fillRect(cx + cs * 2, cy - cs, cs, cs);
      }
    }
  }

  // Lv35: Gold trim on all furniture.
  if (prog.hasUpgrade("gold-trim")) {
    ctx.fillStyle = "#FFD700";
    ctx.fillRect(L.bcX, L.bcY, L.bcW, zoom);
    ctx.fillRect(L.serverX, L.serverY, L.serverW, zoom);
    ctx.fillRect(L.workbenchX, L.workbenchY, L.workbenchW, zoom);
  }

  // Cave level label (bottom-left).
  if (level >= 2) {
    ctx.fillStyle = "#333344";
    ctx.font = `${smallFont}px ${font}`;
    ctx.textAlign = "left";
    ctx.fillText(
      `LV${level} ${world.getCaveLevelName()}`,
      zoom * 3,
      height - zoom * 3,
    );
  }
}

// ── Achievement Trophy Case ─────────────────────────────

// TIER_COLORS and ICON_PIXELS imported from gamification.ts

function drawTrophyCase(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  now: number,
  world: RenderContext["world"],
  L: CaveLayout,
): void {
  const unlocked = world.getUnlockedAchievements();
  const { slotSize, cols, caseW, caseH, caseX, caseY } = L.trophyCase;

  // XL upgrade: golden frame accent.
  const isXl = world.getProgression().hasUpgrade("trophy-case-xl");

  // Glass case background.
  ctx.save();
  ctx.fillStyle = "#0a0a18";
  ctx.globalAlpha = 0.85;
  ctx.fillRect(caseX, caseY, caseW, caseH);
  ctx.restore();

  // Case border (golden if XL).
  const brd = Math.max(1, Math.floor(zoom / 2));
  ctx.fillStyle = isXl ? "#FFD700" : "#2a2a3e";
  ctx.fillRect(caseX, caseY, caseW, brd);
  ctx.fillRect(caseX, caseY + caseH - brd, caseW, brd);
  ctx.fillRect(caseX, caseY, brd, caseH);
  ctx.fillRect(caseX + caseW - brd, caseY, brd, caseH);

  // "TROPHIES" label.
  ctx.fillStyle = isXl ? "#FFD700" : "#555568";
  ctx.font = `${Math.max(5, zoom * 2)}px "DM Mono", monospace`;
  ctx.textAlign = "center";
  ctx.fillText("TROPHIES", caseX + caseW / 2, caseY + zoom * 2.2);

  // Header padding before slots: zoom*3 (unchanged from v3).
  const headerPad = zoom * 3;

  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const sx = caseX + L.trophyCase.pad + col * slotSize;
    const sy = caseY + headerPad + row * slotSize;
    const a = ACHIEVEMENTS[i];
    const isUnlocked = unlocked.some((u) => u.id === a.id);

    if (isUnlocked) {
      const color = TIER_COLORS[a.tier] || "#888899";
      const px = Math.max(1, zoom);
      const pixels = ICON_PIXELS[a.icon] || ICON_PIXELS.crystal;

      // Glow.
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.15 + Math.sin(now / 800 + i) * 0.05;
      ctx.fillRect(sx, sy, slotSize - zoom, slotSize - zoom);
      ctx.restore();

      // Legendary tier: pulsing red glow halo.
      if (a.tier === "legendary") {
        const glowPulse = Math.sin(now / 600 + i * 2) * 0.5 + 0.5;
        if (glowPulse > 0.6) {
          ctx.fillStyle = "#4a1a1a";
          ctx.fillRect(
            sx - zoom,
            sy - zoom,
            slotSize + zoom * 2,
            slotSize + zoom * 2,
          );
        }
      }

      // Icon pixels — centered in slot.
      const iconSize = px * 4;
      const offsetX = Math.floor((slotSize - zoom - iconSize) / 2);
      const offsetY = Math.floor((slotSize - zoom - iconSize) / 2);
      ctx.fillStyle = color;
      for (const [dx, dy] of pixels) {
        ctx.fillRect(sx + offsetX + dx * px, sy + offsetY + dy * px, px, px);
      }
    } else {
      ctx.fillStyle = "#111118";
      ctx.fillRect(
        sx + brd,
        sy + brd,
        slotSize - zoom - brd * 2,
        slotSize - zoom - brd * 2,
      );
    }
  }
}
