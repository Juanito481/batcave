/**
 * Animated pixel character with sprite-sheet-based rendering.
 *
 * Supports: idle, walking (with BFS pathfinding), and action states.
 * Characters are drawn from procedurally generated sprite sheets.
 */

import { SpriteSheet } from "../canvas/SpriteGenerator";

export type CharacterState =
  | "idle"
  | "walk"
  | "action"
  | "entering"
  | "exiting";

/** Unique idle animation style per archetype. */
export type IdleStyle =
  | "default"
  | "sway"
  | "stomp"
  | "twitch"
  | "float"
  | "rigid";

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

  // Emotion bubble — displayed above the character's head.
  private emotionBubble: {
    type: "!" | "?" | "check" | "star" | "heart";
    timer: number;
    duration: number;
  } | null = null;

  constructor(
    id: string,
    name: string,
    emoji: string,
    sprite: SpriteSheet,
    x: number,
    y: number,
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

  /**
   * Show a pixel-art emotion bubble above this character's head.
   *
   * @param type - Symbol to display: "!" alert, "?" curious, "check" confirm, "star" celebrate, "heart" love
   * @param durationMs - How long to show the bubble (default 1500ms)
   * @example char.showEmotion("star", 2000)
   */
  showEmotion(
    type: "!" | "?" | "check" | "star" | "heart",
    durationMs = 1500,
  ): void {
    this.emotionBubble = { type, timer: durationMs, duration: durationMs };
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

    // Decay emotion bubble timer.
    if (this.emotionBubble) {
      this.emotionBubble.timer -= deltaMs;
      if (this.emotionBubble.timer <= 0) {
        this.emotionBubble = null;
      }
    }

    // Unique idle micro-animations.
    if (this.state === "idle") {
      this.idleTwitchTimer += deltaMs;
      if (
        this.idleStyle === "twitch" &&
        this.idleTwitchTimer > 800 + Math.random() * 1200
      ) {
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
    // Idle animation offsets per archetype — snapped to integers.
    let breathOffset = 0;
    let swayOffset = 0;
    if (this.state === "idle") {
      switch (this.idleStyle) {
        case "sway": // Caped/robed — gentle lateral sway like cape/robe flowing.
          breathOffset = Math.round(
            Math.sin(this.breathPhase) * Math.max(0.5, zoom * 0.3),
          );
          swayOffset = Math.round(
            Math.sin(this.breathPhase * 0.7) * Math.max(0.5, zoom * 0.5),
          );
          break;
        case "stomp": // Armored/heavy — slow deliberate stomp (1-2 per cycle).
          breathOffset =
            Math.abs(Math.sin(this.idlePhase * 0.5)) < 0.12
              ? -Math.max(1, Math.round(zoom * 0.6))
              : 0;
          break;
        case "twitch": // Glitch — jittery micro-offsets + random flips.
          breathOffset =
            (Math.sin(this.idlePhase * 3) > 0.85 ? -1 : 0) *
            Math.round(zoom * 0.4);
          swayOffset =
            (Math.cos(this.idlePhase * 4) > 0.92 ? 1 : 0) *
            Math.round(zoom * 0.4);
          break;
        case "float": // Hooded — slow ethereal hovering, clearly visible.
          breathOffset = Math.round(
            Math.sin(this.breathPhase * 0.6) * Math.max(1, zoom * 0.8),
          );
          break;
        case "rigid": // Naval/standard — subtle but alive military posture.
          breathOffset = Math.round(
            Math.sin(this.breathPhase) * Math.max(0.3, zoom * 0.2),
          );
          break;
        default: // Standard breathing bob.
          breathOffset = Math.round(
            Math.sin(this.breathPhase) * Math.max(0.5, zoom * 0.3),
          );
          break;
      }
    }
    // Snap all draw coordinates to integer pixels — eliminates sub-pixel blur/tremor.
    const dx = Math.round(this.x - dw / 2) + swayOffset;
    const dy = Math.round(this.y - dh) + breathOffset;
    const groundY = Math.round(
      this.state === "entering" ? this.targetY : this.y,
    );

    ctx.save();
    ctx.globalAlpha = this.opacity;

    // Sprite — all coordinates already snapped to integers.
    if (this.flipped) {
      ctx.save();
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(this.sprite.canvas, sx, sy, sw, sh, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(this.sprite.canvas, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    // Name label with background box + 1px border.
    const labelFont = Math.max(7, zoom * 2.5);
    ctx.font = `${labelFont}px "DM Mono", monospace`;
    ctx.textAlign = "center";
    const labelW = ctx.measureText(this.name).width;
    const labelPad = Math.round(zoom * 1.5);
    const labelX = Math.round(this.x - labelW / 2 - labelPad);
    const labelY = Math.round(this.y + zoom * 2);
    const labelBoxW = Math.round(labelW + labelPad * 2);
    const labelBoxH = Math.round(labelFont + labelPad);
    const brd = Math.max(1, Math.floor(zoom / 2));
    // Name label pill — Signal Room surface + accent-secondary border.
    // Border.
    ctx.fillStyle = "#0f4a80"; // accent-secondary
    ctx.fillRect(
      labelX - brd,
      labelY - brd,
      labelBoxW + brd * 2,
      labelBoxH + brd * 2,
    );
    // Background.
    ctx.fillStyle = "#0c1624"; // bg-raised
    ctx.fillRect(labelX, labelY, labelBoxW, labelBoxH);
    // Text.
    ctx.fillStyle = "#c8ddef"; // Fox text
    ctx.fillText(this.name, Math.round(this.x), labelY + Math.round(labelFont));

    // Emotion bubble — pixel-art symbol above the head, no globalAlpha.
    if (this.emotionBubble) {
      this.drawEmotionBubble(ctx, zoom);
    }

    ctx.restore();
  }

  /**
   * Draw a pixel-art emotion bubble centered above the character's head.
   * Uses only opaque fills — no globalAlpha, no image smoothing.
   * Entrance bounce: symbol jumps +3px in the first 200ms then settles.
   */
  private drawEmotionBubble(ctx: CanvasRenderingContext2D, zoom: number): void {
    if (!this.emotionBubble) return;

    const { type, timer, duration } = this.emotionBubble;
    const elapsed = duration - timer;

    // Bounce entrance: moves up 3px over first 200ms then returns to base.
    // Uses a sine arc clamped to the first half-period.
    const bouncePx =
      elapsed < 200 ? Math.round(Math.sin((elapsed / 200) * Math.PI) * 3) : 0;

    // Base position: centered above head, above the name label.
    const baseX = Math.round(this.x);
    // -12 * zoom above the character's feet (which is this.y), then subtract
    // the bounce so positive bouncePx = upward.
    const baseY = Math.round(this.y - 12 * zoom) - bouncePx;

    // Bubble background: 9x9px at zoom=1, scaled by zoom.
    const bw = Math.round(9 * zoom);
    const bh = Math.round(9 * zoom);
    const bx = Math.round(baseX - bw / 2);
    const by = Math.round(baseY - bh);

    // White bubble box with dark border.
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(
      bx - Math.max(1, Math.floor(zoom / 2)),
      by - Math.max(1, Math.floor(zoom / 2)),
      bw + Math.max(1, Math.floor(zoom / 2)) * 2,
      bh + Math.max(1, Math.floor(zoom / 2)) * 2,
    );
    ctx.fillStyle = "#e8e8f0";
    ctx.fillRect(bx, by, bw, bh);

    // Draw the symbol — all shapes defined in a 1px unit, then scaled by zoom.
    // Helper: fill a rect relative to symbol origin (top-left of the 9x9 box + 1px padding each side).
    const px = bx + Math.round(zoom); // 1px padding at zoom
    const py = by + Math.round(zoom);
    const z = Math.max(1, Math.round(zoom)); // 1px unit at current zoom

    switch (type) {
      case "!": {
        // ! — 2x5px bar + 2x2px gap + 2x1px dot, yellow #FFD700
        ctx.fillStyle = "#FFD700";
        ctx.fillRect(Math.round(px + z * 3), py, z * 2, z * 4); // bar
        ctx.fillRect(
          Math.round(px + z * 3),
          Math.round(py + z * 5),
          z * 2,
          z * 2,
        ); // dot
        break;
      }
      case "?": {
        // ? — simple 3-part shape: top arc (2×1), vertical (1×2), dot, blue #1E7FD8
        ctx.fillStyle = "#1E7FD8";
        ctx.fillRect(Math.round(px + z * 2), py, z * 4, z); // top bar
        ctx.fillRect(Math.round(px + z * 5), Math.round(py + z), z, z * 2); // right descent
        ctx.fillRect(Math.round(px + z * 3), Math.round(py + z * 2), z * 2, z); // hook bottom
        ctx.fillRect(
          Math.round(px + z * 3),
          Math.round(py + z * 4),
          z * 2,
          z * 2,
        ); // stem
        ctx.fillRect(
          Math.round(px + z * 3),
          Math.round(py + z * 6),
          z * 2,
          z * 1,
        ); // dot
        break;
      }
      case "check": {
        // check — L-shape rotated: 4×3px, green #2ECC71
        ctx.fillStyle = "#2ECC71";
        ctx.fillRect(Math.round(px + z), Math.round(py + z * 3), z * 2, z * 3); // left leg
        ctx.fillRect(
          Math.round(px + z * 3),
          Math.round(py + z * 4),
          z * 4,
          z * 2,
        ); // right arm
        break;
      }
      case "star": {
        // star — 5px cross + 4 diagonal corners, yellow #FFD700
        ctx.fillStyle = "#FFD700";
        // Cross center
        ctx.fillRect(Math.round(px + z * 3), Math.round(py + z), z * 2, z * 6); // vertical
        ctx.fillRect(Math.round(px + z), Math.round(py + z * 3), z * 6, z * 2); // horizontal
        // 4 diagonal corners
        ctx.fillRect(Math.round(px + z), Math.round(py + z), z, z); // TL
        ctx.fillRect(Math.round(px + z * 6), Math.round(py + z), z, z); // TR
        ctx.fillRect(Math.round(px + z), Math.round(py + z * 6), z, z); // BL
        ctx.fillRect(Math.round(px + z * 6), Math.round(py + z * 6), z, z); // BR
        break;
      }
      case "heart": {
        // heart — classic 5×4px pixel heart, red #E74C3C
        ctx.fillStyle = "#E74C3C";
        // Row 0: two humps
        ctx.fillRect(Math.round(px + z), py, z * 2, z);
        ctx.fillRect(Math.round(px + z * 5), py, z * 2, z);
        // Row 1: full top fill
        ctx.fillRect(px, Math.round(py + z), z * 7, z);
        // Row 2: slightly narrower
        ctx.fillRect(px, Math.round(py + z * 2), z * 7, z);
        // Row 3: taper
        ctx.fillRect(Math.round(px + z), Math.round(py + z * 3), z * 5, z);
        // Row 4: tip
        ctx.fillRect(Math.round(px + z * 3), Math.round(py + z * 4), z, z);
        break;
      }
    }
  }

  /** Draw only the shadow — called in a separate pass before furniture/characters. */
  drawShadow(ctx: CanvasRenderingContext2D, zoom: number): void {
    if (!this.visible || this.opacity <= 0) return;
    const groundY = Math.round(
      this.state === "entering" ? this.targetY : this.y,
    );
    const sp = Math.max(1, Math.round(zoom * 0.75));
    const cx = Math.round(this.x);
    const cy = groundY;
    ctx.save();
    ctx.globalAlpha = this.opacity * 0.35;
    ctx.fillStyle = "#060a10";
    ctx.fillRect(cx - sp * 2, cy, sp * 4, sp);
    ctx.fillRect(cx - sp * 2, cy + sp * 3, sp * 4, sp);
    ctx.fillRect(cx - sp * 5, cy + sp, sp * 10, sp);
    ctx.fillRect(cx - sp * 5, cy + sp * 2, sp * 10, sp);
    ctx.restore();
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
