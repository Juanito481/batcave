import { darken } from "../../helpers/color";
import { RenderContext, outlineRect } from "./render-context";
import { AGENTS } from "../../../../shared/types";

// ── Tool icon (floating pixel art above Alfred) ────────

function drawToolIcon(rc: RenderContext): void {
  const { ctx, world, now } = rc;
  const zoom = rc.zoom;

  const tool = world.getCurrentTool();
  if (!tool) return;

  const timer = world.getCurrentToolTimer();
  const alf = world.alfred;
  const iconX = Math.floor(alf.x + zoom * 6);
  const iconY = Math.floor(alf.y - zoom * 18);
  const s = zoom * 2;

  // Fade out in last 500ms.
  const alpha = timer < 500 ? timer / 500 : 1;
  // Bob animation.
  const bob = Math.floor(Math.sin(now / 300) * zoom);
  const iy = iconY + bob;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Icon background bubble.
  ctx.fillStyle = "#0e0e1e";
  ctx.fillRect(iconX - s, iy - s, s * 6, s * 6);
  outlineRect(ctx, iconX - s, iy - s, s * 6, s * 6, Math.max(1, Math.floor(zoom / 2)));

  // Draw tool-specific pixel icon.
  const cat = toolCategory(tool);
  const theme = world.getRepoTheme();

  if (cat === "read") {
    ctx.fillStyle = "#1a3a5a";
    ctx.fillRect(iconX, iy, s * 4, s * 3);
    ctx.fillStyle = "#2a5a8a";
    ctx.fillRect(iconX, iy, s * 2, s * 3);
    ctx.fillStyle = "#8aa0c0";
    ctx.fillRect(iconX + s, iy + s, s * 2, Math.max(1, Math.floor(zoom / 2)));
  } else if (cat === "write") {
    ctx.fillStyle = "#F39C12";
    ctx.fillRect(iconX + s, iy, s, s * 3);
    ctx.fillStyle = "#E74C3C";
    ctx.fillRect(iconX + s, iy + s * 3, s, s);
    ctx.fillStyle = "#DDD";
    ctx.fillRect(iconX + s, iy - s, s, s);
  } else if (cat === "bash") {
    ctx.fillStyle = "#2ECC71";
    ctx.fillRect(iconX, iy, s, s);
    ctx.fillRect(iconX + s, iy + s, s, s);
    ctx.fillStyle = "#555570";
    ctx.fillRect(iconX + s * 2, iy + s * 2, s * 2, s);
  } else if (cat === "web") {
    ctx.fillStyle = theme.accent;
    ctx.fillRect(iconX + s, iy, s * 2, s);
    ctx.fillRect(iconX, iy + s, s * 4, s * 2);
    ctx.fillRect(iconX + s, iy + s * 3, s * 2, s);
    ctx.fillStyle = darken(theme.accent, 0.3);
    ctx.fillRect(iconX + s * 2, iy + s, s, s * 2);
  } else if (cat === "agent") {
    ctx.fillStyle = "#9B59B6";
    ctx.fillRect(iconX + s, iy, s * 2, s);
    ctx.fillRect(iconX, iy + s, s * 4, s);
    ctx.fillRect(iconX + s, iy + s * 2, s * 2, s);
    ctx.fillRect(iconX, iy + s * 3, s * 4, s);
  } else {
    ctx.fillStyle = "#555570";
    ctx.fillRect(iconX + s, iy, s * 2, s * 4);
    ctx.fillRect(iconX, iy + s, s * 4, s * 2);
  }

  ctx.restore();
}

function toolCategory(tool: string): "read" | "write" | "bash" | "web" | "agent" | "other" {
  if (["Read", "Grep", "Glob"].includes(tool)) return "read";
  if (["Edit", "Write", "NotebookEdit"].includes(tool)) return "write";
  if (tool === "Bash") return "bash";
  if (["WebSearch", "WebFetch"].includes(tool)) return "web";
  if (["Agent", "Skill"].includes(tool)) return "agent";
  return "other";
}

// ── Speech bubbles ────────────────────────────────────

function drawSpeechBubbles(rc: RenderContext): void {
  const { ctx, world } = rc;
  const zoom = rc.zoom;
  const agents = world.getAgentCharacters();

  const font = `"DM Mono", monospace`;
  const fontSize = Math.max(6, zoom * 3);
  ctx.font = `${fontSize}px ${font}`;
  ctx.textAlign = "center";

  const alf = world.alfred;
  const alfredState = world.getAlfredState();
  const quip = world.getCurrentQuip();
  if (quip) {
    drawBubble(ctx, alf.x, alf.y - zoom * 20, quip, zoom, fontSize);
  } else if (alfredState !== "idle") {
    const tool = world.getCurrentTool();
    const text = tool ? tool.toLowerCase() : alfredState;
    drawBubble(ctx, alf.x, alf.y - zoom * 20, text, zoom, fontSize);
  }

  for (const agent of agents) {
    if (!agent.visible) continue;
    if (agent.state === "idle" || agent.state === "entering" || agent.state === "exiting") continue;
    drawBubble(ctx, agent.x, agent.y - zoom * 18, "working...", zoom, fontSize);
  }
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, text: string,
  zoom: number, fontSize: number,
): void {
  const pad = zoom * 2;
  const textW = ctx.measureText(text).width;
  const bw = textW + pad * 2;
  const bh = fontSize + pad * 2;
  const bx = Math.floor(x - bw / 2);
  const by = Math.floor(y - bh);

  ctx.fillStyle = "#0e0e1e";
  ctx.fillRect(bx, by, bw, bh);
  outlineRect(ctx, bx, by, bw, bh, Math.max(1, Math.floor(zoom / 2)));
  ctx.fillStyle = "#0e0e1e";
  ctx.fillRect(Math.floor(x - zoom), by + bh, zoom * 2, zoom);
  ctx.fillRect(Math.floor(x), by + bh + zoom, zoom, zoom);

  ctx.fillStyle = "#8888AA";
  ctx.textAlign = "center";
  ctx.fillText(text, x, by + fontSize + pad - zoom);
}


// ── Overlay HUD (gaming-style, no sidebar) ────────────

function drawOverlayHud(rc: RenderContext): void {
  const { ctx, world, width, now } = rc;
  const zoom = rc.zoom;
  const theme = world.getRepoTheme();
  const stats = world.getUsageStats();
  const font = `"DM Mono", monospace`;
  const brd = Math.max(1, Math.floor(zoom / 2));
  const pad = zoom * 3;

  // ── 1. Context bar (top, full width) ──
  const ctxBarH = zoom * 2;
  const pct = stats ? stats.contextFillPct / 100 : 0;
  const barColor = pct < 0.5 ? "#2ECC71" : pct < 0.8 ? "#F39C12" : "#E74C3C";

  ctx.fillStyle = "#06060c";
  ctx.fillRect(0, 0, width, ctxBarH + brd);
  ctx.fillStyle = barColor;
  ctx.fillRect(0, 0, width * pct, ctxBarH);
  // Quarter marks.
  ctx.fillStyle = "#06060c";
  for (const mark of [0.25, 0.5, 0.75]) {
    ctx.fillRect(Math.floor(width * mark), 0, brd, ctxBarH);
  }

  // ── 2. Top-left chip: state + context % ──
  const state = world.getAlfredState();
  const stateColor: Record<string, string> = {
    idle: "#555566", thinking: theme.accent, writing: "#2ECC71",
  };
  const smallFont = Math.max(6, zoom * 3);

  const chipY = ctxBarH + pad;
  const chipX = pad;

  // State dot.
  const dotSize = zoom * 2;
  ctx.fillStyle = stateColor[state] || "#555566";
  ctx.fillRect(chipX, chipY, dotSize, dotSize);

  // Pulse ring when active.
  if (state !== "idle") {
    const pulse = Math.sin(now / 300) * 0.5 + 0.5;
    const ringSize = dotSize + Math.floor(pulse * zoom * 2);
    const ringOffset = Math.floor((ringSize - dotSize) / 2);
    ctx.fillStyle = state === "thinking" ? "#0e2040" : "#0e2a0e";
    ctx.fillRect(chipX - ringOffset, chipY - ringOffset, ringSize, ringSize);
    ctx.fillStyle = stateColor[state];
    ctx.fillRect(chipX, chipY, dotSize, dotSize);
  }

  // State label.
  ctx.fillStyle = "#888899";
  ctx.font = `bold ${smallFont}px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText(state.toUpperCase(), chipX + dotSize + zoom * 2, chipY + dotSize - brd);

  // Context percentage next to state.
  const pctVal = stats?.contextFillPct ?? 0;
  if (pctVal > 0) {
    const stateTextW = ctx.measureText(state.toUpperCase()).width;
    ctx.fillStyle = barColor;
    ctx.font = `${smallFont}px ${font}`;
    ctx.fillText(
      `${pctVal}%`,
      chipX + dotSize + zoom * 2 + stateTextW + zoom * 3,
      chipY + dotSize - brd,
    );
  }

  // ── 3. Top-right chip: model + session duration + repo ──
  const rightX = width - pad;

  // Model badge.
  const modelText = stats?.activeModel || "opus-4-6";
  const modelShort = modelText.replace("claude-", "");
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "right";

  // Session duration.
  const sessionStart = stats?.sessionStartedAt ?? now;
  const elapsed = now - sessionStart;
  const mins = Math.floor(elapsed / 60_000);
  const secs = Math.floor((elapsed % 60_000) / 1000);
  const durStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  // Compose right chip: "HARRIET  opus-4-6  5m 42s"
  const rightY = chipY + dotSize - brd;
  ctx.fillStyle = "#555566";
  ctx.fillText(durStr, rightX, rightY);
  const durW = ctx.measureText(durStr).width;

  ctx.fillStyle = "#444458";
  ctx.fillText(modelShort, rightX - durW - zoom * 3, rightY);
  const modelW = ctx.measureText(modelShort).width;

  if (theme.label !== "---") {
    ctx.fillStyle = theme.accent;
    ctx.font = `bold ${smallFont}px ${font}`;
    ctx.fillText(theme.label, rightX - durW - zoom * 3 - modelW - zoom * 3, rightY);
  }

  // ── 4. Active agents indicator (top-left, below state) ──
  const activeNames = world.getActiveAgentNames();
  if (activeNames.length > 0) {
    const agentY = chipY + dotSize + zoom * 3;
    let agentX = chipX;
    const agentDot = Math.max(2, zoom);

    for (let i = 0; i < activeNames.length; i++) {
      const name = activeNames[i];
      // Find agent meta for emoji.
      const agentEntries = Object.entries(AGENTS);
      const meta = agentEntries.find(([_, a]) => a.name === name);

      // Green dot.
      ctx.fillStyle = "#2ECC71";
      ctx.fillRect(agentX, agentY + zoom, agentDot, agentDot);

      // Agent name.
      ctx.fillStyle = "#777790";
      ctx.font = `${Math.max(5, zoom * 2.5)}px ${font}`;
      ctx.textAlign = "left";
      const label = meta ? meta[1].emoji : name.slice(0, 3);
      ctx.fillText(label, agentX + agentDot + zoom, agentY + zoom + agentDot);
      agentX += ctx.measureText(label).width + agentDot + zoom * 4;
    }
  }

  // ── 5. Top-right secondary: tools/min pace ──
  const pace = world.getPace();
  if (pace.current > 0) {
    const paceY = chipY + dotSize + zoom * 3;
    ctx.font = `${Math.max(5, zoom * 2.5)}px ${font}`;
    ctx.textAlign = "right";

    const trendColor = pace.trend === "up" ? "#2ECC71" : pace.trend === "down" ? "#E74C3C" : "#555566";
    const trendChar = pace.trend === "up" ? "\u25B2" : pace.trend === "down" ? "\u25BC" : "\u2500";

    ctx.fillStyle = "#555566";
    ctx.fillText(`${pace.current}/m`, rightX - zoom * 3, paceY + zoom * 2);

    ctx.fillStyle = trendColor;
    ctx.fillText(trendChar, rightX, paceY + zoom * 2);
  }

  ctx.textAlign = "left";
}



// ── Public entry point ─────────────────────────────────

export function drawOverlay(rc: RenderContext): void {
  drawToolIcon(rc);
  drawSpeechBubbles(rc);
  drawOverlayHud(rc);
}
