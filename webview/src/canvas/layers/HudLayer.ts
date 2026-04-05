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
    // Show agent-specific quip if available, otherwise "working..." when active.
    const agentQuip = world.getAgentQuip(agent.id);
    if (agentQuip) {
      drawBubble(ctx, agent.x, agent.y - zoom * 18, agentQuip, zoom, fontSize);
    } else if (agent.state !== "idle" && agent.state !== "entering" && agent.state !== "exiting") {
      drawBubble(ctx, agent.x, agent.y - zoom * 18, "working...", zoom, fontSize);
    }
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



// ── Multi-session indicators ──────────────────────────

function drawSessionIndicators(rc: RenderContext): void {
  const { ctx, world, width } = rc;
  const zoom = rc.zoom;
  const sessions = world.getOtherSessions();
  if (sessions.length <= 1) return; // Only show when multiple sessions exist.

  const font = `"DM Mono", monospace`;
  const fontSize = Math.max(5, zoom * 2.5);
  const pad = zoom * 3;
  const y = zoom * 2 + pad + zoom * 2 + pad + zoom * 4; // Below agents row.

  ctx.font = `${fontSize}px ${font}`;
  ctx.textAlign = "left";

  let x = pad;
  for (const session of sessions) {
    const age = (Date.now() - session.lastActive) / 1000;
    const ageStr = age < 60 ? `${Math.floor(age)}s` : `${Math.floor(age / 60)}m`;

    // Dot: green if current, dim if other.
    ctx.fillStyle = session.isCurrent ? "#2ECC71" : "#444458";
    ctx.fillRect(x, y, zoom, zoom);

    // Label.
    ctx.fillStyle = session.isCurrent ? "#888899" : "#444458";
    ctx.fillText(`${session.label} (${ageStr})`, x + zoom * 2, y + zoom);
    x += ctx.measureText(`${session.label} (${ageStr})`).width + zoom * 5;
  }
}

// ── Helpers ───────────────────────────────────────────

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}

// ── Expanded panel overlay ────────────────────────────

function drawExpandedPanel(rc: RenderContext): void {
  const { ctx, world, width, height } = rc;
  const zoom = rc.zoom;
  const panel = world.getExpandedPanel();
  if (!panel) return;

  const font = `"DM Mono", monospace`;
  const fontSize = Math.max(7, zoom * 3);
  const smallFont = Math.max(6, zoom * 2.5);
  const pad = zoom * 4;

  // Semi-transparent backdrop.
  ctx.save();
  ctx.fillStyle = "#0a0a12";
  ctx.globalAlpha = 0.85;
  const panelW = Math.min(width * 0.6, 400);
  const panelH = Math.min(height * 0.65, 320);
  const px = Math.floor((width - panelW) / 2);
  const py = Math.floor((height - panelH) / 2);
  ctx.fillRect(px, py, panelW, panelH);
  ctx.restore();

  // Border.
  const theme = world.getRepoTheme();
  ctx.fillStyle = theme.accent;
  ctx.fillRect(px, py, panelW, Math.max(1, zoom));
  ctx.fillRect(px, py + panelH - Math.max(1, zoom), panelW, Math.max(1, zoom));
  ctx.fillRect(px, py, Math.max(1, zoom), panelH);
  ctx.fillRect(px + panelW - Math.max(1, zoom), py, Math.max(1, zoom), panelH);

  // Header.
  ctx.fillStyle = theme.accent;
  ctx.font = `bold ${fontSize}px ${font}`;
  ctx.textAlign = "left";

  const titles: Record<string, string> = {
    files: "RECENT FILES",
    stats: "SESSION STATS",
    agents: "AGENTS",
    "agent-detail": "AGENT DETAIL",
  };
  ctx.fillText(titles[panel] || panel.toUpperCase(), px + pad, py + pad + fontSize);

  // Close hint.
  ctx.fillStyle = "#555566";
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "right";
  ctx.fillText("click to close", px + panelW - pad, py + pad + smallFont);

  // Content area.
  const contentY = py + pad + fontSize + pad;
  const contentH = panelH - pad * 2 - fontSize - pad;
  const lineH = Math.max(fontSize + zoom * 2, 14);
  ctx.textAlign = "left";

  if (panel === "files") {
    const files = world.getRecentFiles();
    ctx.font = `${smallFont}px ${font}`;
    const toolColors: Record<string, string> = {
      Read: "#1a3a5a", Edit: "#F39C12", Write: "#F39C12",
      Grep: "#1a3a5a", Glob: "#1a3a5a", Bash: "#2ECC71",
    };
    for (let i = 0; i < files.length; i++) {
      const fy = contentY + i * lineH;
      if (fy > py + panelH - pad) break;
      ctx.fillStyle = toolColors[files[i].tool] || "#555566";
      ctx.fillRect(px + pad, fy + zoom, zoom * 2, zoom * 2);
      ctx.fillStyle = "#888899";
      ctx.fillText(files[i].name, px + pad + zoom * 4, fy + lineH * 0.7);
      ctx.fillStyle = "#555566";
      ctx.fillText(files[i].tool, px + panelW / 2, fy + lineH * 0.7);
    }
    if (files.length === 0) {
      ctx.fillStyle = "#444458";
      ctx.fillText("No files touched yet", px + pad, contentY + lineH * 0.7);
    }
  } else if (panel === "stats") {
    const stats = world.getSessionStats();
    const pace = world.getPace();
    const breakdown = world.getToolBreakdown();
    const cost = world.getSessionCost();
    ctx.font = `${fontSize}px ${font}`;

    const lines = [
      { label: "Context", value: `${stats.contextPct}%`, color: stats.contextPct < 50 ? "#2ECC71" : stats.contextPct < 80 ? "#F39C12" : "#E74C3C" },
      { label: "Est. cost", value: `$${cost.costUsd.toFixed(2)}`, color: cost.costUsd > 1 ? "#F39C12" : "#888899" },
      { label: "Est. tokens", value: cost.totalTokens > 1000 ? `${(cost.totalTokens / 1000).toFixed(1)}k` : `${cost.totalTokens}`, color: "#888899" },
      { label: "Tools", value: `${stats.toolCount}`, color: "#888899" },
      { label: "Duration", value: stats.duration, color: "#888899" },
      { label: "Pace", value: `${pace.current}/min`, color: pace.trend === "up" ? "#2ECC71" : pace.trend === "down" ? "#E74C3C" : "#888899" },
      { label: "Read", value: `${breakdown.read}`, color: "#1a5a8a" },
      { label: "Write", value: `${breakdown.write}`, color: "#F39C12" },
      { label: "Bash", value: `${breakdown.bash}`, color: "#2ECC71" },
      { label: "Agent", value: `${breakdown.agent}`, color: "#9B59B6" },
    ];

    for (let i = 0; i < lines.length; i++) {
      const ly = contentY + i * lineH;
      if (ly > py + panelH - pad) break;
      ctx.fillStyle = "#555566";
      ctx.fillText(lines[i].label, px + pad, ly + lineH * 0.7);
      ctx.fillStyle = lines[i].color;
      ctx.textAlign = "right";
      ctx.fillText(lines[i].value, px + panelW - pad, ly + lineH * 0.7);
      ctx.textAlign = "left";
    }
  } else if (panel === "agents") {
    // Show all agents with cumulative stats (enterprise view).
    const allStats = world.getAllAgentStats();
    ctx.font = `${smallFont}px ${font}`;
    if (allStats.length > 0) {
      // Header row.
      ctx.fillStyle = "#555566";
      ctx.fillText("AGENT", px + pad, contentY + lineH * 0.5);
      ctx.textAlign = "right";
      ctx.fillText("TOOLS", px + panelW * 0.55, contentY + lineH * 0.5);
      ctx.fillText("FILES", px + panelW * 0.72, contentY + lineH * 0.5);
      ctx.fillText("TIME", px + panelW - pad, contentY + lineH * 0.5);
      ctx.textAlign = "left";

      for (let i = 0; i < allStats.length; i++) {
        const ay = contentY + (i + 1) * lineH;
        if (ay > py + panelH - pad) break;
        const s = allStats[i];
        const isActive = s.exitTime === null;

        // Active dot.
        ctx.fillStyle = isActive ? "#2ECC71" : "#555566";
        ctx.fillRect(px + pad, ay + lineH * 0.3, zoom, zoom);

        // Name.
        ctx.fillStyle = isActive ? "#AAAACC" : "#777790";
        ctx.fillText(`${s.emoji} ${s.agentName}`, px + pad + zoom * 2, ay + lineH * 0.7);

        // Stats columns.
        ctx.textAlign = "right";
        ctx.fillStyle = "#888899";
        ctx.fillText(`${s.toolCount}`, px + panelW * 0.55, ay + lineH * 0.7);
        ctx.fillText(`${s.filesTouched.length}`, px + panelW * 0.72, ay + lineH * 0.7);
        const durSec = Math.floor((s.exitTime !== null ? s.totalActiveMs : s.totalActiveMs + Date.now() - s.enterTime) / 1000);
        const durStr = durSec >= 60 ? `${Math.floor(durSec / 60)}m${durSec % 60}s` : `${durSec}s`;
        ctx.fillText(durStr, px + panelW - pad, ay + lineH * 0.7);
        ctx.textAlign = "left";
      }
    } else {
      // Fallback to history if no stats yet.
      const history = world.getAgentHistory();
      for (let i = 0; i < history.length; i++) {
        const ay = contentY + i * lineH;
        if (ay > py + panelH - pad) break;
        const entry = history[i];
        ctx.fillStyle = entry.action === "enter" ? "#2ECC71" : "#E74C3C";
        const arrow = entry.action === "enter" ? "\u25B6" : "\u25C0";
        ctx.fillText(`${arrow} ${entry.emoji} ${entry.name}`, px + pad, ay + lineH * 0.7);
      }
      if (history.length === 0) {
        ctx.fillStyle = "#444458";
        ctx.fillText("No agents yet", px + pad, contentY + lineH * 0.7);
      }
    }
  } else if (panel === "agent-detail") {
    // Per-agent detail panel — enterprise observability.
    const selectedId = world.getSelectedAgentId();
    const agentStat = selectedId ? world.getAgentStats(selectedId) : null;

    if (agentStat) {
      // Agent header.
      ctx.font = `bold ${fontSize}px ${font}`;
      ctx.fillStyle = theme.accent;
      ctx.fillText(`${agentStat.emoji} ${agentStat.agentName}`, px + pad, contentY + lineH * 0.7);

      const isActive = agentStat.exitTime === null;
      ctx.font = `${smallFont}px ${font}`;
      ctx.fillStyle = isActive ? "#2ECC71" : "#E74C3C";
      ctx.fillText(isActive ? "ACTIVE" : "EXITED", px + panelW / 2, contentY + lineH * 0.7);

      // Stats grid.
      ctx.font = `${fontSize}px ${font}`;
      const grid = [
        { label: "Invocations", value: `${agentStat.invocations}`, color: "#888899" },
        { label: "Tools used", value: `${agentStat.toolCount}`, color: "#888899" },
        { label: "Files touched", value: `${agentStat.filesTouched.length}`, color: "#888899" },
        { label: "Active time", value: formatDuration(isActive ? agentStat.totalActiveMs + Date.now() - agentStat.enterTime : agentStat.totalActiveMs), color: "#888899" },
        { label: "  Read", value: `${agentStat.toolBreakdown.read}`, color: "#1a5a8a" },
        { label: "  Write", value: `${agentStat.toolBreakdown.write}`, color: "#F39C12" },
        { label: "  Bash", value: `${agentStat.toolBreakdown.bash}`, color: "#2ECC71" },
        { label: "  Web", value: `${agentStat.toolBreakdown.web}`, color: theme.accent },
      ];

      for (let i = 0; i < grid.length; i++) {
        const ly = contentY + (i + 1.5) * lineH;
        if (ly > py + panelH - pad * 2) break;
        ctx.fillStyle = "#555566";
        ctx.fillText(grid[i].label, px + pad, ly + lineH * 0.7);
        ctx.fillStyle = grid[i].color;
        ctx.textAlign = "right";
        ctx.fillText(grid[i].value, px + panelW - pad, ly + lineH * 0.7);
        ctx.textAlign = "left";
      }

      // Recent files.
      const filesStart = contentY + 10 * lineH;
      if (agentStat.filesTouched.length > 0 && filesStart < py + panelH - pad) {
        ctx.font = `bold ${smallFont}px ${font}`;
        ctx.fillStyle = "#555566";
        ctx.fillText("RECENT FILES", px + pad, filesStart);
        ctx.font = `${smallFont}px ${font}`;
        for (let i = 0; i < Math.min(agentStat.filesTouched.length, 4); i++) {
          const fy = filesStart + (i + 1) * lineH * 0.8;
          if (fy > py + panelH - pad) break;
          const parts = agentStat.filesTouched[agentStat.filesTouched.length - 1 - i].split("/");
          ctx.fillStyle = "#777790";
          ctx.fillText(parts[parts.length - 1] || "?", px + pad + zoom * 2, fy);
        }
      }
    } else {
      ctx.fillStyle = "#444458";
      ctx.fillText("No data for this agent", px + pad, contentY + lineH * 0.7);
    }
  }
}

// ── Public entry point ─────────────────────────────────

export function drawOverlay(rc: RenderContext): void {
  drawToolIcon(rc);
  drawSpeechBubbles(rc);
  drawOverlayHud(rc);
  drawSessionIndicators(rc);
  drawExpandedPanel(rc);
}
