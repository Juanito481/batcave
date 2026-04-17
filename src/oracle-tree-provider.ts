/**
 * Oracle Tree Provider — VSCode Explorer sidebar view for the knowledge graph.
 *
 * Renders a live summary of graphify-out: total stats + top communities.
 * Click a community item to open its wiki page (graphify-out/wiki/).
 * Refresh triggered by OracleMonitor on oracle_rebuild events.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export interface OracleStats {
  totalNodes: number;
  totalEdges: number;
  communities: number;
  reportDate: string;
}

export interface OracleTreeDataSource {
  getStats(): OracleStats | null;
  getWorkspaceRoot(): string | null;
  getLastQuery(): { query: string; resultCount: number; timestamp: number } | null;
}

export class OracleTreeProvider implements vscode.TreeDataProvider<OracleNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<OracleNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private source: OracleTreeDataSource) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: OracleNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: OracleNode): OracleNode[] {
    if (element) return element.getChildren();

    const stats = this.source.getStats();
    const root = this.source.getWorkspaceRoot();
    const lastQuery = this.source.getLastQuery();
    const children: OracleNode[] = [];

    if (stats) {
      children.push(
        new StatNode(
          `${stats.totalNodes.toLocaleString()} nodes`,
          "symbol-structure",
          `Total nodes in the graph (last rebuild: ${stats.reportDate || "unknown"})`,
        ),
        new StatNode(
          `${stats.totalEdges.toLocaleString()} edges`,
          "git-compare",
          `Total edges (extracted + inferred)`,
        ),
        new StatNode(
          `${stats.communities} communities`,
          "layers",
          `Community clusters detected by Louvain`,
        ),
      );
    } else {
      children.push(
        new StatNode(
          "Graph not built yet",
          "warning",
          "Run `/oracle build` or wait for post-commit hook",
        ),
      );
    }

    if (lastQuery) {
      const age = Math.round((Date.now() - lastQuery.timestamp) / 1000);
      children.push(
        new StatNode(
          `Last query: ${lastQuery.query || "—"} (${lastQuery.resultCount} results, ${age}s ago)`,
          "search",
          `Last oracle_query event seen`,
        ),
      );
    }

    if (root) {
      const wikiDir = path.join(root, "graphify-out", "wiki");
      if (fs.existsSync(wikiDir)) {
        children.push(new WikiIndexNode(wikiDir));
      }
    }

    return children;
  }
}

abstract class OracleNode extends vscode.TreeItem {
  abstract getChildren(): OracleNode[];
}

class StatNode extends OracleNode {
  constructor(label: string, icon: string, tooltip: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.tooltip = tooltip;
    this.contextValue = "oracle.stat";
  }
  getChildren(): OracleNode[] {
    return [];
  }
}

class WikiIndexNode extends OracleNode {
  constructor(private wikiDir: string) {
    super("Communities", vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("book");
    this.tooltip = `${wikiDir}`;
    this.contextValue = "oracle.communities";
  }

  getChildren(): OracleNode[] {
    try {
      const files = fs
        .readdirSync(this.wikiDir)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .slice(0, 50);
      return files.map((f) => new WikiPageNode(path.join(this.wikiDir, f), f));
    } catch {
      return [];
    }
  }
}

class WikiPageNode extends OracleNode {
  constructor(fullPath: string, fileName: string) {
    const label = fileName.replace(/\.md$/, "").replace(/^_COMMUNITY_/, "");
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("markdown");
    this.tooltip = fullPath;
    this.resourceUri = vscode.Uri.file(fullPath);
    this.command = {
      command: "vscode.open",
      title: "Open wiki page",
      arguments: [this.resourceUri],
    };
    this.contextValue = "oracle.wiki-page";
  }

  getChildren(): OracleNode[] {
    return [];
  }
}
