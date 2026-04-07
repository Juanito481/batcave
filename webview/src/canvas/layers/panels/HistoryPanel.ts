/**
 * HistoryPanel — session history list for the expanded Batcomputer panel.
 */

import { PanelCtx } from "./FilesPanel";

/**
 * Draw the "SESSION HISTORY" panel content.
 *
 * @param pc - Shared panel geometry and rendering context.
 */
export function drawHistoryPanel(pc: PanelCtx): void {
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
      const ageStr =
        age < 3600000
          ? `${Math.floor(age / 60000)}m ago`
          : age < 86400000
            ? `${Math.floor(age / 3600000)}h ago`
            : `${Math.floor(age / 86400000)}d ago`;

      ctx.fillStyle = "#777790";
      ctx.fillText(`${s.repo}`, px + pad, hy + lineH * 0.7);
      ctx.textAlign = "right";
      ctx.fillStyle = "#888899";
      ctx.fillText(`${s.toolCalls}`, px + panelW * 0.5, hy + lineH * 0.7);
      ctx.fillStyle = s.estimatedCostUsd > 1 ? "#F39C12" : "#888899";
      ctx.fillText(
        `$${s.estimatedCostUsd.toFixed(2)}`,
        px + panelW * 0.7,
        hy + lineH * 0.7,
      );
      ctx.fillStyle = "#555566";
      ctx.fillText(ageStr, px + panelW - pad, hy + lineH * 0.7);
      ctx.textAlign = "left";
    }

    // Totals.
    const totalCost = history.reduce((sum, s) => sum + s.estimatedCostUsd, 0);
    const totalTools = history.reduce((sum, s) => sum + s.toolCalls, 0);
    const totY =
      contentY +
      (Math.min(history.length, Math.floor(contentH / lineH) - 2) + 2) * lineH;
    if (totY < py + panelH - pad) {
      ctx.fillStyle = accent;
      ctx.fillRect(
        px + pad,
        totY - lineH * 0.5,
        panelW - pad * 2,
        Math.max(1, zoom),
      );
      ctx.font = `bold ${smallFont}px ${font}`;
      ctx.fillText(
        `TOTAL (${history.length} sessions)`,
        px + pad,
        totY + lineH * 0.3,
      );
      ctx.textAlign = "right";
      ctx.fillText(`${totalTools}`, px + panelW * 0.5, totY + lineH * 0.3);
      ctx.fillStyle = totalCost > 10 ? "#E74C3C" : "#F39C12";
      ctx.fillText(
        `$${totalCost.toFixed(2)}`,
        px + panelW * 0.7,
        totY + lineH * 0.3,
      );
      ctx.textAlign = "left";
    }
  } else {
    ctx.fillStyle = "#444458";
    ctx.fillText("No session history yet", px + pad, contentY + lineH * 0.7);
  }
}
