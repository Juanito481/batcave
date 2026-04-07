import { BatCaveWorld } from "../world/BatCave";
import { ParticleSystem } from "../systems/ParticleSystem";
import { SoundSystem } from "../systems/SoundSystem";
import { ReplayEngine } from "../systems/ReplayEngine";
import { Director } from "../systems/Director";
import { RenderContext, P } from "./layers/render-context";
import { drawCaveEnvironment } from "./layers/CaveLayer";
import { drawAllFurniture } from "./layers/FurnitureLayer";
import { drawOverlay } from "./layers/HudLayer";

/**
 * Canvas 2D renderer — thin orchestrator.
 * All drawing logic lives in layers/ modules.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private world: BatCaveWorld;
  private replay: ReplayEngine;
  private director: Director;
  private particles: ParticleSystem;
  private sound: SoundSystem;
  private width = 0;
  private height = 0;

  private static readonly TILE = 16;

  constructor(
    ctx: CanvasRenderingContext2D,
    world: BatCaveWorld,
    replay: ReplayEngine,
  ) {
    this.ctx = ctx;
    this.world = world;
    this.replay = replay;
    this.director = new Director();
    this.particles = new ParticleSystem();
    this.particles.start();
    this.sound = new SoundSystem();
    this.sound.start();
  }

  getReplayEngine(): ReplayEngine {
    return this.replay;
  }
  getDirector(): Director {
    return this.director;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const T = Renderer.TILE;
    const zoom = Math.max(
      2,
      Math.min(Math.floor(width / (16 * T)), Math.floor(height / (8 * T))),
    );
    const zt = T * zoom;
    const wallRows = height > zt * 10 ? 3 : 2;
    this.world.setDimensions(width, height, wallRows * zt);
  }

  update(deltaMs: number): void {
    // In replay mode, advance the replay engine and feed entries to world.
    if (this.replay.isActive()) {
      const entries = this.replay.update(deltaMs);
      for (const entry of entries) {
        this.world.processReplayEntry(entry);
      }
    }
    this.world.update(deltaMs);
    this.particles.update(deltaMs);

    // Director evaluates rules periodically.
    if (this.director.isEnabled() && !this.replay.isActive()) {
      const stats = this.world.getUsageStats();
      const cost = this.world.getSessionCost();
      const decisions = this.director.update(deltaMs, {
        toolCount: stats?.toolCallsThisSession ?? 0,
        costUsd: cost.costUsd,
        costBudget: this.world.getCostBudget(),
        contextPct: stats?.contextFillPct ?? 0,
        activeAgentIds: this.world.getActiveAgentNames(),
        sessionDurationMs: Date.now() - (stats?.sessionStartedAt ?? Date.now()),
      });
      // Auto-approved decisions → launch agents.
      for (const d of decisions) {
        if (d.status === "approved") {
          for (const agentId of d.agentIds) {
            const task = d.tasks.get(agentId) || "";
            this.world.handleDirectorDeployment(agentId, task, d.id);
          }
          d.status = "executing";
        }
      }
    }
  }

  dispose(): void {
    this.particles.stop();
    this.sound.stop();
  }

  getSoundSystem(): SoundSystem {
    return this.sound;
  }

  render(): void {
    const zoom = this.world.getZoom();
    const zt = this.world.getZt();
    const cols = Math.ceil(this.width / zt) + 1;
    const rows = Math.ceil(this.height / zt) + 1;
    const wallRows = this.height > zt * 10 ? 3 : 2;

    const rc: RenderContext = {
      ctx: this.ctx,
      world: this.world,
      replay: this.replay,
      director: this.director,
      width: this.width,
      height: this.height,
      zoom,
      zt,
      wallH: wallRows * zt,
      cols,
      rows,
      wallRows,
      theme: this.world.getRepoTheme(),
      now: Date.now(),
      alfredState: this.world.getAlfredState(),
    };

    // Clear.
    rc.ctx.fillStyle = P.BG;
    rc.ctx.fillRect(0, 0, rc.width, rc.height);

    // Layer 0: Cave environment (floor, walls, stalactites, stalagmites).
    drawCaveEnvironment(rc);

    // Layer 0.5: Ambient (bats, drips, dust, spiders, fireflies).
    this.world.getAmbient().draw(rc.ctx, zoom);

    // Collect all characters for shadow + sprite passes.
    const agents = this.world.getAgentCharacters();
    const companions = this.world.getVisibleCompanions();
    const francesco = this.world.getFrancesco();
    const allChars = [
      this.world.alfred,
      this.world.giovanni,
      ...companions,
      ...agents,
      ...(francesco ? [francesco] : []),
    ].sort((a, b) => a.y - b.y);

    // Layer 1: Shadows (all characters, before furniture).
    for (const char of allChars) {
      char.drawShadow(rc.ctx, zoom);
    }

    // Layer 2: Furniture and floor objects.
    drawAllFurniture(rc);

    // Layer 3: Characters (Y-sorted sprites, no shadow).
    for (const char of allChars) {
      char.draw(rc.ctx, zoom);
    }

    // Layer 3.5: Particles.
    this.particles.draw(rc.ctx, zoom);

    // Layer 4: HUD overlay.
    drawOverlay(rc);
  }
}
