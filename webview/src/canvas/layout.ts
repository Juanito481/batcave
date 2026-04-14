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

  // Workbench (far left, clamped to stay on-screen).
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

  // Trophy case (left wall, 5 columns).
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

  // Whiteboard (wall-mounted, center-left).
  whiteboardX: number;
  whiteboardY: number;
  whiteboardW: number;
  whiteboardH: number;

  // Arsenal/weapon rack (right wall).
  arsenalRack: { x: number; y: number; w: number; h: number };

  // Evolution decoration anchors (wall-mounted).
  trophyShelf: { x: number; y: number };
  levelPlaques: { x: number; y: number };
  levelFlag: { x: number; y: number };
  repoBanner: { x: number; y: number; w: number; h: number };

  /** Responsive layout mode derived from canvas width. */
  layoutMode: "placeholder" | "compact" | "narrow" | "normal" | "wide";
  /** True when canvas is significantly taller than wide (portrait panel). */
  verticalMode: boolean;
}

/**
 * Compute the full cave layout from canvas dimensions.
 *
 * @param width - Canvas width in pixels.
 * @param height - Canvas height in pixels.
 * @param zoom - Integer zoom factor (min 2).
 * @param zt - Tile size in pixels (16 * zoom).
 * @param wallH - Wall height in pixels.
 * @param upgrades - Set of unlocked upgrade IDs.
 * @param layoutMode - Responsive breakpoint derived from width.
 * @param verticalMode - True when height > width * 1.5 (portrait panel).
 * @returns All furniture positions and dimensions.
 *
 * @example
 * const layout = getLayout(800, 600, 3, 48, 96, new Set(), "normal", false);
 * drawBatcomputer(ctx, layout.bcX, layout.bcY, ...);
 */
export function getLayout(
  width: number,
  height: number,
  zoom: number,
  zt: number,
  wallH: number,
  upgrades: ReadonlySet<string> = new Set(),
  layoutMode: "placeholder" | "compact" | "narrow" | "normal" | "wide" = "normal",
  verticalMode: boolean = false,
): CaveLayout {
  const cols = Math.ceil(width / zt) + 1;

  // Batcomputer — centered, tile-aligned. Cap depends on layout mode.
  const bcTilesWMax =
    layoutMode === "compact"
      ? Math.min(3, cols - 2)
      : layoutMode === "narrow"
        ? Math.min(4, cols - 2)
        : layoutMode === "wide"
          ? Math.min(8, cols - 2)
          : Math.min(5, cols - 2); // normal (default)
  const bcTilesW = Math.max(1, bcTilesWMax);
  const bcW = zt * bcTilesW;
  const bcX = Math.floor((width - bcW) / 2);
  const bcY = wallH + zt;
  const bcH = Math.floor(zt * 1.5);
  const screenGap = Math.floor(zoom * 3);
  const screenAreaW = bcW - screenGap * 4;
  const screenW = Math.floor(screenAreaW / 3);

  // Floor reference — 75% down in portrait panels (was 65% — workbench was off-screen
  // below fold at 380×900), 82% in landscape.
  const floorY = verticalMode
    ? wallH + Math.floor((height - wallH) * 0.75)
    : wallH + Math.floor((height - wallH) * 0.82);

  // Server rack — left of Batcomputer.
  const serverX = bcX - zt * 3;
  const serverY = bcY - zt;
  const serverW = zt * 2;
  const serverH = zt * 3;

  // Workbench — far left, clamped to stay on-screen.
  const workbenchW = zt * 3;
  const workbenchH = Math.floor(zt * 1.5) + zoom * 3;
  // Clamp so workbench right edge doesn't overlap server rack.
  const workbenchXRaw = Math.max(Math.floor(zt * 0.5), bcX - zt * 6);
  const workbenchX = Math.min(workbenchXRaw, serverX - workbenchW - zoom);
  const workbenchY = bcY;

  // Display panel — right of Batcomputer; clamped to not overflow canvas.
  const displayW = Math.floor(zt * 2.5);
  const displayH = Math.floor(zt * 1.8);
  const displayXRaw = bcX + bcW + zt;
  const displayX = Math.min(displayXRaw, width - displayW - zoom);
  const displayY = bcY - zt;

  // Chair — in front of Batcomputer.
  const chairW = zoom * 6;
  const chairH = zoom * 7;
  const chairX = Math.floor(bcX + bcW / 2 - zoom * 3);
  const chairY = bcH + bcY + zoom;

  // Trophy case — left wall, 5 columns. Slot size adapts to wallH and XL upgrade.
  const tcCols = 5;
  const tcRows = Math.ceil(ACHIEVEMENTS.length / tcCols);
  const tcSlotSize = upgrades.has("trophy-case-xl")
    ? zoom * 8
    : Math.max(zoom * 4, Math.min(zoom * 6, Math.floor((wallH * 0.8) / tcRows)));
  const tcPad = zoom * 2;
  const tcCaseW = tcCols * tcSlotSize + tcPad * 2;
  const tcCaseH = tcRows * tcSlotSize + zoom * 5;
  const tcCaseX = Math.floor(zt * 1);
  const tcCaseY = Math.max(zoom * 2, Math.floor((wallH - tcCaseH) * 0.3));

  // Whiteboard — wall-mounted, center-left, 50% larger than v3.
  // Clamped so its right edge never reaches bcX (would overlap Batcomputer at
  // compact/narrow widths where bcX is close to the horizontal midpoint).
  const whiteboardW = Math.floor(zt * 3);
  const whiteboardH = Math.floor(zt * 1.8);
  const whiteboardXRaw = Math.floor(width * 0.28);
  const whiteboardX = Math.min(whiteboardXRaw, bcX - whiteboardW - zoom * 2);
  const whiteboardY = Math.floor(wallH * 0.1);

  // Arsenal/weapon rack — right wall; guard against overlap with display panel.
  const arsenalRackW = Math.floor(zt * 2.2);
  const arsenalRackX = Math.min(
    width - Math.floor(zt * 4.5),
    // Must not overlap display panel (display is to the right of Batcomputer).
    displayX - arsenalRackW - zoom,
  );
  const arsenalRack = {
    x: arsenalRackX,
    y: Math.floor(wallH * 0.3),
    w: arsenalRackW,
    h: Math.floor(zt * 1.5),
  };

  // Evolution decoration anchors.
  const trophyShelf = {
    x: Math.floor(zt * 2),
    y: wallH - zoom * 2,
  };
  const levelPlaques = {
    x: tcCaseX + tcCaseW + Math.floor(zt * 0.5),
    y: Math.floor(wallH * 0.6),
  };
  const levelFlag = {
    x: Math.floor(width * 0.38),
    y: Math.floor(wallH * 0.15),
  };
  const repoBanner = {
    x: tcCaseX,
    y: tcCaseY + tcCaseH + zoom * 2,
    w: Math.floor(zt * 1.8),
    h: Math.floor(zt * 0.6),
  };

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
    arsenalRack,
    trophyShelf,
    levelPlaques,
    levelFlag,
    repoBanner,
    layoutMode,
    verticalMode,
  };
}
