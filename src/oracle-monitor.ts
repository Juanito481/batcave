/**
 * Oracle Monitor — watches graphify-out/ for knowledge graph rebuilds.
 *
 * Parses GRAPH_REPORT.md header (much smaller than graph.json) to pull
 * node/edge/community counts, then diffs against the previous read to
 * emit oracle_rebuild events. Also tails ~/.batcave/oracle-events.jsonl
 * (if present) for oracle_query events emitted by the Oracle CLI.
 *
 * Budget: polls every 5000ms (rebuilds are rare; graph.json is 25MB).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  BatCaveEvent,
  OracleEvent,
  OracleGodNode,
  OracleCommunity,
} from "./types";

const POLL_INTERVAL_MS = 5000;

interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  communities: number;
  reportDate: string;
}

export class OracleMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private reportPath: string | null;
  private queryLogPath: string;
  private queryLogSize = 0;
  private queryLineBuffer = "";
  private lastStats: GraphStats | null = null;
  private onEvent: (e: BatCaveEvent) => void;
  private onLog: (msg: string) => void;

  constructor(
    workspaceRoot: string | undefined,
    onEvent: (e: BatCaveEvent) => void,
    onLog: (msg: string) => void = () => {},
  ) {
    this.onEvent = onEvent;
    this.onLog = onLog;
    this.reportPath = workspaceRoot
      ? path.join(workspaceRoot, "graphify-out", "GRAPH_REPORT.md")
      : null;
    this.queryLogPath = path.join(
      os.homedir(),
      ".batcave",
      "oracle-events.jsonl",
    );
  }

  isAvailable(): boolean {
    return !!this.reportPath && fs.existsSync(this.reportPath);
  }

  start(): void {
    if (!this.reportPath) {
      this.onLog("Oracle monitor: no workspace root, skipping.");
      return;
    }
    if (!fs.existsSync(this.reportPath)) {
      this.onLog(
        `Oracle monitor: ${this.reportPath} not found — will activate on first graphify build.`,
      );
    }
    // Initialize query log offset (tail new events only).
    if (fs.existsSync(this.queryLogPath)) {
      try {
        this.queryLogSize = fs.statSync(this.queryLogPath).size;
      } catch {
        this.queryLogSize = 0;
      }
    }
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    this.poll();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStats(): GraphStats | null {
    return this.lastStats;
  }

  private poll(): void {
    this.pollReport();
    this.pollQueryLog();
  }

  private pollReport(): void {
    if (!this.reportPath || !fs.existsSync(this.reportPath)) return;

    try {
      // Read only the first 4KB — the header contains everything we need.
      const fd = fs.openSync(this.reportPath, "r");
      const buf = Buffer.alloc(4096);
      const bytes = fs.readSync(fd, buf, 0, 4096, 0);
      fs.closeSync(fd);
      const head = buf.subarray(0, bytes).toString("utf8");
      const stats = this.parseReport(head);
      if (!stats) return;

      const prev = this.lastStats;
      if (
        !prev ||
        prev.totalNodes !== stats.totalNodes ||
        prev.totalEdges !== stats.totalEdges ||
        prev.communities !== stats.communities ||
        prev.reportDate !== stats.reportDate
      ) {
        this.lastStats = stats;
        // Full parse only on detected change — avoids re-reading 600KB every 5s.
        const { godNodes, communityList } = this.parseFullReport();
        const event: OracleEvent = {
          type: "oracle_rebuild",
          timestamp: Date.now(),
          totalNodes: stats.totalNodes,
          totalEdges: stats.totalEdges,
          communities: stats.communities,
          reportDate: stats.reportDate,
          deltaNodes: prev ? stats.totalNodes - prev.totalNodes : undefined,
          deltaEdges: prev ? stats.totalEdges - prev.totalEdges : undefined,
          godNodes,
          communityList,
          source: "oracle",
        };
        this.onEvent(event);
      }
    } catch (e) {
      this.onLog(`Oracle monitor report error: ${(e as Error).message}`);
    }
  }

  private pollQueryLog(): void {
    if (!fs.existsSync(this.queryLogPath)) return;
    try {
      const stat = fs.statSync(this.queryLogPath);
      // Rotation or truncation: reset.
      if (stat.size < this.queryLogSize) {
        this.queryLogSize = 0;
        this.queryLineBuffer = "";
      }
      if (stat.size === this.queryLogSize) return;

      const fd = fs.openSync(this.queryLogPath, "r");
      const bytesToRead = stat.size - this.queryLogSize;
      const buf = Buffer.alloc(bytesToRead);
      fs.readSync(fd, buf, 0, bytesToRead, this.queryLogSize);
      fs.closeSync(fd);

      const text = this.queryLineBuffer + buf.toString("utf8");
      const lines = text.split("\n");
      this.queryLineBuffer = lines.pop() ?? "";
      this.queryLogSize = stat.size;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          const kind = String(parsed.type ?? parsed.event ?? "");
          if (kind === "oracle_query" || kind === "query") {
            const event: OracleEvent = {
              type: "oracle_query",
              timestamp: Number(parsed.timestamp ?? Date.now()),
              queryText: String(parsed.query ?? parsed.text ?? ""),
              resultCount: Number(parsed.resultCount ?? parsed.results ?? 0),
              source: "oracle",
            };
            this.onEvent(event);
          }
        } catch {
          // Ignore malformed lines.
        }
      }
    } catch (e) {
      this.onLog(`Oracle monitor query log error: ${(e as Error).message}`);
    }
  }

  private parseReport(head: string): GraphStats | null {
    const dateMatch = head.match(/# Graph Report[^\n]*\((\d{4}-\d{2}-\d{2})\)/);
    const nodesMatch = head.match(
      /(\d+)\s+nodes\s*·\s*(\d+)\s+edges\s*·\s*(\d+)\s+communities/,
    );
    if (!nodesMatch) return null;
    return {
      totalNodes: Number(nodesMatch[1]),
      totalEdges: Number(nodesMatch[2]),
      communities: Number(nodesMatch[3]),
      reportDate: dateMatch?.[1] ?? "",
    };
  }

  /** Full-file parse — called only on detected rebuild. */
  private parseFullReport(): {
    godNodes: OracleGodNode[];
    communityList: OracleCommunity[];
  } {
    if (!this.reportPath || !fs.existsSync(this.reportPath)) {
      return { godNodes: [], communityList: [] };
    }
    try {
      const content = fs.readFileSync(this.reportPath, "utf8");
      return {
        godNodes: parseGodNodes(content),
        communityList: parseCommunities(content),
      };
    } catch (e) {
      this.onLog(`Oracle full parse error: ${(e as Error).message}`);
      return { godNodes: [], communityList: [] };
    }
  }
}

function parseGodNodes(report: string): OracleGodNode[] {
  const section = report.match(
    /## God Nodes[^\n]*\n([\s\S]*?)(?=\n## |\n### |$)/,
  );
  if (!section) return [];
  const lines = section[1].split("\n").filter((l) => /^\s*\d+\.\s/.test(l));
  const out: OracleGodNode[] = [];
  for (const line of lines) {
    const m = line.match(/\d+\.\s+`([^`]+)`\s*-\s*(\d+)\s+edges/);
    if (m) out.push({ name: m[1], edges: Number(m[2]) });
  }
  return out.slice(0, 10);
}

function parseCommunities(report: string): OracleCommunity[] {
  const hubSection = report.match(
    /## Community Hubs[^\n]*\n([\s\S]*?)(?=\n## |$)/,
  );
  if (!hubSection) return [];
  const out: OracleCommunity[] = [];
  const re = /\[\[_COMMUNITY_([^|\]]+)\|([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(hubSection[1])) !== null) {
    out.push({ id: m[1].trim(), name: m[2].trim() });
    if (out.length >= 30) break;
  }
  return out;
}
