/**
 * AgentsPanel — agent observability table with efficiency ranking.
 */

import { PanelCtx } from "./FilesPanel";

/**
 * Draw the "AGENTS" panel content.
 *
 * @param pc - Shared panel geometry and rendering context.
 */
export function drawAgentsPanel(pc: PanelCtx): void {
  const {
    ctx,
    world,
    px,
    py,
    panelW,
    panelH,
    pad,
    font,
    smallFont,
    lineH,
    contentY,
    contentH,
    zoom,
    accent,
  } = pc;

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
      ctx.fillText(
        `${s.emoji} ${s.agentName}`,
        px + pad + zoom * 2,
        ay + lineH * 0.7,
      );

      // Stats columns.
      ctx.textAlign = "right";
      ctx.fillStyle = "#888899";
      ctx.fillText(`${s.toolCount}`, px + panelW * 0.55, ay + lineH * 0.7);
      ctx.fillText(
        `${s.filesTouched.length}`,
        px + panelW * 0.72,
        ay + lineH * 0.7,
      );
      const durSec = Math.floor(
        (s.exitTime !== null
          ? s.totalActiveMs
          : s.totalActiveMs + Date.now() - s.enterTime) / 1000,
      );
      const durStr =
        durSec >= 60
          ? `${Math.floor(durSec / 60)}m${durSec % 60}s`
          : `${durSec}s`;
      ctx.fillText(durStr, px + panelW - pad, ay + lineH * 0.7);
      ctx.textAlign = "left";
    }

    // Efficiency ranking below the agent table.
    const efficiency = world.getAgentEfficiency();
    if (efficiency.length > 0) {
      const effY = contentY + (allStats.length + 2) * lineH;
      if (effY < py + panelH - pad) {
        ctx.fillStyle = accent;
        ctx.fillRect(
          px + pad,
          effY - lineH * 0.5,
          panelW - pad * 2,
          Math.max(1, zoom),
        );
        ctx.font = `bold ${smallFont}px ${font}`;
        ctx.fillStyle = "#555566";
        ctx.fillText("EFFICIENCY RANKING", px + pad, effY + lineH * 0.3);
        ctx.font = `${smallFont}px ${font}`;
        for (let i = 0; i < Math.min(efficiency.length, 5); i++) {
          const ey = effY + (i + 1) * lineH;
          if (ey > py + panelH - pad) break;
          const e = efficiency[i];
          ctx.fillStyle =
            i === 0
              ? "#FFD700"
              : i === 1
                ? "#C0C0C0"
                : i === 2
                  ? "#CD7F32"
                  : "#777790";
          ctx.fillText(
            `#${e.rank} ${e.emoji} ${e.name}`,
            px + pad,
            ey + lineH * 0.7,
          );
          ctx.textAlign = "right";
          ctx.fillStyle = "#888899";
          ctx.fillText(
            `${e.toolsPerMin}/m  score:${e.score}`,
            px + panelW - pad,
            ey + lineH * 0.7,
          );
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
      ctx.fillText(
        `${arrow} ${entry.emoji} ${entry.name}`,
        px + pad,
        ay + lineH * 0.7,
      );
    }
    if (history.length === 0) {
      ctx.fillStyle = "#444458";
      ctx.fillText("No agents yet", px + pad, contentY + lineH * 0.7);
    }
  }

  // Suppress unused-variable warning — contentH available for future clipping.
  void contentH;
}
