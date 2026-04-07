/**
 * Centralized cave layout — single source of truth for all furniture positions.
 *
 * Every module that needs to know where the Batcomputer, server rack, workbench,
 * display panel, chair, trophy case, or whiteboard lives calls getLayout() once
 * and reads the result. This eliminates the duplicated geometry that previously
 * caused click/render misalignment bugs.
 */

import { ACHIEVEMENTS } from "../data/gamification";

export interface CaveLayout {
  // Canvas dimensions.
  width: number;
  height: number;
  wallH: number;
  zoom: number;
  zt: number;

  // Batcomputer.
  bcTilesW: number;
  bcW: number;
  bcX: number;
  bcY: number;
  bcH: number;
  /** Width of each of the 3 Batcomputer screens. */
  screenW: number;

  // Floor reference.
  floorY: number;

  // Server rack (left of Batcomputer).
  serverX: number;
  serverY: number;
  serverW: number;
  serverH: number;

  // Workbench (far left).
  workbenchX: number;
  workbenchY: number;
  workbenchW: number;
  workbenchH: number;

  // Display panel (right of Batcomputer).
  displayX: number;
  displayY: number;
  displayW: number;
  displayH: number;

  // Chair (in front of Batcomputer).
  chairX: number;
  chairY: number;
  chairW: number;
  chairH: number;

  // Trophy case (left wall).
  trophyCase: {
    slotSize: number;
    cols: number;
    rows: number;
    pad: number;
    caseW: number;
    caseH: number;
    caseX: number;
    caseY: number;
  };

  // Whiteboard (wall-mounted).
  whiteboardX: number;
  whiteboardY: number;
  whiteboardW: number;
  whiteboardH: number;
}

/**
 * Compute the full cave layout from canvas dimensions.
 *
 * @param width - Canvas width in pixels.
 * @param height - Canvas height in pixels.
 * @param zoom - Integer zoom factor (min 2).
 * @param zt - Tile size in pixels (16 * zoom).
 * @param wallH - Wall height in pixels.
 * @returns All furniture positions and dimensions.
 *
 * @example
 * const layout = getLayout(800, 600, 3, 48, 96);
 * drawBatcomputer(ctx, layout.bcX, layout.bcY, ...);
 */
export function getLayout(
  width: number,
  height: number,
  zoom: number,
  zt: number,
  wallH: number,
): CaveLayout {
  const cols = Math.ceil(width / zt) + 1;

  // Batcomputer — centered, tile-aligned.
  const bcTilesW = Math.min(5, cols - 2);
  const bcW = zt * bcTilesW;
  const bcX = Math.floor((width - bcW) / 2);
  const bcY = wallH + zt;
  const bcH = Math.floor(zt * 1.5);
  const screenGap = Math.floor(zoom * 3);
  const screenAreaW = bcW - screenGap * 4;
  const screenW = Math.floor(screenAreaW / 3);

  // Floor reference (82% of floor area below wall).
  const floorY = wallH + Math.floor((height - wallH) * 0.82);

  // Server rack — left of Batcomputer.
  const serverX = bcX - zt * 3;
  const serverY = bcY - zt;
  const serverW = zt * 2;
  const serverH = zt * 3;

  // Workbench — far left.
  const workbenchX = bcX - zt * 6;
  const workbenchY = bcY;
  const workbenchW = zt * 3;
  const workbenchH = Math.floor(zt * 1.5) + zoom * 3;

  // Display panel — right of Batcomputer.
  const displayX = bcX + bcW + zt;
  const displayY = bcY - zt;
  const displayW = Math.floor(zt * 2.5);
  const displayH = Math.floor(zt * 1.8);

  // Chair — in front of Batcomputer.
  const chairW = zoom * 6;
  const chairH = zoom * 7;
  const chairX = Math.floor(bcX + bcW / 2 - zoom * 3);
  const chairY = bcH + bcY + zoom;

  // Trophy case — left wall.
  const tcSlotSize = zoom * 4;
  const tcCols = 3;
  const tcRows = Math.ceil(ACHIEVEMENTS.length / tcCols);
  const tcPad = zoom;
  const tcCaseW = tcCols * tcSlotSize + tcPad * 2;
  const tcCaseH = tcRows * tcSlotSize + zoom * 4;
  const tcCaseX = Math.floor(zt * 1.5);
  const tcCaseY = Math.floor(wallH * 0.18);

  // Whiteboard — wall-mounted.
  const whiteboardX = Math.floor(zt * 5.5);
  const whiteboardY = Math.floor(wallH * 0.2);
  const whiteboardW = Math.floor(zt * 2);
  const whiteboardH = Math.floor(zt * 1.2) + zoom * 2;

  return {
    width,
    height,
    wallH,
    zoom,
    zt,
    bcTilesW,
    bcW,
    bcX,
    bcY,
    bcH,
    screenW,
    floorY,
    serverX,
    serverY,
    serverW,
    serverH,
    workbenchX,
    workbenchY,
    workbenchW,
    workbenchH,
    displayX,
    displayY,
    displayW,
    displayH,
    chairX,
    chairY,
    chairW,
    chairH,
    trophyCase: {
      slotSize: tcSlotSize,
      cols: tcCols,
      rows: tcRows,
      pad: tcPad,
      caseW: tcCaseW,
      caseH: tcCaseH,
      caseX: tcCaseX,
      caseY: tcCaseY,
    },
    whiteboardX,
    whiteboardY,
    whiteboardW,
    whiteboardH,
  };
}
