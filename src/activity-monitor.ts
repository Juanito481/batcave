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
  private lastState: "idle" | "thinking" | "writing" = "idle";

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
    // Re-check for newer transcript files periodically.
    this.findActiveTranscript();

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
            if (skillName && AGENTS[skillName]) {
              this.agentsSpawnedCount++;
              this.activeAgents.add(skillName);
              this.onEvent({
                type: "agent_enter",
                agentId: skillName,
                agentName: AGENTS[skillName].name,
                timestamp: now,
              });
            }
          }

          // Detect Agent tool spawns.
          if (toolName === "Agent") {
            this.agentsSpawnedCount++;
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
            this.onEvent({
              type: "tool_end",
              toolName: (b.tool_use_id as string) || "unknown",
              timestamp: now,
            });
          }
        }
      }
    }
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
      contextFillPct: Math.min(100, Math.round((this.messagesCount / 80) * 100)),
    });
  }
}
