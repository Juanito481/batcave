/**
 * Bat Cave — VSCode Extension Entry Point
 *
 * Registers a WebviewViewProvider that renders the pixel art Bat Cave
 * in the bottom panel, alongside the terminal.
 *
 * The extension:
 * 1. Starts the ActivityMonitor (polls Claude Code JSONL transcripts)
 * 2. Forwards events to the webview via postMessage
 * 3. Manages the webview lifecycle
 */

import * as vscode from "vscode";
import * as path from "path";
import { ActivityMonitor } from "./activity-monitor";
import { BatCaveEvent, AGENTS, ExtToWebviewMessage, WebviewToExtMessage, SessionSummary } from "./types";
import { TeamClient } from "./team-client";

/** Escape a string for safe use inside single-quoted shell arguments. */
function escapeShellArg(s: string): string {
  // Replace single quotes with '\'' (end quote, escaped quote, start quote).
  return s.replace(/'/g, "'\\''");
}

const VIEW_ID = "batcave.mainView";
const SESSION_HISTORY_KEY = "batcave.sessionHistory";
const TEAM_STATS_KEY = "batcave.teamStats";
const MAX_STORED_SESSIONS = 50;

/** Workflow step definition. */
interface WorkflowStep {
  agentId: string;
  task: string;
}

/** Workflow definition from .batcave/workflows.json. */
interface WorkflowDef {
  name: string;
  description: string;
  emoji: string;
  steps: WorkflowStep[];
}

/** Schedule definition. */
interface ScheduleDef {
  workflow: string;
  cron: string;
  description: string;
  enabled: boolean;
}

/** Team stats entry — one per session push. */
interface TeamStatsEntry {
  user: string;
  repo: string;
  sessionId: string;
  timestamp: number;
  tools: number;
  cost: number;
  achievements: number;
  depth: number;
  score: number;
}

class BatCaveViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private webviewReady = false;
  private monitor: ActivityMonitor;
  private eventQueue: BatCaveEvent[] = [];
  private globalState: vscode.Memento;
  private teamClient: TeamClient | null = null;

  constructor(private readonly extensionUri: vscode.Uri, globalState: vscode.Memento) {
    this.globalState = globalState;
    this.monitor = new ActivityMonitor((event) => this.handleEvent(event));
  }

  /** Connect to team server if configured. */
  connectTeam(): void {
    const config = vscode.workspace.getConfiguration("batcave");
    const serverUrl = config.get<string>("teamServer", "");
    if (!serverUrl) return;

    const role = config.get<string>("role", "member") as "master" | "member";
    const name = config.get<string>("memberName", "") || require("os").userInfo().username || "anonymous";
    const repo = vscode.workspace.workspaceFolders?.[0]?.name || "unknown";
    const token = config.get<string>("teamToken", "");

    this.teamClient = new TeamClient(serverUrl, name, role, repo, token, (msg) => {
      // Forward all server messages to webview as "team-server" command.
      if (this.view && this.webviewReady) {
        this.view.webview.postMessage({ command: "team-server", payload: msg });
      }
    });
    this.teamClient.connect();
  }

  disconnectTeam(): void {
    this.teamClient?.disconnect();
    this.teamClient = null;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "dist", "webview"),
        vscode.Uri.joinPath(this.extensionUri, "webview", "assets"),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    // Message router — clean dispatch instead of 13 else-if blocks.
    const router = new Map<string, (msg: Record<string, unknown>) => void>([
      ["ready", () => {
        this.webviewReady = true;
        this.sendConfig();
        this.sendSessionHistory();
        this.sendCostBudget();
        for (const event of this.eventQueue) { this.postEvent(event); }
        this.eventQueue = [];
      }],
      ["toggleSound", () => this.toggleSound()],
      ["saveSession", (m) => this.saveSession(m.payload as SessionSummary)],
      ["exportSession", () => this.exportSessionData()],
      ["launchAgent", (m) => this.launchAgent(m.agentId as string)],
      ["runWorkflow", (m) => this.runWorkflow(m.workflowId as string)],
      ["pushTeamStats", (m) => this.pushTeamStats(m.payload as TeamStatsEntry)],
      ["requestWorkflows", () => this.sendWorkflows()],
      ["requestTeamStats", () => this.sendTeamStats()],
      ["team-command", (m) => {
        if (this.teamClient) {
          this.teamClient.send(m.payload as import("../shared/protocol").ClientMessage);
        }
      }],
      ["assignAgentPrompt", (m) => this.promptAssignAgent(m.agentId as string)],
      ["whiteboardEdit", (m) => this.editWhiteboard(m.currentMessage as string)],
    ]);

    webviewView.webview.onDidReceiveMessage((msg: Record<string, unknown>) => {
      const handler = router.get(msg.command as string);
      if (handler) handler(msg);
    });

    // Start monitoring Claude Code activity.
    this.monitor.start();

    // Connect to team server if configured.
    this.connectTeam();

    webviewView.onDidDispose(() => {
      this.monitor.stop();
      this.disconnectTeam();
      this.webviewReady = false;
    });
  }

  reset(): void {
    if (this.view && this.webviewReady) {
      this.view.webview.postMessage({ command: "reset", payload: {} });
      this.monitor.stop();
      this.monitor.start();
      this.sendConfig();
    }
  }

  private handleEvent(event: BatCaveEvent): void {
    // Forward state changes to team server.
    if (this.teamClient?.isConnected()) {
      const t = event.type;
      if (t === "session_thinking" || t === "session_writing" || t === "session_idle") {
        const statusMap: Record<string, string> = {
          session_thinking: "thinking", session_writing: "writing", session_idle: "idle",
        };
        this.teamClient.sendStatusUpdate(
          statusMap[t] as "thinking" | "writing" | "idle",
          0, 0, // cost/tools updated via usage_update
        );
      } else if (t === "usage_update") {
        const u = event as { type: string; toolCallsThisSession?: number };
        this.teamClient.sendStatusUpdate("online", 0, (u as Record<string, unknown>).toolCallsThisSession as number || 0);
      } else if (t === "agent_enter") {
        const a = event as { agentId?: string };
        if (a.agentId) this.teamClient.reportAgentStarted(a.agentId);
      } else if (t === "agent_exit") {
        const a = event as { agentId?: string };
        if (a.agentId) this.teamClient.reportAgentFinished(a.agentId);
      }
    }

    if (this.webviewReady && this.view) {
      this.postEvent(event);
    } else {
      // Queue events until webview is ready (max 100).
      if (this.eventQueue.length < 100) {
        this.eventQueue.push(event);
      }
    }
  }

  private postEvent(event: BatCaveEvent): void {
    const msg: ExtToWebviewMessage = { command: "event", payload: event };
    this.view?.webview.postMessage(msg);
  }

  sendSoundSettings(): void {
    if (!this.view || !this.webviewReady) return;
    const config = vscode.workspace.getConfiguration("batcave");
    this.view.webview.postMessage({
      command: "sound-settings",
      payload: {
        enabled: config.get<boolean>("soundEnabled", false),
        volume: config.get<number>("soundVolume", 15),
      },
    });
  }

  toggleSound(): void {
    const config = vscode.workspace.getConfiguration("batcave");
    const current = config.get<boolean>("soundEnabled", false);
    config.update("soundEnabled", !current, vscode.ConfigurationTarget.Global).then(() => {
      this.sendSoundSettings();
      vscode.window.showInformationMessage(`Bat Cave: Sound ${!current ? "ON" : "OFF"}`);
    });
  }

  // ── Session persistence ──────────────────────────────

  private saveSession(summary: SessionSummary): void {
    const history = this.getStoredHistory();
    // Avoid duplicates by session ID.
    const idx = history.findIndex(s => s.id === summary.id);
    if (idx >= 0) {
      history[idx] = summary; // Update existing.
    } else {
      history.unshift(summary); // Prepend new.
    }
    // Cap stored sessions.
    if (history.length > MAX_STORED_SESSIONS) {
      history.length = MAX_STORED_SESSIONS;
    }
    this.globalState.update(SESSION_HISTORY_KEY, history);
  }

  private getStoredHistory(): SessionSummary[] {
    return this.globalState.get<SessionSummary[]>(SESSION_HISTORY_KEY, []);
  }

  private sendSessionHistory(): void {
    if (!this.view || !this.webviewReady) return;
    this.view.webview.postMessage({
      command: "session-history",
      payload: { sessions: this.getStoredHistory() },
    });
  }

  /** Called from the export command — runs export directly since we own the data. */
  triggerExport(): void {
    this.exportSessionData();
  }

  // ── Whiteboard ───────────────────────────────────────

  private async editWhiteboard(currentMessage: string): Promise<void> {
    const msg = await vscode.window.showInputBox({
      prompt: "Write on the whiteboard",
      placeHolder: "Leave empty to clear",
      value: currentMessage,
    });
    if (msg === undefined) return; // cancelled
    this.view?.webview.postMessage({
      command: "whiteboard-message",
      payload: { message: msg || null },
    });
  }

  // ── Agent Launcher ──────────────────────────────────

  private launchAgent(agentId: string): void {
    const meta = AGENTS[agentId];
    if (!meta) {
      vscode.window.showWarningMessage(`Bat Cave: Unknown agent "${agentId}"`);
      return;
    }

    // Build a system prompt that gives Claude the agent's persona.
    const prompt = this.buildAgentPrompt(agentId, meta);

    // Open a new terminal with claude invoked with the agent prompt.
    const terminal = vscode.window.createTerminal({
      name: `${meta.emoji} ${meta.name}`,
      iconPath: new vscode.ThemeIcon("hubot"),
    });
    terminal.show();
    // Use claude with --print for inline mode, or just start an interactive session with context.
    terminal.sendText(`claude --system-prompt '${escapeShellArg(prompt)}'`, true);

    vscode.window.showInformationMessage(`Bat Cave: Launched ${meta.emoji} ${meta.name} (${meta.role})`);
  }

  /** Prompt master to assign a task to an agent via input boxes. */
  private async promptAssignAgent(agentId: string): Promise<void> {
    if (!this.teamClient?.isConnected()) {
      vscode.window.showWarningMessage("Bat Cave: Not connected to team server.");
      return;
    }
    const meta = AGENTS[agentId];
    const name = meta?.name || agentId;

    const task = await vscode.window.showInputBox({
      prompt: `Task for ${meta?.emoji || ""} ${name}`,
      placeHolder: "e.g. Review PR #42 for security issues",
    });
    if (!task) return;

    // Pick a team member to assign to (or self).
    const members = Array.from(this.getConnectedMemberNames());
    const assignTo = await vscode.window.showQuickPick(
      ["(auto — next available)", ...members],
      { placeHolder: `Assign ${name} to...` },
    );
    if (!assignTo) return;

    const priority = await vscode.window.showQuickPick(
      ["normal", "high", "urgent", "low"],
      { placeHolder: "Priority" },
    ) as "normal" | "high" | "urgent" | "low" | undefined;
    if (!priority) return;

    const memberName = assignTo.startsWith("(auto") ? "" : assignTo;
    if (memberName) {
      this.teamClient.assignAgent(agentId, task, memberName, priority);
    } else {
      this.teamClient.queueTask(agentId, task, priority);
    }

    vscode.window.showInformationMessage(
      `${meta?.emoji || ""} ${name}: "${task}" — ${memberName || "queued"}`,
    );
  }

  /** Get names of currently connected team members (from last state broadcast). */
  private getConnectedMemberNames(): string[] {
    // We store member names when we receive state from server.
    // For now, return from the webview's world state via a simple approach.
    // The TeamClient doesn't track members — we ask the webview.
    // Simplification: return config memberName as fallback.
    const config = vscode.workspace.getConfiguration("batcave");
    return [config.get<string>("memberName", "") || "local"];
  }

  private buildAgentPrompt(agentId: string, meta: { name: string; emoji: string; role: string }): string {
    // Load custom agent config if available.
    const customPrompt = this.getCustomAgentPrompt(agentId);
    if (customPrompt) return customPrompt;

    // Default persona prompt.
    return `You are ${meta.name} (${meta.emoji}), a specialized AI agent. Your role: ${meta.role}. Stay focused on your specialty. Be concise and expert.`;
  }

  /** Load and parse a JSON config file from .batcave/ directory. */
  private loadBatcaveConfig(filename: string): Record<string, unknown> | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;
    const configPath = vscode.Uri.joinPath(folders[0].uri, ".batcave", filename);
    try {
      const fs = require("fs");
      return JSON.parse(fs.readFileSync(configPath.fsPath, "utf-8"));
    } catch {
      return null;
    }
  }

  private getCustomAgentPrompt(agentId: string): string | null {
    const config = this.loadBatcaveConfig("agents.json");
    const agentConfig = (config?.agents as Record<string, Record<string, unknown>> | undefined)?.[agentId];
    if (agentConfig?.systemPrompt) return agentConfig.systemPrompt as string;
    return null;
  }

  // ── Workflow Runner ──────────────────────────────────

  private async runWorkflow(workflowId: string): Promise<void> {
    const workflows = this.loadWorkflows();
    const workflow = workflows[workflowId];
    if (!workflow) {
      vscode.window.showWarningMessage(`Bat Cave: Unknown workflow "${workflowId}"`);
      return;
    }

    const confirm = await vscode.window.showInformationMessage(
      `${workflow.emoji} Run "${workflow.name}"? (${workflow.steps.length} steps)`,
      "Run", "Cancel",
    );
    if (confirm !== "Run") return;

    vscode.window.showInformationMessage(`${workflow.emoji} Starting: ${workflow.name}`);

    // Execute steps sequentially — each opens a terminal.
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      const meta = AGENTS[step.agentId];
      const emoji = meta?.emoji || "🤖";
      const name = meta?.name || step.agentId;
      const prompt = this.buildAgentPrompt(step.agentId, meta || { name: step.agentId, emoji: "🤖", role: "agent" });

      const terminal = vscode.window.createTerminal({
        name: `${emoji} ${name} [${i + 1}/${workflow.steps.length}]`,
        iconPath: new vscode.ThemeIcon("hubot"),
      });
      terminal.show();

      const fullPrompt = `${prompt} Your specific task: ${escapeShellArg(step.task)}`;
      terminal.sendText(`claude --system-prompt '${escapeShellArg(fullPrompt)}'`, true);

      // Wait a moment between steps so they don't collide.
      if (i < workflow.steps.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    vscode.window.showInformationMessage(
      `${workflow.emoji} ${workflow.name}: all ${workflow.steps.length} agents launched.`,
    );
  }

  private loadWorkflows(): Record<string, WorkflowDef> {
    const config = this.loadBatcaveConfig("workflows.json");
    return (config?.workflows as Record<string, WorkflowDef>) || {};
  }

  private loadSchedules(): Record<string, ScheduleDef> {
    const config = this.loadBatcaveConfig("workflows.json");
    return (config?.schedules as Record<string, ScheduleDef>) || {};
  }

  private sendWorkflows(): void {
    if (!this.view || !this.webviewReady) return;
    const workflows = this.loadWorkflows();
    const schedules = this.loadSchedules();
    this.view.webview.postMessage({
      command: "workflows",
      payload: { workflows, schedules },
    });
  }

  // ── Team Stats ─────────────────────────────────────

  private pushTeamStats(entry: TeamStatsEntry): void {
    const history = this.globalState.get<TeamStatsEntry[]>(TEAM_STATS_KEY, []);
    // Dedup by sessionId.
    const idx = history.findIndex(e => e.sessionId === entry.sessionId);
    if (idx >= 0) {
      history[idx] = entry;
    } else {
      history.unshift(entry);
    }
    if (history.length > 200) history.length = 200;
    this.globalState.update(TEAM_STATS_KEY, history);
  }

  private sendTeamStats(): void {
    if (!this.view || !this.webviewReady) return;
    const stats = this.globalState.get<TeamStatsEntry[]>(TEAM_STATS_KEY, []);
    this.view.webview.postMessage({
      command: "team-stats",
      payload: { entries: stats },
    });
  }

  // ── Cost budget ─────────────────────────────────────

  sendCostBudget(): void {
    if (!this.view || !this.webviewReady) return;
    const config = vscode.workspace.getConfiguration("batcave");
    this.view.webview.postMessage({
      command: "cost-budget",
      payload: { budgetUsd: config.get<number>("costBudget", 0) },
    });
  }

  // ── Export ──────────────────────────────────────────

  private async exportSessionData(): Promise<void> {
    const history = this.getStoredHistory();
    if (history.length === 0) {
      vscode.window.showInformationMessage("Bat Cave: No session data to export.");
      return;
    }
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`batcave-sessions-${Date.now()}.json`),
      filters: { JSON: ["json"] },
    });
    if (!uri) return;
    const data = JSON.stringify(history, null, 2);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(data, "utf-8"));
    vscode.window.showInformationMessage(`Bat Cave: Exported ${history.length} sessions.`);
  }

  private sendConfig(): void {
    const workspaceName =
      vscode.workspace.workspaceFolders?.[0]?.name || "unknown";
    this.view?.webview.postMessage({
      command: "config",
      payload: {
        activeRepo: workspaceName,
        agents: AGENTS,
      },
    });
    this.sendSoundSettings();
  }

  private getHtml(webview: vscode.Webview): string {
    // In dev, the webview is built by Vite into dist/webview/.
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "index.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "index.css")
    );

    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src ${webview.cspSource} data:;
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>Bat Cave</title>
</head>
<body>
  <div id="batcave-root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new BatCaveViewProvider(context.extensionUri, context.globalState);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("batcave.show", () => {
      vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("batcave.reset", () => {
      provider.reset();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("batcave.toggleSound", () => {
      provider.toggleSound();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("batcave.exportSessions", () => {
      // Trigger export via webview message flow (webview has the current session data).
      provider.triggerExport();
    })
  );

  // Forward config changes to webview.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("batcave")) {
        provider.sendSoundSettings();
        provider.sendCostBudget();
      }
    })
  );
}

export function deactivate(): void {
  // Cleanup handled by disposables.
}
