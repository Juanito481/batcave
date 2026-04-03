import { Renderer } from "./Renderer";

/** Fixed-timestep game loop with delta-time clamping. */
export class GameLoop {
  private renderer: Renderer;
  private animFrameId: number | null = null;
  private lastTime = 0;
  private running = false;

  /** Maximum delta to prevent spiral of death (e.g., tab was backgrounded). */
  private static readonly MAX_DELTA_MS = 100;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.tick(this.lastTime);
  }

  stop(): void {
    this.running = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private tick = (now: number): void => {
    if (!this.running) return;

    const rawDelta = now - this.lastTime;
    const delta = Math.min(rawDelta, GameLoop.MAX_DELTA_MS);
    this.lastTime = now;

    this.renderer.update(delta);
    this.renderer.render();

    this.animFrameId = requestAnimationFrame(this.tick);
  };
}
