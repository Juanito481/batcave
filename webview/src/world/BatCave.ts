/**
 * Game world state — manages Claude + agent characters with sprite animations.
 * Receives events from the extension host, drives Character entities.
 */

import { Character, IdleStyle } from "../entities/Character";
import { Ambient } from "../entities/Ambient";
import { generateAllSprites, SpriteSheet } from "../canvas/SpriteGenerator";
import { Pathfinder, Rect } from "./Pathfinder";
import { AgentMeta, UsageStats } from "../../../shared/types";
import { bus } from "../systems/EventBus";
import {
  AGENT_PERSONALITIES,
  CAVE_MILESTONES,
  BodyType,
} from "../data/agent-personalities";
import { AgentBehaviorSystem } from "./AgentBehaviorSystem";
import { CompanionSystem, AUDIT_AGENTS } from "./CompanionSystem";
import {
  Achievement,
  ACHIEVEMENTS,
  AchievementContext,
  UnlockedAchievement,
  CaveDepthLayer,
  CAVE_DEPTHS,
  SmartAlert,
  AlertSeverity,
  FileNode,
} from "../data/gamification";
import { CaveLayout, getLayout } from "../canvas/layout";
import { FourthWallSystem } from "../systems/FourthWallSystem";
import { CaveReactionSystem } from "../systems/CaveReactionSystem";
import { ProgressionSystem } from "../systems/ProgressionSystem";
import { KeyboardHandler } from "../systems/KeyboardHandler";

/** Per-agent session statistics for enterprise observability. */
export interface AgentSessionStats {
  agentId: string;
  agentName: string;
  emoji: string;
  enterTime: number; // timestamp of first enter
  exitTime: number | null; // null = still active
  totalActiveMs: number; // cumulative active duration
  toolCount: number; // tools used while this agent was active
  toolBreakdown: {
    read: number;
    write: number;
    bash: number;
    web: number;
    other: number;
  };
  filesTouched: string[]; // unique file paths
  invocations: number; // how many times spawned this session
}

/** Audit trail entry — immutable record of an AI action. */
export interface AuditEntry {
  seq: number; // monotonic sequence number
  timestamp: number;
  category: "tool" | "agent" | "state" | "git" | "system";
  action: string; // e.g. "tool_start", "agent_enter", "git_commit"
  detail: string; // human-readable detail
  filePath?: string; // file involved (if any)
  agentId?: string; // agent involved (if any)
  toolName?: string; // tool name (if tool event)
}

/** Repo-specific color themes for the cave environment. */
export interface RepoTheme {
  accent: string;
  accentDark: string;
  ledColor: string;
  label: string;
}

const REPO_THEMES: Record<string, RepoTheme> = {
  harriet: {
    accent: "#1E7FD8",
    accentDark: "#122840",
    ledColor: "#1a4a8a",
    label: "HARRIET",
  },
  lucius: {
    accent: "#9B59B6",
    accentDark: "#2a1840",
    ledColor: "#6a3a8a",
    label: "LUCIUS",
  },
  fox: {
    accent: "#E74C3C",
    accentDark: "#3a1418",
    ledColor: "#8a2a2a",
    label: "FOX",
  },
  "pennyworth-cortex": {
    accent: "#2ECC71",
    accentDark: "#0e2a18",
    ledColor: "#1a6a3a",
    label: "CORTEX",
  },
  "alfred-mvp": {
    accent: "#F39C12",
    accentDark: "#3a2810",
    ledColor: "#8a6a1a",
    label: "ALFRED",
  },
  "alfred-web": {
    accent: "#1E7FD8",
    accentDark: "#122840",
    ledColor: "#1a4a8a",
    label: "WEB",
  },
  robin: {
    accent: "#E67E22",
    accentDark: "#3a2010",
    ledColor: "#8a5a1a",
    label: "ROBIN",
  },
  batcave: {
    accent: "#1E7FD8",
    accentDark: "#122840",
    ledColor: "#1a4a8a",
    label: "BATCAVE",
  },
};

const DEFAULT_THEME: RepoTheme = {
  accent: "#1E7FD8",
  accentDark: "#122840",
  ledColor: "#1a4a8a",
  label: "---",
};

export class BatCaveWorld {
  // Sprite sheets (generated once at init).
  private sprites: Map<string, SpriteSheet>;

  // Characters.
  alfred: Character;
  giovanni: Character;
  private agents: Map<string, Character> = new Map();

  // Companion NPC system (Ab, Andrea, Arturo + Francesco).
  private companionSystem!: CompanionSystem;

  // Fourth wall system — Giovanni mirror + Alfred awareness.
  private fourthWall!: FourthWallSystem;

  // Cave reaction system — event-driven environmental effects.
  private caveReactions = new CaveReactionSystem();

  // Progression system — XP, levels, cave upgrades, streak.
  private progression = new ProgressionSystem();

  // Keyboard handler — Konami code and easter eggs.
  private keyboard = new KeyboardHandler();

  // Agent behavior system (zone movement, quips, interactions).
  private behaviorSystem!: AgentBehaviorSystem;

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
  private config: { agents?: Record<string, AgentMeta>; activeRepo?: string } =
    {};

  // Repo theme.
  private repoTheme: RepoTheme = DEFAULT_THEME;

  // Current tool (for tool visualization).
  private currentTool: string | null = null;
  private currentToolTimer = 0;
  private consecutiveBashCount = 0;

  // Recent files touched — ring buffer for Batcomputer left screen.
  private recentFiles: { name: string; tool: string; timestamp: number }[] = [];
  private static readonly MAX_RECENT_FILES = 8;

  // Agent history — chronological log for display panel.
  private agentHistory: {
    id: string;
    name: string;
    emoji: string;
    action: "enter" | "exit";
    timestamp: number;
  }[] = [];
  private static readonly MAX_AGENT_HISTORY = 10;

  // Per-agent stats — enterprise observability.
  private agentStats = new Map<string, AgentSessionStats>();

  // Cost estimation — token-based pricing.
  private static readonly COST_PER_INPUT_TOKEN = 15 / 1_000_000; // $15/M input tokens (Opus)
  private static readonly COST_PER_OUTPUT_TOKEN = 75 / 1_000_000; // $75/M output tokens (Opus)
  private static readonly EST_INPUT_RATIO = 0.7; // ~70% of tokens are input (context, tools)
  private static readonly EST_OUTPUT_RATIO = 0.3; // ~30% are output (responses)

  // Git activity — for wall monitor.
  private gitLog: {
    type: "commit" | "push";
    message: string;
    timestamp: number;
  }[] = [];
  private static readonly MAX_GIT_LOG = 6;

  // Todo list — for whiteboard.
  private todoList: {
    content: string;
    status: "pending" | "in_progress" | "completed";
  }[] = [];

  // Whiteboard custom message.
  private whiteboardMessage: string | null = null;

  // Audit trail — structured immutable log of all AI actions.
  private auditTrail: AuditEntry[] = [];
  private static readonly MAX_AUDIT_ENTRIES = 200;

  private auditSeq = 0;

  // Legacy event log (for timeline compatibility).
  private eventLog: { type: string; label: string; timestamp: number }[] = [];

  // Session analytics — heatmap, tool breakdown, pace.
  private static readonly HEATMAP_SLOT_MS = 30_000; // 30s per slot
  private static readonly HEATMAP_SLOTS = 40;
  private heatmapSlots: number[] = new Array(BatCaveWorld.HEATMAP_SLOTS).fill(
    0,
  );
  private heatmapOrigin = Date.now(); // timestamp of slot 0
  private toolBreakdown = {
    read: 0,
    write: 0,
    bash: 0,
    web: 0,
    agent: 0,
    other: 0,
  };
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

  // Multi-session.
  private otherSessions: {
    label: string;
    lastActive: number;
    isCurrent: boolean;
  }[] = [];

  // Interactive dashboard — expanded panel.
  private expandedPanel:
    | "files"
    | "stats"
    | "agents"
    | "agent-detail"
    | "achievement-detail"
    | "history"
    | "audit"
    | "achievements"
    | null = null;
  private selectedAgentId: string | null = null;
  private selectedAchievementId: string | null = null;

  // Session history (from extension globalState).
  private sessionHistory: import("../../../shared/types").SessionSummary[] = [];

  // Session ID (unique per init).
  private sessionId = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Peak context tracking.
  private contextPeakPct = 0;

  // Replay mode.
  private replayMode = false;

  // ── Gamification ─────────────────────────────────────
  private unlockedAchievements: UnlockedAchievement[] = [];
  private caveDepth = 1;
  private sessionsUnderBudget = 0;
  private totalSessionsCumulative = 0;

  // ── Workspace Map ────────────────────────────────────
  private fileNodes = new Map<string, FileNode>();
  private static readonly MAX_FILE_NODES = 40;

  // ── Smart Alerts ─────────────────────────────────────
  private smartAlerts: SmartAlert[] = [];
  private static readonly MAX_ALERTS = 10;
  private alertSeq = 0;
  private fileReadRepeatTracker = new Map<string, number>(); // path → consecutive reads without write

  // Cave evolution — milestone tracking.
  private caveLevel = 1;
  private totalToolsCumulative = 0;
  private lastMilestoneNotified = 0;

  // Agent enter pulse — timestamp of last agent_enter for LED wave effect.
  private _agentPulseStart = 0;

  // Celebration cutscene — first commit triggers a one-time burst + sound.
  private firstCommitDone = false;

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
  private _layout: CaveLayout | null = null;

  constructor() {
    this.sprites = generateAllSprites();
    this.ambient = new Ambient();
    this.pathfinder = new Pathfinder();

    const alfredSprite = this.sprites.get("alfred")!;
    this.alfred = new Character(
      "alfred",
      "Alfred (Claude)",
      "🤖",
      alfredSprite,
      this.worldWidth / 2,
      this.worldHeight / 2,
    );
    const giovanniSprite = this.sprites.get("giovanni")!;
    this.giovanni = new Character(
      "giovanni",
      "Giovanni (Batman)",
      "🦇",
      giovanniSprite,
      this.worldWidth * 0.3,
      this.worldHeight / 2,
    );

    // Behavior system: zone movement, quips, interactions.
    this.behaviorSystem = new AgentBehaviorSystem({
      pathfinder: this.pathfinder,
      getAlfred: () => this.alfred,
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
      wallH: this.wallH,
      zoom: this._zoom,
      zt: this._zt,
    });

    // Companion system: Ab, Andrea, Arturo + Francesco.
    this.companionSystem = new CompanionSystem({
      sprites: this.sprites,
      pathfinder: this.pathfinder,
      maybeWander: (char, dt) => this.maybeWander(char, dt),
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
      wallH: this.wallH,
      zoom: this._zoom,
      zt: this._zt,
    });

    // Fourth wall system: Giovanni mirror + Alfred fourth wall.
    this.fourthWall = new FourthWallSystem({
      getAlfred: () => this.alfred,
      getGiovanni: () => this.giovanni,
      getActiveRepo: () => this.repoTheme.label || "",
      getSessionToolCount: () => this.usageStats?.toolCallsThisSession ?? 0,
      getSessionDurationMs: () =>
        Date.now() - (this.usageStats?.sessionStartedAt ?? Date.now()),
      getTotalSessionsCumulative: () => this.totalSessionsCumulative,
      getAlfredState: () => this.alfredState,
      getBatcomputerPos: () => {
        const L = this._layout;
        return L
          ? { x: L.bcX + L.bcW / 2, y: L.bcY + L.bcH }
          : { x: this.worldWidth / 2, y: this.worldHeight / 2 };
      },
      getFloorY: () =>
        this._layout?.floorY ??
        this.wallH + Math.floor((this.worldHeight - this.wallH) * 0.82),
      getZoom: () => this._zoom,
    });
  }

  /** Set canvas dimensions and wall height so we can position characters. */
  setDimensions(w: number, h: number, wallH: number): void {
    this.worldWidth = w;
    this.worldHeight = h;
    this.wallH = wallH;

    const T = 16;
    this._zoom = Math.max(
      2,
      Math.min(Math.floor(w / (16 * T)), Math.floor(h / (8 * T))),
    );
    this._zt = T * this._zoom;

    // Single source of truth for all furniture positions.
    const L = getLayout(w, h, this._zoom, this._zt, wallH);
    this._layout = L;

    // Build obstacle rects from centralized layout.
    this.obstacles = [
      // Cave wall (entire top area is not walkable).
      { x: 0, y: 0, w: w, h: wallH },
      // Batcomputer + desk legs.
      { x: L.bcX, y: L.bcY, w: L.bcW, h: L.bcH + L.zoom * 3 },
      // Server rack.
      { x: L.serverX, y: L.serverY, w: L.serverW, h: L.serverH },
      // Workbench.
      { x: L.workbenchX, y: L.workbenchY, w: L.workbenchW, h: L.workbenchH },
      // Display panel.
      { x: L.displayX, y: L.displayY, w: L.displayW, h: L.displayH },
      // Chair.
      { x: L.chairX, y: L.chairY, w: L.chairW, h: L.chairH },
    ];

    // Rebuild pathfinder grid.
    const cellSize = Math.max(8, this._zt / 2);
    this.pathfinder.buildGrid(w, h, cellSize, this.obstacles);

    // Position characters on the floor.
    this.alfred.x = w / 2;
    this.alfred.y = L.floorY;
    this.giovanni.x = w * 0.3;
    this.giovanni.y = L.floorY;

    // Propagate new dimensions to subsystems.
    this.behaviorSystem.updateDimensions(w, h, wallH, this._zoom, this._zt);
    this.companionSystem.updateDimensions(w, h, wallH, this._zoom, this._zt);
  }

  /** Get centralized layout (null before first setDimensions call). */
  getLayout(): CaveLayout | null {
    return this._layout;
  }

  /** Find a path from (sx,sy) to (tx,ty) avoiding furniture. */
  findPath(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
  ): { x: number; y: number }[] {
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
    this.toolBreakdown = {
      read: 0,
      write: 0,
      bash: 0,
      web: 0,
      agent: 0,
      other: 0,
    };
    this.paceHistory.length = 0;
    this.paceMinuteCount = 0;
    this.paceMinuteStart = Date.now();
    // Reset companion + behavior systems.
    this.companionSystem.reset();
    this.behaviorSystem.reset();
  }

  handleEvent(event: Record<string, unknown>): void {
    // In replay mode, only process events from processReplayEntry.
    // Live events from the activity monitor are ignored.
    if (this.replayMode && !(event as Record<string, unknown>)._replay) {
      // Tag replay events in processReplayEntry instead — this guard
      // prevents double-processing. Live events simply pass through.
    }

    const type = event.type as string;

    switch (type) {
      case "session_thinking":
        this.alfredState = "thinking";
        this.alfred.setAction();
        this.resetIdleTimer();
        this.audit("state", "session_thinking", "Claude is thinking");
        bus.emit("session:state", { state: "thinking" });
        bus.emit("particle:spawn", {
          preset: "think-pulse",
          x: this.alfred.x,
          y: this.alfred.y - 20,
        });
        break;

      case "session_writing":
        this.alfredState = "writing";
        this.alfred.setAction();
        this.resetIdleTimer();
        this.audit("state", "session_writing", "Claude is writing");
        bus.emit("session:state", { state: "writing" });
        bus.emit("particle:spawn", {
          preset: "write-glow",
          x: this.alfred.x,
          y: this.alfred.y - 10,
        });
        break;

      case "session_idle":
        this.alfredState = "idle";
        this.alfred.setIdle();
        this.audit("state", "session_idle", "Claude is idle");
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
        const { x: slotX, y: slotY } = this.getAgentSlotPosition(slot, agentId);

        // Agents enter from the cave entrance (right side) and walk to their zone.
        const entranceX = this.worldWidth * 0.95;
        const entranceY = slotY;
        const char = new Character(
          agentId,
          meta?.name || agentId,
          meta?.emoji || "?",
          sprite,
          entranceX,
          entranceY,
        );
        char.setIdleStyle(this.getIdleStyleForAgent(agentId));
        char.enter(entranceX, entranceY);
        // Queue walk to actual zone position after enter animation.
        this.behaviorSystem.queueWalkToZone(agentId, { x: slotX, y: slotY });
        this.agents.set(agentId, char);
        this.logEvent("agent_enter", meta?.name || agentId);
        this.audit(
          "agent",
          "agent_enter",
          `${meta?.emoji || "?"} ${meta?.name || agentId} entered`,
          { agentId },
        );
        this._agentPulseStart = Date.now();
        this.caveReactions.triggerTorchBoost();
        // Other agents react to the newcomer.
        this.behaviorSystem.reactToAgentEnter(agentId, this.agents);
        this.trackAgentHistory(
          agentId,
          meta?.name || agentId,
          meta?.emoji || "?",
          "enter",
        );
        this.trackAgentEnter(
          agentId,
          meta?.name || agentId,
          meta?.emoji || "?",
        );
        bus.emit("agent:enter", { agentId, x: slotX, y: slotY });
        bus.emit("particle:spawn", {
          preset: "agent-enter",
          x: slotX,
          y: slotY,
        });
        bus.emit("sound:play", { id: "agent-chime" });
        // Francesco appears during audit agents.
        if (AUDIT_AGENTS.includes(agentId)) {
          this.companionSystem.spawnFrancesco(slotX + this._zoom * 20, slotY);
        }
        break;
      }

      case "agent_exit": {
        const agentId = event.agentId as string;
        const char = this.agents.get(agentId);
        if (char) {
          this.logEvent("agent_exit", char.name);
          this.audit(
            "agent",
            "agent_exit",
            `${char.emoji} ${char.name} exited`,
            { agentId },
          );
          this.trackAgentHistory(agentId, char.name, char.emoji, "exit");
          this.trackAgentExit(agentId);
          bus.emit("agent:exit", { agentId, x: char.x, y: char.y });
          bus.emit("particle:spawn", {
            preset: "agent-exit",
            x: char.x,
            y: char.y,
          });
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
            this.behaviorSystem.cleanupAgent(agentId);
            this.repackSlots();
          }, 500);
          this.exitTimers.set(agentId, timer);
          // Francesco exits when audit agent exits (check if any audit agent still active).
          if (AUDIT_AGENTS.includes(agentId)) {
            const stillAuditing = AUDIT_AGENTS.some(
              (a) => a !== agentId && this.agents.has(a),
            );
            if (!stillAuditing) this.companionSystem.despawnFrancesco();
          }
        }
        break;
      }

      case "tool_start": {
        this.currentTool = (event.toolName as string) || null;
        this.currentToolTimer = 3000; // Show icon for 3s.
        this.logEvent("tool", this.currentTool || "?");
        {
          const fp = (event as Record<string, unknown>).filePath as
            | string
            | undefined;
          this.audit(
            "tool",
            "tool_start",
            `${this.currentTool}${fp ? ` → ${fp.split("/").pop()}` : ""}`,
            {
              toolName: this.currentTool || undefined,
              filePath: fp || undefined,
            },
          );
        }

        // Track file touched for Batcomputer screen.
        const filePath = (event as Record<string, unknown>).filePath as
          | string
          | undefined;
        if (filePath) {
          const parts = filePath.split("/");
          const fileName = parts[parts.length - 1] || filePath;
          this.recentFiles.push({
            name: fileName,
            tool: this.currentTool || "?",
            timestamp: Date.now(),
          });
          if (this.recentFiles.length > BatCaveWorld.MAX_RECENT_FILES) {
            this.recentFiles.shift();
          }
        }

        if (this.alfredState === "idle") {
          this.alfredState = "thinking";
          this.alfred.setAction();
        }
        this.resetIdleTimer();
        bus.emit("tool:start", {
          toolName: this.currentTool || "?",
          x: this.alfred.x,
          y: this.alfred.y,
        });
        bus.emit("particle:spawn", {
          preset: "tool-spark",
          x: this.alfred.x,
          y: this.alfred.y - 16,
        });
        // Alfred confirms write/edit tools with a check emotion.
        if (this.currentTool === "Edit" || this.currentTool === "Write") {
          this.alfred.showEmotion("check", 1000);
        }
        // Cave reacts to tool types.
        if (this.currentTool === "Bash") {
          this.caveReactions.triggerServerGlow();
          this.consecutiveBashCount++;
        } else {
          this.consecutiveBashCount = 0;
        }
        // Agents react to tools (opinions, movements).
        this.behaviorSystem.reactToTool(
          this.currentTool || "?",
          this.agents,
          this.consecutiveBashCount,
        );

        // XP for tool call.
        this.progression.awardXp(this.currentTool || "Read");
        // Analytics: heatmap + breakdown + pace + evolution.
        this.recordToolForAnalytics(this.currentTool || "?");
        this.attributeToolToAgents(this.currentTool || "?", filePath || null);
        if (filePath) this.trackFileNode(filePath, this.currentTool || "?");
        this.detectSmartAlerts(this.currentTool || "?", filePath || null);
        this.totalToolsCumulative++;
        this.checkCaveEvolution();
        // Gamification checks every 20 tools.
        if (this.totalToolsCumulative % 20 === 0) {
          this.checkAchievements();
          this.checkCaveDepth();
        }
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
        if (this.usageStats.contextFillPct > this.contextPeakPct) {
          this.contextPeakPct = this.usageStats.contextFillPct;
        }
        this.checkBatSignal();
        this.ambient.setContextPressure(this.usageStats.contextFillPct);
        break;

      case "git_commit": {
        const msg = (event as Record<string, unknown>).message as string;
        this.gitLog.push({
          type: "commit",
          message: msg,
          timestamp: Date.now(),
        });
        if (this.gitLog.length > BatCaveWorld.MAX_GIT_LOG) this.gitLog.shift();
        this.audit("git", "git_commit", `commit: ${msg.slice(0, 60)}`);

        // Fourth wall: Giovanni nods on commit.
        this.fourthWall.onGitCommit();
        // Cave reacts: green wall flash.
        this.caveReactions.triggerCommitFlash();
        // XP for commit.
        this.progression.awardXp("commit");
        // Bishop judges short commit messages.
        if (msg.length < 10) {
          this.behaviorSystem.reactToShortCommitMessage(this.agents);
        }

        // All active agents + Alfred celebrate with star; Giovanni confirms.
        this.alfred.showEmotion("star", 2000);
        for (const agent of this.agents.values()) {
          if (agent.visible) agent.showEmotion("star", 2000);
        }

        // First commit ever this session → one-time celebration cutscene.
        if (!this.firstCommitDone) {
          this.firstCommitDone = true;
          bus.emit("particle:spawn", {
            preset: "agent-enter",
            x: this.alfred.x,
            y: this.alfred.y - 20,
          });
          bus.emit("sound:play", { id: "agent-chime" });
          // Override with longer star on all visible characters.
          this.alfred.showEmotion("star", 2500);
          this.giovanni.showEmotion("star", 2500);
          for (const agent of this.agents.values()) {
            if (agent.visible) agent.showEmotion("star", 2500);
          }
          for (const c of this.companionSystem.getVisibleCompanions()) {
            c.showEmotion("star", 2500);
          }
        }
        break;
      }

      case "git_push":
        this.gitLog.push({
          type: "push",
          message: "pushed to remote",
          timestamp: Date.now(),
        });
        if (this.gitLog.length > BatCaveWorld.MAX_GIT_LOG) this.gitLog.shift();
        this.audit("git", "git_push", "pushed to remote");
        // Fourth wall: Giovanni celebrates push.
        this.fourthWall.onGitPush();
        // Cave reacts: blue wall flash.
        this.caveReactions.triggerPushFlash();
        // XP for push.
        this.progression.awardXp("push");
        // Deploy sparks weather effect.
        this.ambient.setWeather("sparks");
        break;

      case "todo_update": {
        const todos = (event as Record<string, unknown>).todos as {
          content: string;
          status: "pending" | "in_progress" | "completed";
        }[];
        if (Array.isArray(todos)) {
          this.todoList = todos;
        }
        break;
      }

      case "sessions_list": {
        const sessions = (event as Record<string, unknown>).sessions as {
          label: string;
          lastActive: number;
          isCurrent: boolean;
        }[];
        if (Array.isArray(sessions)) {
          this.otherSessions = sessions;
        }
        break;
      }
    }
  }

  setConfig(config: Record<string, unknown>): void {
    this.config = config as {
      agents?: Record<string, AgentMeta>;
      activeRepo?: string;
    };
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
    // Cave breathing: thinking doubles drip frequency, writing is normal, idle is calm.
    this.ambient.setStateBoost(this.alfredState === "thinking" ? 0.5 : 1);
    // Fog when context pressure is high (>80%).
    const ctxPct = this.usageStats?.contextFillPct ?? 0;
    if (ctxPct > 80) {
      this.ambient.setWeather("fog");
    } else if (ctxPct <= 75) {
      // Hysteresis: only clear fog below 75% to avoid flicker.
      this.ambient.setWeather("clear");
    }
    this.ambient.update(deltaMs, this.worldWidth, this.worldHeight, this.wallH);
    this.alfred.update(deltaMs);
    this.giovanni.update(deltaMs);
    // Agent behaviors (zone movement, quips, interactions) — delegates update + Character.update.
    this.behaviorSystem.update(deltaMs, this.agents);
    // Companion NPCs (Ab, Andrea, Arturo) and Francesco.
    this.companionSystem.updateCompanions(deltaMs);
    this.companionSystem.updateFrancesco(deltaMs, (char, dt) =>
      this.maybeWander(char, dt),
    );
    // Fourth wall system — Giovanni mirror + Alfred awareness.
    this.fourthWall.update(deltaMs);
    this.fourthWall.tickQuipTimer(deltaMs);
    // Cave reactions — event-driven environmental effects.
    this.caveReactions.update(deltaMs);
    // Progression system — XP and level-up popup.
    this.progression.update(deltaMs);
    // Keyboard easter eggs.
    this.keyboard.update(deltaMs);
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
    // Achievement popup decay.
    if (this.achievementPopup) {
      this.achievementPopup.timer -= deltaMs;
      if (this.achievementPopup.timer <= 0) {
        this.achievementPopup = null;
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
    return Array.from(this.agents.values())
      .filter((a) => a.visible)
      .map((a) => a.name);
  }

  getRepoTheme(): RepoTheme {
    return this.repoTheme;
  }

  /** Cave reaction state for rendering layers. */
  getCaveReactions(): import("../systems/CaveReactionSystem").CaveReactionState {
    return this.caveReactions.getState();
  }

  /** Progression system — for HUD rendering. */
  getProgression(): ProgressionSystem {
    return this.progression;
  }

  /** Keyboard handler — for easter eggs. */
  getKeyboard(): KeyboardHandler {
    return this.keyboard;
  }

  /** Easter egg state for rendering. */
  getEasterEggs(): import("../systems/KeyboardHandler").EasterEggState {
    return this.keyboard.getEasterEggState();
  }

  private trackAgentHistory(
    id: string,
    name: string,
    emoji: string,
    action: "enter" | "exit",
  ): void {
    this.agentHistory.push({ id, name, emoji, action, timestamp: Date.now() });
    if (this.agentHistory.length > BatCaveWorld.MAX_AGENT_HISTORY)
      this.agentHistory.shift();
  }

  /** Agent history for display panel. */
  getAgentHistory(): {
    id: string;
    name: string;
    emoji: string;
    action: "enter" | "exit";
  }[] {
    return this.agentHistory.slice(-6);
  }

  /** Git log for wall monitor. */
  getGitLog(): { type: "commit" | "push"; message: string }[] {
    return this.gitLog.slice(-4);
  }

  /** Todo list for whiteboard. */
  getTodoList(): {
    content: string;
    status: "pending" | "in_progress" | "completed";
  }[] {
    return this.todoList;
  }

  /** Whiteboard custom message. */
  getWhiteboardMessage(): string | null {
    return this.whiteboardMessage;
  }

  setWhiteboardMessage(msg: string | null): void {
    this.whiteboardMessage = msg;
  }

  /** Timestamp of last agent_enter (for LED wave). 0 if never. */
  getAgentPulseStart(): number {
    return this._agentPulseStart;
  }

  /** Recent files for Batcomputer left screen. */
  getRecentFiles(): { name: string; tool: string }[] {
    return this.recentFiles.slice(-5);
  }

  /** Screen data for Batcomputer center screen. */
  getActiveToolDisplay(): { tool: string; state: string } {
    return {
      tool: this.currentTool || "---",
      state: this.alfredState.toUpperCase(),
    };
  }

  /** Screen data for Batcomputer right screen. */
  getSessionStats(): {
    contextPct: number;
    toolCount: number;
    duration: string;
  } {
    const stats = this.usageStats;
    const elapsed = Date.now() - (stats?.sessionStartedAt ?? Date.now());
    const mins = Math.floor(elapsed / 60_000);
    const secs = Math.floor((elapsed % 60_000) / 1000);
    return {
      contextPct: stats?.contextFillPct ?? 0,
      toolCount: stats?.toolCallsThisSession ?? 0,
      duration: mins > 0 ? `${mins}m ${secs}s` : `${secs}s`,
    };
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
    // Fourth wall quips take priority over idle quips.
    const fwQuip = this.fourthWall.getAlfredQuip();
    if (fwQuip) return fwQuip;
    return this.currentQuip;
  }

  isBatSignalActive(): boolean {
    return this.batSignalTimer > 0;
  }

  isSoundEnabled(): boolean {
    return this._soundEnabled;
  }

  /** Other active Claude sessions. */
  getOtherSessions(): {
    label: string;
    lastActive: number;
    isCurrent: boolean;
  }[] {
    return this.otherSessions;
  }

  /** Currently expanded panel (null = none). */
  getExpandedPanel():
    | "files"
    | "stats"
    | "agents"
    | "agent-detail"
    | "achievement-detail"
    | "history"
    | "audit"
    | "achievements"
    | null {
    return this.expandedPanel;
  }

  /** Toggle or set expanded panel. */
  setExpandedPanel(
    panel:
      | "files"
      | "stats"
      | "agents"
      | "agent-detail"
      | "achievement-detail"
      | "history"
      | "audit"
      | "achievements"
      | null,
  ): void {
    this.expandedPanel = this.expandedPanel === panel ? null : panel;
    if (panel !== "agent-detail") this.selectedAgentId = null;
    if (panel !== "achievement-detail") this.selectedAchievementId = null;
  }

  /** Handle click at canvas coordinates — hit test Batcomputer screens. */
  handleClick(cx: number, cy: number): void {
    const zoom = this._zoom;
    const L = this._layout;
    if (!L) return;

    const screenGap = Math.floor(zoom * 3);

    // Left screen → files (toggle).
    if (
      cx >= L.bcX + screenGap &&
      cx <= L.bcX + screenGap + L.screenW &&
      cy >= L.bcY &&
      cy <= L.bcY + L.bcH
    ) {
      this.setExpandedPanel("files");
      return;
    }
    // Center screen → stats (toggle).
    if (
      cx >= L.bcX + screenGap + L.screenW + screenGap &&
      cx <= L.bcX + screenGap + L.screenW * 2 + screenGap &&
      cy >= L.bcY &&
      cy <= L.bcY + L.bcH
    ) {
      this.setExpandedPanel("stats");
      return;
    }
    // Right screen → agents (toggle).
    if (
      cx >= L.bcX + (screenGap + L.screenW) * 2 + screenGap &&
      cx <= L.bcX + L.bcW - screenGap &&
      cy >= L.bcY &&
      cy <= L.bcY + L.bcH
    ) {
      this.setExpandedPanel("agents");
      return;
    }
    // Click on LAUNCH button in agent-detail panel.
    if (this.expandedPanel === "agent-detail" && this.selectedAgentId) {
      const panelW = Math.min(this.worldWidth * 0.7, 440);
      const panelH = Math.min(this.worldHeight * 0.7, 360);
      const panelX = Math.floor((this.worldWidth - panelW) / 2);
      const panelY = Math.floor((this.worldHeight - panelH) / 2);
      const pad = zoom * 4;
      const fontSize = Math.max(7, zoom * 3);
      const launchBtnX = panelX + panelW - pad - zoom * 16;
      const launchBtnY = panelY + pad + fontSize + Math.floor(pad * 0.6) + pad;
      const launchBtnW = zoom * 14;
      const launchBtnH = Math.max(fontSize + zoom * 2, 14) * 0.9;
      if (
        cx >= launchBtnX &&
        cx <= launchBtnX + launchBtnW &&
        cy >= launchBtnY &&
        cy <= launchBtnY + launchBtnH
      ) {
        this.requestLaunchAgent(this.selectedAgentId);
        return;
      }
    }

    // Click on whiteboard → request message input.
    if (
      cx >= L.whiteboardX &&
      cx <= L.whiteboardX + L.whiteboardW &&
      cy >= L.whiteboardY &&
      cy <= L.whiteboardY + L.whiteboardH
    ) {
      this.requestWhiteboardEdit();
      return;
    }

    // Click on trophy case slot → achievement detail.
    const tc = L.trophyCase;
    if (
      cx >= tc.caseX &&
      cx <= tc.caseX + tc.caseW &&
      cy >= tc.caseY &&
      cy <= tc.caseY + tc.caseH
    ) {
      for (let i = 0; i < ACHIEVEMENTS.length; i++) {
        const col = i % tc.cols;
        const row = Math.floor(i / tc.cols);
        const sx = tc.caseX + zoom + col * tc.slotSize;
        const sy = tc.caseY + zoom * 3 + row * tc.slotSize;
        if (
          cx >= sx &&
          cx <= sx + tc.slotSize &&
          cy >= sy &&
          cy <= sy + tc.slotSize
        ) {
          this.setSelectedAchievementId(ACHIEVEMENTS[i].id);
          return;
        }
      }
    }

    // Click on achievement list row → achievement detail.
    if (this.expandedPanel === "achievements") {
      const panelW = Math.min(this.worldWidth * 0.7, 440);
      const panelH = Math.min(this.worldHeight * 0.7, 360);
      const px = Math.floor((this.worldWidth - panelW) / 2);
      const py = Math.floor((this.worldHeight - panelH) / 2);
      const pad = zoom * 4;
      const headerH = Math.max(10, zoom * 3.5) + pad;
      const lineH = Math.max(zoom * 5, 16);
      const contentY = py + pad + headerH;
      if (cx >= px && cx <= px + panelW && cy >= contentY) {
        const rowIdx = Math.floor((cy - contentY) / lineH);
        if (rowIdx >= 0 && rowIdx < ACHIEVEMENTS.length) {
          this.setSelectedAchievementId(ACHIEVEMENTS[rowIdx].id);
          return;
        }
      }
    }

    // Click on Alfred → fourth wall contextual quip.
    const hitSize = 16 * zoom;
    {
      const ax = this.alfred.x - hitSize / 2;
      const ay = this.alfred.y - hitSize;
      if (cx >= ax && cx <= ax + hitSize && cy >= ay && cy <= ay + hitSize) {
        const quip = this.fourthWall.clickAlfred();
        if (quip) {
          this.currentQuip = quip;
          this.quipDisplayTimer = 5000;
        }
        return;
      }
    }

    // Click on Giovanni → stats mirror.
    {
      const gx = this.giovanni.x - hitSize / 2;
      const gy = this.giovanni.y - hitSize;
      if (cx >= gx && cx <= gx + hitSize && cy >= gy && cy <= gy + hitSize) {
        const quip = this.fourthWall.clickGiovanni();
        if (quip) {
          this.currentQuip = quip;
          this.quipDisplayTimer = 4000;
        }
        return;
      }
    }

    // Click on an agent character → react + show detail panel.
    for (const [agentId, agent] of this.agents) {
      if (!agent.visible) continue;
      const ax = agent.x - hitSize / 2;
      const ay = agent.y - hitSize;
      if (cx >= ax && cx <= ax + hitSize && cy >= ay && cy <= ay + hitSize) {
        // Agent reacts to being clicked (turns, quips, emotion).
        this.behaviorSystem.clickAgent(agentId, this.agents);
        this.selectedAgentId = agentId;
        this.expandedPanel = "agent-detail";
        return;
      }
    }

    // Click on floor → Giovanni walks there + easter egg detection.
    if (cy > this.wallH && !this.expandedPanel) {
      this.giovanni.moveTo(cx, cy);
      this.keyboard.handleFloorClick(cx, cy);
      return;
    }

    // Click elsewhere closes panel.
    if (this.expandedPanel) {
      this.expandedPanel = null;
      this.selectedAgentId = null;
      this.selectedAchievementId = null;
    }
  }

  setSoundEnabled(on: boolean): void {
    this._soundEnabled = on;
  }

  getHeatmapSlots(): number[] {
    return this.heatmapSlots;
  }

  getToolBreakdown(): {
    read: number;
    write: number;
    bash: number;
    web: number;
    agent: number;
    other: number;
  } {
    return this.toolBreakdown;
  }

  /** Returns average tools/min over last N completed minutes, and current minute rate. */
  getPace(): { avg: number; current: number; trend: "up" | "down" | "stable" } {
    const elapsed = (Date.now() - this.paceMinuteStart) / 60_000;
    const currentRate = elapsed > 0.1 ? this.paceMinuteCount / elapsed : 0;
    const avg =
      this.paceHistory.length > 0
        ? this.paceHistory.reduce((a, b) => a + b, 0) / this.paceHistory.length
        : currentRate;
    const diff = currentRate - avg;
    const trend = diff > 1.5 ? "up" : diff < -1.5 ? "down" : "stable";
    return {
      avg: Math.round(avg * 10) / 10,
      current: Math.round(currentRate * 10) / 10,
      trend,
    };
  }

  // ── Enterprise observability API ───────────────────────

  /** Get stats for a specific agent. */
  getAgentStats(agentId: string): AgentSessionStats | null {
    return this.agentStats.get(agentId) || null;
  }

  /** Get stats for all agents that have appeared this session. */
  getAllAgentStats(): AgentSessionStats[] {
    return Array.from(this.agentStats.values()).sort(
      (a, b) => b.toolCount - a.toolCount,
    );
  }

  /** Currently selected agent for detail panel. */
  getSelectedAgentId(): string | null {
    return this.selectedAgentId;
  }

  /** Currently selected achievement for detail panel. */
  getSelectedAchievementId(): string | null {
    return this.selectedAchievementId;
  }

  setSelectedAchievementId(id: string | null): void {
    this.selectedAchievementId = id;
    this.expandedPanel = id ? "achievement-detail" : null;
    if (id) this.selectedAgentId = null;
  }

  /** Get progress (0-1) for a specific achievement. */
  getAchievementProgress(id: string): number {
    const a = ACHIEVEMENTS.find((a) => a.id === id);
    if (!a || !a.progress) return 0;
    const ctx = this.buildAchievementContext();
    return a.progress(ctx);
  }

  /** Estimated session cost based on token usage. */
  getSessionCost(): {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } {
    const stats = this.usageStats;
    const msgs = stats?.messagesThisSession ?? 0;
    const tools = stats?.toolCallsThisSession ?? 0;
    const totalTokens = msgs * 2000 + tools * 1500;
    const inputTokens = Math.round(totalTokens * BatCaveWorld.EST_INPUT_RATIO);
    const outputTokens = Math.round(
      totalTokens * BatCaveWorld.EST_OUTPUT_RATIO,
    );
    const costUsd =
      inputTokens * BatCaveWorld.COST_PER_INPUT_TOKEN +
      outputTokens * BatCaveWorld.COST_PER_OUTPUT_TOKEN;
    return {
      totalTokens,
      inputTokens,
      outputTokens,
      costUsd: Math.round(costUsd * 100) / 100,
    };
  }

  /** Cost budget — 0 means no limit configured. */
  getCostBudget(): number {
    return 0;
  }

  /** Set session history from extension host. */
  setSessionHistory(
    sessions: import("../../../shared/types").SessionSummary[],
  ): void {
    this.sessionHistory = sessions;
  }

  /** Get session history for display. */
  getSessionHistory(): import("../../../shared/types").SessionSummary[] {
    return this.sessionHistory;
  }

  /** Generate a snapshot of the current session for persistence. */
  getSessionSummary(): import("../../../shared/types").SessionSummary | null {
    const stats = this.usageStats;
    if (!stats) return null;
    const cost = this.getSessionCost();
    const agentSummaries = this.getAllAgentStats().map((a) => ({
      agentId: a.agentId,
      agentName: a.agentName,
      emoji: a.emoji,
      invocations: a.invocations,
      toolCount: a.toolCount,
      filesTouched: a.filesTouched.length,
      totalActiveMs:
        a.exitTime !== null
          ? a.totalActiveMs
          : a.totalActiveMs + Date.now() - a.enterTime,
    }));
    return {
      id: this.sessionId,
      repo: this.repoTheme.label || "unknown",
      startedAt: stats.sessionStartedAt,
      endedAt: Date.now(),
      durationMs: Date.now() - stats.sessionStartedAt,
      messages: stats.messagesThisSession,
      toolCalls: stats.toolCallsThisSession,
      agentsSpawned: stats.agentsSpawnedThisSession,
      contextPeakPct: this.contextPeakPct,
      estimatedTokens: cost.totalTokens,
      estimatedCostUsd: cost.costUsd,
      toolBreakdown: { ...this.toolBreakdown },
      agentSummaries,
      model: stats.activeModel,
    };
  }

  /** Request agent launch from extension host. Callback set by App.tsx. */
  private _onLaunchAgent: ((agentId: string) => void) | null = null;
  setLaunchAgentCallback(cb: (agentId: string) => void): void {
    this._onLaunchAgent = cb;
  }
  requestLaunchAgent(agentId: string): void {
    if (this._onLaunchAgent) this._onLaunchAgent(agentId);
  }

  private _onAssignAgent: ((agentId: string) => void) | null = null;
  setAssignAgentCallback(cb: (agentId: string) => void): void {
    this._onAssignAgent = cb;
  }
  requestAssignAgent(agentId: string): void {
    if (this._onAssignAgent) this._onAssignAgent(agentId);
  }

  /** Whiteboard message edit — request input from extension host. */
  private _onWhiteboardEdit: (() => void) | null = null;
  setWhiteboardEditCallback(cb: () => void): void {
    this._onWhiteboardEdit = cb;
  }
  requestWhiteboardEdit(): void {
    if (this._onWhiteboardEdit) this._onWhiteboardEdit();
  }

  /** Handle Director autonomous agent deployment. */
  handleDirectorDeployment(
    agentId: string,
    task: string,
    decisionId: string,
  ): void {
    // Spawn the agent with a special "director" tag.
    this.handleEvent({
      type: "agent_enter",
      agentId,
      agentName: task.slice(0, 40),
      timestamp: Date.now(),
    });
    this.audit(
      "system",
      "director_deploy",
      `Director deployed ${agentId}: ${task.slice(0, 60)}`,
    );
  }

  /** Enter replay mode — world stops processing live events. */
  enterReplayMode(): void {
    this.replayMode = true;
    // Clear live agents for clean replay.
    for (const [id, char] of this.agents) {
      char.exit();
    }
    setTimeout(() => {
      this.agents.clear();
      this.alfredState = "idle";
      this.alfred.setIdle();
    }, 500);
  }

  /** Exit replay mode — resume live event processing. */
  exitReplayMode(): void {
    this.replayMode = false;
    this.agents.clear();
    this.alfredState = "idle";
    this.alfred.setIdle();
  }

  /** Is the world in replay mode? */
  isReplayMode(): boolean {
    return this.replayMode;
  }

  /** Process a replay audit entry — reconstructs world state from events. */
  processReplayEntry(entry: AuditEntry): void {
    switch (entry.action) {
      case "agent_enter":
        if (entry.agentId) {
          this.handleEvent({
            type: "agent_enter",
            agentId: entry.agentId,
            agentName: entry.detail,
            timestamp: entry.timestamp,
          });
        }
        break;
      case "agent_exit":
        if (entry.agentId) {
          this.handleEvent({
            type: "agent_exit",
            agentId: entry.agentId,
            agentName: entry.detail,
            timestamp: entry.timestamp,
          });
        }
        break;
      case "tool_start":
        this.handleEvent({
          type: "tool_start",
          toolName: entry.toolName || "?",
          timestamp: entry.timestamp,
          filePath: entry.filePath,
        });
        break;
      case "session_thinking":
        this.handleEvent({
          type: "session_thinking",
          timestamp: entry.timestamp,
        });
        break;
      case "session_writing":
        this.handleEvent({
          type: "session_writing",
          timestamp: entry.timestamp,
        });
        break;
      case "session_idle":
        this.handleEvent({ type: "session_idle", timestamp: entry.timestamp });
        break;
      case "git_commit":
        this.handleEvent({
          type: "git_commit",
          message: entry.detail,
          timestamp: entry.timestamp,
        });
        break;
      case "git_push":
        this.handleEvent({
          type: "git_push",
          message: entry.detail,
          timestamp: entry.timestamp,
        });
        break;
    }
  }

  /** Get efficiency metrics per agent — tools/min, files/tool ratio, ranked. */
  getAgentEfficiency(): {
    agentId: string;
    name: string;
    emoji: string;
    toolsPerMin: number;
    filesPerTool: number;
    score: number;
    rank: number;
  }[] {
    const stats = this.getAllAgentStats();
    const ranked = stats
      .filter((s) => s.totalActiveMs > 5000 || s.exitTime === null) // at least 5s active
      .map((s) => {
        const activeMs =
          s.exitTime !== null
            ? s.totalActiveMs
            : s.totalActiveMs + Date.now() - s.enterTime;
        const activeMins = Math.max(0.1, activeMs / 60000);
        const toolsPerMin = Math.round((s.toolCount / activeMins) * 10) / 10;
        const filesPerTool =
          s.toolCount > 0
            ? Math.round((s.filesTouched.length / s.toolCount) * 100) / 100
            : 0;
        // Composite score: weighted blend of throughput and breadth.
        const score =
          Math.round((toolsPerMin * 0.7 + filesPerTool * 30 * 0.3) * 10) / 10;
        return {
          agentId: s.agentId,
          name: s.agentName,
          emoji: s.emoji,
          toolsPerMin,
          filesPerTool,
          score,
          rank: 0,
        };
      })
      .sort((a, b) => b.score - a.score);
    ranked.forEach((r, i) => {
      r.rank = i + 1;
    });
    return ranked;
  }

  // ── Achievement system ──────────────────────────────

  /** Build context for achievement checks. */
  private buildAchievementContext(): AchievementContext {
    const stats = this.usageStats;
    const pace = this.getPace();
    const hour = new Date().getHours();
    const allAgentIds = Array.from(this.agentStats.keys());
    return {
      sessionMessages: stats?.messagesThisSession ?? 0,
      sessionToolCalls: stats?.toolCallsThisSession ?? 0,
      sessionAgentsSpawned: stats?.agentsSpawnedThisSession ?? 0,
      contextPeakPct: this.contextPeakPct,
      durationMs: Date.now() - (stats?.sessionStartedAt ?? Date.now()),
      toolBreakdown: { ...this.toolBreakdown },
      uniqueAgentIds: allAgentIds,
      toolsPerMin: pace.current,
      totalToolsCumulative: this.totalToolsCumulative,
      totalSessionsCumulative: this.totalSessionsCumulative,
      isNightSession: hour >= 22 || hour < 5,
      filesCount: this.fileNodes.size,
      currentHour: hour,
    };
  }

  /** Achievement popup state — shown for 4 seconds on unlock. */
  private achievementPopup: {
    name: string;
    description: string;
    tier: string;
    icon: string;
    timer: number;
  } | null = null;

  /** Check and unlock new achievements. */
  checkAchievements(): UnlockedAchievement[] {
    const ctx = this.buildAchievementContext();
    const newlyUnlocked: UnlockedAchievement[] = [];
    for (const a of ACHIEVEMENTS) {
      if (this.unlockedAchievements.some((u) => u.id === a.id)) continue;
      if (a.check(ctx)) {
        const unlocked: UnlockedAchievement = {
          id: a.id,
          unlockedAt: Date.now(),
          sessionId: this.sessionId,
        };
        this.unlockedAchievements.push(unlocked);
        newlyUnlocked.push(unlocked);
        // Show popup for the latest unlock.
        this.achievementPopup = {
          name: a.name,
          description: a.description,
          tier: a.tier,
          icon: a.icon,
          timer: 4000,
        };
        bus.emit("sound:play", { id: "milestone" });
        bus.emit("particle:spawn", {
          preset: "agent-enter",
          x: this.worldWidth / 2,
          y: this.wallH + 20,
        });
      }
    }
    return newlyUnlocked;
  }

  /** Get current achievement popup (or null). */
  getAchievementPopup(): {
    name: string;
    description: string;
    tier: string;
    icon: string;
    timer: number;
  } | null {
    return this.achievementPopup;
  }

  getUnlockedAchievements(): UnlockedAchievement[] {
    return this.unlockedAchievements;
  }

  setUnlockedAchievements(list: UnlockedAchievement[]): void {
    this.unlockedAchievements = list;
  }

  // ── Cave depth ─────────────────────────────────────

  /** Check and update cave depth based on mastery gates. */
  checkCaveDepth(): void {
    const ctx = this.buildAchievementContext();
    for (const layer of CAVE_DEPTHS) {
      if (layer.depth > this.caveDepth && layer.check(ctx)) {
        this.caveDepth = layer.depth;
        bus.emit("sound:play", { id: "agent-chime" });
        this.pushAlert(
          "info",
          `Depth ${layer.depth}: ${layer.name}`,
          `Unlocked ${layer.requirement}`,
        );
      }
    }
  }

  getCaveDepth(): number {
    return this.caveDepth;
  }
  getCaveDepthLayer(): CaveDepthLayer {
    return CAVE_DEPTHS[this.caveDepth - 1] || CAVE_DEPTHS[0];
  }

  // ── Workspace Map ──────────────────────────────────

  /** Track a file touch for the workspace map. */
  private trackFileNode(filePath: string, toolName: string): void {
    const parts = filePath.split("/");
    const name = parts[parts.length - 1] || filePath;
    const cat = this.categoriseTool(toolName) as
      | "read"
      | "write"
      | "bash"
      | "other";
    const existing = this.fileNodes.get(filePath);
    if (existing) {
      existing.hitCount++;
      existing.lastTool = toolName;
      existing.lastTimestamp = Date.now();
      existing.category = cat === ("agent" as string) ? "other" : cat;
    } else {
      if (this.fileNodes.size >= BatCaveWorld.MAX_FILE_NODES) {
        // Evict least recently used.
        let oldestKey = "";
        let oldestTs = Infinity;
        for (const [k, v] of this.fileNodes) {
          if (v.lastTimestamp < oldestTs) {
            oldestTs = v.lastTimestamp;
            oldestKey = k;
          }
        }
        if (oldestKey) this.fileNodes.delete(oldestKey);
      }
      this.fileNodes.set(filePath, {
        path: filePath,
        name,
        hitCount: 1,
        lastTool: toolName,
        lastTimestamp: Date.now(),
        category: cat === ("agent" as string) ? "other" : cat,
      });
    }
  }

  getFileNodes(): FileNode[] {
    return Array.from(this.fileNodes.values()).sort(
      (a, b) => b.hitCount - a.hitCount,
    );
  }

  getFileNodesHottest(): FileNode[] {
    return this.getFileNodes().slice(0, 8);
  }

  // ── Smart Alerts ───────────────────────────────────

  private pushAlert(
    severity: AlertSeverity,
    title: string,
    detail: string,
  ): void {
    this.smartAlerts.push({
      id: `alert_${this.alertSeq++}`,
      severity,
      title,
      detail,
      timestamp: Date.now(),
      dismissed: false,
    });
    if (this.smartAlerts.length > BatCaveWorld.MAX_ALERTS) {
      this.smartAlerts.shift();
    }
  }

  /** Detect patterns after each tool event. */
  private detectSmartAlerts(toolName: string, filePath: string | null): void {
    // Pattern 1: Read loop — same file read 5+ times without a write.
    if (filePath) {
      if (toolName === "Read" || toolName === "Grep" || toolName === "Glob") {
        const count = (this.fileReadRepeatTracker.get(filePath) ?? 0) + 1;
        this.fileReadRepeatTracker.set(filePath, count);
        if (count === 5) {
          const name = filePath.split("/").pop() || filePath;
          this.pushAlert(
            "warning",
            "Read Loop Detected",
            `${name} read ${count}x without write`,
          );
        }
      } else if (toolName === "Edit" || toolName === "Write") {
        this.fileReadRepeatTracker.delete(filePath);
      }
    }

    // Pattern 2: Context pressure — over 80% with high tool rate.
    const pct = this.usageStats?.contextFillPct ?? 0;
    const pace = this.getPace();
    if (pct >= 80 && pace.current > 5) {
      const existing = this.smartAlerts.find(
        (a) => a.id.startsWith("ctx-pressure") && !a.dismissed,
      );
      if (!existing) {
        const minsLeft = ((100 - pct) / pace.current).toFixed(1);
        this.pushAlert(
          "critical",
          "Context Pressure",
          `At ${pct}% — ~${minsLeft}min at current pace`,
        );
      }
    }
  }

  getSmartAlerts(): SmartAlert[] {
    return this.smartAlerts.filter((a) => !a.dismissed);
  }

  dismissAlert(id: string): void {
    const a = this.smartAlerts.find((x) => x.id === id);
    if (a) a.dismissed = true;
  }

  /** Map agent body type to idle animation style. */
  private getIdleStyleForAgent(agentId: string): IdleStyle {
    const personality = AGENT_PERSONALITIES[agentId];
    if (!personality) return "default";
    const map: Partial<Record<BodyType, IdleStyle>> = {
      caped: "sway",
      robed: "sway",
      armored: "stomp",
      heavy: "stomp",
      glitch: "twitch",
      hooded: "float",
      naval: "rigid",
      standard: "rigid",
      compact: "default",
      coated: "default",
      labcoat: "default",
      geared: "default",
    };
    return map[personality.bodyType] || "default";
  }

  /** Track agent enter for per-agent stats. */
  private trackAgentEnter(agentId: string, name: string, emoji: string): void {
    const existing = this.agentStats.get(agentId);
    if (existing) {
      existing.enterTime = Date.now();
      existing.exitTime = null;
      existing.invocations++;
    } else {
      this.agentStats.set(agentId, {
        agentId,
        agentName: name,
        emoji,
        enterTime: Date.now(),
        exitTime: null,
        totalActiveMs: 0,
        toolCount: 0,
        toolBreakdown: { read: 0, write: 0, bash: 0, web: 0, other: 0 },
        filesTouched: [],
        invocations: 1,
      });
    }
  }

  /** Track agent exit — accumulate active duration. */
  private trackAgentExit(agentId: string): void {
    const s = this.agentStats.get(agentId);
    if (s && s.exitTime === null) {
      s.totalActiveMs += Date.now() - s.enterTime;
      s.exitTime = Date.now();
    }
  }

  /** Attribute a tool call to all currently active agents. */
  private attributeToolToAgents(
    toolName: string,
    filePath: string | null,
  ): void {
    const cat = this.categoriseTool(toolName) as
      | "read"
      | "write"
      | "bash"
      | "web"
      | "other";
    // Skip "agent" category (meta, not attributable).
    const effectiveCat = cat === ("agent" as string) ? "other" : cat;
    for (const [agentId] of this.agents) {
      const s = this.agentStats.get(agentId);
      if (!s || s.exitTime !== null) continue; // only active agents
      s.toolCount++;
      if (effectiveCat in s.toolBreakdown) {
        s.toolBreakdown[effectiveCat as keyof typeof s.toolBreakdown]++;
      }
      if (filePath && !s.filesTouched.includes(filePath)) {
        s.filesTouched.push(filePath);
      }
    }
  }

  /** Get current quip for an agent — delegates to AgentBehaviorSystem. */
  getAgentQuip(agentId: string): string | null {
    return this.behaviorSystem.getAgentQuip(agentId);
  }

  // ── Cave Evolution ──────────────────────────────────────

  private checkCaveEvolution(): void {
    for (const milestone of CAVE_MILESTONES) {
      if (
        this.totalToolsCumulative >= milestone.requiredTools &&
        milestone.level > this.caveLevel
      ) {
        this.caveLevel = milestone.level;
        if (milestone.level > this.lastMilestoneNotified) {
          this.lastMilestoneNotified = milestone.level;
          bus.emit("sound:play", { id: "milestone" });
          bus.emit("particle:spawn", {
            preset: "agent-enter",
            x: this.worldWidth / 2,
            y: this.worldHeight / 2,
          });
        }
      }
    }
  }

  getCaveLevel(): number {
    return this.caveLevel;
  }

  getCaveLevelName(): string {
    const milestone = CAVE_MILESTONES.find((m) => m.level === this.caveLevel);
    return milestone?.name || "Empty Cave";
  }

  getTotalToolsCumulative(): number {
    return this.totalToolsCumulative;
  }

  // ── State Persistence ──────────────────────────────────

  getPersistedState(): Record<string, unknown> {
    return {
      totalToolsCumulative: this.totalToolsCumulative,
      caveLevel: this.caveLevel,
      lastMilestoneNotified: this.lastMilestoneNotified,
      unlockedAchievements: this.unlockedAchievements,
      caveDepth: this.caveDepth,
      sessionsUnderBudget: this.sessionsUnderBudget,
      totalSessionsCumulative: this.totalSessionsCumulative,
    };
  }

  restoreState(state: Record<string, unknown>): void {
    if (typeof state.totalToolsCumulative === "number") {
      this.totalToolsCumulative = state.totalToolsCumulative;
    }
    if (typeof state.caveLevel === "number") {
      this.caveLevel = state.caveLevel;
    }
    if (typeof state.lastMilestoneNotified === "number") {
      this.lastMilestoneNotified = state.lastMilestoneNotified;
    }
    if (Array.isArray(state.unlockedAchievements)) {
      this.unlockedAchievements =
        state.unlockedAchievements as UnlockedAchievement[];
    }
    if (typeof state.caveDepth === "number") {
      this.caveDepth = state.caveDepth;
    }
    if (typeof state.sessionsUnderBudget === "number") {
      this.sessionsUnderBudget = state.sessionsUnderBudget;
    }
    if (typeof state.totalSessionsCumulative === "number") {
      this.totalSessionsCumulative = state.totalSessionsCumulative;
    }
  }

  private logEvent(type: string, label: string): void {
    this.eventLog.push({ type, label, timestamp: Date.now() });
    if (this.eventLog.length > 64) {
      this.eventLog.shift();
    }
  }

  /** Record an immutable audit trail entry. */
  private audit(
    category: AuditEntry["category"],
    action: string,
    detail: string,
    extra?: { filePath?: string; agentId?: string; toolName?: string },
  ): void {
    this.auditTrail.push({
      seq: this.auditSeq++,
      timestamp: Date.now(),
      category,
      action,
      detail,
      ...extra,
    });
    if (this.auditTrail.length > BatCaveWorld.MAX_AUDIT_ENTRIES) {
      this.auditTrail.shift();
    }
  }

  /** Get the full audit trail. */
  getAuditTrail(): readonly AuditEntry[] {
    return this.auditTrail;
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

  private categoriseTool(
    tool: string,
  ): "read" | "write" | "bash" | "web" | "agent" | "other" {
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

  private getAgentSlotPosition(
    slot: number,
    agentId?: string,
  ): { x: number; y: number } {
    const zoom = this._zoom;
    const floorY =
      this.wallH + Math.floor((this.worldHeight - this.wallH) * 0.82);

    // Zone-based positioning: agents go to their preferred area.
    if (agentId) {
      const personality = AGENT_PERSONALITIES[agentId];
      if (personality) {
        const pos = this.behaviorSystem.getZonePosition(
          personality.zone,
          agentId,
        );
        if (pos) return pos;
      }
    }

    // Fallback: grid layout for unknown agents.
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
    const floorY =
      this.wallH + Math.floor((this.worldHeight - this.wallH) * 0.82);
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
      const chairY =
        this.wallH + Math.floor((this.worldHeight - this.wallH) * 0.55);
      const path = this.pathfinder.findPath(
        this.giovanni.x,
        this.giovanni.y,
        bcX,
        chairY,
      );
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

  // ── Companions + Francesco (delegated to CompanionSystem) ───────────────

  /** Visible companions for rendering — delegates to CompanionSystem. */
  getVisibleCompanions(): Character[] {
    return this.companionSystem.getVisibleCompanions();
  }

  /** Francesco character for rendering — delegates to CompanionSystem. */
  getFrancesco(): Character | null {
    return this.companionSystem.getFrancesco();
  }
}
