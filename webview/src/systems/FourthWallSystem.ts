/**
 * FourthWallSystem — the cave sees you, the cave knows you, the cave speaks to you.
 *
 * Giovanni Mirror: Batman reflects the real player's actions.
 * Alfred Fourth Wall: breaks the fourth wall with contextual awareness.
 *
 * All timers use delta-time accumulators (no setTimeout).
 */

import { Character } from "../entities/Character";
import { bus } from "./EventBus";

// ── Types ──────────────────────────────────────────────

export interface FourthWallDeps {
  getAlfred(): Character;
  getGiovanni(): Character;
  getActiveRepo(): string;
  getSessionToolCount(): number;
  getSessionDurationMs(): number;
  getTotalSessionsCumulative(): number;
  getAlfredState(): "idle" | "thinking" | "writing";
  getBatcomputerPos(): { x: number; y: number };
  getFloorY(): number;
  getZoom(): number;
}

/** One-shot messages that fire exactly once per lifetime. */
interface OneShotFlags {
  morningGreeting: boolean;
  breakSuggested: boolean;
  breakInsisted: boolean;
  selfAwareComment: boolean;
  centuryMessage: boolean;
}

// ── Giovanni Mirror ────────────────────────────────────

/**
 * Giovanni mirrors the player's real actions:
 * - Goes to Batcomputer during Edit/Write (player is coding)
 * - Walks around during Read/Grep (player is exploring)
 * - Stretches after 5 min of real idle
 * - Nods on commit, shakes head on Bash error
 */

// ── System ─────────────────────────────────────────────

export class FourthWallSystem {
  private deps: FourthWallDeps;
  private oneShots: OneShotFlags = {
    morningGreeting: false,
    breakSuggested: false,
    breakInsisted: false,
    selfAwareComment: false,
    centuryMessage: false,
  };

  // Giovanni mirror state.
  private lastToolCategory: "read" | "write" | "bash" | "agent" | "idle" =
    "idle";
  private realIdleTimer = 0;
  private giovanniAtBc = false;
  private giovanniBcTimer = 0;

  // Alfred fourth wall state.
  private sessionTimer = 0;
  private breakCheckDone = false;
  private insistCheckDone = false;
  private toolCountAtLastCheck = 0;

  // Decoupled click cooldowns — Alfred and Giovanni are independent (P2 #7).
  private alfredClickCooldown = 0;
  private giovanniClickCooldown = 0;

  // Silent-click dot bubble accumulator — shows "·" for 1.5s when cooldown active.
  private silentBubbleTimer = 0;

  // Track last bash result for head-shake.
  private lastBashFailed = false;

  constructor(deps: FourthWallDeps) {
    this.deps = deps;

    // Subscribe to relevant events.
    bus.on("tool:start", ({ toolName }) => {
      this.onToolStart(toolName);
    });
    bus.on("tool:end", ({ toolName }) => {
      this.onToolEnd(toolName);
    });
  }

  // ── Public API ──────────────────────────────────────

  /**
   * Tick the fourth wall system.
   *
   * @param dt - Delta time in milliseconds.
   */
  update(dt: number): void {
    this.sessionTimer += dt;
    this.alfredClickCooldown = Math.max(0, this.alfredClickCooldown - dt);
    this.giovanniClickCooldown = Math.max(0, this.giovanniClickCooldown - dt);
    this.silentBubbleTimer = Math.max(0, this.silentBubbleTimer - dt);
    this.updateGiovanniMirror(dt);
    this.updateAlfredFourthWall(dt);
  }

  /**
   * Handle click on Alfred — returns a contextual quip or null.
   * The caller should display this as a speech bubble.
   */
  clickAlfred(): string | null {
    if (this.alfredClickCooldown > 0) return null;
    this.alfredClickCooldown = 5000;

    const tools = this.deps.getSessionToolCount();
    const dur = this.deps.getSessionDurationMs();
    const hour = new Date().getHours();
    const state = this.deps.getAlfredState();

    // Contextual quips based on current state.
    if (tools > 400)
      return (
        "Quite the productive session, sir. " + tools + " tools and counting."
      );
    if (dur > 3 * 60 * 60 * 1000)
      return "We've been at this for hours, sir. Shall I fetch some tea?";
    if (hour >= 0 && hour < 5)
      return "The witching hour, sir. Even Batman needs sleep.";
    if (state === "writing")
      return "I see you're in the flow, sir. I'll keep the cave quiet.";
    if (state === "thinking")
      return "Take your time, sir. The best code comes from patience.";
    if (tools > 100)
      return "Over a hundred operations today. The cave hums with purpose.";
    if (tools < 5)
      return "Just getting started, sir? The cave is at your disposal.";
    return "At your service, sir. Always.";
  }

  /**
   * Handle click on Giovanni — returns stats summary or null.
   */
  /**
   * Called when Alfred is clicked but the cooldown is active.
   * Shows a brief "·" bubble for 1.5 seconds via getAlfredSilentBubble().
   */
  onSilentAlfredClick(): void {
    this.silentBubbleTimer = 1500;
  }

  /** True while the silent-click dot bubble should render. */
  getAlfredSilentBubble(): boolean {
    return this.silentBubbleTimer > 0;
  }

  clickGiovanni(): string | null {
    if (this.giovanniClickCooldown > 0) return null;
    this.giovanniClickCooldown = 5000;

    const tools = this.deps.getSessionToolCount();
    const dur = this.deps.getSessionDurationMs();
    const mins = Math.floor(dur / 60_000);

    if (tools === 0) return "Ready to begin.";
    return `${tools} tools \u00b7 ${mins}m`;
  }

  /**
   * Notify the system of a git commit.
   * Giovanni nods approvingly.
   */
  onGitCommit(): void {
    const giovanni = this.deps.getGiovanni();
    giovanni.showEmotion("check", 2000);
  }

  /**
   * Notify the system of a git push.
   * Giovanni celebrates.
   */
  onGitPush(): void {
    const giovanni = this.deps.getGiovanni();
    giovanni.showEmotion("star", 2500);
  }

  /**
   * Notify the system of a Bash error.
   * Giovanni shakes his head (flips briefly).
   */
  onBashError(): void {
    this.lastBashFailed = true;
    const giovanni = this.deps.getGiovanni();
    giovanni.showEmotion("!", 1500);
  }

  // ── Giovanni Mirror ─────────────────────────────────

  private onToolStart(toolName: string): void {
    this.realIdleTimer = 0;

    if (["Edit", "Write", "NotebookEdit"].includes(toolName)) {
      this.lastToolCategory = "write";
    } else if (["Read", "Grep", "Glob"].includes(toolName)) {
      this.lastToolCategory = "read";
    } else if (toolName === "Bash") {
      this.lastToolCategory = "bash";
    } else if (["Agent", "Skill"].includes(toolName)) {
      this.lastToolCategory = "agent";
    }
  }

  private onToolEnd(_toolName: string): void {
    // Reset bash fail flag after each tool ends.
    this.lastBashFailed = false;
  }

  private updateGiovanniMirror(dt: number): void {
    const giovanni = this.deps.getGiovanni();
    const bcPos = this.deps.getBatcomputerPos();
    const zoom = this.deps.getZoom();

    // Giovanni goes to Batcomputer when the player is writing code.
    if (this.lastToolCategory === "write" && !this.giovanniAtBc) {
      if (giovanni.state === "idle") {
        giovanni.moveTo(bcPos.x + zoom * 4, bcPos.y + zoom * 20);
        this.giovanniAtBc = true;
        this.giovanniBcTimer = 0;
      }
    }

    // Giovanni walks around when player is reading/exploring.
    if (this.lastToolCategory === "read" && this.giovanniAtBc) {
      this.giovanniBcTimer += dt;
      if (this.giovanniBcTimer > 3000) {
        const floorY = this.deps.getFloorY();
        const tx = Math.random() * 200 + 100;
        giovanni.moveTo(tx, floorY);
        this.giovanniAtBc = false;
      }
    }

    // Track real idle time — stretches after 5 minutes of no tools.
    if (this.deps.getAlfredState() === "idle") {
      this.realIdleTimer += dt;
      if (this.realIdleTimer > 5 * 60 * 1000 && giovanni.state === "idle") {
        // "Stretch" — show a yawn-like idle animation.
        giovanni.showEmotion("?", 1200);
        this.realIdleTimer = 0;
      }
    } else {
      this.realIdleTimer = 0;
    }
  }

  // ── Alfred Fourth Wall ──────────────────────────────

  private updateAlfredFourthWall(dt: number): void {
    const alfred = this.deps.getAlfred();
    const dur = this.deps.getSessionDurationMs();
    const totalSessions = this.deps.getTotalSessionsCumulative();
    const repo = this.deps.getActiveRepo().toLowerCase();

    // Morning/evening greeting — first 5 seconds of session.
    if (
      !this.oneShots.morningGreeting &&
      this.sessionTimer > 2000 &&
      this.sessionTimer < 8000
    ) {
      this.oneShots.morningGreeting = true;
      const hour = new Date().getHours();
      let greeting: string;
      if (hour >= 5 && hour < 12)
        greeting = "Good morning, sir. The cave is ready.";
      else if (hour >= 12 && hour < 18)
        greeting = "Good afternoon, sir. Shall we begin?";
      else if (hour >= 18 && hour < 22)
        greeting = "Good evening, sir. The cave awaits.";
      else greeting = "Working late again, sir? The cave never sleeps.";

      this.showAlfredQuip(alfred, greeting);
    }

    // Break suggestion after 3 hours.
    if (!this.breakCheckDone && dur > 3 * 60 * 60 * 1000) {
      this.breakCheckDone = true;
      if (!this.oneShots.breakSuggested) {
        this.oneShots.breakSuggested = true;
        this.showAlfredQuip(alfred, "Sir... perhaps a break?");
        alfred.showEmotion("?", 2000);
      }
    }

    // Insist after 3.5 hours.
    if (!this.insistCheckDone && dur > 3.5 * 60 * 60 * 1000) {
      this.insistCheckDone = true;
      if (!this.oneShots.breakInsisted) {
        this.oneShots.breakInsisted = true;
        this.showAlfredQuip(alfred, "I insist, sir. Even Batman rests.");
        alfred.showEmotion("!", 2000);
      }
    }

    // Self-aware when working on batcave repo.
    if (
      !this.oneShots.selfAwareComment &&
      repo.includes("batcave") &&
      this.sessionTimer > 10000
    ) {
      this.oneShots.selfAwareComment = true;
      this.showAlfredQuip(alfred, "Are you... improving the cave, sir?");
      alfred.showEmotion("?", 2000);
    }

    // Century message — 100 cumulative sessions, once per lifetime.
    if (!this.oneShots.centuryMessage && totalSessions >= 100) {
      this.oneShots.centuryMessage = true;
      this.showAlfredQuip(
        alfred,
        "One hundred sessions, sir. I've been honored to serve.",
      );
      alfred.showEmotion("star", 3000);
      bus.emit("particle:spawn", {
        preset: "agent-enter",
        x: alfred.x,
        y: alfred.y - 20,
      });
      bus.emit("sound:play", { id: "milestone" });
    }
  }

  private showAlfredQuip(alfred: Character, text: string): void {
    // Emit via bus so HudLayer can pick it up.
    bus.emit("sound:play", { id: "drip", volume: 0.3 });
    // Store on the character for speech bubble rendering.
    // We use a custom property that BatCave.getCurrentQuip() can read.
    (alfred as unknown as { _fourthWallQuip: string | null })._fourthWallQuip =
      text;
    // Auto-clear after 5 seconds via a counter tracked externally.
    this._quipTimer = 5000;
    this._quipTarget = alfred;
  }

  private _quipTimer = 0;
  private _quipTarget: Character | null = null;

  /**
   * Get the current fourth-wall quip for Alfred, if any.
   * Called by BatCave to integrate with the existing quip system.
   */
  getAlfredQuip(): string | null {
    if (this._quipTimer > 0 && this._quipTarget) {
      return (this._quipTarget as unknown as { _fourthWallQuip: string | null })
        ._fourthWallQuip;
    }
    return null;
  }

  /**
   * Tick the quip display timer (called from BatCave.update).
   */
  tickQuipTimer(dt: number): void {
    if (this._quipTimer > 0) {
      this._quipTimer -= dt;
      if (this._quipTimer <= 0 && this._quipTarget) {
        (
          this._quipTarget as unknown as { _fourthWallQuip: string | null }
        )._fourthWallQuip = null;
        this._quipTarget = null;
      }
    }
  }

  /** Restore one-shot flags from persisted state. */
  restoreFlags(flags: Partial<OneShotFlags>): void {
    Object.assign(this.oneShots, flags);
  }

  /** Get one-shot flags for persistence. */
  getFlags(): OneShotFlags {
    return { ...this.oneShots };
  }
}
