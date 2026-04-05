# Bat Cave Achievement Guide

## How to Platinum — Unlock Every Trophy

The Bat Cave has **12 achievements** across 4 tiers. Each unlocked achievement appears as a pixel art trophy in the glass case on the cave wall. Unlock all 12 to **platinum** the cave.

Trophies are checked every 20 tool calls and persist across sessions.

---

## 🟤 Bronze Tier — Getting Started

### First Blood
> Complete your first tool call

**How:** Just start using Claude Code. Any tool call (Read, Edit, Bash, etc.) triggers this immediately. The easiest achievement.

### Agent Summoner
> Summon your first agent

**How:** Use the `Agent` or `Skill` tool in Claude Code to spawn a sub-agent. Any of the 13 chess-piece agents counts.

### Night Owl 🦉
> Run a session after midnight with 100+ tools

**How:** Start a Claude Code session between 22:00 and 05:00, and use at least 100 tools. A solid late-night coding session will get you there. The session must be *started* during night hours.

---

## ⚪ Silver Tier — Skill Milestones

### Context Master 💎
> Complete a 200+ tool session under 50% context

**How:** This requires efficient context usage. Key strategies:
- Keep prompts concise
- Avoid dumping large files into context
- Use targeted reads instead of full file reads
- A 200-tool session that stays under 50% context fill means Claude is being used efficiently

### Full Board ♚
> Summon all 13 agents in one session

**How:** You need to invoke every chess-piece agent in a single session:
1. King (Il Sovrano)
2. Queen (La Stratega)
3. White Rook (La Fortezza)
4. Bishop
5. Knight (L'Architetto)
6. Pawn (Il Segretario)
7. Black Rook (Lo Scassinatore)
8. Black Bishop (Il Demolitore)
9. Black Knight (Il Sabotatore)
10. Chancellor (Il Cancelliere)
11. Cardinal (Il Cardinale)
12. Scout (L'Esploratore)
13. Ship (La Nave)

This typically requires a complex task that involves security review, testing, architecture, deployment, and more — all in one session.

### Speed Demon ⚡
> Sustain 15+ tools/min for a session (minimum 50 tools)

**How:** High-throughput sessions where Claude is rapidly reading, editing, and running commands. This naturally happens during:
- Large refactoring operations
- Multi-file search and replace
- Automated test fixing loops
- Codebase exploration sprints

### Polyglot 📜
> Use all tool categories in one session

**How:** You need at least one tool call in each of the 5 categories:
- **Read** (Read, Grep, Glob)
- **Write** (Edit, Write, NotebookEdit)
- **Bash** (Bash)
- **Web** (WebSearch, WebFetch)
- **Agent** (Agent, Skill)

A typical feature implementation session that involves research, coding, testing, and delegation usually covers all categories.

---

## 🟡 Gold Tier — Mastery

### Budget Hawk 🦅
> Stay under budget for 10 sessions

**How:** Set a cost budget via `batcave.costBudget` in VS Code settings, then complete 10 sessions without exceeding it. Requires:
1. Set a realistic budget (e.g., $2-5 per session)
2. Monitor the cost display in the stats panel
3. Complete sessions within budget — the counter accumulates across sessions

### Thousand Cuts 🛡
> Reach 1000 cumulative tool calls

**How:** This is a persistence achievement. Tool calls accumulate across all sessions. At an average of 50-100 tools per session, this takes 10-20 sessions. Just keep using Claude Code consistently.

### File Surgeon 💎
> Touch 50+ files in one session

**How:** Large-scale operations across many files:
- Project-wide refactoring (renaming, API migration)
- Codebase audit across multiple modules
- Multi-package monorepo work
- Large feature implementations touching many layers

---

## 🔴 Legendary Tier — Extreme Mastery

### Legendary Efficiency 👑
> 1000+ tools cumulative, under $10 total cost

**How:** The hardest achievement. Requires long-term efficient usage:
- Reach 1000 cumulative tool calls (Gold: Thousand Cuts first)
- Keep total estimated cost under $10 across all those sessions
- Average ~$0.01 per tool call or less
- Strategies: concise prompts, efficient tool usage, avoid unnecessary context expansion

### Cave Dweller 🔥
> Complete 50 sessions

**How:** Pure dedication. Use Claude Code consistently across 50 separate sessions. Each session with at least one tool call counts. At one session per day, this takes ~2 months.

---

## Cave Depth Layers

Beyond achievements, the cave physically deepens as you master AI usage:

| Depth | Name | Requirement | Palette |
|-------|------|-------------|---------|
| 1 | The Surface | Starting layer | Dark blue |
| 2 | The Workshop | Use read + write + bash tools | Green accent |
| 3 | The Vault | 10+ sessions, 5+ tools/min average | Purple accent |
| 4 | The Abyss | 1000+ tools, <$10 total cost | Red accent |

Each layer has a unique color palette that transforms the cave's atmosphere.

---

## Smart Alerts

The cave watches your patterns and warns you:

| Alert | Trigger | Severity |
|-------|---------|----------|
| Read Loop | Same file read 5x without writing | ⚠️ Warning |
| Context Pressure | >80% context fill + high tool rate | 🔴 Critical |
| Cost Spike | 50% of budget used in <5 minutes | ⚠️ Warning |

---

## Viewing Your Progress

- **Trophy case**: pixel art glass case on the right cave wall (visible once you unlock your first achievement)
- **Achievement panel**: click the right Batcomputer screen and cycle to "ACHIEVEMENTS"
- **Depth indicator**: bottom-left HUD shows current depth and layer name
- **File heat nodes**: glowing dots on the cave floor represent your most-touched files

## Tips for Platinum

1. Start with Bronze — they unlock in your first session
2. Work toward Silver naturally — diverse tool usage and agent delegation
3. Set a budget early for Budget Hawk — it needs 10 sessions to accumulate
4. Thousand Cuts and Cave Dweller are patience achievements — just keep using Claude Code
5. Legendary Efficiency is the true boss — requires consistent efficiency over 1000+ tools
6. Use `Bat Cave: Export Session History` to track your progress across sessions
