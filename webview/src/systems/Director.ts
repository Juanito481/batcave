/**
 * The Director — autonomous AI agent orchestrator.
 *
 * The heart of Alfred Superintelligence Labs. Watches activity patterns,
 * detects events (PR, cost spikes, patterns), and autonomously deploys
 * the right chess-piece agents without human intervention.
 *
 * Three rule engines:
 * 1. Trigger Rules — event → agent deployment
 * 2. Pattern Learning — historical analysis → auto-suggestions
 * 3. Cost Governor — budget-aware throttling
 */

import { bus } from "./EventBus";

// ── Types ───────────────────────────────────────────────

/** Director's signature color — lavender, distinct from all agents. */
export const DIRECTOR_COLOR = "#B8A0FF";

export type TriggerType =
  | "pr_opened"
  | "pr_review_requested"
  | "cost_threshold"
  | "context_pressure"
  | "error_detected"
  | "pattern_match"
  | "schedule"
  | "file_change"
  | "agent_sequence"
  | "ci_failure"
  | "ui_change"
  | "infra_change"
  | "test_change";

export type DirectorState = "watching" | "deciding" | "deploying" | "idle";

export interface DirectorDecision {
  id: string;
  trigger: TriggerType;
  triggerDetail: string;
  agentIds: string[];
  tasks: Map<string, string>;   // agentId → task description
  priority: "low" | "normal" | "high" | "critical";
  timestamp: number;
  status: "proposed" | "approved" | "executing" | "completed" | "cancelled" | "overridden";
  autoApproved: boolean;        // true = Director acted autonomously
}

export interface TriggerRule {
  id: string;
  name: string;
  trigger: TriggerType;
  condition: (ctx: DirectorContext) => boolean;
  deploy: (ctx: DirectorContext) => { agentId: string; task: string }[];
  priority: DirectorDecision["priority"];
  autoApprove: boolean;         // false = requires master confirmation
}

export interface DirectorContext {
  // Current session state.
  toolCount: number;
  costUsd: number;
  costBudget: number;
  contextPct: number;
  activeAgentIds: string[];
  recentTools: string[];        // last 20 tool names
  recentFiles: string[];        // last 10 file paths
  lastGitEvent: string | null;  // "commit", "push", or null
  sessionDurationMs: number;

  // Pattern memory.
  agentSequences: string[][];   // past agent deployment sequences
  fileAgentMap: Map<string, string[]>; // file path → agents that were useful
}

export interface PatternInsight {
  type: "sequence" | "file_affinity" | "time_pattern";
  description: string;
  confidence: number;           // 0-1
  suggestedAgent: string;
  suggestedTask: string;
}

// ── Director Engine ─────────────────────────────────────

export class Director {
  private state: DirectorState = "watching";
  private decisions: DirectorDecision[] = [];
  private rules: TriggerRule[] = [];
  private patterns: PatternInsight[] = [];
  private agentSequenceHistory: string[][] = [];
  private fileAgentHistory = new Map<string, string[]>();
  private recentToolBuffer: string[] = [];
  private recentFileBuffer: string[] = [];
  private checkTimer = 0;
  private enabled = true;

  private static readonly MAX_DECISIONS = 50;
  private static readonly CHECK_INTERVAL_MS = 5000; // evaluate rules every 5s
  private static readonly MAX_RECENT = 20;

  constructor() {
    this.initDefaultRules();
  }

  // ── Default Rules ──────────────────────────────────────

  private initDefaultRules(): void {
    this.rules = [
      // Rule 1: Cost Governor — pause when over 70% budget.
      {
        id: "cost-governor",
        name: "Cost Governor",
        trigger: "cost_threshold",
        condition: (ctx) => ctx.costBudget > 0 && ctx.costUsd >= ctx.costBudget * 0.7,
        deploy: () => [], // Governor doesn't deploy — it restricts.
        priority: "critical",
        autoApprove: true,
      },

      // Rule 2: Context pressure — alert when context > 85%.
      {
        id: "context-alert",
        name: "Context Pressure Alert",
        trigger: "context_pressure",
        condition: (ctx) => ctx.contextPct >= 85,
        deploy: () => [
          { agentId: "pawn", task: "Context at critical level. Summarize current state and suggest conversation compaction." },
        ],
        priority: "high",
        autoApprove: false, // needs master approval
      },

      // Rule 3: Security review on auth file changes.
      {
        id: "auth-file-guard",
        name: "Auth File Security Guard",
        trigger: "file_change",
        condition: (ctx) => ctx.recentFiles.some(f =>
          /auth|login|password|secret|token|session|jwt|oauth/i.test(f),
        ),
        deploy: (ctx) => {
          const authFile = ctx.recentFiles.find(f =>
            /auth|login|password|secret|token|session|jwt|oauth/i.test(f),
          ) || "auth files";
          return [
            { agentId: "rook", task: `Security review triggered: ${authFile} was modified. Check for vulnerabilities.` },
          ];
        },
        priority: "high",
        autoApprove: true,
      },

      // Rule 4: Auto code review after 10+ write operations.
      {
        id: "bulk-write-review",
        name: "Bulk Write Review",
        trigger: "pattern_match",
        condition: (ctx) => {
          const writeCount = ctx.recentTools.filter(t => t === "Edit" || t === "Write").length;
          return writeCount >= 10;
        },
        deploy: () => [
          { agentId: "bishop", task: "Large number of file edits detected. Review recent changes for code smells and consistency." },
        ],
        priority: "normal",
        autoApprove: false,
      },

      // Rule 5: Auto-test after git commit.
      {
        id: "post-commit-test",
        name: "Post-Commit Test",
        trigger: "file_change",
        condition: (ctx) => ctx.lastGitEvent === "commit",
        deploy: () => [
          { agentId: "cardinal", task: "New commit detected. Run tests and verify nothing is broken." },
        ],
        priority: "normal",
        autoApprove: true,
      },

      // Rule 6: UI file changes → deploy Scout.
      {
        id: "ui-file-guard",
        name: "UI File Visual Check",
        trigger: "ui_change",
        condition: (ctx) => ctx.recentFiles.some(f =>
          /component|\.tsx|\.jsx|\.css|\.scss|ui\/|view|layout|style/i.test(f),
        ),
        deploy: (ctx) => {
          const uiFile = ctx.recentFiles.find(f =>
            /component|\.tsx|\.jsx|\.css|\.scss|ui\/|view|layout|style/i.test(f),
          ) || "UI files";
          return [
            { agentId: "scout", task: `UI change detected: ${uiFile}. Check visual consistency and responsive layout.` },
          ];
        },
        priority: "normal",
        autoApprove: false,
      },

      // Rule 7: Infrastructure changes → deploy Chancellor + Knight.
      {
        id: "infra-file-guard",
        name: "Infrastructure Change Review",
        trigger: "infra_change",
        condition: (ctx) => ctx.recentFiles.some(f =>
          /docker|\.yml|\.yaml|ci\/|\.github|deploy|infra|terraform|k8s|helm/i.test(f),
        ),
        deploy: () => [
          { agentId: "chancellor", task: "Infrastructure file modified. Verify CI/CD pipeline and deployment config." },
          { agentId: "knight", task: "Review infrastructure change for architectural impact." },
        ],
        priority: "high",
        autoApprove: false,
      },

      // Rule 8: Test file changes → deploy Cardinal + Black Knight.
      {
        id: "test-file-guard",
        name: "Test File Change",
        trigger: "test_change",
        condition: (ctx) => ctx.recentFiles.some(f =>
          /\.test\.|\.spec\.|__test__|__spec__/i.test(f),
        ),
        deploy: () => [
          { agentId: "cardinal", task: "Test files modified. Verify all tests pass and coverage is adequate." },
        ],
        priority: "normal",
        autoApprove: true,
      },

      // Rule 9: Agent sequence pattern — if Bishop always follows Knight.
      {
        id: "learned-sequence",
        name: "Learned Agent Sequence",
        trigger: "agent_sequence",
        condition: (ctx) => {
          // Check if the last agent deployment matches a known sequence.
          if (ctx.activeAgentIds.length === 0) return false;
          const lastAgent = ctx.activeAgentIds[ctx.activeAgentIds.length - 1];
          return this.agentSequenceHistory.some(seq => {
            const idx = seq.indexOf(lastAgent);
            return idx >= 0 && idx < seq.length - 1;
          });
        },
        deploy: (ctx) => {
          const lastAgent = ctx.activeAgentIds[ctx.activeAgentIds.length - 1];
          for (const seq of this.agentSequenceHistory) {
            const idx = seq.indexOf(lastAgent);
            if (idx >= 0 && idx < seq.length - 1) {
              const nextAgent = seq[idx + 1];
              if (!ctx.activeAgentIds.includes(nextAgent)) {
                return [{ agentId: nextAgent, task: `Auto-deployed: historically follows ${lastAgent} in your workflow.` }];
              }
            }
          }
          return [];
        },
        priority: "low",
        autoApprove: false,
      },
    ];
  }

  // ── Public API ─────────────────────────────────────────

  /** Feed a tool event to the Director. */
  recordTool(toolName: string, filePath: string | null): void {
    this.recentToolBuffer.push(toolName);
    if (this.recentToolBuffer.length > Director.MAX_RECENT) this.recentToolBuffer.shift();
    if (filePath) {
      this.recentFileBuffer.push(filePath);
      if (this.recentFileBuffer.length > Director.MAX_RECENT) this.recentFileBuffer.shift();
    }
  }

  /** Feed a git event. */
  recordGitEvent(type: "commit" | "push"): void {
    this._lastGitEvent = type;
    // Clear after 10s — it's a transient signal.
    setTimeout(() => { this._lastGitEvent = null; }, 10000);
  }
  private _lastGitEvent: string | null = null;

  /** Record an agent deployment sequence for pattern learning. */
  recordAgentSequence(agentIds: string[]): void {
    if (agentIds.length >= 2) {
      this.agentSequenceHistory.push([...agentIds]);
      if (this.agentSequenceHistory.length > 20) this.agentSequenceHistory.shift();
    }
  }

  /** Main tick — called from game loop. Evaluates rules periodically. */
  update(deltaMs: number, ctx: Omit<DirectorContext, "agentSequences" | "fileAgentMap" | "recentTools" | "recentFiles" | "lastGitEvent">): DirectorDecision[] {
    if (!this.enabled) return [];

    this.checkTimer += deltaMs;
    if (this.checkTimer < Director.CHECK_INTERVAL_MS) return [];
    this.checkTimer = 0;

    const fullCtx: DirectorContext = {
      ...ctx,
      recentTools: [...this.recentToolBuffer],
      recentFiles: [...this.recentFileBuffer],
      lastGitEvent: this._lastGitEvent,
      agentSequences: this.agentSequenceHistory,
      fileAgentMap: this.fileAgentHistory,
    };

    this.state = "deciding";
    const newDecisions: DirectorDecision[] = [];

    for (const rule of this.rules) {
      // Skip if already has an active decision for this rule.
      if (this.decisions.some(d => d.id.startsWith(rule.id) && (d.status === "proposed" || d.status === "executing"))) {
        continue;
      }

      if (rule.condition(fullCtx)) {
        const deployments = rule.deploy(fullCtx);
        if (deployments.length === 0 && rule.id === "cost-governor") {
          // Governor emits a special decision with no agents.
          const decision: DirectorDecision = {
            id: `${rule.id}_${Date.now()}`,
            trigger: rule.trigger,
            triggerDetail: `Cost at $${ctx.costUsd.toFixed(2)} (${Math.round(ctx.costUsd / ctx.costBudget * 100)}% of budget)`,
            agentIds: [],
            tasks: new Map(),
            priority: rule.priority,
            timestamp: Date.now(),
            status: "proposed",
            autoApproved: rule.autoApprove,
          };
          this.addDecision(decision);
          newDecisions.push(decision);
          bus.emit("sound:play", { id: "agent-chime" });
          continue;
        }

        if (deployments.length > 0) {
          const tasks = new Map<string, string>();
          for (const d of deployments) tasks.set(d.agentId, d.task);

          const decision: DirectorDecision = {
            id: `${rule.id}_${Date.now()}`,
            trigger: rule.trigger,
            triggerDetail: rule.name,
            agentIds: deployments.map(d => d.agentId),
            tasks,
            priority: rule.priority,
            timestamp: Date.now(),
            status: rule.autoApprove ? "approved" : "proposed",
            autoApproved: rule.autoApprove,
          };
          this.addDecision(decision);
          newDecisions.push(decision);
          bus.emit("sound:play", { id: "agent-chime" });
        }
      }
    }

    this.state = newDecisions.length > 0 ? "deploying" : "watching";

    // Clear tool buffer after evaluation to avoid re-triggering.
    if (newDecisions.length > 0) {
      this.recentToolBuffer.length = 0;
      this.recentFileBuffer.length = 0;
    }

    return newDecisions;
  }

  // ── Decision Management ────────────────────────────────

  approveDecision(id: string): void {
    const d = this.decisions.find(x => x.id === id);
    if (d && d.status === "proposed") d.status = "approved";
  }

  cancelDecision(id: string): void {
    const d = this.decisions.find(x => x.id === id);
    if (d && (d.status === "proposed" || d.status === "approved")) d.status = "cancelled";
  }

  overrideDecision(id: string): void {
    const d = this.decisions.find(x => x.id === id);
    if (d) d.status = "overridden";
  }

  completeDecision(id: string): void {
    const d = this.decisions.find(x => x.id === id);
    if (d) d.status = "completed";
  }

  getActiveDecisions(): DirectorDecision[] {
    return this.decisions.filter(d => d.status === "proposed" || d.status === "approved" || d.status === "executing");
  }

  getAllDecisions(): DirectorDecision[] {
    return this.decisions;
  }

  getPendingApprovals(): DirectorDecision[] {
    return this.decisions.filter(d => d.status === "proposed" && !d.autoApproved);
  }

  // ── State ──────────────────────────────────────────────

  getState(): DirectorState { return this.state; }
  isEnabled(): boolean { return this.enabled; }
  setEnabled(on: boolean): void { this.enabled = on; }
  getRules(): TriggerRule[] { return this.rules; }
  getPatterns(): PatternInsight[] { return this.patterns; }

  // ── Internals ──────────────────────────────────────────

  private addDecision(d: DirectorDecision): void {
    this.decisions.push(d);
    if (this.decisions.length > Director.MAX_DECISIONS) this.decisions.shift();
  }
}
