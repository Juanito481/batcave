/**
 * Procedural sound engine — Web Audio API oscillators.
 * No external audio files. All sounds synthesized on the fly.
 * Muted by default. User must enable via settings.
 */

import { bus } from "./EventBus";

type SoundId = "drip" | "tool-click" | "agent-chime" | "agent-exit" | "think-chime" | "write-click"
  | "spider-silk" | "rat-scurry" | "thunder" | "interaction-chime" | "milestone";

export class SoundSystem {
  private ctx: AudioContext | null = null;
  private enabled = false;
  private volume = 0.15;
  private unsub: (() => void) | null = null;

  start(): void {
    this.unsub = bus.on("sound:play", ({ id, volume }) => {
      this.play(id as SoundId, volume);
    });
  }

  stop(): void {
    this.unsub?.();
    this.unsub = null;
    this.ctx?.close();
    this.ctx = null;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  private play(id: SoundId, vol?: number): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const v = (vol ?? 1) * this.volume;

    switch (id) {
      case "drip":
        this.playTone(ctx, gain, 2000 + Math.random() * 400, "sine", 0.05, v * 0.4);
        break;
      case "tool-click":
        this.playTone(ctx, gain, 1200, "triangle", 0.04, v * 0.3);
        break;
      case "agent-chime":
        this.playChime(ctx, gain, [523, 659, 784], v * 0.25); // C5-E5-G5
        break;
      case "agent-exit":
        this.playSlide(ctx, gain, 784, 523, 0.2, v * 0.2);
        break;
      case "think-chime":
        this.playChime(ctx, gain, [523, 659], v * 0.15);
        break;
      case "write-click":
        this.playTone(ctx, gain, 3500 + Math.random() * 1000, "square", 0.01, v * 0.08);
        break;
      case "spider-silk":
        // High whisper — silk thread descending.
        this.playTone(ctx, gain, 6000 + Math.random() * 2000, "sine", 0.08, v * 0.06);
        break;
      case "rat-scurry":
        // Fast clicking — tiny feet on stone.
        for (let i = 0; i < 4; i++) {
          setTimeout(() => {
            this.playTone(ctx, gain, 4000 + Math.random() * 2000, "triangle", 0.02, v * 0.05);
          }, i * 40);
        }
        break;
      case "thunder":
        // Low rumble — distant thunder.
        this.playSlide(ctx, gain, 80, 40, 0.8, v * 0.3);
        this.playTone(ctx, gain, 60 + Math.random() * 30, "sawtooth", 0.6, v * 0.15);
        break;
      case "interaction-chime":
        // Two-note dialogue — agents talking.
        this.playChime(ctx, gain, [440, 554], v * 0.12);
        break;
      case "milestone":
        // Triumphant ascending arpeggio.
        this.playChime(ctx, gain, [523, 659, 784, 1047], v * 0.3);
        break;
    }
  }

  private playTone(
    ctx: AudioContext, gain: GainNode,
    freq: number, type: OscillatorType, duration: number, vol: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.01);
  }

  private playChime(ctx: AudioContext, gain: GainNode, notes: number[], vol: number): void {
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const noteGain = ctx.createGain();
      noteGain.connect(gain);
      const t = ctx.currentTime + i * 0.08;
      noteGain.gain.setValueAtTime(vol, t);
      noteGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(noteGain);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  }

  private playSlide(
    ctx: AudioContext, gain: GainNode,
    fromFreq: number, toFreq: number, duration: number, vol: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(fromFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(toFreq, ctx.currentTime + duration);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.01);
  }
}
