import { BatCaveWorld } from "../world/BatCave";

/** Canvas 2D renderer for the Bat Cave pixel art environment. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private world: BatCaveWorld;
  private width = 0;
  private height = 0;

  // Cave color palette.
  private static readonly BG = "#0a0a12";
  private static readonly FLOOR = "#14141e";
  private static readonly FLOOR_HI = "#1a1a28";
  private static readonly WALL = "#1e1e32";
  private static readonly WALL_DARK = "#101020";
  private static readonly ACCENT = "#1E7FD8";

  private static readonly TILE = 16;

  constructor(ctx: CanvasRenderingContext2D, world: BatCaveWorld) {
    this.ctx = ctx;
    this.world = world;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.world.setDimensions(width, height);
  }

  update(deltaMs: number): void {
    this.world.update(deltaMs);
  }

  render(): void {
    const ctx = this.ctx;
    const T = Renderer.TILE;
    const zoom = Math.max(1, Math.floor(this.width / (24 * T)));
    const zt = T * zoom;
    const cols = Math.ceil(this.width / zt) + 1;
    const rows = Math.ceil(this.height / zt) + 1;

    // Clear.
    ctx.fillStyle = Renderer.BG;
    ctx.fillRect(0, 0, this.width, this.height);

    // Floor tiles.
    for (let y = 2; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? Renderer.FLOOR_HI : Renderer.FLOOR;
        ctx.fillRect(x * zt, y * zt, zt, zt);
      }
    }

    // Cave walls + stalactites.
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = Renderer.WALL_DARK;
      ctx.fillRect(x * zt, 0, zt, zt);
      ctx.fillStyle = Renderer.WALL;
      ctx.fillRect(x * zt, zt, zt, zt);
      if (x % 3 === 0) {
        ctx.fillStyle = Renderer.WALL_DARK;
        ctx.fillRect(x * zt + zt / 2 - zoom, zt * 2, zoom * 2, zoom * 3);
      }
    }

    // Batcomputer.
    this.drawBatcomputer(ctx, (Math.floor(cols / 2) - 2) * zt, zt * 2, zt, zoom);

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
    x: number, y: number, zt: number, zoom: number
  ): void {
    ctx.fillStyle = "#222233";
    ctx.fillRect(x, y, zt * 4, zt * 2);

    const sw = Math.floor(zt * 1.1);
    const sh = Math.floor(zt * 1.4);
    const gap = Math.floor(zt * 0.2);

    for (let i = 0; i < 3; i++) {
      const sx = x + gap + i * (sw + gap);
      ctx.fillStyle = "#0a0a16";
      ctx.fillRect(sx, y + gap, sw, sh);

      const glow = i === 1 ? Renderer.ACCENT : i === 0 ? "#2a5a2a" : "#5a2a2a";
      ctx.fillStyle = glow;
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 1000 + i) * 0.1;
      ctx.fillRect(sx + zoom, y + gap + zoom, sw - zoom * 2, sh - zoom * 2);
      ctx.globalAlpha = 1;

      // Scanlines.
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      for (let sl = 0; sl < sh; sl += zoom * 2) {
        ctx.fillRect(sx, y + gap + sl, sw, zoom);
      }
    }
  }

  private drawHUD(ctx: CanvasRenderingContext2D, zoom: number): void {
    const stats = this.world.getUsageStats();
    const pad = zoom * 4;
    const barW = zoom * 40;
    const x = this.width - barW - pad * 2;
    const y = pad;

    // Panel background.
    ctx.fillStyle = "rgba(10, 10, 18, 0.85)";
    ctx.fillRect(x - pad, y - pad, barW + pad * 2, zoom * 36);

    // Title.
    ctx.fillStyle = Renderer.ACCENT;
    ctx.font = `bold ${zoom * 5}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText("BAT CAVE", x, y + zoom * 4);

    // Context fill bar (HP style).
    const pct = stats ? stats.contextFillPct / 100 : 0;
    const barColor = pct < 0.5 ? "#2ECC71" : pct < 0.8 ? "#F39C12" : "#E74C3C";
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(x, y + zoom * 8, barW, zoom * 4);
    ctx.fillStyle = barColor;
    ctx.fillRect(x, y + zoom * 8, barW * pct, zoom * 4);

    // Counters.
    ctx.fillStyle = "#8888AA";
    ctx.font = `${zoom * 4}px monospace`;
    ctx.fillText(`CTX ${stats?.contextFillPct ?? 0}%`, x, y + zoom * 16);
    ctx.fillText(`MSG ${stats?.messagesThisSession ?? 0}`, x, y + zoom * 21);
    ctx.fillText(`TOOLS ${stats?.toolCallsThisSession ?? 0}`, x, y + zoom * 26);
    ctx.fillText(`AGENTS ${stats?.agentsSpawnedThisSession ?? 0}`, x, y + zoom * 31);

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
