/**
 * CaveReactionSystem — event-driven environmental reactions.
 *
 * The cave breathes with your work. Commits flash green on the walls,
 * pushes trigger sparks at the entrance, achievements shake the stalactites,
 * and agent arrivals boost the torches.
 *
 * All state is read by CaveLayer and FurnitureLayer via RenderContext.
 */

import { bus } from "./EventBus";

export interface CaveReactionState {
  /** Wall LED flash color (null = no flash). */
  wallFlashColor: string | null;
  wallFlashTimer: number;
  /** Server rack glow boost (during Bash tools). */
  serverGlow: boolean;
  /** Workbench spark (during Bishop/Cardinal activity). */
  workbenchSpark: boolean;
  /** Cave shake offset in pixels (achievement unlock). */
  shakeOffset: number;
  /** Torch intensity boost multiplier (1.0 = normal, up to 2.0). */
  torchBoost: number;
}

export class CaveReactionSystem {
  private state: CaveReactionState = {
    wallFlashColor: null,
    wallFlashTimer: 0,
    serverGlow: false,
    workbenchSpark: false,
    shakeOffset: 0,
    torchBoost: 1.0,
  };

  private shakeTimer = 0;
  private torchBoostTimer = 0;
  private serverGlowTimer = 0;
  private workbenchSparkTimer = 0;

  constructor() {
    // Git events → wall flash.
    bus.on("sound:play", ({ id }) => {
      // Piggyback on existing milestone sound for achievement shake.
      if (id === "milestone") {
        this.triggerShake();
      }
    });
  }

  // ── Triggers (called by BatCave event handlers) ─────

  /** Git commit → green wall flash for 3 seconds. */
  triggerCommitFlash(): void {
    this.state.wallFlashColor = "#2ECC71";
    this.state.wallFlashTimer = 3000;
  }

  /** Git push → blue wall flash + sparks (handled by Ambient). */
  triggerPushFlash(): void {
    this.state.wallFlashColor = "#1E7FD8";
    this.state.wallFlashTimer = 2000;
  }

  /** Bash tool active → server rack glow. */
  triggerServerGlow(): void {
    this.state.serverGlow = true;
    this.serverGlowTimer = 2000;
  }

  /** Bishop or Cardinal active → workbench sparks. */
  triggerWorkbenchSpark(): void {
    this.state.workbenchSpark = true;
    this.workbenchSparkTimer = 3000;
  }

  /** Achievement unlock → cave shake 2px for 500ms. */
  triggerShake(): void {
    this.shakeTimer = 500;
  }

  /** Agent enters → torch boost for 3 seconds. */
  triggerTorchBoost(): void {
    this.state.torchBoost = 1.8;
    this.torchBoostTimer = 3000;
  }

  // ── Update ──────────────────────────────────────────

  /**
   * Tick all reaction timers.
   *
   * @param dt - Delta time in milliseconds.
   */
  update(dt: number): void {
    // Wall flash decay.
    if (this.state.wallFlashTimer > 0) {
      this.state.wallFlashTimer -= dt;
      if (this.state.wallFlashTimer <= 0) {
        this.state.wallFlashColor = null;
      }
    }

    // Server glow decay.
    if (this.serverGlowTimer > 0) {
      this.serverGlowTimer -= dt;
      if (this.serverGlowTimer <= 0) {
        this.state.serverGlow = false;
      }
    }

    // Workbench spark decay.
    if (this.workbenchSparkTimer > 0) {
      this.workbenchSparkTimer -= dt;
      if (this.workbenchSparkTimer <= 0) {
        this.state.workbenchSpark = false;
      }
    }

    // Cave shake decay.
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      // Oscillate 2px shake.
      this.state.shakeOffset = Math.round(Math.sin(this.shakeTimer * 0.05) * 2);
      if (this.shakeTimer <= 0) {
        this.state.shakeOffset = 0;
      }
    }

    // Torch boost decay (ease back to 1.0).
    if (this.torchBoostTimer > 0) {
      this.torchBoostTimer -= dt;
      const t = Math.max(0, this.torchBoostTimer / 3000);
      this.state.torchBoost = 1.0 + 0.8 * t;
    }
  }

  /** Get current reaction state for rendering layers. */
  getState(): Readonly<CaveReactionState> {
    return this.state;
  }
}
