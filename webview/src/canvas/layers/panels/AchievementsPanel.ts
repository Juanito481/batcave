/**
 * AchievementsPanel — full achievements list for the expanded Batcomputer panel.
 */

import { PanelCtx } from "./FilesPanel";
import { ACHIEVEMENTS, TIER_COLORS } from "../../../data/gamification";

/**
 * Draw the "ACHIEVEMENTS" panel content.
 *
 * @param pc - Shared panel geometry and rendering context.
 */
export function drawAchievementsPanel(pc: PanelCtx): void {
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

  const unlocked = world.getUnlockedAchievements();
  ctx.font = `${smallFont}px ${font}`;

  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    const ay = contentY + i * lineH;
    if (ay > py + panelH - pad) break;
    const a = ACHIEVEMENTS[i];
    const isUnlocked = unlocked.some((u) => u.id === a.id);

    // Tier dot.
    ctx.fillStyle = isUnlocked ? TIER_COLORS[a.tier] || "#888899" : "#222233";
    ctx.fillRect(px + pad, ay + lineH * 0.3, zoom * 1.5, zoom * 1.5);

    // Name + description.
    ctx.fillStyle = isUnlocked ? "#CCCCDD" : "#444458";
    ctx.font = `bold ${smallFont}px ${font}`;
    ctx.fillText(a.name, px + pad + zoom * 4, ay + lineH * 0.5);
    ctx.font = `${smallFont}px ${font}`;
    ctx.fillStyle = isUnlocked ? "#888899" : "#333344";
    ctx.fillText(a.description, px + pad + zoom * 4, ay + lineH * 0.9);
  }

  // Summary at bottom.
  const summY =
    contentY +
    Math.min(ACHIEVEMENTS.length, Math.floor(contentH / lineH) - 1) * lineH +
    lineH;
  if (summY < py + panelH - pad) {
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(
      px + pad,
      summY - lineH * 0.3,
      panelW - pad * 2,
      Math.max(1, zoom),
    );
    ctx.fillStyle = "#FFD700";
    ctx.font = `bold ${smallFont}px ${font}`;
    ctx.fillText(
      `${unlocked.length} / ${ACHIEVEMENTS.length} unlocked`,
      px + pad,
      summY + lineH * 0.3,
    );
  }
}
