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

const VIEW_ID = "batcave.mainView";
const SESSION_HISTORY_KEY = "batcave.sessionHistory";
const MAX_STORED_SESSIONS = 50;

class BatCaveViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private webviewReady = false;
  private monitor: ActivityMonitor;
  private eventQueue: BatCaveEvent[] = [];
  private globalState: vscode.Memento;

  constructor(private readonly extensionUri: vscode.Uri, globalState: vscode.Memento) {
    this.globalState = globalState;
    this.monitor = new ActivityMonitor((event) => this.handleEvent(event));
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

    // Listen for messages from webview.
    webviewView.webview.onDidReceiveMessage((msg: Record<string, unknown>) => {
      if (msg.command === "ready") {
        this.webviewReady = true;
        // Send config + any queued events.
        this.sendConfig();
        this.sendSessionHistory();
        this.sendCostBudget();
        for (const event of this.eventQueue) {
          this.postEvent(event);
        }
        this.eventQueue = [];
      } else if (msg.command === "toggleSound") {
        this.toggleSound();
      } else if (msg.command === "saveSession") {
        this.saveSession(msg.payload as SessionSummary);
      } else if (msg.command === "exportSession") {
        this.exportSessionData();
      }
    });

    // Start monitoring Claude Code activity.
    this.monitor.start();

    webviewView.onDidDispose(() => {
      this.monitor.stop();
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
