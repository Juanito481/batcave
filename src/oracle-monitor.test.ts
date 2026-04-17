/**
 * OracleMonitor E2E tests — exercise report parsing + polling diff logic
 * against a temp filesystem. No mocking, same pattern as chain-monitor tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { OracleMonitor } from "./oracle-monitor";
import { BatCaveEvent, OracleEvent } from "./types";

function isOracleEvent(e: BatCaveEvent): e is OracleEvent {
  return e.type === "oracle_rebuild" || e.type === "oracle_query";
}

function reportFixture(opts: {
  date?: string;
  nodes?: number;
  edges?: number;
  communities?: number;
  godNodes?: Array<{ name: string; edges: number }>;
  hubs?: string[];
}): string {
  const godLines = (
    opts.godNodes ?? [
      { name: "KnowledgeBaseService", edges: 335 },
      { name: "Poi", edges: 333 },
    ]
  )
    .map((n, i) => `${i + 1}. \`${n.name}\` - ${n.edges} edges`)
    .join("\n");

  const hubLines = (opts.hubs ?? ["Community 0", "Community 1"])
    .map((h, i) => `- [[_COMMUNITY_Community ${i}|${h}]]`)
    .join("\n");

  return `# Graph Report - .  (${opts.date ?? "2026-04-17"})

## Corpus Check
- 2684 files · ~3,399,398 words

## Summary
- ${opts.nodes ?? 18657} nodes · ${opts.edges ?? 42212} edges · ${opts.communities ?? 2198} communities detected
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
${hubLines}

## God Nodes (most connected - your core abstractions)
${godLines}

## Surprising Connections
- nothing interesting
`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("OracleMonitor", { timeout: 30000 }, () => {
  let tmpRoot: string;
  let graphifyOut: string;
  let reportPath: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "batcave-oracle-test-"));
    graphifyOut = path.join(tmpRoot, "graphify-out");
    fs.mkdirSync(graphifyOut, { recursive: true });
    reportPath = path.join(graphifyOut, "GRAPH_REPORT.md");
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("emits oracle_rebuild with parsed stats + god nodes + communities", async () => {
    fs.writeFileSync(
      reportPath,
      reportFixture({
        date: "2026-04-18",
        nodes: 100,
        edges: 200,
        communities: 10,
        godNodes: [
          { name: "NodeA", edges: 50 },
          { name: "NodeB", edges: 42 },
          { name: "NodeC", edges: 31 },
        ],
        hubs: ["Community 0", "Community 1", "Community 2"],
      }),
    );

    const events: BatCaveEvent[] = [];
    const monitor = new OracleMonitor(tmpRoot, (e) => events.push(e));
    monitor.start();

    // First poll fires immediately inside start().
    await sleep(5200);
    monitor.stop();

    const rebuild = events.find(
      (e): e is OracleEvent => isOracleEvent(e) && e.type === "oracle_rebuild",
    );
    expect(rebuild).toBeDefined();
    expect(rebuild!.totalNodes).toBe(100);
    expect(rebuild!.totalEdges).toBe(200);
    expect(rebuild!.communities).toBe(10);
    expect(rebuild!.reportDate).toBe("2026-04-18");
    expect(rebuild!.godNodes).toHaveLength(3);
    expect(rebuild!.godNodes![0]).toEqual({ name: "NodeA", edges: 50 });
    expect(rebuild!.communityList!.length).toBeGreaterThan(0);
    expect(rebuild!.source).toBe("oracle");
  });

  it("emits a second oracle_rebuild with deltas when stats change", async () => {
    fs.writeFileSync(
      reportPath,
      reportFixture({ nodes: 100, edges: 200, communities: 10 }),
    );

    const events: BatCaveEvent[] = [];
    const monitor = new OracleMonitor(tmpRoot, (e) => events.push(e));
    monitor.start();

    await sleep(5200);

    fs.writeFileSync(
      reportPath,
      reportFixture({ nodes: 150, edges: 280, communities: 11 }),
    );
    await sleep(5200);
    monitor.stop();

    const rebuilds = events.filter(
      (e): e is OracleEvent => isOracleEvent(e) && e.type === "oracle_rebuild",
    );
    expect(rebuilds.length).toBeGreaterThanOrEqual(2);
    const second = rebuilds[1];
    expect(second.totalNodes).toBe(150);
    expect(second.deltaNodes).toBe(50);
    expect(second.deltaEdges).toBe(80);
  });

  it("tails oracle-events.jsonl and emits oracle_query", async () => {
    fs.writeFileSync(reportPath, reportFixture({}));

    const batcaveDir = path.join(os.homedir(), ".batcave");
    const logPath = path.join(batcaveDir, "oracle-events.jsonl");

    // Back up existing log if any (tests should not mutate the user's state).
    let backup: string | null = null;
    if (fs.existsSync(logPath)) {
      backup = fs.readFileSync(logPath, "utf8");
    } else {
      fs.mkdirSync(batcaveDir, { recursive: true });
    }

    try {
      // Start with empty / existing log; OracleMonitor seeds its offset.
      fs.writeFileSync(logPath, "");
      const events: BatCaveEvent[] = [];
      const monitor = new OracleMonitor(tmpRoot, (e) => events.push(e));
      monitor.start();

      await sleep(1000);
      fs.appendFileSync(
        logPath,
        JSON.stringify({
          type: "oracle_query",
          query: "how does Knight produce plans?",
          resultCount: 42,
          timestamp: Date.now(),
        }) + "\n",
      );
      await sleep(5500);
      monitor.stop();

      const queries = events.filter(
        (e): e is OracleEvent => isOracleEvent(e) && e.type === "oracle_query",
      );
      expect(queries.length).toBeGreaterThan(0);
      expect(queries[0].queryText).toBe("how does Knight produce plans?");
      expect(queries[0].resultCount).toBe(42);
    } finally {
      if (backup !== null) {
        fs.writeFileSync(logPath, backup);
      } else {
        try {
          fs.unlinkSync(logPath);
        } catch {
          // ignore
        }
      }
    }
  });

  it("does not emit before GRAPH_REPORT.md exists", async () => {
    const events: BatCaveEvent[] = [];
    const monitor = new OracleMonitor(tmpRoot, (e) => events.push(e));
    monitor.start();

    await sleep(5200);
    monitor.stop();

    expect(events.filter(isOracleEvent)).toHaveLength(0);
  });

  it("handles malformed report gracefully (no crash, no event)", async () => {
    fs.writeFileSync(reportPath, "this is not a valid graph report");

    const events: BatCaveEvent[] = [];
    const monitor = new OracleMonitor(tmpRoot, (e) => events.push(e));
    monitor.start();

    await sleep(5200);
    monitor.stop();

    expect(events.filter(isOracleEvent)).toHaveLength(0);
  });
});
