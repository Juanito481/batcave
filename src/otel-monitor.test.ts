import { describe, it, expect } from "vitest";
import { parseOtelLine, mapOtelEvent, resolveOtelPath } from "./otel-monitor";
import { BatCaveEvent } from "./types";

describe("resolveOtelPath", () => {
  it("expands ~ to home dir", () => {
    const out = resolveOtelPath("~/test.jsonl");
    expect(out).not.toContain("~");
    expect(out.endsWith("/test.jsonl")).toBe(true);
  });

  it("leaves absolute paths alone", () => {
    expect(resolveOtelPath("/tmp/foo.jsonl")).toBe("/tmp/foo.jsonl");
  });
});

describe("mapOtelEvent", () => {
  it("maps skill_activated to agent_enter", () => {
    const ev = mapOtelEvent(
      { "event.name": "claude_code.skill_activated", "skill.name": "bishop" },
      1000,
    );
    expect(ev).toEqual({
      type: "agent_enter",
      agentId: "bishop",
      agentName: expect.any(String),
      timestamp: 1000,
      source: "otel",
    });
  });

  it("lowercases skill names", () => {
    const ev = mapOtelEvent(
      { "event.name": "claude_code.skill_activated", "skill.name": "BISHOP" },
      0,
    );
    expect((ev as { agentId: string }).agentId).toBe("bishop");
  });

  it("ignores skill_activated without name", () => {
    const ev = mapOtelEvent({ "event.name": "claude_code.skill_activated" }, 0);
    expect(ev).toBeNull();
  });

  it("maps tool_result to tool_end with success+duration", () => {
    const ev = mapOtelEvent(
      {
        "event.name": "claude_code.tool_result",
        tool_name: "Edit",
        success: "true",
        duration_ms: 42,
      },
      1000,
    );
    expect(ev).toEqual({
      type: "tool_end",
      toolName: "Edit",
      timestamp: 1000,
      success: true,
      durationMs: 42,
      source: "otel",
    });
  });

  it("maps api_error with status_code and attempt", () => {
    const ev = mapOtelEvent(
      {
        "event.name": "claude_code.api_error",
        status_code: "429",
        attempt: 3,
        model: "claude-opus-4-6",
      },
      1000,
    );
    expect(ev).toEqual({
      type: "api_error",
      timestamp: 1000,
      statusCode: "429",
      attempt: 3,
      model: "claude-opus-4-6",
    });
  });

  it("maps tool_decision reject to tool_rejected", () => {
    const ev = mapOtelEvent(
      {
        "event.name": "claude_code.tool_decision",
        decision: "reject",
        tool_name: "Write",
      },
      1000,
    );
    expect(ev).toEqual({
      type: "tool_rejected",
      timestamp: 1000,
      toolName: "Write",
    });
  });

  it("ignores tool_decision accept", () => {
    const ev = mapOtelEvent(
      {
        "event.name": "claude_code.tool_decision",
        decision: "accept",
        tool_name: "Read",
      },
      0,
    );
    expect(ev).toBeNull();
  });

  it("maps user_prompt to prompt_start", () => {
    const ev = mapOtelEvent(
      { "event.name": "claude_code.user_prompt", prompt_length: 100 },
      1000,
    );
    expect(ev).toEqual({
      type: "prompt_start",
      timestamp: 1000,
      promptLength: 100,
    });
  });

  it("maps plugin_installed", () => {
    const ev = mapOtelEvent(
      {
        "event.name": "claude_code.plugin_installed",
        "plugin.name": "context7",
        "plugin.version": "1.0.0",
        "marketplace.name": "claude-plugins-official",
      },
      1000,
    );
    expect(ev).toEqual({
      type: "plugin_installed",
      timestamp: 1000,
      pluginName: "context7",
      pluginVersion: "1.0.0",
      marketplaceName: "claude-plugins-official",
    });
  });

  it("returns null for unknown event names", () => {
    expect(mapOtelEvent({ "event.name": "some.other.event" }, 0)).toBeNull();
  });

  it("returns null when event.name is missing", () => {
    expect(mapOtelEvent({ tool_name: "Read" }, 0)).toBeNull();
  });
});

describe("parseOtelLine", () => {
  it("parses a well-formed OTel log line", () => {
    const line = JSON.stringify({
      timestamp: "2026-04-14T10:00:00Z",
      attributes: {
        "event.name": "claude_code.skill_activated",
        "skill.name": "knight",
      },
    });
    const ev = parseOtelLine(line) as BatCaveEvent & { agentId?: string };
    expect(ev?.type).toBe("agent_enter");
    expect(ev?.agentId).toBe("knight");
  });

  it("parses OTLP native array attributes", () => {
    const line = JSON.stringify({
      timeUnixNano: "1000000000",
      attributes: [
        {
          key: "event.name",
          value: { stringValue: "claude_code.tool_result" },
        },
        { key: "tool_name", value: { stringValue: "Edit" } },
        { key: "success", value: { boolValue: true } },
        { key: "duration_ms", value: { intValue: 50 } },
      ],
    });
    const ev = parseOtelLine(line) as BatCaveEvent & {
      toolName?: string;
      success?: boolean;
    };
    expect(ev?.type).toBe("tool_end");
    expect(ev?.toolName).toBe("Edit");
    expect(ev?.success).toBe(true);
  });

  it("returns null for malformed JSON", () => {
    expect(parseOtelLine("not json")).toBeNull();
  });

  it("returns null for empty lines", () => {
    expect(parseOtelLine("")).toBeNull();
    expect(parseOtelLine("   ")).toBeNull();
  });

  it("returns null for lines without event.name", () => {
    expect(
      parseOtelLine(JSON.stringify({ attributes: { foo: "bar" } })),
    ).toBeNull();
  });
});
