/**
 * Game world state — manages Claude + agent characters with sprite animations.
 * Receives events from the extension host, drives Character entities.
 */

import { Character } from "../entities/Character";
import { Ambient } from "../entities/Ambient";
import { generateAllSprites, SpriteSheet } from "../canvas/SpriteGenerator";
import { Pathfinder, Rect } from "./Pathfinder";

interface UsageStats {
  messagesThisSession: number;
  toolCallsThisSession: number;
  agentsSpawnedThisSession: number;
  activeModel: string;
  contextFillPct: number;
}

interface AgentMeta {
  name: string;
  emoji: string;
}

export class BatCaveWorld {
  // Sprite sheets (generated once at init).
  private sprites: Map<string, SpriteSheet>;

  // Characters.
  claude: Character;
  private agents: Map<string, Character> = new Map();

  // Ambient life.
  private ambient: Ambient;

  // Pathfinding.
  private pathfinder: Pathfinder;
  private obstacles: Rect[] = [];

  // State.
  private claudeState: "idle" | "thinking" | "writing" = "idle";
  private usageStats: UsageStats | null = null;
  private idleTimer: number | null = null;
  private config: { agents?: Record<string, AgentMeta> } = {};

  // Layout.
  private worldWidth = 400;
  private worldHeight = 300;
  private wallH = 64;
  private nextAgentSlot = 0;

  constructor() {
    this.sprites = generateAllSprites();
    this.ambient = new Ambient();
    this.pathfinder = new Pathfinder();

    const claudeSprite = this.sprites.get("claude")!;
    this.claude = new Character(
      "claude", "Claude", "🤖", claudeSprite,
      this.worldWidth / 2, this.worldHeight / 2
    );
  }

  /** Set canvas dimensions and wall height so we can position characters. */
  setDimensions(w: number, h: number, wallH: number): void {
    this.worldWidth = w;
    this.worldHeight = h;
    this.wallH = wallH;

    const T = 16;
    const zoom = Math.max(2, Math.min(Math.floor(w / (16 * T)), Math.floor(h / (8 * T))));
    const zt = T * zoom;

    // Batcomputer geometry (must match Renderer).
    const bcTilesW = Math.min(5, Math.ceil(w / zt) - 1);
    const bcW = zt * bcTilesW;
    const bcX = Math.floor((w - bcW) / 2);
    const bcY = wallH + zoom * 2;
    const bcH = Math.floor(zt * 1.5);

    // Build obstacle rects matching Renderer furniture positions.
    this.obstacles = [
      // Cave wall (entire top area is not walkable).
      { x: 0, y: 0, w: w, h: wallH },
      // Batcomputer + desk legs.
      { x: bcX, y: bcY, w: bcW, h: bcH + zoom * 3 },
      // Server rack.
      { x: bcX - zt * 3, y: Math.floor(bcY - zt * 1.5), w: zt * 2, h: zt * 3 },
      // Workbench.
      { x: Math.floor(bcX - zt * 6.5), y: bcY, w: zt * 3, h: Math.floor(zt * 1.5) + zoom * 3 },
      // Bookshelf.
      { x: bcX + bcW + zt, y: bcY - zt, w: zt * 2, h: Math.floor(zt * 2.5) },
      // Chair.
      { x: Math.floor(bcX + bcW / 2 - zoom * 3), y: bcH + bcY + zoom, w: zoom * 6, h: zoom * 7 },
    ];

    // Rebuild pathfinder grid.
    const cellSize = Math.max(8, zt / 2);
    this.pathfinder.buildGrid(w, h, cellSize, this.obstacles);

    // Position Claude below the batcomputer, anchored to floor.
    const floorY = wallH + bcH + zoom * 5;
    this.claude.x = w / 2;
    this.claude.y = floorY;
  }

  /** Find a path from (sx,sy) to (tx,ty) avoiding furniture. */
  findPath(sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] {
    return this.pathfinder.findPath(sx, sy, tx, ty);
  }

  handleEvent(event: Record<string, unknown>): void {
    const type = event.type as string;

    switch (type) {
      case "session_thinking":
        this.claudeState = "thinking";
        this.claude.setAction();
        this.resetIdleTimer();
        break;

      case "session_writing":
        this.claudeState = "writing";
        this.claude.setAction();
        this.resetIdleTimer();
        break;

      case "session_idle":
        this.claudeState = "idle";
        this.claude.setIdle();
        break;

      case "agent_enter": {
        const agentId = event.agentId as string;
        if (this.agents.has(agentId)) break;

        const meta = this.config.agents?.[agentId];
        const sprite = this.sprites.get(agentId);
        if (!sprite) break;

        const slot = this.nextAgentSlot++;
        const { x: slotX, y: slotY } = this.getAgentSlotPosition(slot);

        const char = new Character(
          agentId,
          meta?.name || agentId,
          meta?.emoji || "?",
          sprite,
          slotX,
          this.worldHeight + 30 // Start off-screen below.
        );
        char.enter(slotX, slotY);
        this.agents.set(agentId, char);
        break;
      }

      case "agent_exit": {
        const agentId = event.agentId as string;
        const char = this.agents.get(agentId);
        if (char) {
          char.exit();
          // Remove after exit animation.
          setTimeout(() => {
            this.agents.delete(agentId);
            this.repackSlots();
          }, 500);
        }
        break;
      }

      case "tool_start":
        if (this.claudeState === "idle") {
          this.claudeState = "thinking";
          this.claude.setAction();
        }
        this.resetIdleTimer();
        break;

      case "usage_update":
        this.usageStats = {
          messagesThisSession: event.messagesThisSession as number,
          toolCallsThisSession: event.toolCallsThisSession as number,
          agentsSpawnedThisSession: event.agentsSpawnedThisSession as number,
          activeModel: event.activeModel as string,
          contextFillPct: event.contextFillPct as number,
        };
        break;
    }
  }

  setConfig(config: Record<string, unknown>): void {
    this.config = config as { agents?: Record<string, AgentMeta> };
  }

  update(deltaMs: number): void {
    this.ambient.update(deltaMs, this.worldWidth, this.worldHeight, this.wallH);
    this.claude.update(deltaMs);
    for (const agent of this.agents.values()) {
      agent.update(deltaMs);
    }
  }

  getClaudeState(): "idle" | "thinking" | "writing" {
    return this.claudeState;
  }

  getAgentCharacters(): Character[] {
    return Array.from(this.agents.values()).filter((a) => a.visible);
  }

  getAmbient(): Ambient {
    return this.ambient;
  }

  getUsageStats(): UsageStats | null {
    return this.usageStats;
  }

  getActiveAgentCount(): number {
    return this.agents.size;
  }

  getActiveAgentNames(): string[] {
    return Array.from(this.agents.values()).filter(a => a.visible).map(a => a.name);
  }

  private resetIdleTimer(): void {
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
    }
    this.idleTimer = window.setTimeout(() => {
      this.claudeState = "idle";
      this.claude.setIdle();
      this.idleTimer = null;
    }, 5000);
  }

  private getAgentSlotPosition(slot: number): { x: number; y: number } {
    const T = 16;
    const zoom = Math.max(2, Math.min(
      Math.floor(this.worldWidth / (16 * T)),
      Math.floor(this.worldHeight / (8 * T))
    ));
    const zt = T * zoom;
    // Agents stand on the floor below the batcomputer area, spread in rows.
    const floorY = this.wallH + Math.floor(zt * 1.5) + zoom * 5;
    const rowSpacing = zoom * 12;
    const x = this.worldWidth * 0.15 + (slot % 6) * (this.worldWidth * 0.12);
    const y = floorY + rowSpacing + Math.floor(slot / 6) * rowSpacing;
    return { x, y };
  }

  private repackSlots(): void {
    this.nextAgentSlot = 0;
    for (const [, char] of this.agents) {
      const slot = this.nextAgentSlot++;
      const { x, y } = this.getAgentSlotPosition(slot);
      const path = this.pathfinder.findPath(char.x, char.y, x, y);
      char.moveAlongPath(path);
    }
  }
}
