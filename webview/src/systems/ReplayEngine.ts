/**
 * ReplayEngine — plays back a session from audit trail entries.
 *
 * Instead of storing full frame snapshots, we replay by re-emitting
 * audit entries in chronological order at the correct relative time.
 * The BatCave world processes these events exactly as it did live.
 *
 * Supports: play, pause, seek (scrub), speed control (0.5x–8x).
 */

import { AuditEntry } from "../world/BatCave";
import { bus } from "./EventBus";

export type ReplayState = "stopped" | "playing" | "paused";

export interface ReplaySnapshot {
  /** Playback position in ms (relative to session start). */
  positionMs: number;
  /** Total duration of the recorded session in ms. */
  durationMs: number;
  /** Progress 0–1. */
  progress: number;
  /** Current playback state. */
  state: ReplayState;
  /** Playback speed multiplier. */
  speed: number;
  /** Index of the next entry to emit. */
  cursor: number;
  /** Total entries in the recording. */
  totalEntries: number;
  /** Current entry detail (for HUD display). */
  currentDetail: string | null;
  /** Current entry category. */
  currentCategory: string | null;
}

export class ReplayEngine {
  private entries: AuditEntry[] = [];
  private state: ReplayState = "stopped";
  private speed = 1;
  private startTimestamp = 0;   // Absolute timestamp of first entry.
  private endTimestamp = 0;     // Absolute timestamp of last entry.
  private positionMs = 0;       // Current playback position (relative).
  private cursor = 0;           // Next entry index to emit.
  private currentDetail: string | null = null;
  private currentCategory: string | null = null;

  /** Load a recording from audit trail entries. */
  load(entries: readonly AuditEntry[]): void {
    this.entries = [...entries].sort((a, b) => a.timestamp - b.timestamp);
    if (this.entries.length > 0) {
      this.startTimestamp = this.entries[0].timestamp;
      this.endTimestamp = this.entries[this.entries.length - 1].timestamp;
    } else {
      this.startTimestamp = 0;
      this.endTimestamp = 0;
    }
    this.positionMs = 0;
    this.cursor = 0;
    this.state = "paused";
    this.currentDetail = null;
    this.currentCategory = null;
    bus.emit("replay:loaded", { entries: this.entries.length, durationMs: this.getDurationMs() });
  }

  /** Start or resume playback. */
  play(): void {
    if (this.entries.length === 0) return;
    this.state = "playing";
    bus.emit("replay:state", { state: "playing" });
  }

  /** Pause playback. */
  pause(): void {
    this.state = "paused";
    bus.emit("replay:state", { state: "paused" });
  }

  /** Stop playback and reset to beginning. */
  stop(): void {
    this.state = "stopped";
    this.positionMs = 0;
    this.cursor = 0;
    this.currentDetail = null;
    this.currentCategory = null;
    bus.emit("replay:state", { state: "stopped" });
  }

  /** Seek to a position (0–1 progress). */
  seek(progress: number): void {
    const clamped = Math.max(0, Math.min(1, progress));
    this.positionMs = clamped * this.getDurationMs();
    // Find the cursor position for this time.
    const targetTs = this.startTimestamp + this.positionMs;
    this.cursor = 0;
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].timestamp > targetTs) break;
      this.cursor = i + 1;
    }
    // Emit all entries up to this point as a batch (for world state reconstruction).
    bus.emit("replay:seek", { cursor: this.cursor, positionMs: this.positionMs });
  }

  /** Set playback speed (0.5x – 8x). */
  setSpeed(speed: number): void {
    this.speed = Math.max(0.5, Math.min(8, speed));
  }

  /** Cycle speed: 1x → 2x → 4x → 8x → 0.5x → 1x. */
  cycleSpeed(): void {
    const speeds = [0.5, 1, 2, 4, 8];
    const idx = speeds.indexOf(this.speed);
    this.speed = speeds[(idx + 1) % speeds.length];
  }

  /** Advance the replay by deltaMs of real time. Called from game loop. */
  update(deltaMs: number): AuditEntry[] {
    if (this.state !== "playing" || this.entries.length === 0) return [];

    const replayDelta = deltaMs * this.speed;
    this.positionMs += replayDelta;

    const targetTs = this.startTimestamp + this.positionMs;
    const emitted: AuditEntry[] = [];

    // Emit all entries whose timestamp we've passed.
    while (this.cursor < this.entries.length && this.entries[this.cursor].timestamp <= targetTs) {
      const entry = this.entries[this.cursor];
      emitted.push(entry);
      this.currentDetail = entry.detail;
      this.currentCategory = entry.category;
      this.cursor++;
    }

    // Reached the end?
    if (this.cursor >= this.entries.length) {
      this.state = "paused";
      this.positionMs = this.getDurationMs();
      bus.emit("replay:ended", {});
    }

    return emitted;
  }

  /** Get a snapshot of the current replay state for HUD rendering. */
  getSnapshot(): ReplaySnapshot {
    const durationMs = this.getDurationMs();
    return {
      positionMs: this.positionMs,
      durationMs,
      progress: durationMs > 0 ? this.positionMs / durationMs : 0,
      state: this.state,
      speed: this.speed,
      cursor: this.cursor,
      totalEntries: this.entries.length,
      currentDetail: this.currentDetail,
      currentCategory: this.currentCategory,
    };
  }

  isActive(): boolean {
    return this.state !== "stopped";
  }

  getState(): ReplayState {
    return this.state;
  }

  /** Get all entries up to cursor (for world state reconstruction on seek). */
  getEntriesUpToCursor(): AuditEntry[] {
    return this.entries.slice(0, this.cursor);
  }

  /** Get all loaded entries. */
  getAllEntries(): readonly AuditEntry[] {
    return this.entries;
  }

  private getDurationMs(): number {
    return Math.max(1, this.endTimestamp - this.startTimestamp);
  }
}
