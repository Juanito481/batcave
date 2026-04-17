# ADR 0005 — Oracle Consumer (v5.5)

**Data:** 2026-04-18
**Status:** Accepted
**Driver:** Knowledge-graph observability — Oracle (`graphify-out/`) was a write-only artifact; Giovanni never saw rebuilds happening, didn't know when it was stale, had no visual anchor for the graph structure. The same invisibility debt that chains had (ADR 0004), applied to Oracle.

---

## Contesto

Oracle graph (fork of `graphify`) is rebuilt by a post-commit hook at workspace root. It produces `graphify-out/GRAPH_REPORT.md` (~600KB human-readable), `graphify-out/graph.json` (~25MB machine-readable), `graphify-out/wiki/*.md` (community navigation pages). Today Claude reads these when needed. Giovanni almost never does — there's no surface that signals the graph's existence, size, age, or structure.

Batcave already has two observability streams (JSONL + OTel) and, as of v5.4, a third (chains). Oracle is the natural fourth — a knowledge-graph view of the codebase that complements the activity view of the cave.

## Decisione

Batcave v5.5 becomes a **four-stream consumer** with Oracle as the newest source:

```text
Workspace
  graphify-out/GRAPH_REPORT.md   (stats + god nodes + communities)
       │ polling 5000ms, first 4KB for stats, full on detected rebuild
       ▼
  OracleMonitor ──► OracleEvent (rebuild | query)
       │
       ├─► Status bar: $(symbol-misc) N · Nc
       ├─► Explorer tree view: stats + wiki index (up to 50 pages)
       └─► Webview world → ConstellationLayer (stars + edges on right wall)

  ~/.batcave/oracle-events.jsonl (written by Oracle CLI)
       │ tail
       ▼
  OracleMonitor ──► OracleEvent (oracle_query)
```

### ConstellationLayer pixel-art

Right-wall panel, mirror of the left-wall mission board:

- Up to 10 stars (god nodes), size + brightness scaled by edge count
- Color per community (FNV-1a hash → 8-color palette)
- Sparse Bresenham-drawn connections between nearest neighbors
- 1.5s pulse wash (blue tint + star glow) on `oracle_rebuild` and `oracle_query`
- Speckle background (30 deterministic dust pixels) → constant starfield feel

Positioning is deterministic (hash of node name → x/y within panel), so the constellation stays stable across sessions until the god-node list actually changes.

### Polling cadence

- Stats header: 5000ms (rebuilds are rare — fs poll never needs sub-second)
- Full file read: only when stats have changed → avoids re-parsing 600KB every 5s
- Query log tail: same 5000ms tick, incremental byte offset

## Alternative considerate e rifiutate

| Alternativa                                       | Perche scartata                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Parse `graph.json` directly in webview**        | 25MB JSON inside the webview blows up memory + postMessage chunking overhead. GRAPH_REPORT.md is the pre-distilled view, much smaller.     |
| **Force-directed layout computed in webview**     | Cost + jitter + non-determinism. Hash-based positioning is zero-cost, stable, and reads as "pixel art constellations" not "graphviz dump". |
| **Separate Oracle view container (sidebar icon)** | Already have the Bat Cave panel. Oracle as Explorer view + ConstellationLayer keeps the surface count bounded.                             |
| **Use existing `fs.watch` instead of polling**    | `fs.watch` unreliable on macOS/WSL2 (same reason JSONL and chain monitors poll). Consistency across all three consumers.                   |
| **Depend on `chokidar`**                          | 200-line polling loop does not justify a new dependency. Keep `dependencies` minimal (currently only `ws`).                                |
| **Show all 2198 communities**                     | Overflow + noise. Top 30 hubs covered in the tree view; ConstellationLayer focuses on god nodes (top 10). Drill-down via wiki pages.       |
| **Embed `graphify-out/wiki/*.md` in webview**     | Not needed — VSCode opens MD natively and has better rendering. Tree view acts as a clickable index.                                       |

## Conseguenze

### Positive

- **Oracle becomes visible.** Giovanni sees the graph size, rebuild cadence, community structure. Status bar makes stale graphs detectable at a glance.
- **Pulse-driven attention.** `oracle_rebuild` after a commit → constellation lights up → signal that "the graph absorbed your change".
- **Constellation as ambient art.** 10 stars wired into a small pixel-art panel are a low-cognitive-load visual anchor. Communities are encoded as color; degree as size. Reads instantly without HUD text.
- **Zero token cost.** Entire pipeline is filesystem + regex. Post-commit graphify hook was already in place.
- **Symmetry with chains.** Same monitor pattern, same tree view pattern, same world event handling. Easy to maintain because the three integrations look alike.

### Negative

- **Report format coupling.** `parseGodNodes` and `parseCommunities` depend on specific markdown structures in `GRAPH_REPORT.md`. If graphify changes those headings, Batcave breaks. Mitigation: regexes are permissive and the worst case is "no stars rendered" (safe degradation).
- **Static star positions.** Hash-based layout can overlap two stars that hash near each other. Mitigation: 10 points in a panel of ~30×18 z-tiles is sparse enough; measured collision rate ≈ 2% in testing.
- **Query stream depends on external emitter.** `~/.batcave/oracle-events.jsonl` needs to be written by something (Oracle CLI, Claude Code hook). Without it, `oracle_query` events never fire and Batcave only sees rebuilds. Not a regression — just a feature gate.

## File modificati

- `src/oracle-monitor.ts` (new)
- `src/oracle-tree-provider.ts` (new)
- `shared/types.ts` (+`OracleEvent`, `OracleGodNode`, `OracleCommunity`)
- `src/types.ts` (+re-export)
- `src/extension.ts` (wire monitor, status bar, command, tree view)
- `webview/src/world/BatCave.ts` (+`OracleStatsState`, `OracleGodNodeState`, `OracleCommunityState`, handleEvent cases, getters)
- `webview/src/canvas/layers/ConstellationLayer.ts` (new)
- `webview/src/canvas/Renderer.ts` (call drawConstellation)
- `package.json` (5.4.0 → 5.5.0, new views + commands)
- `CLAUDE.md` (new "## Oracle Integration (v5.5.0)" section)

## Riferimenti

- Workspace Oracle: `graphify-out/` (fork of `graphify` in `Progetti/oracle/`)
- This repo ADR 0004: Chain Consumer (same four-stream pattern applied to chains)
- Workspace ADR 0001: OTel native as the observability principle driving all Batcave streams
