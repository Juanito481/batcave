/**
 * Agent personality system — unique behaviors, quips, zones, and body types
 * for each of the 13 Scacchiera chess-piece agents.
 *
 * Each agent has:
 * - bodyType: which sprite body template to use
 * - zone: preferred area in the cave
 * - idleBehavior: what they do when not working
 * - quips: 4 signature lines shown in speech bubbles
 */

export type BodyType =
  | "standard"  // Default humanoid
  | "caped"     // Wide cape from shoulders (King)
  | "robed"     // Dress/robe widens at bottom (Queen)
  | "armored"   // Wider, stocky, boxy (White Rook)
  | "coated"    // Long coat below waist (Bishop)
  | "hooded"    // Cloak + hood, narrow (Black Rook)
  | "heavy"     // Very wide shoulders (Black Bishop)
  | "glitch"    // Asymmetric, irregular (Black Knight)
  | "labcoat"   // Clean lab coat (Cardinal)
  | "geared"    // Vest with equipment (Scout)
  | "compact"   // Shorter body (Pawn)
  | "naval";    // Broad shoulders, coat (Ship)

export type AgentZone =
  | "batcomputer"  // Center, near main screens
  | "server"       // Left of batcomputer, server rack area
  | "workbench"    // Far left, workbench/tools area
  | "display"      // Right of batcomputer, display panel
  | "patrol"       // Walks perimeter
  | "follow"       // Follows Alfred
  | "entrance";    // Right side, near exit

export type IdleBehavior =
  | "survey"    // Stands still, surveys cave (King)
  | "pace"      // Strategic pacing between points (Queen)
  | "guard"     // Patrols perimeter slowly (White Rook)
  | "inspect"   // Examines furniture closely (Bishop)
  | "draft"     // Goes to planning table (Knight)
  | "note"      // Follows Alfred, takes notes (Pawn)
  | "lurk"      // Sneaks around edges (Black Rook)
  | "demolish"  // Inspects weak points (Black Bishop)
  | "chaos"     // Erratic random movement (Black Knight)
  | "maintain"  // Checks server rack (Chancellor)
  | "test"      // Works at workbench (Cardinal)
  | "scan"      // Watches display panel (Scout)
  | "standby";  // Waits near entrance (Ship)

export interface AgentPersonality {
  bodyType: BodyType;
  zone: AgentZone;
  idleBehavior: IdleBehavior;
  quips: string[];
  walkSpeed?: number; // Multiplier (default 1.0)
}

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
  "white-rook": {
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
  "black-rook": {
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
  "black-bishop": {
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
  "black-knight": {
    bodyType: "glitch",
    zone: "patrol",
    idleBehavior: "chaos",
    quips: [
      "What if we delete the database?",
      "Edge case: null, undefined, NaN.",
      "The chaos monkey approves.",
      "Have you tried turning it off?",
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
};
