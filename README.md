# 🦇 Bat Cave

> Pixel art VSCode extension that visualizes Claude Code activity with animated chess-piece agents in a DC-style lab environment.

<p align="center">
  <em>Your AI dev team, alive in pixel art.</em>
</p>

---

## What is this?

Bat Cave turns the invisible work of Claude Code into a visible, animated pixel art world inside your VSCode bottom panel. Think Pokemon FireRed meets the Batcomputer.

- **Claude** is an animated character — typing, thinking, reading, idle
- **13 chess-piece agents** appear when invoked, work alongside Claude, and leave when done
- **The Batcomputer** shows real-time usage stats (messages, tool calls, context fill)
- **The environment** is a dark, moody cave lab — DC Comics meets retro gaming

## Why?

When you work with Claude Code, you can't see what it's doing. You read logs, diffs, terminal output — but there's no spatial, visual sense of the work happening. Bat Cave fixes that. It's your window into the machine.

Built for [Alfred Superintelligence Labs](https://github.com/Juanito481) — a one-person-plus-AI proptech company where Claude is the entire dev team.

## The Chess Pieces

Bat Cave visualizes the **Scacchiera v2** — Alfred's system of 13 specialized AI agents:

### White (Build & Defend)
| Sprite | Command | Name | Role |
|--------|---------|------|------|
| ♔ | `/king` | Il Sovrano | Product vision, cross-repo coherence |
| ♕ | `/queen` | La Stratega | Business analysis, ROI |
| ♖ | `/white-rook` | La Fortezza | Security defense |
| ♗ | `/bishop` | L'Ossessivo | Code review |
| ♘ | `/knight` | L'Architetto | Architecture & implementation |
| ♙ | `/pawn` | Il Segretario | Briefing & status |

### Black (Break & Test)
| Sprite | Command | Name | Role |
|--------|---------|------|------|
| ♜ | `/black-rook` | Lo Scassinatore | Red team, pentest |
| ♝ | `/black-bishop` | Il Demolitore | Tech debt hunter |
| ♞ | `/black-knight` | Il Sabotatore | Chaos engineering |

### Variants & Specialists
| Sprite | Command | Name | Role |
|--------|---------|------|------|
| ⚙️ | `/chancellor` | Il Cancelliere | DevOps & infra |
| 🧪 | `/cardinal` | Il Cardinale | Testing & QA |
| 👁️ | `/scout` | L'Esploratore | Browser automation |
| 🚢 | `/ship` | La Nave | Git commit & push |

## Architecture

```
Extension Host (Node.js)          Webview (React + Canvas 2D)
┌─────────────────────┐           ┌──────────────────────┐
│  ActivityMonitor     │──events──▶│  BatCaveWorld         │
│  (JSONL polling)     │           │  (game state)         │
│                      │           │         │              │
│  Extension.ts        │◀─ready───│  GameLoop              │
│  (WebviewProvider)   │           │  (requestAnimFrame)    │
└─────────────────────┘           │         │              │
                                  │  Renderer              │
                                  │  (Canvas 2D, pixel art)│
                                  └──────────────────────┘
```

**Activity detection**: Polls Claude Code's JSONL transcript files (`~/.claude/projects/`) every 500ms. Parses `tool_use`, `tool_result`, and agent lifecycle events. Same approach as [Pixel Agents](https://github.com/pablodelucca/pixel-agents).

**Rendering**: Canvas 2D with `imageSmoothingEnabled = false` for pixel-perfect rendering. Custom game loop with delta-time clamping. Pokemon FireRed-inspired 16-bit aesthetic.

## Development

```bash
# Install dependencies
cd Utilities/batcave
npm install
cd webview && npm install && cd ..

# Watch mode (extension + webview)
npm run dev

# Build for production
npm run build

# Package as .vsix
npm run package
```

### Project Structure

```
batcave/
├── src/                    # Extension host (Node.js)
│   ├── extension.ts        # WebviewViewProvider, lifecycle
│   ├── activity-monitor.ts # JSONL polling, event parsing
│   └── types.ts            # Shared types, agent registry
├── webview/                # Webview (React + Canvas)
│   └── src/
│       ├── App.tsx         # React root, canvas setup
│       ├── canvas/
│       │   ├── GameLoop.ts # requestAnimationFrame loop
│       │   └── Renderer.ts # Canvas 2D pixel art renderer
│       └── world/
│           └── BatCave.ts  # Game state, event handling
└── dist/                   # Build output (gitignored)
```

## Roadmap

### Phase 1 — Foundation (current)
- [x] VSCode extension scaffold (WebviewView, bottom panel)
- [x] React + Canvas 2D webview with pixel art rendering
- [x] Activity monitor (JSONL polling)
- [x] Game loop with delta-time
- [x] Basic Bat Cave environment (walls, floor, stalactites)
- [x] Batcomputer with glowing screens
- [x] Claude character (idle, thinking, writing states)
- [x] Usage HUD (context bar, message/tool/agent counters)
- [ ] Agent sprites entering/exiting on slash command invocation

### Phase 2 — Pixel Art Upgrade
- [ ] PNG sprite sheets for Claude (4-directional walk, idle, type, read)
- [ ] PNG sprite sheets for all 13 agents (unique designs)
- [ ] BFS pathfinding for character movement
- [ ] Furniture sprites (workbenches, servers, bookshelves)
- [ ] Ambient animations (screen flicker, dripping water, bats)

### Phase 3 — Intelligence
- [ ] Repo-aware environment (background changes per active repo)
- [ ] Tool visualization (Read = book, Bash = terminal, Edit = pencil icons)
- [ ] Agent speech bubbles with current action
- [ ] Session timeline (scrollable history of events)

### Phase 4 — Polish
- [ ] Sound effects (optional, toggle)
- [ ] Particle system (sparks when writing, dust when idle)
- [ ] Custom sprite support (load your own PNGs)
- [ ] Settings panel (zoom, sound, theme)
- [ ] Marketplace-ready packaging

## Tech Stack

| Layer | Tech |
|-------|------|
| Extension host | TypeScript, esbuild |
| Webview | React 19, TypeScript, Vite, Canvas 2D |
| Activity detection | JSONL file polling (500ms) |
| Sprites | Individual PNGs (planned), procedural pixel art (current) |
| VS Code integration | WebviewView (bottom panel) |

## Credits

Inspired by [Pixel Agents](https://github.com/pablodelucca/pixel-agents) by Pablo De Lucca. Built for the Alfred Superintelligence Labs ecosystem.

## License

MIT
