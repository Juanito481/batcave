import { BatCaveWorld } from "../world/BatCave";
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
  private width = 0;
  private height = 0;

  private static readonly TILE = 16;

  constructor(ctx: CanvasRenderingContext2D, world: BatCaveWorld) {
    this.ctx = ctx;
    this.world = world;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const T = Renderer.TILE;
    const zoom = Math.max(2, Math.min(
      Math.floor(width / (16 * T)),
      Math.floor(height / (8 * T))
    ));
    const zt = T * zoom;
    const wallRows = height > zt * 10 ? 3 : 2;
    this.world.setDimensions(width, height, wallRows * zt);
  }

  update(deltaMs: number): void {
    this.world.update(deltaMs);
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
    };

    // Clear.
    rc.ctx.fillStyle = P.BG;
    rc.ctx.fillRect(0, 0, rc.width, rc.height);

    // Layer 1: Cave environment (floor, walls, stalactites, stalagmites).
    drawCaveEnvironment(rc);

    // Ambient (between cave and furniture).
    this.world.getAmbient().draw(rc.ctx, zoom);

    // Layer 2: Furniture and floor objects.
    drawAllFurniture(rc);

    // Layer 3: Characters (Y-sorted).
    const agents = this.world.getAgentCharacters();
    const allChars = [this.world.alfred, this.world.giovanni, ...agents].sort((a, b) => a.y - b.y);
    for (const char of allChars) {
      char.draw(rc.ctx, zoom);
    }

    // Layer 4: HUD, tool icons, speech bubbles, timeline.
    drawOverlay(rc);
  }
}
