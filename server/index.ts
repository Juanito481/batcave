/**
 * BatCave Command Server — holds the shared agent pool state.
 *
 * A lightweight WebSocket server that:
 * - Maintains canonical state of all 13 agents
 * - Tracks connected team members
 * - Broadcasts state changes in real-time
 * - Enforces master/member roles
 * - Manages task queues and schedules
 *
 * Run: npx tsx server/index.ts
 * Or:  node dist/server/index.js
 */

import { WebSocketServer, WebSocket } from "ws";
import {
  PoolAgent, TeamMember, ClientMessage, ServerMessage,
  PoolAgentStatus, QueuedTask, MemberRole,
  DEFAULT_PORT, HEARTBEAT_INTERVAL_MS, POOL_AGENT_IDS,
} from "../shared/protocol";

// ── State ───────────────────────────────────────────────

const agents = new Map<string, PoolAgent>();
const members = new Map<string, { member: TeamMember; ws: WebSocket }>();

// Initialize agent pool.
function initPool(): void {
  const agentMeta: Record<string, { name: string; emoji: string; role: string }> = {
    king:           { name: "Il Sovrano",       emoji: "♔", role: "Vision & coherence" },
    queen:          { name: "La Stratega",      emoji: "👑", role: "Business analysis" },
    "white-rook":   { name: "La Fortezza",      emoji: "♖", role: "Security defense" },
    bishop:         { name: "Bishop",           emoji: "🔎", role: "Code review" },
    knight:         { name: "L'Architetto",     emoji: "🐴", role: "Architecture" },
    pawn:           { name: "Il Segretario",    emoji: "♟️", role: "Briefing & status" },
    "black-rook":   { name: "Lo Scassinatore",  emoji: "♜", role: "Red team & pentest" },
    "black-bishop": { name: "Il Demolitore",    emoji: "♝", role: "Tech debt hunter" },
    "black-knight": { name: "Il Sabotatore",    emoji: "♞", role: "Chaos & edge cases" },
    chancellor:     { name: "Il Cancelliere",   emoji: "⚙️", role: "DevOps & infra" },
    cardinal:       { name: "Il Cardinale",     emoji: "🧪", role: "Testing & QA" },
    scout:          { name: "L'Esploratore",    emoji: "👁️", role: "Browser & visual" },
    ship:           { name: "La Nave",          emoji: "🚢", role: "Git commit & push" },
  };

  for (const id of POOL_AGENT_IDS) {
    const meta = agentMeta[id] || { name: id, emoji: "?", role: "unknown" };
    agents.set(id, {
      agentId: id,
      name: meta.name,
      emoji: meta.emoji,
      role: meta.role,
      status: "idle",
      assignedTo: null,
      currentTask: null,
      taskStartedAt: null,
      queue: [],
      schedule: null,
      stats: { totalTasks: 0, totalActiveMs: 0, lastActiveAt: 0 },
    });
  }
}

// ── Broadcast ───────────────────────────────────────────

function broadcast(msg: ServerMessage, except?: string): void {
  const data = JSON.stringify(msg);
  for (const [id, { ws }] of members) {
    if (id === except) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function getFullState(): ServerMessage {
  return {
    type: "state",
    agents: Array.from(agents.values()),
    members: Array.from(members.values()).map(m => m.member),
  };
}

// ── Message Handling ────────────────────────────────────

function handleMessage(clientId: string, ws: WebSocket, msg: ClientMessage): void {
  const client = members.get(clientId);

  switch (msg.type) {
    case "auth": {
      const member: TeamMember = {
        id: clientId,
        name: msg.name,
        role: msg.role,
        status: "online",
        connectedAt: Date.now(),
        lastActiveAt: Date.now(),
        currentRepo: msg.repo,
        sessionCost: 0,
        toolCount: 0,
      };
      members.set(clientId, { member, ws });
      send(ws, { type: "welcome", memberId: clientId, role: msg.role });
      send(ws, getFullState());
      broadcast({ type: "member_joined", member }, clientId);
      log(`${member.name} joined as ${member.role}`);
      break;
    }

    case "status_update": {
      if (!client) return;
      client.member.status = msg.status;
      client.member.sessionCost = msg.cost;
      client.member.toolCount = msg.tools;
      client.member.lastActiveAt = Date.now();
      broadcast({ type: "member_updated", member: client.member });
      break;
    }

    case "assign_agent": {
      if (!client || client.member.role !== "master") {
        send(ws, { type: "error", message: "Only master can assign agents" });
        return;
      }
      const agent = agents.get(msg.agentId);
      if (!agent) return;
      agent.status = "assigned";
      agent.assignedTo = msg.assignTo;
      agent.currentTask = msg.task;
      agent.taskStartedAt = Date.now();
      broadcast({ type: "agent_updated", agent });
      broadcast({ type: "task_assigned", agentId: msg.agentId, task: msg.task, assignedTo: msg.assignTo });
      log(`${agent.emoji} ${agent.name} assigned to ${msg.assignTo}: ${msg.task}`);
      break;
    }

    case "unassign_agent": {
      if (!client || client.member.role !== "master") {
        send(ws, { type: "error", message: "Only master can unassign agents" });
        return;
      }
      const agent = agents.get(msg.agentId);
      if (!agent) return;
      if (agent.taskStartedAt) {
        agent.stats.totalActiveMs += Date.now() - agent.taskStartedAt;
      }
      agent.status = agent.queue.length > 0 ? "assigned" : "idle";
      agent.assignedTo = null;
      agent.currentTask = null;
      agent.taskStartedAt = null;
      // Auto-dequeue next task if available.
      if (agent.queue.length > 0) {
        const next = agent.queue.shift()!;
        agent.assignedTo = next.requestedBy;
        agent.currentTask = next.task;
        agent.taskStartedAt = Date.now();
      }
      broadcast({ type: "agent_updated", agent });
      break;
    }

    case "queue_task": {
      const agent = agents.get(msg.agentId);
      if (!agent || !client) return;
      const task: QueuedTask = {
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        task: msg.task,
        requestedBy: client.member.name,
        requestedAt: Date.now(),
        priority: msg.priority,
      };
      agent.queue.push(task);
      // Sort by priority.
      const order = { urgent: 0, high: 1, normal: 2, low: 3 };
      agent.queue.sort((a, b) => order[a.priority] - order[b.priority]);
      // If agent is idle, auto-assign.
      if (agent.status === "idle") {
        const next = agent.queue.shift()!;
        agent.status = "assigned";
        agent.assignedTo = next.requestedBy;
        agent.currentTask = next.task;
        agent.taskStartedAt = Date.now();
      }
      broadcast({ type: "agent_updated", agent });
      log(`Task queued for ${agent.emoji} ${agent.name}: ${msg.task} (by ${client.member.name})`);
      break;
    }

    case "cancel_task": {
      const agent = agents.get(msg.agentId);
      if (!agent) return;
      agent.queue = agent.queue.filter(t => t.id !== msg.taskId);
      broadcast({ type: "agent_updated", agent });
      break;
    }

    case "set_schedule": {
      if (!client || client.member.role !== "master") {
        send(ws, { type: "error", message: "Only master can set schedules" });
        return;
      }
      const agent = agents.get(msg.agentId);
      if (!agent) return;
      agent.schedule = {
        cron: msg.cron,
        task: msg.task,
        enabled: msg.enabled,
        lastRanAt: null,
        nextRunAt: null, // TODO: compute from cron
      };
      if (msg.enabled) agent.status = "scheduled";
      broadcast({ type: "agent_updated", agent });
      log(`Schedule set for ${agent.emoji} ${agent.name}: ${msg.cron} — ${msg.task}`);
      break;
    }

    case "clear_schedule": {
      if (!client || client.member.role !== "master") return;
      const agent = agents.get(msg.agentId);
      if (!agent) return;
      agent.schedule = null;
      if (agent.status === "scheduled") agent.status = "idle";
      broadcast({ type: "agent_updated", agent });
      break;
    }

    case "agent_started": {
      const agent = agents.get(msg.agentId);
      if (!agent || !client) return;
      agent.status = "working";
      agent.taskStartedAt = Date.now();
      agent.stats.totalTasks++;
      broadcast({ type: "agent_updated", agent });
      log(`${agent.emoji} ${agent.name} started working for ${client.member.name}`);
      break;
    }

    case "agent_finished": {
      const agent = agents.get(msg.agentId);
      if (!agent || !client) return;
      if (agent.taskStartedAt) {
        agent.stats.totalActiveMs += Date.now() - agent.taskStartedAt;
      }
      agent.stats.lastActiveAt = Date.now();
      broadcast({ type: "task_completed", agentId: msg.agentId, completedBy: client.member.name });
      // Dequeue next or go idle.
      if (agent.queue.length > 0) {
        const next = agent.queue.shift()!;
        agent.status = "assigned";
        agent.assignedTo = next.requestedBy;
        agent.currentTask = next.task;
        agent.taskStartedAt = Date.now();
      } else {
        agent.status = agent.schedule?.enabled ? "scheduled" : "idle";
        agent.assignedTo = null;
        agent.currentTask = null;
        agent.taskStartedAt = null;
      }
      broadcast({ type: "agent_updated", agent });
      log(`${agent.emoji} ${agent.name} finished`);
      break;
    }

    case "request_state": {
      send(ws, getFullState());
      break;
    }
  }
}

// ── Server ──────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function startServer(port: number = DEFAULT_PORT): void {
  initPool();

  const wss = new WebSocketServer({ port });
  let nextId = 1;

  wss.on("connection", (ws) => {
    const clientId = `client_${nextId++}`;
    log(`Client connected: ${clientId}`);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        handleMessage(clientId, ws, msg);
      } catch (e) {
        send(ws, { type: "error", message: "Invalid message format" });
      }
    });

    ws.on("close", () => {
      const client = members.get(clientId);
      if (client) {
        log(`${client.member.name} disconnected`);
        members.delete(clientId);
        broadcast({ type: "member_left", memberId: clientId });
      }
    });
  });

  // Heartbeat — disconnect stale clients.
  setInterval(() => {
    const now = Date.now();
    for (const [id, { member, ws }] of members) {
      if (now - member.lastActiveAt > 30000 && ws.readyState === WebSocket.OPEN) {
        member.status = "idle";
        broadcast({ type: "member_updated", member });
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  log(`BatCave Command Server running on ws://localhost:${port}`);
  log(`${agents.size} agents in pool, waiting for connections...`);
}

startServer();
