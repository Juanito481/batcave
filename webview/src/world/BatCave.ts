/** Game world state — receives events from extension, exposes state to renderer. */

interface ActiveAgent {
  id: string;
  name: string;
  emoji: string;
  enteredAt: number;
}

interface UsageStats {
  messagesThisSession: number;
  toolCallsThisSession: number;
  agentsSpawnedThisSession: number;
  activeModel: string;
  contextFillPct: number;
}

export class BatCaveWorld {
  private claudeState: "idle" | "thinking" | "writing" = "idle";
  private activeAgents: Map<string, ActiveAgent> = new Map();
  private usageStats: UsageStats | null = null;
  private idleTimer: number | null = null;
  private config: Record<string, unknown> = {};

  /** Process an event from the extension host. */
  handleEvent(event: Record<string, unknown>): void {
    const type = event.type as string;

    switch (type) {
      case "session_thinking":
        this.claudeState = "thinking";
        this.resetIdleTimer();
        break;

      case "session_writing":
        this.claudeState = "writing";
        this.resetIdleTimer();
        break;

      case "session_idle":
        this.claudeState = "idle";
        break;

      case "agent_enter": {
        const agentId = event.agentId as string;
        const agents = this.config.agents as Record<string, Record<string, string>> | undefined;
        const meta = agents?.[agentId];
        this.activeAgents.set(agentId, {
          id: agentId,
          name: (event.agentName as string) || agentId,
          emoji: meta?.emoji || "?",
          enteredAt: Date.now(),
        });
        break;
      }

      case "agent_exit": {
        const agentId = event.agentId as string;
        this.activeAgents.delete(agentId);
        break;
      }

      case "tool_start":
        if (this.claudeState === "idle") {
          this.claudeState = "thinking";
        }
        this.resetIdleTimer();
        break;

      case "usage_update":
        this.usageStats = {
          messagesThisSession: event.messagesThisSession as number,
          toolCallsThisSession: event.toolCallsThisSession as number,
          agentsSpawnedThisSession: event.agentsSpawnedThisSession as number,
          activeModel: event.activeModel as string,
          contextFillPct: event.contextFillPct as number,
        };
        break;
    }
  }

  setConfig(config: Record<string, unknown>): void {
    this.config = config;
  }

  /** Called every frame by the game loop. */
  update(_deltaMs: number): void {
    // Remove agents that have been idle for > 30 seconds.
    const now = Date.now();
    for (const [id, agent] of this.activeAgents) {
      if (now - agent.enteredAt > 30_000) {
        this.activeAgents.delete(id);
      }
    }
  }

  getClaudeState(): "idle" | "thinking" | "writing" {
    return this.claudeState;
  }

  getActiveAgents(): ActiveAgent[] {
    return Array.from(this.activeAgents.values());
  }

  getUsageStats(): UsageStats | null {
    return this.usageStats;
  }

  private resetIdleTimer(): void {
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
    }
    this.idleTimer = window.setTimeout(() => {
      this.claudeState = "idle";
      this.idleTimer = null;
    }, 5000);
  }
}
