/**
 * AnalyticsEngine — extracted from BatCave.ts god-object.
 *
 * Owns all observability, analytics, and gamification state:
 * - Audit trail (immutable event log)
 * - Heatmap (activity time-series)
 * - Tool breakdown (read/write/bash/web/agent/other)
 * - Pace tracking (tools/min)
 * - Cost estimation
 * - Per-agent stats
 * - File nodes (workspace map)
 * - Smart alerts
 * - Achievements + cave depth
 * - Efficiency ranking
 */

import { UsageStats } from "../../../shared/types";
import {
  Achievement, ACHIEVEMENTS, AchievementContext, UnlockedAchievement,
  CaveDepthLayer, CAVE_DEPTHS,
  SmartAlert, AlertSeverity,
  FileNode,
} from "../data/gamification";
import { AgentSessionStats, AuditEntry } from "./BatCave";
import { bus } from "../systems/EventBus";

// ── Constants ───────────────────────────────────────────

const COST_PER_INPUT_TOKEN = 15 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 75 / 1_000_000;
const EST_INPUT_RATIO = 0.7;
const EST_OUTPUT_RATIO = 0.3;
const MAX_AUDIT_ENTRIES = 200;
const MAX_ALERTS = 10;
const MAX_FILE_NODES = 40;
const HEATMAP_SLOT_MS = 30_000;
const HEATMAP_SLOTS = 40;

export class AnalyticsEngine {
  // Audit trail.
  private auditTrail: AuditEntry[] = [];
  private auditSeq = 0;

  // Heatmap.
  private heatmapSlots: number[] = new Array(HEATMAP_SLOTS).fill(0);
  private heatmapOrigin = Date.now();

  // Tool breakdown.
  private toolBreakdown = { read: 0, write: 0, bash: 0, web: 0, agent: 0, other: 0 };

  // Pace.
  private paceHistory: number[] = [];
  private paceMinuteStart = Date.now();
  private paceMinuteCount = 0;

  // Per-agent stats.
  private agentStats = new Map<string, AgentSessionStats>();

  // Cost.
  private costBudgetUsd = 0;

  // Peak context.
  private contextPeakPct = 0;

  // File nodes (workspace map).
  private fileNodes = new Map<string, FileNode>();

  // Smart alerts.
  private smartAlerts: SmartAlert[] = [];
  private alertSeq = 0;
  private fileReadRepeatTracker = new Map<string, number>();

  // Gamification.
  private unlockedAchievements: UnlockedAchievement[] = [];
  private caveDepth = 1;
  private sessionsUnderBudget = 0;
  private totalSessionsCumulative = 0;

  // Session ID.
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  // ── Audit Trail ────────────────────────────────────────

  audit(
    category: AuditEntry["category"],
    action: string,
    detail: string,
    extra?: { filePath?: string; agentId?: string; toolName?: string },
  ): void {
    this.auditTrail.push({
      seq: this.auditSeq++,
      timestamp: Date.now(),
      category, action, detail,
      ...extra,
    });
    if (this.auditTrail.length > MAX_AUDIT_ENTRIES) {
      this.auditTrail.shift();
    }
  }

  getAuditTrail(): readonly AuditEntry[] {
    return this.auditTrail;
  }

  // ── Heatmap + Tool Breakdown + Pace ────────────────────

  recordTool(toolName: string): void {
    // Heatmap.
    const elapsed = Date.now() - this.heatmapOrigin;
    const slot = Math.min(HEATMAP_SLOTS - 1, Math.floor(elapsed / HEATMAP_SLOT_MS));
    this.heatmapSlots[slot]++;

    // Tool breakdown.
    const cat = this.categoriseTool(toolName);
    this.toolBreakdown[cat]++;

    // Pace.
    this.paceMinuteCount++;
    const minElapsed = Date.now() - this.paceMinuteStart;
    if (minElapsed >= 60_000) {
      this.paceHistory.push(this.paceMinuteCount);
      if (this.paceHistory.length > 30) this.paceHistory.shift();
      this.paceMinuteCount = 0;
      this.paceMinuteStart = Date.now();
    }
  }

  categoriseTool(tool: string): "read" | "write" | "bash" | "web" | "agent" | "other" {
    if (["Read", "Grep", "Glob"].includes(tool)) return "read";
    if (["Edit", "Write", "NotebookEdit"].includes(tool)) return "write";
    if (tool === "Bash") return "bash";
    if (["WebSearch", "WebFetch"].includes(tool)) return "web";
    if (["Agent", "Skill"].includes(tool)) return "agent";
    return "other";
  }

  getHeatmapSlots(): number[] { return this.heatmapSlots; }
  getToolBreakdown() { return this.toolBreakdown; }

  getPace(): { avg: number; current: number; trend: "up" | "down" | "stable" } {
    const elapsed = (Date.now() - this.paceMinuteStart) / 60_000;
    const currentRate = elapsed > 0.1 ? this.paceMinuteCount / elapsed : 0;
    const avg = this.paceHistory.length > 0
      ? this.paceHistory.reduce((a, b) => a + b, 0) / this.paceHistory.length
      : currentRate;
    const diff = currentRate - avg;
    const trend = diff > 1.5 ? "up" as const : diff < -1.5 ? "down" as const : "stable" as const;
    return { avg: Math.round(avg * 10) / 10, current: Math.round(currentRate * 10) / 10, trend };
  }

  // ── Cost ───────────────────────────────────────────────

  getSessionCost(stats: UsageStats | null): { totalTokens: number; inputTokens: number; outputTokens: number; costUsd: number } {
    const msgs = stats?.messagesThisSession ?? 0;
    const tools = stats?.toolCallsThisSession ?? 0;
    const totalTokens = msgs * 2000 + tools * 1500;
    const inputTokens = Math.round(totalTokens * EST_INPUT_RATIO);
    const outputTokens = Math.round(totalTokens * EST_OUTPUT_RATIO);
    const costUsd = inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN;
    return { totalTokens, inputTokens, outputTokens, costUsd: Math.round(costUsd * 100) / 100 };
  }

  setCostBudget(usd: number): void { this.costBudgetUsd = usd; }
  getCostBudget(): number { return this.costBudgetUsd; }
  isOverBudget(stats: UsageStats | null): boolean {
    if (this.costBudgetUsd <= 0) return false;
    return this.getSessionCost(stats).costUsd >= this.costBudgetUsd;
  }

  updateContextPeak(pct: number): void {
    if (pct > this.contextPeakPct) this.contextPeakPct = pct;
  }

  // ── Per-Agent Stats ────────────────────────────────────

  trackAgentEnter(agentId: string, name: string, emoji: string): void {
    const existing = this.agentStats.get(agentId);
    if (existing) {
      existing.enterTime = Date.now();
      existing.exitTime = null;
      existing.invocations++;
    } else {
      this.agentStats.set(agentId, {
        agentId, agentName: name, emoji,
        enterTime: Date.now(), exitTime: null,
        totalActiveMs: 0, toolCount: 0,
        toolBreakdown: { read: 0, write: 0, bash: 0, web: 0, other: 0 },
        filesTouched: [], invocations: 1,
      });
    }
  }

  trackAgentExit(agentId: string): void {
    const s = this.agentStats.get(agentId);
    if (s && s.exitTime === null) {
      s.totalActiveMs += Date.now() - s.enterTime;
      s.exitTime = Date.now();
    }
  }

  attributeToolToAgents(toolName: string, filePath: string | null, activeAgentIds: string[]): void {
    const cat = this.categoriseTool(toolName);
    const effectiveCat = cat === "agent" ? "other" : cat;
    for (const agentId of activeAgentIds) {
      const s = this.agentStats.get(agentId);
      if (!s || s.exitTime !== null) continue;
      s.toolCount++;
      if (effectiveCat in s.toolBreakdown) {
        s.toolBreakdown[effectiveCat as keyof typeof s.toolBreakdown]++;
      }
      if (filePath && !s.filesTouched.includes(filePath)) {
        s.filesTouched.push(filePath);
      }
    }
  }

  getAgentStats(id: string): AgentSessionStats | null { return this.agentStats.get(id) || null; }
  getAllAgentStats(): AgentSessionStats[] {
    return Array.from(this.agentStats.values()).sort((a, b) => b.toolCount - a.toolCount);
  }

  // ── Efficiency ─────────────────────────────────────────

  getAgentEfficiency(): { agentId: string; name: string; emoji: string; toolsPerMin: number; filesPerTool: number; score: number; rank: number }[] {
    const stats = this.getAllAgentStats();
    const ranked = stats
      .filter(s => s.totalActiveMs > 5000 || s.exitTime === null)
      .map(s => {
        const activeMs = s.exitTime !== null ? s.totalActiveMs : s.totalActiveMs + Date.now() - s.enterTime;
        const activeMins = Math.max(0.1, activeMs / 60000);
        const toolsPerMin = Math.round((s.toolCount / activeMins) * 10) / 10;
        const filesPerTool = s.toolCount > 0 ? Math.round((s.filesTouched.length / s.toolCount) * 100) / 100 : 0;
        const score = Math.round((toolsPerMin * 0.7 + filesPerTool * 30 * 0.3) * 10) / 10;
        return { agentId: s.agentId, name: s.agentName, emoji: s.emoji, toolsPerMin, filesPerTool, score, rank: 0 };
      })
      .sort((a, b) => b.score - a.score);
    ranked.forEach((r, i) => { r.rank = i + 1; });
    return ranked;
  }

  // ── File Nodes (Workspace Map) ─────────────────────────

  trackFileNode(filePath: string, toolName: string): void {
    const parts = filePath.split("/");
    const name = parts[parts.length - 1] || filePath;
    const cat = this.categoriseTool(toolName) as "read" | "write" | "bash" | "other";
    const existing = this.fileNodes.get(filePath);
    if (existing) {
      existing.hitCount++;
      existing.lastTool = toolName;
      existing.lastTimestamp = Date.now();
      existing.category = cat === "agent" as string ? "other" : cat;
    } else {
      if (this.fileNodes.size >= MAX_FILE_NODES) {
        let oldestKey = ""; let oldestTs = Infinity;
        for (const [k, v] of this.fileNodes) {
          if (v.lastTimestamp < oldestTs) { oldestTs = v.lastTimestamp; oldestKey = k; }
        }
        if (oldestKey) this.fileNodes.delete(oldestKey);
      }
      this.fileNodes.set(filePath, {
        path: filePath, name, hitCount: 1,
        lastTool: toolName, lastTimestamp: Date.now(),
        category: cat === "agent" as string ? "other" : cat,
      });
    }
  }

  getFileNodes(): FileNode[] {
    return Array.from(this.fileNodes.values()).sort((a, b) => b.hitCount - a.hitCount);
  }
  getFileNodesHottest(): FileNode[] { return this.getFileNodes().slice(0, 8); }

  // ── Smart Alerts ───────────────────────────────────────

  pushAlert(severity: AlertSeverity, title: string, detail: string): void {
    this.smartAlerts.push({
      id: `alert_${this.alertSeq++}`, severity, title, detail,
      timestamp: Date.now(), dismissed: false,
    });
    if (this.smartAlerts.length > MAX_ALERTS) this.smartAlerts.shift();
  }

  detectAlerts(toolName: string, filePath: string | null, stats: UsageStats | null): void {
    // Pattern 1: Read loop.
    if (filePath) {
      if (["Read", "Grep", "Glob"].includes(toolName)) {
        const count = (this.fileReadRepeatTracker.get(filePath) ?? 0) + 1;
        this.fileReadRepeatTracker.set(filePath, count);
        if (count === 5) {
          this.pushAlert("warning", "Read Loop Detected", `${filePath.split("/").pop()} read ${count}x without write`);
        }
      } else if (["Edit", "Write"].includes(toolName)) {
        this.fileReadRepeatTracker.delete(filePath);
      }
    }
    // Pattern 2: Context pressure.
    const pct = stats?.contextFillPct ?? 0;
    const pace = this.getPace();
    if (pct >= 80 && pace.current > 5) {
      if (!this.smartAlerts.find(a => a.title === "Context Pressure" && !a.dismissed)) {
        this.pushAlert("critical", "Context Pressure", `At ${pct}% — ~${((100 - pct) / pace.current).toFixed(1)}min at current pace`);
      }
    }
    // Pattern 3: Cost spike.
    if (this.costBudgetUsd > 0 && stats) {
      const cost = this.getSessionCost(stats);
      const elapsed = Date.now() - stats.sessionStartedAt;
      if (cost.costUsd > this.costBudgetUsd * 0.5 && elapsed < 300000) {
        if (!this.smartAlerts.find(a => a.title === "Cost Spike" && !a.dismissed)) {
          this.pushAlert("warning", "Cost Spike", `50% of budget used in <5min`);
        }
      }
    }
  }

  getSmartAlerts(): SmartAlert[] { return this.smartAlerts.filter(a => !a.dismissed); }
  dismissAlert(id: string): void {
    const a = this.smartAlerts.find(x => x.id === id);
    if (a) a.dismissed = true;
  }

  // ── Achievements + Cave Depth ──────────────────────────

  buildAchievementContext(stats: UsageStats | null, totalTools: number): AchievementContext {
    const cost = this.getSessionCost(stats);
    const pace = this.getPace();
    const hour = new Date().getHours();
    return {
      sessionMessages: stats?.messagesThisSession ?? 0,
      sessionToolCalls: stats?.toolCallsThisSession ?? 0,
      sessionAgentsSpawned: stats?.agentsSpawnedThisSession ?? 0,
      contextPeakPct: this.contextPeakPct,
      costUsd: cost.costUsd,
      costBudget: this.costBudgetUsd,
      durationMs: Date.now() - (stats?.sessionStartedAt ?? Date.now()),
      toolBreakdown: { ...this.toolBreakdown },
      uniqueAgentIds: Array.from(this.agentStats.keys()),
      toolsPerMin: pace.current,
      sessionsUnderBudget: this.sessionsUnderBudget,
      totalToolsCumulative: totalTools,
      totalSessionsCumulative: this.totalSessionsCumulative,
      isNightSession: hour >= 22 || hour < 5,
      filesCount: this.fileNodes.size,
    };
  }

  checkAchievements(stats: UsageStats | null, totalTools: number): UnlockedAchievement[] {
    const ctx = this.buildAchievementContext(stats, totalTools);
    const newlyUnlocked: UnlockedAchievement[] = [];
    for (const a of ACHIEVEMENTS) {
      if (this.unlockedAchievements.some(u => u.id === a.id)) continue;
      if (a.check(ctx)) {
        const unlocked: UnlockedAchievement = { id: a.id, unlockedAt: Date.now(), sessionId: this.sessionId };
        this.unlockedAchievements.push(unlocked);
        newlyUnlocked.push(unlocked);
        bus.emit("sound:play", { id: "agent-chime" });
      }
    }
    return newlyUnlocked;
  }

  checkCaveDepth(stats: UsageStats | null, totalTools: number): void {
    const ctx = this.buildAchievementContext(stats, totalTools);
    for (const layer of CAVE_DEPTHS) {
      if (layer.depth > this.caveDepth && layer.check(ctx)) {
        this.caveDepth = layer.depth;
        bus.emit("sound:play", { id: "agent-chime" });
        this.pushAlert("info", `Depth ${layer.depth}: ${layer.name}`, `Unlocked ${layer.requirement}`);
      }
    }
  }

  getUnlockedAchievements(): UnlockedAchievement[] { return this.unlockedAchievements; }
  setUnlockedAchievements(list: UnlockedAchievement[]): void { this.unlockedAchievements = list; }
  getCaveDepth(): number { return this.caveDepth; }
  getCaveDepthLayer(): CaveDepthLayer { return CAVE_DEPTHS[this.caveDepth - 1] || CAVE_DEPTHS[0]; }

  // ── Persistence ────────────────────────────────────────

  getPersistedState(): Record<string, unknown> {
    return {
      unlockedAchievements: this.unlockedAchievements,
      caveDepth: this.caveDepth,
      sessionsUnderBudget: this.sessionsUnderBudget,
      totalSessionsCumulative: this.totalSessionsCumulative,
    };
  }

  restoreState(state: Record<string, unknown>): void {
    if (Array.isArray(state.unlockedAchievements)) {
      this.unlockedAchievements = state.unlockedAchievements as UnlockedAchievement[];
    }
    if (typeof state.caveDepth === "number") this.caveDepth = state.caveDepth;
    if (typeof state.sessionsUnderBudget === "number") this.sessionsUnderBudget = state.sessionsUnderBudget;
    if (typeof state.totalSessionsCumulative === "number") this.totalSessionsCumulative = state.totalSessionsCumulative;
  }

  // ── Reset ──────────────────────────────────────────────

  reset(): void {
    this.auditTrail.length = 0;
    this.auditSeq = 0;
    this.heatmapSlots.fill(0);
    this.heatmapOrigin = Date.now();
    this.toolBreakdown = { read: 0, write: 0, bash: 0, web: 0, agent: 0, other: 0 };
    this.paceHistory.length = 0;
    this.paceMinuteStart = Date.now();
    this.paceMinuteCount = 0;
    this.agentStats.clear();
    this.contextPeakPct = 0;
    this.fileNodes.clear();
    this.smartAlerts.length = 0;
    this.fileReadRepeatTracker.clear();
  }
}
