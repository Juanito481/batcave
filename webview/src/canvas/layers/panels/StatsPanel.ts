/**
 * StatsPanel — session statistics for the expanded Batcomputer panel.
 */

import { PanelCtx } from "./FilesPanel";

/**
 * Draw the "SESSION STATS" panel content.
 *
 * @param pc - Shared panel geometry and rendering context.
 */
export function drawStatsPanel(pc: PanelCtx): void {
  const {
    ctx,
    world,
    px,
    py,
    panelW,
    panelH,
    pad,
    font,
    fontSize,
    lineH,
    contentY,
    accent,
  } = pc;
  const stats = world.getSessionStats();
  const pace = world.getPace();
  const breakdown = world.getToolBreakdown();
  ctx.font = `${fontSize}px ${font}`;

  const lines = [
    {
      label: "Context",
      value: `${stats.contextPct}%`,
      color:
        stats.contextPct < 50
          ? "#2ECC71"
          : stats.contextPct < 80
            ? "#F39C12"
            : "#E74C3C",
    },
    { label: "Tools", value: `${stats.toolCount}`, color: "#888899" },
    { label: "Duration", value: stats.duration, color: "#888899" },
    {
      label: "Pace",
      value: `${pace.current}/min`,
      color:
        pace.trend === "up"
          ? "#2ECC71"
          : pace.trend === "down"
            ? "#E74C3C"
            : "#888899",
    },
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

  // Suppress unused-variable warning — accent available for future use.
  void accent;
}
