/**
 * AuditPanel — immutable audit trail log for the expanded Batcomputer panel.
 */

import { PanelCtx } from "./FilesPanel";

/**
 * Draw the "AUDIT TRAIL" panel content.
 *
 * @param pc - Shared panel geometry and rendering context.
 */
export function drawAuditPanel(pc: PanelCtx): void {
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
  } = pc;

  const trail = world.getAuditTrail();
  ctx.font = `${smallFont}px ${font}`;

  if (trail.length > 0) {
    const maxRows = Math.floor(contentH / lineH) - 1;
    const start = Math.max(0, trail.length - maxRows);
    const catColors: Record<string, string> = {
      tool: "#1E7FD8",
      agent: "#2ECC71",
      state: "#F39C12",
      git: "#9B59B6",
      system: "#555566",
    };

    for (let i = trail.length - 1; i >= start; i--) {
      const rowIdx = trail.length - 1 - i;
      const ay = contentY + rowIdx * lineH;
      if (ay > py + panelH - pad) break;
      const e = trail[i];

      // Timestamp.
      const ago = Date.now() - e.timestamp;
      const agoStr =
        ago < 60000
          ? `${Math.floor(ago / 1000)}s`
          : `${Math.floor(ago / 60000)}m`;
      ctx.fillStyle = "#444458";
      ctx.fillText(agoStr, px + pad, ay + lineH * 0.7);

      // Category dot.
      ctx.fillStyle = catColors[e.category] || "#555566";
      const dotX = px + pad + zoom * 8;
      ctx.fillRect(dotX, ay + lineH * 0.3, zoom, zoom);

      // Detail text (truncated).
      ctx.fillStyle = "#888899";
      const txt =
        e.detail.length > 50 ? e.detail.slice(0, 47) + "..." : e.detail;
      ctx.fillText(txt, dotX + zoom * 2, ay + lineH * 0.7);
    }
  } else {
    ctx.fillStyle = "#444458";
    ctx.fillText("No events recorded yet", px + pad, contentY + lineH * 0.7);
  }

  // Suppress unused-variable warning — panelW available for future layout.
  void panelW;
}
