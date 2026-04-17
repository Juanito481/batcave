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
    // Header row. v5.1: COST column replaced by FAIL% (No Cost Metrics, issue #12).
    ctx.fillStyle = "#555566";
    ctx.fillText("SESSION", px + pad, contentY + lineH * 0.5);
    ctx.textAlign = "right";
    ctx.fillText("TOOLS", px + panelW * 0.5, contentY + lineH * 0.5);
    ctx.fillText("FAIL%", px + panelW * 0.7, contentY + lineH * 0.5);
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
      // Failure rate: undefined when OTel wasn't active for that session.
      const failPct =
        s.toolFailureRate !== undefined
          ? Math.round(s.toolFailureRate * 100)
          : null;
      ctx.fillStyle =
        failPct === null
          ? "#555566"
          : failPct >= 40
            ? "#E74C3C"
            : failPct >= 20
              ? "#F39C12"
              : "#888899";
      ctx.fillText(
        failPct === null ? "—" : `${failPct}%`,
        px + panelW * 0.7,
        hy + lineH * 0.7,
      );
      ctx.fillStyle = "#555566";
      ctx.fillText(ageStr, px + panelW - pad, hy + lineH * 0.7);
      ctx.textAlign = "left";
    }

    // Totals row.
    const totalTools = history.reduce((sum, s) => sum + s.toolCalls, 0);
    // Weighted average failure rate across sessions with data.
    const sessionsWithSignal = history.filter(
      (s) => s.toolFailureRate !== undefined && (s.toolSampleSize ?? 0) > 0,
    );
    const weightedFail =
      sessionsWithSignal.length > 0
        ? sessionsWithSignal.reduce(
            (acc, s) =>
              acc + (s.toolFailureRate ?? 0) * (s.toolSampleSize ?? 0),
            0,
          ) /
          sessionsWithSignal.reduce(
            (acc, s) => acc + (s.toolSampleSize ?? 0),
            0,
          )
        : null;
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
      if (weightedFail === null) {
        ctx.fillStyle = "#555566";
        ctx.fillText("—", px + panelW * 0.7, totY + lineH * 0.3);
      } else {
        const pct = Math.round(weightedFail * 100);
        ctx.fillStyle =
          pct >= 40 ? "#E74C3C" : pct >= 20 ? "#F39C12" : "#888899";
        ctx.fillText(`${pct}%`, px + panelW * 0.7, totY + lineH * 0.3);
      }
      ctx.textAlign = "left";
    }
  } else {
    ctx.fillStyle = "#444458";
    ctx.fillText("No session history yet", px + pad, contentY + lineH * 0.7);
  }
}
