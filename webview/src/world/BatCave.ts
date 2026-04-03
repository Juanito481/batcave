/**
 * Game world state — manages Claude + agent characters with sprite animations.
 * Receives events from the extension host, drives Character entities.
 */

import { Character } from "../entities/Character";
import { generateAllSprites, SpriteSheet } from "../canvas/SpriteGenerator";

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

  // State.
  private claudeState: "idle" | "thinking" | "writing" = "idle";
  private usageStats: UsageStats | null = null;
  private idleTimer: number | null = null;
  private config: { agents?: Record<string, AgentMeta> } = {};

  // Layout.
  private worldWidth = 400;
  private worldHeight = 300;
  private nextAgentSlot = 0;

  constructor() {
    this.sprites = generateAllSprites();

    const claudeSprite = this.sprites.get("claude")!;
    this.claude = new Character(
      "claude", "Claude", "🤖", claudeSprite,
      this.worldWidth / 2, this.worldHeight / 2
    );
  }

  /** Set canvas dimensions so we can position characters. */
  setDimensions(w: number, h: number): void {
    this.worldWidth = w;
    this.worldHeight = h;
    // Reposition Claude to center.
    this.claude.x = w / 2;
    this.claude.y = h * 0.45;
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
        const slotX = this.worldWidth * 0.2 + (slot % 5) * (this.worldWidth * 0.15);
        const slotY = this.worldHeight * 0.65 + Math.floor(slot / 5) * 40;

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

  getUsageStats(): UsageStats | null {
    return this.usageStats;
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

  private repackSlots(): void {
    this.nextAgentSlot = 0;
    for (const [, char] of this.agents) {
      const slot = this.nextAgentSlot++;
      const targetX = this.worldWidth * 0.2 + (slot % 5) * (this.worldWidth * 0.15);
      const targetY = this.worldHeight * 0.65 + Math.floor(slot / 5) * 40;
      char.moveTo(targetX, targetY);
    }
  }
}
