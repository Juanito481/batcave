import { darken } from "../../helpers/color";
import { RenderContext, P, outlineRect } from "./render-context";
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
    // Book — open pages.
    ctx.fillStyle = "#1a3a5a";
    ctx.fillRect(iconX, iy, s * 4, s * 3);
    ctx.fillStyle = "#2a5a8a";
    ctx.fillRect(iconX, iy, s * 2, s * 3);
    ctx.fillStyle = "#8aa0c0";
    ctx.fillRect(iconX + s, iy + s, s * 2, Math.max(1, Math.floor(zoom / 2)));
  } else if (cat === "write") {
    // Pencil.
    ctx.fillStyle = "#F39C12";
    ctx.fillRect(iconX + s, iy, s, s * 3);
    ctx.fillStyle = "#E74C3C";
    ctx.fillRect(iconX + s, iy + s * 3, s, s);
    ctx.fillStyle = "#DDD";
    ctx.fillRect(iconX + s, iy - s, s, s);
  } else if (cat === "bash") {
    // Terminal >_
    ctx.fillStyle = "#2ECC71";
    ctx.fillRect(iconX, iy, s, s);
    ctx.fillRect(iconX + s, iy + s, s, s);
    ctx.fillStyle = "#555570";
    ctx.fillRect(iconX + s * 2, iy + s * 2, s * 2, s);
  } else if (cat === "web") {
    // Globe.
    ctx.fillStyle = theme.accent;
    ctx.fillRect(iconX + s, iy, s * 2, s);
    ctx.fillRect(iconX, iy + s, s * 4, s * 2);
    ctx.fillRect(iconX + s, iy + s * 3, s * 2, s);
    ctx.fillStyle = darken(theme.accent, 0.3);
    ctx.fillRect(iconX + s * 2, iy + s, s, s * 2);
  } else if (cat === "agent") {
    // Chess piece silhouette.
    ctx.fillStyle = "#9B59B6";
    ctx.fillRect(iconX + s, iy, s * 2, s);
    ctx.fillRect(iconX, iy + s, s * 4, s);
    ctx.fillRect(iconX + s, iy + s * 2, s * 2, s);
    ctx.fillRect(iconX, iy + s * 3, s * 4, s);
  } else {
    // Generic gear.
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

  // Alfred bubble (show state or quip).
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

  // Agent bubbles (show name + "working").
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

  // Bubble body.
  ctx.fillStyle = "#0e0e1e";
  ctx.fillRect(bx, by, bw, bh);
  // Border.
  outlineRect(ctx, bx, by, bw, bh, Math.max(1, Math.floor(zoom / 2)));
  // Tail (small triangle pointer).
  ctx.fillStyle = "#0e0e1e";
  ctx.fillRect(Math.floor(x - zoom), by + bh, zoom * 2, zoom);
  ctx.fillRect(Math.floor(x), by + bh + zoom, zoom, zoom);

  // Text.
  ctx.fillStyle = "#8888AA";
  ctx.textAlign = "center";
  ctx.fillText(text, x, by + fontSize + pad - zoom);
}

// ── Session timeline (bottom strip) ───────────────────

function drawTimeline(rc: RenderContext): void {
  const { ctx, world, width, height } = rc;
  const zoom = rc.zoom;

  const log = world.getEventLog();
  if (log.length === 0) return;

  const timeH = zoom * 4;
  const ty = height - timeH;
  const pad = zoom * 2;

  // Background strip.
  ctx.fillStyle = "#06060c";
  ctx.fillRect(0, ty, width, timeH);
  // Top border.
  ctx.fillStyle = "#141428";
  ctx.fillRect(0, ty, width, Math.max(1, Math.floor(zoom / 2)));

  // Draw event dots — most recent on the right.
  const maxDots = Math.floor((width - pad * 2) / (zoom * 3));
  const visible = log.slice(-maxDots);
  const dotSize = Math.max(2, zoom);
  const theme = world.getRepoTheme();

  const colorMap: Record<string, string> = {
    tool: theme.accent,
    tool_end: "#333348",
    agent_enter: "#2ECC71",
    agent_exit: "#E74C3C",
  };

  for (let i = 0; i < visible.length; i++) {
    const ev = visible[i];
    const dx = width - pad - (visible.length - i) * zoom * 3;
    const dy = ty + Math.floor((timeH - dotSize) / 2);
    ctx.fillStyle = colorMap[ev.type] || "#555566";
    ctx.fillRect(dx, dy, dotSize, dotSize);
  }
}

// ── HUD (redesigned — mission control dashboard) ──────

function drawHUD(rc: RenderContext): void {
  const { ctx, world, width, height, now } = rc;
  const zoom = rc.zoom;

  const stats = world.getUsageStats();
  const pad = zoom * 4;
  const barW = zoom * 56;
  const x = width - barW - pad * 2;
  const y = pad;
  const font = `"DM Mono", monospace`;
  const smallFont = Math.max(6, zoom * 3.5);
  const medFont = Math.max(7, zoom * 4);
  const bigFont = Math.max(8, zoom * 5);
  const lineH = zoom * 5;
  const theme = world.getRepoTheme();
  const brd = Math.max(1, Math.floor(zoom / 2));

  // Helper: draw section header with accent bar.
  let cursorY = y;
  const sectionHeader = (label: string) => {
    cursorY += zoom * 2;
    ctx.fillStyle = "#141428";
    ctx.fillRect(x, cursorY, barW, zoom);
    cursorY += zoom * 3;
    // Accent bar.
    ctx.fillStyle = theme.accent;
    ctx.fillRect(x, cursorY - zoom * 2, zoom, zoom * 3);
    // Label.
    ctx.fillStyle = "#555570";
    ctx.font = `${smallFont}px ${font}`;
    ctx.textAlign = "left";
    ctx.fillText(label, x + zoom * 3, cursorY);
  };

  // ── Calculate total panel height ──
  const activeAgentNames = world.getActiveAgentNames();
  const companionStatus = world.getCompanionStatus();
  const presentCompanions = companionStatus.filter(c => c.present);
  const agentListH = activeAgentNames.length > 0 ? (activeAgentNames.length + 1) * lineH : 0;
  const crewH = presentCompanions.length > 0 ? (presentCompanions.length + 1) * lineH : 0;
  const panelH = zoom * 120 + agentListH + crewH;
  const panelX = x - pad;
  const panelW = barW + pad * 2;

  // Clamp panel to canvas height.
  const maxPanelH = Math.min(panelH, height - pad * 2);

  // ── Panel background ──
  ctx.fillStyle = "#06060c";
  ctx.fillRect(panelX, y - pad, panelW, maxPanelH);
  ctx.fillStyle = "#08080f";
  ctx.fillRect(panelX + zoom, y - pad + zoom, panelW - zoom * 2, maxPanelH - zoom * 2);
  // Left accent border.
  ctx.fillStyle = theme.accent;
  ctx.fillRect(panelX, y - pad, zoom, maxPanelH);
  // Top/bottom accent lines.
  ctx.fillStyle = theme.accentDark;
  ctx.fillRect(panelX, y - pad, panelW, zoom);
  ctx.fillStyle = darken(theme.accentDark, 0.3);
  ctx.fillRect(panelX, y - pad + maxPanelH - zoom, panelW, zoom);
  // Corner brackets.
  const cb = zoom * 3;
  ctx.fillStyle = theme.accent;
  // Top-left.
  ctx.fillRect(panelX, y - pad, cb, brd);
  ctx.fillRect(panelX, y - pad, brd, cb);
  // Top-right.
  ctx.fillRect(panelX + panelW - cb, y - pad, cb, brd);
  ctx.fillRect(panelX + panelW - brd, y - pad, brd, cb);
  // Bottom-left.
  ctx.fillRect(panelX, y - pad + maxPanelH - brd, cb, brd);
  ctx.fillRect(panelX, y - pad + maxPanelH - cb, brd, cb);
  // Bottom-right.
  ctx.fillRect(panelX + panelW - cb, y - pad + maxPanelH - brd, cb, brd);
  ctx.fillRect(panelX + panelW - brd, y - pad + maxPanelH - cb, brd, cb);

  // ── Title row ──
  ctx.fillStyle = theme.accent;
  ctx.font = `bold ${bigFont}px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText("BAT CAVE", x, y + zoom * 4);

  if (theme.label !== "---") {
    ctx.fillStyle = theme.accentDark;
    const lblW = ctx.measureText(theme.label).width + zoom * 3;
    ctx.fillRect(x + zoom * 22, y, lblW, zoom * 4);
    ctx.fillStyle = theme.accent;
    ctx.font = `${smallFont}px ${font}`;
    ctx.fillText(theme.label, x + zoom * 23, y + zoom * 3);
  }

  // Model badge.
  const modelText = stats?.activeModel || "opus-4-6";
  const modelShort = modelText.replace("claude-", "");
  ctx.font = `${smallFont}px ${font}`;
  const badgeW = ctx.measureText(modelShort).width + zoom * 4;
  const badgeX = x + barW - badgeW;
  const badgeY = y + zoom;
  ctx.fillStyle = "#141428";
  ctx.fillRect(badgeX, badgeY, badgeW, zoom * 4);
  outlineRect(ctx, badgeX, badgeY, badgeW, zoom * 4, brd);
  ctx.fillStyle = "#8888AA";
  ctx.fillText(modelShort, badgeX + zoom * 2, badgeY + zoom * 3);

  cursorY = y + zoom * 5;

  // ── CONTEXT ──
  sectionHeader("CONTEXT");
  const pct = stats ? stats.contextFillPct / 100 : 0;
  const barColor = pct < 0.5 ? "#2ECC71" : pct < 0.8 ? "#F39C12" : "#E74C3C";
  // Percentage right-aligned.
  ctx.fillStyle = "#CCCCDD";
  ctx.font = `bold ${smallFont}px ${font}`;
  const pctText = `${stats?.contextFillPct ?? 0}%`;
  ctx.fillText(pctText, x + barW - ctx.measureText(pctText).width, cursorY);

  cursorY += zoom * 2;
  const barH = zoom * 3;
  ctx.fillStyle = "#0e0e1e";
  ctx.fillRect(x, cursorY, barW, barH);
  ctx.fillStyle = barColor;
  ctx.fillRect(x, cursorY, barW * pct, barH);
  // Notch markers with labels.
  ctx.fillStyle = "#06060c";
  for (const mark of [0.25, 0.5, 0.75]) {
    ctx.fillRect(x + Math.floor(barW * mark), cursorY, brd, barH);
  }
  // Marker labels below bar.
  cursorY += barH + zoom;
  ctx.fillStyle = "#333348";
  ctx.font = `${Math.max(5, zoom * 2.5)}px ${font}`;
  for (const [mark, label] of [[0.25, "25%"], [0.5, "50%"], [0.75, "75%"]] as const) {
    ctx.fillText(label, x + Math.floor(barW * mark) - zoom * 2, cursorY);
  }

  // ── STATUS (2x2 grid) ──
  sectionHeader("STATUS");
  cursorY += zoom * 2;
  const col2X = x + barW / 2;

  ctx.fillStyle = "#555570";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText("MSG", x, cursorY);
  ctx.fillStyle = "#CCCCDD";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(`${stats?.messagesThisSession ?? 0}`, x + zoom * 10, cursorY);

  ctx.fillStyle = "#555570";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText("TOOLS", col2X, cursorY);
  ctx.fillStyle = "#CCCCDD";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(`${stats?.toolCallsThisSession ?? 0}`, col2X + zoom * 12, cursorY);

  cursorY += lineH;
  ctx.fillStyle = "#555570";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText("SPAWN", x, cursorY);
  ctx.fillStyle = "#CCCCDD";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(`${stats?.agentsSpawnedThisSession ?? 0}`, x + zoom * 12, cursorY);

  const activeCount = world.getActiveAgentCount();
  ctx.fillStyle = "#555570";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText("ACTIVE", col2X, cursorY);
  ctx.fillStyle = activeCount > 0 ? "#2ECC71" : "#555566";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(`${activeCount}`, col2X + zoom * 13, cursorY);

  // ── AGENTS ──
  if (activeAgentNames.length > 0) {
    sectionHeader("AGENTS");
    for (let i = 0; i < activeAgentNames.length; i++) {
      cursorY += lineH;
      ctx.fillStyle = "#2ECC71";
      ctx.fillRect(x, cursorY - zoom * 2, zoom * 2, zoom * 2);
      ctx.fillStyle = "#AAAACC";
      ctx.font = `${smallFont}px ${font}`;
      ctx.fillText(activeAgentNames[i], x + zoom * 4, cursorY);
    }
  }

  // ── CREW (companions present) ──
  if (presentCompanions.length > 0) {
    sectionHeader("CREW");
    for (let i = 0; i < presentCompanions.length; i++) {
      cursorY += lineH;
      ctx.fillStyle = "#F39C12";
      ctx.fillRect(x, cursorY - zoom * 2, zoom * 2, zoom * 2);
      ctx.fillStyle = "#AAAACC";
      ctx.font = `${smallFont}px ${font}`;
      ctx.fillText(presentCompanions[i].name, x + zoom * 4, cursorY);
      ctx.fillStyle = "#555566";
      ctx.fillText("in cave", x + zoom * 20, cursorY);
    }
  }

  // ── TOOLS breakdown ──
  sectionHeader("TOOLS");
  cursorY += zoom * 2;
  const stripH = zoom * 3;
  const bd = world.getToolBreakdown();
  const bdTotal = bd.read + bd.write + bd.bash + bd.web + bd.agent + bd.other;

  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(x, cursorY, barW, stripH);

  const toolCats: { key: keyof typeof bd; color: string; label: string }[] = [
    { key: "read", color: "#1E7FD8", label: "R" },
    { key: "write", color: "#2ECC71", label: "W" },
    { key: "bash", color: "#F39C12", label: "B" },
    { key: "agent", color: "#9B59B6", label: "A" },
    { key: "web", color: "#E67E22", label: "W" },
    { key: "other", color: "#555566", label: "O" },
  ];
  if (bdTotal > 0) {
    let cx2 = x;
    for (const cat of toolCats) {
      const w = Math.floor((bd[cat.key] / bdTotal) * barW);
      if (w > 0) {
        ctx.fillStyle = cat.color;
        ctx.fillRect(cx2, cursorY, w, stripH);
        cx2 += w;
      }
    }
  }
  outlineRect(ctx, x, cursorY, barW, stripH, brd);

  // Tool legend with counts.
  cursorY += stripH + zoom * 2;
  ctx.font = `${Math.max(5, zoom * 2.5)}px ${font}`;
  let legendX = x;
  for (const cat of toolCats) {
    const count = bd[cat.key];
    if (count === 0 && bdTotal > 0) continue;
    ctx.fillStyle = cat.color;
    ctx.fillRect(legendX, cursorY - zoom, zoom * 2, zoom * 2);
    ctx.fillStyle = "#888899";
    ctx.fillText(`${count}`, legendX + zoom * 3, cursorY);
    legendX += zoom * 9;
  }

  // ── ACTIVITY heatmap ──
  sectionHeader("ACTIVITY");
  cursorY += zoom * 2;
  const hmH = zoom * 8;
  const slots = world.getHeatmapSlots();
  const visibleSlots = 20;
  const hmBarW = Math.floor(barW / visibleSlots);
  const maxHeat = Math.max(1, ...slots);

  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(x, cursorY, barW, hmH);

  const slotOffset = Math.max(0, slots.findIndex((_, i) => i >= slots.length - visibleSlots));
  for (let i = 0; i < visibleSlots; i++) {
    const val = slots[slotOffset + i] || 0;
    if (val === 0) continue;
    const intensity = val / maxHeat;
    const h = Math.max(zoom, Math.floor(hmH * intensity));
    ctx.fillStyle = intensity > 0.6 ? "#2a6a9e" : intensity > 0.3 ? "#1a4a6e" : "#101828";
    ctx.fillRect(x + i * hmBarW, cursorY + hmH - h, hmBarW - brd, h);
    if (intensity > 0.5 && h > zoom * 2) {
      ctx.fillStyle = "#3a8abe";
      ctx.fillRect(x + i * hmBarW, cursorY + hmH - h, hmBarW - brd, zoom);
    }
  }
  outlineRect(ctx, x, cursorY, barW, hmH, brd);

  // Time labels below heatmap.
  cursorY += hmH + zoom;
  ctx.fillStyle = "#333348";
  ctx.font = `${Math.max(5, zoom * 2.5)}px ${font}`;
  ctx.fillText("0m", x, cursorY);
  ctx.fillText("10m", x + Math.floor(barW / 2) - zoom * 3, cursorY);
  ctx.fillText("20m", x + barW - zoom * 6, cursorY);

  // ── SESSION duration + pace ──
  sectionHeader("SESSION");
  const sessionStart = stats?.sessionStartedAt ?? now;
  const elapsed = now - sessionStart;
  const mins = Math.floor(elapsed / 60_000);
  const secs = Math.floor((elapsed % 60_000) / 1000);
  const durStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  // Clock right-aligned.
  const d = new Date();
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  ctx.fillStyle = "#444458";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText(timeStr, x + barW - ctx.measureText(timeStr).width, cursorY);

  cursorY += zoom * 2;
  ctx.fillStyle = "#CCCCDD";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(durStr, x, cursorY);

  // Pace.
  const pace = world.getPace();
  const paceStr = `${pace.current}/m`;
  ctx.fillStyle = "#AAAACC";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(paceStr, x + zoom * 18, cursorY);

  // Trend arrow.
  const arrowX = x + zoom * 28;
  const arrowY2 = cursorY - zoom * 3;
  if (pace.trend === "up") {
    ctx.fillStyle = "#2ECC71";
    ctx.fillRect(arrowX + zoom, arrowY2, zoom, zoom);
    ctx.fillRect(arrowX, arrowY2 + zoom, zoom * 3, zoom);
    ctx.fillRect(arrowX + zoom, arrowY2 + zoom * 2, zoom, zoom);
  } else if (pace.trend === "down") {
    ctx.fillStyle = "#E74C3C";
    ctx.fillRect(arrowX + zoom, arrowY2 + zoom * 2, zoom, zoom);
    ctx.fillRect(arrowX, arrowY2 + zoom, zoom * 3, zoom);
    ctx.fillRect(arrowX + zoom, arrowY2, zoom, zoom);
  } else {
    ctx.fillStyle = "#555570";
    ctx.fillRect(arrowX, arrowY2 + zoom, zoom * 3, zoom);
  }

  // Sound toggle button.
  cursorY += lineH;
  const soundOn = world.isSoundEnabled();
  const btnSize = zoom * 5;
  const btnX = x;
  const btnY2 = cursorY - zoom * 2;
  const s = zoom;

  ctx.fillStyle = soundOn ? "#0e2a0e" : "#0e0e1e";
  ctx.fillRect(btnX, btnY2, btnSize, btnSize);
  outlineRect(ctx, btnX, btnY2, btnSize, btnSize, brd);

  const iconColor = soundOn ? "#2ECC71" : "#555566";
  ctx.fillStyle = iconColor;
  ctx.fillRect(btnX + s, btnY2 + s * 2, s, s);
  ctx.fillRect(btnX + s * 2, btnY2 + s, s, s * 3);
  if (soundOn) {
    ctx.fillRect(btnX + s * 3, btnY2 + s, s, s);
    ctx.fillRect(btnX + s * 3, btnY2 + s * 3, s, s);
  } else {
    ctx.fillStyle = "#E74C3C";
    ctx.fillRect(btnX + s * 3, btnY2 + s, s, s);
    ctx.fillRect(btnX + s * 3, btnY2 + s * 3, s, s);
  }
  _hitRegions.push({ x: btnX, y: btnY2, w: btnSize, h: btnSize, action: "toggleSound" });

  // ── STATE indicator ──
  sectionHeader("STATE");
  cursorY += zoom * 2;
  const state = world.getAlfredState();
  const stateColor: Record<string, string> = {
    idle: "#555566", thinking: theme.accent, writing: "#2ECC71",
  };
  const dotSize = zoom * 3;
  ctx.fillStyle = stateColor[state] || "#555566";
  ctx.fillRect(x, cursorY - zoom, dotSize, dotSize);
  if (state !== "idle") {
    const pulse = Math.sin(now / 300) * 0.5 + 0.5;
    const ringSize = dotSize + Math.floor(pulse * zoom * 2);
    ctx.fillStyle = state === "thinking" ? "#0e2040" : "#0e2a0e";
    ctx.fillRect(
      x - Math.floor((ringSize - dotSize) / 2),
      cursorY - zoom - Math.floor((ringSize - dotSize) / 2),
      ringSize, ringSize,
    );
    ctx.fillStyle = stateColor[state];
    ctx.fillRect(x, cursorY - zoom, dotSize, dotSize);
  }
  ctx.fillStyle = "#AAAACC";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(state.toUpperCase(), x + zoom * 5, cursorY + zoom);
  if (state !== "idle") {
    ctx.fillStyle = "#555566";
    ctx.font = `${smallFont}px ${font}`;
    ctx.fillText("working...", x + zoom * 20, cursorY + zoom);
  }

  // ── Scan line (CRT effect) ��─
  const scanY = y - pad + ((now / 40) % maxPanelH);
  ctx.fillStyle = "#ffffff06";
  ctx.fillRect(panelX, scanY, panelW, zoom);
}

// ── Agent toolbar (bottom bar) ─────────────────────────

function drawAgentToolbar(rc: RenderContext): void {
  const { ctx, world, width, height } = rc;
  const zoom = rc.zoom;
  const theme = world.getRepoTheme();
  const brd = Math.max(1, Math.floor(zoom / 2));

  const agentIds = Object.keys(AGENTS);
  const cellW = zoom * 6;
  const cellH = zoom * 6;
  const totalW = agentIds.length * cellW;
  const toolbarX = Math.floor((width - totalW) / 2);
  const timelineH = zoom * 4;
  const toolbarY = height - timelineH - cellH - zoom * 2;

  // Background.
  ctx.fillStyle = "#06060c";
  ctx.fillRect(toolbarX - zoom, toolbarY - zoom, totalW + zoom * 2, cellH + zoom * 2);
  outlineRect(ctx, toolbarX - zoom, toolbarY - zoom, totalW + zoom * 2, cellH + zoom * 2, brd);

  const activeNames = world.getActiveAgentNames();
  const font = `"DM Mono", monospace`;
  const emojiFont = Math.max(8, zoom * 3.5);

  for (let i = 0; i < agentIds.length; i++) {
    const id = agentIds[i];
    const agent = AGENTS[id];
    const cx = toolbarX + i * cellW;

    // Highlight active agents.
    const isActive = activeNames.some(n => n === agent.name);
    if (isActive) {
      ctx.fillStyle = theme.accentDark;
      ctx.fillRect(cx, toolbarY, cellW, cellH);
    }

    // Cell border.
    ctx.fillStyle = "#141428";
    ctx.fillRect(cx + cellW - brd, toolbarY, brd, cellH);

    // Emoji.
    ctx.font = `${emojiFont}px ${font}`;
    ctx.textAlign = "center";
    ctx.fillStyle = isActive ? "#CCCCDD" : "#555570";
    ctx.fillText(agent.emoji, cx + cellW / 2, toolbarY + cellH / 2 + zoom);

    // Hit region.
    _hitRegions.push({ x: cx, y: toolbarY, w: cellW, h: cellH, action: `launchAgent:${id}` });
  }

  ctx.textAlign = "left";
}

// ── Clickable regions ─────────────────────────────────

export interface HitRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  action: string;
}

let _hitRegions: HitRegion[] = [];

export function getHitRegions(): HitRegion[] {
  return _hitRegions;
}

// ── Public entry point ─────────────────────────────────

export function drawOverlay(rc: RenderContext): void {
  _hitRegions = [];
  drawToolIcon(rc);
  drawSpeechBubbles(rc);
  drawAgentToolbar(rc);
  drawTimeline(rc);
  drawHUD(rc);
}
