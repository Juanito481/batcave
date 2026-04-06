/**
 * Achievement & Gamification system — unlockable trophies, cave depth, mastery tracking.
 *
 * Achievements are checked every time stats update. Once unlocked, they persist
 * across sessions via VSCode globalState. Each achievement maps to a pixel art
 * trophy rendered on the cave wall.
 */

export type AchievementIcon = "crystal" | "chess" | "owl" | "hawk" | "bolt" | "scroll" | "gem" | "crown" | "shield" | "flame";
export type AchievementTier = "bronze" | "silver" | "gold" | "legendary";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: AchievementIcon;
  tier: AchievementTier;
  check: (ctx: AchievementContext) => boolean;
  progress?: (ctx: AchievementContext) => number;  // 0-1 for progress bar on locked
  hint?: string;
}

export interface AchievementContext {
  sessionMessages: number;
  sessionToolCalls: number;
  sessionAgentsSpawned: number;
  contextPeakPct: number;
  durationMs: number;
  toolBreakdown: { read: number; write: number; bash: number; web: number; agent: number; other: number };
  uniqueAgentIds: string[];
  toolsPerMin: number;
  totalToolsCumulative: number;
  totalSessionsCumulative: number;
  isNightSession: boolean;       // started between 22:00-05:00
  filesCount: number;
  currentHour: number;           // 0-23
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: number;   // epoch ms
  sessionId: string;
}

// ── Achievement definitions ─────────────────────────────

export const ACHIEVEMENTS: Achievement[] = [
  // Bronze tier — welcome to the cave.
  {
    id: "first-blood",
    name: "First Blood",
    description: "Complete your first tool call",
    icon: "crystal",
    tier: "bronze",
    check: (c) => c.sessionToolCalls >= 1,
    progress: (c) => Math.min(1, c.sessionToolCalls / 1),
    hint: "Make your first tool call",
  },
  {
    id: "agent-summoner",
    name: "Agent Summoner",
    description: "Summon your first agent",
    icon: "scroll",
    tier: "bronze",
    check: (c) => c.sessionAgentsSpawned >= 1,
    progress: (c) => Math.min(1, c.sessionAgentsSpawned / 1),
    hint: "Summon any Scacchiera agent",
  },
  {
    id: "night-owl",
    name: "Night Owl",
    description: "Code past midnight with 100+ tools",
    icon: "owl",
    tier: "bronze",
    check: (c) => c.isNightSession && c.sessionToolCalls >= 100,
    progress: (c) => c.isNightSession ? Math.min(1, c.sessionToolCalls / 100) : 0,
    hint: "Start a session between 22:00-05:00 and use 100+ tools",
  },

  // Silver tier — you know what you're doing.
  {
    id: "context-master",
    name: "Context Master",
    description: "200+ tools, peak context under 50%",
    icon: "gem",
    tier: "silver",
    check: (c) => c.sessionToolCalls >= 200 && c.contextPeakPct < 50,
    progress: (c) => c.contextPeakPct < 50 ? Math.min(1, c.sessionToolCalls / 200) : 0,
    hint: "Use 200+ tools while keeping context under 50%",
  },
  {
    id: "full-board",
    name: "Full Board",
    description: "Summon all 13 Scacchiera agents in one session",
    icon: "chess",
    tier: "silver",
    check: (c) => c.uniqueAgentIds.length >= 13,
    progress: (c) => Math.min(1, c.uniqueAgentIds.length / 13),
    hint: "Summon all 13 Scacchiera agents in one session",
  },
  {
    id: "speed-demon",
    name: "Speed Demon",
    description: "Sustain 15+ tools/min with 50+ total",
    icon: "bolt",
    tier: "silver",
    check: (c) => c.toolsPerMin >= 15 && c.sessionToolCalls >= 50,
    progress: (c) => Math.min(1, c.sessionToolCalls / 50) * 0.5 + Math.min(1, c.toolsPerMin / 15) * 0.5,
    hint: "Reach 15+ tools/min pace with 50+ total tools",
  },
  {
    id: "polyglot",
    name: "Polyglot",
    description: "Use every tool category in one session",
    icon: "scroll",
    tier: "silver",
    check: (c) => c.toolBreakdown.read > 0 && c.toolBreakdown.write > 0 &&
      c.toolBreakdown.bash > 0 && c.toolBreakdown.web > 0 && c.toolBreakdown.agent > 0,
    progress: (c) => {
      const cats = [c.toolBreakdown.read, c.toolBreakdown.write, c.toolBreakdown.bash, c.toolBreakdown.web, c.toolBreakdown.agent];
      return cats.filter(v => v > 0).length / 5;
    },
    hint: "Use all 5 tool categories: read, write, bash, web, agent",
  },

  // Gold tier — Batman-level mastery.
  {
    id: "marathon",
    name: "Marathon",
    description: "4+ hour session without losing focus",
    icon: "shield",
    tier: "gold",
    check: (c) => c.durationMs >= 4 * 60 * 60 * 1000 && c.sessionToolCalls >= 100,
    progress: (c) => Math.min(1, c.durationMs / (4 * 60 * 60 * 1000)) * 0.7 + Math.min(1, c.sessionToolCalls / 100) * 0.3,
    hint: "Run a 4+ hour session with 100+ tools",
  },
  {
    id: "thousand-cuts",
    name: "Thousand Cuts",
    description: "1000 cumulative tool calls across all sessions",
    icon: "shield",
    tier: "gold",
    check: (c) => c.totalToolsCumulative >= 1000,
    progress: (c) => Math.min(1, c.totalToolsCumulative / 1000),
    hint: "Keep using tools across sessions — 1000 total",
  },
  {
    id: "file-surgeon",
    name: "File Surgeon",
    description: "Touch 50+ files in one session",
    icon: "gem",
    tier: "gold",
    check: (c) => c.filesCount >= 50,
    progress: (c) => Math.min(1, c.filesCount / 50),
    hint: "Touch 50+ unique files in one session",
  },

  // Legendary tier — you ARE the night.
  {
    id: "gotham-needs-me",
    name: "Gotham Needs Me",
    description: "500+ tool calls in a single session",
    icon: "flame",
    tier: "legendary",
    check: (c) => c.sessionToolCalls >= 500,
    progress: (c) => Math.min(1, c.sessionToolCalls / 500),
    hint: "Use 500+ tools in a single session",
  },
  {
    id: "cave-dweller",
    name: "Cave Dweller",
    description: "Complete 50 sessions in the Bat Cave",
    icon: "crown",
    tier: "legendary",
    check: (c) => c.totalSessionsCumulative >= 50,
    progress: (c) => Math.min(1, c.totalSessionsCumulative / 50),
    hint: "Complete 50 sessions total",
  },
  {
    id: "the-dark-knight",
    name: "The Dark Knight",
    description: "Start after midnight, still going at dawn",
    icon: "hawk",
    tier: "legendary",
    check: (c) => c.isNightSession && c.currentHour >= 5 && c.durationMs >= 3 * 60 * 60 * 1000,
    progress: (c) => c.isNightSession ? Math.min(1, c.durationMs / (3 * 60 * 60 * 1000)) : 0,
    hint: "Start after midnight, keep going until dawn (3+ hours)",
  },
];

// ── Cave Depth Layers ───────────────────────────────────

export interface CaveDepthLayer {
  depth: number;        // 1-4
  name: string;
  requirement: string;  // human description
  check: (ctx: AchievementContext) => boolean;
  palette: {
    bg: string;
    floorA: string;
    floorB: string;
    wallEdge: string;
    accent: string;
  };
}

export const CAVE_DEPTHS: CaveDepthLayer[] = [
  {
    depth: 1, name: "The Surface", requirement: "Starting layer",
    check: () => true,
    palette: { bg: "#101820", floorA: "#151c24", floorB: "#161d25", wallEdge: "#1e2830", accent: "#1E7FD8" },
  },
  {
    depth: 2, name: "The Workshop", requirement: "Use all tool categories",
    check: (c) => c.toolBreakdown.read > 0 && c.toolBreakdown.write > 0 && c.toolBreakdown.bash > 0,
    palette: { bg: "#0c1418", floorA: "#121a20", floorB: "#141c22", wallEdge: "#1a2430", accent: "#2ECC71" },
  },
  {
    depth: 3, name: "The Vault", requirement: "Avg efficiency >5 across 10+ sessions",
    check: (c) => c.totalSessionsCumulative >= 10 && c.toolsPerMin >= 5,
    palette: { bg: "#0a1014", floorA: "#10181e", floorB: "#121a20", wallEdge: "#182028", accent: "#9B59B6" },
  },
  {
    depth: 4, name: "The Abyss", requirement: "1000+ tools, 50+ sessions",
    check: (c) => c.totalToolsCumulative >= 1000 && c.totalSessionsCumulative >= 50,
    palette: { bg: "#060c10", floorA: "#0c1418", floorB: "#0e161a", wallEdge: "#141e26", accent: "#E74C3C" },
  },
];

// ── Smart Alert Definitions ─────────────────────────────

export type AlertSeverity = "info" | "warning" | "critical";

export interface SmartAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  timestamp: number;
  dismissed: boolean;
}

// ── Shared Achievement Visual Constants ─────────────────

export const TIER_COLORS: Record<AchievementTier, string> = {
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#FFD700",
  legendary: "#E74C3C",
};

export const ICON_PIXELS: Record<AchievementIcon, number[][]> = {
  crystal: [[1,0],[0,1],[2,1],[1,2],[0,2],[2,2],[1,3]],
  chess:   [[0,0],[2,0],[0,1],[1,1],[2,1],[1,2],[0,3],[1,3],[2,3]],
  owl:     [[0,0],[2,0],[0,1],[1,1],[2,1],[0,2],[2,2],[1,3]],
  hawk:    [[1,0],[0,1],[1,1],[2,1],[0,2],[2,2],[0,3],[2,3]],
  bolt:    [[1,0],[2,0],[0,1],[1,1],[1,2],[2,2],[0,3],[1,3]],
  scroll:  [[0,0],[1,0],[2,0],[0,1],[0,2],[1,2],[2,2],[2,3]],
  gem:     [[1,0],[0,1],[2,1],[0,2],[2,2],[1,3]],
  crown:   [[0,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]],
  shield:  [[0,0],[1,0],[2,0],[0,1],[2,1],[0,2],[2,2],[1,3]],
  flame:   [[1,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2],[1,3]],
};

// ── Workspace File Node ─────────────────────────────────

export interface FileNode {
  path: string;       // full path
  name: string;       // basename
  hitCount: number;   // times touched this session
  lastTool: string;   // last tool used on it
  lastTimestamp: number;
  category: "read" | "write" | "bash" | "other";
}
