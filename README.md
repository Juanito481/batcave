# Bat Cave

**AI Agent Observability Platform** — a VSCode extension that visualizes Claude Code activity as a living pixel art Batcave with enterprise-grade monitoring, gamification, and agent command capabilities.

> What started as a pixel art toy became an enterprise tool. The cave watches Claude work, tracks costs, detects patterns, ranks agents, replays sessions, and now launches agents directly.

## Features

### Observability
- **Per-agent statistics** — tool count, files touched, active duration, invocations per agent
- **Cost estimation** — real-time token count and USD cost (Opus pricing model)
- **Audit trail** — 200-entry immutable structured log of all AI actions
- **Activity heatmap** — 40-slot time-series intensity bar
- **Efficiency ranking** — composite score (throughput + breadth), leaderboard with medals

### Persistence & Analytics
- **Session history** — up to 50 sessions stored in VSCode globalState
- **Export** — `Bat Cave: Export Session History` command outputs JSON
- **Cost budget** — `batcave.costBudget` setting with flashing HUD alert
- **Session replay** — time-lapse playback with scrubber, 0.5x-8x speed, keyboard controls

### Gamification
- **12 Achievements** across 4 tiers (Bronze, Silver, Gold, Legendary)
- **Trophy case** — pixel art glass display on cave wall
- **Cave Depth** — 4 mastery-gated layers that transform the cave's atmosphere
- **Smart alerts** — read loop detection, context pressure prediction, cost spike warnings
- See [ACHIEVEMENTS.md](./ACHIEVEMENTS.md) for the full platinum guide

### Agent Command Center
- **Launch agents** — click any agent to spawn a Claude Code session with that persona
- **Custom agents** — define team-specific agents via `.batcave/agents.json`
- **13 built-in personas** — each with unique sprite, zone, behavior, and system prompt

### Visual
- **Procedural pixel art** — 16x32 sprites with 12 unique body archetypes
- **Projected shadows** — each character's silhouette cast as directional shadow
- **6 idle animation styles** — sway, stomp, twitch, float, rigid, default
- **Ambient life** — bats, spiders, rats, fireflies, water drips
- **State-reactive environment** — LED strips, Batcomputer screens, light pools

## Quick Start

```bash
# Install dependencies
npm install

# Development (watch mode)
npm run dev

# Production build
npm run build

# Package as .vsix
npm run package
```

## Custom Agents

Create `.batcave/agents.json` in your workspace root:

```json
{
  "agents": {
    "king": {
      "name": "Il Sovrano",
      "emoji": "&#9812;",
      "role": "Vision & coherence",
      "systemPrompt": "You are Il Sovrano, the strategic overseer..."
    },
    "my-custom-agent": {
      "name": "My Agent",
      "emoji": "&#129302;",
      "role": "Custom role",
      "systemPrompt": "Your custom system prompt here..."
    }
  }
}
```

Override any of the 13 built-in agents or add new ones. The `systemPrompt` is passed to Claude Code when launching from the cave.

## Commands

| Command | Description |
|---------|-------------|
| `Bat Cave: Show` | Focus the cave panel |
| `Bat Cave: Reset View` | Reset world state and restart monitor |
| `Bat Cave: Toggle Sound` | Enable/disable procedural audio |
| `Bat Cave: Export Session History` | Export all sessions as JSON |

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `batcave.soundEnabled` | boolean | `false` | Enable procedural sound effects |
| `batcave.soundVolume` | number | `15` | Sound volume (0-100) |
| `batcave.costBudget` | number | `0` | Session cost budget in USD (0 = no limit) |

## Keyboard Shortcuts (Replay Mode)

| Key | Action |
|-----|--------|
| `R` | Start replay from current session |
| `Space` / `K` | Play/Pause |
| `Escape` / `Q` | Stop replay, return to live |
| Left / Right | Seek +/- 5% |
| `.` / `>` | Cycle speed (0.5x, 1x, 2x, 4x, 8x) |

## Panels

Click the Batcomputer screens to cycle through panels:

**Left screen:** Recent Files

**Center screen:** Stats -> Session History -> Audit Trail

**Right screen:** Agents -> Achievements -> Workspace Map

Click any agent character to open their detail panel with per-agent stats and a **LAUNCH** button.

## Architecture

```
src/                          Extension host (Node.js)
  extension.ts                WebviewViewProvider, commands, agent launcher
  activity-monitor.ts         JSONL polling, event parsing

shared/
  types.ts                    Cross-boundary types (AgentMeta, SessionSummary, etc.)

webview/src/                  Webview (React + Canvas 2D)
  App.tsx                     React root, message handling, replay wiring
  canvas/
    Renderer.ts               Orchestrator (layers + replay + particles)
    GameLoop.ts               requestAnimationFrame with delta-time clamping
    SpriteGenerator.ts        Procedural 16x32 pixel art (12 body types)
    layers/
      CaveLayer.ts            Cave environment (floor, walls, stalactites)
      FurnitureLayer.ts       Batcomputer, furniture, trophies, file nodes
      HudLayer.ts             HUD, panels, timeline, alerts
  systems/
    EventBus.ts               Typed pub/sub
    ParticleSystem.ts         Pool-based particles (200 max, 5 presets)
    SoundSystem.ts            Procedural oscillator audio
    ReplayEngine.ts           Session playback from audit trail
  entities/
    Character.ts              Sprite animation, idle styles, shadow
    Ambient.ts                Bats, spiders, rats, fireflies, drips
  world/
    BatCave.ts                World state, events, analytics, gamification
    Pathfinder.ts             BFS grid pathfinding
  data/
    agent-personalities.ts    Per-agent: body type, zone, behavior, quips
    gamification.ts           Achievements, cave depth, smart alerts, file nodes
```

## The 13 Agents

| Agent | Body | Zone | Idle | Role |
|-------|------|------|------|------|
| King | Caped | Batcomputer | Sway | Vision & coherence |
| Queen | Robed | Batcomputer | Sway | Business analysis |
| White Rook | Armored | Server | Stomp | Security defense |
| Bishop | Coated | Workbench | Default | Code review |
| Knight | Standard | Batcomputer | Rigid | Architecture |
| Pawn | Compact | Follow Alfred | Default | Briefing & status |
| Black Rook | Hooded | Server | Float | Red team & pentest |
| Black Bishop | Heavy | Patrol | Stomp | Tech debt hunter |
| Black Knight | Glitch | Patrol | Twitch | Chaos & edge cases |
| Chancellor | Standard | Server | Rigid | DevOps & infra |
| Cardinal | Labcoat | Workbench | Default | Testing & QA |
| Scout | Geared | Display | Default | Browser & visual |
| Ship | Naval | Entrance | Rigid | Git commit & push |

## License

MIT
