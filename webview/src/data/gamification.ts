/**
 * Achievement & Gamification system — unlockable trophies, cave depth, mastery tracking.
 *
 * Achievements are checked every time stats update. Once unlocked, they persist
 * across sessions via VSCode globalState. Each achievement maps to a pixel art
 * trophy rendered on the cave wall.
 */

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: "crystal" | "chess" | "owl" | "hawk" | "bolt" | "scroll" | "gem" | "crown" | "shield" | "flame";
  tier: "bronze" | "silver" | "gold" | "legendary";
  check: (ctx: AchievementContext) => boolean;
}

export interface AchievementContext {
  sessionMessages: number;
  sessionToolCalls: number;
  sessionAgentsSpawned: number;
  contextPeakPct: number;
  costUsd: number;
  costBudget: number;
  durationMs: number;
  toolBreakdown: { read: number; write: number; bash: number; web: number; agent: number; other: number };
  uniqueAgentIds: string[];
  toolsPerMin: number;
  sessionsUnderBudget: number;   // cumulative across sessions
  totalToolsCumulative: number;
  totalSessionsCumulative: number;
  isNightSession: boolean;       // started between 22:00-05:00
  filesCount: number;
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: number;   // epoch ms
  sessionId: string;
}

// ── Achievement definitions ─────────────────────────────

export const ACHIEVEMENTS: Achievement[] = [
  // Bronze tier — beginner milestones.
  {
    id: "first-blood",
    name: "First Blood",
    description: "Complete your first tool call",
    icon: "crystal",
    tier: "bronze",
    check: (c) => c.sessionToolCalls >= 1,
  },
  {
    id: "agent-summoner",
    name: "Agent Summoner",
    description: "Summon your first agent",
    icon: "scroll",
    tier: "bronze",
    check: (c) => c.sessionAgentsSpawned >= 1,
  },
  {
    id: "night-owl",
    name: "Night Owl",
    description: "Run a session after midnight with 100+ tools",
    icon: "owl",
    tier: "bronze",
    check: (c) => c.isNightSession && c.sessionToolCalls >= 100,
  },

  // Silver tier — skill milestones.
  {
    id: "context-master",
    name: "Context Master",
    description: "Complete a 200+ tool session under 50% context",
    icon: "gem",
    tier: "silver",
    check: (c) => c.sessionToolCalls >= 200 && c.contextPeakPct < 50,
  },
  {
    id: "full-board",
    name: "Full Board",
    description: "Summon all 13 agents in one session",
    icon: "chess",
    tier: "silver",
    check: (c) => c.uniqueAgentIds.length >= 13,
  },
  {
    id: "speed-demon",
    name: "Speed Demon",
    description: "Sustain 15+ tools/min for a session",
    icon: "bolt",
    tier: "silver",
    check: (c) => c.toolsPerMin >= 15 && c.sessionToolCalls >= 50,
  },
  {
    id: "polyglot",
    name: "Polyglot",
    description: "Use all tool categories in one session",
    icon: "scroll",
    tier: "silver",
    check: (c) => c.toolBreakdown.read > 0 && c.toolBreakdown.write > 0 &&
      c.toolBreakdown.bash > 0 && c.toolBreakdown.web > 0 && c.toolBreakdown.agent > 0,
  },

  // Gold tier — mastery milestones.
  {
    id: "budget-hawk",
    name: "Budget Hawk",
    description: "Stay under budget for 10 sessions",
    icon: "hawk",
    tier: "gold",
    check: (c) => c.sessionsUnderBudget >= 10,
  },
  {
    id: "thousand-cuts",
    name: "Thousand Cuts",
    description: "Reach 1000 cumulative tool calls",
    icon: "shield",
    tier: "gold",
    check: (c) => c.totalToolsCumulative >= 1000,
  },
  {
    id: "file-surgeon",
    name: "File Surgeon",
    description: "Touch 50+ files in one session",
    icon: "gem",
    tier: "gold",
    check: (c) => c.filesCount >= 50,
  },

  // Legendary tier — extreme mastery.
  {
    id: "legendary-efficiency",
    name: "Legendary Efficiency",
    description: "1000+ tools cumulative, under $10 total cost",
    icon: "crown",
    tier: "legendary",
    check: (c) => c.totalToolsCumulative >= 1000 && c.costUsd < 10,
  },
  {
    id: "cave-dweller",
    name: "Cave Dweller",
    description: "Complete 50 sessions",
    icon: "flame",
    tier: "legendary",
    check: (c) => c.totalSessionsCumulative >= 50,
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
    palette: { bg: "#0a0a12", floorA: "#13131e", floorB: "#161624", wallEdge: "#1e1e2e", accent: "#1E7FD8" },
  },
  {
    depth: 2, name: "The Workshop", requirement: "Use all tool categories",
    check: (c) => c.toolBreakdown.read > 0 && c.toolBreakdown.write > 0 && c.toolBreakdown.bash > 0,
    palette: { bg: "#08080e", floorA: "#101018", floorB: "#12121e", wallEdge: "#1a1a28", accent: "#2ECC71" },
  },
  {
    depth: 3, name: "The Vault", requirement: "Avg efficiency >5 across 10+ sessions",
    check: (c) => c.totalSessionsCumulative >= 10 && c.toolsPerMin >= 5,
    palette: { bg: "#060610", floorA: "#0e0e1a", floorB: "#10101e", wallEdge: "#181828", accent: "#9B59B6" },
  },
  {
    depth: 4, name: "The Abyss", requirement: "1000+ tools, <$10 total",
    check: (c) => c.totalToolsCumulative >= 1000 && c.costUsd < 10,
    palette: { bg: "#040408", floorA: "#0a0a14", floorB: "#0c0c18", wallEdge: "#141422", accent: "#E74C3C" },
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

// ── Workspace File Node ─────────────────────────────────

export interface FileNode {
  path: string;       // full path
  name: string;       // basename
  hitCount: number;   // times touched this session
  lastTool: string;   // last tool used on it
  lastTimestamp: number;
  category: "read" | "write" | "bash" | "other";
}
