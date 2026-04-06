import { useEffect, useRef, useState } from "react";
import { GameLoop } from "./canvas/GameLoop";
import { Renderer } from "./canvas/Renderer";
import { BatCaveWorld } from "./world/BatCave";
import { ReplayEngine } from "./systems/ReplayEngine";

// Acquire VS Code API (injected by the extension host).
const vscode =
  typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Pixel-perfect rendering — no anti-aliasing.
    ctx.imageSmoothingEnabled = false;

    const world = new BatCaveWorld();
    const replay = new ReplayEngine();
    const renderer = new Renderer(ctx, world, replay);
    const loop = new GameLoop(renderer);

    // Handle resize.
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      ctx.imageSmoothingEnabled = false;
      renderer.resize(canvas.width, canvas.height);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.parentElement!);

    // Listen for messages from extension host.
    const handleMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.command === "event") {
        world.handleEvent(msg.payload);
      } else if (msg.command === "config") {
        world.setConfig(msg.payload);
      } else if (msg.command === "reset") {
        world.reset();
      } else if (msg.command === "sound-settings") {
        const sound = renderer.getSoundSystem();
        sound.setEnabled(msg.payload.enabled);
        sound.setVolume(msg.payload.volume / 100);
        world.setSoundEnabled(msg.payload.enabled);
      } else if (msg.command === "session-history") {
        world.setSessionHistory(msg.payload.sessions);
      } else if (msg.command === "cost-budget") {
        world.setCostBudget(msg.payload.budgetUsd);
      } else if (msg.command === "workflows") {
        world.setWorkflows(msg.payload);
      } else if (msg.command === "team-stats") {
        world.setTeamStats(msg.payload.entries);
      } else if (msg.command === "team-server") {
        world.handleTeamServerMessage(msg.payload);
      }
    };
    window.addEventListener("message", handleMessage);


    // Click handler for interactive Batcomputer screens + replay timeline.
    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;

      // Replay timeline click handling.
      if (replay.isActive()) {
        const zoom = world.getZoom();
        const barH = Math.max(12, zoom * 5);
        const pad = zoom * 2;
        const barY = canvas.height - barH - pad;

        if (cy >= barY - pad && cy <= canvas.height) {
          const trackX = pad * 4 + zoom * 20;
          const trackW = canvas.width - trackX - pad * 4 - zoom * 25;

          // Click on play/pause area (left).
          if (cx < trackX) {
            if (replay.getState() === "playing") {
              replay.pause();
            } else {
              replay.play();
            }
            return;
          }
          // Click on speed area (right).
          if (cx > trackX + trackW) {
            replay.cycleSpeed();
            return;
          }
          // Click on track → seek.
          const progress = (cx - trackX) / trackW;
          replay.seek(progress);
          return;
        }
      }

      world.handleClick(cx, cy);
    };
    canvas.addEventListener("click", handleClick);
    canvas.style.cursor = "pointer";

    // Keyboard shortcuts for replay.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!replay.isActive()) {
        // 'R' to start replay from current session audit trail.
        if (e.key === "r" || e.key === "R") {
          const trail = world.getAuditTrail();
          if (trail.length > 5) {
            world.enterReplayMode();
            replay.load(trail);
            replay.play();
          }
        }
        return;
      }
      // Replay controls.
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        replay.getState() === "playing" ? replay.pause() : replay.play();
      } else if (e.key === "Escape" || e.key === "q") {
        replay.stop();
        world.exitReplayMode();
      } else if (e.key === "ArrowRight") {
        replay.seek(replay.getSnapshot().progress + 0.05);
      } else if (e.key === "ArrowLeft") {
        replay.seek(replay.getSnapshot().progress - 0.05);
      } else if (e.key === "." || e.key === ">") {
        replay.cycleSpeed();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // Restore persisted state.
    const savedState = vscode?.getState() as Record<string, unknown> | undefined;
    if (savedState) {
      world.restoreState(savedState);
    }

    // Auto-save state every 10 seconds + persist session summary.
    const saveInterval = setInterval(() => {
      const state = world.getPersistedState();
      vscode?.setState(state);
      // Save current session summary to extension host for persistence.
      const summary = world.getSessionSummary();
      if (summary && summary.toolCalls > 0) {
        vscode?.postMessage({ command: "saveSession", payload: summary });
        // Push team stats.
        const leaderboard = world.getLeaderboardEntry();
        vscode?.postMessage({ command: "pushTeamStats", payload: { ...leaderboard, sessionId: summary.id, timestamp: Date.now() } });
      }
    }, 10000);

    // Wire agent launcher + workflow runner.
    world.setLaunchAgentCallback((agentId: string) => {
      vscode?.postMessage({ command: "launchAgent", agentId });
    });
    world.setRunWorkflowCallback((workflowId: string) => {
      vscode?.postMessage({ command: "runWorkflow", workflowId });
    });
    world.setAssignAgentCallback((agentId: string) => {
      vscode?.postMessage({ command: "assignAgentPrompt", agentId });
    });

    world.setTeamCommandCallback((msg: Record<string, unknown>) => {
      vscode?.postMessage({ command: "team-command", payload: msg });
    });

    // Request workflows and team stats.
    vscode?.postMessage({ command: "requestWorkflows" });
    vscode?.postMessage({ command: "requestTeamStats" });

    // Tell the extension we're ready.
    vscode?.postMessage({ command: "ready" });

    loop.start();
    setReady(true);

    return () => {
      loop.stop();
      renderer.dispose();
      resizeObserver.disconnect();
      clearInterval(saveInterval);
      // Save state on teardown.
      vscode?.setState(world.getPersistedState());
      canvas.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#101820",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          imageRendering: "pixelated",
        }}
      />
      {!ready && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1E7FD8",
            fontFamily: "monospace",
            fontSize: 12,
          }}
        >
          Initializing Bat Cave...
        </div>
      )}
    </div>
  );
}

// Type declaration for VS Code webview API.
declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
