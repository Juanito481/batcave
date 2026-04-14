/**
 * Event Merger — dedup BatCaveEvents coming from multiple sources.
 *
 * When both JSONL and OTel monitors are running, they can emit the same
 * logical event twice (e.g. agent_enter for "bishop" via Skill tool_use
 * and agent_enter via OTel skill_activated). The merger keeps a short-term
 * cache and drops duplicates within a debounce window.
 *
 * OTel has structural priority: if both sources emit the same logical event
 * within the window, the OTel version wins (more structured metadata).
 *
 * Events without natural duplication (api_error, tool_rejected, prompt_start,
 * plugin_installed) pass through untouched.
 */

import { BatCaveEvent } from "./types";

const AGENT_DEDUP_WINDOW_MS = 1000;
const TOOL_DEDUP_WINDOW_MS = 500;
const CACHE_MAX_ENTRIES = 500;

interface CacheEntry {
  key: string;
  timestamp: number;
  source: "jsonl" | "otel" | "unknown";
}

export class EventMerger {
  private cache: CacheEntry[] = [];
  private onEvent: (event: BatCaveEvent) => void;

  constructor(onEvent: (event: BatCaveEvent) => void) {
    this.onEvent = onEvent;
  }

  /** Push an event through the merger. Duplicates within the dedup window are dropped. */
  push(event: BatCaveEvent): void {
    const key = this.keyFor(event);
    if (!key) {
      this.onEvent(event);
      return;
    }

    const window = this.windowFor(event);
    const source = (event as { source?: "jsonl" | "otel" }).source ?? "unknown";
    const now = event.timestamp;

    // Evict stale cache entries.
    this.cache = this.cache.filter(
      (e) =>
        now - e.timestamp <
        Math.max(AGENT_DEDUP_WINDOW_MS, TOOL_DEDUP_WINDOW_MS),
    );
    if (this.cache.length > CACHE_MAX_ENTRIES) {
      this.cache = this.cache.slice(-CACHE_MAX_ENTRIES);
    }

    const existing = this.cache.find(
      (e) => e.key === key && Math.abs(e.timestamp - now) <= window,
    );

    if (existing) {
      // OTel beats JSONL/unknown. Already-OTel stays OTel.
      if (existing.source === "otel") {
        // Dup from other source — drop.
        return;
      }
      if (source === "otel") {
        // Replace: emit the OTel version, mark cache.
        existing.source = "otel";
        existing.timestamp = now;
        this.onEvent(event);
        return;
      }
      // Both non-OTel — drop the second one.
      return;
    }

    this.cache.push({ key, timestamp: now, source });
    this.onEvent(event);
  }

  private keyFor(event: BatCaveEvent): string | null {
    switch (event.type) {
      case "agent_enter":
      case "agent_exit":
        return `${event.type}:${event.agentId}`;
      case "tool_start":
      case "tool_end":
        return `${event.type}:${event.toolName}`;
      default:
        return null;
    }
  }

  private windowFor(event: BatCaveEvent): number {
    switch (event.type) {
      case "agent_enter":
      case "agent_exit":
        return AGENT_DEDUP_WINDOW_MS;
      case "tool_start":
      case "tool_end":
        return TOOL_DEDUP_WINDOW_MS;
      default:
        return 0;
    }
  }
}
