/**
 * Chain Monitor — watches .claude/chains/active/ for Scacchiera chain state.
 *
 * Each folder under active/ represents a running Marshal chain with a
 * status.md file describing the current step. This module polls the
 * directory every 1s and emits ChainEvent instances (created/updated/archived)
 * that the rest of the extension already understands via the BatCaveEvent union.
 *
 * See ADR workspace:0002-chains-replace-handoffs for the chain protocol.
 */

import * as fs from "fs";
import * as path from "path";
import { BatCaveEvent, ChainEvent } from "./types";

const POLL_INTERVAL_MS = 1000;

interface ChainState {
  chainId: string;
  chainType: string;
  target: string;
  step: { current: number; total: number };
  currentAgent: string;
  nextAgent: string;
  flag: "clean" | "warn" | "block";
}

export class ChainMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private known: Map<string, ChainState> = new Map();
  private chainsDir: string | null;
  private onEvent: (e: BatCaveEvent) => void;
  private onLog: (msg: string) => void;

  constructor(
    workspaceRoot: string | undefined,
    onEvent: (e: BatCaveEvent) => void,
    onLog: (msg: string) => void = () => {},
  ) {
    this.onEvent = onEvent;
    this.onLog = onLog;
    this.chainsDir = workspaceRoot
      ? path.join(workspaceRoot, ".claude", "chains", "active")
      : null;
  }

  isAvailable(): boolean {
    return !!this.chainsDir && fs.existsSync(this.chainsDir);
  }

  start(): void {
    if (!this.chainsDir) {
      this.onLog("Chain monitor: no workspace root, skipping.");
      return;
    }
    if (!fs.existsSync(this.chainsDir)) {
      this.onLog(
        `Chain monitor: ${this.chainsDir} does not exist yet — will auto-activate when a Marshal chain starts.`,
      );
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

  getActiveCount(): number {
    return this.known.size;
  }

  getActiveChains(): ChainState[] {
    return Array.from(this.known.values());
  }

  getChainsDir(): string | null {
    return this.chainsDir;
  }

  private poll(): void {
    if (!this.chainsDir || !fs.existsSync(this.chainsDir)) {
      // Chain dir may not exist yet; clear stale state if any.
      if (this.known.size > 0) {
        for (const [chainId, state] of Array.from(this.known.entries())) {
          this.known.delete(chainId);
          this.emit("chain_archived", state, Date.now());
        }
      }
      return;
    }

    try {
      const entries = fs.readdirSync(this.chainsDir, { withFileTypes: true });
      const now = Date.now();
      const currentOnDisk = new Set<string>();

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
        const chainId = entry.name;
        currentOnDisk.add(chainId);

        const statusPath = path.join(this.chainsDir, chainId, "status.md");
        if (!fs.existsSync(statusPath)) continue;

        const content = fs.readFileSync(statusPath, "utf8");
        const parsed = this.parseStatus(chainId, content);
        if (!parsed) continue;

        const prev = this.known.get(chainId);
        if (!prev) {
          this.known.set(chainId, parsed);
          this.emit("chain_created", parsed, now);
        } else if (!this.equals(prev, parsed)) {
          this.known.set(chainId, parsed);
          this.emit("chain_updated", parsed, now);
        }
      }

      // Detect archived chains (removed from active/).
      for (const chainId of Array.from(this.known.keys())) {
        if (!currentOnDisk.has(chainId)) {
          const archived = this.known.get(chainId)!;
          this.known.delete(chainId);
          this.emit("chain_archived", archived, now);
        }
      }
    } catch (e) {
      this.onLog(`Chain monitor poll error: ${(e as Error).message}`);
    }
  }

  private emit(
    type: ChainEvent["type"],
    state: ChainState,
    timestamp: number,
  ): void {
    const event: ChainEvent = {
      type,
      chainId: state.chainId,
      chainType: state.chainType,
      target: state.target,
      step: { current: state.step.current, total: state.step.total },
      currentAgent: state.currentAgent,
      nextAgent: state.nextAgent,
      flag: state.flag,
      timestamp,
      source: "chains",
    };
    this.onEvent(event);
  }

  private equals(a: ChainState, b: ChainState): boolean {
    return (
      a.chainType === b.chainType &&
      a.target === b.target &&
      a.step.current === b.step.current &&
      a.step.total === b.step.total &&
      a.currentAgent === b.currentAgent &&
      a.nextAgent === b.nextAgent &&
      a.flag === b.flag
    );
  }

  private parseStatus(chainId: string, content: string): ChainState | null {
    const typeMatch = content.match(/\*\*Type:\*\*\s*([^\n|]+?)(?:\s*\||\s*$)/m);
    const targetMatch = content.match(/\*\*Target:\*\*\s*(\S+)/);
    const stepMatch = content.match(/\*\*Step:\*\*\s*(\d+)\s*\/\s*(\d+)/);
    const currentAgent = this.extractAgent(
      content,
      /\*\*Current:\*\*\s*([^\n]+)/,
    );
    const nextAgent = this.extractAgent(content, /\*\*Next:\*\*\s*([^\n]+)/);
    const flagMatch = content.match(/\*\*Flag:\*\*\s*(clean|warn|block)/i);

    return {
      chainId,
      chainType: (typeMatch?.[1] ?? "unknown").trim().split(/\s+/)[0],
      target: targetMatch?.[1] ?? "unknown",
      step: {
        current: Number(stepMatch?.[1] ?? 0),
        total: Number(stepMatch?.[2] ?? 0),
      },
      currentAgent,
      nextAgent,
      flag:
        ((flagMatch?.[1]?.toLowerCase() as "clean" | "warn" | "block") ??
          "clean"),
    };
  }

  private extractAgent(content: string, regex: RegExp): string {
    const m = content.match(regex);
    if (!m) return "";
    const raw = m[1].split(/[—–-]/)[0].trim();
    if (raw.startsWith("<") && raw.endsWith(">")) return "";
    return raw.toLowerCase();
  }
}
