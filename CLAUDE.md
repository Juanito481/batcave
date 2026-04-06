# CLAUDE.md — Bat Cave

VSCode extension — pixel art visualization of Claude Code activity in a Batman-themed cave.

## Stack
- **Extension host**: TypeScript, esbuild, Node.js
- **Webview**: React 19, Canvas 2D, Vite
- **Activity source**: Claude Code JSONL transcripts (`~/.claude/projects/`)
- **Sound**: Web Audio API (procedural oscillator synthesis, no audio files)

## Architecture

```
src/
  extension.ts          — WebviewViewProvider, lifecycle, commands, settings bridge
  activity-monitor.ts   — JSONL polling (500ms), event parsing, agent identification
  types.ts              — re-export from shared/

shared/
  types.ts              — single source of truth: AgentMeta, UsageStats, BatCaveEvent, AGENTS

webview/src/
  App.tsx               — React root, canvas setup, resize observer, message handler
  canvas/
    Renderer.ts         — thin orchestrator, owns ParticleSystem + SoundSystem
    GameLoop.ts         — requestAnimationFrame with delta-time clamping (100ms max)
    SpriteGenerator.ts  — procedural 16x32 pixel-art sprites, 12 unique body archetypes, interior shading (lowercase=shadow, digits=highlight)
    layers/
      render-context.ts — RenderContext interface, shared palette P, seed(), outlineRect()
      CaveLayer.ts      — floor tiles, wall tiles, stalactites, stalagmites, time-of-day tint, Bat Signal, state-reactive LED strip, agent enter pulse
      FurnitureLayer.ts — Batcomputer (state-reactive screens + light pool), server rack, workbench, display panel, chair, etc.
      HudLayer.ts       — overlay HUD (state dot, context bar, model/session), tool icons, speech bubbles
  systems/
    EventBus.ts         — typed pub/sub singleton (bus), decouples systems
    ParticleSystem.ts   — pool-based (200 max), 5 presets, opaque pixel-art, no alpha
    SoundSystem.ts      — procedural oscillator sounds, muted by default
  entities/
    Character.ts        — animated sprite entity, waypoint movement, enter/exit lifecycle
    Ambient.ts          — bats, water drips (with sound + state boost), dust motes, screen glow
  data/
    agent-personalities.ts — per-agent personality: body type, zone, idle behavior, quips
  world/
    BatCave.ts          — world state, event handling, agent lifecycle, zone-based behaviors, quips, Bat Signal
    Pathfinder.ts       — BFS grid-based, 8-directional, no corner-cutting
  helpers/
    color.ts            — darken, lighten, hexToRgb, rgbToHex, clamp
```

## Characters
- **Alfred (Claude)** — butler, palette: dark tailcoat + white accent. Permanent.
- **Giovanni (Batman)** — cowl, palette: grey/black + accent blue #1E7FD8. Permanent. Goes to Batcomputer periodically.
- **13 Scacchiera agents** — appear/disappear when invoked via Skill/Agent tools. Each has unique sprite, zone, behavior, and quips.

## Agent Personality System (v2.0.0)

Each of the 13 chess-piece agents has:
- **Unique body archetype**: 12 distinct pixel-art silhouettes (caped, robed, armored, coated, hooded, heavy, glitch, labcoat, geared, compact, naval, standard)
- **Preferred zone**: agents go to their meaningful area (server rack, workbench, display panel, batcomputer, patrol, follow Alfred, entrance)
- **Idle behavior**: signature actions when not working (guard, inspect, pace, follow, lurk, chaos, etc.)
- **Quips**: 4 personality-specific speech lines shown in bubbles every 20-40s idle

| Agent | Body | Zone | Behavior |
|-------|------|------|----------|
| King | caped | batcomputer | survey |
| Queen | robed | batcomputer | pace |
| White Rook | armored | server | guard |
| Bishop | coated | workbench | inspect |
| Knight | standard | batcomputer | draft |
| Pawn | compact | follow | note |
| Black Rook | hooded | server | lurk |
| Black Bishop | heavy | patrol | demolish |
| Black Knight | glitch | patrol | chaos |
| Chancellor | standard | server | maintain |
| Cardinal | labcoat | workbench | test |
| Scout | geared | display | scan |
| Ship | naval | entrance | standby |

## Systems
- **EventBus**: `bus.emit("particle:spawn", ...)`, `bus.emit("sound:play", ...)`. All state changes in BatCave emit events.
- **ParticleSystem**: presets — `tool-spark` (orange), `agent-enter` (green), `agent-exit` (red), `write-glow`, `think-pulse` (blue). Pool of 200, zero GC.
- **SoundSystem**: `drip`, `tool-click`, `agent-chime`, `agent-exit`, `think-chime`, `write-click`. All synthesized via OscillatorNode. Muted by default, toggle via command or `batcave.soundEnabled` setting.

## Ambient Intelligence (v2.0.0)

The cave communicates Claude's state through environment, not UI overlays:

- **Batcomputer light pool**: blue glow on floor during thinking, green during writing, off when idle. Breathing pulse animation.
- **LED strip state-reactive**: wall LED strip changes color with Claude state (blue=thinking, green=writing, theme accent=idle). Pulse speed doubles when active.
- **Agent enter pulse**: green wave travels along LED strip for 1.5s when any agent enters the cave.
- **Screen tremor**: 1px jitter on Batcomputer screen content during writing state.
- **Cave breathing**: drip frequency doubles during thinking via Ambient.setStateBoost(0.5).
- **Spiders**: 2-3 spiders hang from ceiling, periodically descend on silk threads, dangle, retract.
- **Rats**: scurry across the floor every 20-40s, animate with alternating leg frames.
- **Fireflies**: 4-6 glowing dots near ceiling, pulsing brightness, gentle drift.

## Behaviors
- **Alfred quips**: 8 butler phrases, shown every 30-50s idle, 4s display. Fixed threshold per cycle.
- **Giovanni at Batcomputer**: walks to chair every 15-25s, works 6s, wanders away. Fixed threshold per cycle.
- **Bat Signal**: projects bat silhouette on ceiling when context hits 100%.
- **Context pressure**: drip frequency scales from 25000ms (0%) to 8000ms (100%). Driven by `contextPressure` field.
- **Time-of-day**: warm amber tint daytime (10-16h), cool blue nighttime (21-5h).
- **Batcomputer screens**: blue=thinking, green=writing, dim=idle. Labels change per state.
- **Idle wandering**: pathfinder-based, 4-8s interval.
- **Bat swoops**: accumulator-based (3-8s threshold), frame-rate independent.

## Overlay HUD (minimal)
- **Context bar**: full-width top bar, green/orange/red by usage %, quarter marks.
- **State chip** (top-left): animated state dot + label (IDLE/THINKING/WRITING) + context %.
- **Info chip** (top-right): repo label + model badge + session duration.
- **Active agents** (below state): green dots + emoji for each active agent.
- **Pace** (top-right secondary): tools/min with trend arrow.
- **Session indicators**: shows other active Claude sessions when multiple exist.
- **Expanded panels**: click Batcomputer screens to expand files/stats/agents panels.

## Multi-session (v2.0.0)

Activity monitor scans all `~/.claude/projects/*/` directories. Sessions active within the last 5 minutes are tracked and displayed as indicators in the HUD. The current session is highlighted green.

## Context Estimation

Weighted formula: `(msgs * 2000 + tools * 1500) / 500_000 * 100`. Budget assumes ~500k effective tokens (1M context minus system prompt/memory overhead).

## Commands
- `Bat Cave: Show` — focus the panel
- `Bat Cave: Reset View` — reset world state and restart monitor
- `Bat Cave: Toggle Sound` — enable/disable procedural audio

## Settings
- `batcave.soundEnabled` (boolean, default: false)
- `batcave.soundVolume` (0-100, default: 15)

## Rules
- All rendering must be pixel-perfect — never enable image smoothing
- Sprites are 16x32px base size, scaled by integer zoom factor
- Color palette: dark cave (#0a0a12 bg), accent blue (#1E7FD8), no rgba in ambient layer
- No external game engines — vanilla Canvas 2D only
- No external audio files — all sound synthesized via Web Audio oscillators
- Extension must work with zero configuration — auto-discovers Claude Code transcripts
- Click handling uses canvas coordinate mapping for hit testing
- Never modify Claude Code files — read only
- Particles use opaque palette colors, no globalAlpha (flicker fade instead)
- Use ctx.save()/restore() around any globalAlpha changes

## Build
```bash
npm run dev    # Watch mode (concurrent ext + webview)
npm run build  # Production build
npm run package # .vsix
```
