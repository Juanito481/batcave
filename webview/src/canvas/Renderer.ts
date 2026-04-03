import { BatCaveWorld } from "../world/BatCave";

/**
 * Canvas 2D renderer for the Bat Cave pixel art environment.
 *
 * Pokemon FireRed style: palette-based colors (no rgba transparency),
 * outlined furniture, textured tiles, directional shading.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private world: BatCaveWorld;
  private width = 0;
  private height = 0;

  // ── Cave palette (opaque, no transparency) ─────────────
  private static readonly BG = "#0a0a12";
  private static readonly FLOOR_A = "#13131e";
  private static readonly FLOOR_B = "#161624";
  private static readonly FLOOR_DARK = "#0e0e18";
  private static readonly FLOOR_SPECK = "#1c1c2a";
  private static readonly WALL_TOP = "#0c0c18";
  private static readonly WALL_MID = "#161628";
  private static readonly WALL_BOT = "#1a1a30";
  private static readonly WALL_DARK = "#08081a";
  private static readonly WALL_LIGHT = "#1e1e34";
  private static readonly WALL_EDGE = "#1e1e30";
  private static readonly ACCENT = "#1E7FD8";
  private static readonly OUTLINE = "#060410";
  private static readonly HIGHLIGHT = "#222238";

  private static readonly TILE = 16;
  private static readonly LED_COLORS = ["#2ECC71", "#1E7FD8", "#E74C3C", "#F39C12", "#2ECC71"];

  // Seeded values for deterministic procedural detail.
  private seeds: number[] = [];

  constructor(ctx: CanvasRenderingContext2D, world: BatCaveWorld) {
    this.ctx = ctx;
    this.world = world;
    for (let i = 0; i < 400; i++) {
      this.seeds[i] = Math.sin(i * 127.1 + 311.7) * 0.5 + 0.5;
    }
  }

  private seed(i: number): number {
    return this.seeds[((i % 400) + 400) % 400];
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const T = Renderer.TILE;
    const zoom = Math.max(2, Math.min(
      Math.floor(width / (16 * T)),
      Math.floor(height / (8 * T))
    ));
    const zt = T * zoom;
    const wallRows = height > zt * 10 ? 3 : 2;
    this.world.setDimensions(width, height, wallRows * zt);
  }

  update(deltaMs: number): void {
    this.world.update(deltaMs);
  }

  render(): void {
    const ctx = this.ctx;
    const T = Renderer.TILE;
    const zoom = Math.max(2, Math.min(
      Math.floor(this.width / (16 * T)),
      Math.floor(this.height / (8 * T))
    ));
    const zt = T * zoom;
    const cols = Math.ceil(this.width / zt) + 1;
    const rows = Math.ceil(this.height / zt) + 1;
    const wallRows = this.height > zt * 10 ? 3 : 2;
    const wallH = wallRows * zt;

    // ── Clear ──
    ctx.fillStyle = Renderer.BG;
    ctx.fillRect(0, 0, this.width, this.height);

    // ── Floor tiles (textured) ──
    for (let y = wallRows; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        this.drawFloorTile(ctx, x * zt, y * zt, zt, zoom, (x + y) % 2 === 0, x * 17 + y * 31);
      }
    }

    // ── Cave ceiling (textured wall rows) ──
    for (let x = 0; x < cols; x++) {
      for (let r = 0; r < wallRows; r++) {
        this.drawWallTile(ctx, x * zt, r * zt, zt, zoom, r, wallRows, x * 13 + r * 7);
      }
    }

    // ── Stalactites ──
    this.drawStalactites(ctx, cols, zt, zoom, wallH);

    // Wall bottom edge (opaque, no rgba).
    ctx.fillStyle = Renderer.OUTLINE;
    ctx.fillRect(0, wallH, this.width, zoom);

    // ── Ambient (behind furniture) ──
    this.world.getAmbient().draw(ctx, zoom);

    // ── Furniture ──
    const bcTilesW = Math.min(5, cols - 2);
    const bcW = zt * bcTilesW;
    const bcX = Math.floor((this.width - bcW) / 2);
    const bcY = wallH + zoom * 2;

    this.drawCables(ctx, bcX, bcY, zt, zoom, bcTilesW);
    this.drawServerRack(ctx, bcX - zt * 3, Math.floor(bcY - zt * 1.5), zt, zoom);
    this.drawWorkbench(ctx, Math.floor(bcX - zt * 6.5), bcY, zt, zoom);
    this.drawBookshelf(ctx, bcX + bcW + zt, bcY - zt, zt, zoom);
    this.drawBatcomputer(ctx, bcX, bcY, zt, zoom, bcTilesW);

    // ── Characters (Y-sorted) ──
    const agents = this.world.getAgentCharacters();
    const allChars = [this.world.claude, ...agents].sort((a, b) => a.y - b.y);
    for (const char of allChars) {
      char.draw(ctx, zoom);
    }

    // ── HUD ──
    this.drawHUD(ctx, zoom);
  }

  // ── Floor tile with texture ────────────────────────────

  private drawFloorTile(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, zt: number, zoom: number,
    isLight: boolean, seedIdx: number,
  ): void {
    // Base fill.
    ctx.fillStyle = isLight ? Renderer.FLOOR_B : Renderer.FLOOR_A;
    ctx.fillRect(x, y, zt, zt);

    const s1 = this.seed(seedIdx);
    const s2 = this.seed(seedIdx + 37);
    const s3 = this.seed(seedIdx + 71);

    // Dark specks (dirt, cracks).
    ctx.fillStyle = Renderer.FLOOR_DARK;
    if (s1 > 0.55) ctx.fillRect(x + zoom * 2, y + zoom * 3, zoom, zoom);
    if (s2 > 0.65) ctx.fillRect(x + zoom * 5, y + zoom * 1, zoom, zoom);
    if (s1 > 0.8 && s2 > 0.4) {
      // Small crack.
      ctx.fillRect(x + zoom * 3, y + zoom * 5, zoom * 2, zoom);
    }

    // Light mineral speck.
    ctx.fillStyle = Renderer.FLOOR_SPECK;
    if (s3 > 0.82) ctx.fillRect(x + zoom * 4, y + zoom * 2, zoom, zoom);
    if (s1 > 0.9) ctx.fillRect(x + zoom * 1, y + zoom * 6, zoom, zoom);
  }

  // ── Wall tile with rock texture ────────────────────────

  private drawWallTile(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, zt: number, zoom: number,
    row: number, totalRows: number, seedIdx: number,
  ): void {
    const colors = totalRows === 3
      ? [Renderer.WALL_TOP, Renderer.WALL_MID, Renderer.WALL_BOT]
      : [Renderer.WALL_TOP, Renderer.WALL_MID];
    ctx.fillStyle = colors[row];
    ctx.fillRect(x, y, zt, zt);

    // Rock texture: scattered darker/lighter pixels.
    for (let p = 0; p < 4; p++) {
      const s = this.seed(seedIdx + p * 41);
      const s2 = this.seed(seedIdx + p * 53 + 17);
      const px = Math.floor(s * (zt - zoom));
      const py = Math.floor(s2 * (zt - zoom));

      if (s > 0.4) {
        ctx.fillStyle = Renderer.WALL_DARK;
        ctx.fillRect(x + px, y + py, zoom, zoom);
      }
      if (s2 > 0.7) {
        ctx.fillStyle = Renderer.WALL_LIGHT;
        ctx.fillRect(x + Math.floor(s2 * (zt - zoom * 2)), y + Math.floor(s * (zt - zoom * 2)), zoom, zoom);
      }
    }

    // Horizontal seam at bottom of each row.
    if (row < totalRows - 1) {
      ctx.fillStyle = Renderer.WALL_DARK;
      ctx.fillRect(x, y + zt - zoom, zt, zoom);
    }
  }

  // ── Stalactites ────────────────────────────────────────

  private drawStalactites(
    ctx: CanvasRenderingContext2D,
    cols: number, zt: number, zoom: number, wallH: number,
  ): void {
    for (let x = 0; x < cols; x++) {
      const s1 = this.seed(x);
      const s2 = this.seed(x * 3 + 7);

      if (x % 3 === 0) {
        const h = Math.floor(zoom * (5 + s1 * 8));
        const w = zoom * 2;
        const sx = x * zt + zt / 2 - w / 2;

        // Body.
        ctx.fillStyle = Renderer.WALL_EDGE;
        ctx.fillRect(sx, wallH, w, h);
        // Tip (narrower).
        ctx.fillStyle = Renderer.WALL_MID;
        ctx.fillRect(sx + Math.floor(w / 4), wallH + h, Math.ceil(w / 2), zoom);
        // Highlight on left edge.
        ctx.fillStyle = Renderer.WALL_LIGHT;
        ctx.fillRect(sx, wallH, Math.max(1, Math.floor(zoom / 2)), h);
        // Shadow on right edge.
        ctx.fillStyle = Renderer.WALL_DARK;
        ctx.fillRect(sx + w - Math.max(1, Math.floor(zoom / 2)), wallH, Math.max(1, Math.floor(zoom / 2)), h);
      }

      if (x % 3 !== 0 && s2 > 0.4) {
        const h = Math.floor(zoom * (2 + s2 * 4));
        ctx.fillStyle = Renderer.WALL_EDGE;
        ctx.fillRect(x * zt + zt / 2, wallH, zoom, h);
      }
    }
  }

  // ── Outline helper ─────────────────────────────────────

  private drawOutlineRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, zoom: number,
  ): void {
    ctx.fillStyle = Renderer.OUTLINE;
    ctx.fillRect(x, y, w, zoom);           // top
    ctx.fillRect(x, y + h - zoom, w, zoom); // bottom
    ctx.fillRect(x, y, zoom, h);            // left
    ctx.fillRect(x + w - zoom, y, zoom, h); // right
  }

  // ── Batcomputer ────────────────────────────────────────

  private drawBatcomputer(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, zt: number, zoom: number, tilesW: number,
  ): void {
    const totalW = zt * tilesW;
    const totalH = Math.floor(zt * 1.5);

    // Desk body.
    ctx.fillStyle = "#1c1c2e";
    ctx.fillRect(x, y, totalW, totalH);
    // Desk top edge highlight.
    ctx.fillStyle = Renderer.HIGHLIGHT;
    ctx.fillRect(x, y, totalW, zoom);
    // Desk shadow on bottom.
    ctx.fillStyle = "#141422";
    ctx.fillRect(x, y + totalH - zoom, totalW, zoom);
    // Outline.
    this.drawOutlineRect(ctx, x, y, totalW, totalH, zoom);

    // 3 screens.
    const gap = Math.floor(zoom * 3);
    const screenAreaW = totalW - gap * 4;
    const sw = Math.floor(screenAreaW / 3);
    const sh = totalH - gap * 2;

    const screenColors = ["#1a3a1a", Renderer.ACCENT, "#3a1a1a"];
    const screenLabels = ["SYS", "MAIN", "LOG"];

    for (let i = 0; i < 3; i++) {
      const sx = x + gap + i * (sw + gap);

      // Bezel.
      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(sx - zoom, y + gap - zoom, sw + zoom * 2, sh + zoom * 2);

      // Screen surface.
      ctx.fillStyle = "#060610";
      ctx.fillRect(sx, y + gap, sw, sh);

      // Screen glow (opaque, blended via solid color cycling).
      const phase = Math.sin(Date.now() / 800 + i * 2.1);
      const glowBase = screenColors[i];
      const glow = phase > 0 ? lightenHex(glowBase, phase * 0.15) : glowBase;
      ctx.fillStyle = glow;
      ctx.fillRect(sx + zoom, y + gap + zoom, sw - zoom * 2, sh - zoom * 2);

      // Scanlines (opaque dark bands).
      ctx.fillStyle = "#040408";
      for (let sl = 0; sl < sh; sl += zoom * 2) {
        ctx.fillRect(sx, y + gap + sl, sw, zoom);
      }

      // Screen label.
      ctx.fillStyle = screenColors[i];
      ctx.font = `bold ${Math.max(6, zoom * 3)}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText(screenLabels[i], sx + sw / 2, y + gap + sh - zoom * 2);
    }

    // Desk legs.
    ctx.fillStyle = "#141424";
    const legW = zoom * 2;
    ctx.fillRect(x + gap, y + totalH, legW, zoom * 3);
    ctx.fillRect(x + totalW - gap - legW, y + totalH, legW, zoom * 3);
  }

  // ── Server rack ────────────────────────────────────────

  private drawServerRack(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, zt: number, zoom: number,
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
    ctx.fillStyle = Renderer.HIGHLIGHT;
    ctx.fillRect(x, y, w, zoom);
    // Outline.
    this.drawOutlineRect(ctx, x, y, w, h, zoom);

    // Rack unit dividers.
    ctx.fillStyle = "#1a1a2e";
    const units = 5;
    const unitH = Math.floor((h - zoom * 2) / units);
    for (let i = 1; i < units; i++) {
      ctx.fillRect(x + zoom * 2, y + zoom + i * unitH, w - zoom * 4, zoom);
    }

    // Blinking LEDs (opaque).
    const now = Date.now();
    const ledColors = Renderer.LED_COLORS;
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

  private drawWorkbench(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, zt: number, zoom: number,
  ): void {
    const w = zt * 3;
    const h = Math.floor(zt * 1.5);

    // Table top.
    ctx.fillStyle = "#1a1a2a";
    ctx.fillRect(x, y, w, zoom * 2);
    ctx.fillStyle = Renderer.HIGHLIGHT;
    ctx.fillRect(x, y, w, zoom);
    // Table body.
    ctx.fillStyle = "#141422";
    ctx.fillRect(x, y + zoom * 2, w, h - zoom * 2);
    // Outline.
    this.drawOutlineRect(ctx, x, y, w, h, zoom);

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
    const pulse = Math.sin(Date.now() / 1200);
    ctx.fillStyle = pulse > 0 ? "#3a2218" : "#2e1a12";
    ctx.fillRect(screenX + zoom, screenY + zoom, screenW - zoom * 2, screenH - zoom * 2);
    // Scanlines.
    ctx.fillStyle = "#040408";
    for (let sl = 0; sl < screenH; sl += zoom * 2) {
      ctx.fillRect(screenX, screenY + sl, screenW, zoom);
    }

    // Small items on table surface.
    ctx.fillStyle = Renderer.HIGHLIGHT;
    ctx.fillRect(x + w - zoom * 6, y - zoom, zoom * 3, zoom);
    ctx.fillStyle = "#2a2a40";
    ctx.fillRect(x + w - zoom * 3, y - zoom, zoom * 2, zoom);
  }

  // ── Bookshelf ──────────────────────────────────────────

  private drawBookshelf(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, zt: number, zoom: number,
  ): void {
    const w = zt * 2;
    const h = Math.floor(zt * 2.5);

    // Frame.
    ctx.fillStyle = "#181828";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = Renderer.HIGHLIGHT;
    ctx.fillRect(x, y, w, zoom);
    ctx.fillRect(x, y, zoom, h);
    // Shadow on right.
    ctx.fillStyle = "#101020";
    ctx.fillRect(x + w - zoom, y, zoom, h);
    // Outline.
    this.drawOutlineRect(ctx, x, y, w, h, zoom);

    // Shelf dividers.
    const shelves = 3;
    const shelfH = Math.floor((h - zoom) / shelves);
    ctx.fillStyle = "#1e1e30";
    for (let i = 1; i <= shelves; i++) {
      ctx.fillRect(x + zoom, y + i * shelfH, w - zoom * 2, zoom);
    }

    // Books (opaque colors, with spine highlight).
    const bookColors = [
      Renderer.ACCENT, "#D97757", "#2ECC71", "#9B59B6",
      "#E74C3C", "#F39C12", "#1ABC9C", Renderer.ACCENT,
      "#D97757", "#3498DB", "#E67E22", "#8E44AD",
    ];
    let bookIdx = 0;
    for (let s = 0; s < shelves; s++) {
      const shelfTop = y + s * shelfH + zoom;
      const shelfBottom = y + (s + 1) * shelfH;
      const maxBookH = shelfBottom - shelfTop - zoom;
      let bx = x + zoom * 2;
      const shelfEndX = x + w - zoom * 2;

      while (bx < shelfEndX - zoom) {
        const bookW = zoom + Math.floor(this.seed(bookIdx * 7) * zoom);
        const bookH = Math.floor(maxBookH * (0.7 + this.seed(bookIdx * 13 + 3) * 0.3));
        if (bx + bookW > shelfEndX) break;

        // Book body.
        ctx.fillStyle = darkenHex(bookColors[bookIdx % bookColors.length], 0.3);
        ctx.fillRect(bx, shelfBottom - bookH, bookW, bookH);
        // Book face (lighter).
        ctx.fillStyle = bookColors[bookIdx % bookColors.length];
        ctx.fillRect(bx, shelfBottom - bookH, bookW - Math.max(1, Math.floor(zoom / 3)), bookH);
        // Spine highlight.
        ctx.fillStyle = lightenHex(bookColors[bookIdx % bookColors.length], 0.25);
        ctx.fillRect(bx, shelfBottom - bookH, Math.max(1, Math.floor(zoom / 2)), bookH);

        bx += bookW + Math.max(1, Math.floor(zoom / 2));
        bookIdx++;
      }
    }
  }

  // ── Cables ─────────────────────────────────────────────

  private drawCables(
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

  // ── HUD ────────────────────────────────────────────────

  private drawHUD(ctx: CanvasRenderingContext2D, zoom: number): void {
    const stats = this.world.getUsageStats();
    const pad = zoom * 4;
    const barW = zoom * 40;
    const x = this.width - barW - pad * 2;
    const y = pad;
    const panelH = zoom * 40;

    // Panel background (opaque).
    ctx.fillStyle = "#08080f";
    ctx.fillRect(x - pad, y - pad, barW + pad * 2, panelH);
    // Panel top accent line.
    ctx.fillStyle = "#152a44";
    ctx.fillRect(x - pad, y - pad, barW + pad * 2, zoom);

    // Title.
    ctx.fillStyle = Renderer.ACCENT;
    ctx.font = `bold ${zoom * 5}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText("BAT CAVE", x, y + zoom * 4);

    // Context fill bar.
    const pct = stats ? stats.contextFillPct / 100 : 0;
    const barColor = pct < 0.5 ? "#2ECC71" : pct < 0.8 ? "#F39C12" : "#E74C3C";
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(x, y + zoom * 7, barW, zoom * 3);
    ctx.fillStyle = barColor;
    ctx.fillRect(x, y + zoom * 7, barW * pct, zoom * 3);

    // Counters.
    ctx.fillStyle = "#8888AA";
    ctx.font = `${zoom * 4}px monospace`;
    const lineH = zoom * 5;
    const startY = y + zoom * 14;
    ctx.fillText(`CTX ${stats?.contextFillPct ?? 0}%`, x, startY);
    ctx.fillText(`MSG ${stats?.messagesThisSession ?? 0}`, x, startY + lineH);
    ctx.fillText(`TOOLS ${stats?.toolCallsThisSession ?? 0}`, x, startY + lineH * 2);
    ctx.fillText(`AGENTS ${stats?.agentsSpawnedThisSession ?? 0}`, x, startY + lineH * 3);

    // State indicator (bottom-left).
    const state = this.world.getClaudeState();
    const stateColor: Record<string, string> = {
      idle: "#555566", thinking: Renderer.ACCENT, writing: "#2ECC71",
    };
    ctx.fillStyle = stateColor[state] || "#555566";
    ctx.fillRect(pad, this.height - pad - zoom * 6, zoom * 3, zoom * 3);
    ctx.fillStyle = "#AAAACC";
    ctx.font = `${zoom * 4}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText(state.toUpperCase(), pad + zoom * 5, this.height - pad - zoom * 4);
  }
}

// ── Module-level color helpers (no rgba, opaque only) ────

function darkenHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 0xff) * (1 - amount);
  const g = ((n >> 8) & 0xff) * (1 - amount);
  const b = (n & 0xff) * (1 - amount);
  return "#" + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
}

function lightenHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 0xff);
  const g = ((n >> 8) & 0xff);
  const b = (n & 0xff);
  return "#" + (
    (1 << 24) |
    (Math.round(r + (255 - r) * amount) << 16) |
    (Math.round(g + (255 - g) * amount) << 8) |
    Math.round(b + (255 - b) * amount)
  ).toString(16).slice(1);
}
