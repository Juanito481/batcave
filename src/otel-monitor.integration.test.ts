/**
 * OtelMonitor integration tests — exercise poll() against a real temp file.
 * Covers issue #11: rotation, truncation, disappear/reappear, partial lines.
 *
 * Unit tests for pure helpers live in otel-monitor.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { OtelMonitor } from "./otel-monitor";
import { BatCaveEvent } from "./types";

function makeLine(skillName: string): string {
  return (
    JSON.stringify({
      timestamp: new Date().toISOString(),
      attributes: {
        "event.name": "claude_code.skill_activated",
        "skill.name": skillName,
      },
    }) + "\n"
  );
}

function makeToolEndLine(toolName: string, success: boolean): string {
  return (
    JSON.stringify({
      timestamp: new Date().toISOString(),
      attributes: {
        "event.name": "claude_code.tool_result",
        tool_name: toolName,
        success: success ? "true" : "false",
        duration_ms: 42,
      },
    }) + "\n"
  );
}

/**
 * Drive poll() deterministically N times with a sleep gap between writes.
 * We call the private method via cast because the production polling interval
 * would make tests slow and flaky.
 */
function drivePoll(monitor: OtelMonitor, times = 1): void {
  // Access private poll() for deterministic testing. The alternative
  // (real setInterval) makes tests slow and flaky.
  const m = monitor as unknown as { poll: () => void };
  for (let i = 0; i < times; i++) m.poll();
}

describe("OtelMonitor integration — file lifecycle", () => {
  let tmpDir: string;
  let filePath: string;
  let events: BatCaveEvent[];
  let monitor: OtelMonitor;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "batcave-otel-test-"));
    filePath = path.join(tmpDir, "otel-events.jsonl");
    events = [];
    monitor = new OtelMonitor(filePath, (e) => events.push(e));
  });

  afterEach(() => {
    monitor.stop();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  });

  it("no-ops when the file does not exist yet", () => {
    expect(monitor.isAvailable()).toBe(false);
    drivePoll(monitor, 3);
    expect(events).toHaveLength(0);
  });

  it("starts at end of file on first detection, emits nothing for existing content", () => {
    fs.writeFileSync(filePath, makeLine("bishop") + makeLine("knight"));
    // First poll detects the file and anchors at current size.
    drivePoll(monitor);
    expect(events).toHaveLength(0);
    // Pre-existing content is intentionally not emitted — mimics production behavior
    // to avoid replaying historical OTel events on monitor restart.
  });

  it("emits events appended after the file was detected", () => {
    fs.writeFileSync(filePath, makeLine("bishop"));
    drivePoll(monitor); // anchor at end
    fs.appendFileSync(filePath, makeLine("knight"));
    drivePoll(monitor);
    expect(events).toHaveLength(1);
    expect((events[0] as { agentId: string }).agentId).toBe("knight");
  });

  it("resets offset when the file is truncated to a smaller size", () => {
    fs.writeFileSync(filePath, makeLine("bishop") + makeLine("knight"));
    drivePoll(monitor); // anchor
    // Truncate and write a new line — size shrinks below the anchor.
    fs.writeFileSync(filePath, makeLine("queen"));
    drivePoll(monitor);
    expect(events).toHaveLength(1);
    expect((events[0] as { agentId: string }).agentId).toBe("queen");
  });

  it("recovers when the file disappears and reappears", () => {
    fs.writeFileSync(filePath, makeLine("bishop"));
    drivePoll(monitor); // anchor
    fs.unlinkSync(filePath);
    drivePoll(monitor); // should not throw
    fs.writeFileSync(filePath, makeLine("knight") + makeLine("rook"));
    drivePoll(monitor); // re-detects, anchors at end again
    fs.appendFileSync(filePath, makeLine("scout"));
    drivePoll(monitor);
    expect(events.map((e) => (e as { agentId: string }).agentId)).toEqual([
      "scout",
    ]);
  });

  it("buffers partial lines across poll cycles", () => {
    fs.writeFileSync(filePath, "");
    drivePoll(monitor); // anchor
    // Write a line without trailing newline — simulates mid-write from collector.
    const halfLine = JSON.stringify({
      timestamp: new Date().toISOString(),
      attributes: {
        "event.name": "claude_code.skill_activated",
        "skill.name": "pawn",
      },
    });
    fs.appendFileSync(filePath, halfLine);
    drivePoll(monitor);
    expect(events).toHaveLength(0); // no terminator yet
    fs.appendFileSync(filePath, "\n");
    drivePoll(monitor);
    expect(events).toHaveLength(1);
    expect((events[0] as { agentId: string }).agentId).toBe("pawn");
  });

  it("parses tool_result events with success and duration", () => {
    fs.writeFileSync(filePath, "");
    drivePoll(monitor);
    fs.appendFileSync(filePath, makeToolEndLine("Edit", true));
    fs.appendFileSync(filePath, makeToolEndLine("Write", false));
    drivePoll(monitor);
    expect(events).toHaveLength(2);
    const [e1, e2] = events as Array<{
      type: string;
      toolName: string;
      success: boolean;
      durationMs: number;
    }>;
    expect(e1.type).toBe("tool_end");
    expect(e1.toolName).toBe("Edit");
    expect(e1.success).toBe(true);
    expect(e1.durationMs).toBe(42);
    expect(e2.success).toBe(false);
  });

  it("ignores malformed lines but keeps processing the rest", () => {
    fs.writeFileSync(filePath, "");
    drivePoll(monitor);
    fs.appendFileSync(
      filePath,
      "not a json line\n" +
        makeLine("bishop") +
        "{broken\n" +
        makeLine("knight"),
    );
    drivePoll(monitor);
    expect(events).toHaveLength(2);
    expect(events.map((e) => (e as { agentId: string }).agentId)).toEqual([
      "bishop",
      "knight",
    ]);
  });

  it("isAvailable reflects current filesystem state", () => {
    expect(monitor.isAvailable()).toBe(false);
    fs.writeFileSync(filePath, "");
    expect(monitor.isAvailable()).toBe(true);
    fs.unlinkSync(filePath);
    expect(monitor.isAvailable()).toBe(false);
  });

  it("handles rapid sequential appends in a single chunk", () => {
    fs.writeFileSync(filePath, "");
    drivePoll(monitor);
    const batch =
      makeLine("bishop") +
      makeLine("knight") +
      makeLine("queen") +
      makeLine("rook") +
      makeToolEndLine("Edit", true);
    fs.appendFileSync(filePath, batch);
    drivePoll(monitor);
    expect(events).toHaveLength(5);
  });
});
