/**
 * Ambient cave life — bats, water drips, dust motes, screen glow.
 * Draws behind characters/furniture to add depth to the Bat Cave.
 */

import { bus } from "../systems/EventBus";

// --- Flying bats ---

interface Bat {
  x: number;
  y: number;
  baseY: number;
  speedX: number;
  phase: number;
  wingFrame: 0 | 1;
  wingTimer: number;
  swooping: boolean;
  swoopY: number;
  swoopTimer: number;
  swoopThreshold: number;
}

// --- Water drips ---

interface Drip {
  x: number;
  y: number;
  velocityY: number;
  splashTimer: number; // -1 = falling, 0+ = splash animation
}

// --- Dust motes ---

interface Mote {
  x: number;
  y: number;
  speedY: number;
  speedX: number;
}

// --- Glow pulse ---

interface GlowPulse {
  phase: number;
}

export class Ambient {
  private bats: Bat[] = [];
  private drips: Drip[] = [];
  private motes: Mote[] = [];
  private glow: GlowPulse = { phase: 0 };

  // Timers.
  private dripTimer = 0;

  // Cached world dimensions.
  private wW = 400;
  private wH = 300;
  private wallH = 64;

  constructor() {
    // Bats spawn lazily on first update when dimensions are known.
  }

  // Context pressure (0-100) — controls base drip interval.
  private contextPressure = 0;

  /** Increase drip frequency under context pressure. */
  setContextPressure(pct: number): void {
    this.contextPressure = pct;
  }

  /** Compute drip interval from pressure: 0% = 25000ms, 100% = 8000ms. */
  private getDripInterval(): number {
    return Math.max(8000, 25000 - this.contextPressure * 170);
  }

  // --- Public API ---

  update(deltaMs: number, worldWidth: number, worldHeight: number, wallH: number): void {
    this.wW = worldWidth;
    this.wH = worldHeight;
    this.wallH = wallH;

    // Lazy init bats.
    if (this.bats.length === 0) {
      const count = 3 + Math.floor(Math.random() * 3); // 3-5
      for (let i = 0; i < count; i++) {
        this.bats.push(this.spawnBat());
      }
    }

    // Lazy init motes.
    if (this.motes.length === 0) {
      const count = 5 + Math.floor(Math.random() * 4); // 5-8
      for (let i = 0; i < count; i++) {
        this.motes.push(this.spawnMote(true));
      }
    }

    this.updateBats(deltaMs);
    this.updateDrips(deltaMs);
    this.updateMotes(deltaMs);
    this.glow.phase += deltaMs * 0.001;
  }

  draw(ctx: CanvasRenderingContext2D, zoom: number): void {
    this.drawGlow(ctx, zoom);
    this.drawMotes(ctx, zoom);
    this.drawDrips(ctx, zoom);
    this.drawBats(ctx, zoom);
  }

  // --- Bats ---

  private spawnBat(): Bat {
    const goingRight = Math.random() > 0.5;
    return {
      x: goingRight ? -20 : this.wW + 20,
      y: this.wallH * 0.4 + Math.random() * this.wallH * 0.5,
      baseY: this.wallH * 0.4 + Math.random() * this.wallH * 0.5,
      speedX: (goingRight ? 1 : -1) * (0.02 + Math.random() * 0.03),
      phase: Math.random() * Math.PI * 2,
      wingFrame: 0,
      wingTimer: 0,
      swooping: false,
      swoopY: 0,
      swoopTimer: 0,
      swoopThreshold: 3000 + Math.random() * 5000,
    };
  }

  private updateBats(dt: number): void {
    for (const bat of this.bats) {
      bat.x += bat.speedX * dt;
      bat.phase += dt * 0.003;

      // Sine-wave float.
      bat.y = bat.baseY + Math.sin(bat.phase) * 8;

      // Occasional swoop (accumulator-based, frame-rate independent).
      if (!bat.swooping) {
        bat.swoopTimer += dt;
        if (bat.swoopTimer >= bat.swoopThreshold) {
          bat.swooping = true;
          bat.swoopY = 0;
          bat.swoopTimer = 0;
          bat.swoopThreshold = 3000 + Math.random() * 5000;
        }
      }
      if (bat.swooping) {
        bat.swoopY += dt * 0.08;
        bat.y += Math.sin(bat.swoopY * 0.05) * 20;
        if (bat.swoopY > 80) {
          bat.swooping = false;
        }
      }

      // Wing animation (2 frames, ~180ms per frame).
      bat.wingTimer += dt;
      if (bat.wingTimer >= 180) {
        bat.wingTimer -= 180;
        bat.wingFrame = bat.wingFrame === 0 ? 1 : 0;
      }

      // Respawn when off-screen.
      if (bat.speedX > 0 && bat.x > this.wW + 30) {
        Object.assign(bat, this.spawnBat());
      } else if (bat.speedX < 0 && bat.x < -30) {
        Object.assign(bat, this.spawnBat());
      }
    }
  }

  private drawBats(ctx: CanvasRenderingContext2D, zoom: number): void {
    const s = Math.max(1, Math.floor(zoom * 0.5)); // ~4px at zoom 8
    ctx.fillStyle = "#1a1a2e";

    for (const bat of this.bats) {
      const bx = Math.round(bat.x);
      const by = Math.round(bat.y);

      // Body (2x1 center).
      ctx.fillRect(bx, by, s * 2, s);

      // Wings: frame 0 = flat, frame 1 = up.
      if (bat.wingFrame === 0) {
        // Flat wings.
        ctx.fillRect(bx - s * 2, by, s * 2, s);
        ctx.fillRect(bx + s * 2, by, s * 2, s);
      } else {
        // Wings up.
        ctx.fillRect(bx - s * 2, by - s, s * 2, s);
        ctx.fillRect(bx + s * 2, by - s, s * 2, s);
      }
    }
  }

  // --- Drips ---

  private updateDrips(dt: number): void {
    this.dripTimer += dt;

    const interval = this.getDripInterval();
    if (this.dripTimer >= interval) {
      this.dripTimer = 0;

      // Spawn from a random stalactite position (distributed across width).
      const numSlots = Math.max(1, Math.floor(this.wW / 48));
      const slot = Math.floor(Math.random() * numSlots);
      this.drips.push({
        x: (slot + 0.5) * (this.wW / numSlots) + (Math.random() - 0.5) * 4,
        y: this.wallH + Math.random() * 10,
        velocityY: 0.04,
        splashTimer: -1,
      });
    }

    for (let i = this.drips.length - 1; i >= 0; i--) {
      const drip = this.drips[i];

      if (drip.splashTimer < 0) {
        // Falling.
        drip.velocityY += 0.0002 * dt; // gravity
        drip.y += drip.velocityY * dt;

        // Hit floor.
        if (drip.y >= this.wH - 4) {
          drip.splashTimer = 0;
          drip.y = this.wH - 4;
          bus.emit("sound:play", { id: "drip", volume: 0.5 });
        }
      } else {
        // Splash animation.
        drip.splashTimer += dt;
        if (drip.splashTimer > 300) {
          this.drips.splice(i, 1);
        }
      }
    }
  }

  private drawDrips(ctx: CanvasRenderingContext2D, zoom: number): void {
    const px = Math.max(1, Math.floor(zoom * 0.25));

    // Opaque palette for water (no rgba).
    const DRIP_BRIGHT = "#1a4a6e";
    const DRIP_MID = "#142e48";
    const DRIP_DIM = "#0e1e30";

    for (const drip of this.drips) {
      if (drip.splashTimer < 0) {
        // Falling drop.
        ctx.fillStyle = DRIP_BRIGHT;
        ctx.fillRect(Math.round(drip.x), Math.round(drip.y), px, px * 2);
      } else {
        // Splash — expanding, fading through palette steps.
        const spread = Math.floor((drip.splashTimer / 300) * 3) + 1;
        const progress = drip.splashTimer / 300;
        ctx.fillStyle = progress < 0.33 ? DRIP_BRIGHT : progress < 0.66 ? DRIP_MID : DRIP_DIM;
        ctx.fillRect(Math.round(drip.x) - spread * px, Math.round(drip.y), px * (spread * 2 + 1), px);
      }
    }
  }

  // --- Dust motes ---

  private spawnMote(randomY: boolean): Mote {
    return {
      x: Math.random() * this.wW,
      y: randomY ? Math.random() * this.wH : this.wH + 5,
      speedY: -(0.003 + Math.random() * 0.005), // float upward
      speedX: (Math.random() - 0.5) * 0.004,
    };
  }

  private updateMotes(dt: number): void {
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.x += m.speedX * dt;
      m.y += m.speedY * dt;

      // Respawn when off top.
      if (m.y < -5) {
        this.motes[i] = this.spawnMote(false);
      }
      // Wrap horizontal.
      if (m.x < -5) m.x = this.wW + 5;
      if (m.x > this.wW + 5) m.x = -5;
    }
  }

  private drawMotes(ctx: CanvasRenderingContext2D, zoom: number): void {
    const px = Math.max(1, Math.floor(zoom * 0.25));

    // Opaque dust mote colors (no rgba). Different brightness levels.
    const MOTE_COLORS = ["#1a1a24", "#1e1e2a", "#222230", "#262636"];

    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      ctx.fillStyle = MOTE_COLORS[i % MOTE_COLORS.length];
      ctx.fillRect(Math.round(m.x), Math.round(m.y), px, px);
    }
  }

  // --- Screen glow pulse ---

  private drawGlow(ctx: CanvasRenderingContext2D, zoom: number): void {
    const cx = this.wW / 2;
    const cy = this.wallH + zoom * 8;

    // Opaque glow using concentric rectangles (no rgba gradients).
    // Creates a visible light pool from the batcomputer screens.
    const pulse = Math.sin(this.glow.phase * 0.8);
    const glowLayers = [
      { size: zoom * 6, color: pulse > 0 ? "#101830" : "#0e1428" },
      { size: zoom * 12, color: pulse > 0 ? "#0d1224" : "#0c1020" },
      { size: zoom * 20, color: pulse > 0 ? "#0b0f1e" : "#0a0e1a" },
      { size: zoom * 30, color: "#0a0c16" },
    ];

    // Draw from largest to smallest so inner layers overlay.
    for (let i = glowLayers.length - 1; i >= 0; i--) {
      const layer = glowLayers[i];
      const s = layer.size;
      ctx.fillStyle = layer.color;
      ctx.fillRect(cx - s, cy - s * 0.6, s * 2, s * 1.2);
    }
  }
}
