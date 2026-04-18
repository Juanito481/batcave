/**
 * Ambient cave life — bats, water drips, dust motes, screen glow,
 * spiders, rats, fireflies.
 *
 * Draws behind characters/furniture to add depth to the Bat Cave.
 */

import { bus } from "../systems/EventBus";
import { P } from "../canvas/layers/render-context";

// --- Flying bats ---

interface Bat {
  x: number;
  y: number;
  baseY: number;
  speedX: number;
  phase: number;
  wingFrame: 0 | 1 | 2;
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
  y: number; // current position (descends on silk)
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

// --- Weather (rain + fog + sparks) ---

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  length: number;
}

interface FogPatch {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  color: string;
}

interface Spark {
  x: number;
  y: number;
  speedY: number;
  speedX: number;
  life: number;
  maxLife: number;
  color: string;
}

export class Ambient {
  private bats: Bat[] = [];
  private motes: Mote[] = [];
  private glow: GlowPulse = { phase: 0 };
  private spiders: Spider[] = [];
  private fireflies: Firefly[] = [];
  private rain: RainDrop[] = [];
  private fog: FogPatch[] = [];
  private sparks: Spark[] = [];

  // Pool-based drips (fixed size, recycled — no splice, no GC).
  private static readonly MAX_DRIPS = 8;
  private dripPool: Drip[] = [];
  private dripTimer = 0;

  // Pool-based rats (fixed size, active flag).
  private static readonly MAX_RATS = 4;
  private ratPool: Rat[] = [];
  private activeRatCount = 0;
  private ratSpawnTimer = 0;
  private ratSpawnThreshold = 20000 + Math.random() * 20000;
  private rainIntensity = 0.3 + Math.random() * 0.4; // 0.3-0.7

  // Weather system.
  private weatherMode: "clear" | "fog" | "sparks" = "clear";
  private weatherTimer = 0;

  // Cached world dimensions.
  private wW = 400;
  private wH = 300;
  private wallH = 64;

  constructor() {
    // Pre-allocate drip pool (reusable, no GC).
    for (let i = 0; i < Ambient.MAX_DRIPS; i++) {
      this.dripPool.push({ x: 0, y: 0, velocityY: 0, splashTimer: -2 });
    }
    // Pre-allocate rat pool.
    for (let i = 0; i < Ambient.MAX_RATS; i++) {
      this.ratPool.push({
        x: 0,
        y: 0,
        speedX: 0,
        frame: 0,
        frameTimer: 0,
        active: false,
      });
    }
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

  /** Set weather mode — fog when context is high, sparks after deploy. */
  setWeather(mode: "clear" | "fog" | "sparks"): void {
    if (mode === this.weatherMode) return;
    this.weatherMode = mode;
    this.weatherTimer = 0;
    if (mode === "fog" && this.fog.length === 0) {
      this.initFog();
    }
    if (mode === "sparks") {
      this.initSparks();
    }
  }

  /** Compute drip interval from pressure + state boost. */
  private getDripInterval(): number {
    const base = Math.max(8000, 25000 - this.contextPressure * 170);
    return base * this.stateBoost;
  }

  // --- Public API ---

  update(
    deltaMs: number,
    worldWidth: number,
    worldHeight: number,
    wallH: number,
  ): void {
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
    this.updateFogAndSparks(deltaMs);
    this.glow.phase += deltaMs * 0.001;
  }

  draw(ctx: CanvasRenderingContext2D, zoom: number): void {
    this.drawGlow(ctx, zoom);
    this.drawFog(ctx, zoom);
    this.drawRain(ctx, zoom);
    this.drawFireflies(ctx, zoom);
    this.drawMotes(ctx, zoom);
    this.drawDrips(ctx, zoom);
    this.drawSpiders(ctx, zoom);
    this.drawRats(ctx, zoom);
    this.drawBats(ctx, zoom);
    this.drawSparks(ctx, zoom);
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

      // Wing animation (3 frames: spread → mid → up, ~140ms per frame).
      bat.wingTimer += dt;
      if (bat.wingTimer >= 140) {
        bat.wingTimer -= 140;
        bat.wingFrame = ((bat.wingFrame + 1) % 3) as 0 | 1 | 2;
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
    const BODY = "#3a3a58";
    const WING = "#2e2e48";
    const EAR = "#4a4a68";

    for (const bat of this.bats) {
      const bx = Math.round(bat.x);
      const by = Math.round(bat.y);

      // Body (3x2 center — more readable shape).
      ctx.fillStyle = BODY;
      ctx.fillRect(bx, by, s * 3, s * 2);
      // Head bump.
      ctx.fillRect(bx + s, by - s, s, s);
      // Ears.
      ctx.fillStyle = EAR;
      ctx.fillRect(bx, by - s, s, s);
      ctx.fillRect(bx + s * 2, by - s, s, s);

      // Wings: 3 frames — spread → mid → up.
      ctx.fillStyle = WING;
      if (bat.wingFrame === 0) {
        // Spread wide — horizontal with droop at tips.
        ctx.fillRect(bx - s * 3, by, s * 3, s);
        ctx.fillRect(bx + s * 3, by, s * 3, s);
        ctx.fillRect(bx - s * 4, by + s, s, s);
        ctx.fillRect(bx + s * 5, by + s, s, s);
        // Inner wing detail.
        ctx.fillStyle = BODY;
        ctx.fillRect(bx - s, by + s, s, s);
        ctx.fillRect(bx + s * 3, by + s, s, s);
      } else if (bat.wingFrame === 1) {
        // Mid — angled 45 degrees.
        ctx.fillRect(bx - s * 2, by - s, s * 2, s);
        ctx.fillRect(bx + s * 3, by - s, s * 2, s);
        ctx.fillRect(bx - s * 3, by - s * 2, s, s);
        ctx.fillRect(bx + s * 4, by - s * 2, s, s);
      } else {
        // Up — wings raised high, narrow.
        ctx.fillRect(bx - s, by - s * 2, s, s * 2);
        ctx.fillRect(bx + s * 3, by - s * 2, s, s * 2);
        ctx.fillRect(bx - s * 2, by - s * 3, s, s);
        ctx.fillRect(bx + s * 3, by - s * 3, s, s);
      }
    }
  }

  // --- Drips ---

  private updateDrips(dt: number): void {
    this.dripTimer += dt;

    const interval = this.getDripInterval();
    if (this.dripTimer >= interval) {
      this.dripTimer = 0;

      // Find a dead drip in the pool to recycle.
      const drip = this.dripPool.find((d) => d.splashTimer === -2);
      if (drip) {
        const numSlots = Math.max(1, Math.floor(this.wW / 48));
        const slot = Math.floor(Math.random() * numSlots);
        drip.x =
          (slot + 0.5) * (this.wW / numSlots) + (Math.random() - 0.5) * 4;
        drip.y = this.wallH + Math.random() * 10;
        drip.velocityY = 0.04;
        drip.splashTimer = -1; // -1 = falling, -2 = dead/available
      }
    }

    for (const drip of this.dripPool) {
      if (drip.splashTimer === -2) continue; // Dead — skip.

      if (drip.splashTimer < 0) {
        // Falling.
        drip.velocityY += 0.0002 * dt;
        drip.y += drip.velocityY * dt;

        if (drip.y >= this.wH - 4) {
          drip.splashTimer = 0;
          drip.y = this.wH - 4;
          bus.emit("sound:play", { id: "drip", volume: 0.5 });
        }
      } else {
        // Splash animation — recycle after 300ms.
        drip.splashTimer += dt;
        if (drip.splashTimer > 300) {
          drip.splashTimer = -2; // Return to pool.
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

    for (const drip of this.dripPool) {
      if (drip.splashTimer === -2) continue; // Dead.
      if (drip.splashTimer < 0) {
        // Falling drop.
        ctx.fillStyle = DRIP_BRIGHT;
        ctx.fillRect(Math.round(drip.x), Math.round(drip.y), px, px * 2);
      } else {
        // 3-frame ripple splash — concentric expanding rings.
        const frame = Math.min(2, Math.floor(drip.splashTimer / 100));
        const dx = Math.round(drip.x);
        const dy = Math.round(drip.y);
        // Frame 0: tight center splash.
        if (frame >= 0) {
          ctx.fillStyle = DRIP_BRIGHT;
          ctx.fillRect(dx - px, dy, px * 3, px);
          // P1: thinking state — 2×1px accent splash at impact point.
          // stateBoost < 1 means thinking (setStateBoost(0.5) called by world).
          if (this.stateBoost < 1) {
            ctx.fillStyle = "#1E7FD8";
            ctx.fillRect(dx - px, dy, px * 2, px);
          }
        }
        // Frame 1: expanding ring.
        if (frame >= 1) {
          ctx.fillStyle = DRIP_MID;
          ctx.fillRect(dx - px * 2, dy + px, px * 5, px);
        }
        // Frame 2: wide fading ring.
        if (frame >= 2) {
          ctx.fillStyle = DRIP_DIM;
          ctx.fillRect(dx - px * 3, dy + px * 2, px * 7, px);
        }
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

    // Brighter dust mote colors for visibility (was too dark).
    const MOTE_COLORS = ["#404060", "#484870", "#505080", "#585890"];

    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      ctx.fillStyle = MOTE_COLORS[i % MOTE_COLORS.length];
      // Vary size: 50% are 2px, 50% are 1px.
      const size = i % 2 === 0 ? px * 2 : px;
      ctx.fillRect(Math.round(m.x), Math.round(m.y), size, size);
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
        ctx.fillRect(
          sx + s,
          Math.round(spider.baseY),
          silkW,
          sy - Math.round(spider.baseY),
        );
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

      // Eyes (tiny red dots — scaled with zoom so visible at all sizes).
      const eyeSize = Math.max(1, Math.floor(zoom * 0.15));
      ctx.fillStyle = "#4a1a1a";
      ctx.fillRect(sx + s, sy - s, eyeSize, eyeSize);
      ctx.fillRect(
        sx + s + Math.max(1, Math.floor(s / 2)),
        sy - s,
        eyeSize,
        eyeSize,
      );
    }
  }

  // --- Rats ---

  private updateRats(dt: number): void {
    // Spawn timer — use counter instead of .filter() (O(1) vs O(n)).
    this.ratSpawnTimer += dt;
    if (
      this.ratSpawnTimer >= this.ratSpawnThreshold &&
      this.activeRatCount < 2
    ) {
      this.ratSpawnTimer = 0;
      this.ratSpawnThreshold = 20000 + Math.random() * 25000;

      // Find a dead rat in the pool to recycle.
      const rat = this.ratPool.find((r) => !r.active);
      if (rat) {
        const goingRight = Math.random() > 0.5;
        rat.x = goingRight ? -10 : this.wW + 10;
        rat.y = this.wH - 6;
        rat.speedX = (goingRight ? 1 : -1) * (0.06 + Math.random() * 0.04);
        rat.frame = 0;
        rat.frameTimer = 0;
        rat.active = true;
        this.activeRatCount++;
      }
    }

    // Update active rats.
    for (const rat of this.ratPool) {
      if (!rat.active) continue;

      rat.x += rat.speedX * dt;
      rat.frameTimer += dt;
      if (rat.frameTimer >= 120) {
        rat.frameTimer -= 120;
        rat.frame = rat.frame === 0 ? 1 : 0;
      }

      // Recycle when off-screen.
      if (
        (rat.speedX > 0 && rat.x > this.wW + 20) ||
        (rat.speedX < 0 && rat.x < -20)
      ) {
        rat.active = false;
        this.activeRatCount--;
      }
    }
  }

  private drawRats(ctx: CanvasRenderingContext2D, zoom: number): void {
    const s = Math.max(1, Math.floor(zoom * 0.4));

    for (const rat of this.ratPool) {
      if (!rat.active) continue;
      const rx = Math.round(rat.x);
      const ry = Math.round(rat.y);
      const dir = rat.speedX > 0 ? 1 : -1;

      // Body (4x2) — brighter than floor for visibility.
      ctx.fillStyle = "#3a3040";
      ctx.fillRect(rx, ry, s * 4, s * 2);
      // Belly highlight.
      ctx.fillStyle = "#4a3e4a";
      ctx.fillRect(rx + s, ry + s, s * 2, s);

      // Head.
      ctx.fillStyle = "#3e3444";
      const hx = dir > 0 ? rx + s * 4 : rx - s;
      ctx.fillRect(hx, ry, s, s * 2);

      // Ears.
      ctx.fillStyle = "#5a4858";
      ctx.fillRect(hx, ry - s, s, s);

      // Tail — proportional thickness.
      ctx.fillStyle = "#342a38";
      const tx = dir > 0 ? rx - s * 2 : rx + s * 4 + s;
      ctx.fillRect(tx, ry + s, s * 2, Math.max(1, Math.floor(zoom / 2)));
      // Tail curve.
      ctx.fillRect(
        dir > 0 ? tx - s : tx + s * 2,
        ry,
        s,
        Math.max(1, Math.floor(zoom / 2)),
      );

      // Legs (alternating).
      ctx.fillStyle = "#322838";
      if (rat.frame === 0) {
        ctx.fillRect(rx + s, ry + s * 2, s, s);
        ctx.fillRect(rx + s * 3, ry + s * 2, s, s);
      } else {
        ctx.fillRect(rx, ry + s * 2, s, s);
        ctx.fillRect(rx + s * 2, ry + s * 2, s, s);
      }

      // Eye.
      ctx.fillStyle = "#6a5a50";
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
    // Signal Room: render old firefly slots as LED indicator pixels on cave walls.
    // 3-color palette: success green / accent blue / warn amber — all opaque.
    const px = Math.max(1, Math.floor(zoom * 0.4));
    const LED_COLORS = [P.SUCCESS, P.ACCENT, P.WARN] as const;

    for (let i = 0; i < this.fireflies.length; i++) {
      const ff = this.fireflies[i];
      const fx = Math.round(ff.x);
      const fy = Math.round(ff.y);
      const color = LED_COLORS[i % 3];

      if (ff.brightness > 0.6) {
        // LED on — small bright pixel.
        ctx.fillStyle = color;
        ctx.fillRect(fx, fy, px, px);
      } else if (ff.brightness > 0.2) {
        // LED half — very dim, barely visible (simulates LED off with slight glow).
        // Darken: use a muted wall color so the "off" state is almost invisible.
        ctx.fillStyle = "#162030"; // surface — blends into wall
        ctx.fillRect(fx, fy, px, px);
      }
      // < 0.2: fully off — draw nothing (saves a fillRect)
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

  // --- Fog & Sparks weather ---

  private initFog(): void {
    const FOG_COLORS = ["#121820", "#161e28", "#1a2230"];
    this.fog = [];
    for (let i = 0; i < 14; i++) {
      this.fog.push({
        x: Math.random() * this.wW,
        y: this.wallH + Math.random() * (this.wH - this.wallH),
        w: 30 + Math.random() * 40,
        h: 2 + Math.random() * 3,
        speed: 5 + Math.random() * 10,
        color: FOG_COLORS[i % FOG_COLORS.length],
      });
    }
  }

  private initSparks(): void {
    const SPARK_COLORS = ["#FFD700", "#E67E22", "#FFFFFF"];
    for (let i = 0; i < 18; i++) {
      this.sparks.push({
        x: this.wW * 0.3 + Math.random() * this.wW * 0.4,
        y: this.wH * 0.5 + Math.random() * this.wH * 0.3,
        speedY: -(100 + Math.random() * 100),
        speedX: (Math.random() - 0.5) * 40,
        life: 0,
        maxLife: 2000 + Math.random() * 1000,
        color: SPARK_COLORS[i % SPARK_COLORS.length],
      });
    }
  }

  private updateFogAndSparks(dt: number): void {
    // Fog movement.
    if (this.weatherMode === "fog") {
      for (const f of this.fog) {
        f.x += f.speed * (dt / 1000);
        if (f.x > this.wW + f.w) {
          f.x = -f.w;
          f.y = this.wallH + Math.random() * (this.wH - this.wallH);
        }
      }
    }

    // Sparks — auto-expire after 3s.
    if (this.sparks.length > 0) {
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const s = this.sparks[i];
        s.life += dt;
        s.x += s.speedX * (dt / 1000);
        s.y += s.speedY * (dt / 1000);
        if (s.life >= s.maxLife) {
          this.sparks.splice(i, 1);
        }
      }
      if (this.sparks.length === 0 && this.weatherMode === "sparks") {
        this.weatherMode = "clear";
      }
    }
  }

  private drawFog(ctx: CanvasRenderingContext2D, _zoom: number): void {
    if (this.weatherMode !== "fog") return;
    for (const f of this.fog) {
      ctx.fillStyle = f.color;
      ctx.fillRect(
        Math.floor(f.x),
        Math.floor(f.y),
        Math.floor(f.w),
        Math.floor(f.h),
      );
    }
  }

  private drawSparks(ctx: CanvasRenderingContext2D, zoom: number): void {
    if (this.sparks.length === 0) return;
    const px = Math.max(1, Math.floor(zoom * 0.3));
    for (const s of this.sparks) {
      // Flicker fade: visible with decreasing probability as life progresses.
      const ratio = s.life / s.maxLife;
      if (ratio > 0.7 && Math.random() > (1 - ratio) / 0.3) continue;
      ctx.fillStyle = s.color;
      ctx.fillRect(Math.floor(s.x), Math.floor(s.y), px, px);
    }
  }
}
