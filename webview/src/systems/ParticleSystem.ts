/**
 * Pool-based particle system — opaque pixel-art particles.
 * No alpha blending, no globalAlpha. All colors are solid palette.
 */

import { bus } from "./EventBus";

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity: number;
}

interface ParticlePreset {
  count: number;
  lifetime: [number, number];
  speed: [number, number];
  spread: number;
  colors: string[];
  size: [number, number];
  gravity: number;
}

const PRESETS: Record<string, ParticlePreset> = {
  "tool-spark": {
    count: 6,
    lifetime: [200, 400],
    speed: [0.02, 0.06],
    spread: Math.PI,
    colors: ["#F39C12", "#E74C3C", "#D4830A"],
    size: [1, 2],
    gravity: 0.0001,
  },
  "agent-enter": {
    count: 10,
    lifetime: [300, 600],
    speed: [0.01, 0.04],
    spread: Math.PI * 2,
    colors: ["#2ECC71", "#27AE60", "#1E8C51"],
    size: [1, 2],
    gravity: -0.00003,
  },
  "agent-exit": {
    count: 8,
    lifetime: [200, 500],
    speed: [0.01, 0.03],
    spread: Math.PI * 2,
    colors: ["#E74C3C", "#C0392B", "#922B21"],
    size: [1, 2],
    gravity: 0.00005,
  },
  "write-glow": {
    count: 3,
    lifetime: [400, 800],
    speed: [0.005, 0.015],
    spread: Math.PI / 2,
    colors: ["#2ECC71", "#27AE60"],
    size: [1, 2],
    gravity: -0.00005,
  },
  "think-pulse": {
    count: 3,
    lifetime: [500, 900],
    speed: [0.003, 0.01],
    spread: Math.PI,
    colors: ["#1E7FD8", "#1565B0"],
    size: [1, 2],
    gravity: -0.00003,
  },
};

const MAX_PARTICLES = 200;

export class ParticleSystem {
  private pool: Particle[] = [];
  private unsub: (() => void) | null = null;

  constructor() {
    // Pre-allocate pool.
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({
        alive: false,
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 0,
        color: "", size: 1, gravity: 0,
      });
    }
  }

  start(): void {
    this.unsub = bus.on("particle:spawn", ({ preset, x, y }) => {
      this.spawn(preset, x, y);
    });
  }

  stop(): void {
    this.unsub?.();
    this.unsub = null;
  }

  private spawn(presetName: string, ox: number, oy: number): void {
    const preset = PRESETS[presetName];
    if (!preset) return;

    for (let i = 0; i < preset.count; i++) {
      const p = this.getDeadParticle();
      if (!p) break;

      const angle = (Math.random() - 0.5) * preset.spread;
      const speed = preset.speed[0] + Math.random() * (preset.speed[1] - preset.speed[0]);

      p.alive = true;
      p.x = ox;
      p.y = oy;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = preset.lifetime[0] + Math.random() * (preset.lifetime[1] - preset.lifetime[0]);
      p.maxLife = p.life;
      p.color = preset.colors[Math.floor(Math.random() * preset.colors.length)];
      p.size = preset.size[0] + Math.floor(Math.random() * (preset.size[1] - preset.size[0] + 1));
      p.gravity = preset.gravity;
    }
  }

  private getDeadParticle(): Particle | null {
    for (const p of this.pool) {
      if (!p.alive) return p;
    }
    return null;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D, zoom: number): void {
    const sz = Math.max(1, zoom);
    for (const p of this.pool) {
      if (!p.alive) continue;
      // Fade via color darkening in last 30% of life.
      const ratio = p.life / p.maxLife;
      if (ratio < 0.3) {
        // Skip drawing — simulates fade without alpha.
        // Only draw every other frame for a flicker effect.
        if (Math.random() > ratio / 0.3) continue;
      }
      ctx.fillStyle = p.color;
      ctx.fillRect(
        Math.floor(p.x),
        Math.floor(p.y),
        sz * p.size,
        sz * p.size,
      );
    }
  }
}
