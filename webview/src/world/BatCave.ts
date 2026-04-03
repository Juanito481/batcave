/**
 * Game world state — manages Claude + agent characters with sprite animations.
 * Receives events from the extension host, drives Character entities.
 */

import { Character } from "../entities/Character";
import { Ambient } from "../entities/Ambient";
import { generateAllSprites, SpriteSheet } from "../canvas/SpriteGenerator";
import { Pathfinder, Rect } from "./Pathfinder";
import { AgentMeta, UsageStats } from "../../../shared/types";

/** Repo-specific color themes for the cave environment. */
export interface RepoTheme {
  accent: string;
  accentDark: string;
  ledColor: string;
  label: string;
}

const REPO_THEMES: Record<string, RepoTheme> = {
  "harriet":            { accent: "#1E7FD8", accentDark: "#122840", ledColor: "#1a4a8a", label: "HARRIET" },
  "lucius":             { accent: "#9B59B6", accentDark: "#2a1840", ledColor: "#6a3a8a", label: "LUCIUS" },
  "fox":                { accent: "#E74C3C", accentDark: "#3a1418", ledColor: "#8a2a2a", label: "FOX" },
  "pennyworth-cortex":  { accent: "#2ECC71", accentDark: "#0e2a18", ledColor: "#1a6a3a", label: "CORTEX" },
  "alfred-mvp":         { accent: "#F39C12", accentDark: "#3a2810", ledColor: "#8a6a1a", label: "ALFRED" },
  "alfred-web":         { accent: "#1E7FD8", accentDark: "#122840", ledColor: "#1a4a8a", label: "WEB" },
  "robin":              { accent: "#E67E22", accentDark: "#3a2010", ledColor: "#8a5a1a", label: "ROBIN" },
  "barbara":            { accent: "#1ABC9C", accentDark: "#0e2a28", ledColor: "#1a6a5a", label: "BARBARA" },
  "amygdala":           { accent: "#E74C3C", accentDark: "#3a1418", ledColor: "#8a2a2a", label: "AMYGDALA" },
  "batcave":            { accent: "#1E7FD8", accentDark: "#122840", ledColor: "#1a4a8a", label: "BATCAVE" },
};

const DEFAULT_THEME: RepoTheme = { accent: "#1E7FD8", accentDark: "#122840", ledColor: "#1a4a8a", label: "---" };

export class BatCaveWorld {
  // Sprite sheets (generated once at init).
  private sprites: Map<string, SpriteSheet>;

  // Characters.
  alfred: Character;
  giovanni: Character;
  private agents: Map<string, Character> = new Map();

  // Ambient life.
  private ambient: Ambient;

  // Pathfinding.
  private pathfinder: Pathfinder;
  private obstacles: Rect[] = [];

  // State.
  private alfredState: "idle" | "thinking" | "writing" = "idle";
  private usageStats: UsageStats | null = null;
  private idleTimer: number | null = null;
  private exitTimers = new Map<string, number>();
  private config: { agents?: Record<string, AgentMeta>; activeRepo?: string } = {};

  // Repo theme.
  private repoTheme: RepoTheme = DEFAULT_THEME;

  // Current tool (for tool visualization).
  private currentTool: string | null = null;
  private currentToolTimer = 0;

  // Event log (for timeline).
  private eventLog: { type: string; label: string; timestamp: number }[] = [];

  // Layout.
  private worldWidth = 400;
  private worldHeight = 300;
  private wallH = 64;
  private _zoom = 2;
  private _zt = 32;
  private nextAgentSlot = 0;

  constructor() {
    this.sprites = generateAllSprites();
    this.ambient = new Ambient();
    this.pathfinder = new Pathfinder();

    const alfredSprite = this.sprites.get("alfred")!;
    this.alfred = new Character(
      "alfred", "Alfred", "🤖", alfredSprite,
      this.worldWidth / 2, this.worldHeight / 2
    );
    const giovanniSprite = this.sprites.get("giovanni")!;
    this.giovanni = new Character(
      "giovanni", "Giovanni", "🦇", giovanniSprite,
      this.worldWidth * 0.3, this.worldHeight / 2
    );
  }

  /** Set canvas dimensions and wall height so we can position characters. */
  setDimensions(w: number, h: number, wallH: number): void {
    this.worldWidth = w;
    this.worldHeight = h;
    this.wallH = wallH;

    const T = 16;
    this._zoom = Math.max(2, Math.min(Math.floor(w / (16 * T)), Math.floor(h / (8 * T))));
    this._zt = T * this._zoom;
    const zoom = this._zoom;
    const zt = this._zt;

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
      // Display panel.
      { x: bcX + bcW + zt, y: bcY - Math.floor(zt * 0.5), w: Math.floor(zt * 2.5), h: Math.floor(zt * 1.8) },
      // Chair.
      { x: Math.floor(bcX + bcW / 2 - zoom * 3), y: bcH + bcY + zoom, w: zoom * 6, h: zoom * 7 },
    ];

    // Rebuild pathfinder grid.
    const cellSize = Math.max(8, zt / 2);
    this.pathfinder.buildGrid(w, h, cellSize, this.obstacles);

    // Position characters on the floor.
    const floorY = wallH + Math.floor((h - wallH) * 0.82);
    this.alfred.x = w / 2;
    this.alfred.y = floorY;
    this.giovanni.x = w * 0.3;
    this.giovanni.y = floorY;
  }

  /** Find a path from (sx,sy) to (tx,ty) avoiding furniture. */
  findPath(sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] {
    return this.pathfinder.findPath(sx, sy, tx, ty);
  }

  handleEvent(event: Record<string, unknown>): void {
    const type = event.type as string;

    switch (type) {
      case "session_thinking":
        this.alfredState = "thinking";
        this.alfred.setAction();
        this.resetIdleTimer();
        break;

      case "session_writing":
        this.alfredState = "writing";
        this.alfred.setAction();
        this.resetIdleTimer();
        break;

      case "session_idle":
        this.alfredState = "idle";
        this.alfred.setIdle();
        break;

      case "agent_enter": {
        const agentId = event.agentId as string;
        // Cancel pending exit timer if the same agent re-enters.
        const pendingExit = this.exitTimers.get(agentId);
        if (pendingExit !== undefined) {
          window.clearTimeout(pendingExit);
          this.exitTimers.delete(agentId);
          // Remove the old exiting character so a fresh one can spawn.
          this.agents.delete(agentId);
        }
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
        this.logEvent("agent_enter", meta?.name || agentId);
        break;
      }

      case "agent_exit": {
        const agentId = event.agentId as string;
        const char = this.agents.get(agentId);
        if (char) {
          this.logEvent("agent_exit", char.name);
          char.exit();
          // Remove after exit animation (tracked so re-enter can cancel).
          // Capture reference to verify we delete the same instance (not a re-spawned one).
          const exitingChar = char;
          const timer = window.setTimeout(() => {
            if (this.agents.get(agentId) === exitingChar) {
              this.agents.delete(agentId);
            }
            this.exitTimers.delete(agentId);
            this.repackSlots();
          }, 500);
          this.exitTimers.set(agentId, timer);
        }
        break;
      }

      case "tool_start":
        this.currentTool = (event.toolName as string) || null;
        this.currentToolTimer = 3000; // Show icon for 3s.
        this.logEvent("tool", this.currentTool || "?");
        if (this.alfredState === "idle") {
          this.alfredState = "thinking";
          this.alfred.setAction();
        }
        this.resetIdleTimer();
        break;

      case "tool_end":
        this.logEvent("tool_end", (event.toolName as string) || "?");
        break;

      case "usage_update":
        this.usageStats = {
          type: "usage_update",
          messagesThisSession: event.messagesThisSession as number,
          toolCallsThisSession: event.toolCallsThisSession as number,
          agentsSpawnedThisSession: event.agentsSpawnedThisSession as number,
          activeModel: event.activeModel as string,
          sessionStartedAt: event.sessionStartedAt as number,
          contextFillPct: event.contextFillPct as number,
        };
        break;
    }
  }

  setConfig(config: Record<string, unknown>): void {
    this.config = config as { agents?: Record<string, AgentMeta>; activeRepo?: string };
    // Resolve repo theme.
    const repo = this.config.activeRepo?.toLowerCase() || "";
    this.repoTheme = REPO_THEMES[repo] || DEFAULT_THEME;
    // Try partial match (e.g. "Alfred Superintelligence Labs" contains known repo names).
    if (this.repoTheme === DEFAULT_THEME) {
      for (const [key, theme] of Object.entries(REPO_THEMES)) {
        if (repo.includes(key)) {
          this.repoTheme = theme;
          break;
        }
      }
    }
  }

  update(deltaMs: number): void {
    this.ambient.update(deltaMs, this.worldWidth, this.worldHeight, this.wallH);
    this.alfred.update(deltaMs);
    this.giovanni.update(deltaMs);
    for (const agent of this.agents.values()) {
      agent.update(deltaMs);
    }
    // Idle wandering for Alfred and Giovanni.
    this.maybeWander(this.alfred, deltaMs);
    this.maybeWander(this.giovanni, deltaMs);
    // Decay current tool display.
    if (this.currentToolTimer > 0) {
      this.currentToolTimer -= deltaMs;
      if (this.currentToolTimer <= 0) {
        this.currentTool = null;
      }
    }
  }

  getAlfredState(): "idle" | "thinking" | "writing" {
    return this.alfredState;
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

  getRepoTheme(): RepoTheme {
    return this.repoTheme;
  }

  getCurrentTool(): string | null {
    return this.currentTool;
  }

  getCurrentToolTimer(): number {
    return this.currentToolTimer;
  }

  getZoom(): number {
    return this._zoom;
  }

  getZt(): number {
    return this._zt;
  }

  getEventLog(): { type: string; label: string; timestamp: number }[] {
    return this.eventLog;
  }

  private logEvent(type: string, label: string): void {
    this.eventLog.push({ type, label, timestamp: Date.now() });
    // Keep max 64 entries.
    if (this.eventLog.length > 64) {
      this.eventLog.shift();
    }
  }

  private resetIdleTimer(): void {
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
    }
    this.idleTimer = window.setTimeout(() => {
      this.alfredState = "idle";
      this.alfred.setIdle();
      this.idleTimer = null;
    }, 5000);
  }

  private getAgentSlotPosition(slot: number): { x: number; y: number } {
    const zoom = this._zoom;
    // Agents stand on the floor at same level as Claude, spread in rows.
    const floorY = this.wallH + Math.floor((this.worldHeight - this.wallH) * 0.82);
    const rowSpacing = zoom * 12;
    const x = this.worldWidth * 0.15 + (slot % 6) * (this.worldWidth * 0.12);
    const y = floorY + Math.floor(slot / 6) * rowSpacing;
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

  // ── Idle wandering ───────────────────────────────────────

  private wanderTimers = new Map<string, number>();

  /** Occasionally send idle characters on a short walk. */
  private maybeWander(char: Character, deltaMs: number): void {
    if (char.state !== "idle") {
      this.wanderTimers.delete(char.id);
      return;
    }

    const timer = (this.wanderTimers.get(char.id) ?? 0) + deltaMs;
    // Wander every 4-8 seconds (randomized per character).
    const threshold = 4000 + (char.id.charCodeAt(0) % 5) * 1000;
    if (timer < threshold) {
      this.wanderTimers.set(char.id, timer);
      return;
    }
    this.wanderTimers.set(char.id, 0);

    // Pick a random walkable floor position.
    const floorY = this.wallH + Math.floor((this.worldHeight - this.wallH) * 0.82);
    const margin = this.worldWidth * 0.1;
    const tx = margin + Math.random() * (this.worldWidth - margin * 2);
    const ty = floorY + (Math.random() - 0.5) * this._zoom * 8;
    const path = this.pathfinder.findPath(char.x, char.y, tx, ty);
    if (path.length > 0) {
      char.moveAlongPath(path);
    }
  }
}
