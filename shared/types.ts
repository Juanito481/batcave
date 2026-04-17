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
  /** Where the event was sourced. Defaults to "jsonl" for back-compat. */
  source?: "jsonl" | "otel";
}

export interface ToolEvent {
  type: "tool_start" | "tool_end";
  toolName: string;
  timestamp: number;
  /** File path touched by this tool (Read, Edit, Write, Glob, Grep). */
  filePath?: string;
  /** True on tool_end when OTel reports success. Optional for JSONL (unknown). */
  success?: boolean;
  /** Duration in ms from OTel tool_result. Optional for JSONL (unknown). */
  durationMs?: number;
  source?: "jsonl" | "otel";
}

/** API error from Claude Code (OTel only). v5.0+. */
export interface ApiErrorEvent {
  type: "api_error";
  timestamp: number;
  statusCode: string;
  attempt: number;
  model?: string;
}

/** Tool rejected by user (OTel only). v5.0+. */
export interface ToolRejectedEvent {
  type: "tool_rejected";
  timestamp: number;
  toolName: string;
}

/** User submitted a new prompt (OTel only). v5.0+. */
export interface PromptStartEvent {
  type: "prompt_start";
  timestamp: number;
  promptLength: number;
}

/** Plugin finished installing (OTel only). v5.0+. */
export interface PluginInstalledEvent {
  type: "plugin_installed";
  timestamp: number;
  pluginName: string;
  pluginVersion?: string;
  marketplaceName?: string;
}

/** Chain lifecycle event from .claude/chains/active/ watcher. v5.4+. */
export interface ChainEvent {
  type: "chain_created" | "chain_updated" | "chain_archived";
  chainId: string;
  chainType: string;
  target: string;
  step: { current: number; total: number };
  currentAgent: string;
  nextAgent: string;
  flag: "clean" | "warn" | "block";
  timestamp: number;
  source?: "chains";
}

/** Oracle god node — top-degree graph hub. */
export interface OracleGodNode {
  name: string;
  edges: number;
}

/** Oracle community entry — Louvain cluster summary. */
export interface OracleCommunity {
  id: string;
  name: string;
}

/** Oracle knowledge-graph event (rebuild or query). v5.5+. */
export interface OracleEvent {
  type: "oracle_rebuild" | "oracle_query";
  timestamp: number;
  /** Rebuild: total nodes in the graph. */
  totalNodes?: number;
  /** Rebuild: total edges. */
  totalEdges?: number;
  /** Rebuild: community count. */
  communities?: number;
  /** Rebuild: date header from GRAPH_REPORT.md. */
  reportDate?: string;
  /** Rebuild: delta vs previous poll (undefined on first observation). */
  deltaNodes?: number;
  deltaEdges?: number;
  /** Rebuild: top-degree god nodes (up to 10). */
  godNodes?: OracleGodNode[];
  /** Rebuild: community list (first 30). */
  communityList?: OracleCommunity[];
  /** Query: human-readable query string. */
  queryText?: string;
  /** Query: rows returned. */
  resultCount?: number;
  source?: "oracle";
}

export interface SessionEvent {
  type: "session_idle" | "session_thinking" | "session_writing";
  timestamp: number;
}

export interface GitEvent {
  type: "git_commit" | "git_push";
  message: string;
  timestamp: number;
}

export interface TodoEvent {
  type: "todo_update";
  todos: { content: string; status: "pending" | "in_progress" | "completed" }[];
  timestamp: number;
}

export interface SessionsListEvent {
  type: "sessions_list";
  sessions: {
    projectHash: string;
    label: string;
    lastActive: number;
    isCurrent: boolean;
  }[];
  timestamp: number;
}

export type BatCaveEvent =
  | AgentEvent
  | ToolEvent
  | SessionEvent
  | UsageStats
  | GitEvent
  | TodoEvent
  | SessionsListEvent
  | ApiErrorEvent
  | ToolRejectedEvent
  | PromptStartEvent
  | PluginInstalledEvent
  | ChainEvent
  | OracleEvent;

export interface BatCaveConfig {
  activeRepo: string;
  agents: Record<string, AgentMeta>;
}

/** Persisted session summary — saved to VSCode globalState after each session. */
export interface SessionSummary {
  id: string; // unique session ID
  repo: string; // workspace/repo name
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  durationMs: number;
  messages: number;
  toolCalls: number;
  agentsSpawned: number;
  contextPeakPct: number; // highest context fill seen
  estimatedTokens: number;
  /** Tool failure rate over the session (0-1). OTel-sourced; undefined when OTel inactive. */
  toolFailureRate?: number;
  /** Total tool_end events observed with success signal. */
  toolSampleSize?: number;
  toolBreakdown: {
    read: number;
    write: number;
    bash: number;
    web: number;
    agent: number;
    other: number;
  };
  agentSummaries: AgentSummary[];
  model: string;
}

/** Per-agent summary within a session. */
export interface AgentSummary {
  agentId: string;
  agentName: string;
  emoji: string;
  invocations: number;
  toolCount: number;
  filesTouched: number;
  totalActiveMs: number;
}

/** Sound settings payload from extension to webview. */
export interface SoundSettingsPayload {
  enabled: boolean;
  volume: number;
}

/** Session history payload from extension to webview. */
export interface SessionHistoryPayload {
  sessions: SessionSummary[];
}

/** Message from extension host to webview. */
export interface ExtToWebviewMessage {
  command: "event" | "reset" | "config" | "sound-settings" | "session-history";
  payload:
    | BatCaveEvent
    | BatCaveConfig
    | SoundSettingsPayload
    | SessionHistoryPayload
    | Record<string, unknown>;
}

/** Message from webview to extension host. */
export type WebviewToExtMessage =
  | { command: "ready" }
  | { command: "requestState" }
  | { command: "toggleSound" }
  | { command: "launchAgent"; agentId: string }
  | { command: "saveSession"; payload: SessionSummary }
  | { command: "exportSession" };

/** Known Alfred chess-piece agents — Scacchiera v4.1 roster (21 agents). */
export const AGENTS: Record<string, AgentMeta> = {
  // ── Strategia ──
  king: {
    name: "Il Sovrano",
    emoji: "\u2654",
    role: "Vision & coherence",
    color: "white",
  },
  queen: {
    name: "La Stratega",
    emoji: "\uD83D\uDC51",
    role: "Business analysis",
    color: "white",
  },
  heretic: {
    name: "L'Eretico",
    emoji: "\u265E",
    role: "Antifragile audit",
    color: "black",
  },

  // ── Builder ──
  knight: {
    name: "L'Architetto",
    emoji: "\uD83D\uDC34",
    role: "Architecture & build",
    color: "white",
  },
  weaver: {
    name: "Il Tessitore",
    emoji: "\uD83E\uDDF5",
    role: "Backend & data",
    color: "specialist",
  },
  sculptor: {
    name: "Lo Scultore",
    emoji: "\uD83C\uDFA8",
    role: "Frontend & UI",
    color: "specialist",
  },
  herald: {
    name: "L'Araldo",
    emoji: "\uD83D\uDCE3",
    role: "Design system",
    color: "specialist",
  },

  // ── Qualita ──
  bishop: {
    name: "Bishop",
    emoji: "\uD83D\uDD0E",
    role: "Code review",
    color: "white",
  },
  cardinal: {
    name: "Il Cardinale",
    emoji: "\uD83E\uDDEA",
    role: "Testing & QA",
    color: "variant",
  },
  scout: {
    name: "L'Esploratore",
    emoji: "\uD83D\uDC41\uFE0F",
    role: "Browser & visual",
    color: "specialist",
  },
  specter: {
    name: "Lo Spettro",
    emoji: "\u265D",
    role: "Tech debt hunter",
    color: "black",
  },

  // ── Sicurezza ──
  rook: {
    name: "La Fortezza",
    emoji: "\u2656",
    role: "Security defense",
    color: "white",
  },
  marauder: {
    name: "Il Razziatore",
    emoji: "\u265C",
    role: "Red team & pentest",
    color: "black",
  },

  // ── Orchestrazione & ops ──
  marshal: {
    name: "Il Maresciallo",
    emoji: "\uD83D\uDCDC",
    role: "Chain orchestrator",
    color: "variant",
  },
  chancellor: {
    name: "Il Cancelliere",
    emoji: "\u2699\uFE0F",
    role: "DevOps & infra",
    color: "variant",
  },
  ship: {
    name: "La Nave",
    emoji: "\uD83D\uDEA2",
    role: "Git commit & push",
    color: "utility",
  },
  pawn: {
    name: "Il Segretario",
    emoji: "\u265F\uFE0F",
    role: "Briefing & status",
    color: "white",
  },

  // ── Conoscenza ──
  oracle: {
    name: "L'Informatrice",
    emoji: "\uD83D\uDD2E",
    role: "Knowledge graph",
    color: "specialist",
  },
  thief: {
    name: "Il Ladro",
    emoji: "\uD83C\uDFF4\u200D\u2620\uFE0F",
    role: "External scouting",
    color: "black",
  },

  // ── Meta ──
  polymorph: {
    name: "Il Mutaforma",
    emoji: "\uD83C\uDFAD",
    role: "Ad-hoc expertise",
    color: "specialist",
  },
  loop: {
    name: "Il Ciclo",
    emoji: "\uD83D\uDD01",
    role: "Ralph loop",
    color: "utility",
  },
};
