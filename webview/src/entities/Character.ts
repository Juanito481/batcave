/**
 * Animated pixel character with sprite-sheet-based rendering.
 *
 * Supports: idle, walking (with BFS pathfinding), and action states.
 * Characters are drawn from procedurally generated sprite sheets.
 */

import { SpriteSheet } from "../canvas/SpriteGenerator";

export type CharacterState = "idle" | "walk" | "action" | "entering" | "exiting";

export class Character {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  private sprite: SpriteSheet;

  // World position (in pixels, not tiles).
  x: number;
  y: number;
  private targetX: number;
  private targetY: number;

  // Animation state.
  state: CharacterState = "idle";
  private currentAnim = "idle";
  private frameIndex = 0;
  private frameTimer = 0;
  private flipped = false;

  // Movement.
  private speed = 0.03; // pixels per ms
  private waypoints: { x: number; y: number }[] = [];

  // Lifecycle.
  visible = true;
  opacity = 1;
  private enterTimer = 0;
  private exitTimer = 0;

  constructor(
    id: string,
    name: string,
    emoji: string,
    sprite: SpriteSheet,
    x: number,
    y: number
  ) {
    this.id = id;
    this.name = name;
    this.emoji = emoji;
    this.sprite = sprite;
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
  }

  /** Start the enter animation (fade in from bottom). */
  enter(targetX: number, targetY: number): void {
    this.state = "entering";
    this.opacity = 0;
    this.enterTimer = 0;
    this.y = targetY + 40;
    this.targetX = targetX;
    this.targetY = targetY;
    this.visible = true;
  }

  /** Start the exit animation (fade out downward). */
  exit(): void {
    this.state = "exiting";
    this.exitTimer = 0;
  }

  /** Move toward a target position (direct line). */
  moveTo(tx: number, ty: number): void {
    this.waypoints = [];
    this.targetX = tx;
    this.targetY = ty;
    this.state = "walk";
  }

  /** Move following a list of waypoints (from pathfinder). */
  moveAlongPath(waypoints: { x: number; y: number }[]): void {
    if (waypoints.length === 0) return;
    this.waypoints = waypoints.slice();
    const first = this.waypoints.shift()!;
    this.targetX = first.x;
    this.targetY = first.y;
    this.state = "walk";
  }

  /** Set to action state (typing/working). */
  setAction(): void {
    this.state = "action";
    this.currentAnim = "action";
    this.frameIndex = 0;
  }

  /** Set to idle state. */
  setIdle(): void {
    this.state = "idle";
    this.currentAnim = "idle";
    this.frameIndex = 0;
  }

  update(deltaMs: number): void {
    // Handle enter animation.
    if (this.state === "entering") {
      this.enterTimer += deltaMs;
      const progress = Math.min(1, this.enterTimer / 600);
      this.opacity = progress;
      this.y = this.targetY + 40 * (1 - easeOutBack(progress));
      this.x += (this.targetX - this.x) * 0.05;
      if (progress >= 1) {
        this.state = "idle";
        this.opacity = 1;
        this.x = this.targetX;
        this.y = this.targetY;
      }
      return;
    }

    // Handle exit animation.
    if (this.state === "exiting") {
      this.exitTimer += deltaMs;
      const progress = Math.min(1, this.exitTimer / 400);
      this.opacity = 1 - progress;
      this.y += deltaMs * 0.05;
      if (progress >= 1) {
        this.visible = false;
      }
      return;
    }

    // Handle walking (with waypoint support).
    if (this.state === "walk") {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2) {
        this.x = this.targetX;
        this.y = this.targetY;
        // Advance to next waypoint if available.
        if (this.waypoints.length > 0) {
          const next = this.waypoints.shift()!;
          this.targetX = next.x;
          this.targetY = next.y;
        } else {
          this.state = "idle";
          this.currentAnim = "idle";
        }
      } else {
        const step = this.speed * deltaMs;
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        this.flipped = dx < 0;
        // Choose animation based on dominant movement direction.
        if (Math.abs(dx) > Math.abs(dy)) {
          this.currentAnim = "walk-side";
        } else if (dy < 0) {
          this.currentAnim = "walk-up";
        } else {
          this.currentAnim = "walk-down";
        }
      }
    }

    // Advance animation frame.
    const anim = this.sprite.animations[this.currentAnim];
    if (anim) {
      this.frameTimer += deltaMs;
      if (this.frameTimer >= anim.speed) {
        this.frameTimer -= anim.speed;
        this.frameIndex = (this.frameIndex + 1) % anim.frames;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, zoom: number): void {
    if (!this.visible) return;

    const anim = this.sprite.animations[this.currentAnim];
    if (!anim) return;

    const sw = this.sprite.frameWidth;
    const sh = this.sprite.frameHeight;
    const sx = this.frameIndex * sw;
    const sy = anim.row * sh;

    const dw = sw * zoom;
    const dh = sh * zoom;
    const dx = this.x - dw / 2;
    const dy = this.y - dh;

    ctx.save();
    ctx.globalAlpha = this.opacity;

    // Ground shadow — stays at ground level (targetY) even during enter/exit animations.
    const sz = Math.max(1, zoom);
    const cx = Math.floor(this.x);
    const groundY = Math.floor(this.state === "entering" ? this.targetY : this.y);
    // Outer ring (wider, dimmer).
    ctx.fillStyle = "#0a0816";
    ctx.fillRect(cx - sz * 5, groundY, sz * 10, sz);
    ctx.fillRect(cx - sz * 4, groundY - sz, sz * 8, sz);
    ctx.fillRect(cx - sz * 4, groundY + sz, sz * 8, sz);
    // Inner core (narrower, darker).
    ctx.fillStyle = "#06040e";
    ctx.fillRect(cx - sz * 3, groundY, sz * 6, sz);

    // Sprite.
    if (this.flipped) {
      ctx.save();
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(this.sprite.canvas, sx, sy, sw, sh, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(this.sprite.canvas, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    // Name label.
    ctx.fillStyle = "#8888AA";
    ctx.font = `${Math.max(8, zoom * 3.5)}px "DM Mono", monospace`;
    ctx.textAlign = "center";
    ctx.fillText(this.name, this.x, this.y + zoom * 4);

    ctx.restore();
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
