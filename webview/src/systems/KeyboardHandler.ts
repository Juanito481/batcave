/**
 * KeyboardHandler — Konami code and secret keyboard sequences.
 *
 * Listens for specific key patterns and triggers easter eggs.
 * Designed to work alongside the existing replay keyboard controls
 * in App.tsx without conflicting.
 */

import { bus } from "./EventBus";

const KONAMI_SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
];

export interface EasterEggState {
  /** Mirror cave active — inverted colors for 10 seconds. */
  mirrorCave: boolean;
  mirrorCaveTimer: number;
  /** Floor crack with eye — 5 rapid clicks on empty floor. */
  floorEyeActive: boolean;
  floorEyeTimer: number;
  floorEyeX: number;
  floorEyeY: number;
}

export class KeyboardHandler {
  private konamiProgress = 0;
  private easterEggs: EasterEggState = {
    mirrorCave: false,
    mirrorCaveTimer: 0,
    floorEyeActive: false,
    floorEyeTimer: 0,
    floorEyeX: 0,
    floorEyeY: 0,
  };

  // Rapid click tracking for floor eye easter egg.
  private rapidClickCount = 0;
  private rapidClickTimer = 0;
  private lastClickX = 0;
  private lastClickY = 0;

  private onMirrorCave: (() => void) | null = null;
  private onFloorEye: ((x: number, y: number) => void) | null = null;

  /**
   * Register callbacks for easter egg triggers.
   *
   * @param onMirror - Called when Konami code is entered.
   * @param onFloorEye - Called when 5 rapid clicks on empty floor.
   */
  setCallbacks(
    onMirror: () => void,
    onFloorEye: (x: number, y: number) => void,
  ): void {
    this.onMirrorCave = onMirror;
    this.onFloorEye = onFloorEye;
  }

  /**
   * Process a keydown event for Konami code detection.
   * Should be called from the main keyboard handler.
   */
  handleKeyDown(key: string): void {
    if (key === KONAMI_SEQUENCE[this.konamiProgress]) {
      this.konamiProgress++;
      if (this.konamiProgress >= KONAMI_SEQUENCE.length) {
        this.konamiProgress = 0;
        this.triggerMirrorCave();
      }
    } else {
      this.konamiProgress = 0;
    }
  }

  /**
   * Process a click on empty floor space.
   * 5 rapid clicks within 2 seconds triggers floor eye.
   */
  handleFloorClick(x: number, y: number): void {
    if (this.rapidClickTimer > 0) {
      this.rapidClickCount++;
      if (this.rapidClickCount >= 5) {
        this.rapidClickCount = 0;
        this.rapidClickTimer = 0;
        this.triggerFloorEye(x, y);
      }
    } else {
      this.rapidClickCount = 1;
    }
    this.rapidClickTimer = 2000;
    this.lastClickX = x;
    this.lastClickY = y;
  }

  /** Tick timers. */
  update(dt: number): void {
    if (this.rapidClickTimer > 0) {
      this.rapidClickTimer -= dt;
      if (this.rapidClickTimer <= 0) {
        this.rapidClickCount = 0;
      }
    }

    if (this.easterEggs.mirrorCave) {
      this.easterEggs.mirrorCaveTimer -= dt;
      if (this.easterEggs.mirrorCaveTimer <= 0) {
        this.easterEggs.mirrorCave = false;
      }
    }

    if (this.easterEggs.floorEyeActive) {
      this.easterEggs.floorEyeTimer -= dt;
      if (this.easterEggs.floorEyeTimer <= 0) {
        this.easterEggs.floorEyeActive = false;
      }
    }
  }

  getEasterEggState(): Readonly<EasterEggState> {
    return this.easterEggs;
  }

  // ── Triggers ────────────────────────────────────────

  private triggerMirrorCave(): void {
    this.easterEggs.mirrorCave = true;
    this.easterEggs.mirrorCaveTimer = 10000;
    bus.emit("sound:play", { id: "milestone" });
    this.onMirrorCave?.();
  }

  private triggerFloorEye(x: number, y: number): void {
    this.easterEggs.floorEyeActive = true;
    this.easterEggs.floorEyeTimer = 2000;
    this.easterEggs.floorEyeX = x;
    this.easterEggs.floorEyeY = y;
    bus.emit("sound:play", { id: "thunder" });
    this.onFloorEye?.(x, y);
  }
}
