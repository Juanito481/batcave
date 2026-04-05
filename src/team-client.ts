/**
 * TeamClient — connects the VSCode extension to the BatCave Command Server.
 *
 * When batcave.teamServer is configured, this client:
 * - Connects via WebSocket to the command server
 * - Authenticates with member name and role
 * - Forwards server state to the webview
 * - Sends member status updates (idle/thinking/writing)
 * - Relays master commands (assign, queue, schedule) from webview
 */

import WebSocket from "ws";
import type { ClientMessage, ServerMessage, MemberRole } from "../shared/protocol";

export class TeamClient {
  private ws: WebSocket | null = null;
  private url: string;
  private name: string;
  private role: MemberRole;
  private repo: string;
  private token: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private onMessage: (msg: ServerMessage) => void;
  private connected = false;

  constructor(
    url: string,
    name: string,
    role: MemberRole,
    repo: string,
    token: string,
    onMessage: (msg: ServerMessage) => void,
  ) {
    this.url = url;
    this.name = name;
    this.role = role;
    this.repo = repo;
    this.token = token;
    this.onMessage = onMessage;
  }

  connect(): void {
    if (this.ws) return;

    try {
      this.ws = new WebSocket(this.url) as WebSocket;

      this.ws!.on("open", () => {
        this.connected = true;
        console.log("[BatCave Team] Connected to command server");
        this.send({ type: "auth", name: this.name, role: this.role, repo: this.repo, token: this.token });
      });

      this.ws!.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as ServerMessage;
          this.onMessage(msg);
        } catch {
          // Ignore malformed messages.
        }
      });

      this.ws!.on("close", () => {
        this.connected = false;
        this.ws = null;
        console.log("[BatCave Team] Disconnected, reconnecting in 5s...");
        this.scheduleReconnect();
      });

      this.ws!.on("error", (err: Error) => {
        console.warn("[BatCave Team] Connection error:", err.message);
        this.ws?.close();
      });
    } catch (err) {
      console.warn("[BatCave Team] Failed to connect:", (err as Error).message);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** Send periodic status update. */
  sendStatusUpdate(status: "online" | "idle" | "thinking" | "writing", cost: number, tools: number): void {
    this.send({ type: "status_update", status, cost, tools });
  }

  /** Master: assign agent to a member. */
  assignAgent(agentId: string, task: string, assignTo: string, priority: "low" | "normal" | "high" | "urgent" = "normal"): void {
    this.send({ type: "assign_agent", agentId, task, assignTo, priority });
  }

  /** Queue a task for an agent. */
  queueTask(agentId: string, task: string, priority: "low" | "normal" | "high" | "urgent" = "normal"): void {
    this.send({ type: "queue_task", agentId, task, priority });
  }

  /** Report agent started working. */
  reportAgentStarted(agentId: string): void {
    this.send({ type: "agent_started", agentId });
  }

  /** Report agent finished. */
  reportAgentFinished(agentId: string): void {
    this.send({ type: "agent_finished", agentId });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }
}
