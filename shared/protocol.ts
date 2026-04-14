/**
 * BatCave Command Protocol — shared types for multi-tenant agent orchestration.
 *
 * The Command Server holds the canonical state of all agents (the "pool").
 * VSCode extensions connect as clients. The master assigns work, members
 * see agents working in real-time.
 */

// ── Agent Pool State ────────────────────────────────────

export type PoolAgentStatus =
  | "idle"
  | "working"
  | "assigned"
  | "scheduled"
  | "offline";

export interface PoolAgent {
  agentId: string; // e.g. "king", "bishop"
  name: string; // display name
  emoji: string;
  role: string;
  status: PoolAgentStatus;
  assignedTo: string | null; // member name, null if idle
  currentTask: string | null; // human-readable task description
  taskStartedAt: number | null; // epoch ms
  queue: QueuedTask[]; // pending tasks
  schedule: AgentSchedule | null;
  stats: {
    totalTasks: number;
    totalActiveMs: number;
    lastActiveAt: number;
  };
}

export interface QueuedTask {
  id: string;
  task: string;
  requestedBy: string; // member name
  requestedAt: number; // epoch ms
  priority: "low" | "normal" | "high" | "urgent";
}

export interface AgentSchedule {
  cron: string; // e.g. "0 8 * * 1-5"
  task: string;
  enabled: boolean;
  lastRanAt: number | null;
  nextRunAt: number | null;
}

// ── Team Members ────────────────────────────────────────

export type MemberRole = "master" | "member";

export interface TeamMember {
  id: string; // unique client ID
  name: string; // display name
  role: MemberRole;
  status: "online" | "idle" | "thinking" | "writing" | "offline";
  connectedAt: number;
  lastActiveAt: number;
  currentRepo: string;
  sessionCost: number; // current session cost USD
  toolCount: number; // current session tools
}

// ── Client → Server Messages ────────────────────────────

export type ClientMessage =
  | {
      type: "auth";
      name: string;
      role: MemberRole;
      repo: string;
      token: string;
    }
  | {
      type: "status_update";
      status: TeamMember["status"];
      cost: number;
      tools: number;
    }
  | {
      type: "assign_agent";
      agentId: string;
      task: string;
      assignTo: string;
      priority: QueuedTask["priority"];
    }
  | { type: "unassign_agent"; agentId: string }
  | {
      type: "queue_task";
      agentId: string;
      task: string;
      priority: QueuedTask["priority"];
    }
  | { type: "cancel_task"; agentId: string; taskId: string }
  | {
      type: "set_schedule";
      agentId: string;
      cron: string;
      task: string;
      enabled: boolean;
    }
  | { type: "clear_schedule"; agentId: string }
  | { type: "agent_started"; agentId: string } // member reports agent began working
  | { type: "agent_finished"; agentId: string } // member reports agent done
  | { type: "request_state" }; // request full state snapshot

// ── Server → Client Messages ────────────────────────────

export type ServerMessage =
  | { type: "state"; agents: PoolAgent[]; members: TeamMember[] }
  | { type: "agent_updated"; agent: PoolAgent }
  | { type: "member_updated"; member: TeamMember }
  | { type: "member_joined"; member: TeamMember }
  | { type: "member_left"; memberId: string }
  | { type: "task_assigned"; agentId: string; task: string; assignedTo: string }
  | { type: "task_completed"; agentId: string; completedBy: string }
  | { type: "error"; message: string }
  | { type: "welcome"; memberId: string; role: MemberRole };

// ── Config ──────────────────────────────────────────────

export const DEFAULT_PORT = 7777;
export const HEARTBEAT_INTERVAL_MS = 5000;

/** All 21 Scacchiera v4.1 chess piece agent IDs. */
export const POOL_AGENT_IDS = [
  // strategy
  "king",
  "queen",
  "heretic",
  // builder
  "knight",
  "weaver",
  "sculptor",
  "herald",
  // quality
  "bishop",
  "cardinal",
  "scout",
  "specter",
  // security
  "rook",
  "marauder",
  // orchestration & ops
  "marshal",
  "chancellor",
  "ship",
  "pawn",
  // knowledge
  "oracle",
  "thief",
  // meta
  "polymorph",
  "loop",
] as const;
