import { BatCaveWorld } from "../world/BatCave";
import { ParticleSystem } from "../systems/ParticleSystem";
import { SoundSystem } from "../systems/SoundSystem";
import { ReplayEngine } from "../systems/ReplayEngine";
import { Director } from "../systems/Director";
import { RenderContext, P } from "./layers/render-context";
import { CaveLayout, getLayout } from "./layout";
import { drawCaveEnvironment } from "./layers/CaveLayer";
import { drawAllFurniture } from "./layers/FurnitureLayer";
import { drawOverlay } from "./layers/HudLayer";
import { drawMissionBoard } from "./layers/MissionBoardLayer";

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
  private layout: CaveLayout | null = null;
  private layoutMode: "placeholder" | "compact" | "narrow" | "normal" | "wide" =
    "normal";
  private verticalMode = false;

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

    // Responsive layout mode — drives bcTilesW cap and HUD compaction.
    const layoutMode =
      width < 300
        ? "placeholder"
        : width < 420
          ? "compact"
          : width < 700
            ? "narrow"
            : width < 1200
              ? "normal"
              : "wide";

    // True when canvas is significantly taller than wide (portrait VSCode panel).
    const verticalMode = height > width * 1.5;

    // Zoom: fit both width (16 cols) and height (8 rows), then allow one extra
    // step on width to give more horizontal real estate when available.
    const zoomByWidth = Math.floor(width / (16 * T));
    const zoomByHeight = Math.floor(height / (8 * T));
    const zoom = Math.max(2, Math.min(zoomByHeight, zoomByWidth + 1));

    const zt = T * zoom;
    const wallRows = height > zt * 10 ? 3 : 2;
    const wallH = wallRows * zt;
    const upgrades = new Set(this.world.getProgression().getUnlockedUpgrades());
    this.layout = getLayout(
      width,
      height,
      zoom,
      zt,
      wallH,
      upgrades,
      layoutMode,
      verticalMode,
    );
    this.layoutMode = layoutMode;
    this.verticalMode = verticalMode;
    this.world.setDimensions(width, height, wallH, verticalMode, layoutMode);
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
      const decisions = this.director.update(deltaMs, {
        toolCount: stats?.toolCallsThisSession ?? 0,
        toolFailureRate: this.world.getToolFailureRate(),
        toolSampleSize: this.world.getToolSampleSize(),
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
    // Placeholder mode: canvas too narrow to render the full cave.
    if (this.layoutMode === "placeholder") return;

    const zoom = this.world.getZoom();
    const zt = this.world.getZt();
    const cols = Math.ceil(this.width / zt) + 1;
    const rows = Math.ceil(this.height / zt) + 1;
    const wallRows = this.height > zt * 10 ? 3 : 2;
    // Recompute layout if not yet initialized (shouldn't happen, but safe fallback).
    if (!this.layout) {
      const upgrades = new Set(
        this.world.getProgression().getUnlockedUpgrades(),
      );
      this.layout = getLayout(
        this.width,
        this.height,
        zoom,
        zt,
        wallRows * zt,
        upgrades,
        this.layoutMode,
        this.verticalMode,
      );
    }

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
      layout: this.layout,
      layoutMode: this.layoutMode,
      verticalMode: this.verticalMode,
    };

    // Cave shake from CaveReactionSystem (achievement unlock, etc).
    const shakeOffset = this.world.getCaveReactions().shakeOffset;
    if (shakeOffset !== 0) {
      rc.ctx.save();
      rc.ctx.translate(shakeOffset, 0);
    }

    // Giovanni zoom boost: brief scale-in towards Batcomputer when Giovanni is
    // clicked. Raw value is 0..500 (ms accumulator), normalized to 0..1 and
    // mapped to a max 15% scale increase. Centered on Batcomputer midpoint so
    // the camera "pushes in" towards the screens rather than expanding from
    // the top-left corner.
    const rawBoost = this.world.getGiovanniZoomBoost();
    const boostActive = rawBoost > 0 && this.layout !== null;
    if (boostActive && this.layout) {
      const boostNorm = rawBoost / 500; // 0..1
      const boostScale = 1 + boostNorm * 0.15; // 1.0 .. 1.15
      const cx = this.layout.bcX + this.layout.bcW / 2;
      const cy = this.layout.bcY + this.layout.bcH / 2;
      rc.ctx.save();
      // Translate so the Batcomputer center stays fixed during scale.
      rc.ctx.translate(cx * (1 - boostScale), cy * (1 - boostScale));
      rc.ctx.scale(boostScale, boostScale);
    }

    // Clear.
    rc.ctx.fillStyle = P.BG;
    rc.ctx.fillRect(0, 0, rc.width, rc.height);

    // Layer 0: Cave environment (floor, walls, stalactites, stalagmites).
    drawCaveEnvironment(rc);

    // Layer 0.25: Mission board (wall-mounted, behind ambient + characters).
    drawMissionBoard(rc);

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

    // Close zoom boost transform before HUD so overlay is never scaled.
    if (boostActive) {
      rc.ctx.restore();
    }

    // Layer 4: HUD overlay.
    drawOverlay(rc);

    // Easter egg: mirror cave — invert colors via compositing (no filter API needed).
    const easterEggs = this.world.getEasterEggs();
    if (easterEggs.mirrorCave) {
      rc.ctx.save();
      rc.ctx.globalCompositeOperation = "difference";
      rc.ctx.fillStyle = "#FFFFFF";
      rc.ctx.fillRect(0, 0, rc.width, rc.height);
      rc.ctx.restore();
    }

    if (shakeOffset !== 0) {
      rc.ctx.restore();
    }
  }
}
