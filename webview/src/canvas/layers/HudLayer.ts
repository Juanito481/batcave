import { darken } from "../../helpers/color";
import { RenderContext, P, seed, outlineRect } from "./render-context";

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

  ctx.globalAlpha = 1;
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

  // Alfred bubble (show state when not idle).
  const alf = world.alfred;
  const alfredState = world.getAlfredState();
  if (alfredState !== "idle") {
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

// ── HUD ────────────────────────────────────────────────

function drawHUD(rc: RenderContext): void {
  const { ctx, world, width, height, now } = rc;
  const zoom = rc.zoom;

  const stats = world.getUsageStats();
  const pad = zoom * 4;
  const barW = zoom * 44;
  const x = width - barW - pad * 2;
  const y = pad;
  const font = `"DM Mono", monospace`;
  const smallFont = Math.max(6, zoom * 3.5);
  const medFont = Math.max(7, zoom * 4);
  const bigFont = Math.max(8, zoom * 5);
  const lineH = zoom * 5;

  // -- Panel background --
  const activeAgentNames = world.getActiveAgentNames();
  const agentListH = activeAgentNames.length > 0 ? (activeAgentNames.length + 1) * lineH : 0;
  const panelH = zoom * 56 + agentListH;
  const panelX = x - pad;
  const panelW = barW + pad * 2;

  ctx.fillStyle = "#06060c";
  ctx.fillRect(panelX, y - pad, panelW, panelH);
  // Inner slightly lighter area.
  ctx.fillStyle = "#08080f";
  ctx.fillRect(panelX + zoom, y - pad + zoom, panelW - zoom * 2, panelH - zoom * 2);
  // Left accent border (repo-themed).
  const theme = world.getRepoTheme();
  ctx.fillStyle = theme.accent;
  ctx.fillRect(panelX, y - pad, zoom, panelH);
  // Top accent line.
  ctx.fillStyle = theme.accentDark;
  ctx.fillRect(panelX, y - pad, panelW, zoom);
  // Bottom accent line.
  ctx.fillStyle = darken(theme.accentDark, 0.3);
  ctx.fillRect(panelX, y - pad + panelH - zoom, panelW, zoom);

  // -- Title row --
  ctx.fillStyle = theme.accent;
  ctx.font = `bold ${bigFont}px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText("BAT CAVE", x, y + zoom * 4);

  // Repo label (right of title).
  if (theme.label !== "---") {
    ctx.fillStyle = theme.accentDark;
    const lblW = ctx.measureText(theme.label).width + zoom * 3;
    ctx.fillRect(x + zoom * 22, y, lblW, zoom * 4);
    ctx.fillStyle = theme.accent;
    ctx.font = `${smallFont}px ${font}`;
    ctx.fillText(theme.label, x + zoom * 23, y + zoom * 3);
  }

  // Model badge (pill shape).
  const modelText = stats?.activeModel || "opus-4-6";
  const modelShort = modelText.replace("claude-", "");
  ctx.font = `${smallFont}px ${font}`;
  const badgeW = ctx.measureText(modelShort).width + zoom * 4;
  const badgeX = x + barW - badgeW;
  const badgeY = y + zoom;
  ctx.fillStyle = "#141428";
  ctx.fillRect(badgeX, badgeY, badgeW, zoom * 4);
  outlineRect(ctx, badgeX, badgeY, badgeW, zoom * 4, Math.max(1, Math.floor(zoom / 2)));
  ctx.fillStyle = "#8888AA";
  ctx.fillText(modelShort, badgeX + zoom * 2, badgeY + zoom * 3);

  // -- Divider --
  const div1Y = y + zoom * 6;
  ctx.fillStyle = "#141428";
  ctx.fillRect(x, div1Y, barW, zoom);

  // -- Context bar --
  const ctxLabelY = div1Y + zoom * 3;
  ctx.fillStyle = "#555570";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText("CONTEXT", x, ctxLabelY);

  const barY = ctxLabelY + zoom * 2;
  const pct = stats ? stats.contextFillPct / 100 : 0;
  const barColor = pct < 0.5 ? "#2ECC71" : pct < 0.8 ? "#F39C12" : "#E74C3C";
  const barH = zoom * 2;
  // Track.
  ctx.fillStyle = "#0e0e1e";
  ctx.fillRect(x, barY, barW, barH);
  // Fill.
  ctx.fillStyle = barColor;
  ctx.fillRect(x, barY, barW * pct, barH);
  // Notch markers.
  ctx.fillStyle = "#06060c";
  for (const mark of [0.25, 0.5, 0.75]) {
    ctx.fillRect(x + Math.floor(barW * mark), barY, Math.max(1, Math.floor(zoom / 2)), barH);
  }
  // Percentage right-aligned.
  ctx.fillStyle = "#CCCCDD";
  ctx.font = `bold ${smallFont}px ${font}`;
  const pctText = `${stats?.contextFillPct ?? 0}%`;
  ctx.fillText(pctText, x + barW - ctx.measureText(pctText).width, ctxLabelY);

  // -- Counters grid (2x2) --
  const div2Y = barY + zoom * 4;
  ctx.fillStyle = "#141428";
  ctx.fillRect(x, div2Y, barW, zoom);

  ctx.font = `${medFont}px ${font}`;
  const gridY = div2Y + zoom * 4;
  const col2X = x + barW / 2;

  // Row 1.
  ctx.fillStyle = "#555570";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText("MSG", x, gridY);
  ctx.fillStyle = "#CCCCDD";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(`${stats?.messagesThisSession ?? 0}`, x + zoom * 10, gridY);

  ctx.fillStyle = "#555570";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText("TOOLS", col2X, gridY);
  ctx.fillStyle = "#CCCCDD";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(`${stats?.toolCallsThisSession ?? 0}`, col2X + zoom * 12, gridY);

  // Row 2.
  const row2Y = gridY + lineH;
  ctx.fillStyle = "#555570";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText("SPAWN", x, row2Y);
  ctx.fillStyle = "#CCCCDD";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(`${stats?.agentsSpawnedThisSession ?? 0}`, x + zoom * 12, row2Y);

  const activeCount = world.getActiveAgentCount();
  ctx.fillStyle = "#555570";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText("ACTIVE", col2X, row2Y);
  ctx.fillStyle = activeCount > 0 ? "#2ECC71" : "#555566";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(`${activeCount}`, col2X + zoom * 13, row2Y);

  // -- Divider --
  const divY = row2Y + lineH;
  ctx.fillStyle = "#141428";
  ctx.fillRect(x, divY, barW, zoom);

  // -- Active agents list --
  let nextSectionY = divY + zoom * 2;
  if (activeAgentNames.length > 0) {
    const agentStartY = divY + lineH;
    ctx.fillStyle = "#555570";
    ctx.font = `${smallFont}px ${font}`;
    ctx.fillText("AGENTS", x, agentStartY);

    for (let i = 0; i < activeAgentNames.length; i++) {
      const ay = agentStartY + (i + 1) * lineH;
      // Green dot.
      ctx.fillStyle = "#2ECC71";
      ctx.fillRect(x, ay - zoom * 2, zoom * 2, zoom * 2);
      // Name.
      ctx.fillStyle = "#AAAACC";
      ctx.font = `${smallFont}px ${font}`;
      ctx.fillText(activeAgentNames[i], x + zoom * 4, ay);
    }
    nextSectionY = agentStartY + (activeAgentNames.length + 1) * lineH;
  }

  // -- Activity sparkline --
  const sparkY = nextSectionY + zoom * 2;
  ctx.fillStyle = "#555570";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText("ACTIVITY", x, sparkY);

  const sparkBarY = sparkY + zoom * 2;
  const sparkBarH = zoom * 6;
  const bars = 20;
  const barWidth = Math.floor(barW / bars);

  // Sparkline background.
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(x, sparkBarY, barW, sparkBarH);

  for (let i = 0; i < bars; i++) {
    const s = seed(i + Math.floor(now / 2000));
    const activity = stats ? Math.min(1, (stats.toolCallsThisSession / 40) * s) : s * 0.08;
    const h = Math.max(zoom, Math.floor(sparkBarH * activity));
    const barActive = activity > 0.4;
    ctx.fillStyle = barActive ? "#1a4a6e" : "#101828";
    ctx.fillRect(x + i * barWidth, sparkBarY + sparkBarH - h, barWidth - Math.max(1, Math.floor(zoom / 2)), h);
    // Bright top pixel on active bars.
    if (barActive && h > zoom * 2) {
      ctx.fillStyle = "#2a6a9e";
      ctx.fillRect(x + i * barWidth, sparkBarY + sparkBarH - h, barWidth - Math.max(1, Math.floor(zoom / 2)), zoom);
    }
  }
  // Sparkline border.
  outlineRect(ctx, x, sparkBarY, barW, sparkBarH, Math.max(1, Math.floor(zoom / 2)));

  // -- Session time --
  const timeY = sparkBarY + sparkBarH + zoom * 4;
  const d = new Date();
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  ctx.fillStyle = "#444458";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText(timeStr, x + barW - ctx.measureText(timeStr).width, timeY);

  // -- State indicator (bottom-left) --
  const state = world.getAlfredState();
  const stateColor: Record<string, string> = {
    idle: "#555566", thinking: theme.accent, writing: "#2ECC71",
  };
  const dotSize = zoom * 3;
  ctx.fillStyle = stateColor[state] || "#555566";
  ctx.fillRect(pad, height - pad - zoom * 6, dotSize, dotSize);
  if (state !== "idle") {
    const pulse = Math.sin(now / 300) * 0.5 + 0.5;
    const ringSize = dotSize + Math.floor(pulse * zoom * 2);
    ctx.fillStyle = state === "thinking" ? "#0e2040" : "#0e2a0e";
    ctx.fillRect(
      pad - Math.floor((ringSize - dotSize) / 2),
      height - pad - zoom * 6 - Math.floor((ringSize - dotSize) / 2),
      ringSize, ringSize
    );
    ctx.fillStyle = stateColor[state];
    ctx.fillRect(pad, height - pad - zoom * 6, dotSize, dotSize);
  }
  ctx.fillStyle = "#AAAACC";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText(state.toUpperCase(), pad + zoom * 5, height - pad - zoom * 4);

  if (state !== "idle") {
    ctx.fillStyle = "#555566";
    ctx.font = `${smallFont}px ${font}`;
    ctx.fillText("working...", pad + zoom * 5, height - pad - zoom * 1);
  }
}

// ── Public entry point ─────────────────────────────────

export function drawOverlay(rc: RenderContext): void {
  drawToolIcon(rc);
  drawSpeechBubbles(rc);
  drawTimeline(rc);
  drawHUD(rc);
}
