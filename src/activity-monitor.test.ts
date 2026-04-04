import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { ActivityMonitor } from "./activity-monitor";
import { BatCaveEvent, AGENTS } from "./types";

vi.mock("fs");
vi.mock("os", () => ({ homedir: () => "/mock/home" }));

function makeToolUseBlock(name: string, id: string, input?: Record<string, unknown>) {
  return { type: "tool_use", name, id, input: input || {} };
}

function makeToolResultBlock(toolUseId: string) {
  return { type: "tool_result", tool_use_id: toolUseId };
}

describe("ActivityMonitor", () => {
  let events: BatCaveEvent[];
  let monitor: ActivityMonitor;
  let currentSize: number;

  beforeEach(() => {
    events = [];
    currentSize = 0;
    monitor = new ActivityMonitor((event) => events.push(event));

    // Default: transcript directory exists with one project.
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockImplementation(((p: string) => {
      if (String(p).includes(".claude/projects") && !String(p).includes("test-project")) {
        return [{ name: "test-project", isDirectory: () => true }] as any;
      }
      return ["session.jsonl"] as any;
    }) as any);
    vi.mocked(fs.closeSync).mockImplementation(() => {});
  });

  afterEach(() => {
    monitor.stop();
    vi.restoreAllMocks();
  });

  function feedRecords(records: Record<string, unknown>[]) {
    const chunk = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
    feedRaw(chunk);
  }

  function feedRaw(chunk: string) {
    const buf = Buffer.from(chunk, "utf-8");
    const prevSize = currentSize;
    currentSize += buf.length;

    // First call to statSync (from findActiveTranscript) returns prevSize.
    // Second call (from poll) returns newSize.
    let statCallCount = 0;
    vi.mocked(fs.statSync).mockImplementation(() => {
      statCallCount++;
      // findActiveTranscript calls statSync twice: once to find newest, once to set lastFileSize.
      // poll calls statSync once.
      return { size: currentSize, mtimeMs: Date.now() } as any;
    });

    vi.mocked(fs.openSync).mockReturnValue(42);
    vi.mocked(fs.readSync).mockImplementation((_fd, buffer: any, _off, _len, position) => {
      buf.copy(buffer);
      return buf.length;
    });

    // Discover transcript if not yet done.
    if (!(monitor as any).currentFile) {
      // Set lastFileSize to prevSize (before our chunk).
      const origStat = vi.mocked(fs.statSync);
      origStat.mockReturnValueOnce({ size: Date.now(), mtimeMs: Date.now() } as any) // newest check
        .mockReturnValueOnce({ size: prevSize, mtimeMs: Date.now() } as any); // lastFileSize set
      (monitor as any).findActiveTranscript();
      // Now restore to return currentSize for poll.
      origStat.mockReturnValue({ size: currentSize, mtimeMs: Date.now() } as any);
    }

    (monitor as any).poll();
  }

  describe("agent identification via Skill tool", () => {
    it("emits agent_enter when Skill tool invokes a known agent", () => {
      feedRecords([{
        type: "assistant",
        message: { content: [makeToolUseBlock("Skill", "tool-1", { skill: "knight" })] },
      }]);

      const enters = events.filter((e) => e.type === "agent_enter");
      expect(enters).toHaveLength(1);
      expect((enters[0] as any).agentId).toBe("knight");
      expect((enters[0] as any).agentName).toBe(AGENTS["knight"].name);
    });

    it("does not emit agent_enter for unknown skill names", () => {
      feedRecords([{
        type: "assistant",
        message: { content: [makeToolUseBlock("Skill", "tool-1", { skill: "unknown-skill" })] },
      }]);

      const enters = events.filter((e) => e.type === "agent_enter");
      expect(enters).toHaveLength(0);
    });

    it("emits agent_exit when Skill tool_result arrives", () => {
      feedRecords([{
        type: "assistant",
        message: { content: [makeToolUseBlock("Skill", "tool-1", { skill: "bishop" })] },
      }]);
      feedRecords([{
        type: "user",
        message: { content: [makeToolResultBlock("tool-1")] },
      }]);

      const exits = events.filter((e) => e.type === "agent_exit");
      expect(exits).toHaveLength(1);
      expect((exits[0] as any).agentId).toBe("bishop");
    });
  });

  describe("agent identification via Agent tool", () => {
    it("identifies agent from description using word boundaries", () => {
      feedRecords([{
        type: "assistant",
        message: {
          content: [makeToolUseBlock("Agent", "tool-2", {
            description: "Launch black-knight for chaos testing",
            prompt: "test edge cases",
          })],
        },
      }]);

      const enters = events.filter((e) => e.type === "agent_enter");
      expect(enters).toHaveLength(1);
      expect((enters[0] as any).agentId).toBe("black-knight");
    });

    it("identifies agent from Italian name in prompt", () => {
      feedRecords([{
        type: "assistant",
        message: {
          content: [makeToolUseBlock("Agent", "tool-3", {
            description: "security audit",
            prompt: "Invoca la fortezza per un audit di sicurezza",
          })],
        },
      }]);

      const enters = events.filter((e) => e.type === "agent_enter");
      expect(enters).toHaveLength(1);
      expect((enters[0] as any).agentId).toBe("white-rook");
    });

    it("does not false-positive on partial word matches", () => {
      feedRecords([{
        type: "assistant",
        message: {
          content: [makeToolUseBlock("Agent", "tool-4", {
            description: "working on things",
            prompt: "do some kingpin analysis",
          })],
        },
      }]);

      const enters = events.filter((e) => e.type === "agent_enter");
      expect(enters).toHaveLength(0);
    });
  });

  describe("state inference", () => {
    it("emits session_writing for Edit tool", () => {
      feedRecords([{
        type: "assistant",
        message: { content: [makeToolUseBlock("Edit", "tool-5")] },
      }]);

      expect(events.some((e) => e.type === "session_writing")).toBe(true);
    });

    it("emits session_thinking for Read tool", () => {
      feedRecords([{
        type: "assistant",
        message: { content: [makeToolUseBlock("Read", "tool-6")] },
      }]);

      expect(events.some((e) => e.type === "session_thinking")).toBe(true);
    });

    it("emits session_thinking for Bash tool", () => {
      feedRecords([{
        type: "assistant",
        message: { content: [makeToolUseBlock("Bash", "tool-7")] },
      }]);

      expect(events.some((e) => e.type === "session_thinking")).toBe(true);
    });

    it("does not emit duplicate state events for same state", () => {
      feedRecords([{
        type: "assistant",
        message: {
          content: [
            makeToolUseBlock("Read", "tool-8"),
            makeToolUseBlock("Grep", "tool-9"),
          ],
        },
      }]);

      const thinkingEvents = events.filter((e) => e.type === "session_thinking");
      expect(thinkingEvents).toHaveLength(1);
    });
  });

  describe("context estimation", () => {
    it("emits usage_update with correct context fill percentage", () => {
      feedRecords([{
        type: "assistant",
        message: { content: [makeToolUseBlock("Read", "tool-10")] },
      }]);

      const usageEvents = events.filter((e) => e.type === "usage_update");
      expect(usageEvents.length).toBeGreaterThan(0);
      const last = usageEvents[usageEvents.length - 1] as any;
      expect(last.messagesThisSession).toBe(1);
      expect(last.toolCallsThisSession).toBe(1);
      expect(last.contextFillPct).toBe(1);
    });

    it("caps context fill at 100%", () => {
      const records = [];
      for (let i = 0; i < 200; i++) {
        records.push({
          type: "assistant",
          message: { content: [makeToolUseBlock("Read", `tool-${100 + i}`)] },
        });
      }
      feedRecords(records);

      const usageEvents = events.filter((e) => e.type === "usage_update");
      const last = usageEvents[usageEvents.length - 1] as any;
      expect(last.contextFillPct).toBe(100);
    });
  });

  describe("JSONL parsing resilience", () => {
    it("skips malformed lines without crashing", () => {
      feedRaw(
        '{"type":"assistant","message":{"content":[]}}\n' +
        "THIS IS NOT JSON\n" +
        '{"type":"assistant","message":{"content":[]}}\n'
      );

      const usageEvents = events.filter((e) => e.type === "usage_update");
      expect(usageEvents).toHaveLength(2);
    });
  });
});
