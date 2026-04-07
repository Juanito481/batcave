/**
 * Internal event bus for decoupled system communication.
 * Systems subscribe to typed events instead of polling world state.
 */

export interface EventMap {
  "tool:start": { toolName: string; x: number; y: number };
  "tool:end": { toolName: string };
  "agent:enter": { agentId: string; x: number; y: number };
  "agent:exit": { agentId: string; x: number; y: number };
  "session:state": { state: "idle" | "thinking" | "writing" };
  "particle:spawn": { preset: string; x: number; y: number };
  "sound:play": { id: string; volume?: number };
  "agent:chime": { agentId: string };
  "replay:loaded": { entries: number; durationMs: number };
  "replay:state": { state: "playing" | "paused" | "stopped" };
  "replay:seek": { cursor: number; positionMs: number };
  "replay:ended": Record<string, never>;
}

type Listener<T = unknown> = (payload: T) => void;

class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on<K extends keyof EventMap>(event: K, fn: Listener<EventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as Listener);
    return () => set!.delete(fn as Listener);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      fn(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const bus = new EventBus();
