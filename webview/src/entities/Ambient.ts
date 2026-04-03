/**
 * Ambient cave life — bats, water drips, dust motes, screen glow.
 * Draws behind characters/furniture to add depth to the Bat Cave.
 */

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
  opacity: number;
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
  private dripInterval = 2500; // ms until next drip

  // Cached world dimensions.
  private wW = 400;
  private wH = 300;
  private wallH = 64;

  constructor() {
    // Bats spawn lazily on first update when dimensions are known.
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
    };
  }

  private updateBats(dt: number): void {
    for (const bat of this.bats) {
      bat.x += bat.speedX * dt;
      bat.phase += dt * 0.003;

      // Sine-wave float.
      bat.y = bat.baseY + Math.sin(bat.phase) * 8;

      // Occasional swoop.
      if (!bat.swooping && Math.random() < 0.0002 * dt) {
        bat.swooping = true;
        bat.swoopY = 0;
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

    if (this.dripTimer >= this.dripInterval) {
      this.dripTimer = 0;
      this.dripInterval = 2000 + Math.random() * 2000; // 2-4s

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

    for (const drip of this.drips) {
      ctx.fillStyle = "rgba(30, 127, 216, 0.4)";

      if (drip.splashTimer < 0) {
        // Falling drop — single pixel, slightly elongated.
        ctx.fillRect(Math.round(drip.x), Math.round(drip.y), px, px * 2);
      } else {
        // Splash — expanding horizontal pixels.
        const spread = Math.floor((drip.splashTimer / 300) * 3) + 1;
        const alpha = 0.4 * (1 - drip.splashTimer / 300);
        ctx.fillStyle = `rgba(30, 127, 216, ${alpha})`;
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
      opacity: 0.08 + Math.random() * 0.07, // ~0.08-0.15
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

    for (const m of this.motes) {
      ctx.fillStyle = `rgba(136, 136, 136, ${m.opacity})`;
      ctx.fillRect(Math.round(m.x), Math.round(m.y), px, px);
    }
  }

  // --- Screen glow pulse ---

  private drawGlow(ctx: CanvasRenderingContext2D, zoom: number): void {
    const cx = this.wW / 2;
    const cy = this.wallH + zoom * 8;
    const baseRadius = zoom * 30;
    const pulse = 0.5 + Math.sin(this.glow.phase * 0.8) * 0.15;

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius);
    gradient.addColorStop(0, `rgba(30, 127, 216, ${0.06 * pulse})`);
    gradient.addColorStop(1, "rgba(30, 127, 216, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(cx - baseRadius, cy - baseRadius, baseRadius * 2, baseRadius * 2);
  }
}
