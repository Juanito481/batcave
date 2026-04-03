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
import { BatCaveEvent, AGENTS, ExtToWebviewMessage, WebviewToExtMessage } from "./types";

const VIEW_ID = "batcave.mainView";

class BatCaveViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private webviewReady = false;
  private monitor: ActivityMonitor;
  private eventQueue: BatCaveEvent[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {
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
    webviewView.webview.onDidReceiveMessage((msg: WebviewToExtMessage) => {
      if (msg.command === "ready") {
        this.webviewReady = true;
        // Send config + any queued events.
        this.sendConfig();
        for (const event of this.eventQueue) {
          this.postEvent(event);
        }
        this.eventQueue = [];
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
  const provider = new BatCaveViewProvider(context.extensionUri);

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
}

export function deactivate(): void {
  // Cleanup handled by disposables.
}
