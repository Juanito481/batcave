/**
 * CompanionSystem — manages casual NPC companions (Ab, Andrea, Arturo)
 * and the audit-triggered Francesco character.
 *
 * Extracted from BatCave.ts to isolate companion lifecycle logic from the
 * broader world-state machinery.
 */

import { Character } from "../entities/Character";
import { Pathfinder } from "./Pathfinder";
import { SpriteSheet } from "../canvas/SpriteGenerator";

/** Per-companion runtime state. */
export interface CompanionState {
  id: string;
  name: string;
  emoji: string;
  char: Character | null;
  present: boolean;
  spawnTimer: number;
  spawnThreshold: number;
  stayTimer: number;
  stayThreshold: number;
  preferredZone: "server" | "workbench" | "display";
  /** Delta-time exit timer — replaces setTimeout for exit animation. */
  exitTimer: number;
  exiting: boolean;
}

/**
 * Agent IDs that trigger Francesco's appearance when active.
 * Francesco is the CTO auditor — he shows up when audit-related agents arrive.
 */
export const AUDIT_AGENTS = ["bishop", "specter", "rook"];

/** Sprites and layout dependencies CompanionSystem needs from BatCave. */
export interface CompanionDeps {
  sprites: Map<string, SpriteSheet>;
  pathfinder: Pathfinder;
  /** Called by updateCompanions to move idle companions. */
  maybeWander(char: Character, dt: number): void;
  worldWidth: number;
  worldHeight: number;
  wallH: number;
  zoom: number;
  zt: number;
}

export class CompanionSystem {
  private companions: CompanionState[];

  // Francesco — appears only when audit agents are active.
  private francesco: Character | null = null;
  private francescoVisible = false;
  private francescoExitTimer = 0;
  private francescoExiting = false;

  private deps: CompanionDeps;

  constructor(deps: CompanionDeps) {
    this.deps = deps;

    // Initialize companions off-screen; they spawn on their own schedules.
    this.companions = [
      {
        id: "ab",
        name: "Ab",
        emoji: "💻",
        char: null,
        present: false,
        spawnTimer: 0,
        spawnThreshold: 10000 + Math.random() * 20000,
        stayTimer: 0,
        stayThreshold: 30000 + Math.random() * 60000,
        preferredZone: "server",
        exitTimer: 0,
        exiting: false,
      },
      {
        id: "andrea",
        name: "Andrea",
        emoji: "🦆",
        char: null,
        present: false,
        spawnTimer: 0,
        spawnThreshold: 15000 + Math.random() * 25000,
        stayTimer: 0,
        stayThreshold: 30000 + Math.random() * 60000,
        preferredZone: "workbench",
        exitTimer: 0,
        exiting: false,
      },
      {
        id: "arturo",
        name: "Arturo",
        emoji: "🤘",
        char: null,
        present: false,
        spawnTimer: 0,
        spawnThreshold: 20000 + Math.random() * 30000,
        stayTimer: 0,
        stayThreshold: 30000 + Math.random() * 60000,
        preferredZone: "display",
        exitTimer: 0,
        exiting: false,
      },
    ];
  }

  // ── Public API ──────────────────────────────────────────

  /** Update dimensions when canvas is resized. */
  updateDimensions(
    worldWidth: number,
    worldHeight: number,
    wallH: number,
    zoom: number,
    zt: number,
  ): void {
    this.deps.worldWidth = worldWidth;
    this.deps.worldHeight = worldHeight;
    this.deps.wallH = wallH;
    this.deps.zoom = zoom;
    this.deps.zt = zt;
  }

  /** Reset all companions to off-screen state (world reset). */
  reset(): void {
    for (const c of this.companions) {
      if (c.char && c.present) c.char.exit();
      c.present = false;
      c.spawnTimer = 0;
      c.spawnThreshold = 15000 + Math.random() * 30000;
      c.stayTimer = 0;
      c.stayThreshold = 30000 + Math.random() * 60000;
    }
    if (this.francescoVisible && this.francesco) {
      this.francesco.exit();
      this.francescoVisible = false;
    }
  }

  /**
   * Tick companion spawn/stay/exit logic and update visible characters.
   *
   * @param dt - Delta time in milliseconds.
   */
  updateCompanions(dt: number): void {
    for (const c of this.companions) {
      // Delta-time exit animation (replaces setTimeout).
      if (c.exiting) {
        c.exitTimer += dt;
        if (c.exitTimer >= 500) {
          // Guard: only hide if still not re-spawned during exit animation.
          if (c.char && !c.present) c.char.visible = false;
          c.exiting = false;
          c.exitTimer = 0;
        }
        continue;
      }

      if (!c.present) {
        // Off-screen — count toward next spawn.
        c.spawnTimer += dt;
        if (c.spawnTimer >= c.spawnThreshold) {
          c.spawnTimer = 0;
          c.stayTimer = 0;
          c.stayThreshold = 30000 + Math.random() * 60000;
          const pos = this.getCompanionZonePosition(c.preferredZone);
          if (!c.char) {
            const sprite = this.deps.sprites.get(c.id);
            if (!sprite) continue;
            c.char = new Character(
              c.id,
              c.name,
              c.emoji,
              sprite,
              pos.x,
              this.deps.worldHeight + 30,
            );
          }
          c.char.enter(pos.x, pos.y);
          c.present = true;
          c.exiting = false;
        }
      } else {
        // In cave — update character, wander, count toward exit.
        if (c.char) {
          c.char.update(dt);
          this.deps.maybeWander(c.char, dt);
        }
        c.stayTimer += dt;
        if (c.stayTimer >= c.stayThreshold) {
          if (c.char) c.char.exit();
          c.present = false;
          c.spawnTimer = 0;
          c.spawnThreshold = 20000 + Math.random() * 40000;
          // Start delta-time exit timer (replaces setTimeout).
          c.exiting = true;
          c.exitTimer = 0;
        }
      }
    }
  }

  /** Update Francesco if currently visible. */
  updateFrancesco(
    dt: number,
    maybeWander: (char: Character, dt: number) => void,
  ): void {
    // Delta-time exit animation for Francesco.
    if (this.francescoExiting) {
      this.francescoExitTimer += dt;
      if (this.francescoExitTimer >= 500) {
        if (this.francesco && !this.francescoVisible) {
          this.francesco.visible = false;
        }
        this.francescoExiting = false;
        this.francescoExitTimer = 0;
      }
    }
    if (this.francesco && this.francescoVisible) {
      this.francesco.update(dt);
      maybeWander(this.francesco, dt);
    }
  }

  /** All companions currently present and visible (for rendering). */
  getVisibleCompanions(): Character[] {
    const result: Character[] = [];
    for (const c of this.companions) {
      if (c.present && c.char && c.char.visible) result.push(c.char);
    }
    return result;
  }

  /** Francesco character for rendering (null if not visible). */
  getFrancesco(): Character | null {
    return this.francescoVisible && this.francesco?.visible
      ? this.francesco
      : null;
  }

  // ── Francesco (audit-triggered) ──────────────────────

  /**
   * Spawn Francesco near an audit agent's position.
   * No-op if he's already visible.
   */
  spawnFrancesco(x: number, y: number): void {
    if (this.francescoVisible) return;
    if (!this.francesco) {
      const sprite = this.deps.sprites.get("francesco");
      if (!sprite) return;
      this.francesco = new Character(
        "francesco",
        "Francesco",
        "👔",
        sprite,
        x,
        this.deps.worldHeight + 30,
      );
    }
    this.francesco.enter(x, y);
    this.francescoVisible = true;
  }

  /** Remove Francesco from the cave. */
  despawnFrancesco(): void {
    if (!this.francescoVisible || !this.francesco) return;
    this.francesco.exit();
    this.francescoVisible = false;
    // Delta-time exit timer (replaces setTimeout).
    this.francescoExiting = true;
    this.francescoExitTimer = 0;
  }

  // ── Private: zone positions ────────────────────────────

  private getCompanionZonePosition(zone: "server" | "workbench" | "display"): {
    x: number;
    y: number;
  } {
    const { worldWidth, worldHeight, wallH, zt, zoom } = this.deps;
    const floorY = wallH + Math.floor((worldHeight - wallH) * 0.82);
    const bcTilesW = Math.min(5, Math.ceil(worldWidth / zt) - 1);
    const bcW = zt * bcTilesW;
    const bcX = Math.floor((worldWidth - bcW) / 2);

    switch (zone) {
      case "server":
        return { x: bcX - zt * 2, y: floorY - zoom * 4 };
      case "workbench":
        return { x: Math.floor(bcX - zt * 5), y: floorY };
      case "display":
        return { x: bcX + bcW + zt * 2, y: floorY - zoom * 4 };
    }
  }
}
