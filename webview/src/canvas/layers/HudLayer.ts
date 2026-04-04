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

// ── Session timeline (bottom strip) ───────────────────

function drawTimeline(rc: RenderContext): void {
  const { ctx, world, width, height } = rc;
  const zoom = rc.zoom;

  const log = world.getEventLog();
  if (log.length === 0) return;

  const timeH = zoom * 4;
  const ty = height - timeH;
  const pad = zoom * 2;

  ctx.fillStyle = "#06060c";
  ctx.fillRect(0, ty, width, timeH);
  ctx.fillStyle = "#141428";
  ctx.fillRect(0, ty, width, Math.max(1, Math.floor(zoom / 2)));

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

// ── HUD shared types ─────────────────────────────────

interface HudParams {
  ctx: CanvasRenderingContext2D;
  x: number;
  barW: number;
  zoom: number;
  font: string;
  smallFont: number;
  medFont: number;
  bigFont: number;
  lineH: number;
  sectionGap: number;
  brd: number;
  theme: { accent: string; accentDark: string; label: string };
}

// ── HUD section renderers ────────────────────────────

function drawSectionHeader(p: HudParams, cursorY: number, label: string): number {
  const { ctx, x, barW, zoom, font, smallFont, theme } = p;
  cursorY += p.sectionGap;
  ctx.fillStyle = "#141428";
  ctx.fillRect(x, cursorY, barW, zoom);
  cursorY += zoom * 3;
  ctx.fillStyle = theme.accent;
  ctx.fillRect(x, cursorY - zoom * 2, zoom, zoom * 3);
  ctx.fillStyle = "#555570";
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText(label, x + zoom * 3, cursorY);
  return cursorY;
}

function drawHudContext(p: HudParams, cursorY: number, pct: number, pctVal: number): number {
  const { ctx, x, barW, zoom, font, smallFont, brd } = p;
  cursorY = drawSectionHeader(p, cursorY, "CONTEXT");
  const barColor = pct < 0.5 ? "#2ECC71" : pct < 0.8 ? "#F39C12" : "#E74C3C";
  ctx.fillStyle = "#CCCCDD";
  ctx.font = `bold ${smallFont}px ${font}`;
  const pctText = `${pctVal}%`;
  ctx.fillText(pctText, x + barW - ctx.measureText(pctText).width, cursorY);

  cursorY += zoom * 3;
  const barH = zoom * 4;
  ctx.fillStyle = "#0e0e1e";
  ctx.fillRect(x, cursorY, barW, barH);
  ctx.fillStyle = barColor;
  ctx.fillRect(x, cursorY, barW * pct, barH);
  ctx.fillStyle = "#06060c";
  for (const mark of [0.25, 0.5, 0.75]) {
    ctx.fillRect(x + Math.floor(barW * mark), cursorY, brd, barH);
  }
  cursorY += barH + zoom * 2;
  ctx.fillStyle = "#333348";
  ctx.font = `${Math.max(5, zoom * 2.5)}px ${font}`;
  for (const [mark, label] of [[0.25, "25%"], [0.5, "50%"], [0.75, "75%"]] as const) {
    ctx.fillText(label, x + Math.floor(barW * mark) - zoom * 2, cursorY);
  }
  return cursorY;
}

function drawHudStatus(
  p: HudParams, cursorY: number,
  msgs: number, tools: number, spawn: number, active: number,
): number {
  const { ctx, x, barW, zoom, font, smallFont, medFont, lineH } = p;
  cursorY = drawSectionHeader(p, cursorY, "STATUS");
  cursorY += zoom * 3;
  const col2X = x + barW / 2;

  ctx.fillStyle = "#555570";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText("MSG", x, cursorY);
  ctx.fillStyle = "#CCCCDD";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(`${msgs}`, x + zoom * 10, cursorY);

  ctx.fillStyle = "#555570";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText("TOOLS", col2X, cursorY);
  ctx.fillStyle = "#CCCCDD";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(`${tools}`, col2X + zoom * 12, cursorY);

  cursorY += lineH + zoom;
  ctx.fillStyle = "#555570";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText("SPAWN", x, cursorY);
  ctx.fillStyle = "#CCCCDD";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(`${spawn}`, x + zoom * 12, cursorY);

  ctx.fillStyle = "#555570";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText("ACTIVE", col2X, cursorY);
  ctx.fillStyle = active > 0 ? "#2ECC71" : "#555566";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(`${active}`, col2X + zoom * 13, cursorY);

  return cursorY;
}

function drawHudAgents(p: HudParams, cursorY: number, names: string[]): number {
  if (names.length === 0) return cursorY;
  const { ctx, x, zoom, font, smallFont, lineH } = p;
  cursorY = drawSectionHeader(p, cursorY, "AGENTS");
  for (const name of names) {
    cursorY += lineH;
    ctx.fillStyle = "#2ECC71";
    ctx.fillRect(x, cursorY - zoom * 2, zoom * 2, zoom * 2);
    ctx.fillStyle = "#AAAACC";
    ctx.font = `${smallFont}px ${font}`;
    ctx.fillText(name, x + zoom * 4, cursorY);
  }
  return cursorY;
}

function drawHudCrew(p: HudParams, cursorY: number, companions: { name: string; present: boolean }[]): number {
  const present = companions.filter(c => c.present);
  if (present.length === 0) return cursorY;
  const { ctx, x, zoom, font, smallFont, lineH } = p;
  cursorY = drawSectionHeader(p, cursorY, "CREW");
  for (const c of present) {
    cursorY += lineH;
    ctx.fillStyle = "#F39C12";
    ctx.fillRect(x, cursorY - zoom * 2, zoom * 2, zoom * 2);
    ctx.fillStyle = "#AAAACC";
    ctx.font = `${smallFont}px ${font}`;
    ctx.fillText(c.name, x + zoom * 4, cursorY);
    ctx.fillStyle = "#555566";
    ctx.fillText("in cave", x + zoom * 20, cursorY);
  }
  return cursorY;
}

function drawHudTools(
  p: HudParams, cursorY: number,
  bd: { read: number; write: number; bash: number; web: number; agent: number; other: number },
): number {
  const { ctx, x, barW, zoom, font, brd } = p;
  cursorY = drawSectionHeader(p, cursorY, "TOOLS");
  cursorY += zoom * 3;
  const stripH = zoom * 4;
  const bdTotal = bd.read + bd.write + bd.bash + bd.web + bd.agent + bd.other;

  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(x, cursorY, barW, stripH);

  const toolCats: { key: keyof typeof bd; color: string; label: string }[] = [
    { key: "read", color: "#1E7FD8", label: "R" },
    { key: "write", color: "#2ECC71", label: "W" },
    { key: "bash", color: "#F39C12", label: "B" },
    { key: "agent", color: "#9B59B6", label: "A" },
    { key: "web", color: "#E67E22", label: "Wb" },
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

  cursorY += stripH + zoom * 3;
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
  return cursorY;
}

function drawHudActivity(p: HudParams, cursorY: number, slots: number[]): number {
  const { ctx, x, barW, zoom, font, brd } = p;
  cursorY = drawSectionHeader(p, cursorY, "ACTIVITY");
  cursorY += zoom * 3;
  const hmH = zoom * 10;
  const visibleSlots = 20;
  const hmBarW = Math.floor(barW / visibleSlots);
  const maxHeat = Math.max(1, ...slots);

  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(x, cursorY, barW, hmH);

  const slotOffset = Math.max(0, slots.length - visibleSlots);
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

  cursorY += hmH + zoom * 2;
  ctx.fillStyle = "#333348";
  ctx.font = `${Math.max(5, zoom * 2.5)}px ${font}`;
  ctx.fillText("0m", x, cursorY);
  ctx.fillText("10m", x + Math.floor(barW / 2) - zoom * 3, cursorY);
  ctx.fillText("20m", x + barW - zoom * 6, cursorY);
  return cursorY;
}

function drawHudSession(
  p: HudParams, cursorY: number,
  now: number, sessionStart: number,
  pace: { avg: number; current: number; trend: "up" | "down" | "stable" },
): number {
  const { ctx, x, barW, zoom, font, smallFont, medFont } = p;
  cursorY = drawSectionHeader(p, cursorY, "SESSION");

  const elapsed = now - sessionStart;
  const mins = Math.floor(elapsed / 60_000);
  const secs = Math.floor((elapsed % 60_000) / 1000);
  const durStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const d = new Date();
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  ctx.fillStyle = "#444458";
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillText(timeStr, x + barW - ctx.measureText(timeStr).width, cursorY);

  cursorY += zoom * 3;
  ctx.fillStyle = "#CCCCDD";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(durStr, x, cursorY);

  const paceStr = `${pace.current}/m`;
  ctx.fillStyle = "#AAAACC";
  ctx.font = `bold ${medFont}px ${font}`;
  ctx.fillText(paceStr, x + zoom * 18, cursorY);

  // Trend arrow.
  const arrowX = x + zoom * 28;
  const arrowY = cursorY - zoom * 3;
  if (pace.trend === "up") {
    ctx.fillStyle = "#2ECC71";
    ctx.fillRect(arrowX + zoom, arrowY, zoom, zoom);
    ctx.fillRect(arrowX, arrowY + zoom, zoom * 3, zoom);
    ctx.fillRect(arrowX + zoom, arrowY + zoom * 2, zoom, zoom);
  } else if (pace.trend === "down") {
    ctx.fillStyle = "#E74C3C";
    ctx.fillRect(arrowX + zoom, arrowY + zoom * 2, zoom, zoom);
    ctx.fillRect(arrowX, arrowY + zoom, zoom * 3, zoom);
    ctx.fillRect(arrowX + zoom, arrowY, zoom, zoom);
  } else {
    ctx.fillStyle = "#555570";
    ctx.fillRect(arrowX, arrowY + zoom, zoom * 3, zoom);
  }
  return cursorY;
}

function drawHudSoundToggle(p: HudParams, cursorY: number, soundOn: boolean): number {
  const { ctx, x, zoom, brd } = p;
  cursorY += p.sectionGap;
  const btnSize = zoom * 5;
  const btnX = x;
  const btnY = cursorY;
  const s = zoom;

  ctx.fillStyle = soundOn ? "#0e2a0e" : "#0e0e1e";
  ctx.fillRect(btnX, btnY, btnSize, btnSize);
  outlineRect(ctx, btnX, btnY, btnSize, btnSize, brd);

  const iconColor = soundOn ? "#2ECC71" : "#555566";
  ctx.fillStyle = iconColor;
  ctx.fillRect(btnX + s, btnY + s * 2, s, s);
  ctx.fillRect(btnX + s * 2, btnY + s, s, s * 3);
  if (soundOn) {
    ctx.fillRect(btnX + s * 3, btnY + s, s, s);
    ctx.fillRect(btnX + s * 3, btnY + s * 3, s, s);
  } else {
    ctx.fillStyle = "#E74C3C";
    ctx.fillRect(btnX + s * 3, btnY + s, s, s);
    ctx.fillRect(btnX + s * 3, btnY + s * 3, s, s);
  }
  _hitRegions.push({ x: btnX, y: btnY, w: btnSize, h: btnSize, action: "toggleSound" });
  return cursorY + btnSize;
}

function drawHudState(p: HudParams, cursorY: number, state: string, now: number): number {
  const { ctx, x, zoom, font, medFont, smallFont, theme } = p;
  cursorY = drawSectionHeader(p, cursorY, "STATE");
  cursorY += zoom * 3;
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
  return cursorY;
}

// ── HUD main orchestrator ────────────────────────────

function drawHUD(rc: RenderContext): void {
  const { ctx, world, width, height, now } = rc;
  const zoom = rc.zoom;
  const theme = world.getRepoTheme();
  const stats = world.getUsageStats();

  // Panel sizing — 40% of width, with breathing room.
  const pad = zoom * 4;
  const sectionGap = zoom * 4;
  const barW = Math.max(zoom * 56, Math.floor(width * 0.38));
  const x = width - barW - pad * 2;
  const y = pad;
  const font = `"DM Mono", monospace`;
  const smallFont = Math.max(6, zoom * 3.5);
  const medFont = Math.max(7, zoom * 4);
  const bigFont = Math.max(8, zoom * 5);
  const lineH = zoom * 6;
  const brd = Math.max(1, Math.floor(zoom / 2));

  const p: HudParams = {
    ctx, x, barW, zoom, font, smallFont, medFont, bigFont, lineH, sectionGap, brd,
    theme: { accent: theme.accent, accentDark: theme.accentDark, label: theme.label },
  };

  // Gather data.
  const activeAgentNames = world.getActiveAgentNames();
  const companionStatus = world.getCompanionStatus();
  const presentCompanions = companionStatus.filter(c => c.present);
  const agentListH = activeAgentNames.length > 0 ? (activeAgentNames.length + 1) * lineH : 0;
  const crewH = presentCompanions.length > 0 ? (presentCompanions.length + 1) * lineH : 0;

  // Total panel height estimate.
  const panelH = zoom * 140 + agentListH + crewH;
  const panelX = x - pad;
  const panelW = barW + pad * 2;
  const maxPanelH = Math.min(panelH, height - pad * 2);

  // ── Panel background ──
  ctx.fillStyle = "#06060c";
  ctx.fillRect(panelX, y - pad, panelW, maxPanelH);
  ctx.fillStyle = "#08080f";
  ctx.fillRect(panelX + zoom, y - pad + zoom, panelW - zoom * 2, maxPanelH - zoom * 2);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(panelX, y - pad, zoom, maxPanelH);
  ctx.fillStyle = theme.accentDark;
  ctx.fillRect(panelX, y - pad, panelW, zoom);
  ctx.fillStyle = darken(theme.accentDark, 0.3);
  ctx.fillRect(panelX, y - pad + maxPanelH - zoom, panelW, zoom);

  // Corner brackets.
  const cb = zoom * 3;
  ctx.fillStyle = theme.accent;
  ctx.fillRect(panelX, y - pad, cb, brd);
  ctx.fillRect(panelX, y - pad, brd, cb);
  ctx.fillRect(panelX + panelW - cb, y - pad, cb, brd);
  ctx.fillRect(panelX + panelW - brd, y - pad, brd, cb);
  ctx.fillRect(panelX, y - pad + maxPanelH - brd, cb, brd);
  ctx.fillRect(panelX, y - pad + maxPanelH - cb, brd, cb);
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

  // ── Render sections (each returns its final cursorY) ──
  let cursorY = y + zoom * 6;
  const pct = stats ? stats.contextFillPct / 100 : 0;
  cursorY = drawHudContext(p, cursorY, pct, stats?.contextFillPct ?? 0);
  cursorY = drawHudState(p, cursorY, world.getAlfredState(), now);
  cursorY = drawHudStatus(p, cursorY,
    stats?.messagesThisSession ?? 0,
    stats?.toolCallsThisSession ?? 0,
    stats?.agentsSpawnedThisSession ?? 0,
    world.getActiveAgentCount(),
  );
  cursorY = drawHudAgents(p, cursorY, activeAgentNames);
  cursorY = drawHudCrew(p, cursorY, companionStatus);
  cursorY = drawHudTools(p, cursorY, world.getToolBreakdown());
  cursorY = drawHudActivity(p, cursorY, world.getHeatmapSlots());
  cursorY = drawHudSession(p, cursorY, now, stats?.sessionStartedAt ?? now, world.getPace());
  cursorY = drawHudSoundToggle(p, cursorY, world.isSoundEnabled());

  // ── Scan line (CRT effect — opaque palette, no alpha) ──
  const scanY = y - pad + ((now / 40) % maxPanelH);
  ctx.fillStyle = "#0e0e1e";
  ctx.fillRect(panelX + zoom, scanY, panelW - zoom * 2, zoom);
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

    const isActive = activeNames.some(n => n === agent.name);
    if (isActive) {
      ctx.fillStyle = theme.accentDark;
      ctx.fillRect(cx, toolbarY, cellW, cellH);
    }

    ctx.fillStyle = "#141428";
    ctx.fillRect(cx + cellW - brd, toolbarY, brd, cellH);

    ctx.font = `${emojiFont}px ${font}`;
    ctx.textAlign = "center";
    ctx.fillStyle = isActive ? "#CCCCDD" : "#555570";
    ctx.fillText(agent.emoji, cx + cellW / 2, toolbarY + cellH / 2 + zoom);

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
