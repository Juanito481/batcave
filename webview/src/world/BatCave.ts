/**
 * Game world state — manages Claude + agent characters with sprite animations.
 * Receives events from the extension host, drives Character entities.
 */

import { Character } from "../entities/Character";
import { Ambient } from "../entities/Ambient";
import { generateAllSprites, SpriteSheet } from "../canvas/SpriteGenerator";
import { Pathfinder, Rect } from "./Pathfinder";
import { AgentMeta, UsageStats } from "../../../shared/types";
import { bus } from "../systems/EventBus";

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

/** Companion NPC state — characters that come and go casually. */
interface CompanionState {
  id: string;
  name: string;
  emoji: string;
  char: Character | null;
  present: boolean;
  spawnTimer: number;
  spawnThreshold: number;
  stayTimer: number;
  stayThreshold: number;
  preferredZone: "server" | "workbench" | "display";
}

/** Audit IDs that trigger Francesco's appearance. */
const AUDIT_AGENTS = ["bishop", "black-bishop", "white-rook"];

export class BatCaveWorld {
  // Sprite sheets (generated once at init).
  private sprites: Map<string, SpriteSheet>;

  // Characters.
  alfred: Character;
  giovanni: Character;
  private agents: Map<string, Character> = new Map();

  // Companions (Ab, Andrea, Arturo) — appear/disappear casually.
  private companions: CompanionState[] = [];

  // Francesco — appears only during audit agents.
  private francesco: Character | null = null;
  private francescoVisible = false;

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

  // Session analytics — heatmap, tool breakdown, pace.
  private static readonly HEATMAP_SLOT_MS = 30_000; // 30s per slot
  private static readonly HEATMAP_SLOTS = 40;
  private heatmapSlots: number[] = new Array(BatCaveWorld.HEATMAP_SLOTS).fill(0);
  private heatmapOrigin = Date.now(); // timestamp of slot 0
  private toolBreakdown = { read: 0, write: 0, bash: 0, web: 0, agent: 0, other: 0 };
  private paceHistory: number[] = []; // tool counts per completed minute
  private paceMinuteStart = Date.now();
  private paceMinuteCount = 0;

  // Alfred quips.
  private quipTimer = 0;
  private quipThreshold = 30000 + Math.random() * 20000;
  private currentQuip: string | null = null;
  private quipDisplayTimer = 0;
  private static readonly QUIPS = [
    "Shall I prepare the next commit, sir?",
    "The cave is quiet tonight.",
    "Your context window is impeccable, sir.",
    "I've tidied the staging area, sir.",
    "Might I suggest a well-placed refactor?",
    "The agents are standing by, sir.",
    "Another fine session, if I may say so.",
    "Shall I fetch the test suite, sir?",
  ];

  // Bat Signal (context 100%).
  private batSignalTimer = 0;
  private batSignalShown = false;

  // Sound state (mirrored from extension settings for HUD display).
  private _soundEnabled = false;

  // Write clicks timer.
  private writeClickTimer = 0;

  // Giovanni Batcomputer behavior.
  private giovanniAtBc = false;
  private giovanniBcTimer = 0;
  private giovanniBcThreshold = 15000 + Math.random() * 10000;
  private giovanniBcWorkTimer = 0;
  private giovanniBcArrivalTimer: number | null = null;

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
      "alfred", "Alfred (Claude)", "🤖", alfredSprite,
      this.worldWidth / 2, this.worldHeight / 2
    );
    const giovanniSprite = this.sprites.get("giovanni")!;
    this.giovanni = new Character(
      "giovanni", "Giovanni (Batman)", "🦇", giovanniSprite,
      this.worldWidth * 0.3, this.worldHeight / 2
    );

    // Initialize companions — they start off-screen, spawning casually.
    this.companions = [
      {
        id: "ab", name: "Ab", emoji: "💻", char: null, present: false,
        spawnTimer: 0, spawnThreshold: 10000 + Math.random() * 20000,
        stayTimer: 0, stayThreshold: 30000 + Math.random() * 60000,
        preferredZone: "server",
      },
      {
        id: "andrea", name: "Andrea", emoji: "🦆", char: null, present: false,
        spawnTimer: 0, spawnThreshold: 15000 + Math.random() * 25000,
        stayTimer: 0, stayThreshold: 30000 + Math.random() * 60000,
        preferredZone: "workbench",
      },
      {
        id: "arturo", name: "Arturo", emoji: "🤘", char: null, present: false,
        spawnTimer: 0, spawnThreshold: 20000 + Math.random() * 30000,
        stayTimer: 0, stayThreshold: 30000 + Math.random() * 60000,
        preferredZone: "display",
      },
    ];
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

  reset(): void {
    // Clear all agents and timers.
    for (const timer of this.exitTimers.values()) {
      window.clearTimeout(timer);
    }
    this.exitTimers.clear();
    this.agents.clear();
    this.nextAgentSlot = 0;
    this.wanderTimers.clear();
    if (this.giovanniBcArrivalTimer !== null) {
      window.clearTimeout(this.giovanniBcArrivalTimer);
      this.giovanniBcArrivalTimer = null;
    }
    this.giovanniAtBc = false;
    this.eventLog.length = 0;
    this.usageStats = null;
    this.currentTool = null;
    this.currentToolTimer = 0;
    this.alfredState = "idle";
    this.alfred.setIdle();
    // Reset analytics.
    this.heatmapSlots.fill(0);
    this.heatmapOrigin = Date.now();
    this.toolBreakdown = { read: 0, write: 0, bash: 0, web: 0, agent: 0, other: 0 };
    this.paceHistory.length = 0;
    this.paceMinuteCount = 0;
    this.paceMinuteStart = Date.now();
    // Reset companions.
    for (const c of this.companions) {
      if (c.char && c.present) c.char.exit();
      c.present = false;
      c.spawnTimer = 0;
      c.spawnThreshold = 15000 + Math.random() * 30000;
      c.stayTimer = 0;
      c.stayThreshold = 30000 + Math.random() * 60000;
    }
    // Reset Francesco.
    if (this.francesco && this.francescoVisible) {
      this.francesco.exit();
      this.francescoVisible = false;
    }
  }

  handleEvent(event: Record<string, unknown>): void {
    const type = event.type as string;

    switch (type) {
      case "session_thinking":
        this.alfredState = "thinking";
        this.alfred.setAction();
        this.resetIdleTimer();
        bus.emit("session:state", { state: "thinking" });
        bus.emit("particle:spawn", { preset: "think-pulse", x: this.alfred.x, y: this.alfred.y - 20 });
        break;

      case "session_writing":
        this.alfredState = "writing";
        this.alfred.setAction();
        this.resetIdleTimer();
        bus.emit("session:state", { state: "writing" });
        bus.emit("particle:spawn", { preset: "write-glow", x: this.alfred.x, y: this.alfred.y - 10 });
        break;

      case "session_idle":
        this.alfredState = "idle";
        this.alfred.setIdle();
        bus.emit("session:state", { state: "idle" });
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
        bus.emit("agent:enter", { agentId, x: slotX, y: slotY });
        bus.emit("particle:spawn", { preset: "agent-enter", x: slotX, y: slotY });
        bus.emit("sound:play", { id: "agent-chime" });
        // Francesco appears during audit agents.
        if (AUDIT_AGENTS.includes(agentId)) {
          this.spawnFrancesco(slotX + this._zoom * 20, slotY);
        }
        break;
      }

      case "agent_exit": {
        const agentId = event.agentId as string;
        const char = this.agents.get(agentId);
        if (char) {
          this.logEvent("agent_exit", char.name);
          bus.emit("agent:exit", { agentId, x: char.x, y: char.y });
          bus.emit("particle:spawn", { preset: "agent-exit", x: char.x, y: char.y });
          bus.emit("sound:play", { id: "agent-exit" });
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
          // Francesco exits when audit agent exits (check if any audit agent still active).
          if (AUDIT_AGENTS.includes(agentId)) {
            const stillAuditing = AUDIT_AGENTS.some(
              a => a !== agentId && this.agents.has(a)
            );
            if (!stillAuditing) this.despawnFrancesco();
          }
        }
        break;
      }

      case "tool_start": {
        this.currentTool = (event.toolName as string) || null;
        this.currentToolTimer = 3000; // Show icon for 3s.
        this.logEvent("tool", this.currentTool || "?");
        if (this.alfredState === "idle") {
          this.alfredState = "thinking";
          this.alfred.setAction();
        }
        this.resetIdleTimer();
        bus.emit("tool:start", { toolName: this.currentTool || "?", x: this.alfred.x, y: this.alfred.y });
        bus.emit("particle:spawn", { preset: "tool-spark", x: this.alfred.x, y: this.alfred.y - 16 });
        // Analytics: heatmap + breakdown + pace.
        this.recordToolForAnalytics(this.currentTool || "?");
        break;
      }

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
        this.checkBatSignal();
        this.ambient.setContextPressure(this.usageStats.contextFillPct);
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
    // Update companions (casual spawn/stay/exit).
    this.updateCompanions(deltaMs);
    // Update Francesco if visible.
    if (this.francesco && this.francescoVisible) {
      this.francesco.update(deltaMs);
      this.maybeWander(this.francesco, deltaMs);
    }
    // Idle wandering for Alfred and Giovanni.
    this.maybeWander(this.alfred, deltaMs);
    this.maybeGiovanniBatcomputer(deltaMs);
    // Decay current tool display.
    if (this.currentToolTimer > 0) {
      this.currentToolTimer -= deltaMs;
      if (this.currentToolTimer <= 0) {
        this.currentTool = null;
      }
    }
    // Alfred quips (every 30-50s when idle).
    this.updateQuips(deltaMs);
    // Write clicks during writing state.
    this.updateWriteClicks(deltaMs);
    // Bat Signal decay.
    if (this.batSignalTimer > 0) {
      this.batSignalTimer -= deltaMs;
    }
    // Quip display decay.
    if (this.quipDisplayTimer > 0) {
      this.quipDisplayTimer -= deltaMs;
      if (this.quipDisplayTimer <= 0) {
        this.currentQuip = null;
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

  getCurrentQuip(): string | null {
    return this.currentQuip;
  }

  isBatSignalActive(): boolean {
    return this.batSignalTimer > 0;
  }

  isSoundEnabled(): boolean {
    return this._soundEnabled;
  }

  setSoundEnabled(on: boolean): void {
    this._soundEnabled = on;
  }

  getHeatmapSlots(): number[] {
    return this.heatmapSlots;
  }

  getToolBreakdown(): { read: number; write: number; bash: number; web: number; agent: number; other: number } {
    return this.toolBreakdown;
  }

  /** Returns average tools/min over last N completed minutes, and current minute rate. */
  getPace(): { avg: number; current: number; trend: "up" | "down" | "stable" } {
    const elapsed = (Date.now() - this.paceMinuteStart) / 60_000;
    const currentRate = elapsed > 0.1 ? this.paceMinuteCount / elapsed : 0;
    const avg = this.paceHistory.length > 0
      ? this.paceHistory.reduce((a, b) => a + b, 0) / this.paceHistory.length
      : currentRate;
    const diff = currentRate - avg;
    const trend = diff > 1.5 ? "up" : diff < -1.5 ? "down" : "stable";
    return { avg: Math.round(avg * 10) / 10, current: Math.round(currentRate * 10) / 10, trend };
  }

  private logEvent(type: string, label: string): void {
    this.eventLog.push({ type, label, timestamp: Date.now() });
    // Keep max 64 entries.
    if (this.eventLog.length > 64) {
      this.eventLog.shift();
    }
  }

  private recordToolForAnalytics(toolName: string): void {
    // Heatmap: increment current slot.
    const elapsed = Date.now() - this.heatmapOrigin;
    const slot = Math.min(
      BatCaveWorld.HEATMAP_SLOTS - 1,
      Math.floor(elapsed / BatCaveWorld.HEATMAP_SLOT_MS),
    );
    this.heatmapSlots[slot]++;

    // Tool breakdown.
    const cat = this.categoriseTool(toolName);
    this.toolBreakdown[cat]++;

    // Pace.
    this.paceMinuteCount++;
    const minElapsed = Date.now() - this.paceMinuteStart;
    if (minElapsed >= 60_000) {
      this.paceHistory.push(this.paceMinuteCount);
      if (this.paceHistory.length > 10) this.paceHistory.shift();
      this.paceMinuteCount = 0;
      this.paceMinuteStart = Date.now();
    }
  }

  private categoriseTool(tool: string): "read" | "write" | "bash" | "web" | "agent" | "other" {
    if (["Read", "Grep", "Glob"].includes(tool)) return "read";
    if (["Edit", "Write", "NotebookEdit"].includes(tool)) return "write";
    if (tool === "Bash") return "bash";
    if (["WebSearch", "WebFetch"].includes(tool)) return "web";
    if (["Agent", "Skill"].includes(tool)) return "agent";
    return "other";
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

  // ── Alfred quips ─────────────────────────────────────────

  private updateQuips(dt: number): void {
    if (this.alfredState !== "idle" || this.currentQuip) return;
    this.quipTimer += dt;
    // Quip every 30-50s of idle.
    if (this.quipTimer >= this.quipThreshold) {
      this.quipTimer = 0;
      this.quipThreshold = 30000 + Math.random() * 20000;
      const idx = Math.floor(Math.random() * BatCaveWorld.QUIPS.length);
      this.currentQuip = BatCaveWorld.QUIPS[idx];
      this.quipDisplayTimer = 4000;
    }
  }

  // ── Write clicks (disabled — only functional sounds now) ──

  private updateWriteClicks(_dt: number): void {
    // Intentionally empty — write clicks were ambient noise.
    // Only agent-chime and agent-exit sounds remain as functional notifications.
  }

  // ── Bat Signal ───────────────────────────────────────────

  // ── Giovanni at Batcomputer ───────────────────────────

  private maybeGiovanniBatcomputer(dt: number): void {
    if (this.giovanniAtBc) {
      // Working at the Batcomputer.
      this.giovanniBcWorkTimer += dt;
      if (this.giovanniBcWorkTimer >= 6000) {
        // Done working, walk away.
        this.giovanniAtBc = false;
        this.giovanniBcTimer = 0;
        this.giovanni.setIdle();
        this.maybeWander(this.giovanni, 99999); // Force wander away.
      }
      return;
    }

    if (this.giovanni.state !== "idle") {
      this.giovanniBcTimer = 0;
      return;
    }

    this.giovanniBcTimer += dt;
    // Every 15-25s, go to Batcomputer.
    if (this.giovanniBcTimer >= this.giovanniBcThreshold) {
      this.giovanniBcTimer = 0;
      this.giovanniBcThreshold = 15000 + Math.random() * 10000;
      this.giovanniBcWorkTimer = 0;
      // Walk to chair position (in front of Batcomputer).
      const bcX = Math.floor(this.worldWidth / 2);
      const chairY = this.wallH + Math.floor((this.worldHeight - this.wallH) * 0.55);
      const path = this.pathfinder.findPath(this.giovanni.x, this.giovanni.y, bcX, chairY);
      if (path.length > 0) {
        this.giovanni.moveAlongPath(path);
        this.giovanniAtBc = true;
        // Set action when he arrives (check in update via state).
        const checkArrival = () => {
          this.giovanniBcArrivalTimer = null;
          if (this.giovanni.state === "idle" && this.giovanniAtBc) {
            this.giovanni.setAction();
          } else if (this.giovanniAtBc) {
            this.giovanniBcArrivalTimer = window.setTimeout(checkArrival, 200);
          }
        };
        this.giovanniBcArrivalTimer = window.setTimeout(checkArrival, 500);
      }
    }
  }

  private checkBatSignal(): void {
    const pct = this.usageStats?.contextFillPct ?? 0;
    if (pct >= 100 && !this.batSignalShown) {
      this.batSignalShown = true;
      this.batSignalTimer = 10000;
    }
    if (pct < 100) {
      this.batSignalShown = false;
    }
  }

  // ── Companions (casual NPCs) ─────────────────────────

  /** Get a spawn position in the companion's preferred zone. */
  private getCompanionZonePosition(zone: "server" | "workbench" | "display"): { x: number; y: number } {
    const floorY = this.wallH + Math.floor((this.worldHeight - this.wallH) * 0.82);
    const zt = this._zt;
    const zoom = this._zoom;
    const bcTilesW = Math.min(5, Math.ceil(this.worldWidth / zt) - 1);
    const bcW = zt * bcTilesW;
    const bcX = Math.floor((this.worldWidth - bcW) / 2);

    switch (zone) {
      case "server":
        return { x: bcX - zt * 2, y: floorY - zoom * 4 };
      case "workbench":
        return { x: Math.floor(bcX - zt * 5), y: floorY };
      case "display":
        return { x: bcX + bcW + zt * 2, y: floorY - zoom * 4 };
    }
  }

  private updateCompanions(dt: number): void {
    for (const c of this.companions) {
      if (!c.present) {
        // Not in cave — count toward next spawn.
        c.spawnTimer += dt;
        if (c.spawnTimer >= c.spawnThreshold) {
          c.spawnTimer = 0;
          c.stayTimer = 0;
          c.stayThreshold = 30000 + Math.random() * 60000;
          // Create or reuse character.
          const pos = this.getCompanionZonePosition(c.preferredZone);
          if (!c.char) {
            const sprite = this.sprites.get(c.id);
            if (!sprite) continue;
            c.char = new Character(c.id, c.name, c.emoji, sprite, pos.x, this.worldHeight + 30);
          }
          c.char.enter(pos.x, pos.y);
          c.present = true;
        }
      } else {
        // In cave — update character, wander, count toward exit.
        if (c.char) {
          c.char.update(dt);
          this.maybeWander(c.char, dt);
        }
        c.stayTimer += dt;
        if (c.stayTimer >= c.stayThreshold) {
          // Time to leave.
          if (c.char) c.char.exit();
          c.present = false;
          c.spawnTimer = 0;
          c.spawnThreshold = 20000 + Math.random() * 40000;
          // Clean up after exit animation.
          window.setTimeout(() => {
            if (c.char && !c.present) c.char.visible = false;
          }, 500);
        }
      }
    }
  }

  /** Visible companions for rendering. */
  getVisibleCompanions(): Character[] {
    const result: Character[] = [];
    for (const c of this.companions) {
      if (c.present && c.char && c.char.visible) result.push(c.char);
    }
    return result;
  }

  /** Companion status for HUD. */
  getCompanionStatus(): { name: string; present: boolean }[] {
    return this.companions.map(c => ({ name: c.name, present: c.present }));
  }

  // ── Francesco (audit-triggered) ──────────────────────

  private spawnFrancesco(x: number, y: number): void {
    if (this.francescoVisible) return;
    if (!this.francesco) {
      const sprite = this.sprites.get("francesco");
      if (!sprite) return;
      this.francesco = new Character("francesco", "Francesco", "👔", sprite, x, this.worldHeight + 30);
    }
    this.francesco.enter(x, y);
    this.francescoVisible = true;
  }

  private despawnFrancesco(): void {
    if (!this.francescoVisible || !this.francesco) return;
    this.francesco.exit();
    this.francescoVisible = false;
    window.setTimeout(() => {
      if (this.francesco && !this.francescoVisible) this.francesco.visible = false;
    }, 500);
  }

  /** Francesco character for rendering (null if not visible). */
  getFrancesco(): Character | null {
    return this.francescoVisible && this.francesco?.visible ? this.francesco : null;
  }
}
