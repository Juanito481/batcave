/**
 * OTel Monitor — tails the OTel Collector file/json exporter output.
 *
 * Claude Code emits OpenTelemetry logs/events when env vars
 * CLAUDE_CODE_ENABLE_TELEMETRY=1 and CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1
 * are set. The local OTel Collector (anthropics/claude-code-monitoring-guide)
 * can be configured with a file/json exporter that writes each log record
 * as a newline-delimited JSON line to a file on disk.
 *
 * This module tails that file and normalizes records into BatCaveEvent
 * instances that the rest of the extension already understands.
 *
 * Architecture choice: see docs/decisions/0002-otel-consumer.md (Option B).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AGENTS, BatCaveEvent } from "./types";

const POLL_INTERVAL_MS = 500;
const MAX_READ_BYTES = 512 * 1024; // 512KB per poll — OTel can be chattier than JSONL
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB — trigger truncation warning

/** Resolve ~ and env vars in a config path. */
export function resolveOtelPath(raw: string): string {
  if (!raw) return raw;
  let out = raw;
  if (out.startsWith("~/") || out === "~") {
    out = path.join(os.homedir(), out.slice(1));
  }
  return path.resolve(out);
}

/** OTel Collector file/json exporter line shape (simplified). */
interface OtelLogLine {
  timestamp?: string;
  timeUnixNano?: string;
  body?: unknown;
  attributes?: Record<string, unknown> | Array<{ key: string; value: unknown }>;
  resource?: {
    attributes?:
      | Record<string, unknown>
      | Array<{ key: string; value: unknown }>;
  };
}

/** Normalized attribute bag. */
type AttrMap = Record<string, string | number | boolean>;

function normalizeAttrs(
  raw:
    | Record<string, unknown>
    | Array<{ key: string; value: unknown }>
    | undefined,
): AttrMap {
  if (!raw) return {};
  const out: AttrMap = {};
  if (Array.isArray(raw)) {
    // OTLP native format: [{ key, value: { stringValue | intValue | ... } }]
    for (const kv of raw) {
      const v = kv.value as Record<string, unknown> | string | number | boolean;
      if (
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean"
      ) {
        out[kv.key] = v;
      } else if (v && typeof v === "object") {
        const val = v.stringValue ?? v.intValue ?? v.doubleValue ?? v.boolValue;
        if (
          typeof val === "string" ||
          typeof val === "number" ||
          typeof val === "boolean"
        ) {
          out[kv.key] = val;
        }
      }
    }
  } else {
    for (const [k, v] of Object.entries(raw)) {
      if (
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean"
      ) {
        out[k] = v;
      }
    }
  }
  return out;
}

function parseTimestamp(line: OtelLogLine): number {
  if (line.timeUnixNano) {
    const ns = Number(line.timeUnixNano);
    if (Number.isFinite(ns)) return Math.round(ns / 1_000_000);
  }
  if (line.timestamp) {
    const t = Date.parse(line.timestamp);
    if (Number.isFinite(t)) return t;
  }
  return Date.now();
}

/** Map OTel event attributes → BatCaveEvent. Returns null if event should be ignored. */
export function mapOtelEvent(
  attrs: AttrMap,
  timestamp: number,
): BatCaveEvent | null {
  const name = String(attrs["event.name"] ?? "");
  if (!name) return null;

  switch (name) {
    case "claude_code.skill_activated": {
      const skillName = String(attrs["skill.name"] ?? "").toLowerCase();
      if (!skillName) return null;
      return {
        type: "agent_enter",
        agentId: skillName,
        agentName: AGENTS[skillName]?.name ?? skillName,
        timestamp,
        source: "otel",
      };
    }
    case "claude_code.tool_result": {
      const toolName = String(attrs["tool_name"] ?? "");
      if (!toolName) return null;
      const success = attrs["success"] === "true" || attrs["success"] === true;
      const durationMs = Number(attrs["duration_ms"] ?? 0);
      return {
        type: "tool_end",
        toolName,
        timestamp,
        success,
        durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
        source: "otel",
      };
    }
    case "claude_code.api_error": {
      return {
        type: "api_error",
        timestamp,
        statusCode: String(attrs["status_code"] ?? "undefined"),
        attempt: Number(attrs["attempt"] ?? 1),
        model: attrs["model"] ? String(attrs["model"]) : undefined,
      };
    }
    case "claude_code.tool_decision": {
      const decision = String(attrs["decision"] ?? "");
      if (decision !== "reject") return null;
      return {
        type: "tool_rejected",
        timestamp,
        toolName: String(attrs["tool_name"] ?? ""),
      };
    }
    case "claude_code.user_prompt": {
      return {
        type: "prompt_start",
        timestamp,
        promptLength: Number(attrs["prompt_length"] ?? 0),
      };
    }
    case "claude_code.plugin_installed": {
      return {
        type: "plugin_installed",
        timestamp,
        pluginName: String(attrs["plugin.name"] ?? ""),
        pluginVersion: attrs["plugin.version"]
          ? String(attrs["plugin.version"])
          : undefined,
        marketplaceName: attrs["marketplace.name"]
          ? String(attrs["marketplace.name"])
          : undefined,
      };
    }
    default:
      return null;
  }
}

/** Parse one JSON line from the collector. Lenient — returns null on any malformed input. */
export function parseOtelLine(line: string): BatCaveEvent | null {
  if (!line.trim()) return null;
  let parsed: OtelLogLine;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  const attrs = normalizeAttrs(parsed.attributes);
  const ts = parseTimestamp(parsed);
  return mapOtelEvent(attrs, ts);
}

export class OtelMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private filePath: string;
  private lastFileSize = 0;
  private lineBuffer = "";
  private onEvent: (event: BatCaveEvent) => void;
  private onLog?: (msg: string) => void;
  private fileExistedLastPoll = false;

  constructor(
    filePath: string,
    onEvent: (event: BatCaveEvent) => void,
    onLog?: (msg: string) => void,
  ) {
    this.filePath = resolveOtelPath(filePath);
    this.onEvent = onEvent;
    this.onLog = onLog;
  }

  /** Returns true if the OTel events file exists and is readable. */
  isAvailable(): boolean {
    try {
      fs.accessSync(this.filePath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  start(): void {
    if (this.timer) return;
    this.log(`OTel monitor watching ${this.filePath}`);
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.lineBuffer = "";
    this.lastFileSize = 0;
    this.fileExistedLastPoll = false;
  }

  private log(msg: string): void {
    if (this.onLog) this.onLog(`[otel-monitor] ${msg}`);
  }

  private poll(): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(this.filePath);
    } catch {
      if (this.fileExistedLastPoll) {
        this.log("events file disappeared — waiting for it to reappear");
        this.fileExistedLastPoll = false;
        this.lastFileSize = 0;
        this.lineBuffer = "";
      }
      return;
    }

    if (!this.fileExistedLastPoll) {
      this.log("events file detected — starting at end of file");
      this.fileExistedLastPoll = true;
      this.lastFileSize = stat.size;
      return;
    }

    // File rotated or truncated.
    if (stat.size < this.lastFileSize) {
      this.log("file truncated — resetting offset");
      this.lastFileSize = 0;
      this.lineBuffer = "";
    }

    if (stat.size > MAX_FILE_SIZE_BYTES && stat.size === this.lastFileSize) {
      // Large and no new data — one-time warning per poll cycle (no spam).
      // Don't truncate: that's the collector's rotation job.
      return;
    }

    if (stat.size === this.lastFileSize) return;

    const readFrom = this.lastFileSize;
    const readTo = Math.min(stat.size, readFrom + MAX_READ_BYTES);

    let chunk: string;
    try {
      const fd = fs.openSync(this.filePath, "r");
      const buf = Buffer.alloc(readTo - readFrom);
      fs.readSync(fd, buf, 0, buf.length, readFrom);
      fs.closeSync(fd);
      chunk = buf.toString("utf8");
    } catch (err) {
      this.log(
        `read error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    this.lastFileSize = readTo;
    this.lineBuffer += chunk;

    const lines = this.lineBuffer.split("\n");
    this.lineBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parseOtelLine(line);
      if (event) this.onEvent(event);
    }
  }
}
