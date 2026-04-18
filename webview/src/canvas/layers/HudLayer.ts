import { darken } from "../../helpers/color";
import { RenderContext, P, outlineRect } from "./render-context";
import { AGENTS } from "../../../../shared/types";
import { PanelCtx } from "./panels/FilesPanel";
import { drawFilesPanel } from "./panels/FilesPanel";
import { drawStatsPanel } from "./panels/StatsPanel";
import { drawAgentsPanel } from "./panels/AgentsPanel";
import { drawAgentDetailPanel } from "./panels/AgentDetailPanel";
import { drawHistoryPanel } from "./panels/HistoryPanel";
import { drawAuditPanel } from "./panels/AuditPanel";
import { drawAchievementsPanel } from "./panels/AchievementsPanel";
import { drawAchievementDetailPanel } from "./panels/AchievementDetailPanel";

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
  ctx.fillStyle = P.BG_RAISED;
  ctx.fillRect(iconX - s, iy - s, s * 6, s * 6);
  ctx.fillStyle = P.ACCENT_SEC;
  ctx.fillRect(iconX - s, iy - s, s * 6, iconBrd); // accent top
  outlineRect(ctx, iconX - s, iy - s, s * 6, s * 6, iconBrd, P.FURNITURE_OUTLINE);

  // Draw tool-specific pixel icon.
  const cat = toolCategory(tool);
  const theme = world.getRepoTheme();

  if (cat === "read") {
    // Book icon — Signal Room blues.
    ctx.fillStyle = P.ACCENT_SEC;
    ctx.fillRect(iconX, iy, s * 4, s * 3);
    ctx.fillStyle = P.ACCENT;
    ctx.fillRect(iconX, iy, s * 2, s * 3);
    ctx.fillStyle = P.TEXT;
    ctx.fillRect(iconX + s, iy + s, s * 2, Math.max(1, Math.floor(zoom / 2)));
  } else if (cat === "write") {
    // Pencil icon — warn amber.
    ctx.fillStyle = P.WARN;
    ctx.fillRect(iconX + s, iy, s, s * 3);
    ctx.fillStyle = P.DANGER;
    ctx.fillRect(iconX + s, iy + s * 3, s, s);
    ctx.fillStyle = P.TEXT;
    ctx.fillRect(iconX + s, iy - s, s, s);
  } else if (cat === "bash") {
    // Terminal chevron — success green.
    ctx.fillStyle = P.SUCCESS;
    ctx.fillRect(iconX, iy, s, s);
    ctx.fillRect(iconX + s, iy + s, s, s);
    ctx.fillStyle = P.SURFACE;
    ctx.fillRect(iconX + s * 2, iy + s * 2, s * 2, s);
  } else if (cat === "web") {
    // Globe — accent blue.
    ctx.fillStyle = theme.accent;
    ctx.fillRect(iconX + s, iy, s * 2, s);
    ctx.fillRect(iconX, iy + s, s * 4, s * 2);
    ctx.fillRect(iconX + s, iy + s * 3, s * 2, s);
    ctx.fillStyle = darken(theme.accent, 0.3);
    ctx.fillRect(iconX + s * 2, iy + s, s, s * 2);
  } else if (cat === "agent") {
    // Agent silhouette — purple/oracle.
    ctx.fillStyle = "#7a40b0";
    ctx.fillRect(iconX + s, iy, s * 2, s);
    ctx.fillRect(iconX, iy + s, s * 4, s);
    ctx.fillRect(iconX + s, iy + s * 2, s * 2, s);
    ctx.fillRect(iconX, iy + s * 3, s * 4, s);
  } else {
    // Generic tool — text muted.
    ctx.fillStyle = P.TEXT_MUTED;
    ctx.fillRect(iconX + s, iy, s * 2, s * 4);
    ctx.fillRect(iconX, iy + s, s * 4, s * 2);
  }

  ctx.restore();
}

function toolCategory(
  tool: string,
): "read" | "write" | "bash" | "web" | "agent" | "other" {
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
  } else if (world.getAlfredSilentBubble()) {
    // Silent-click feedback — brief "·" dot when Alfred cooldown is active (P1 #5).
    drawBubble(ctx, alf.x, alf.y - zoom * 20, "\u00b7", zoom, fontSize);
  } else if (alfredState !== "idle") {
    const tool = world.getCurrentTool();
    const text = tool ? tool.toLowerCase() : alfredState;
    drawBubble(ctx, alf.x, alf.y - zoom * 20, text, zoom, fontSize);
  }

  for (const agent of agents) {
    if (!agent.visible) continue;

    // Regular quip or working indicator.
    const agentQuip = world.getAgentQuip(agent.id);
    if (agentQuip) {
      drawBubble(ctx, agent.x, agent.y - zoom * 18, agentQuip, zoom, fontSize);
    } else if (
      agent.state !== "idle" &&
      agent.state !== "entering" &&
      agent.state !== "exiting"
    ) {
      drawBubble(
        ctx,
        agent.x,
        agent.y - zoom * 18,
        "working...",
        zoom,
        fontSize,
      );
    }
  }
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  zoom: number,
  fontSize: number,
): void {
  const pad = zoom * 2;
  const textW = ctx.measureText(text).width;
  const bw = textW + pad * 2;
  const bh = fontSize + pad * 2;
  const bx = Math.floor(x - bw / 2);
  const by = Math.floor(y - bh);
  const brd = Math.max(1, Math.floor(zoom / 2));

  // Bubble body — Signal Room surface.
  ctx.fillStyle = P.BG_RAISED;
  ctx.fillRect(bx, by, bw, bh);
  // Accent top strip.
  ctx.fillStyle = P.ACCENT_SEC;
  ctx.fillRect(bx, by, bw, brd);
  // Borders — radius 0px (Fox rule).
  outlineRect(ctx, bx, by, bw, bh, brd, P.FURNITURE_OUTLINE);
  // Tail.
  ctx.fillStyle = P.BG_RAISED;
  ctx.fillRect(Math.floor(x - zoom), by + bh, zoom * 2, zoom);
  ctx.fillRect(Math.floor(x), by + bh + zoom, zoom, zoom);

  // Text — Fox text color.
  ctx.fillStyle = P.TEXT;
  ctx.textAlign = "center";
  ctx.fillText(text, x, by + fontSize + pad - zoom);
}

// ── Signal Room HUD — the protagonist of the minigioco ────────────────────
//
// Layout (all radius 0px — Fox rule):
//   Context bar      full-width top strip, 4px, #1fa35c→#b07d20→#c0392b
//   State chip       top-left: [dot] IDLE|THINKING|WRITING  DM Mono 11px
//   Info chip        top-right: repo · model · 00:00
//   Pace indicator   below info chip: tools/min + trend
//   Agent roster     right panel: 21 Scacchiera agents with status
//   Chain panel      below agent roster: active chains
//   Oracle panel     bottom-right: graph stats
//   XP bar           below context bar (retained from v4)
//   Session dots     multiple sessions indicator
//   Alerts           inline below state chip

function drawOverlayHud(rc: RenderContext): void {
  const { ctx, world, width, height, now } = rc;
  const zoom = rc.zoom;
  const theme = world.getRepoTheme();
  const stats = world.getUsageStats();
  const font  = `"DM Mono", "SF Mono", "Menlo", monospace`;
  const brd   = Math.max(1, Math.floor(zoom / 2));
  const pad   = zoom * 3;

  // ── 1. Context bar — 4px, full width ─────────────────────────────────────
  const ctxBarH = Math.max(4, zoom * 2);
  const pct = stats ? stats.contextFillPct / 100 : 0;
  // Signal Room gradient: green → amber → danger.
  const barColor = pct < 0.5 ? P.SUCCESS : pct < 0.8 ? P.WARN : P.DANGER;

  ctx.fillStyle = P.OUTLINE;
  ctx.fillRect(0, 0, width, ctxBarH + brd);
  ctx.fillStyle = barColor;
  ctx.fillRect(0, 0, Math.floor(width * pct), ctxBarH);
  // Quarter tick marks at 25/50/75%.
  ctx.fillStyle = P.OUTLINE;
  for (const mark of [0.25, 0.5, 0.75]) {
    ctx.fillRect(Math.floor(width * mark), 0, Math.max(1, brd), ctxBarH);
  }
  // Percentage label right-aligned inside bar.
  const pctVal = stats?.contextFillPct ?? 0;
  if (pctVal > 0) {
    ctx.font = `bold ${Math.max(8, zoom * 2)}px ${font}`;
    ctx.fillStyle = P.TEXT;
    ctx.textAlign = "right";
    ctx.fillText(`${pctVal}%`, width - zoom, ctxBarH - 1);
    ctx.textAlign = "left";
  }

  // ── 1b. XP bar ───────────────────────────────────────────────────────────
  const prog    = world.getProgression();
  const xpBarH  = Math.max(2, Math.floor(zoom * 1.2));
  const xpBarY  = ctxBarH + brd;
  const xpLevel = prog.getLevel();

  ctx.fillStyle = P.BG_RAISED;
  ctx.fillRect(0, xpBarY, width, xpBarH);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, xpBarY, Math.floor(width * prog.getLevelProgress()), xpBarH);

  if (rc.layoutMode !== "compact") {
    ctx.font = `bold ${Math.max(7, zoom * 2)}px ${font}`;
    ctx.fillStyle = P.TEXT_MUTED;
    ctx.textAlign = "left";
    ctx.fillText(`Lv.${xpLevel}`, zoom * 2, xpBarY + xpBarH + Math.max(7, zoom * 2));
  }

  // Floating "+N XP" on gain.
  const xpGain = prog.getRecentXpGain();
  if (xpGain) {
    const fadeRatio = xpGain.timer / 800;
    ctx.save();
    ctx.globalAlpha = fadeRatio;
    ctx.fillStyle = theme.accent;
    ctx.font = `bold ${Math.max(8, zoom * 2.5)}px ${font}`;
    ctx.textAlign = "right";
    const floatY = xpBarY + xpBarH + zoom * 2 - (1 - fadeRatio) * zoom * 4;
    ctx.fillText(`+${xpGain.amount} XP`, width - zoom * 2, floatY);
    ctx.restore();
  }

  // ── 2. State chip — top-left ──────────────────────────────────────────────
  const state = world.getAlfredState();
  const STATE_COLORS: Record<string, string> = {
    idle:     P.TEXT_MUTED,
    thinking: P.ACCENT,
    writing:  P.SUCCESS,
  };
  const smallFont = Math.max(9, zoom * 3);
  const chipY     = xpBarY + xpBarH + brd + pad;
  const chipX     = pad;

  const stateLabel = state.toUpperCase();
  ctx.font = `bold ${smallFont}px ${font}`;
  const dotSize    = zoom * 3;
  const chipPillH  = dotSize + zoom * 2;
  const pace       = world.getPace();
  const paceStr    = pace.current > 0 ? `  ${pace.current}/m` : "";
  const chipPillW  = dotSize + zoom * 2 + ctx.measureText(stateLabel + paceStr).width + zoom * 2;

  // Chip bg — surface with accent-secondary border.
  ctx.fillStyle = P.SURFACE;
  ctx.fillRect(chipX - brd, chipY - brd, chipPillW + brd * 2, chipPillH + brd * 2);
  ctx.fillStyle = P.ACCENT_SEC;
  ctx.fillRect(chipX - brd, chipY - brd, chipPillW + brd * 2, brd); // top border

  // State dot.
  ctx.fillStyle = STATE_COLORS[state] || P.TEXT_MUTED;
  ctx.fillRect(chipX, chipY, dotSize, dotSize);

  // Pulse ring when active.
  if (state !== "idle") {
    const pulse = Math.sin(now / 300) * 0.5 + 0.5;
    const ringSize   = dotSize + Math.floor(pulse * zoom * 2);
    const ringOffset = Math.floor((ringSize - dotSize) / 2);
    ctx.fillStyle = state === "thinking" ? P.ACCENT_SEC : darken(P.SUCCESS, 0.5);
    ctx.fillRect(chipX - ringOffset, chipY - ringOffset, ringSize, ringSize);
    ctx.fillStyle = STATE_COLORS[state];
    ctx.fillRect(chipX, chipY, dotSize, dotSize);
  }

  // State label + pace.
  ctx.fillStyle = P.TEXT;
  ctx.font = `bold ${smallFont}px ${font}`;
  ctx.textAlign = "left";
  const labelX = chipX + dotSize + zoom * 2;
  ctx.fillText(stateLabel, labelX, chipY + dotSize - brd);

  if (pace.current > 0) {
    const labelW = ctx.measureText(stateLabel).width;
    const trendColor = pace.trend === "up" ? P.SUCCESS : pace.trend === "down" ? P.DANGER : P.TEXT_MUTED;
    ctx.fillStyle = trendColor;
    ctx.font = `${smallFont}px ${font}`;
    const trendArrow = pace.trend === "up" ? "\u25B2" : pace.trend === "down" ? "\u25BC" : "";
    ctx.fillText(`${pace.current}/m${trendArrow}`, labelX + labelW + zoom, chipY + dotSize - brd);
  }

  // ── 3. Info chip — top-right ──────────────────────────────────────────────
  const rightX     = width - pad;
  const modelText  = stats?.activeModel || "sonnet-4-6";
  const modelShort = modelText.replace("claude-", "");
  const sessionStart = stats?.sessionStartedAt ?? now;
  const elapsed    = now - sessionStart;
  const mins       = Math.floor(elapsed / 60_000);
  const secs       = Math.floor((elapsed % 60_000) / 1000);
  const durStr     = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const showModel    = rc.layoutMode !== "compact";
  const showRepoLabel = rc.layoutMode === "normal" || rc.layoutMode === "wide";

  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "right";

  const durW   = ctx.measureText(durStr).width;
  const modelW = showModel ? ctx.measureText(modelShort).width : 0;
  ctx.font = `bold ${smallFont}px ${font}`;
  const labelW2 = showRepoLabel && theme.label !== "---"
    ? ctx.measureText(theme.label).width + zoom * 3
    : 0;
  const rightTotalW = durW + (showModel ? zoom * 3 + modelW : 0) + labelW2 + zoom * 2;
  const rightY = chipY + dotSize - brd;

  // Right chip bg.
  ctx.fillStyle = P.SURFACE;
  ctx.fillRect(rightX - rightTotalW - brd, chipY - brd, rightTotalW + brd * 2, chipPillH + brd * 2);
  ctx.fillStyle = P.ACCENT_SEC;
  ctx.fillRect(rightX - rightTotalW - brd, chipY - brd, rightTotalW + brd * 2, brd);

  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "right";
  ctx.fillStyle = P.TEXT_MUTED;
  ctx.fillText(durStr, rightX, rightY);

  if (showModel) {
    ctx.fillStyle = P.TEXT_MUTED;
    ctx.fillText(modelShort, rightX - durW - zoom * 3, rightY);
  }

  if (showRepoLabel && theme.label !== "---") {
    ctx.fillStyle = theme.accent;
    ctx.font = `bold ${smallFont}px ${font}`;
    ctx.fillText(
      theme.label,
      rightX - durW - (showModel ? zoom * 3 + modelW + zoom * 3 : zoom * 2),
      rightY,
    );
  }

  // ── 4. Agent Roster — right panel ─────────────────────────────────────────
  // Only rendered in normal/wide modes where there's enough horizontal space.
  // Panel is on the right side and shows all 21 Scacchiera agents.
  if (rc.layoutMode === "normal" || rc.layoutMode === "wide") {
    drawAgentRoster(rc, font, smallFont, chipY + chipPillH + pad * 2);
  }

  // ── 5. Heatmap — below context bar ───────────────────────────────────────
  const heatSlots = world.getHeatmapSlots();
  const maxHeat   = Math.max(1, ...heatSlots);
  const slotW     = Math.max(1, Math.floor(width / heatSlots.length));
  const heatY     = ctxBarH + brd;
  const heatH     = Math.max(1, Math.floor(zoom * 0.8));
  for (let i = 0; i < heatSlots.length; i++) {
    if (heatSlots[i] === 0) continue;
    const intensity = heatSlots[i] / maxHeat;
    const r = Math.floor(15 + intensity * 10);
    const g = Math.floor(120 + intensity * 100);
    const b = Math.floor(200 + intensity * 55);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(i * slotW, heatY, slotW - (slotW > 2 ? 1 : 0), heatH);
  }

  // ── 6. Streak badge ───────────────────────────────────────────────────────
  const streak = prog.getStreak();
  if (streak.currentStreak >= 2) {
    const streakY = chipY + chipPillH + pad;
    ctx.fillStyle =
      streak.currentStreak >= 7 ? "#c8a820"
      : streak.currentStreak >= 3 ? P.WARN
      : P.TEXT_MUTED;
    ctx.font = `bold ${Math.max(8, zoom * 2.5)}px ${font}`;
    ctx.textAlign = "left";
    ctx.fillText(`${streak.currentStreak}d`, chipX, streakY + zoom * 2);
  }

  // ── 7. Smart alerts ────────────────────────────────────────────────────────
  const alerts = world.getSmartAlerts();
  if (alerts.length > 0) {
    const latestAlert = alerts[alerts.length - 1];
    const alertAge = now - latestAlert.timestamp;
    if (alertAge < 15000) {
      const alertAlpha = alertAge < 12000 ? 1 : 1 - (alertAge - 12000) / 3000;
      const sevColors: Record<string, string> = {
        info: P.ACCENT, warning: P.WARN, critical: P.DANGER,
      };
      ctx.save();
      ctx.globalAlpha = alertAlpha;
      ctx.font = `bold ${Math.max(8, zoom * 2.5)}px ${font}`;
      const alertFull = `${latestAlert.severity === "critical" ? "!" : "i"} ${latestAlert.title}: ${latestAlert.detail}`;
      const maxChars  = Math.floor(width / (zoom * 2.5));
      const alertText = alertFull.length > maxChars ? alertFull.slice(0, maxChars - 1) + "…" : alertFull;
      const alertTextW = ctx.measureText(alertText).width;
      const alertY = chipY + chipPillH + pad + (streak.currentStreak >= 2 ? zoom * 5 : 0);
      ctx.fillStyle = P.SURFACE;
      ctx.fillRect(chipX - brd, alertY - brd, alertTextW + zoom * 4 + brd * 2, zoom * 5);
      ctx.fillStyle = P.ACCENT_SEC;
      ctx.fillRect(chipX - brd, alertY - brd, alertTextW + zoom * 4 + brd * 2, brd);
      ctx.fillStyle = sevColors[latestAlert.severity] || P.TEXT_MUTED;
      ctx.textAlign = "left";
      ctx.fillText(alertText, chipX, alertY + zoom * 3);
      ctx.restore();
    }
  }

  ctx.textAlign = "left";
}

// ── Agent Roster panel — Signal Room protagonist ──────────────────────────
//
// Shows all 21 Scacchiera agents as a panel on the right edge.
// Active agents: highlighted in SUCCESS green with tool-call count.
// Idle: dimmed in TEXT_MUTED.
// Compact line: [dot] NAME  status  count

function drawAgentRoster(
  rc: RenderContext,
  font: string,
  fontSize: number,
  startY: number,
): void {
  const { ctx, world, width, now } = rc;
  const zoom = rc.zoom;
  const brd  = Math.max(1, Math.floor(zoom / 2));
  const pad  = zoom * 2;

  const rosterW  = Math.min(180, Math.floor(width * 0.28));
  const rosterX  = width - rosterW - zoom;
  const lineH    = Math.max(fontSize + zoom * 2, 14);

  // All 21 agents from AGENTS map.
  const agentEntries = Object.entries(AGENTS);
  const activeNames  = new Set(world.getActiveAgentNames().map((n) => n.toLowerCase()));

  // Compute how many fit in the remaining canvas height.
  const maxLines    = Math.floor((rc.height - startY - zoom * 8) / lineH);
  const visibleRows = Math.min(agentEntries.length, maxLines);
  if (visibleRows <= 0) return;

  const panelH = visibleRows * lineH + pad * 2 + fontSize + pad;

  // Panel background.
  ctx.fillStyle = P.SURFACE;
  ctx.fillRect(rosterX - brd, startY - brd, rosterW + brd * 2, panelH + brd * 2);
  // Accent-secondary top border.
  ctx.fillStyle = P.ACCENT_SEC;
  ctx.fillRect(rosterX - brd, startY - brd, rosterW + brd * 2, brd);

  // Header.
  ctx.fillStyle = P.TEXT_MUTED;
  ctx.font = `bold ${Math.max(7, fontSize - 1)}px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText("SCACCHIERA", rosterX + pad, startY + pad + fontSize);

  let ry = startY + pad + fontSize + pad;

  for (let i = 0; i < visibleRows; i++) {
    const [agentId, agentMeta] = agentEntries[i];
    const isActive = activeNames.has(agentId.toLowerCase())
      || activeNames.has(agentMeta.name.toLowerCase());

    // Dot color — active=SUCCESS, idle=MUTED.
    const dotColor = isActive ? P.SUCCESS : P.TEXT_MUTED;
    const dotSize  = Math.max(2, Math.floor(zoom * 0.8));

    // Active row highlight bg.
    if (isActive) {
      ctx.fillStyle = P.BG_RAISED;
      ctx.fillRect(rosterX, ry - 1, rosterW, lineH - 1);
      // Left accent bar.
      ctx.fillStyle = P.SUCCESS;
      ctx.fillRect(rosterX, ry - 1, brd, lineH - 1);
    }

    // Status dot.
    ctx.fillStyle = dotColor;
    ctx.fillRect(rosterX + pad, ry + Math.floor(lineH / 2) - Math.floor(dotSize / 2), dotSize, dotSize);

    // Agent name.
    ctx.fillStyle = isActive ? P.TEXT : P.TEXT_MUTED;
    ctx.font = `${Math.max(7, fontSize - 1)}px ${font}`;
    ctx.textAlign = "left";
    const name = agentMeta.name;
    ctx.fillText(name, rosterX + pad + dotSize + zoom, ry + Math.floor(lineH / 2) + Math.floor(fontSize / 3));

    // If active: show pulse + "active" label right-aligned.
    if (isActive) {
      const pulse = Math.sin(now / 400 + i) > 0 ? P.SUCCESS : darken(P.SUCCESS, 0.3);
      ctx.fillStyle = pulse;
      ctx.font = `${Math.max(6, fontSize - 2)}px ${font}`;
      ctx.textAlign = "right";
      ctx.fillText("ACT", rosterX + rosterW - pad, ry + Math.floor(lineH / 2) + Math.floor(fontSize / 3));
    }

    ry += lineH;
  }

  // Overflow badge if more agents than fit.
  if (agentEntries.length > visibleRows) {
    ctx.fillStyle = P.TEXT_MUTED;
    ctx.font = `${Math.max(7, fontSize - 1)}px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText(`+${agentEntries.length - visibleRows} more`, rosterX + rosterW / 2, ry + fontSize);
  }

  // ── Oracle stats — bottom of roster panel ─────────────────────────────
  const oracleStats = world.getOracleStats();
  if (oracleStats) {
    const oracleY = startY + panelH + brd + zoom * 2;
    const oraclePanelH = fontSize * 2 + pad * 3;
    ctx.fillStyle = P.SURFACE;
    ctx.fillRect(rosterX - brd, oracleY - brd, rosterW + brd * 2, oraclePanelH + brd * 2);
    ctx.fillStyle = P.ACCENT_SEC;
    ctx.fillRect(rosterX - brd, oracleY - brd, rosterW + brd * 2, brd);

    ctx.font = `${Math.max(7, fontSize - 1)}px ${font}`;
    ctx.fillStyle = P.TEXT_MUTED;
    ctx.textAlign = "left";
    ctx.fillText("ORACLE", rosterX + pad, oracleY + pad + fontSize - 2);
    ctx.fillStyle = P.TEXT;
    const nodeStr = `${oracleStats.totalNodes}n · ${oracleStats.communities}c`;
    ctx.fillText(nodeStr, rosterX + pad, oracleY + pad + fontSize * 2);
  }

  // ── Chain panel — above roster if chains exist ─────────────────────────
  const chains = world.getChainCards();
  if (chains.length > 0) {
    const chainPanelH = Math.min(chains.length, 4) * lineH + pad * 2 + fontSize + pad;
    const chainY = startY - chainPanelH - brd - zoom * 2;
    if (chainY > 0) {
      ctx.fillStyle = P.SURFACE;
      ctx.fillRect(rosterX - brd, chainY - brd, rosterW + brd * 2, chainPanelH + brd * 2);
      ctx.fillStyle = P.WARN;
      ctx.fillRect(rosterX - brd, chainY - brd, rosterW + brd * 2, brd);

      ctx.fillStyle = P.TEXT_MUTED;
      ctx.font = `bold ${Math.max(7, fontSize - 1)}px ${font}`;
      ctx.textAlign = "left";
      ctx.fillText("CHAINS", rosterX + pad, chainY + pad + fontSize);

      let cy2 = chainY + pad + fontSize + pad;
      const visibleChains = chains.slice(0, 4);
      for (const chain of visibleChains) {
        const flagColor = chain.flag === "clean" ? P.SUCCESS
          : chain.flag === "warn" ? P.WARN
          : P.DANGER;
        // Flag dot.
        ctx.fillStyle = flagColor;
        ctx.fillRect(rosterX + pad, cy2 + Math.floor(lineH / 2) - 2, 3, 3);
        // Chain ID truncated.
        ctx.fillStyle = P.TEXT;
        ctx.font = `${Math.max(6, fontSize - 2)}px ${font}`;
        ctx.textAlign = "left";
        const idShort = chain.chainId.length > 14 ? chain.chainId.slice(-14) : chain.chainId;
        ctx.fillText(idShort, rosterX + pad + 6, cy2 + Math.floor(lineH / 2) + Math.floor(fontSize / 3));
        // Progress right-aligned (current/total).
        const progressStr = `${chain.step.current}/${chain.step.total}`;
        ctx.fillStyle = P.TEXT_MUTED;
        ctx.textAlign = "right";
        ctx.fillText(progressStr, rosterX + rosterW - pad, cy2 + Math.floor(lineH / 2) + Math.floor(fontSize / 3));
        cy2 += lineH;
      }
      if (chains.length > 4) {
        ctx.fillStyle = P.TEXT_MUTED;
        ctx.font = `${Math.max(6, fontSize - 2)}px ${font}`;
        ctx.textAlign = "center";
        ctx.fillText(`+${chains.length - 4}`, rosterX + rosterW / 2, cy2 + fontSize);
      }
    }
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
    const ageStr =
      age < 60 ? `${Math.floor(age)}s` : `${Math.floor(age / 60)}m`;

    // Dot: green if current, dim if other.
    ctx.fillStyle = session.isCurrent ? "#2ECC71" : "#444458";
    ctx.fillRect(x, y, zoom, zoom);

    // Label.
    ctx.fillStyle = session.isCurrent ? "#888899" : "#444458";
    ctx.fillText(`${session.label} (${ageStr})`, x + zoom * 2, y + zoom);
    x += ctx.measureText(`${session.label} (${ageStr})`).width + zoom * 5;
  }
}

// ── Panel renderer registry ───────────────────────────
// Each panel key maps to its draw function. Adding a new panel = one line here.

type PanelRenderer = (pc: PanelCtx) => void;

const PANEL_RENDERERS: Record<string, PanelRenderer> = {
  files: drawFilesPanel,
  stats: drawStatsPanel,
  agents: drawAgentsPanel,
  "agent-detail": drawAgentDetailPanel,
  history: drawHistoryPanel,
  audit: drawAuditPanel,
  achievements: drawAchievementsPanel,
  "achievement-detail": drawAchievementDetailPanel,
};

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

  // Backdrop — Signal Room surface.
  ctx.save();
  ctx.fillStyle = P.BG;
  ctx.globalAlpha = 0.95;
  const panelW = Math.min(width * 0.7, 440);
  const panelH = Math.min(height * 0.7, 360);
  const px = Math.floor((width - panelW) / 2);
  const py = Math.floor((height - panelH) / 2);
  ctx.fillRect(px, py, panelW, panelH);
  ctx.restore();

  // Border — accent top, accent-secondary sides/bottom. radius 0px.
  const theme = world.getRepoTheme();
  const brdW = Math.max(1, zoom);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(px, py, panelW, brdW * 2); // thicker accent top
  ctx.fillStyle = P.ACCENT_SEC;
  ctx.fillRect(px, py + panelH - brdW, panelW, brdW);
  ctx.fillRect(px, py, brdW, panelH);
  ctx.fillRect(px + panelW - brdW, py, brdW, panelH);

  // Header.
  const titles: Record<string, string> = {
    files: "RECENT FILES",
    stats: "SESSION STATS",
    agents: "AGENTS",
    "agent-detail": "AGENT DETAIL",
    "achievement-detail": "ACHIEVEMENT",
    history: "SESSION HISTORY",
    audit: "AUDIT TRAIL",
    achievements: "ACHIEVEMENTS",
  };
  ctx.fillStyle = theme.accent;
  ctx.font = `bold ${fontSize}px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText(
    titles[panel] || panel.toUpperCase(),
    px + pad,
    py + pad + fontSize,
  );

  // Close hint.
  ctx.fillStyle = "#444458";
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "right";
  ctx.fillText("[click to close]", px + panelW - pad, py + pad + smallFont);

  // Header separator line.
  const sepY = py + pad + fontSize + Math.floor(pad * 0.6);
  ctx.fillStyle = P.ACCENT_SEC;
  ctx.fillRect(
    px + pad,
    sepY,
    panelW - pad * 2,
    Math.max(1, Math.floor(zoom / 2)),
  );

  // Content area geometry.
  const contentY = sepY + pad;
  const contentH = panelH - pad * 2 - fontSize - pad;
  const lineH = Math.max(fontSize + zoom * 2, 14);
  ctx.textAlign = "left";

  // Dispatch to the registered panel renderer.
  const renderer = PANEL_RENDERERS[panel];
  if (renderer) {
    renderer({
      ctx,
      world,
      px,
      py,
      panelW,
      panelH,
      pad,
      font,
      fontSize,
      smallFont,
      lineH,
      contentY,
      contentH,
      zoom,
      accent: theme.accent,
    });
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
  ctx.fillStyle = P.BG_RAISED;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, y - pad, width, barH + pad * 2);
  ctx.restore();

  // Progress bar track.
  const trackX = pad * 4 + zoom * 20;
  const trackW = width - trackX - pad * 4 - zoom * 25;
  const trackY = y + barH / 2 - zoom;
  const trackH = zoom * 2;

  ctx.fillStyle = P.SURFACE;
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
  ctx.fillStyle = snap.state === "playing" ? P.SUCCESS : P.WARN;
  ctx.font = `bold ${fontSize}px ${font}`;
  ctx.textAlign = "left";
  const stateIcon =
    snap.state === "playing" ? "▶" : snap.state === "paused" ? "⏸" : "⏹";
  ctx.fillText(stateIcon, pad, y + barH / 2 + fontSize * 0.35);

  // "REPLAY" label.
  ctx.fillStyle = P.DANGER;
  ctx.font = `bold ${smallFont}px ${font}`;
  const replayAlpha =
    snap.state === "playing" ? Math.sin(now / 400) * 0.4 + 0.6 : 1;
  ctx.save();
  ctx.globalAlpha = replayAlpha;
  ctx.fillText("REPLAY", pad + zoom * 6, y + barH / 2 + smallFont * 0.35);
  ctx.restore();

  // Time display (right of progress bar).
  const posSec = Math.floor(snap.positionMs / 1000);
  const durSec = Math.floor(snap.durationMs / 1000);
  const posStr = `${Math.floor(posSec / 60)}:${String(posSec % 60).padStart(2, "0")}`;
  const durStr = `${Math.floor(durSec / 60)}:${String(durSec % 60).padStart(2, "0")}`;
  ctx.fillStyle = P.TEXT_MUTED;
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "right";
  ctx.fillText(
    `${posStr} / ${durStr}`,
    width - pad * 2 - zoom * 12,
    y + barH / 2 + smallFont * 0.35,
  );

  // Speed badge.
  ctx.fillStyle = snap.speed !== 1 ? P.WARN : P.TEXT_MUTED;
  ctx.fillText(`${snap.speed}x`, width - pad, y + barH / 2 + smallFont * 0.35);

  // Current event detail (above the bar).
  if (snap.currentDetail) {
    const catColors: Record<string, string> = {
      tool: "#1E7FD8",
      agent: "#2ECC71",
      state: "#F39C12",
      git: "#9B59B6",
      system: "#555566",
    };
    ctx.fillStyle = catColors[snap.currentCategory || "system"] || "#555566";
    ctx.font = `${smallFont}px ${font}`;
    ctx.textAlign = "center";
    const detail =
      snap.currentDetail.length > 60
        ? snap.currentDetail.slice(0, 57) + "..."
        : snap.currentDetail;
    ctx.fillText(detail, width / 2, y - pad);
  }

  // Entry counter.
  ctx.fillStyle = P.TEXT_MUTED;
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText(`${snap.cursor}/${snap.totalEntries}`, trackX, y - pad);
}

// ── Public entry point ─────────────────────────────────

// ── Achievement unlock popup ─────────────────────────────

const TIER_POPUP_COLORS: Record<string, string> = {
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#FFD700",
  legendary: "#E74C3C",
};

function drawAchievementPopup(rc: RenderContext): void {
  const { ctx, width, height, now, world, zoom } = rc;
  const popup = world.getAchievementPopup();
  if (!popup) return;

  const font = `"DM Mono", monospace`;
  const tierColor = TIER_POPUP_COLORS[popup.tier] || "#888899";

  // Fade in/out.
  const fadeIn = Math.min(1, (4000 - popup.timer) / 400);
  const fadeOut = Math.min(1, popup.timer / 600);
  const alpha = Math.min(fadeIn, fadeOut);

  // Slide up from bottom.
  const slideOffset = Math.round((1 - fadeIn) * zoom * 10);

  const popupW = Math.min(width * 0.6, zoom * 60);
  const popupH = zoom * 14;
  const popupX = Math.round((width - popupW) / 2);
  const popupY = Math.round(height * 0.7 - popupH / 2) + slideOffset;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Background.
  ctx.fillStyle = P.BG;
  ctx.fillRect(popupX, popupY, popupW, popupH);

  // Tier-colored border.
  const brd = Math.max(1, Math.floor(zoom / 2));
  ctx.fillStyle = tierColor;
  ctx.fillRect(popupX, popupY, popupW, brd);
  ctx.fillRect(popupX, popupY + popupH - brd, popupW, brd);
  ctx.fillRect(popupX, popupY, brd, popupH);
  ctx.fillRect(popupX + popupW - brd, popupY, brd, popupH);

  // Pulsing glow.
  const pulse = Math.sin(now / 300) * 0.3 + 0.7;
  ctx.globalAlpha = alpha * pulse * 0.08;
  ctx.fillStyle = tierColor;
  ctx.fillRect(
    popupX - zoom * 2,
    popupY - zoom * 2,
    popupW + zoom * 4,
    popupH + zoom * 4,
  );
  ctx.globalAlpha = alpha;

  // "ACHIEVEMENT UNLOCKED" header.
  const headerFont = Math.max(8, zoom * 2.5);
  ctx.fillStyle = tierColor;
  ctx.font = `bold ${headerFont}px ${font}`;
  ctx.textAlign = "center";
  ctx.fillText(
    "ACHIEVEMENT UNLOCKED",
    popupX + popupW / 2,
    popupY + zoom * 3.5,
  );

  // Achievement name.
  const nameFont = Math.max(10, zoom * 3.5);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold ${nameFont}px ${font}`;
  ctx.fillText(popup.name, popupX + popupW / 2, popupY + zoom * 7.5);

  // Description.
  const descFont = Math.max(7, zoom * 2.2);
  ctx.fillStyle = "#888899";
  ctx.font = `${descFont}px ${font}`;
  ctx.fillText(popup.description, popupX + popupW / 2, popupY + zoom * 11);

  // Tier badge.
  ctx.fillStyle = tierColor;
  ctx.font = `bold ${headerFont}px ${font}`;
  ctx.textAlign = "right";
  ctx.fillText(
    popup.tier.toUpperCase(),
    popupX + popupW - zoom * 2,
    popupY + zoom * 3.5,
  );

  ctx.restore();
}

function drawLevelUpPopup(rc: RenderContext): void {
  const { ctx, width, height, zoom, world } = rc;
  const prog = world.getProgression();
  const popup = prog.getLevelUpPopup();
  if (!popup) return;

  const font = `"DM Mono", monospace`;
  const accent = "#FFD700"; // Gold for level-up

  const fadeIn = Math.min(1, (4000 - popup.timer) / 400);
  const fadeOut = Math.min(1, popup.timer / 600);
  const alpha = Math.min(fadeIn, fadeOut);
  const slideOffset = Math.round((1 - fadeIn) * zoom * 10);

  const popupW = Math.min(width * 0.5, zoom * 50);
  const popupH = zoom * 12;
  const popupX = Math.round((width - popupW) / 2);
  const popupY = Math.round(height * 0.65 - popupH / 2) + slideOffset;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Background.
  ctx.fillStyle = P.BG;
  ctx.fillRect(popupX, popupY, popupW, popupH);
  // Gold border.
  const brd = Math.max(1, Math.floor(zoom / 2));
  ctx.fillStyle = accent;
  ctx.fillRect(popupX, popupY, popupW, brd);
  ctx.fillRect(popupX, popupY + popupH - brd, popupW, brd);
  ctx.fillRect(popupX, popupY, brd, popupH);
  ctx.fillRect(popupX + popupW - brd, popupY, brd, popupH);

  // "LEVEL UP" header.
  ctx.fillStyle = accent;
  ctx.font = `bold ${Math.max(8, zoom * 2.5)}px ${font}`;
  ctx.textAlign = "center";
  ctx.fillText("LEVEL UP", popupX + popupW / 2, popupY + zoom * 3.5);

  // Level number.
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold ${Math.max(10, zoom * 3.5)}px ${font}`;
  ctx.fillText(
    `Level ${popup.level}`,
    popupX + popupW / 2,
    popupY + zoom * 7.5,
  );

  // Upgrade name.
  ctx.fillStyle = "#888899";
  ctx.font = `${Math.max(7, zoom * 2.2)}px ${font}`;
  ctx.fillText(popup.name, popupX + popupW / 2, popupY + zoom * 10);

  ctx.restore();
}

// ── Floor eye progress outline (P1 #6) ───────────────
// Draws an eye-shaped outline at the last floor click position.
// Size grows with click count (1→20%, 2→40%, 3→60%, 4→80%, 5→100%).
// Fades out 2s after the last click (driven by rapidClickTimer in KeyboardHandler).

function drawFloorEyeProgress(rc: RenderContext): void {
  const { ctx, world } = rc;
  const zoom = rc.zoom;
  const kb = world.getKeyboard();
  const progress = kb.getFloorClickProgress();
  if (progress <= 0) return;

  const pos = kb.getLastFloorClickPos();
  const ex = Math.floor(pos.x);
  const ey = Math.floor(pos.y);

  // Eye outline grows from 20% to 100% of max size as clicks accumulate.
  const maxR = zoom * 12;
  const r = Math.max(zoom, Math.floor(maxR * progress));
  const outlineW = Math.max(1, zoom);

  // Eye-shape: horizontal ellipse using top/bottom arcs drawn as pixel rects.
  // Approximate: wide outline of an almond shape using pixel-art horizontal stripes.
  const halfH = Math.max(1, Math.floor(r * 0.4));
  const color = "#1E7FD8"; // P.ACCENT — opaque

  ctx.fillStyle = color;
  for (let dy = -halfH; dy <= halfH; dy++) {
    // Width of eye shape at this row: ellipse formula.
    const ratio = 1 - (dy / (halfH + 1)) ** 2;
    const rowW = Math.floor(r * ratio * 2);
    if (rowW < 2) continue;
    const rowX = ex - Math.floor(rowW / 2);
    const rowY = ey + dy;
    // Only draw the outline (top/bottom row or left/right edges).
    if (Math.abs(dy) === halfH || Math.abs(dy) === halfH - 1) {
      ctx.fillRect(rowX, rowY, rowW, outlineW);
    } else {
      ctx.fillRect(rowX, rowY, outlineW, outlineW);
      ctx.fillRect(rowX + rowW - outlineW, rowY, outlineW, outlineW);
    }
  }
}

export function drawOverlay(rc: RenderContext): void {
  drawToolIcon(rc);
  drawFloorEyeProgress(rc);
  drawSpeechBubbles(rc);
  drawOverlayHud(rc);
  drawSessionIndicators(rc);
  drawExpandedPanel(rc);
  drawReplayTimeline(rc);
  drawAchievementPopup(rc);
  drawLevelUpPopup(rc);
}
