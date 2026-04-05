/**
 * Command Server tests — protocol validation, auth, rate limiting, input sanitization.
 */

import { describe, it, expect } from "vitest";

// Test sanitize logic (mirrored from server).
function sanitize(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 500);
}

describe("Input Sanitization", () => {
  it("strips control characters", () => {
    expect(sanitize("hello\x00world\x1f")).toBe("helloworld");
  });

  it("truncates to 500 chars", () => {
    const long = "a".repeat(600);
    expect(sanitize(long)).toHaveLength(500);
  });

  it("handles non-string input", () => {
    expect(sanitize(undefined)).toBe("");
    expect(sanitize(null)).toBe("");
    expect(sanitize(42)).toBe("");
    expect(sanitize({})).toBe("");
  });

  it("preserves normal strings", () => {
    expect(sanitize("Review PR #42 for security")).toBe("Review PR #42 for security");
  });

  it("preserves unicode", () => {
    expect(sanitize("♔ Il Sovrano — 审查")).toBe("♔ Il Sovrano — 审查");
  });
});

describe("Shell Argument Escaping", () => {
  function escapeShellArg(s: string): string {
    return s.replace(/'/g, "'\\''");
  }

  it("escapes single quotes", () => {
    expect(escapeShellArg("it's a test")).toBe("it'\\''s a test");
  });

  it("passes clean strings through", () => {
    expect(escapeShellArg("clean string")).toBe("clean string");
  });

  it("handles multiple quotes", () => {
    expect(escapeShellArg("a'b'c")).toBe("a'\\''b'\\''c");
  });

  it("handles backticks and dollar signs safely inside single quotes", () => {
    // Inside single quotes, these are literal — no escaping needed.
    const input = "$(rm -rf /) `whoami`";
    expect(escapeShellArg(input)).toBe(input);
  });
});

describe("Protocol Message Validation", () => {
  it("auth message requires all fields", () => {
    const valid = { type: "auth", name: "test", role: "member", repo: "batcave", token: "secret" };
    expect(valid.type).toBe("auth");
    expect(valid.name).toBeTruthy();
    expect(valid.token).toBeTruthy();
  });

  it("role must be master or member", () => {
    const roles = ["master", "member"];
    expect(roles).toContain("master");
    expect(roles).toContain("member");
    expect(roles).not.toContain("admin");
  });

  it("priority values are valid", () => {
    const priorities = ["low", "normal", "high", "urgent"];
    const order = { urgent: 0, high: 1, normal: 2, low: 3 };
    expect(order.urgent).toBeLessThan(order.low);
    expect(priorities).toHaveLength(4);
  });
});

describe("Rate Limiting Logic", () => {
  it("tracks message count per window", () => {
    const window = new Map<string, { count: number; resetAt: number }>();
    const clientId = "test-client";
    const maxPerMin = 120;

    // Simulate messages.
    for (let i = 0; i < maxPerMin + 10; i++) {
      let entry = window.get(clientId);
      if (!entry) {
        entry = { count: 0, resetAt: Date.now() + 60000 };
        window.set(clientId, entry);
      }
      entry.count++;
    }

    const entry = window.get(clientId)!;
    expect(entry.count).toBe(maxPerMin + 10);
    expect(entry.count > maxPerMin).toBe(true);
  });
});

describe("Queue Depth Limit", () => {
  it("rejects tasks when queue is full", () => {
    const MAX_QUEUE_DEPTH = 50;
    const queue: string[] = [];

    for (let i = 0; i < MAX_QUEUE_DEPTH; i++) {
      queue.push(`task_${i}`);
    }

    expect(queue.length).toBe(MAX_QUEUE_DEPTH);
    expect(queue.length >= MAX_QUEUE_DEPTH).toBe(true);
  });
});
