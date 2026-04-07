/**
 * AgentDetailPanel — per-agent enterprise observability detail view.
 */

import { PanelCtx } from "./FilesPanel";

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}

/**
 * Draw the "AGENT DETAIL" panel content.
 *
 * @param pc - Shared panel geometry and rendering context.
 */
export function drawAgentDetailPanel(pc: PanelCtx): void {
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
    smallFont,
    lineH,
    contentY,
    zoom,
    accent,
  } = pc;

  const selectedId = world.getSelectedAgentId();
  const agentStat = selectedId ? world.getAgentStats(selectedId) : null;

  if (!agentStat) {
    ctx.fillStyle = "#444458";
    ctx.font = `${smallFont}px ${font}`;
    ctx.fillText("No data for this agent", px + pad, contentY + lineH * 0.7);
    return;
  }

  const isActive = agentStat.exitTime === null;

  // Agent header.
  ctx.font = `bold ${fontSize}px ${font}`;
  ctx.fillStyle = accent;
  ctx.fillText(
    `${agentStat.emoji} ${agentStat.agentName}`,
    px + pad,
    contentY + lineH * 0.7,
  );

  ctx.font = `${smallFont}px ${font}`;
  ctx.fillStyle = isActive ? "#2ECC71" : "#E74C3C";
  ctx.fillText(
    isActive ? "ACTIVE" : "EXITED",
    px + panelW / 2,
    contentY + lineH * 0.7,
  );

  // Action buttons (top-right of panel).
  const btnH = lineH * 0.9;
  const btnW = zoom * 14;
  const btnY = contentY - lineH * 0.2;

  // LAUNCH button.
  const launchBtnX = px + panelW - pad - btnW;
  ctx.fillStyle = "#1E7FD8";
  ctx.fillRect(launchBtnX, btnY, btnW, btnH);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold ${smallFont}px ${font}`;
  ctx.textAlign = "center";
  ctx.fillText("LAUNCH", launchBtnX + btnW / 2, btnY + btnH * 0.7);
  ctx.textAlign = "left";

  // Stats grid.
  ctx.font = `${fontSize}px ${font}`;
  const grid = [
    {
      label: "Invocations",
      value: `${agentStat.invocations}`,
      color: "#888899",
    },
    {
      label: "Tools used",
      value: `${agentStat.toolCount}`,
      color: "#888899",
    },
    {
      label: "Files touched",
      value: `${agentStat.filesTouched.length}`,
      color: "#888899",
    },
    {
      label: "Active time",
      value: formatDuration(
        isActive
          ? agentStat.totalActiveMs + Date.now() - agentStat.enterTime
          : agentStat.totalActiveMs,
      ),
      color: "#888899",
    },
    {
      label: "  Read",
      value: `${agentStat.toolBreakdown.read}`,
      color: "#1a5a8a",
    },
    {
      label: "  Write",
      value: `${agentStat.toolBreakdown.write}`,
      color: "#F39C12",
    },
    {
      label: "  Bash",
      value: `${agentStat.toolBreakdown.bash}`,
      color: "#2ECC71",
    },
    {
      label: "  Web",
      value: `${agentStat.toolBreakdown.web}`,
      color: accent,
    },
  ];

  for (let i = 0; i < grid.length; i++) {
    const ly = contentY + (i + 1.5) * lineH;
    if (ly > py + panelH - pad * 2) break;
    ctx.fillStyle = "#555566";
    ctx.fillText(grid[i].label, px + pad, ly + lineH * 0.7);
    ctx.fillStyle = grid[i].color;
    ctx.textAlign = "right";
    ctx.fillText(grid[i].value, px + panelW - pad, ly + lineH * 0.7);
    ctx.textAlign = "left";
  }

  // Recent files.
  const filesStart = contentY + 10 * lineH;
  if (agentStat.filesTouched.length > 0 && filesStart < py + panelH - pad) {
    ctx.font = `bold ${smallFont}px ${font}`;
    ctx.fillStyle = "#555566";
    ctx.fillText("RECENT FILES", px + pad, filesStart);
    ctx.font = `${smallFont}px ${font}`;
    for (let i = 0; i < Math.min(agentStat.filesTouched.length, 4); i++) {
      const fy = filesStart + (i + 1) * lineH * 0.8;
      if (fy > py + panelH - pad) break;
      const parts =
        agentStat.filesTouched[agentStat.filesTouched.length - 1 - i].split(
          "/",
        );
      ctx.fillStyle = "#777790";
      ctx.fillText(parts[parts.length - 1] || "?", px + pad + zoom * 2, fy);
    }
  }
}
