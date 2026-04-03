import { BatCaveWorld } from "../world/BatCave";

/** Canvas 2D renderer for the Bat Cave pixel art environment. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private world: BatCaveWorld;
  private width = 0;
  private height = 0;

  // Cave color palette.
  private static readonly BG = "#0a0a12";
  private static readonly FLOOR = "#13131e";
  private static readonly FLOOR_HI = "#161624";
  private static readonly WALL_TOP = "#0c0c18";
  private static readonly WALL = "#161628";
  private static readonly WALL_MID = "#1a1a30";
  private static readonly WALL_EDGE = "#1e1e30";
  private static readonly ACCENT = "#1E7FD8";

  private static readonly TILE = 16;
  private static readonly LED_COLORS = ["#2ECC71", "#1E7FD8", "#E74C3C", "#F39C12", "#2ECC71"];

  // Seeded stalactite heights per column (deterministic).
  private stalactiteSeeds: number[] = [];

  constructor(ctx: CanvasRenderingContext2D, world: BatCaveWorld) {
    this.ctx = ctx;
    this.world = world;
    // Pre-generate stalactite variation seeds.
    for (let i = 0; i < 200; i++) {
      this.stalactiteSeeds[i] = (Math.sin(i * 127.1 + 311.7) * 0.5 + 0.5);
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    // Compute wallH here (single source of truth) and pass to world.
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
    // Zoom constrained by both width AND height so everything fits.
    const zoom = Math.max(2, Math.min(
      Math.floor(this.width / (16 * T)),
      Math.floor(this.height / (8 * T))
    ));
    const zt = T * zoom;
    const cols = Math.ceil(this.width / zt) + 1;
    const rows = Math.ceil(this.height / zt) + 1;
    // Wall height adapts to panel — 2 rows for short panels, 3 for tall.
    const wallRows = this.height > zt * 10 ? 3 : 2;
    const wallH = wallRows * zt;

    // Clear.
    ctx.fillStyle = Renderer.BG;
    ctx.fillRect(0, 0, this.width, this.height);

    // Floor tiles.
    for (let y = wallRows; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const isLight = (x + y) % 2 === 0;
        if (y === wallRows) {
          ctx.fillStyle = isLight ? "#141420" : "#101018";
        } else {
          ctx.fillStyle = isLight ? Renderer.FLOOR_HI : Renderer.FLOOR;
        }
        ctx.fillRect(x * zt, y * zt, zt, zt);
      }
    }

    // Cave ceiling — gradient rock rows.
    const wallColors = wallRows === 3
      ? [Renderer.WALL_TOP, Renderer.WALL, Renderer.WALL_MID]
      : [Renderer.WALL_TOP, Renderer.WALL];
    for (let x = 0; x < cols; x++) {
      for (let r = 0; r < wallRows; r++) {
        ctx.fillStyle = wallColors[r];
        ctx.fillRect(x * zt, r * zt, zt, zt);
      }
      // Rock texture pixels.
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      const seed = this.stalactiteSeeds[x % 200];
      if (seed > 0.3) ctx.fillRect(x * zt + zoom * 2, zoom * 3, zoom, zoom);
      if (seed > 0.6) ctx.fillRect(x * zt + zoom * 5, zt + zoom * 2, zoom, zoom);
    }

    // Stalactites hanging from wall bottom edge.
    for (let x = 0; x < cols; x++) {
      const seed = this.stalactiteSeeds[x % 200];
      const seed2 = this.stalactiteSeeds[(x * 3 + 7) % 200];

      if (x % 3 === 0) {
        const h = Math.floor(zoom * (5 + seed * 8));
        const w = zoom * 2;
        const sx = x * zt + zt / 2 - w / 2;
        ctx.fillStyle = Renderer.WALL_EDGE;
        ctx.fillRect(sx, wallH, w, h);
        ctx.fillStyle = Renderer.WALL;
        ctx.fillRect(sx + Math.floor(w / 4), wallH + h, Math.ceil(w / 2), zoom);
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(sx, wallH, Math.max(1, Math.floor(zoom / 2)), h);
      }

      if (x % 3 !== 0 && seed2 > 0.4) {
        const h = Math.floor(zoom * (2 + seed2 * 4));
        ctx.fillStyle = Renderer.WALL_EDGE;
        ctx.fillRect(x * zt + zt / 2, wallH, zoom, h);
      }
    }

    // Wall bottom edge line.
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, wallH, this.width, zoom);

    // Ambient cave life (behind furniture/characters).
    this.world.getAmbient().draw(ctx, zoom);

    // Batcomputer — centered just below the wall.
    const bcTilesW = Math.min(5, cols - 2);
    const bcW = zt * bcTilesW;
    const bcX = Math.floor((this.width - bcW) / 2);
    const bcY = wallH + zoom * 2;

    // Furniture (drawn before characters for correct depth).
    this.drawCables(ctx, bcX, bcY, zt, zoom, bcTilesW);
    this.drawServerRack(ctx, bcX - zt * 3, Math.floor(bcY - zt * 1.5), zt, zoom);
    this.drawWorkbench(ctx, Math.floor(bcX - zt * 6.5), bcY, zt, zoom);
    this.drawBookshelf(ctx, bcX + bcW + zt, bcY - zt, zt, zoom);

    this.drawBatcomputer(ctx, bcX, bcY, zt, zoom, bcTilesW);

    // Characters (Y-sorted for depth).
    const agents = this.world.getAgentCharacters();
    const allChars = [this.world.claude, ...agents].sort((a, b) => a.y - b.y);
    for (const char of allChars) {
      char.draw(ctx, zoom);
    }

    // HUD.
    this.drawHUD(ctx, zoom);
  }

  private drawBatcomputer(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, zt: number, zoom: number, tilesW: number
  ): void {
    const totalW = zt * tilesW;
    const totalH = Math.floor(zt * 1.5);

    // Desk body.
    ctx.fillStyle = "#1c1c2e";
    ctx.fillRect(x, y, totalW, totalH);
    // Desk top edge highlight.
    ctx.fillStyle = "#282840";
    ctx.fillRect(x, y, totalW, zoom);

    // 3 screens.
    const gap = Math.floor(zoom * 3);
    const screenAreaW = totalW - gap * 4;
    const sw = Math.floor(screenAreaW / 3);
    const sh = totalH - gap * 2;

    const screenColors = ["#1a3a1a", Renderer.ACCENT, "#3a1a1a"];
    const screenLabels = ["SYS", "MAIN", "LOG"];

    for (let i = 0; i < 3; i++) {
      const sx = x + gap + i * (sw + gap);

      // Screen bezel.
      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(sx - zoom, y + gap - zoom, sw + zoom * 2, sh + zoom * 2);

      // Screen background.
      ctx.fillStyle = "#060610";
      ctx.fillRect(sx, y + gap, sw, sh);

      // Screen glow.
      const glowColor = screenColors[i];
      ctx.fillStyle = glowColor;
      ctx.globalAlpha = 0.35 + Math.sin(Date.now() / 800 + i * 2.1) * 0.12;
      ctx.fillRect(sx + zoom, y + gap + zoom, sw - zoom * 2, sh - zoom * 2);
      ctx.globalAlpha = 1;

      // Scanlines.
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      for (let sl = 0; sl < sh; sl += zoom * 2) {
        ctx.fillRect(sx, y + gap + sl, sw, zoom);
      }

      // Screen label.
      ctx.fillStyle = glowColor;
      ctx.globalAlpha = 0.6;
      ctx.font = `bold ${Math.max(6, zoom * 3)}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText(screenLabels[i], sx + sw / 2, y + gap + sh - zoom * 2);
      ctx.globalAlpha = 1;
    }

    // Desk legs.
    ctx.fillStyle = "#141424";
    const legW = zoom * 2;
    ctx.fillRect(x + gap, y + totalH, legW, zoom * 3);
    ctx.fillRect(x + totalW - gap - legW, y + totalH, legW, zoom * 3);
  }

  private drawServerRack(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, zt: number, zoom: number
  ): void {
    const w = zt * 2;
    const h = zt * 3;

    // Rack body.
    ctx.fillStyle = "#111120";
    ctx.fillRect(x, y, w, h);
    // Front panel.
    ctx.fillStyle = "#0e0e1a";
    ctx.fillRect(x + zoom, y + zoom, w - zoom * 2, h - zoom * 2);
    // Top edge highlight.
    ctx.fillStyle = "#222238";
    ctx.fillRect(x, y, w, zoom);

    // Rack unit dividers.
    ctx.fillStyle = "#1a1a2e";
    const units = 5;
    const unitH = Math.floor((h - zoom * 2) / units);
    for (let i = 1; i < units; i++) {
      ctx.fillRect(x + zoom * 2, y + zoom + i * unitH, w - zoom * 4, zoom);
    }

    // Blinking status LEDs.
    const now = Date.now();
    const ledColors = Renderer.LED_COLORS;
    for (let i = 0; i < units; i++) {
      const ledY = y + zoom * 2 + i * unitH + Math.floor(unitH / 2);
      const phase = Math.sin(now / 400 + i * 1.7);
      const on = phase > -0.3;
      ctx.fillStyle = on ? ledColors[i % ledColors.length] : "#0a0a12";
      ctx.globalAlpha = on ? 0.8 + phase * 0.2 : 0.3;
      ctx.fillRect(x + zoom * 2, ledY, zoom, zoom);
      // Second LED.
      const phase2 = Math.sin(now / 600 + i * 2.3);
      ctx.fillStyle = phase2 > 0 ? ledColors[(i + 2) % ledColors.length] : "#0a0a12";
      ctx.globalAlpha = phase2 > 0 ? 0.7 : 0.3;
      ctx.fillRect(x + zoom * 4, ledY, zoom, zoom);
      ctx.globalAlpha = 1;
    }

    // Ventilation holes on the right side.
    ctx.fillStyle = "#080812";
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(x + w - zoom * 3, y + zoom * 3 + i * zoom * 3, zoom * 2, zoom);
    }
  }

  private drawWorkbench(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, zt: number, zoom: number
  ): void {
    const w = zt * 3;
    const h = Math.floor(zt * 1.5);

    // Table top.
    ctx.fillStyle = "#1a1a2a";
    ctx.fillRect(x, y, w, zoom * 2);
    // Top edge.
    ctx.fillStyle = "#242438";
    ctx.fillRect(x, y, w, zoom);

    // Table body.
    ctx.fillStyle = "#141422";
    ctx.fillRect(x, y + zoom * 2, w, h - zoom * 2);

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

    // Screen bezel.
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(screenX - zoom, screenY - zoom, screenW + zoom * 2, screenH + zoom * 2);

    // Screen surface.
    ctx.fillStyle = "#060610";
    ctx.fillRect(screenX, screenY, screenW, screenH);

    // Screen glow — terracotta tint.
    ctx.fillStyle = "#D97757";
    ctx.globalAlpha = 0.2 + Math.sin(Date.now() / 1200) * 0.08;
    ctx.fillRect(screenX + zoom, screenY + zoom, screenW - zoom * 2, screenH - zoom * 2);
    ctx.globalAlpha = 1;

    // Scanlines.
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (let sl = 0; sl < screenH; sl += zoom * 2) {
      ctx.fillRect(screenX, screenY + sl, screenW, zoom);
    }

    // Small items on table surface.
    ctx.fillStyle = "#222238";
    ctx.fillRect(x + w - zoom * 6, y - zoom, zoom * 3, zoom); // box
    ctx.fillStyle = "#2a2a40";
    ctx.fillRect(x + w - zoom * 3, y - zoom, zoom * 2, zoom); // tool
  }

  private drawBookshelf(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, zt: number, zoom: number
  ): void {
    const w = zt * 2;
    const h = Math.floor(zt * 2.5);

    // Shelf frame.
    ctx.fillStyle = "#181828";
    ctx.fillRect(x, y, w, h);
    // Frame edge.
    ctx.fillStyle = "#222236";
    ctx.fillRect(x, y, w, zoom);
    ctx.fillRect(x, y, zoom, h);
    ctx.fillRect(x + w - zoom, y, zoom, h);

    // Shelf dividers (3 shelves).
    const shelves = 3;
    const shelfH = Math.floor((h - zoom) / shelves);
    ctx.fillStyle = "#1e1e30";
    for (let i = 1; i <= shelves; i++) {
      ctx.fillRect(x + zoom, y + i * shelfH, w - zoom * 2, zoom);
    }

    // Books on each shelf.
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
        const bookW = zoom + Math.floor(this.stalactiteSeeds[(bookIdx * 7) % 200] * zoom);
        const bookH = Math.floor(maxBookH * (0.7 + this.stalactiteSeeds[(bookIdx * 13 + 3) % 200] * 0.3));
        if (bx + bookW > shelfEndX) break;

        ctx.fillStyle = bookColors[bookIdx % bookColors.length];
        ctx.globalAlpha = 0.6;
        ctx.fillRect(bx, shelfBottom - bookH, bookW, bookH);

        // Spine highlight.
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fillRect(bx, shelfBottom - bookH, Math.max(1, Math.floor(zoom / 2)), bookH);
        ctx.globalAlpha = 1;

        bx += bookW + Math.max(1, Math.floor(zoom / 2));
        bookIdx++;
      }
    }
  }

  private drawCables(
    ctx: CanvasRenderingContext2D,
    bcX: number, bcY: number, zt: number, zoom: number, bcTilesW: number
  ): void {
    const bcW = zt * bcTilesW;
    const rackRightX = bcX - zt;
    const cableY = bcY + Math.floor(zt * 1.5) + zoom * 2; // just below desk

    // Main cable bundle running from server rack area to batcomputer.
    ctx.fillStyle = "#0e0e1c";
    ctx.fillRect(rackRightX, cableY, zt + zoom, zoom);
    ctx.fillRect(rackRightX, cableY + zoom * 2, zt + zoom, zoom);

    // Additional cable running to the right side.
    ctx.fillStyle = "#0c0c18";
    ctx.fillRect(bcX + bcW, cableY + zoom, zt, zoom);

    // Cable texture dots.
    ctx.fillStyle = "rgba(30, 127, 216, 0.08)";
    for (let i = 0; i < 6; i++) {
      const cx = rackRightX + i * zoom * 3;
      if (cx < bcX) {
        ctx.fillRect(cx, cableY, zoom, zoom);
      }
    }

    // Floor connector near server rack.
    ctx.fillStyle = "#161628";
    ctx.fillRect(rackRightX - zoom, cableY - zoom, zoom * 2, zoom * 4);
  }

  private drawHUD(ctx: CanvasRenderingContext2D, zoom: number): void {
    const stats = this.world.getUsageStats();
    const pad = zoom * 4;
    const barW = zoom * 40;
    const x = this.width - barW - pad * 2;
    const y = pad;
    const panelH = zoom * 40;

    // Panel background.
    ctx.fillStyle = "rgba(10, 10, 18, 0.9)";
    ctx.fillRect(x - pad, y - pad, barW + pad * 2, panelH);
    // Panel border.
    ctx.fillStyle = "rgba(30, 127, 216, 0.15)";
    ctx.fillRect(x - pad, y - pad, barW + pad * 2, zoom);

    // Title.
    ctx.fillStyle = Renderer.ACCENT;
    ctx.font = `bold ${zoom * 5}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText("BAT CAVE", x, y + zoom * 4);

    // Context fill bar (HP style).
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
