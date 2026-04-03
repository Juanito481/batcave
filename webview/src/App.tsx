import { useEffect, useRef, useState } from "react";
import { GameLoop } from "./canvas/GameLoop";
import { Renderer } from "./canvas/Renderer";
import { BatCaveWorld } from "./world/BatCave";

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
    const renderer = new Renderer(ctx, world);
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
      }
    };
    window.addEventListener("message", handleMessage);

    // Tell the extension we're ready.
    vscode?.postMessage({ command: "ready" });

    loop.start();
    setReady(true);

    return () => {
      loop.stop();
      renderer.dispose();
      resizeObserver.disconnect();
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#0a0a12",
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
