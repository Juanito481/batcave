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

    // ── Stalagmites (from floor, before furniture) ──
    this.drawStalagmites(ctx, cols, zt, zoom);

    // ── Wall details (pipes, LED strip, panels) ──
    this.drawWallDetails(ctx, zt, zoom, wallH);

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

    // ── Floor objects (crates, chair, debris) ──
    this.drawFloorObjects(ctx, bcX, bcY, zt, zoom, bcTilesW);

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
      ctx.font = `bold ${Math.max(6, zoom * 3)}px "DM Mono", monospace`;
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
    // Desaturated, darker book colors — Fox palette sensibility.
    const bookColors = [
      "#1a5a8a", "#8a4a3a", "#2a7a4a", "#5a3a6a",
      "#7a2a2a", "#8a6a2a", "#2a6a5a", "#1a5a8a",
      "#8a4a3a", "#2a4a7a", "#7a5a2a", "#4a2a5a",
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

  // ── Stalagmites (from floor) ────────────────────────────

  private drawStalagmites(
    ctx: CanvasRenderingContext2D,
    cols: number, zt: number, zoom: number,
  ): void {
    for (let x = 0; x < cols; x++) {
      const s1 = this.seed(x * 5 + 43);
      const s2 = this.seed(x * 7 + 89);

      // Every 4-5 tiles, a stalagmite from the floor.
      if (x % 4 === 2 && s1 > 0.3) {
        const h = Math.floor(zoom * (3 + s1 * 6));
        const w = Math.floor(zoom * (1.5 + s2));
        const sx = x * zt + zt / 2 - Math.floor(w / 2);
        const baseY = this.height;

        // Body.
        ctx.fillStyle = Renderer.WALL_EDGE;
        ctx.fillRect(sx, baseY - h, w, h);
        // Tip (narrower).
        ctx.fillStyle = Renderer.WALL_MID;
        ctx.fillRect(sx + Math.floor(w / 4), baseY - h - zoom, Math.ceil(w / 2), zoom);
        // Highlight on left.
        ctx.fillStyle = Renderer.WALL_LIGHT;
        ctx.fillRect(sx, baseY - h, Math.max(1, Math.floor(zoom / 2)), h);
        // Shadow on right.
        ctx.fillStyle = Renderer.WALL_DARK;
        ctx.fillRect(sx + w - Math.max(1, Math.floor(zoom / 2)), baseY - h, Math.max(1, Math.floor(zoom / 2)), h);
      }

      // Smaller rubble between stalagmites.
      if (x % 4 !== 2 && s2 > 0.65) {
        const h = Math.floor(zoom * (1 + s1 * 2));
        ctx.fillStyle = Renderer.WALL_EDGE;
        ctx.fillRect(x * zt + zt / 2, this.height - h, zoom, h);
      }
    }
  }

  // ── Wall details (pipes, LED strip, panels) ───────────

  private drawWallDetails(
    ctx: CanvasRenderingContext2D,
    zt: number, zoom: number, wallH: number,
  ): void {
    // Horizontal pipe running along the wall.
    const pipeY = wallH - Math.floor(zt * 0.3);
    ctx.fillStyle = "#141428";
    ctx.fillRect(0, pipeY, this.width, zoom * 2);
    // Pipe highlight (top edge).
    ctx.fillStyle = Renderer.HIGHLIGHT;
    ctx.fillRect(0, pipeY, this.width, Math.max(1, Math.floor(zoom / 2)));
    // Pipe shadow (bottom edge).
    ctx.fillStyle = "#0a0a18";
    ctx.fillRect(0, pipeY + zoom * 2, this.width, Math.max(1, Math.floor(zoom / 2)));

    // Pipe brackets every few tiles.
    for (let x = zt * 2; x < this.width - zt; x += zt * 3) {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(x, pipeY - zoom, zoom * 2, zoom * 4);
      ctx.fillStyle = Renderer.OUTLINE;
      ctx.fillRect(x, pipeY - zoom, zoom * 2, Math.max(1, Math.floor(zoom / 2)));
    }

    // LED strip along wall bottom — subtle accent glow.
    const ledY = wallH - zoom;
    const now = Date.now();
    for (let x = 0; x < this.width; x += zoom * 6) {
      const phase = Math.sin(now / 1200 + x * 0.01);
      ctx.fillStyle = phase > 0.3 ? "#122840" : "#0e1e30";
      ctx.fillRect(x, ledY, zoom * 4, zoom);
    }

    // Wall-mounted monitor (right side).
    const monX = this.width - zt * 4;
    const monY = Math.floor(wallH * 0.25);
    const monW = zt * 2;
    const monH = Math.floor(zt * 1.2);

    // Bezel.
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(monX - zoom, monY - zoom, monW + zoom * 2, monH + zoom * 2);
    // Screen.
    ctx.fillStyle = "#060610";
    ctx.fillRect(monX, monY, monW, monH);
    // Content — dark green terminal look.
    const monPulse = Math.sin(now / 1500 + 3);
    ctx.fillStyle = monPulse > 0 ? "#0a2a0a" : "#081e08";
    ctx.fillRect(monX + zoom, monY + zoom, monW - zoom * 2, monH - zoom * 2);
    // Scanlines.
    ctx.fillStyle = "#040408";
    for (let sl = 0; sl < monH; sl += zoom * 2) {
      ctx.fillRect(monX, monY + sl, monW, Math.max(1, Math.floor(zoom / 2)));
    }
    // Mount bracket.
    ctx.fillStyle = "#141428";
    ctx.fillRect(monX + Math.floor(monW / 2) - zoom, monY + monH, zoom * 2, zoom * 2);
  }

  // ── Floor objects (crates, chair, debris) ─────────────

  private drawFloorObjects(
    ctx: CanvasRenderingContext2D,
    bcX: number, bcY: number, zt: number, zoom: number, bcTilesW: number,
  ): void {
    const bcW = zt * bcTilesW;
    const bcBottom = bcY + Math.floor(zt * 1.5) + zoom * 3;

    // Chair in front of batcomputer.
    const chairX = Math.floor(bcX + bcW / 2 - zoom * 3);
    const chairY = bcBottom + zoom * 4;
    // Seat.
    ctx.fillStyle = "#1a1a2a";
    ctx.fillRect(chairX, chairY, zoom * 6, zoom * 2);
    ctx.fillStyle = Renderer.HIGHLIGHT;
    ctx.fillRect(chairX, chairY, zoom * 6, Math.max(1, Math.floor(zoom / 2)));
    // Backrest.
    ctx.fillStyle = "#161624";
    ctx.fillRect(chairX + zoom, chairY - zoom * 3, zoom * 4, zoom * 3);
    ctx.fillStyle = Renderer.HIGHLIGHT;
    ctx.fillRect(chairX + zoom, chairY - zoom * 3, zoom * 4, Math.max(1, Math.floor(zoom / 2)));
    // Legs.
    ctx.fillStyle = "#101018";
    ctx.fillRect(chairX + zoom, chairY + zoom * 2, zoom, zoom * 2);
    ctx.fillRect(chairX + zoom * 4, chairY + zoom * 2, zoom, zoom * 2);
    // Outline.
    this.drawOutlineRect(ctx, chairX, chairY - zoom * 3, zoom * 6, zoom * 7, zoom);

    // Crate (left side, near workbench).
    const crateX = Math.floor(bcX - zt * 5);
    const crateY = this.height - zoom * 10;
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
    this.drawOutlineRect(ctx, crateX, crateY, crateW, crateH, zoom);

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
    this.drawOutlineRect(ctx, crate2X, crate2Y, crate2W, crate2H, zoom);

    // Crate (right side, near bookshelf).
    const crateRX = bcX + bcW + zt * 3 + zoom * 2;
    const crateRY = this.height - zoom * 8;
    const crateRW = zoom * 6;
    const crateRH = zoom * 5;
    ctx.fillStyle = "#1a1614";
    ctx.fillRect(crateRX, crateRY, crateRW, crateRH);
    ctx.fillStyle = "#242018";
    ctx.fillRect(crateRX, crateRY, crateRW, zoom);
    ctx.fillStyle = "#121010";
    ctx.fillRect(crateRX + crateRW - zoom, crateRY, zoom, crateRH);
    this.drawOutlineRect(ctx, crateRX, crateRY, crateRW, crateRH, zoom);

    // Floor debris / scattered tools.
    const debrisSeeds = [17, 53, 89, 127, 163];
    for (const dSeed of debrisSeeds) {
      const s = this.seed(dSeed);
      const dx = s * (this.width - zt * 2) + zt;
      const dy = this.height - zoom * (2 + s * 3);
      ctx.fillStyle = s > 0.5 ? "#1a1a28" : "#181822";
      ctx.fillRect(Math.floor(dx), Math.floor(dy), zoom, zoom);
    }

    // Floor cable running from server rack area.
    const cableStartX = Math.floor(bcX - zt * 2);
    const cableEndX = Math.floor(bcX - zt * 5.5);
    const cableY = this.height - zoom * 3;
    ctx.fillStyle = "#0e0e1c";
    ctx.fillRect(cableEndX, cableY, cableStartX - cableEndX, zoom);
    // Cable connector dot.
    ctx.fillStyle = "#1a2a1a";
    ctx.fillRect(cableEndX, cableY - zoom, zoom * 2, zoom * 3);
  }

  // ── HUD ────────────────────────────────────────────────

  private drawHUD(ctx: CanvasRenderingContext2D, zoom: number): void {
    const stats = this.world.getUsageStats();
    const pad = zoom * 4;
    const barW = zoom * 44;
    const x = this.width - barW - pad * 2;
    const y = pad;
    const font = `"DM Mono", monospace`;
    const smallFont = Math.max(6, zoom * 3.5);
    const medFont = Math.max(7, zoom * 4);
    const bigFont = Math.max(8, zoom * 5);
    const lineH = zoom * 5;

    // ── Panel background ──
    const activeAgentNames = this.world.getActiveAgentNames();
    const agentListH = activeAgentNames.length > 0 ? (activeAgentNames.length + 1) * lineH : 0;
    const panelH = zoom * 46 + agentListH;

    ctx.fillStyle = "#08080f";
    ctx.fillRect(x - pad, y - pad, barW + pad * 2, panelH);
    // Left accent border.
    ctx.fillStyle = Renderer.ACCENT;
    ctx.fillRect(x - pad, y - pad, zoom, panelH);
    // Top accent line.
    ctx.fillStyle = "#152a44";
    ctx.fillRect(x - pad, y - pad, barW + pad * 2, zoom);

    // ── Title ──
    ctx.fillStyle = Renderer.ACCENT;
    ctx.font = `bold ${bigFont}px ${font}`;
    ctx.textAlign = "left";
    ctx.fillText("BAT CAVE", x, y + zoom * 4);

    // Model badge.
    ctx.fillStyle = "#333348";
    const modelText = stats?.activeModel || "opus-4-6";
    const modelShort = modelText.replace("claude-", "");
    ctx.font = `${smallFont}px ${font}`;
    ctx.fillText(modelShort, x + barW - ctx.measureText(modelShort).width, y + zoom * 4);

    // ── Context bar ──
    const barY = y + zoom * 7;
    const pct = stats ? stats.contextFillPct / 100 : 0;
    const barColor = pct < 0.5 ? "#2ECC71" : pct < 0.8 ? "#F39C12" : "#E74C3C";
    // Track.
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(x, barY, barW, zoom * 3);
    // Fill.
    ctx.fillStyle = barColor;
    ctx.fillRect(x, barY, barW * pct, zoom * 3);
    // Notch markers at 25%, 50%, 75%.
    ctx.fillStyle = "#0a0a16";
    for (const mark of [0.25, 0.5, 0.75]) {
      ctx.fillRect(x + barW * mark, barY, zoom, zoom * 3);
    }
    // Percentage on bar.
    ctx.fillStyle = "#CCCCDD";
    ctx.font = `bold ${smallFont}px ${font}`;
    ctx.fillText(`${stats?.contextFillPct ?? 0}%`, x + zoom * 2, barY + zoom * 2.5);

    // ── Counters grid (2 columns) ──
    ctx.font = `${medFont}px ${font}`;
    const gridY = barY + zoom * 6;
    const col2X = x + barW / 2;

    // Row 1: MSG + TOOLS
    ctx.fillStyle = "#666680";
    ctx.fillText("MSG", x, gridY);
    ctx.fillStyle = "#AAAACC";
    ctx.fillText(`${stats?.messagesThisSession ?? 0}`, x + zoom * 11, gridY);
    ctx.fillStyle = "#666680";
    ctx.fillText("TOOLS", col2X, gridY);
    ctx.fillStyle = "#AAAACC";
    ctx.fillText(`${stats?.toolCallsThisSession ?? 0}`, col2X + zoom * 13, gridY);

    // Row 2: AGENTS + ACTIVE
    const row2Y = gridY + lineH;
    ctx.fillStyle = "#666680";
    ctx.fillText("SPAWN", x, row2Y);
    ctx.fillStyle = "#AAAACC";
    ctx.fillText(`${stats?.agentsSpawnedThisSession ?? 0}`, x + zoom * 13, row2Y);
    const activeCount = this.world.getActiveAgentCount();
    ctx.fillStyle = "#666680";
    ctx.fillText("ACTIVE", col2X, row2Y);
    ctx.fillStyle = activeCount > 0 ? "#2ECC71" : "#555566";
    ctx.fillText(`${activeCount}`, col2X + zoom * 14, row2Y);

    // ── Divider ──
    const divY = row2Y + lineH;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(x, divY, barW, zoom);

    // ── Active agents list ──
    if (activeAgentNames.length > 0) {
      const agentStartY = divY + lineH;
      ctx.fillStyle = "#666680";
      ctx.font = `${smallFont}px ${font}`;
      ctx.fillText("ACTIVE AGENTS", x, agentStartY);

      ctx.fillStyle = "#AAAACC";
      ctx.font = `${smallFont}px ${font}`;
      for (let i = 0; i < activeAgentNames.length; i++) {
        // Green dot.
        ctx.fillStyle = "#2ECC71";
        ctx.fillRect(x, agentStartY + (i + 1) * lineH - zoom * 2, zoom * 2, zoom * 2);
        // Name.
        ctx.fillStyle = "#AAAACC";
        ctx.fillText(activeAgentNames[i], x + zoom * 4, agentStartY + (i + 1) * lineH);
      }
    }

    // ── Activity sparkline (bottom of panel) ──
    const sparkY = divY + lineH + agentListH + zoom * 2;
    ctx.fillStyle = "#666680";
    ctx.font = `${smallFont}px ${font}`;
    ctx.fillText("ACTIVITY", x, sparkY);

    // Draw a mini bar chart using tool call activity.
    const sparkBarY = sparkY + zoom * 2;
    const sparkBarH = zoom * 4;
    const bars = 16;
    const barWidth = Math.floor(barW / bars);
    const now = Date.now();
    for (let i = 0; i < bars; i++) {
      // Simulate activity based on time + message count.
      const s = this.seed(i + Math.floor(now / 2000));
      const activity = stats ? Math.min(1, (stats.toolCallsThisSession / 50) * s) : s * 0.1;
      const h = Math.max(zoom, Math.floor(sparkBarH * activity));
      ctx.fillStyle = activity > 0.5 ? "#1a4a6e" : "#122030";
      ctx.fillRect(x + i * barWidth, sparkBarY + sparkBarH - h, barWidth - zoom, h);
    }

    // ── State indicator (bottom-left) ──
    const state = this.world.getClaudeState();
    const stateColor: Record<string, string> = {
      idle: "#555566", thinking: Renderer.ACCENT, writing: "#2ECC71",
    };
    // State dot (pulsing when active).
    const dotSize = zoom * 3;
    ctx.fillStyle = stateColor[state] || "#555566";
    ctx.fillRect(pad, this.height - pad - zoom * 6, dotSize, dotSize);
    // Pulse ring when not idle.
    if (state !== "idle") {
      const pulse = Math.sin(now / 300) * 0.5 + 0.5;
      const ringSize = dotSize + Math.floor(pulse * zoom * 2);
      ctx.fillStyle = state === "thinking" ? "#0e2040" : "#0e2a0e";
      ctx.fillRect(
        pad - Math.floor((ringSize - dotSize) / 2),
        this.height - pad - zoom * 6 - Math.floor((ringSize - dotSize) / 2),
        ringSize, ringSize
      );
      ctx.fillStyle = stateColor[state];
      ctx.fillRect(pad, this.height - pad - zoom * 6, dotSize, dotSize);
    }
    // State label.
    ctx.fillStyle = "#AAAACC";
    ctx.font = `bold ${medFont}px ${font}`;
    ctx.textAlign = "left";
    ctx.fillText(state.toUpperCase(), pad + zoom * 5, this.height - pad - zoom * 4);

    // Tool in use (if thinking/writing).
    if (state !== "idle") {
      ctx.fillStyle = "#555566";
      ctx.font = `${smallFont}px ${font}`;
      ctx.fillText("working...", pad + zoom * 5, this.height - pad - zoom * 1);
    }
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
