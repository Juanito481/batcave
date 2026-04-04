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
  private toolIdToName = new Map<string, string>(); // tool_use_id → toolName
  private lastState: "idle" | "thinking" | "writing" = "idle";
  private rescanTimer = 0;
  private static readonly RESCAN_INTERVAL_MS = 5000;
  // Multi-session tracking.
  private static readonly SESSION_ACTIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5 min
  private knownSessions: { projectHash: string; label: string; filePath: string; lastActive: number }[] = [];
  // 1M context ≈ 250 assistant messages + tool overhead.
  // Each assistant msg ≈ 2k tokens avg; each tool call ≈ 1.5k tokens avg.
  // Budget: ~500k tokens effective (system prompt + memory eats ~50%).
  // (msgs * 2000 + tools * 1500) / 500_000 → simplified to weighted score.
  private static readonly CONTEXT_BUDGET_TOKENS = 500_000;
  private static readonly TOKENS_PER_MSG = 2000;
  private static readonly TOKENS_PER_TOOL = 1500;

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

  /** Find the most recently modified JSONL transcript file and track all sessions. */
  private findActiveTranscript(): void {
    const claudeDir = path.join(os.homedir(), ".claude", "projects");
    if (!fs.existsSync(claudeDir)) {
      return;
    }

    let newestFile: string | null = null;
    let newestMtime = 0;
    const now = Date.now();
    const sessions: typeof this.knownSessions = [];

    try {
      const projectDirs = fs.readdirSync(claudeDir, { withFileTypes: true });
      for (const dir of projectDirs) {
        if (!dir.isDirectory()) continue;
        const projectPath = path.join(claudeDir, dir.name);
        const files = fs.readdirSync(projectPath).filter((f) => f.endsWith(".jsonl"));

        let dirNewest: string | null = null;
        let dirNewestMtime = 0;

        for (const file of files) {
          const fullPath = path.join(projectPath, file);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.mtimeMs > dirNewestMtime) {
              dirNewestMtime = stat.mtimeMs;
              dirNewest = fullPath;
            }
            if (stat.mtimeMs > newestMtime) {
              newestMtime = stat.mtimeMs;
              newestFile = fullPath;
            }
          } catch {
            // File may have been deleted between readdir and stat.
          }
        }

        // Track session if recently active.
        if (dirNewest && (now - dirNewestMtime) < ActivityMonitor.SESSION_ACTIVE_THRESHOLD_MS) {
          // Derive readable label from project hash directory name.
          const label = this.projectHashToLabel(dir.name);
          sessions.push({
            projectHash: dir.name,
            label,
            filePath: dirNewest,
            lastActive: dirNewestMtime,
          });
        }
      }
    } catch {
      // Claude dir may not be readable.
    }

    // Update known sessions and emit list.
    this.knownSessions = sessions;
    if (sessions.length > 0) {
      const currentHash = this.currentFile
        ? path.basename(path.dirname(this.currentFile))
        : "";
      this.onEvent({
        type: "sessions_list",
        sessions: sessions.map(s => ({
          projectHash: s.projectHash,
          label: s.label,
          lastActive: s.lastActive,
          isCurrent: s.projectHash === currentHash,
        })),
        timestamp: now,
      });
    }

    if (newestFile && newestFile !== this.currentFile) {
      this.currentFile = newestFile;
      // Start reading from end of file (only new content).
      try {
        this.lastFileSize = fs.statSync(newestFile).size;
      } catch {
        this.lastFileSize = 0;
      }
      // Reset session state for the new transcript.
      this.messagesCount = 0;
      this.toolCallsCount = 0;
      this.agentsSpawnedCount = 0;
      this.sessionStartedAt = Date.now();
      this.lastState = "idle";
      // Emit exit for any lingering agents from previous session.
      for (const agentId of this.activeAgents) {
        this.onEvent({
          type: "agent_exit",
          agentId,
          agentName: AGENTS[agentId]?.name || agentId,
          timestamp: now,
        });
      }
      this.activeAgents.clear();
      this.toolToAgent.clear();
      this.toolIdToName.clear();
    }
  }

  /** Convert Claude project hash directory name to a readable label. */
  private projectHashToLabel(dirName: string): string {
    // Claude project dirs are named like: -Users-name-path-to-project
    // Extract the last meaningful segment.
    const parts = dirName.split("-").filter(Boolean);
    if (parts.length === 0) return dirName;
    // Skip "Users" and username, take the last 1-2 segments.
    const meaningful = parts.filter(p => p !== "Users" && p.length > 1);
    if (meaningful.length >= 2) {
      return meaningful.slice(-2).join("/");
    }
    return meaningful[meaningful.length - 1] || dirName;
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
    } catch (err) {
      console.warn("[BatCave] Failed to open transcript:", (err as Error).message);
      return;
    }
    try {
      fs.readSync(fd, buffer, 0, bytesToRead, this.lastFileSize);
    } catch (err) {
      console.warn("[BatCave] Failed to read transcript:", (err as Error).message);
      fs.closeSync(fd);
      return;
    }
    fs.closeSync(fd);

    this.lastFileSize = stat.size;

    const chunk = buffer.toString("utf-8");
    const lines = chunk.split("\n").filter((l) => l.trim());

    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        this.processRecord(record);
      } catch (err) {
        console.warn("[BatCave] Malformed JSONL line, skipping:", (err as Error).message);
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

          // Track tool_use_id → toolName for tool_end resolution.
          const toolUseIdForMap = b.id as string | undefined;
          if (toolUseIdForMap) {
            this.toolIdToName.set(toolUseIdForMap, toolName);
          }

          // Extract file path from tool input when available.
          const filePath = this.extractFilePath(toolName, b.input as Record<string, unknown> | undefined);

          this.onEvent({
            type: "tool_start",
            toolName,
            timestamp: now,
            filePath: filePath || undefined,
          });

          // Detect git operations from Bash commands.
          if (toolName === "Bash") {
            const cmd = (b.input as Record<string, unknown> | undefined)?.command as string | undefined;
            if (cmd) {
              this.detectGitActivity(cmd, now);
            }
          }

          // Detect todo updates from TodoWrite tool.
          if (toolName === "TodoWrite") {
            const input = b.input as Record<string, unknown> | undefined;
            this.detectTodoUpdate(input, now);
          }

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
            const resolvedToolName = this.toolIdToName.get(toolUseId) || "unknown";
            this.toolIdToName.delete(toolUseId);
            this.onEvent({
              type: "tool_end",
              toolName: resolvedToolName,
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
                agentName: AGENTS[agentId]?.name || agentId,
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

    // Check each known agent ID using word-boundary regex to avoid partial matches.
    // Sort by length descending so "black-knight" matches before "knight".
    const sortedIds = Object.keys(AGENTS).sort((a, b) => b.length - a.length);
    for (const agentId of sortedIds) {
      // Match "black-knight" or "black knight" as whole words.
      const pattern = new RegExp(`\\b${agentId.replace("-", "[- ]")}\\b`);
      if (pattern.test(text)) {
        return agentId;
      }
    }

    // Also check Italian names with word-boundary regex.
    const italianMap: Record<string, string> = {
      "sovrano": "king",
      "stratega": "queen",
      "fortezza": "white-rook",
      "architetto": "knight",
      "ossessivo": "bishop",
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
      if (new RegExp(`\\b${name}\\b`).test(text)) return id;
    }

    return null;
  }

  /** Detect git commit/push from Bash commands. */
  private detectGitActivity(cmd: string, now: number): void {
    // git commit -m "message" or git commit -m "$(cat <<'EOF' ... EOF)"
    const commitMatch = cmd.match(/git\s+commit\s+.*-m\s+["']([^"'\n]{1,80})/);
    if (commitMatch) {
      this.onEvent({ type: "git_commit", message: commitMatch[1], timestamp: now });
    }
    if (/git\s+push\b/.test(cmd)) {
      this.onEvent({ type: "git_push", message: "push", timestamp: now });
    }
  }

  /** Detect todo list updates from TodoWrite tool. */
  private detectTodoUpdate(input: Record<string, unknown> | undefined, now: number): void {
    if (!input) return;
    const todos = input.todos as { content?: string; status?: string }[] | undefined;
    if (!Array.isArray(todos)) return;
    this.onEvent({
      type: "todo_update",
      todos: todos
        .filter((t) => t.content && t.status)
        .map((t) => ({
          content: t.content as string,
          status: t.status as "pending" | "in_progress" | "completed",
        })),
      timestamp: now,
    });
  }

  /** Extract file path from tool input fields. */
  private extractFilePath(toolName: string, input: Record<string, unknown> | undefined): string | null {
    if (!input) return null;
    // Read, Edit, Write, Grep, Glob all use file_path or path.
    const filePath = (input.file_path as string) || (input.path as string) || null;
    if (filePath) return filePath;
    // Bash: extract from command if it references a file.
    if (toolName === "Bash") {
      const cmd = input.command as string | undefined;
      if (cmd) return null; // Too complex to parse reliably — skip.
    }
    return null;
  }

  private inferState(toolName: string): "thinking" | "writing" | "idle" {
    const writingTools = ["Edit", "Write", "NotebookEdit"];
    const thinkingTools = ["Read", "Grep", "Glob", "Bash", "Agent", "WebSearch", "WebFetch"];

    if (writingTools.includes(toolName)) return "writing";
    if (thinkingTools.includes(toolName)) return "thinking";
    return this.lastState; // unknown tools don't change state
  }

  private emitUsageUpdate(): void {
    this.onEvent({
      type: "usage_update",
      messagesThisSession: this.messagesCount,
      toolCallsThisSession: this.toolCallsCount,
      agentsSpawnedThisSession: this.agentsSpawnedCount,
      activeModel: "claude-opus-4-6",
      sessionStartedAt: this.sessionStartedAt,
      // Weighted estimate: messages + tool calls against 1M context budget.
      contextFillPct: Math.min(100, Math.round(
        ((this.messagesCount * ActivityMonitor.TOKENS_PER_MSG +
          this.toolCallsCount * ActivityMonitor.TOKENS_PER_TOOL) /
          ActivityMonitor.CONTEXT_BUDGET_TOKENS) * 100
      )),
    });
  }
}
