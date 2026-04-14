/**
 * Agent personality system — unique behaviors, quips, zones, and body types
 * for each of the 21 Scacchiera v4.1 chess-piece agents.
 *
 * Each agent has:
 * - bodyType: which sprite body template to use (reused across agents where semantics overlap)
 * - zone: preferred area in the cave
 * - idleBehavior: what they do when not working
 * - quips: 4 signature lines shown in speech bubbles
 *
 * Body archetypes stay at 12 (v2.0.0 sprite generator); new agents reuse archetypes,
 * distinguished by zone + color + behavior + quips.
 */

export type BodyType =
  | "standard" // Default humanoid (Knight, Weaver, Marshal alt)
  | "batman" // Dark cape (T-colored), utility belt, cowl (Giovanni)
  | "caped" // Wide cape from shoulders (King)
  | "robed" // Dress/robe widens at bottom (Queen, Oracle)
  | "armored" // Wider, stocky, boxy (Rook, Marshal)
  | "coated" // Long coat below waist (Bishop, Herald)
  | "hooded" // Cloak + hood, narrow (Marauder, Thief)
  | "heavy" // Very wide shoulders (Specter)
  | "glitch" // Asymmetric, irregular (Heretic, Polymorph)
  | "labcoat" // Clean lab coat (Cardinal, Sculptor)
  | "geared" // Vest with equipment (Scout)
  | "compact" // Shorter body (Pawn, Loop)
  | "naval"; // Broad shoulders, coat (Ship)

export type AgentZone =
  | "batcomputer" // Center, near main screens
  | "server" // Left of batcomputer, server rack area
  | "workbench" // Far left, workbench/tools area
  | "display" // Right of batcomputer, display panel
  | "patrol" // Walks perimeter
  | "follow" // Follows Alfred
  | "entrance"; // Right side, near exit

export type IdleBehavior =
  | "survey" // Stands still, surveys cave (King, Marshal)
  | "pace" // Strategic pacing between points (Queen, Loop)
  | "guard" // Patrols perimeter slowly (Rook)
  | "inspect" // Examines furniture closely (Bishop, Herald)
  | "draft" // Goes to planning table (Knight, Sculptor)
  | "note" // Follows Alfred, takes notes (Pawn)
  | "lurk" // Sneaks around edges (Marauder, Thief)
  | "demolish" // Inspects weak points (Specter)
  | "chaos" // Erratic random movement (Heretic, Polymorph)
  | "maintain" // Checks server rack (Chancellor, Weaver)
  | "test" // Works at workbench (Cardinal)
  | "scan" // Watches display panel (Scout, Oracle)
  | "standby"; // Waits near entrance (Ship)

export interface AgentPersonality {
  bodyType: BodyType;
  zone: AgentZone;
  idleBehavior: IdleBehavior;
  quips: string[];
  walkSpeed?: number; // Multiplier (default 1.0)
}

// ── Agent Interactions ──────────────────────────────────
// When specific agent pairs are both active, they interact.

export interface AgentInteraction {
  agentA: string;
  agentB: string;
  type: "confront" | "collaborate" | "block" | "follow" | "repel";
  quipA?: string; // A says this when interaction triggers
  quipB?: string; // B says this
}

export const AGENT_INTERACTIONS: AgentInteraction[] = [
  {
    agentA: "bishop",
    agentB: "specter",
    type: "confront",
    quipA: "This code needs review.",
    quipB: "This code needs demolition.",
  },
  {
    agentA: "king",
    agentB: "queen",
    type: "collaborate",
    quipA: "Your analysis, Stratega?",
    quipB: "Three paths forward, Sovrano.",
  },
  {
    agentA: "rook",
    agentB: "marauder",
    type: "block",
    quipA: "Step away from the servers.",
    quipB: "You can't guard everything.",
  },
  {
    agentA: "knight",
    agentB: "pawn",
    type: "follow",
    quipA: "Document this structure.",
    quipB: "On it, Architetto.",
  },
  {
    agentA: "cardinal",
    agentB: "bishop",
    type: "collaborate",
    quipA: "I'll write the test.",
    quipB: "I'll find the smell.",
  },
  {
    agentA: "heretic",
    agentB: "chancellor",
    type: "repel",
    quipA: "What if the pipeline... didn't?",
    quipB: "Stay away from CI.",
  },
  {
    agentA: "marshal",
    agentB: "knight",
    type: "collaborate",
    quipA: "Chain assembled. Execute on my mark.",
    quipB: "Architecture ready, Maresciallo.",
  },
  {
    agentA: "herald",
    agentB: "sculptor",
    type: "collaborate",
    quipA: "Tokens say accent blue here.",
    quipB: "Mapping Fox to component now.",
  },
  {
    agentA: "thief",
    agentB: "king",
    type: "follow",
    quipA: "Found something we should steal, Sovrano.",
    quipB: "Show me the pattern, Ladro.",
  },
  {
    agentA: "oracle",
    agentB: "specter",
    type: "collaborate",
    quipA: "39 isolated nodes in the graph.",
    quipB: "Debt candidates identified.",
  },
  {
    agentA: "polymorph",
    agentB: "heretic",
    type: "repel",
    quipA: "I can become whatever you need.",
    quipB: "Fragility by opportunism.",
  },
  {
    agentA: "weaver",
    agentB: "cardinal",
    type: "collaborate",
    quipA: "API contract pinned.",
    quipB: "Integration suite updated.",
  },
  {
    agentA: "scout",
    agentB: "queen",
    type: "collaborate",
    quipA: "Visual report ready.",
    quipB: "Show me the metrics.",
  },
];

// ── Cave Evolution Milestones ──────────────────────────

export interface CaveMilestone {
  level: number;
  name: string;
  requiredTools: number;
  decoration: string; // ID for FurnitureLayer to render
}

export const CAVE_MILESTONES: CaveMilestone[] = [
  { level: 1, name: "Empty Cave", requiredTools: 0, decoration: "none" },
  { level: 2, name: "First Light", requiredTools: 50, decoration: "trophy" },
  { level: 3, name: "The Workshop", requiredTools: 100, decoration: "plaques" },
  {
    level: 4,
    name: "Command Center",
    requiredTools: 250,
    decoration: "banner",
  },
  {
    level: 5,
    name: "The Fortress",
    requiredTools: 500,
    decoration: "gold-trim",
  },
  { level: 6, name: "Legendary", requiredTools: 1000, decoration: "legendary" },
];

export const AGENT_PERSONALITIES: Record<string, AgentPersonality> = {
  king: {
    bodyType: "caped",
    zone: "batcomputer",
    idleBehavior: "survey",
    quips: [
      "The architecture must serve the vision.",
      "I see the full board from here.",
      "Every commit must have purpose.",
      "Coherence above all.",
    ],
    walkSpeed: 0.8,
  },
  queen: {
    bodyType: "robed",
    zone: "batcomputer",
    idleBehavior: "pace",
    quips: [
      "Three options. One is clearly optimal.",
      "Let me reframe the requirements.",
      "The ROI on this refactor is clear.",
      "Strategy before tactics.",
    ],
    walkSpeed: 0.9,
  },
  rook: {
    bodyType: "armored",
    zone: "server",
    idleBehavior: "guard",
    quips: [
      "Perimeter secure. No vulnerabilities.",
      "This endpoint needs rate limiting.",
      "I've reinforced the auth layer.",
      "All ports locked down.",
    ],
    walkSpeed: 0.7,
  },
  bishop: {
    bodyType: "coated",
    zone: "workbench",
    idleBehavior: "inspect",
    quips: [
      "Hmm, this coupling concerns me.",
      "I see a pattern violation here.",
      "The code smell is strongest here.",
      "Let me look closer...",
    ],
  },
  knight: {
    bodyType: "standard",
    zone: "batcomputer",
    idleBehavior: "draft",
    quips: [
      "The architecture needs a port here.",
      "I've drafted the component diagram.",
      "Clean separation of concerns.",
      "Hexagonal, always hexagonal.",
    ],
  },
  pawn: {
    bodyType: "compact",
    zone: "follow",
    idleBehavior: "note",
    quips: [
      "Status report ready, sir.",
      "I've updated the changelog.",
      "Three tasks remaining.",
      "Notes taken.",
    ],
    walkSpeed: 1.1,
  },
  marauder: {
    bodyType: "hooded",
    zone: "server",
    idleBehavior: "lurk",
    quips: [
      "Found an unlocked door.",
      "Your secrets.env is showing.",
      "I could bypass this in seconds.",
      "Interesting attack surface...",
    ],
    walkSpeed: 1.2,
  },
  specter: {
    bodyType: "heavy",
    zone: "patrol",
    idleBehavior: "demolish",
    quips: [
      "This module is pure tech debt.",
      "Deprecated since v2. Demolish it.",
      "Seven files depend on this. All go.",
      "Nothing personal. Just entropy.",
    ],
    walkSpeed: 0.7,
  },
  heretic: {
    bodyType: "glitch",
    zone: "patrol",
    idleBehavior: "chaos",
    quips: [
      "What breaks when this changes?",
      "Your system is fragile here.",
      "Remove it. See what happens.",
      "Optionality over certainty.",
    ],
    walkSpeed: 1.3,
  },
  chancellor: {
    bodyType: "standard",
    zone: "server",
    idleBehavior: "maintain",
    quips: [
      "Deploy pipeline is green.",
      "Container limits tuned.",
      "Monitoring dashboard updated.",
      "Infrastructure nominal.",
    ],
  },
  cardinal: {
    bodyType: "labcoat",
    zone: "workbench",
    idleBehavior: "test",
    quips: [
      "Coverage at 87%. Not enough.",
      "This edge case needs a test.",
      "All 47 tests passing.",
      "Red, green, refactor.",
    ],
  },
  scout: {
    bodyType: "geared",
    zone: "display",
    idleBehavior: "scan",
    quips: [
      "Visual regression detected.",
      "Layout breaks at 768px.",
      "Scanning the viewport now.",
      "I see everything.",
    ],
  },
  ship: {
    bodyType: "naval",
    zone: "entrance",
    idleBehavior: "standby",
    quips: [
      "Ready to push to origin.",
      "Branch is clean, captain.",
      "Commit message formatted.",
      "Anchors aweigh on your order.",
    ],
    walkSpeed: 0.6,
  },
  // ── v4.2 new agents (Scacchiera v4.1 alignment) ──
  herald: {
    bodyType: "coated",
    zone: "display",
    idleBehavior: "inspect",
    quips: [
      "This radius breaks the Fox spec.",
      "Token says #1E7FD8, component says blue.",
      "Announcing the design update.",
      "Consistency is the message.",
    ],
    walkSpeed: 0.9,
  },
  sculptor: {
    bodyType: "labcoat",
    zone: "workbench",
    idleBehavior: "draft",
    quips: [
      "The component wants to be composable.",
      "Shaping the layout from the tokens.",
      "React 19, Server Components first.",
      "Form follows the design system.",
    ],
  },
  weaver: {
    bodyType: "standard",
    zone: "server",
    idleBehavior: "maintain",
    quips: [
      "The schema threads through here.",
      "Migration is idempotent.",
      "Indexes applied. Query is nearly free.",
      "Data flows where the model points.",
    ],
  },
  marshal: {
    bodyType: "armored",
    zone: "batcomputer",
    idleBehavior: "survey",
    quips: [
      "Chain assembled. Knight leads.",
      "Handoff: decision and file paths only.",
      "Worktrees ready. Parallel on.",
      "The board sees every move.",
    ],
    walkSpeed: 0.85,
  },
  polymorph: {
    bodyType: "glitch",
    zone: "patrol",
    idleBehavior: "chaos",
    quips: [
      "I can become whatever this needs.",
      "Ephemeral skill, absolute focus.",
      "I die when the session ends.",
      "Log the discovery. Forget the form.",
    ],
    walkSpeed: 1.1,
  },
  thief: {
    bodyType: "hooded",
    zone: "entrance",
    idleBehavior: "lurk",
    quips: [
      "Found a repo with 4k stars.",
      "Don't build it. Steal it.",
      "They already solved this.",
      "Bottino in tasca.",
    ],
    walkSpeed: 1.25,
  },
  oracle: {
    bodyType: "robed",
    zone: "display",
    idleBehavior: "scan",
    quips: [
      "The graph knows where this connects.",
      "God node: Scacchiera, 17 edges.",
      "Community 3 has weak cohesion.",
      "Ask, and I traverse.",
    ],
    walkSpeed: 0.75,
  },
  loop: {
    bodyType: "compact",
    zone: "patrol",
    idleBehavior: "pace",
    quips: [
      "Iterating until the promise is met.",
      "Ralph said: keep going.",
      "Convergence in 3... 2... 1...",
      "The cycle is the answer.",
    ],
    walkSpeed: 1.0,
  },
};
