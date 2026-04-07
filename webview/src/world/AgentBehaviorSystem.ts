/**
 * AgentBehaviorSystem — zone-based idle behaviors, quips, and interactions
 * for all 13 Scacchiera agents.
 *
 * Extracted from BatCave.ts to isolate the "what agents do when idle" logic
 * from the broader world-state machinery.
 */

import { Character } from "../entities/Character";
import { Pathfinder } from "./Pathfinder";
import {
  AGENT_PERSONALITIES,
  AGENT_INTERACTIONS,
  AgentZone,
  AgentInteraction,
} from "../data/agent-personalities";
import { bus } from "../systems/EventBus";

/** Minimal world dimensions AgentBehaviorSystem needs from BatCave. */
export interface AgentBehaviorDeps {
  pathfinder: Pathfinder;
  /** Returns the current Alfred character (position may change each frame). */
  getAlfred(): Character;
  worldWidth: number;
  worldHeight: number;
  wallH: number;
  zoom: number;
  zt: number;
}

export class AgentBehaviorSystem {
  // Per-agent quip text + countdown (ms).
  private agentQuips = new Map<string, { text: string; timer: number }>();
  // How long each agent has been idle since last quip (ms).
  private agentQuipTimers = new Map<string, number>();
  // Randomized threshold for next quip per agent (ms).
  private agentQuipThresholds = new Map<string, number>();

  // Per-agent idle behavior counter (ms until next zone move).
  private agentBehaviorTimers = new Map<string, number>();

  // Pending walk-to-zone after enter animation.
  private pendingWalkToZone = new Map<string, { x: number; y: number }>();

  // Interaction cooldown.
  private interactionTimer = 0;

  private deps: AgentBehaviorDeps;

  constructor(deps: AgentBehaviorDeps) {
    this.deps = deps;
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

  /**
   * Queue an agent to walk to its zone after the enter animation completes.
   * Called by BatCave when an agent_enter event fires.
   */
  queueWalkToZone(agentId: string, target: { x: number; y: number }): void {
    this.pendingWalkToZone.set(agentId, target);
  }

  /** Remove all state for a departed agent. */
  cleanupAgent(agentId: string): void {
    this.agentQuips.delete(agentId);
    this.agentQuipTimers.delete(agentId);
    this.agentQuipThresholds.delete(agentId);
    this.agentBehaviorTimers.delete(agentId);
  }

  /** Reset all per-agent state (world reset). */
  reset(): void {
    this.agentQuips.clear();
    this.agentQuipTimers.clear();
    this.agentQuipThresholds.clear();
    this.agentBehaviorTimers.clear();
    this.pendingWalkToZone.clear();
    this.interactionTimer = 0;
  }

  /**
   * Tick all agent behaviors.
   *
   * @param dt - Delta time in milliseconds.
   * @param agents - Live agent characters keyed by agentId.
   */
  update(dt: number, agents: Map<string, Character>): void {
    for (const [agentId, char] of agents) {
      char.update(dt);
      this.updateAgentBehavior(agentId, char, dt);
    }
    this.updateInteractions(dt, agents);
  }

  /** Get current quip text for a given agent, or null if none active. */
  getAgentQuip(agentId: string): string | null {
    return this.agentQuips.get(agentId)?.text ?? null;
  }

  // ── Event-reactive agent behaviors ─────────────────

  /**
   * React to a tool event — agents have opinions about your code.
   * Called by BatCave on tool_start.
   */
  reactToTool(
    toolName: string,
    agents: Map<string, Character>,
    consecutiveBashCount: number,
  ): void {
    // Bishop reacts to Edit without Read.
    if ((toolName === "Edit" || toolName === "Write") && agents.has("bishop")) {
      // Bishop walks toward Alfred and comments.
      const bishop = agents.get("bishop")!;
      if (bishop.visible && bishop.state === "idle") {
        const alfred = this.deps.getAlfred();
        const path = this.deps.pathfinder.findPath(
          bishop.x,
          bishop.y,
          alfred.x + this.deps.zoom * 10,
          alfred.y,
        );
        if (path.length > 0) bishop.moveAlongPath(path);
        bishop.showEmotion("check", 1200);
      }
    }

    // Chancellor warns after 5+ consecutive Bash.
    if (
      toolName === "Bash" &&
      consecutiveBashCount >= 5 &&
      agents.has("chancellor")
    ) {
      this.agentQuips.set("chancellor", {
        text: "The pipeline WILL break.",
        timer: 3500,
      });
      const chancellor = agents.get("chancellor")!;
      if (chancellor.visible) chancellor.showEmotion("!", 1500);
    }

    // Cardinal runs to workbench when tests might be involved.
    if (toolName === "Bash" && agents.has("cardinal")) {
      const cardinal = agents.get("cardinal")!;
      if (cardinal.visible && cardinal.state === "idle") {
        const pos = this.getZonePosition("workbench", "cardinal");
        if (pos) {
          const path = this.deps.pathfinder.findPath(
            cardinal.x,
            cardinal.y,
            pos.x,
            pos.y,
          );
          if (path.length > 0) cardinal.moveAlongPath(path);
        }
      }
    }
  }

  /**
   * React to agent spawn — other agents acknowledge newcomers.
   */
  reactToAgentEnter(newAgentId: string, agents: Map<string, Character>): void {
    // King acknowledges with a nod.
    if (newAgentId !== "king" && agents.has("king")) {
      const king = agents.get("king")!;
      if (king.visible) king.showEmotion("check", 1200);
    }

    // Queen analyzes with a question.
    if (newAgentId !== "queen" && agents.has("queen")) {
      const queen = agents.get("queen")!;
      if (queen.visible) queen.showEmotion("?", 1200);
    }

    // Pawn runs to brief the newcomer.
    if (newAgentId !== "pawn" && agents.has("pawn")) {
      const pawn = agents.get("pawn")!;
      const newAgent = agents.get(newAgentId);
      if (pawn.visible && newAgent && pawn.state === "idle") {
        const path = this.deps.pathfinder.findPath(
          pawn.x,
          pawn.y,
          newAgent.x + this.deps.zoom * 8,
          newAgent.y,
        );
        if (path.length > 0) pawn.moveAlongPath(path);
        this.agentQuips.set("pawn", {
          text: "I'll brief them, sir!",
          timer: 3000,
        });
      }
    }
  }

  /**
   * React to a short commit message — Bishop disapproves.
   */
  reactToShortCommitMessage(agents: Map<string, Character>): void {
    if (agents.has("bishop")) {
      const bishop = agents.get("bishop")!;
      if (bishop.visible) {
        bishop.showEmotion("?", 2000);
        this.agentQuips.set("bishop", {
          text: "That commit message... really?",
          timer: 3500,
        });
      }
    }
  }

  /**
   * Handle click on an agent — they turn and respond directly.
   * Returns a contextual quip or null.
   */
  clickAgent(agentId: string, agents: Map<string, Character>): string | null {
    const char = agents.get(agentId);
    if (!char || !char.visible) return null;

    const personality = AGENT_PERSONALITIES[agentId];
    if (!personality || personality.quips.length === 0) return null;

    // Show emotion and pick a quip.
    char.showEmotion("!", 1000);
    const quip =
      personality.quips[Math.floor(Math.random() * personality.quips.length)];
    this.agentQuips.set(agentId, { text: quip, timer: 4000 });
    bus.emit("sound:play", { id: "interaction-chime" });
    return quip;
  }

  // ── Zone position helpers ──────────────────────────────

  /** Get spawn/target position for an agent zone (deterministic jitter). */
  getZonePosition(
    zone: AgentZone,
    agentId: string,
  ): { x: number; y: number } | null {
    const { worldWidth, worldHeight, wallH, zt, zoom } = this.deps;
    const floorY = wallH + Math.floor((worldHeight - wallH) * 0.82);
    const bcTilesW = Math.min(5, Math.ceil(worldWidth / zt) - 1);
    const bcW = zt * bcTilesW;
    const bcX = Math.floor((worldWidth - bcW) / 2);
    // Deterministic wide jitter so agents in same zone spread out.
    const hash = agentId.charCodeAt(0) * 31 + (agentId.charCodeAt(1) || 0);
    const jitterX = ((hash % 11) - 5) * zoom * 6;
    const jitterY = ((hash % 7) - 3) * zoom * 2;

    switch (zone) {
      case "batcomputer":
        return { x: bcX + bcW / 2 + jitterX, y: floorY - zoom * 4 + jitterY };
      case "server":
        return { x: bcX - zt * 3 + jitterX, y: floorY - zoom * 2 + jitterY };
      case "workbench":
        return { x: bcX - zt * 6 + jitterX, y: floorY + jitterY };
      case "display":
        return {
          x: bcX + bcW + zt * 2 + jitterX,
          y: floorY - zoom * 2 + jitterY,
        };
      case "patrol":
        return { x: worldWidth * 0.15 + jitterX, y: floorY + jitterY };
      case "follow": {
        const alfred = this.deps.getAlfred();
        return { x: alfred.x + zoom * 16, y: alfred.y + zoom * 2 };
      }
      case "entrance":
        return { x: worldWidth * 0.92 + jitterX, y: floorY + jitterY };
      default:
        return null;
    }
  }

  // ── Private: per-agent idle behavior ──────────────────

  private updateAgentBehavior(
    agentId: string,
    char: Character,
    dt: number,
  ): void {
    // After enter animation finishes, walk to assigned zone.
    if (char.state === "idle" && this.pendingWalkToZone.has(agentId)) {
      const target = this.pendingWalkToZone.get(agentId)!;
      this.pendingWalkToZone.delete(agentId);
      const path = this.deps.pathfinder.findPath(
        char.x,
        char.y,
        target.x,
        target.y,
      );
      if (path.length > 0) {
        char.moveAlongPath(path);
      } else {
        char.moveTo(target.x, target.y);
      }
      return;
    }

    if (char.state !== "idle") {
      this.agentBehaviorTimers.delete(agentId);
      return;
    }

    const personality = AGENT_PERSONALITIES[agentId];
    if (!personality) {
      this.maybeWanderGeneric(char, dt);
      return;
    }

    // Quips (every 20-40s when idle).
    this.updateAgentQuip(agentId, dt);

    const timer = (this.agentBehaviorTimers.get(agentId) ?? 0) + dt;
    const threshold = 5000 + (agentId.charCodeAt(0) % 4) * 2000;
    if (timer < threshold) {
      this.agentBehaviorTimers.set(agentId, timer);
      return;
    }
    this.agentBehaviorTimers.set(agentId, 0);

    switch (personality.idleBehavior) {
      case "survey":
        // King: stands still most of the time, occasionally turns.
        if (Math.random() < 0.3) this.wanderInZone(char, "batcomputer");
        break;
      case "pace":
        // Queen: paces between batcomputer and other zones.
        this.wanderInZone(
          char,
          Math.random() < 0.5 ? "batcomputer" : "workbench",
        );
        break;
      case "guard":
        // White Rook: patrols perimeter.
        this.patrolPerimeter(char);
        break;
      case "inspect":
        // Bishop: wanders between workbench and furniture.
        this.wanderInZone(char, Math.random() < 0.7 ? "workbench" : "display");
        break;
      case "draft":
        // Knight: goes between batcomputer and workbench.
        this.wanderInZone(
          char,
          Math.random() < 0.6 ? "batcomputer" : "workbench",
        );
        break;
      case "note":
        // Pawn: follows Alfred.
        this.followAlfred(char);
        break;
      case "lurk":
        // Black Rook: sneaks around server area.
        this.wanderInZone(char, Math.random() < 0.6 ? "server" : "patrol");
        break;
      case "demolish":
        // Black Bishop: inspects everything.
        this.wanderInZone(char, Math.random() < 0.5 ? "workbench" : "server");
        break;
      case "chaos":
        // Black Knight: erratic random movement.
        this.chaosWander(char);
        break;
      case "maintain":
        // Chancellor: stays near server rack.
        this.wanderInZone(char, "server");
        break;
      case "test":
        // Cardinal: workbench area.
        this.wanderInZone(
          char,
          Math.random() < 0.8 ? "workbench" : "batcomputer",
        );
        break;
      case "scan":
        // Scout: display panel.
        this.wanderInZone(
          char,
          Math.random() < 0.7 ? "display" : "batcomputer",
        );
        break;
      case "standby":
        // Ship: stays near entrance, barely moves.
        if (Math.random() < 0.2) this.wanderInZone(char, "entrance");
        break;
    }
  }

  // ── Wandering helpers ──────────────────────────────────

  /** Walk to a random point within a zone. */
  private wanderInZone(char: Character, zone: AgentZone): void {
    const pos = this.getZonePosition(zone, char.id);
    if (!pos) return;
    const { zoom } = this.deps;
    const jx = (Math.random() - 0.5) * zoom * 16;
    const jy = (Math.random() - 0.5) * zoom * 6;
    const path = this.deps.pathfinder.findPath(
      char.x,
      char.y,
      pos.x + jx,
      pos.y + jy,
    );
    if (path.length > 0) char.moveAlongPath(path);
  }

  /** Patrol perimeter path (White Rook behavior). */
  private patrolPerimeter(char: Character): void {
    const { worldWidth, worldHeight, wallH, zoom } = this.deps;
    const floorY = wallH + Math.floor((worldHeight - wallH) * 0.82);
    const margin = worldWidth * 0.08;
    const side = Math.floor(Math.random() * 4);
    let tx: number, ty: number;
    switch (side) {
      case 0:
        tx = margin;
        ty = floorY;
        break;
      case 1:
        tx = worldWidth - margin;
        ty = floorY;
        break;
      case 2:
        tx = worldWidth * 0.5;
        ty = floorY - zoom * 8;
        break;
      default:
        tx = worldWidth * 0.5;
        ty = floorY + zoom * 4;
        break;
    }
    const path = this.deps.pathfinder.findPath(char.x, char.y, tx, ty);
    if (path.length > 0) char.moveAlongPath(path);
  }

  /** Follow Alfred at a respectful distance (Pawn behavior). */
  private followAlfred(char: Character): void {
    const { zoom } = this.deps;
    const alfred = this.deps.getAlfred();
    const offset = zoom * 14;
    const tx = alfred.x + offset;
    const ty = alfred.y + zoom * 2;
    const dx = tx - char.x;
    const dy = ty - char.y;
    if (Math.sqrt(dx * dx + dy * dy) > offset * 0.6) {
      const path = this.deps.pathfinder.findPath(char.x, char.y, tx, ty);
      if (path.length > 0) char.moveAlongPath(path);
    }
  }

  /** Chaotic random movement (Black Knight behavior). */
  private chaosWander(char: Character): void {
    const { worldWidth, worldHeight, wallH, zoom } = this.deps;
    const floorY = wallH + Math.floor((worldHeight - wallH) * 0.82);
    const tx = Math.random() * worldWidth * 0.8 + worldWidth * 0.1;
    const ty = floorY + (Math.random() - 0.5) * zoom * 12;
    const path = this.deps.pathfinder.findPath(char.x, char.y, tx, ty);
    if (path.length > 0) char.moveAlongPath(path);
  }

  /**
   * Generic wander for agents without a personality entry.
   * Uses the same 4-8s interval as BatCave.maybeWander but scoped to floor.
   */
  private maybeWanderGeneric(char: Character, deltaMs: number): void {
    if (char.state !== "idle") return;
    const timer = (this.agentBehaviorTimers.get(char.id) ?? 0) + deltaMs;
    const threshold = 4000 + (char.id.charCodeAt(0) % 5) * 1000;
    if (timer < threshold) {
      this.agentBehaviorTimers.set(char.id, timer);
      return;
    }
    this.agentBehaviorTimers.set(char.id, 0);
    const { worldWidth, worldHeight, wallH, zoom } = this.deps;
    const floorY = wallH + Math.floor((worldHeight - wallH) * 0.82);
    const margin = worldWidth * 0.1;
    const tx = margin + Math.random() * (worldWidth - margin * 2);
    const ty = floorY + (Math.random() - 0.5) * zoom * 8;
    const path = this.deps.pathfinder.findPath(char.x, char.y, tx, ty);
    if (path.length > 0) char.moveAlongPath(path);
  }

  // ── Agent quips ────────────────────────────────────────

  private updateAgentQuip(agentId: string, dt: number): void {
    // Tick active quip down.
    if (this.agentQuips.has(agentId)) {
      const quip = this.agentQuips.get(agentId)!;
      quip.timer -= dt;
      if (quip.timer <= 0) this.agentQuips.delete(agentId);
      return;
    }

    const timer = (this.agentQuipTimers.get(agentId) ?? 0) + dt;
    const threshold =
      this.agentQuipThresholds.get(agentId) ?? 20000 + Math.random() * 20000;

    if (timer < threshold) {
      this.agentQuipTimers.set(agentId, timer);
      return;
    }

    // Fire quip.
    this.agentQuipTimers.set(agentId, 0);
    this.agentQuipThresholds.set(agentId, 20000 + Math.random() * 20000);

    const personality = AGENT_PERSONALITIES[agentId];
    if (!personality || personality.quips.length === 0) return;

    const text =
      personality.quips[Math.floor(Math.random() * personality.quips.length)];
    this.agentQuips.set(agentId, { text, timer: 4000 });
  }

  // ── Agent interactions ─────────────────────────────────

  private updateInteractions(dt: number, agents: Map<string, Character>): void {
    this.interactionTimer += dt;
    if (this.interactionTimer < 8000) return; // Check every 8s.
    this.interactionTimer = 0;

    for (const rule of AGENT_INTERACTIONS) {
      const charA = agents.get(rule.agentA);
      const charB = agents.get(rule.agentB);
      if (!charA || !charB || !charA.visible || !charB.visible) continue;
      if (charA.state !== "idle" && charB.state !== "idle") continue;

      switch (rule.type) {
        case "confront":
          this.confrontAgents(charA, charB, rule);
          break;
        case "collaborate":
          this.collaborateAgents(charA, charB, rule);
          break;
        case "block":
          this.blockAgent(charA, charB, rule);
          break;
        case "follow":
          this.followAgent(charA, charB, rule);
          break;
        case "repel":
          this.repelAgent(charA, charB, rule);
          break;
      }

      // Only one interaction per cycle.
      break;
    }
  }

  private confrontAgents(
    a: Character,
    b: Character,
    rule: AgentInteraction,
  ): void {
    const { zoom } = this.deps;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const offset = zoom * 8;
    if (a.state === "idle") {
      const path = this.deps.pathfinder.findPath(a.x, a.y, midX - offset, midY);
      if (path.length > 0) a.moveAlongPath(path);
    }
    if (b.state === "idle") {
      const path = this.deps.pathfinder.findPath(b.x, b.y, midX + offset, midY);
      if (path.length > 0) b.moveAlongPath(path);
    }
    if (rule.quipA)
      this.agentQuips.set(a.id, { text: rule.quipA, timer: 4000 });
    if (rule.quipB)
      this.agentQuips.set(b.id, { text: rule.quipB, timer: 4000 });
    bus.emit("sound:play", { id: "interaction-chime" });
  }

  private collaborateAgents(
    a: Character,
    b: Character,
    rule: AgentInteraction,
  ): void {
    const { zoom } = this.deps;
    const zone = AGENT_PERSONALITIES[a.id]?.zone || "workbench";
    const pos = this.getZonePosition(zone, a.id);
    if (!pos) return;
    if (a.state === "idle") {
      const path = this.deps.pathfinder.findPath(
        a.x,
        a.y,
        pos.x - zoom * 6,
        pos.y,
      );
      if (path.length > 0) a.moveAlongPath(path);
    }
    if (b.state === "idle") {
      const path = this.deps.pathfinder.findPath(
        b.x,
        b.y,
        pos.x + zoom * 6,
        pos.y,
      );
      if (path.length > 0) b.moveAlongPath(path);
    }
    if (rule.quipA)
      this.agentQuips.set(a.id, { text: rule.quipA, timer: 4000 });
    if (rule.quipB)
      this.agentQuips.set(b.id, { text: rule.quipB, timer: 4000 });
    bus.emit("sound:play", { id: "interaction-chime" });
  }

  private blockAgent(
    blocker: Character,
    intruder: Character,
    rule: AgentInteraction,
  ): void {
    const serverPos = this.getZonePosition("server", blocker.id);
    if (!serverPos) return;
    const blockX = (intruder.x + serverPos.x) / 2;
    const blockY = (intruder.y + serverPos.y) / 2;
    if (blocker.state === "idle") {
      const path = this.deps.pathfinder.findPath(
        blocker.x,
        blocker.y,
        blockX,
        blockY,
      );
      if (path.length > 0) blocker.moveAlongPath(path);
    }
    if (rule.quipA)
      this.agentQuips.set(blocker.id, { text: rule.quipA, timer: 4000 });
    if (rule.quipB)
      this.agentQuips.set(intruder.id, { text: rule.quipB, timer: 4000 });
    bus.emit("sound:play", { id: "interaction-chime" });
  }

  private followAgent(
    leader: Character,
    follower: Character,
    rule: AgentInteraction,
  ): void {
    const { zoom } = this.deps;
    if (follower.state === "idle") {
      const path = this.deps.pathfinder.findPath(
        follower.x,
        follower.y,
        leader.x + zoom * 10,
        leader.y + zoom * 2,
      );
      if (path.length > 0) follower.moveAlongPath(path);
    }
    if (rule.quipA)
      this.agentQuips.set(leader.id, { text: rule.quipA, timer: 4000 });
    if (rule.quipB)
      this.agentQuips.set(follower.id, { text: rule.quipB, timer: 4000 });
  }

  private repelAgent(
    repeller: Character,
    fleeing: Character,
    rule: AgentInteraction,
  ): void {
    const { zoom } = this.deps;
    const dx = fleeing.x - repeller.x;
    const dy = fleeing.y - repeller.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const fleeX = fleeing.x + (dx / dist) * zoom * 20;
    const fleeY = fleeing.y + (dy / dist) * zoom * 8;
    if (fleeing.state === "idle") {
      const path = this.deps.pathfinder.findPath(
        fleeing.x,
        fleeing.y,
        fleeX,
        fleeY,
      );
      if (path.length > 0) fleeing.moveAlongPath(path);
    }
    if (rule.quipA)
      this.agentQuips.set(repeller.id, { text: rule.quipA, timer: 4000 });
    if (rule.quipB)
      this.agentQuips.set(fleeing.id, { text: rule.quipB, timer: 4000 });
  }
}
