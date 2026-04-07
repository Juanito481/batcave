/**
 * ProgressionSystem — XP, levels, and cave upgrades.
 *
 * Every tool call earns XP. XP unlocks cave decorations permanently.
 * The level never resets — it's your lifetime Batcave mastery score.
 *
 * XP values: Read=1, Edit=3, Bash=2, Agent=5, Commit=10, Push=5
 * Level curve: exponential, so early levels are fast and late levels are slow.
 */

import { bus } from "./EventBus";

// ── XP per action ──────────────────────────────────────

const XP_TABLE: Record<string, number> = {
  Read: 1,
  Grep: 1,
  Glob: 1,
  Edit: 3,
  Write: 3,
  NotebookEdit: 3,
  Bash: 2,
  Agent: 5,
  Skill: 5,
  WebSearch: 2,
  WebFetch: 2,
  commit: 10,
  push: 5,
};

// ── Level thresholds (exponential curve) ───────────────

const MAX_LEVEL = 50;

/** XP required to reach each level (index = level, value = cumulative XP). */
function xpForLevel(level: number): number {
  // Curve: 20 * level^1.8 — fast early, slow late.
  return Math.floor(20 * Math.pow(level, 1.8));
}

// ── Cave Upgrades ──────────────────────────────────────

export interface CaveUpgrade {
  level: number;
  id: string;
  name: string;
  description: string;
}

/**
 * Decorations unlocked at each level milestone.
 * FurnitureLayer reads this to know what to render.
 */
export const CAVE_UPGRADES: CaveUpgrade[] = [
  {
    level: 3,
    id: "repo-banner",
    name: "Repo Banner",
    description: "Wall banner showing current repo name",
  },
  {
    level: 5,
    id: "glow-stalactites",
    name: "Bioluminescent Stalactites",
    description: "Stalactites glow with soft cyan pulse",
  },
  {
    level: 8,
    id: "bat-cat",
    name: "Bat-Cat",
    description: "A pixel cat sleeps on the server rack",
  },
  {
    level: 12,
    id: "wall-crystals",
    name: "Wall Crystals",
    description: "Luminous crystals embedded in the cave wall",
  },
  {
    level: 18,
    id: "trophy-case-xl",
    name: "Grand Trophy Case",
    description: "Expanded trophy display with golden frame",
  },
  {
    level: 25,
    id: "lava-cracks",
    name: "Lava Cracks",
    description: "Glowing cracks in the floor reveal magma below",
  },
  {
    level: 35,
    id: "gold-trim",
    name: "Golden Trim",
    description: "All furniture gets a golden accent border",
  },
  {
    level: 50,
    id: "legendary-cave",
    name: "Legendary Cave",
    description: "Permanent golden particles and ambient glow",
  },
];

// ── Streak System ──────────────────────────────────────

export interface StreakState {
  /** Current consecutive days with at least one session. */
  currentStreak: number;
  /** Date string (YYYY-MM-DD) of the last session. */
  lastSessionDate: string;
  /** Longest streak ever achieved. */
  longestStreak: number;
}

// ── System ─────────────────────────────────────────────

export interface ProgressionState {
  totalXp: number;
  level: number;
  /** XP earned this session (for display). */
  sessionXp: number;
  /** Unlocked upgrade IDs. */
  unlockedUpgrades: string[];
  streak: StreakState;
}

export class ProgressionSystem {
  private state: ProgressionState;
  private levelUpPopup: { level: number; name: string; timer: number } | null =
    null;
  private xpGainTimer = 0;
  private lastXpGain = 0;

  constructor() {
    this.state = {
      totalXp: 0,
      level: 1,
      sessionXp: 0,
      unlockedUpgrades: [],
      streak: {
        currentStreak: 0,
        lastSessionDate: "",
        longestStreak: 0,
      },
    };
  }

  // ── XP ──────────────────────────────────────────────

  /**
   * Award XP for a tool call or event.
   *
   * @param action - Tool name ("Read", "Edit", etc.) or event ("commit", "push").
   */
  awardXp(action: string): void {
    const xp = XP_TABLE[action] ?? 1;
    this.state.totalXp += xp;
    this.state.sessionXp += xp;
    this.lastXpGain = xp;
    this.xpGainTimer = 800;

    // Check level up.
    const newLevel = this.calculateLevel();
    if (newLevel > this.state.level) {
      this.state.level = newLevel;
      this.onLevelUp(newLevel);
    }
  }

  private calculateLevel(): number {
    for (let lv = MAX_LEVEL; lv >= 1; lv--) {
      if (this.state.totalXp >= xpForLevel(lv)) return lv;
    }
    return 1;
  }

  private onLevelUp(level: number): void {
    // Check if this level unlocks a decoration.
    const upgrade = CAVE_UPGRADES.find((u) => u.level === level);
    const name = upgrade ? upgrade.name : `Level ${level}`;

    this.levelUpPopup = { level, name, timer: 4000 };
    bus.emit("sound:play", { id: "milestone" });
    bus.emit("particle:spawn", { preset: "agent-enter", x: 0, y: 0 });

    // Track unlocked upgrades.
    if (upgrade && !this.state.unlockedUpgrades.includes(upgrade.id)) {
      this.state.unlockedUpgrades.push(upgrade.id);
    }
  }

  // ── Streak ──────────────────────────────────────────

  /** Call at session start to update the daily streak. */
  recordSessionStart(): void {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    const streak = this.state.streak;

    if (streak.lastSessionDate === today) {
      return; // Already counted today.
    }

    if (streak.lastSessionDate === yesterday) {
      streak.currentStreak++;
    } else if (streak.lastSessionDate !== today) {
      streak.currentStreak = 1;
    }

    streak.lastSessionDate = today;
    if (streak.currentStreak > streak.longestStreak) {
      streak.longestStreak = streak.currentStreak;
    }
  }

  // ── Update ──────────────────────────────────────────

  update(dt: number): void {
    if (this.xpGainTimer > 0) this.xpGainTimer -= dt;
    if (this.levelUpPopup) {
      this.levelUpPopup.timer -= dt;
      if (this.levelUpPopup.timer <= 0) this.levelUpPopup = null;
    }
  }

  // ── Getters ─────────────────────────────────────────

  getLevel(): number {
    return this.state.level;
  }

  getTotalXp(): number {
    return this.state.totalXp;
  }

  getSessionXp(): number {
    return this.state.sessionXp;
  }

  /** Progress toward next level (0-1). */
  getLevelProgress(): number {
    const currentThreshold = xpForLevel(this.state.level);
    const nextThreshold = xpForLevel(Math.min(MAX_LEVEL, this.state.level + 1));
    const range = nextThreshold - currentThreshold;
    if (range <= 0) return 1;
    return Math.min(1, (this.state.totalXp - currentThreshold) / range);
  }

  getStreak(): StreakState {
    return this.state.streak;
  }

  getLevelUpPopup(): { level: number; name: string; timer: number } | null {
    return this.levelUpPopup;
  }

  /** Check if a specific upgrade is unlocked. */
  hasUpgrade(id: string): boolean {
    return this.state.unlockedUpgrades.includes(id);
  }

  /** Get all unlocked upgrade IDs. */
  getUnlockedUpgrades(): string[] {
    return this.state.unlockedUpgrades;
  }

  /** Recent XP gain for floating "+N XP" display. */
  getRecentXpGain(): { amount: number; timer: number } | null {
    if (this.xpGainTimer > 0) {
      return { amount: this.lastXpGain, timer: this.xpGainTimer };
    }
    return null;
  }

  // ── Persistence ─────────────────────────────────────

  /** Serialize for VSCode globalState. */
  getPersistedState(): ProgressionState {
    return { ...this.state };
  }

  /** Restore from VSCode globalState. */
  restoreState(saved: Partial<ProgressionState>): void {
    if (saved.totalXp !== undefined) this.state.totalXp = saved.totalXp;
    if (saved.level !== undefined) this.state.level = saved.level;
    if (saved.unlockedUpgrades)
      this.state.unlockedUpgrades = [...saved.unlockedUpgrades];
    if (saved.streak) {
      Object.assign(this.state.streak, saved.streak);
    }
    // Recalculate level from XP (in case of mismatch).
    this.state.level = this.calculateLevel();
  }
}
