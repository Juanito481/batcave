/**
 * FilesPanel — recent files list for the expanded Batcomputer panel.
 */

import { BatCaveWorld } from "../../../world/BatCave";

/** Shared geometry pre-computed by drawExpandedPanel. */
export interface PanelCtx {
  ctx: CanvasRenderingContext2D;
  world: BatCaveWorld;
  px: number;
  py: number;
  panelW: number;
  panelH: number;
  pad: number;
  font: string;
  fontSize: number;
  smallFont: number;
  lineH: number;
  contentY: number;
  contentH: number;
  zoom: number;
  accent: string;
}

/**
 * Draw the "RECENT FILES" panel content.
 *
 * @param pc - Shared panel geometry and rendering context.
 */
export function drawFilesPanel(pc: PanelCtx): void {
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
    zoom,
  } = pc;
  const files = world.getRecentFiles();
  ctx.font = `${smallFont}px ${font}`;
  const toolColors: Record<string, string> = {
    Read: "#1a3a5a",
    Edit: "#F39C12",
    Write: "#F39C12",
    Grep: "#1a3a5a",
    Glob: "#1a3a5a",
    Bash: "#2ECC71",
  };
  for (let i = 0; i < files.length; i++) {
    const fy = contentY + i * lineH;
    if (fy > py + panelH - pad) break;
    ctx.fillStyle = toolColors[files[i].tool] || "#555566";
    ctx.fillRect(px + pad, fy + zoom, zoom * 2, zoom * 2);
    ctx.fillStyle = "#888899";
    ctx.fillText(files[i].name, px + pad + zoom * 4, fy + lineH * 0.7);
    ctx.fillStyle = "#555566";
    ctx.fillText(files[i].tool, px + panelW / 2, fy + lineH * 0.7);
  }
  if (files.length === 0) {
    ctx.fillStyle = "#444458";
    ctx.fillText("No files touched yet", px + pad, contentY + lineH * 0.7);
  }
}
