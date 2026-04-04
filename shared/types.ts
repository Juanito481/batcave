/**
 * Shared types — imported by both extension host (src/) and webview (webview/src/).
 * This is the single source of truth for cross-boundary types.
 */

export interface AgentMeta {
  name: string;
  emoji: string;
  role: string;
  color: "white" | "black" | "variant" | "specialist" | "utility";
}

export interface UsageStats {
  type: "usage_update";
  messagesThisSession: number;
  toolCallsThisSession: number;
  agentsSpawnedThisSession: number;
  activeModel: string;
  sessionStartedAt: number;
  /** Estimated context window fill percentage (0-100). */
  contextFillPct: number;
}

export interface AgentEvent {
  type: "agent_enter" | "agent_exit";
  agentId: string;
  agentName: string;
  timestamp: number;
}

export interface ToolEvent {
  type: "tool_start" | "tool_end";
  toolName: string;
  timestamp: number;
}

export interface SessionEvent {
  type: "session_idle" | "session_thinking" | "session_writing";
  timestamp: number;
}

export type BatCaveEvent = AgentEvent | ToolEvent | SessionEvent | UsageStats;

export interface BatCaveConfig {
  activeRepo: string;
  agents: Record<string, AgentMeta>;
}

/** Sound settings payload from extension to webview. */
export interface SoundSettingsPayload {
  enabled: boolean;
  volume: number;
}

/** Message from extension host to webview. */
export interface ExtToWebviewMessage {
  command: "event" | "reset" | "config" | "sound-settings";
  payload: BatCaveEvent | BatCaveConfig | SoundSettingsPayload;
}

/** Message from webview to extension host. */
export interface WebviewToExtMessage {
  command: "ready" | "requestState" | "toggleSound";
}

/** Known Alfred chess-piece agents. */
export const AGENTS: Record<string, AgentMeta> = {
  king: { name: "Il Sovrano", emoji: "\u2654", role: "Vision & coherence", color: "white" },
  queen: { name: "La Stratega", emoji: "\uD83D\uDC51", role: "Business analysis", color: "white" },
  "white-rook": { name: "La Fortezza", emoji: "\u2656", role: "Security defense", color: "white" },
  bishop: { name: "Bishop", emoji: "\uD83D\uDD0E", role: "Code review", color: "white" },
  knight: { name: "L'Architetto", emoji: "\uD83D\uDC34", role: "Architecture & build", color: "white" },
  pawn: { name: "Il Segretario", emoji: "\u265F\uFE0F", role: "Briefing & status", color: "white" },
  "black-rook": { name: "Lo Scassinatore", emoji: "\u265C", role: "Red team & pentest", color: "black" },
  "black-bishop": { name: "Il Demolitore", emoji: "\u265D", role: "Tech debt hunter", color: "black" },
  "black-knight": { name: "Il Sabotatore", emoji: "\u265E", role: "Chaos & edge cases", color: "black" },
  chancellor: { name: "Il Cancelliere", emoji: "\u2699\uFE0F", role: "DevOps & infra", color: "variant" },
  cardinal: { name: "Il Cardinale", emoji: "\uD83E\uDDEA", role: "Testing & QA", color: "variant" },
  scout: { name: "L'Esploratore", emoji: "\uD83D\uDC41\uFE0F", role: "Browser & visual", color: "specialist" },
  ship: { name: "La Nave", emoji: "\uD83D\uDEA2", role: "Git commit & push", color: "utility" },
};
