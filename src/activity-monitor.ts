/**
 * Activity Monitor — polls Claude Code JSONL transcripts for events.
 *
 * Claude Code writes session transcripts as JSONL files in:
 *   ~/.claude/projects/<project-hash>/
 *
 * We poll these files every 500ms (same approach as Pixel Agents —
 * fs.watch is unreliable on macOS/WSL2) and parse tool_use / tool_result
 * blocks to detect what Claude is doing.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { BatCaveEvent, AGENTS } from "./types";

const POLL_INTERVAL_MS = 500;
const MAX_READ_BYTES = 64 * 1024; // 64KB per poll cycle

export class ActivityMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastFileSize = 0;
  private currentFile: string | null = null;
  private onEvent: (event: BatCaveEvent) => void;

  // Session counters
  private messagesCount = 0;
  private toolCallsCount = 0;
  private agentsSpawnedCount = 0;
  private sessionStartedAt = Date.now();
  private activeAgents = new Set<string>();
  private toolToAgent = new Map<string, string>(); // tool_use_id → agentId
  private lastState: "idle" | "thinking" | "writing" = "idle";
  private rescanTimer = 0;
  private static readonly RESCAN_INTERVAL_MS = 5000;
  private static readonly ESTIMATED_MAX_MESSAGES = 80;

  constructor(onEvent: (event: BatCaveEvent) => void) {
    this.onEvent = onEvent;
  }

  start(): void {
    this.sessionStartedAt = Date.now();
    this.findActiveTranscript();
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Find the most recently modified JSONL transcript file. */
  private findActiveTranscript(): void {
    const claudeDir = path.join(os.homedir(), ".claude", "projects");
    if (!fs.existsSync(claudeDir)) {
      return;
    }

    let newestFile: string | null = null;
    let newestMtime = 0;

    try {
      const projectDirs = fs.readdirSync(claudeDir, { withFileTypes: true });
      for (const dir of projectDirs) {
        if (!dir.isDirectory()) continue;
        const projectPath = path.join(claudeDir, dir.name);
        const files = fs.readdirSync(projectPath).filter((f) => f.endsWith(".jsonl"));
        for (const file of files) {
          const fullPath = path.join(projectPath, file);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.mtimeMs > newestMtime) {
              newestMtime = stat.mtimeMs;
              newestFile = fullPath;
            }
          } catch {
            // File may have been deleted between readdir and stat.
          }
        }
      }
    } catch {
      // Claude dir may not be readable.
    }

    if (newestFile && newestFile !== this.currentFile) {
      this.currentFile = newestFile;
      // Start reading from end of file (only new content).
      try {
        this.lastFileSize = fs.statSync(newestFile).size;
      } catch {
        this.lastFileSize = 0;
      }
    }
  }

  private poll(): void {
    // Re-check for newer transcript files every 5s (not every poll cycle).
    this.rescanTimer += POLL_INTERVAL_MS;
    if (this.rescanTimer >= ActivityMonitor.RESCAN_INTERVAL_MS) {
      this.rescanTimer = 0;
      this.findActiveTranscript();
    }

    if (!this.currentFile) return;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(this.currentFile);
    } catch {
      return;
    }

    if (stat.size <= this.lastFileSize) return;

    const bytesToRead = Math.min(stat.size - this.lastFileSize, MAX_READ_BYTES);
    const buffer = Buffer.alloc(bytesToRead);

    let fd: number;
    try {
      fd = fs.openSync(this.currentFile, "r");
      fs.readSync(fd, buffer, 0, bytesToRead, this.lastFileSize);
      fs.closeSync(fd);
    } catch {
      return;
    }

    this.lastFileSize = stat.size;

    const chunk = buffer.toString("utf-8");
    const lines = chunk.split("\n").filter((l) => l.trim());

    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        this.processRecord(record);
      } catch {
        // Malformed line — skip.
      }
    }
  }

  private processRecord(record: Record<string, unknown>): void {
    const type = record.type as string | undefined;
    const now = Date.now();

    if (type === "assistant") {
      // Assistant message — may contain tool_use blocks.
      this.messagesCount++;
      const content = record.message as Record<string, unknown> | undefined;
      const contentBlocks = (content?.content as unknown[]) || [];

      for (const block of contentBlocks) {
        const b = block as Record<string, unknown>;
        if (b.type === "tool_use") {
          this.toolCallsCount++;
          const toolName = b.name as string;

          // Detect slash command invocations (Skill tool).
          if (toolName === "Skill") {
            const input = b.input as Record<string, unknown> | undefined;
            const skillName = input?.skill as string | undefined;
            const toolUseId = b.id as string | undefined;
            if (skillName && AGENTS[skillName]) {
              this.agentsSpawnedCount++;
              this.activeAgents.add(skillName);
              if (toolUseId) {
                this.toolToAgent.set(toolUseId, skillName);
              }
              this.onEvent({
                type: "agent_enter",
                agentId: skillName,
                agentName: AGENTS[skillName].name,
                timestamp: now,
              });
            }
          }

          // Detect Agent tool spawns — try to identify chess piece from description/prompt.
          if (toolName === "Agent") {
            this.agentsSpawnedCount++;
            const input = b.input as Record<string, unknown> | undefined;
            const toolUseId = b.id as string | undefined;
            const agentId = this.identifyAgentFromInput(input);
            if (agentId && !this.activeAgents.has(agentId)) {
              this.activeAgents.add(agentId);
              if (toolUseId) {
                this.toolToAgent.set(toolUseId, agentId);
              }
              this.onEvent({
                type: "agent_enter",
                agentId,
                agentName: AGENTS[agentId]?.name || agentId,
                timestamp: now,
              });
            }
          }

          this.onEvent({
            type: "tool_start",
            toolName,
            timestamp: now,
          });

          // Update Claude state.
          const newState = this.inferState(toolName);
          if (newState !== this.lastState) {
            this.lastState = newState;
            this.onEvent({ type: `session_${newState}`, timestamp: now });
          }
        }
      }

      this.emitUsageUpdate();
    }

    if (type === "user") {
      // Tool results come as user messages.
      const content = (record.message as Record<string, unknown>)?.content as unknown[];
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>;
          if (b.type === "tool_result") {
            const toolUseId = b.tool_use_id as string;
            this.onEvent({
              type: "tool_end",
              toolName: toolUseId || "unknown",
              timestamp: now,
            });

            // If this tool_result corresponds to a Skill agent, emit agent_exit.
            const agentId = this.toolToAgent.get(toolUseId);
            if (agentId) {
              this.toolToAgent.delete(toolUseId);
              this.activeAgents.delete(agentId);
              this.onEvent({
                type: "agent_exit",
                agentId,
                agentName: AGENTS[agentId].name,
                timestamp: now,
              });
            }
          }
        }
      }
    }
  }

  /** Try to identify a chess-piece agent from Agent tool input fields. */
  private identifyAgentFromInput(input: Record<string, unknown> | undefined): string | null {
    if (!input) return null;
    const desc = ((input.description as string) || "").toLowerCase();
    const prompt = ((input.prompt as string) || "").toLowerCase();
    const text = desc + " " + prompt;

    // Check each known agent name against description/prompt.
    for (const agentId of Object.keys(AGENTS)) {
      if (text.includes(agentId.replace("-", " ")) || text.includes(agentId)) {
        return agentId;
      }
    }

    // Also check Italian names.
    const italianMap: Record<string, string> = {
      "sovrano": "king",
      "stratega": "queen",
      "fortezza": "white-rook",
      "architetto": "knight",
      "segretario": "pawn",
      "scassinatore": "black-rook",
      "demolitore": "black-bishop",
      "sabotatore": "black-knight",
      "cancelliere": "chancellor",
      "cardinale": "cardinal",
      "esploratore": "scout",
      "nave": "ship",
    };
    for (const [name, id] of Object.entries(italianMap)) {
      if (text.includes(name)) return id;
    }

    return null;
  }

  private inferState(toolName: string): "thinking" | "writing" | "idle" {
    const writingTools = ["Edit", "Write", "NotebookEdit"];
    const thinkingTools = ["Read", "Grep", "Glob", "Bash", "Agent", "WebSearch", "WebFetch"];

    if (writingTools.includes(toolName)) return "writing";
    if (thinkingTools.includes(toolName)) return "thinking";
    return "thinking";
  }

  private emitUsageUpdate(): void {
    this.onEvent({
      type: "usage_update",
      messagesThisSession: this.messagesCount,
      toolCallsThisSession: this.toolCallsCount,
      agentsSpawnedThisSession: this.agentsSpawnedCount,
      activeModel: "claude-opus-4-6",
      sessionStartedAt: this.sessionStartedAt,
      // Rough estimate: ~80 assistant messages fills the 200k context window.
      contextFillPct: Math.min(100, Math.round((this.messagesCount / ActivityMonitor.ESTIMATED_MAX_MESSAGES) * 100)),
    });
  }
}
