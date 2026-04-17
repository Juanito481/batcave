/**
 * Chains Tree Provider — VSCode Explorer sidebar view.
 *
 * Renders active Scacchiera chains as tree items. Click an item to open its
 * status.md in the editor. Refreshed externally via refresh() whenever the
 * ChainMonitor emits chain_* events.
 */

import * as vscode from "vscode";

/** Shape of a chain state entry consumed by the tree. */
export interface ChainViewState {
  chainId: string;
  chainType: string;
  target: string;
  step: { current: number; total: number };
  currentAgent: string;
  nextAgent: string;
  flag: "clean" | "warn" | "block";
}

/** Source of truth for the tree — injected by extension.ts. */
export interface ChainsTreeDataSource {
  getActiveChains(): ChainViewState[];
  getChainsDir(): string | null;
}

export class ChainsTreeProvider
  implements vscode.TreeDataProvider<ChainItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<ChainItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private source: ChainsTreeDataSource) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ChainItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ChainItem): ChainItem[] {
    if (element) return [];
    const chainsDir = this.source.getChainsDir();
    const chains = this.source.getActiveChains();
    if (chains.length === 0 || !chainsDir) return [];
    return chains.map((c) => new ChainItem(c, chainsDir));
  }
}

export class ChainItem extends vscode.TreeItem {
  constructor(chain: ChainViewState, chainsDir: string) {
    super(chain.chainId, vscode.TreeItemCollapsibleState.None);

    const progress =
      chain.step.total > 0
        ? `${chain.step.current}/${chain.step.total}`
        : "—";
    const agent = chain.currentAgent || "—";

    this.description = `${progress} · ${agent}`;
    this.tooltip = [
      `Type: ${chain.chainType}`,
      `Target: ${chain.target}`,
      `Step: ${progress}`,
      `Current: ${chain.currentAgent || "—"}`,
      `Next: ${chain.nextAgent || "—"}`,
      `Flag: ${chain.flag}`,
    ].join("\n");

    this.iconPath = new vscode.ThemeIcon(iconForFlag(chain.flag));
    this.contextValue = "scacchiera.chain";
    this.resourceUri = vscode.Uri.file(
      `${chainsDir}/${chain.chainId}/status.md`,
    );
    this.command = {
      command: "vscode.open",
      title: "Open chain status",
      arguments: [this.resourceUri],
    };
  }
}

function iconForFlag(flag: "clean" | "warn" | "block"): string {
  if (flag === "warn") return "warning";
  if (flag === "block") return "error";
  return "pass";
}
