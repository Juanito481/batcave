import { darken } from "../../helpers/color";
import { RenderContext, outlineRect } from "./render-context";
import { AGENTS } from "../../../../shared/types";
import { ACHIEVEMENTS } from "../../data/gamification";

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
  const iconBrd = Math.max(1, Math.floor(zoom / 2));
  ctx.fillStyle = "#0c0c1a";
  ctx.fillRect(iconX - s, iy - s, s * 6, s * 6);
  ctx.fillStyle = "#2a2a4a";
  ctx.fillRect(iconX - s, iy - s, s * 6, iconBrd); // accent top
  outlineRect(ctx, iconX - s, iy - s, s * 6, s * 6, iconBrd);

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
  const fontSize = Math.max(9, zoom * 3);
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

  // Pool agent data (from team server).
  const poolAgents = world.getPoolAgents();

  for (const agent of agents) {
    if (!agent.visible) continue;

    // Pool agent task bubble — shows task + assignee from command server.
    const poolData = poolAgents.get(agent.id);
    if (poolData && poolData.task && (poolData.status === "working" || poolData.status === "assigned")) {
      const taskLabel = poolData.task.length > 30 ? poolData.task.slice(0, 27) + "..." : poolData.task;
      const assignLabel = poolData.assignedTo ? ` [${poolData.assignedTo}]` : "";
      drawBubble(ctx, agent.x, agent.y - zoom * 18, taskLabel + assignLabel, zoom, fontSize);
      continue;
    }

    // Regular quip or working indicator.
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
  const brd = Math.max(1, Math.floor(zoom / 2));

  // Bubble body.
  ctx.fillStyle = "#0c0c1a";
  ctx.fillRect(bx, by, bw, bh);
  // Subtle top accent line.
  ctx.fillStyle = "#2a2a4a";
  ctx.fillRect(bx, by, bw, brd);
  // Side + bottom borders.
  outlineRect(ctx, bx, by, bw, bh, brd);
  // Tail.
  ctx.fillStyle = "#0c0c1a";
  ctx.fillRect(Math.floor(x - zoom), by + bh, zoom * 2, zoom);
  ctx.fillRect(Math.floor(x), by + bh + zoom, zoom, zoom);

  // Text.
  ctx.fillStyle = "#AAAACC";
  ctx.textAlign = "center";
  ctx.fillText(text, x, by + fontSize + pad - zoom);
}


// ── Overlay HUD (gaming-style, no sidebar) ────────────

function drawOverlayHud(rc: RenderContext): void {
  const { ctx, world, width, height, now } = rc;
  const zoom = rc.zoom;
  const theme = world.getRepoTheme();
  const stats = world.getUsageStats();
  const font = `"DM Mono", monospace`;
  const brd = Math.max(1, Math.floor(zoom / 2));
  const pad = zoom * 3;

  // ── 1. Context bar (top, full width, thicker) ──
  const ctxBarH = zoom * 4;
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
  // Context % label embedded in bar.
  const pctVal0 = stats?.contextFillPct ?? 0;
  if (pctVal0 > 0) {
    ctx.font = `bold ${Math.max(8, zoom * 2.5)}px ${font}`;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "right";
    ctx.fillText(`${pctVal0}%`, width - zoom * 2, ctxBarH - zoom);
    ctx.textAlign = "left";
  }

  // ── 2. Top-left chip: state + cost ──
  const state = world.getAlfredState();
  const stateColor: Record<string, string> = {
    idle: "#778899", thinking: "#3399EE", writing: "#33DD88",
  };
  const smallFont = Math.max(9, zoom * 3);

  const chipY = ctxBarH + pad;
  const chipX = pad;

  // Chip background pill.
  const stateLabel = state.toUpperCase();
  ctx.font = `bold ${smallFont}px ${font}`;
  const cost = world.getSessionCost();
  const costText = cost.costUsd > 0 ? `  $${cost.costUsd.toFixed(2)}` : "";
  const chipTextW = ctx.measureText(stateLabel + costText).width;
  const dotSize = zoom * 2;
  const chipPillW = dotSize + zoom * 3 + chipTextW + zoom * 2;
  const chipPillH = dotSize + zoom * 2;
  ctx.fillStyle = "#080c12";
  ctx.fillRect(chipX - zoom, chipY - zoom, chipPillW, chipPillH);

  // State dot.
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
  ctx.fillStyle = "#CCCCDD";
  ctx.font = `bold ${smallFont}px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText(state.toUpperCase(), chipX + dotSize + zoom * 2, chipY + dotSize - brd);

  // Cost next to state (always visible when > 0).
  if (cost.costUsd > 0) {
    const stateTextW = ctx.measureText(state.toUpperCase()).width;
    ctx.fillStyle = cost.costUsd > 1 ? "#F39C12" : "#888899";
    ctx.font = `${smallFont}px ${font}`;
    ctx.fillText(
      `$${cost.costUsd.toFixed(2)}`,
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

  // Measure right chip total width for background pill.
  const durW = ctx.measureText(durStr).width;
  ctx.fillStyle = "#444458";
  const modelW = ctx.measureText(modelShort).width;
  ctx.font = `bold ${smallFont}px ${font}`;
  const labelW = theme.label !== "---" ? ctx.measureText(theme.label).width + zoom * 3 : 0;
  const rightTotalW = durW + zoom * 3 + modelW + labelW + zoom * 2;

  // Right chip background pill.
  const rightY = chipY + dotSize - brd;
  ctx.save();
  ctx.fillStyle = "#06060c";
  ctx.globalAlpha = 0.75;
  ctx.fillRect(rightX - rightTotalW, chipY - zoom, rightTotalW + zoom, chipPillH);
  ctx.restore();

  // Compose right chip: "HARRIET  opus-4-6  5m 42s"
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "#555566";
  ctx.fillText(durStr, rightX, rightY);

  ctx.fillStyle = "#444458";
  ctx.fillText(modelShort, rightX - durW - zoom * 3, rightY);

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
      ctx.font = `${Math.max(8, zoom * 2.5)}px ${font}`;
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
    ctx.font = `${Math.max(8, zoom * 2.5)}px ${font}`;
    ctx.textAlign = "right";

    const trendColor = pace.trend === "up" ? "#2ECC71" : pace.trend === "down" ? "#E74C3C" : "#555566";
    const trendChar = pace.trend === "up" ? "\u25B2" : pace.trend === "down" ? "\u25BC" : "\u2500";

    ctx.fillStyle = "#555566";
    ctx.fillText(`${pace.current}/m`, rightX - zoom * 3, paceY + zoom * 2);

    ctx.fillStyle = trendColor;
    ctx.fillText(trendChar, rightX, paceY + zoom * 2);
  }

  // (Director removed — low signal, high confusion)

  // ── 7. Activity heatmap — 40 slots along bottom of context bar ──
  const heatSlots = world.getHeatmapSlots();
  const maxHeat = Math.max(1, ...heatSlots);
  const slotW = Math.max(1, Math.floor(width / heatSlots.length));
  const heatY = ctxBarH + brd;
  const heatH = Math.max(1, Math.floor(zoom * 0.8));
  for (let i = 0; i < heatSlots.length; i++) {
    if (heatSlots[i] === 0) continue;
    const intensity = heatSlots[i] / maxHeat;
    // Color gradient: dark indigo → bright cyan.
    const r = Math.floor(20 + intensity * 10);
    const g = Math.floor(30 + intensity * 150);
    const b = Math.floor(60 + intensity * 180);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(i * slotW, heatY, slotW - (slotW > 2 ? 1 : 0), heatH);
  }

  // ── 7. Smart alerts (below agents row) ──
  const alerts = world.getSmartAlerts();
  if (alerts.length > 0) {
    const alertY = chipY + dotSize + zoom * 6;
    const latestAlert = alerts[alerts.length - 1];
    const alertAge = now - latestAlert.timestamp;
    if (alertAge < 15000) { // show for 15s
      const alertAlpha = alertAge < 12000 ? 1 : 1 - (alertAge - 12000) / 3000;
      const sevColors: Record<string, string> = { info: "#1E7FD8", warning: "#F39C12", critical: "#E74C3C" };
      ctx.save();
      ctx.globalAlpha = alertAlpha;
      // Alert pill background.
      ctx.font = `bold ${Math.max(8, zoom * 2.5)}px ${font}`;
      const alertText = `${latestAlert.severity === "critical" ? "!" : "i"} ${latestAlert.title}: ${latestAlert.detail}`;
      const alertTextW = ctx.measureText(alertText).width;
      ctx.fillStyle = "#06060c";
      ctx.fillRect(chipX - zoom, alertY - zoom, alertTextW + zoom * 4, zoom * 5);
      // Alert text.
      ctx.fillStyle = sevColors[latestAlert.severity] || "#888899";
      ctx.textAlign = "left";
      ctx.fillText(alertText, chipX, alertY + zoom * 2.5);
      ctx.restore();
    }
  }

  // (Cave depth + achievements removed — decorative, low value)

  // ── 9. Cost alert — flashing warning when over budget ──
  if (world.isOverBudget()) {
    const alertY = chipY + dotSize + zoom * 8;
    const alertAlpha = Math.sin(now / 400) * 0.4 + 0.6; // fade 0.2–1.0, never fully off
    const cost = world.getSessionCost();
    const budget = world.getCostBudget();
    ctx.save();
    ctx.globalAlpha = alertAlpha;
    ctx.fillStyle = "#E74C3C";
    ctx.font = `bold ${smallFont}px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText(
      `BUDGET EXCEEDED  $${cost.costUsd.toFixed(2)} / $${budget.toFixed(2)}`,
      width / 2, alertY,
    );
    ctx.restore();
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
  const fontSize = Math.max(8, zoom * 2.5);
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
  const smallFont = Math.max(8, zoom * 2.5);
  const pad = zoom * 4;

  // Semi-transparent backdrop — larger, more room for content.
  ctx.save();
  ctx.fillStyle = "#101820";
  ctx.globalAlpha = 0.92;
  const panelW = Math.min(width * 0.7, 440);
  const panelH = Math.min(height * 0.7, 360);
  const px = Math.floor((width - panelW) / 2);
  const py = Math.floor((height - panelH) / 2);
  ctx.fillRect(px, py, panelW, panelH);
  ctx.restore();

  // Border — accent top, subtle sides/bottom.
  const theme = world.getRepoTheme();
  const brdW = Math.max(1, zoom);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(px, py, panelW, brdW * 2); // thicker accent top
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(px, py + panelH - brdW, panelW, brdW);
  ctx.fillRect(px, py, brdW, panelH);
  ctx.fillRect(px + panelW - brdW, py, brdW, panelH);

  // Header.
  ctx.fillStyle = theme.accent;
  ctx.font = `bold ${fontSize}px ${font}`;
  ctx.textAlign = "left";

  const titles: Record<string, string> = {
    files: "RECENT FILES",
    stats: "SESSION STATS",
    agents: "AGENTS",
    "agent-detail": "AGENT DETAIL",
    history: "SESSION HISTORY",
    audit: "AUDIT TRAIL",
    achievements: "ACHIEVEMENTS",
    "workspace-map": "WORKSPACE MAP",
    workflows: "WORKFLOWS",
    team: "TEAM DASHBOARD",
  };
  ctx.fillText(titles[panel] || panel.toUpperCase(), px + pad, py + pad + fontSize);

  // Close hint.
  ctx.fillStyle = "#444458";
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "right";
  ctx.fillText("[click to close]", px + panelW - pad, py + pad + smallFont);

  // Header separator line.
  const sepY = py + pad + fontSize + Math.floor(pad * 0.6);
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(px + pad, sepY, panelW - pad * 2, Math.max(1, Math.floor(zoom / 2)));

  // Content area.
  const contentY = sepY + pad;
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
      // Efficiency ranking below the agent table.
      const efficiency = world.getAgentEfficiency();
      if (efficiency.length > 0) {
        const effY = contentY + (allStats.length + 2) * lineH;
        if (effY < py + panelH - pad) {
          ctx.fillStyle = theme.accent;
          ctx.fillRect(px + pad, effY - lineH * 0.5, panelW - pad * 2, Math.max(1, zoom));
          ctx.font = `bold ${smallFont}px ${font}`;
          ctx.fillStyle = "#555566";
          ctx.fillText("EFFICIENCY RANKING", px + pad, effY + lineH * 0.3);
          ctx.font = `${smallFont}px ${font}`;
          for (let i = 0; i < Math.min(efficiency.length, 5); i++) {
            const ey = effY + (i + 1) * lineH;
            if (ey > py + panelH - pad) break;
            const e = efficiency[i];
            ctx.fillStyle = i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : "#777790";
            ctx.fillText(`#${e.rank} ${e.emoji} ${e.name}`, px + pad, ey + lineH * 0.7);
            ctx.textAlign = "right";
            ctx.fillStyle = "#888899";
            ctx.fillText(`${e.toolsPerMin}/m  score:${e.score}`, px + panelW - pad, ey + lineH * 0.7);
            ctx.textAlign = "left";
          }
        }
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

      // Action buttons (top-right of panel).
      const btnH = lineH * 0.9;
      const btnW = zoom * 14;
      const btnY = contentY - lineH * 0.2;

      // LAUNCH button.
      const launchBtnX = px + panelW - pad - btnW;
      ctx.fillStyle = "#1E7FD8";
      ctx.fillRect(launchBtnX, btnY, btnW, btnH);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold ${smallFont}px ${font}`;
      ctx.textAlign = "center";
      ctx.fillText("LAUNCH", launchBtnX + btnW / 2, btnY + btnH * 0.7);

      // ASSIGN button (only when team-connected + pool agent idle).
      if (world.isTeamConnected()) {
        const poolData = world.getPoolAgents().get(selectedId!);
        const poolStatus = poolData?.status || "idle";
        const assignBtnX = launchBtnX - btnW - zoom * 2;
        ctx.fillStyle = poolStatus === "idle" ? "#2ECC71" : "#555566";
        ctx.fillRect(assignBtnX, btnY, btnW, btnH);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(poolStatus === "working" ? "BUSY" : "ASSIGN", assignBtnX + btnW / 2, btnY + btnH * 0.7);

        // Pool status info below buttons.
        if (poolData) {
          ctx.textAlign = "left";
          ctx.font = `${smallFont}px ${font}`;
          const poolInfoY = btnY + btnH + zoom * 2;
          if (poolData.task) {
            ctx.fillStyle = "#F39C12";
            ctx.fillText(`Task: ${poolData.task}`, px + pad, poolInfoY);
          }
          if (poolData.assignedTo) {
            ctx.fillStyle = "#2ECC71";
            ctx.fillText(`Assigned to: ${poolData.assignedTo}`, px + pad, poolInfoY + lineH * 0.8);
          }
          if (poolData.queue > 0) {
            ctx.fillStyle = "#888899";
            ctx.fillText(`Queue: ${poolData.queue} pending`, px + panelW / 2, poolInfoY);
          }
        }
      }
      ctx.textAlign = "left";

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
  } else if (panel === "history") {
    const history = world.getSessionHistory();
    ctx.font = `${smallFont}px ${font}`;

    if (history.length > 0) {
      // Header row.
      ctx.fillStyle = "#555566";
      ctx.fillText("SESSION", px + pad, contentY + lineH * 0.5);
      ctx.textAlign = "right";
      ctx.fillText("TOOLS", px + panelW * 0.5, contentY + lineH * 0.5);
      ctx.fillText("COST", px + panelW * 0.7, contentY + lineH * 0.5);
      ctx.fillText("TIME", px + panelW - pad, contentY + lineH * 0.5);
      ctx.textAlign = "left";

      for (let i = 0; i < history.length; i++) {
        const hy = contentY + (i + 1) * lineH;
        if (hy > py + panelH - pad) break;
        const s = history[i];
        const age = Date.now() - s.endedAt;
        const ageStr = age < 3600000 ? `${Math.floor(age / 60000)}m ago` :
          age < 86400000 ? `${Math.floor(age / 3600000)}h ago` :
          `${Math.floor(age / 86400000)}d ago`;

        ctx.fillStyle = "#777790";
        ctx.fillText(`${s.repo}`, px + pad, hy + lineH * 0.7);
        ctx.textAlign = "right";
        ctx.fillStyle = "#888899";
        ctx.fillText(`${s.toolCalls}`, px + panelW * 0.5, hy + lineH * 0.7);
        ctx.fillStyle = s.estimatedCostUsd > 1 ? "#F39C12" : "#888899";
        ctx.fillText(`$${s.estimatedCostUsd.toFixed(2)}`, px + panelW * 0.7, hy + lineH * 0.7);
        ctx.fillStyle = "#555566";
        ctx.fillText(ageStr, px + panelW - pad, hy + lineH * 0.7);
        ctx.textAlign = "left";
      }

      // Totals.
      const totalCost = history.reduce((sum, s) => sum + s.estimatedCostUsd, 0);
      const totalTools = history.reduce((sum, s) => sum + s.toolCalls, 0);
      const totY = contentY + (Math.min(history.length, Math.floor(contentH / lineH) - 2) + 2) * lineH;
      if (totY < py + panelH - pad) {
        ctx.fillStyle = theme.accent;
        ctx.fillRect(px + pad, totY - lineH * 0.5, panelW - pad * 2, Math.max(1, zoom));
        ctx.font = `bold ${smallFont}px ${font}`;
        ctx.fillText(`TOTAL (${history.length} sessions)`, px + pad, totY + lineH * 0.3);
        ctx.textAlign = "right";
        ctx.fillText(`${totalTools}`, px + panelW * 0.5, totY + lineH * 0.3);
        ctx.fillStyle = totalCost > 10 ? "#E74C3C" : "#F39C12";
        ctx.fillText(`$${totalCost.toFixed(2)}`, px + panelW * 0.7, totY + lineH * 0.3);
        ctx.textAlign = "left";
      }
    } else {
      ctx.fillStyle = "#444458";
      ctx.fillText("No session history yet", px + pad, contentY + lineH * 0.7);
    }
  } else if (panel === "audit") {
    const trail = world.getAuditTrail();
    ctx.font = `${smallFont}px ${font}`;

    if (trail.length > 0) {
      // Show most recent entries first.
      const maxRows = Math.floor(contentH / lineH) - 1;
      const start = Math.max(0, trail.length - maxRows);
      const catColors: Record<string, string> = {
        tool: "#1E7FD8", agent: "#2ECC71", state: "#F39C12", git: "#9B59B6", system: "#555566",
      };

      for (let i = trail.length - 1; i >= start; i--) {
        const rowIdx = trail.length - 1 - i;
        const ay = contentY + rowIdx * lineH;
        if (ay > py + panelH - pad) break;
        const e = trail[i];

        // Timestamp.
        const ago = Date.now() - e.timestamp;
        const agoStr = ago < 60000 ? `${Math.floor(ago / 1000)}s` : `${Math.floor(ago / 60000)}m`;
        ctx.fillStyle = "#444458";
        ctx.fillText(agoStr, px + pad, ay + lineH * 0.7);

        // Category dot.
        ctx.fillStyle = catColors[e.category] || "#555566";
        const dotX = px + pad + zoom * 8;
        ctx.fillRect(dotX, ay + lineH * 0.3, zoom, zoom);

        // Detail text (truncated).
        ctx.fillStyle = "#888899";
        const maxW = panelW - pad * 2 - zoom * 12;
        const txt = e.detail.length > 50 ? e.detail.slice(0, 47) + "..." : e.detail;
        ctx.fillText(txt, dotX + zoom * 2, ay + lineH * 0.7);
      }
    } else {
      ctx.fillStyle = "#444458";
      ctx.fillText("No events recorded yet", px + pad, contentY + lineH * 0.7);
    }
  } else if (panel === "achievements") {
    const unlocked = world.getUnlockedAchievements();
    const tierColors: Record<string, string> = {
      bronze: "#CD7F32", silver: "#C0C0C0", gold: "#FFD700", legendary: "#E74C3C",
    };
    ctx.font = `${smallFont}px ${font}`;

    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      const ay = contentY + i * lineH;
      if (ay > py + panelH - pad) break;
      const a = ACHIEVEMENTS[i];
      const isUnlocked = unlocked.some(u => u.id === a.id);

      // Tier dot.
      ctx.fillStyle = isUnlocked ? tierColors[a.tier] || "#888899" : "#222233";
      ctx.fillRect(px + pad, ay + lineH * 0.3, zoom * 1.5, zoom * 1.5);

      // Name + description.
      ctx.fillStyle = isUnlocked ? "#CCCCDD" : "#444458";
      ctx.font = `bold ${smallFont}px ${font}`;
      ctx.fillText(a.name, px + pad + zoom * 4, ay + lineH * 0.5);
      ctx.font = `${smallFont}px ${font}`;
      ctx.fillStyle = isUnlocked ? "#888899" : "#333344";
      ctx.fillText(a.description, px + pad + zoom * 4, ay + lineH * 0.9);
    }

    // Summary at bottom.
    const summY = contentY + Math.min(ACHIEVEMENTS.length, Math.floor(contentH / lineH) - 1) * lineH + lineH;
    if (summY < py + panelH - pad) {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(px + pad, summY - lineH * 0.3, panelW - pad * 2, Math.max(1, zoom));
      ctx.fillStyle = "#FFD700";
      ctx.font = `bold ${smallFont}px ${font}`;
      ctx.fillText(`${unlocked.length} / ${ACHIEVEMENTS.length} unlocked`, px + pad, summY + lineH * 0.3);
    }
  } else if (panel === "workspace-map") {
    const nodes = world.getFileNodes();
    ctx.font = `${smallFont}px ${font}`;

    if (nodes.length > 0) {
      const maxHits = Math.max(1, ...nodes.map(n => n.hitCount));

      // Header.
      ctx.fillStyle = "#555566";
      ctx.fillText("FILE", px + pad, contentY + lineH * 0.5);
      ctx.textAlign = "right";
      ctx.fillText("HITS", px + panelW * 0.6, contentY + lineH * 0.5);
      ctx.fillText("TOOL", px + panelW * 0.8, contentY + lineH * 0.5);
      ctx.fillText("AGO", px + panelW - pad, contentY + lineH * 0.5);
      ctx.textAlign = "left";

      const catColors: Record<string, string> = {
        read: "#1E7FD8", write: "#F39C12", bash: "#2ECC71", other: "#555566",
      };

      for (let i = 0; i < nodes.length; i++) {
        const ny = contentY + (i + 1) * lineH;
        if (ny > py + panelH - pad * 2) break;
        const n = nodes[i];
        const intensity = n.hitCount / maxHits;

        // Heat bar behind name.
        ctx.save();
        ctx.fillStyle = catColors[n.category] || "#555566";
        ctx.globalAlpha = intensity * 0.3;
        ctx.fillRect(px + pad, ny, (panelW - pad * 2) * intensity, lineH * 0.8);
        ctx.restore();

        // File name.
        ctx.fillStyle = intensity > 0.5 ? "#CCCCDD" : "#888899";
        ctx.fillText(n.name.slice(0, 20), px + pad + zoom, ny + lineH * 0.7);

        // Hit count.
        ctx.textAlign = "right";
        ctx.fillStyle = "#888899";
        ctx.fillText(`${n.hitCount}`, px + panelW * 0.6, ny + lineH * 0.7);

        // Last tool.
        ctx.fillStyle = catColors[n.category] || "#555566";
        ctx.fillText(n.lastTool, px + panelW * 0.8, ny + lineH * 0.7);

        // Time ago.
        const ago = Date.now() - n.lastTimestamp;
        const agoStr = ago < 60000 ? `${Math.floor(ago / 1000)}s` : `${Math.floor(ago / 60000)}m`;
        ctx.fillStyle = "#555566";
        ctx.fillText(agoStr, px + panelW - pad, ny + lineH * 0.7);
        ctx.textAlign = "left";
      }
    } else {
      ctx.fillStyle = "#444458";
      ctx.fillText("No files touched yet", px + pad, contentY + lineH * 0.7);
    }
  } else if (panel === "workflows") {
    const workflows = world.getWorkflows();
    const schedules = world.getSchedules();
    ctx.font = `${smallFont}px ${font}`;

    if (workflows.length > 0) {
      ctx.fillStyle = "#555566";
      ctx.fillText("AVAILABLE PIPELINES", px + pad, contentY + lineH * 0.5);

      for (let i = 0; i < workflows.length; i++) {
        const wy = contentY + (i + 1) * lineH;
        if (wy > py + panelH - pad * 4) break;
        const w = workflows[i];

        // Run button.
        ctx.fillStyle = "#1E7FD8";
        ctx.fillRect(px + pad, wy + lineH * 0.15, zoom * 5, lineH * 0.7);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `bold ${Math.max(7, zoom * 2)}px ${font}`;
        ctx.fillText("RUN", px + pad + zoom * 0.8, wy + lineH * 0.65);

        // Workflow info.
        ctx.font = `bold ${smallFont}px ${font}`;
        ctx.fillStyle = "#CCCCDD";
        ctx.fillText(`${w.emoji} ${w.name}`, px + pad + zoom * 7, wy + lineH * 0.5);
        ctx.font = `${smallFont}px ${font}`;
        ctx.fillStyle = "#666678";
        ctx.fillText(`${w.steps} steps — ${w.description}`, px + pad + zoom * 7, wy + lineH * 0.9);
      }

      // Schedules section.
      if (schedules.length > 0) {
        const schedY = contentY + (workflows.length + 2) * lineH;
        if (schedY < py + panelH - pad) {
          ctx.fillStyle = "#1a1a2e";
          ctx.fillRect(px + pad, schedY - lineH * 0.3, panelW - pad * 2, Math.max(1, zoom));
          ctx.fillStyle = "#555566";
          ctx.font = `bold ${smallFont}px ${font}`;
          ctx.fillText("SCHEDULES", px + pad, schedY + lineH * 0.3);
          ctx.font = `${smallFont}px ${font}`;
          for (let i = 0; i < schedules.length; i++) {
            const sy = schedY + (i + 1) * lineH;
            if (sy > py + panelH - pad) break;
            const s = schedules[i];
            ctx.fillStyle = s.enabled ? "#2ECC71" : "#555566";
            ctx.fillRect(px + pad, sy + lineH * 0.3, zoom, zoom);
            ctx.fillStyle = s.enabled ? "#AAAACC" : "#555566";
            ctx.fillText(`${s.cron}  ${s.description}`, px + pad + zoom * 3, sy + lineH * 0.7);
          }
        }
      }
    } else {
      ctx.fillStyle = "#444458";
      ctx.fillText("No workflows defined", px + pad, contentY + lineH * 0.7);
      ctx.fillText("Add .batcave/workflows.json", px + pad, contentY + lineH * 1.7);
    }
  } else if (panel === "team") {
    const leaderboard = world.getTeamLeaderboard();
    const teamStats = world.getTeamStats();
    ctx.font = `${smallFont}px ${font}`;

    if (leaderboard.length > 0) {
      // Header.
      ctx.fillStyle = "#555566";
      ctx.fillText("USER", px + pad, contentY + lineH * 0.5);
      ctx.textAlign = "right";
      ctx.fillText("SCORE", px + panelW * 0.45, contentY + lineH * 0.5);
      ctx.fillText("TOOLS", px + panelW * 0.6, contentY + lineH * 0.5);
      ctx.fillText("COST", px + panelW * 0.78, contentY + lineH * 0.5);
      ctx.fillText("SESSIONS", px + panelW - pad, contentY + lineH * 0.5);
      ctx.textAlign = "left";

      for (let i = 0; i < leaderboard.length; i++) {
        const ly = contentY + (i + 1) * lineH;
        if (ly > py + panelH - pad * 3) break;
        const e = leaderboard[i];

        // Rank medal.
        ctx.fillStyle = i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : "#777790";
        ctx.font = `bold ${smallFont}px ${font}`;
        ctx.fillText(`#${i + 1} ${e.user}`, px + pad, ly + lineH * 0.7);

        ctx.font = `${smallFont}px ${font}`;
        ctx.textAlign = "right";
        ctx.fillStyle = "#888899";
        ctx.fillText(`${e.totalScore}`, px + panelW * 0.45, ly + lineH * 0.7);
        ctx.fillText(`${e.totalTools}`, px + panelW * 0.6, ly + lineH * 0.7);
        ctx.fillStyle = e.totalCost > 10 ? "#F39C12" : "#888899";
        ctx.fillText(`$${e.totalCost.toFixed(2)}`, px + panelW * 0.78, ly + lineH * 0.7);
        ctx.fillStyle = "#888899";
        ctx.fillText(`${e.sessions}`, px + panelW - pad, ly + lineH * 0.7);
        ctx.textAlign = "left";
      }

      // Totals.
      const totY = contentY + (leaderboard.length + 2) * lineH;
      if (totY < py + panelH - pad) {
        const totalCost = teamStats.reduce((s, e) => s + e.cost, 0);
        const totalTools = teamStats.reduce((s, e) => s + e.tools, 0);
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(px + pad, totY - lineH * 0.3, panelW - pad * 2, Math.max(1, zoom));
        ctx.fillStyle = theme.accent;
        ctx.font = `bold ${smallFont}px ${font}`;
        ctx.fillText(`TEAM TOTAL`, px + pad, totY + lineH * 0.3);
        ctx.textAlign = "right";
        ctx.fillText(`${totalTools} tools  $${totalCost.toFixed(2)}`, px + panelW - pad, totY + lineH * 0.3);
        ctx.textAlign = "left";
      }
    } else {
      ctx.fillStyle = "#444458";
      ctx.fillText("No team data yet", px + pad, contentY + lineH * 0.7);
      ctx.fillText("Stats accumulate across sessions", px + pad, contentY + lineH * 1.7);
    }

    // Live team members (from command server).
    if (world.isTeamConnected()) {
      const members = world.getTeamMembers();
      if (members.size > 0) {
        const memY = py + panelH - pad - lineH * (members.size + 1);
        if (memY > contentY) {
          ctx.fillStyle = "#1a1a2e";
          ctx.fillRect(px + pad, memY - lineH * 0.3, panelW - pad * 2, Math.max(1, zoom));
          ctx.fillStyle = "#555566";
          ctx.font = `bold ${smallFont}px ${font}`;
          ctx.fillText("LIVE MEMBERS", px + pad, memY + lineH * 0.3);
          ctx.font = `${smallFont}px ${font}`;
          let mi = 0;
          const statusColors: Record<string, string> = {
            online: "#2ECC71", thinking: "#1E7FD8", writing: "#F39C12", idle: "#555566", offline: "#333344",
          };
          for (const [, m] of members) {
            const my = memY + (mi + 1) * lineH;
            ctx.fillStyle = statusColors[m.status] || "#555566";
            ctx.fillRect(px + pad, my + lineH * 0.3, zoom, zoom);
            ctx.fillStyle = "#AAAACC";
            ctx.fillText(`${m.name}`, px + pad + zoom * 3, my + lineH * 0.7);
            ctx.fillStyle = "#555566";
            ctx.fillText(`${m.status} — ${m.repo}`, px + pad + zoom * 20, my + lineH * 0.7);
            mi++;
          }
        }
      }
    }
  }
}

// ── Replay timeline bar ──────────────────────────────

function drawReplayTimeline(rc: RenderContext): void {
  const { ctx, replay, width, height, now } = rc;
  const zoom = rc.zoom;
  if (!replay.isActive()) return;

  const snap = replay.getSnapshot();
  const font = `"DM Mono", monospace`;
  const fontSize = Math.max(9, zoom * 3);
  const smallFont = Math.max(8, zoom * 2.5);
  const barH = Math.max(12, zoom * 5);
  const pad = zoom * 2;
  const y = height - barH - pad;

  // Dark backdrop.
  ctx.save();
  ctx.fillStyle = "#06060c";
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, y - pad, width, barH + pad * 2);
  ctx.restore();

  // Progress bar track.
  const trackX = pad * 4 + zoom * 20;
  const trackW = width - trackX - pad * 4 - zoom * 25;
  const trackY = y + barH / 2 - zoom;
  const trackH = zoom * 2;

  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(trackX, trackY, trackW, trackH);

  // Progress fill.
  ctx.fillStyle = "#1E7FD8";
  ctx.fillRect(trackX, trackY, trackW * snap.progress, trackH);

  // Scrubber head — theme accent with highlight edge.
  const scrubX = trackX + trackW * snap.progress;
  ctx.fillStyle = "#1E7FD8";
  ctx.fillRect(scrubX - zoom, trackY - zoom, zoom * 2, trackH + zoom * 2);
  ctx.fillStyle = "#4AA0F0";
  ctx.fillRect(scrubX - zoom, trackY - zoom, zoom * 2, Math.max(1, zoom / 2));

  // Play/pause indicator (left).
  ctx.fillStyle = snap.state === "playing" ? "#2ECC71" : "#F39C12";
  ctx.font = `bold ${fontSize}px ${font}`;
  ctx.textAlign = "left";
  const stateIcon = snap.state === "playing" ? "▶" : snap.state === "paused" ? "⏸" : "⏹";
  ctx.fillText(stateIcon, pad, y + barH / 2 + fontSize * 0.35);

  // "REPLAY" label.
  ctx.fillStyle = "#E74C3C";
  ctx.font = `bold ${smallFont}px ${font}`;
  const replayAlpha = snap.state === "playing" ? Math.sin(now / 400) * 0.4 + 0.6 : 1;
  ctx.save();
  ctx.globalAlpha = replayAlpha;
  ctx.fillText("REPLAY", pad + zoom * 6, y + barH / 2 + smallFont * 0.35);
  ctx.restore();

  // Time display (right of progress bar).
  const posSec = Math.floor(snap.positionMs / 1000);
  const durSec = Math.floor(snap.durationMs / 1000);
  const posStr = `${Math.floor(posSec / 60)}:${String(posSec % 60).padStart(2, "0")}`;
  const durStr = `${Math.floor(durSec / 60)}:${String(durSec % 60).padStart(2, "0")}`;
  ctx.fillStyle = "#888899";
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "right";
  ctx.fillText(`${posStr} / ${durStr}`, width - pad * 2 - zoom * 12, y + barH / 2 + smallFont * 0.35);

  // Speed badge.
  ctx.fillStyle = snap.speed !== 1 ? "#F39C12" : "#555566";
  ctx.fillText(`${snap.speed}x`, width - pad, y + barH / 2 + smallFont * 0.35);

  // Current event detail (above the bar).
  if (snap.currentDetail) {
    const catColors: Record<string, string> = {
      tool: "#1E7FD8", agent: "#2ECC71", state: "#F39C12", git: "#9B59B6", system: "#555566",
    };
    ctx.fillStyle = catColors[snap.currentCategory || "system"] || "#555566";
    ctx.font = `${smallFont}px ${font}`;
    ctx.textAlign = "center";
    const detail = snap.currentDetail.length > 60 ? snap.currentDetail.slice(0, 57) + "..." : snap.currentDetail;
    ctx.fillText(detail, width / 2, y - pad);
  }

  // Entry counter.
  ctx.fillStyle = "#444458";
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText(`${snap.cursor}/${snap.totalEntries}`, trackX, y - pad);
}

// ── Public entry point ─────────────────────────────────

export function drawOverlay(rc: RenderContext): void {
  drawToolIcon(rc);
  drawSpeechBubbles(rc);
  drawOverlayHud(rc);
  drawSessionIndicators(rc);
  drawExpandedPanel(rc);
  drawReplayTimeline(rc);
}
