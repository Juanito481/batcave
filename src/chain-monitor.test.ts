/**
 * ChainMonitor end-to-end tests against a temp filesystem.
 *
 * Exercises the real polling loop + parser + diff logic without mocking.
 * Emulates the full lifecycle Marshal would produce: create -> update ->
 * archive. Also verifies rollback safety when the chains dir disappears.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ChainMonitor } from "./chain-monitor";
import { BatCaveEvent, ChainEvent } from "./types";

function isChainEvent(e: BatCaveEvent): e is ChainEvent {
  return (
    e.type === "chain_created" ||
    e.type === "chain_updated" ||
    e.type === "chain_archived"
  );
}

function statusFixture(opts: {
  type?: string;
  target?: string;
  step?: string;
  current?: string;
  next?: string;
  flag?: string;
}): string {
  return `# Chain

**Type:** ${opts.type ?? "build"}
**Target:** ${opts.target ?? "alpha"}
**Step:** ${opts.step ?? "1/1"}
**Current:** ${opts.current ?? "Knight — planning"}
**Next:** ${opts.next ?? "Weaver — implement"}
**Last update:** 2026-04-17 22:00 by Knight
**Status:** active
**Flag:** ${opts.flag ?? "clean"}
`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("ChainMonitor", () => {
  let tmpRoot: string;
  let chainsActive: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "batcave-chain-test-"));
    chainsActive = path.join(tmpRoot, ".claude", "chains", "active");
    fs.mkdirSync(chainsActive, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("emits chain_created with parsed fields", async () => {
    const events: BatCaveEvent[] = [];
    const monitor = new ChainMonitor(tmpRoot, (e) => events.push(e));
    monitor.start();

    const chainId = "build-test-repo-upsell-20260417";
    const chainDir = path.join(chainsActive, chainId);
    fs.mkdirSync(chainDir);
    fs.writeFileSync(
      path.join(chainDir, "status.md"),
      statusFixture({
        type: "build",
        target: "test-repo",
        step: "2/5",
        current: "Knight — planning",
        next: "Weaver — implement",
        flag: "clean",
      }),
    );

    await sleep(1300);
    monitor.stop();

    const created = events.find(
      (e): e is ChainEvent => isChainEvent(e) && e.type === "chain_created",
    );
    expect(created).toBeDefined();
    expect(created!.chainId).toBe(chainId);
    expect(created!.chainType).toBe("build");
    expect(created!.target).toBe("test-repo");
    expect(created!.step).toEqual({ current: 2, total: 5 });
    expect(created!.currentAgent).toBe("knight");
    expect(created!.nextAgent).toBe("weaver");
    expect(created!.flag).toBe("clean");
    expect(created!.source).toBe("chains");
  });

  it("emits chain_updated when status.md changes", async () => {
    const chainId = "build-beta-foo-20260417";
    const chainDir = path.join(chainsActive, chainId);
    fs.mkdirSync(chainDir);
    fs.writeFileSync(
      path.join(chainDir, "status.md"),
      statusFixture({ step: "1/3", current: "Knight", next: "Weaver", flag: "clean" }),
    );

    const events: BatCaveEvent[] = [];
    const monitor = new ChainMonitor(tmpRoot, (e) => events.push(e));
    monitor.start();

    await sleep(1300);
    fs.writeFileSync(
      path.join(chainDir, "status.md"),
      statusFixture({ step: "2/3", current: "Weaver", next: "Bishop", flag: "warn" }),
    );
    await sleep(1300);
    monitor.stop();

    const updates = events.filter(
      (e): e is ChainEvent => isChainEvent(e) && e.type === "chain_updated",
    );
    expect(updates.length).toBeGreaterThan(0);
    const last = updates[updates.length - 1];
    expect(last.step).toEqual({ current: 2, total: 3 });
    expect(last.currentAgent).toBe("weaver");
    expect(last.nextAgent).toBe("bishop");
    expect(last.flag).toBe("warn");
  });

  it("emits chain_archived when folder is removed", async () => {
    const chainId = "review-alpha-pr42-20260417";
    const chainDir = path.join(chainsActive, chainId);
    fs.mkdirSync(chainDir);
    fs.writeFileSync(
      path.join(chainDir, "status.md"),
      statusFixture({ type: "review", target: "alpha", step: "1/1" }),
    );

    const events: BatCaveEvent[] = [];
    const monitor = new ChainMonitor(tmpRoot, (e) => events.push(e));
    monitor.start();

    await sleep(1300);
    fs.rmSync(chainDir, { recursive: true, force: true });
    await sleep(1300);
    monitor.stop();

    const archived = events.find(
      (e): e is ChainEvent => isChainEvent(e) && e.type === "chain_archived",
    );
    expect(archived).toBeDefined();
    expect(archived!.chainId).toBe(chainId);
  });

  it("clears state and emits chain_archived when the whole active dir disappears", async () => {
    const chainId = "improve-scacchiera-chains-20260417";
    const chainDir = path.join(chainsActive, chainId);
    fs.mkdirSync(chainDir);
    fs.writeFileSync(
      path.join(chainDir, "status.md"),
      statusFixture({ type: "improve" }),
    );

    const events: BatCaveEvent[] = [];
    const monitor = new ChainMonitor(tmpRoot, (e) => events.push(e));
    monitor.start();

    await sleep(1300);
    fs.rmSync(chainsActive, { recursive: true, force: true });
    await sleep(1300);
    monitor.stop();

    const archived = events.filter(
      (e): e is ChainEvent => isChainEvent(e) && e.type === "chain_archived",
    );
    expect(archived.length).toBeGreaterThanOrEqual(1);
  });

  it("ignores _template and dotfile dirs", async () => {
    fs.mkdirSync(path.join(chainsActive, "_template"));
    fs.writeFileSync(
      path.join(chainsActive, "_template", "status.md"),
      statusFixture({}),
    );
    fs.mkdirSync(path.join(chainsActive, ".hidden"));

    const events: BatCaveEvent[] = [];
    const monitor = new ChainMonitor(tmpRoot, (e) => events.push(e));
    monitor.start();
    await sleep(1300);
    monitor.stop();

    const created = events.filter(
      (e): e is ChainEvent => isChainEvent(e) && e.type === "chain_created",
    );
    expect(created).toHaveLength(0);
  });

  it("ignores dirs without status.md", async () => {
    fs.mkdirSync(path.join(chainsActive, "build-noop-20260417"));

    const events: BatCaveEvent[] = [];
    const monitor = new ChainMonitor(tmpRoot, (e) => events.push(e));
    monitor.start();
    await sleep(1300);
    monitor.stop();

    const created = events.filter(
      (e): e is ChainEvent => isChainEvent(e) && e.type === "chain_created",
    );
    expect(created).toHaveLength(0);
  });

  it("defaults flag to clean and step to 0/0 when fields are missing", async () => {
    const chainId = "build-garbage-20260417";
    const chainDir = path.join(chainsActive, chainId);
    fs.mkdirSync(chainDir);
    fs.writeFileSync(
      path.join(chainDir, "status.md"),
      `# Minimal\n\n**Type:** build\n**Target:** garbage\n`,
    );

    const events: BatCaveEvent[] = [];
    const monitor = new ChainMonitor(tmpRoot, (e) => events.push(e));
    monitor.start();
    await sleep(1300);
    monitor.stop();

    const created = events.find(
      (e): e is ChainEvent => isChainEvent(e) && e.type === "chain_created",
    );
    expect(created).toBeDefined();
    expect(created!.flag).toBe("clean");
    expect(created!.step).toEqual({ current: 0, total: 0 });
    expect(created!.currentAgent).toBe("");
    expect(created!.nextAgent).toBe("");
  });
});
