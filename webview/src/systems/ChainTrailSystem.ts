/**
 * ChainTrailSystem — visualizes Marshal-driven agent chains as
 * a stream of accent-blue particles that travel from Marshal's
 * position to the position of any new agent that enters while
 * Marshal is still active.
 *
 * Sprint 2.3 Track C. Sits on top of the existing ParticleSystem
 * via the bus instead of owning its own pool.
 *
 * Trail tuning:
 * - 8 particles per trail
 * - 800ms traversal
 * - particles spawn one every ~100ms via per-frame accumulator
 *   (no setTimeout — game loop only, per CLAUDE.md rule)
 */

import { bus } from "./EventBus";

interface PendingTrail {
  /** Source x (Marshal's position when the trail started). */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Particles already emitted. */
  emitted: number;
  /** Time accumulated since last emission, in ms. */
  accumulator: number;
}

const TOTAL_PARTICLES = 8;
const SPACING_MS = 100;
const PARENT_AGENT_ID = "marshal";

export class ChainTrailSystem {
  private trails: PendingTrail[] = [];
  /** Active agent positions, keyed by agentId. */
  private agentPositions = new Map<string, { x: number; y: number }>();
  private unsubEnter: (() => void) | null = null;
  private unsubExit: (() => void) | null = null;

  start(): void {
    this.unsubEnter = bus.on("agent:enter", ({ agentId, x, y }) => {
      this.handleAgentEnter(agentId, x, y);
    });
    this.unsubExit = bus.on("agent:exit", ({ agentId }) => {
      this.agentPositions.delete(agentId);
    });
  }

  stop(): void {
    this.unsubEnter?.();
    this.unsubExit?.();
    this.unsubEnter = null;
    this.unsubExit = null;
    this.trails = [];
    this.agentPositions.clear();
  }

  private handleAgentEnter(agentId: string, x: number, y: number): void {
    // Record the new agent's position regardless.
    this.agentPositions.set(agentId, { x, y });

    // Only emit trails when Marshal is the orchestrator and the entrant
    // is some other agent.
    if (agentId === PARENT_AGENT_ID) return;
    const marshalPos = this.agentPositions.get(PARENT_AGENT_ID);
    if (!marshalPos) return;

    this.trails.push({
      fromX: marshalPos.x,
      fromY: marshalPos.y,
      toX: x,
      toY: y,
      emitted: 0,
      accumulator: 0,
    });
  }

  update(dt: number): void {
    if (this.trails.length === 0) return;

    for (const t of this.trails) {
      t.accumulator += dt;
      while (t.accumulator >= SPACING_MS && t.emitted < TOTAL_PARTICLES) {
        t.accumulator -= SPACING_MS;
        const ratio = t.emitted / TOTAL_PARTICLES;
        const px = t.fromX + (t.toX - t.fromX) * ratio;
        const py = t.fromY + (t.toY - t.fromY) * ratio;
        bus.emit("particle:spawn", {
          preset: "chain-trail",
          x: px,
          y: py,
        });
        t.emitted++;
      }
    }
    // Drop completed trails.
    this.trails = this.trails.filter((t) => t.emitted < TOTAL_PARTICLES);
  }
}
