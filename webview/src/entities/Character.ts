/**
 * Animated pixel character with sprite-sheet-based rendering.
 *
 * Supports: idle, walking (with BFS pathfinding), and action states.
 * Characters are drawn from procedurally generated sprite sheets.
 */

import { SpriteSheet } from "../canvas/SpriteGenerator";

export type CharacterState = "idle" | "walk" | "action" | "entering" | "exiting";

/** Unique idle animation style per archetype. */
export type IdleStyle = "default" | "sway" | "stomp" | "twitch" | "float" | "rigid";

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

  // Unique idle animation.
  private idleStyle: IdleStyle = "default";
  private idlePhase = Math.random() * Math.PI * 2;
  private idleTwitchTimer = 0;
  private idleTwitchFlip = false;

  // Movement.
  private speed = 0.03; // pixels per ms
  private waypoints: { x: number; y: number }[] = [];

  // Lifecycle.
  visible = true;
  opacity = 1;
  private enterTimer = 0;
  private exitTimer = 0;

  // Polish: breathing animation.
  private breathTimer = 0;
  private breathPhase = Math.random() * Math.PI * 2; // Offset per character.

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

  /** Set the idle animation style for this character's archetype. */
  setIdleStyle(style: IdleStyle): void {
    this.idleStyle = style;
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

    // Breathing animation (subtle Y offset when idle).
    this.breathTimer += deltaMs;
    this.breathPhase += deltaMs * 0.0015;
    this.idlePhase += deltaMs * 0.002;

    // Unique idle micro-animations.
    if (this.state === "idle") {
      this.idleTwitchTimer += deltaMs;
      if (this.idleStyle === "twitch" && this.idleTwitchTimer > 800 + Math.random() * 1200) {
        this.idleTwitchTimer = 0;
        this.idleTwitchFlip = !this.idleTwitchFlip;
        this.flipped = this.idleTwitchFlip;
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
    // Idle animation offsets per archetype.
    let breathOffset = 0;
    let swayOffset = 0;
    if (this.state === "idle") {
      switch (this.idleStyle) {
        case "sway": // Caped/robed — gentle lateral sway like cape/robe flowing.
          breathOffset = Math.sin(this.breathPhase) * Math.max(0.5, zoom * 0.3);
          swayOffset = Math.sin(this.breathPhase * 0.7) * Math.max(0.5, zoom * 0.5);
          break;
        case "stomp": // Armored/heavy — slow deliberate stomp (1-2 per cycle).
          breathOffset = Math.abs(Math.sin(this.idlePhase * 0.5)) < 0.12
            ? -Math.max(1, zoom * 0.6) : 0;
          break;
        case "twitch": // Glitch — jittery micro-offsets + random flips.
          breathOffset = (Math.sin(this.idlePhase * 3) > 0.85 ? -1 : 0) * zoom * 0.4;
          swayOffset = (Math.cos(this.idlePhase * 4) > 0.92 ? 1 : 0) * zoom * 0.4;
          break;
        case "float": // Hooded — slow ethereal hovering, clearly visible.
          breathOffset = Math.sin(this.breathPhase * 0.6) * Math.max(1, zoom * 0.8);
          break;
        case "rigid": // Naval/standard — subtle but alive military posture.
          breathOffset = Math.sin(this.breathPhase) * Math.max(0.3, zoom * 0.2);
          break;
        default: // Standard breathing bob.
          breathOffset = Math.sin(this.breathPhase) * Math.max(0.5, zoom * 0.3);
          break;
      }
    }
    const dx = this.x - dw / 2 + swayOffset;
    const dy = this.y - dh + breathOffset;

    ctx.save();
    ctx.globalAlpha = this.opacity;

    // Cast shadow — projected silhouette of the current animation frame.
    // Light source: top-left → shadow falls to the right and slightly forward.
    const groundY = Math.floor(this.state === "entering" ? this.targetY : this.y);
    const shadowW = dw * 1.15;
    const shadowH = dh * 0.28;
    const shadowOffX = dw * 0.18;
    const shadowX = dx + shadowOffX;
    const shadowY = groundY - shadowH * 0.4;

    ctx.save();
    ctx.globalAlpha = this.opacity * 0.55;
    if (this.flipped) {
      ctx.save();
      ctx.translate(shadowX + shadowW, shadowY);
      ctx.scale(-1, 1);
      ctx.drawImage(
        this.sprite.shadowCanvas, sx, sy, sw, sh,
        0, 0, shadowW, shadowH,
      );
      ctx.restore();
    } else {
      ctx.drawImage(
        this.sprite.shadowCanvas, sx, sy, sw, sh,
        shadowX, shadowY, shadowW, shadowH,
      );
    }
    ctx.restore();

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

    // Name label with background pill for readability.
    const labelFont = Math.max(8, zoom * 3.5);
    ctx.font = `${labelFont}px "DM Mono", monospace`;
    ctx.textAlign = "center";
    const labelW = ctx.measureText(this.name).width;
    const labelPad = zoom * 1.5;
    const labelX = this.x - labelW / 2 - labelPad;
    const labelY = this.y + zoom * 2;
    ctx.save();
    ctx.fillStyle = "#06060c";
    ctx.globalAlpha = 0.7 * this.opacity;
    ctx.fillRect(labelX, labelY, labelW + labelPad * 2, labelFont + labelPad);
    ctx.restore();
    ctx.fillStyle = "#9999BB";
    ctx.fillText(this.name, this.x, labelY + labelFont);

    ctx.restore();
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
