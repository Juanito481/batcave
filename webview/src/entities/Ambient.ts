/**
 * Ambient cave life — bats, water drips, dust motes, screen glow,
 * spiders, rats, fireflies.
 *
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

// --- Spiders ---

interface Spider {
  x: number;
  baseY: number; // anchor point on ceiling
  y: number;     // current position (descends on silk)
  targetY: number;
  state: "hanging" | "descending" | "ascending" | "waiting";
  waitTimer: number;
  waitThreshold: number;
  legFrame: 0 | 1;
  legTimer: number;
}

// --- Rats ---

interface Rat {
  x: number;
  y: number;
  speedX: number;
  frame: 0 | 1;
  frameTimer: number;
  active: boolean;
}

// --- Fireflies ---

interface Firefly {
  x: number;
  y: number;
  phase: number;
  speedX: number;
  speedY: number;
  brightness: number; // 0-1
}

// --- Weather (rain) ---

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  length: number;
}

export class Ambient {
  private bats: Bat[] = [];
  private drips: Drip[] = [];
  private motes: Mote[] = [];
  private glow: GlowPulse = { phase: 0 };
  private spiders: Spider[] = [];
  private rats: Rat[] = [];
  private fireflies: Firefly[] = [];
  private rain: RainDrop[] = [];

  // Timers.
  private dripTimer = 0;
  private ratSpawnTimer = 0;
  private ratSpawnThreshold = 20000 + Math.random() * 20000;
  private rainIntensity = 0.3 + Math.random() * 0.4; // 0.3-0.7

  // Cached world dimensions.
  private wW = 400;
  private wH = 300;
  private wallH = 64;

  constructor() {
    // Entities spawn lazily on first update when dimensions are known.
  }

  // Context pressure (0-100) — controls base drip interval.
  private contextPressure = 0;
  // State boost — thinking halves the drip interval for "cave breathing" effect.
  private stateBoost = 1;

  /** Increase drip frequency under context pressure. */
  setContextPressure(pct: number): void {
    this.contextPressure = pct;
  }

  /** Set state-driven drip frequency multiplier (1 = normal, 0.5 = double speed). */
  setStateBoost(multiplier: number): void {
    this.stateBoost = multiplier;
  }

  /** Compute drip interval from pressure + state boost. */
  private getDripInterval(): number {
    const base = Math.max(8000, 25000 - this.contextPressure * 170);
    return base * this.stateBoost;
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

    // Lazy init spiders.
    if (this.spiders.length === 0) {
      const count = 2 + Math.floor(Math.random() * 2); // 2-3
      for (let i = 0; i < count; i++) {
        this.spiders.push(this.spawnSpider(i));
      }
    }

    // Lazy init fireflies.
    if (this.fireflies.length === 0) {
      const count = 4 + Math.floor(Math.random() * 3); // 4-6
      for (let i = 0; i < count; i++) {
        this.fireflies.push(this.spawnFirefly());
      }
    }

    this.updateBats(deltaMs);
    this.updateDrips(deltaMs);
    this.updateMotes(deltaMs);
    this.updateSpiders(deltaMs);
    this.updateRats(deltaMs);
    this.updateFireflies(deltaMs);
    this.updateWeather(deltaMs);
    this.glow.phase += deltaMs * 0.001;
  }

  draw(ctx: CanvasRenderingContext2D, zoom: number): void {
    this.drawGlow(ctx, zoom);
    this.drawRain(ctx, zoom);
    this.drawFireflies(ctx, zoom);
    this.drawMotes(ctx, zoom);
    this.drawDrips(ctx, zoom);
    this.drawSpiders(ctx, zoom);
    this.drawRats(ctx, zoom);
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
    const s = Math.max(1, Math.floor(zoom * 0.5));
    ctx.fillStyle = "#3a3a58"; // brighter than bg for clear silhouette

    for (const bat of this.bats) {
      const bx = Math.round(bat.x);
      const by = Math.round(bat.y);

      // Body (2x1 center).
      ctx.fillRect(bx, by, s * 2, s);

      // Wings: frame 0 = spread wide, frame 1 = up high (more dramatic).
      if (bat.wingFrame === 0) {
        // Spread wings — wide and slightly down.
        ctx.fillRect(bx - s * 3, by, s * 3, s);
        ctx.fillRect(bx + s * 2, by, s * 3, s);
        // Wingtips droop.
        ctx.fillRect(bx - s * 3, by + s, s, s);
        ctx.fillRect(bx + s * 4, by + s, s, s);
      } else {
        // Wings up — higher and narrower.
        ctx.fillRect(bx - s * 2, by - s * 2, s * 2, s);
        ctx.fillRect(bx + s * 2, by - s * 2, s * 2, s);
        // Wing mids.
        ctx.fillRect(bx - s * 2, by - s, s, s);
        ctx.fillRect(bx + s * 3, by - s, s, s);
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
    const MOTE_COLORS = ["#2a2a3a", "#2e2e40", "#323248", "#363650"];

    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      ctx.fillStyle = MOTE_COLORS[i % MOTE_COLORS.length];
      ctx.fillRect(Math.round(m.x), Math.round(m.y), px, px);
    }
  }

  // --- Spiders ---

  private spawnSpider(index: number): Spider {
    const x = this.wW * 0.15 + (index / 3) * this.wW * 0.7;
    return {
      x,
      baseY: this.wallH + 4,
      y: this.wallH + 4,
      targetY: this.wallH + 4,
      state: "hanging",
      waitTimer: 0,
      waitThreshold: 8000 + Math.random() * 15000,
      legFrame: 0,
      legTimer: 0,
    };
  }

  private updateSpiders(dt: number): void {
    for (const spider of this.spiders) {
      spider.legTimer += dt;
      if (spider.legTimer >= 300) {
        spider.legTimer -= 300;
        spider.legFrame = spider.legFrame === 0 ? 1 : 0;
      }

      switch (spider.state) {
        case "hanging":
          spider.waitTimer += dt;
          if (spider.waitTimer >= spider.waitThreshold) {
            spider.waitTimer = 0;
            spider.state = "descending";
            // Descend 30-80px below ceiling.
            spider.targetY = spider.baseY + 30 + Math.random() * 50;
          }
          break;

        case "descending":
          spider.y += dt * 0.02;
          if (spider.y >= spider.targetY) {
            spider.y = spider.targetY;
            spider.state = "waiting";
            spider.waitTimer = 0;
            spider.waitThreshold = 3000 + Math.random() * 5000;
          }
          break;

        case "waiting":
          // Dangle slightly.
          spider.y = spider.targetY + Math.sin(Date.now() * 0.002) * 2;
          spider.waitTimer += dt;
          if (spider.waitTimer >= spider.waitThreshold) {
            spider.state = "ascending";
          }
          break;

        case "ascending":
          spider.y -= dt * 0.03;
          if (spider.y <= spider.baseY) {
            spider.y = spider.baseY;
            spider.state = "hanging";
            spider.waitTimer = 0;
            spider.waitThreshold = 8000 + Math.random() * 15000;
          }
          break;
      }
    }
  }

  private drawSpiders(ctx: CanvasRenderingContext2D, zoom: number): void {
    const s = Math.max(1, Math.floor(zoom * 0.4));

    for (const spider of this.spiders) {
      const sx = Math.round(spider.x);
      const sy = Math.round(spider.y);

      // Silk thread from ceiling to spider — proportional thickness.
      if (spider.y > spider.baseY + 2) {
        ctx.fillStyle = "#1a1a30";
        const silkW = Math.max(1, Math.floor(zoom / 2));
        ctx.fillRect(sx + s, Math.round(spider.baseY), silkW, sy - Math.round(spider.baseY));
      }

      // Body (dark, 3x2).
      ctx.fillStyle = "#1a1020";
      ctx.fillRect(sx, sy, s * 3, s * 2);

      // Head (brighter, smaller).
      ctx.fillStyle = "#2a2030";
      ctx.fillRect(sx + s, sy - s, s, s);

      // Legs (alternating frames).
      ctx.fillStyle = "#1a1020";
      if (spider.legFrame === 0) {
        // Legs spread.
        ctx.fillRect(sx - s, sy, s, s);
        ctx.fillRect(sx - s, sy + s, s, s);
        ctx.fillRect(sx + s * 3, sy, s, s);
        ctx.fillRect(sx + s * 3, sy + s, s, s);
      } else {
        // Legs tucked.
        ctx.fillRect(sx - s, sy + s, s, s);
        ctx.fillRect(sx + s * 3, sy + s, s, s);
      }

      // Eyes (tiny red dots).
      ctx.fillStyle = "#4a1a1a";
      ctx.fillRect(sx + s, sy - s, 1, 1);
      ctx.fillRect(sx + s + Math.max(1, Math.floor(s / 2)), sy - s, 1, 1);
    }
  }

  // --- Rats ---

  private updateRats(dt: number): void {
    // Spawn timer.
    this.ratSpawnTimer += dt;
    if (this.ratSpawnTimer >= this.ratSpawnThreshold && this.rats.filter(r => r.active).length < 2) {
      this.ratSpawnTimer = 0;
      this.ratSpawnThreshold = 20000 + Math.random() * 25000;

      const goingRight = Math.random() > 0.5;
      this.rats.push({
        x: goingRight ? -10 : this.wW + 10,
        y: this.wH - 6,
        speedX: (goingRight ? 1 : -1) * (0.06 + Math.random() * 0.04),
        frame: 0,
        frameTimer: 0,
        active: true,
      });
    }

    // Update active rats.
    for (let i = this.rats.length - 1; i >= 0; i--) {
      const rat = this.rats[i];
      if (!rat.active) continue;

      rat.x += rat.speedX * dt;
      rat.frameTimer += dt;
      if (rat.frameTimer >= 120) {
        rat.frameTimer -= 120;
        rat.frame = rat.frame === 0 ? 1 : 0;
      }

      // Remove when off-screen.
      if ((rat.speedX > 0 && rat.x > this.wW + 20) ||
          (rat.speedX < 0 && rat.x < -20)) {
        rat.active = false;
        this.rats.splice(i, 1);
      }
    }
  }

  private drawRats(ctx: CanvasRenderingContext2D, zoom: number): void {
    const s = Math.max(1, Math.floor(zoom * 0.4));

    for (const rat of this.rats) {
      if (!rat.active) continue;
      const rx = Math.round(rat.x);
      const ry = Math.round(rat.y);
      const dir = rat.speedX > 0 ? 1 : -1;

      // Body (4x2).
      ctx.fillStyle = "#201820";
      ctx.fillRect(rx, ry, s * 4, s * 2);

      // Head.
      ctx.fillStyle = "#2a2028";
      const hx = dir > 0 ? rx + s * 4 : rx - s;
      ctx.fillRect(hx, ry, s, s * 2);

      // Ears.
      ctx.fillStyle = "#3a2830";
      ctx.fillRect(hx, ry - s, s, s);

      // Tail — proportional thickness.
      ctx.fillStyle = "#241a24";
      const tx = dir > 0 ? rx - s * 2 : rx + s * 4 + s;
      ctx.fillRect(tx, ry + s, s * 2, Math.max(1, Math.floor(zoom / 2)));

      // Legs (alternating).
      ctx.fillStyle = "#201820";
      if (rat.frame === 0) {
        ctx.fillRect(rx + s, ry + s * 2, s, s);
        ctx.fillRect(rx + s * 3, ry + s * 2, s, s);
      } else {
        ctx.fillRect(rx, ry + s * 2, s, s);
        ctx.fillRect(rx + s * 2, ry + s * 2, s, s);
      }

      // Eye.
      ctx.fillStyle = "#4a3a30";
      ctx.fillRect(hx, ry + Math.floor(s / 2), 1, 1);
    }
  }

  // --- Fireflies ---

  private spawnFirefly(): Firefly {
    return {
      x: Math.random() * this.wW,
      y: this.wallH * 0.3 + Math.random() * this.wallH * 0.8,
      phase: Math.random() * Math.PI * 2,
      speedX: (Math.random() - 0.5) * 0.008,
      speedY: (Math.random() - 0.5) * 0.005,
      brightness: Math.random(),
    };
  }

  private updateFireflies(dt: number): void {
    for (const ff of this.fireflies) {
      ff.x += ff.speedX * dt;
      ff.y += ff.speedY * dt;
      ff.phase += dt * 0.002;
      ff.brightness = (Math.sin(ff.phase) + 1) * 0.5;

      // Gentle drift direction change.
      if (Math.random() < 0.001) {
        ff.speedX = (Math.random() - 0.5) * 0.008;
        ff.speedY = (Math.random() - 0.5) * 0.005;
      }

      // Wrap.
      if (ff.x < -5) ff.x = this.wW + 5;
      if (ff.x > this.wW + 5) ff.x = -5;
      if (ff.y < this.wallH * 0.2) ff.y = this.wallH * 1.2;
      if (ff.y > this.wallH * 1.5) ff.y = this.wallH * 0.3;
    }
  }

  private drawFireflies(ctx: CanvasRenderingContext2D, zoom: number): void {
    const px = Math.max(1, Math.floor(zoom * 0.3));

    // Opaque glow steps (warm yellow-green, no rgba).
    const GLOW_DIM = "#283818";
    const GLOW_MID = "#3a5a20";
    const GLOW_BRIGHT = "#5a8a30";

    for (const ff of this.fireflies) {
      const fx = Math.round(ff.x);
      const fy = Math.round(ff.y);

      if (ff.brightness > 0.7) {
        // Bright: glow halo + core.
        ctx.fillStyle = GLOW_DIM;
        ctx.fillRect(fx - px, fy - px, px * 3, px * 3);
        ctx.fillStyle = GLOW_BRIGHT;
        ctx.fillRect(fx, fy, px, px);
      } else if (ff.brightness > 0.3) {
        // Medium: small glow.
        ctx.fillStyle = GLOW_MID;
        ctx.fillRect(fx, fy, px, px);
      } else {
        // Dim: barely visible.
        ctx.fillStyle = GLOW_DIM;
        ctx.fillRect(fx, fy, px, px);
      }
    }
  }

  // --- Weather (rain) ---

  private updateWeather(dt: number): void {
    // Spawn rain drops on the right edge (cave entrance).
    const entranceX = this.wW * 0.85;
    const entranceW = this.wW * 0.15;
    const maxDrops = Math.floor(this.rainIntensity * 30);

    // Maintain rain pool.
    while (this.rain.length < maxDrops) {
      this.rain.push({
        x: entranceX + Math.random() * entranceW,
        y: Math.random() * this.wH,
        speed: 0.15 + Math.random() * 0.1,
        length: 3 + Math.random() * 4,
      });
    }

    // Update drops.
    for (let i = this.rain.length - 1; i >= 0; i--) {
      const drop = this.rain[i];
      drop.y += drop.speed * dt;
      drop.x -= drop.speed * dt * 0.15; // Slight wind angle.

      if (drop.y > this.wH) {
        // Respawn at top.
        drop.y = -drop.length;
        drop.x = entranceX + Math.random() * entranceW;
      }
    }

    // Slowly vary rain intensity.
    if (Math.random() < 0.0001) {
      this.rainIntensity = 0.2 + Math.random() * 0.6;
    }

    // (Lightning removed — bugged, doesn't fit the cave context.)
  }

  private drawRain(ctx: CanvasRenderingContext2D, zoom: number): void {
    const px = Math.max(1, Math.floor(zoom * 0.2));
    ctx.fillStyle = "#1a2a3a";

    for (const drop of this.rain) {
      ctx.fillRect(
        Math.round(drop.x),
        Math.round(drop.y),
        px,
        Math.round(drop.length * zoom * 0.3),
      );
    }
  }

  // --- Screen glow pulse ---

  private drawGlow(ctx: CanvasRenderingContext2D, zoom: number): void {
    const cx = this.wW / 2;
    const cy = this.wallH + zoom * 8;

    // Opaque glow using concentric rectangles (no rgba gradients).
    const pulse = Math.sin(this.glow.phase * 0.8);
    const glowLayers = [
      { size: zoom * 6, color: pulse > 0 ? "#182840" : "#142438" },
      { size: zoom * 12, color: pulse > 0 ? "#142030" : "#121c28" },
      { size: zoom * 20, color: pulse > 0 ? "#101a28" : "#0e1822" },
      { size: zoom * 30, color: "#0c1420" },
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
