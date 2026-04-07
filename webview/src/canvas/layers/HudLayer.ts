import { darken } from "../../helpers/color";
import { RenderContext, outlineRect } from "./render-context";
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
    idle: "#778899",
    thinking: "#3399EE",
    writing: "#33DD88",
  };
  const smallFont = Math.max(9, zoom * 3);

  const chipY = ctxBarH + pad;
  const chipX = pad;

  // Chip background pill.
  const stateLabel = state.toUpperCase();
  ctx.font = `bold ${smallFont}px ${font}`;
  const pace = world.getPace();
  const paceText = pace.current > 0 ? `  ${pace.current}/min` : "";
  const chipTextW = ctx.measureText(stateLabel + paceText).width;
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
  ctx.fillText(
    state.toUpperCase(),
    chipX + dotSize + zoom * 2,
    chipY + dotSize - brd,
  );

  // Pace next to state (tools/min).
  if (pace.current > 0) {
    const stateTextW = ctx.measureText(state.toUpperCase()).width;
    const trendColor =
      pace.trend === "up"
        ? "#2ECC71"
        : pace.trend === "down"
          ? "#E74C3C"
          : "#888899";
    ctx.fillStyle = trendColor;
    ctx.font = `${smallFont}px ${font}`;
    const trendArrow =
      pace.trend === "up" ? "\u25B2" : pace.trend === "down" ? "\u25BC" : "";
    ctx.fillText(
      `${pace.current}/min ${trendArrow}`,
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
  const labelW =
    theme.label !== "---" ? ctx.measureText(theme.label).width + zoom * 3 : 0;
  const rightTotalW = durW + zoom * 3 + modelW + labelW + zoom * 2;

  // Right chip background pill.
  const rightY = chipY + dotSize - brd;
  ctx.save();
  ctx.fillStyle = "#06060c";
  ctx.globalAlpha = 0.75;
  ctx.fillRect(
    rightX - rightTotalW,
    chipY - zoom,
    rightTotalW + zoom,
    chipPillH,
  );
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
    ctx.fillText(
      theme.label,
      rightX - durW - zoom * 3 - modelW - zoom * 3,
      rightY,
    );
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

  // (Pace now shown in state chip — section 5 removed)

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
    if (alertAge < 15000) {
      // show for 15s
      const alertAlpha = alertAge < 12000 ? 1 : 1 - (alertAge - 12000) / 3000;
      const sevColors: Record<string, string> = {
        info: "#1E7FD8",
        warning: "#F39C12",
        critical: "#E74C3C",
      };
      ctx.save();
      ctx.globalAlpha = alertAlpha;
      // Alert pill background.
      ctx.font = `bold ${Math.max(8, zoom * 2.5)}px ${font}`;
      const alertText = `${latestAlert.severity === "critical" ? "!" : "i"} ${latestAlert.title}: ${latestAlert.detail}`;
      const alertTextW = ctx.measureText(alertText).width;
      ctx.fillStyle = "#06060c";
      ctx.fillRect(
        chipX - zoom,
        alertY - zoom,
        alertTextW + zoom * 4,
        zoom * 5,
      );
      // Alert text.
      ctx.fillStyle = sevColors[latestAlert.severity] || "#888899";
      ctx.textAlign = "left";
      ctx.fillText(alertText, chipX, alertY + zoom * 2.5);
      ctx.restore();
    }
  }

  // (Cave depth + achievements removed — decorative, low value)

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

  // Semi-transparent backdrop.
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
  ctx.fillStyle = "#1a1a2e";
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
  const stateIcon =
    snap.state === "playing" ? "▶" : snap.state === "paused" ? "⏸" : "⏹";
  ctx.fillText(stateIcon, pad, y + barH / 2 + fontSize * 0.35);

  // "REPLAY" label.
  ctx.fillStyle = "#E74C3C";
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
  ctx.fillStyle = "#888899";
  ctx.font = `${smallFont}px ${font}`;
  ctx.textAlign = "right";
  ctx.fillText(
    `${posStr} / ${durStr}`,
    width - pad * 2 - zoom * 12,
    y + barH / 2 + smallFont * 0.35,
  );

  // Speed badge.
  ctx.fillStyle = snap.speed !== 1 ? "#F39C12" : "#555566";
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
  ctx.fillStyle = "#444458";
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
  ctx.fillStyle = "#0a0c14";
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

export function drawOverlay(rc: RenderContext): void {
  drawToolIcon(rc);
  drawSpeechBubbles(rc);
  drawOverlayHud(rc);
  drawSessionIndicators(rc);
  drawExpandedPanel(rc);
  drawReplayTimeline(rc);
  drawAchievementPopup(rc);
}
