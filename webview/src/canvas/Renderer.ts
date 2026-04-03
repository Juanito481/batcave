import { BatCaveWorld } from "../world/BatCave";

/** Canvas 2D renderer for the Bat Cave pixel art environment. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private world: BatCaveWorld;
  private width = 0;
  private height = 0;

  // Cave color palette (dark, moody, DC-style).
  private static readonly BG_COLOR = "#0a0a12";
  private static readonly FLOOR_COLOR = "#14141e";
  private static readonly FLOOR_HIGHLIGHT = "#1a1a28";
  private static readonly WALL_COLOR = "#1e1e32";
  private static readonly WALL_DARK = "#101020";
  private static readonly ACCENT = "#1E7FD8"; // Alfred blue

  // Tile size in pixels (before zoom).
  private static readonly TILE = 16;

  constructor(ctx: CanvasRenderingContext2D, world: BatCaveWorld) {
    this.ctx = ctx;
    this.world = world;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  update(deltaMs: number): void {
    this.world.update(deltaMs);
  }

  render(): void {
    const ctx = this.ctx;
    const T = Renderer.TILE;

    // Compute zoom to fill width with ~24 tiles.
    const zoom = Math.max(1, Math.floor(this.width / (24 * T)));
    const zt = T * zoom; // Zoomed tile size.

    // Clear.
    ctx.fillStyle = Renderer.BG_COLOR;
    ctx.fillRect(0, 0, this.width, this.height);

    // Cave dimensions in tiles.
    const cols = Math.ceil(this.width / zt) + 1;
    const rows = Math.ceil(this.height / zt) + 1;

    // Draw floor tiles with subtle grid.
    for (let y = 2; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const isHighlight = (x + y) % 2 === 0;
        ctx.fillStyle = isHighlight ? Renderer.FLOOR_HIGHLIGHT : Renderer.FLOOR_COLOR;
        ctx.fillRect(x * zt, y * zt, zt, zt);
      }
    }

    // Draw cave walls (top 2 rows).
    for (let x = 0; x < cols; x++) {
      // Top wall (darker).
      ctx.fillStyle = Renderer.WALL_DARK;
      ctx.fillRect(x * zt, 0, zt, zt);
      // Second row wall (lighter, with stalactite hint).
      ctx.fillStyle = Renderer.WALL_COLOR;
      ctx.fillRect(x * zt, zt, zt, zt);
      // Stalactite pixel accents.
      if (x % 3 === 0) {
        ctx.fillStyle = Renderer.WALL_DARK;
        ctx.fillRect(x * zt + zt / 2 - zoom, zt * 2, zoom * 2, zoom * 3);
      }
    }

    // Draw Batcomputer (center-top, glowing screens).
    const centerX = Math.floor(cols / 2);
    this.drawBatcomputer(ctx, (centerX - 2) * zt, zt * 2, zt, zoom);

    // Draw usage HUD.
    this.drawHUD(ctx, zoom);

    // Draw Claude character.
    this.drawClaude(ctx, centerX * zt, Math.floor(rows / 2) * zt, zt, zoom);

    // Draw active agents.
    const agents = this.world.getActiveAgents();
    agents.forEach((agent, i) => {
      const agentX = (centerX - 3 + i * 2) * zt;
      const agentY = Math.floor(rows / 2 + 2) * zt;
      this.drawAgent(ctx, agent, agentX, agentY, zt, zoom);
    });
  }

  private drawBatcomputer(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    zt: number,
    zoom: number
  ): void {
    // Monitor frame.
    ctx.fillStyle = "#222233";
    ctx.fillRect(x, y, zt * 4, zt * 2);

    // Screens (3 monitors).
    const screenW = Math.floor(zt * 1.1);
    const screenH = Math.floor(zt * 1.4);
    const gap = Math.floor(zt * 0.2);

    for (let i = 0; i < 3; i++) {
      const sx = x + gap + i * (screenW + gap);
      // Screen background (dark).
      ctx.fillStyle = "#0a0a16";
      ctx.fillRect(sx, y + gap, screenW, screenH);
      // Screen glow.
      const glowColor =
        i === 1 ? Renderer.ACCENT : i === 0 ? "#2a5a2a" : "#5a2a2a";
      ctx.fillStyle = glowColor;
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 1000 + i) * 0.1;
      ctx.fillRect(sx + zoom, y + gap + zoom, screenW - zoom * 2, screenH - zoom * 2);
      ctx.globalAlpha = 1;

      // Scanlines.
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      for (let sl = 0; sl < screenH; sl += zoom * 2) {
        ctx.fillRect(sx, y + gap + sl, screenW, zoom);
      }
    }
  }

  private drawClaude(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    zt: number,
    zoom: number
  ): void {
    const state = this.world.getClaudeState();
    const bob = Math.sin(Date.now() / 500) * zoom; // Idle bob.

    // Body (warm terracotta — Claude's brand).
    ctx.fillStyle = "#D97757";
    ctx.fillRect(x - zt / 3, y - zt + bob, zt * 0.7, zt);

    // Head.
    ctx.fillStyle = "#D97757";
    ctx.fillRect(x - zt / 4, y - zt * 1.5 + bob, zt * 0.5, zt * 0.5);

    // Eyes.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x - zt / 6, y - zt * 1.3 + bob, zoom * 2, zoom * 2);
    ctx.fillRect(x + zt / 8, y - zt * 1.3 + bob, zoom * 2, zoom * 2);

    // State indicator.
    if (state === "thinking") {
      // Thought bubble.
      ctx.fillStyle = Renderer.ACCENT;
      ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 300) * 0.3;
      ctx.fillRect(x + zt / 2, y - zt * 2 + bob, zoom * 3, zoom * 3);
      ctx.fillRect(x + zt / 3, y - zt * 1.7 + bob, zoom * 2, zoom * 2);
      ctx.globalAlpha = 1;
    } else if (state === "writing") {
      // Typing sparks.
      const sparkPhase = Math.floor(Date.now() / 100) % 4;
      ctx.fillStyle = "#FFD700";
      ctx.fillRect(
        x - zt / 3 + sparkPhase * zoom * 2,
        y + zoom + bob,
        zoom * 2,
        zoom * 2
      );
    }

    // Label.
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `${zoom * 5}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("Claude", x + zt / 6, y + zt / 2 + bob);
  }

  private drawAgent(
    ctx: CanvasRenderingContext2D,
    agent: { id: string; name: string; emoji: string },
    x: number,
    y: number,
    zt: number,
    zoom: number
  ): void {
    const bob = Math.sin(Date.now() / 600 + x) * zoom;

    // Agent body color based on type.
    const colors: Record<string, string> = {
      white: "#C0C0D0",
      black: "#404050",
      variant: "#6A5ACD",
      specialist: "#2E8B57",
      utility: "#8B7355",
    };
    const agentColor = colors[agent.id] || colors.white;

    // Body.
    ctx.fillStyle = agentColor;
    ctx.fillRect(x, y - zt * 0.8 + bob, zt * 0.6, zt * 0.8);

    // Head.
    ctx.fillRect(x + zt * 0.1, y - zt * 1.2 + bob, zt * 0.4, zt * 0.4);

    // Emoji label.
    ctx.font = `${zoom * 6}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText(agent.emoji, x + zt * 0.3, y - zt * 1.4 + bob);

    // Name.
    ctx.fillStyle = "#AAAACC";
    ctx.font = `${zoom * 4}px monospace`;
    ctx.fillText(agent.name, x + zt * 0.3, y + zt * 0.3 + bob);
  }

  private drawHUD(ctx: CanvasRenderingContext2D, zoom: number): void {
    const stats = this.world.getUsageStats();
    if (!stats) return;

    const padding = zoom * 4;
    const barWidth = zoom * 40;
    const barHeight = zoom * 4;
    const x = this.width - barWidth - padding * 2;
    const y = padding;

    // Background.
    ctx.fillStyle = "rgba(10, 10, 18, 0.85)";
    ctx.fillRect(x - padding, y - padding, barWidth + padding * 2, zoom * 36);

    // Title.
    ctx.fillStyle = Renderer.ACCENT;
    ctx.font = `${zoom * 5}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText("BAT CAVE", x, y + zoom * 4);

    // Context bar (HP style).
    const fillPct = stats.contextFillPct / 100;
    const barColor =
      fillPct < 0.5 ? "#2ECC71" : fillPct < 0.8 ? "#F39C12" : "#E74C3C";

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(x, y + zoom * 8, barWidth, barHeight);
    ctx.fillStyle = barColor;
    ctx.fillRect(x, y + zoom * 8, barWidth * fillPct, barHeight);

    // Stats text.
    ctx.fillStyle = "#8888AA";
    ctx.font = `${zoom * 4}px monospace`;
    ctx.fillText(`CTX ${stats.contextFillPct}%`, x, y + zoom * 16);
    ctx.fillText(`MSG ${stats.messagesThisSession}`, x, y + zoom * 21);
    ctx.fillText(`TOOLS ${stats.toolCallsThisSession}`, x, y + zoom * 26);
    ctx.fillText(`AGENTS ${stats.agentsSpawnedThisSession}`, x, y + zoom * 31);
  }
}
