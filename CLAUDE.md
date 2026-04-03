# CLAUDE.md — Bat Cave

VSCode extension — pixel art visualization of Claude Code activity.

## Stack
- **Extension host**: TypeScript, esbuild, Node.js
- **Webview**: React 19, Canvas 2D, Vite
- **Activity source**: Claude Code JSONL transcripts (`~/.claude/projects/`)

## Architecture
- Extension polls JSONL files every 500ms via ActivityMonitor
- Events forwarded to webview via postMessage
- Webview renders pixel art via Canvas 2D (imageSmoothingEnabled=false)
- Game loop: requestAnimationFrame with delta-time clamping

## Rules
- All rendering must be pixel-perfect — never enable image smoothing
- Sprites are 16x32px base size, scaled by integer zoom factor
- Color palette: dark cave (#0a0a12 bg), Alfred blue (#1E7FD8 accent), Claude terracotta (#D97757)
- No external game engines — vanilla Canvas 2D only
- Extension must work with zero configuration — auto-discovers Claude Code transcripts
- Never modify Claude Code files — read only

## Build
```bash
npm run dev    # Watch mode
npm run build  # Production build
npm run package # .vsix
```
