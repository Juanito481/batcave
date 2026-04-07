/**
 * AchievementDetailPanel — per-achievement detail with tier, progress, unlock date.
 */

import { PanelCtx } from "./FilesPanel";
import {
  ACHIEVEMENTS,
  TIER_COLORS,
  ICON_PIXELS,
} from "../../../data/gamification";

/**
 * Draw the "ACHIEVEMENT" detail panel content.
 *
 * @param pc - Shared panel geometry and rendering context.
 */
export function drawAchievementDetailPanel(pc: PanelCtx): void {
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
    contentY,
    contentH,
    zoom,
  } = pc;

  const achId = world.getSelectedAchievementId();
  const a = achId ? ACHIEVEMENTS.find((x) => x.id === achId) : null;

  if (!a) {
    ctx.fillStyle = "#444458";
    ctx.font = `${smallFont}px ${font}`;
    ctx.fillText(
      "No achievement selected",
      px + pad,
      contentY + fontSize * 0.7,
    );
    return;
  }

  const unlocked = world.getUnlockedAchievements();
  const isUnlocked = unlocked.some((u) => u.id === a.id);
  const unlockedEntry = unlocked.find((u) => u.id === a.id);
  const tierColor = TIER_COLORS[a.tier] || "#888899";

  // Tier glow background.
  ctx.save();
  ctx.fillStyle = tierColor;
  ctx.globalAlpha = 0.08;
  ctx.fillRect(px + pad, contentY, panelW - pad * 2, contentH - pad);
  ctx.restore();

  let curY = contentY;

  // Large icon.
  const iconPx = Math.max(2, zoom * 3);
  const pixels = ICON_PIXELS[a.icon] || ICON_PIXELS.crystal;
  const iconW = 4 * iconPx;
  const iconX = px + pad;
  ctx.fillStyle = isUnlocked ? tierColor : "#444458";
  for (const [dx, dy] of pixels) {
    ctx.fillRect(iconX + dx * iconPx, curY + dy * iconPx, iconPx, iconPx);
  }

  // Name + tier badge (to the right of icon).
  const textX = iconX + iconW + pad;
  ctx.font = `bold ${fontSize}px ${font}`;
  ctx.fillStyle = isUnlocked ? "#EEEEFF" : "#888899";
  ctx.fillText(a.name, textX, curY + fontSize);

  // Tier pill.
  const tierLabel = a.tier.toUpperCase();
  ctx.font = `bold ${fontSize}px ${font}`;
  const nameW = ctx.measureText(a.name).width;
  ctx.font = `${smallFont}px ${font}`;
  const tierLabelW = ctx.measureText(tierLabel).width;
  const pillXFinal = textX + nameW + zoom * 3;
  ctx.fillStyle = tierColor;
  ctx.fillRect(
    pillXFinal,
    curY + fontSize - smallFont,
    tierLabelW + zoom * 2,
    smallFont + zoom,
  );
  ctx.fillStyle = "#101820";
  ctx.fillText(tierLabel, pillXFinal + zoom, curY + fontSize);

  curY += iconPx * 4 + pad;

  // Description.
  ctx.font = `${smallFont}px ${font}`;
  ctx.fillStyle = "#888899";
  ctx.fillText(a.description, px + pad, curY + smallFont);
  curY += smallFont + pad;

  // Separator.
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(
    px + pad,
    curY,
    panelW - pad * 2,
    Math.max(1, Math.floor(zoom / 2)),
  );
  curY += pad;

  if (isUnlocked && unlockedEntry) {
    // Unlock date.
    const date = new Date(unlockedEntry.unlockedAt);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    ctx.fillStyle = tierColor;
    ctx.font = `bold ${smallFont}px ${font}`;
    ctx.fillText("UNLOCKED", px + pad, curY + smallFont);
    ctx.fillStyle = "#CCCCDD";
    ctx.font = `${smallFont}px ${font}`;
    ctx.fillText(dateStr, px + pad + zoom * 20, curY + smallFont);
  } else {
    // Progress bar.
    const progress = world.getAchievementProgress(a.id);
    const barX = px + pad;
    const barW = panelW - pad * 2;
    const barH = Math.max(zoom * 2, 6);

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(barX, curY, barW, barH);
    ctx.fillStyle = tierColor;
    ctx.fillRect(barX, curY, Math.floor(barW * progress), barH);
    ctx.fillStyle = "#CCCCDD";
    ctx.font = `${smallFont}px ${font}`;
    ctx.textAlign = "right";
    ctx.fillText(
      `${Math.floor(progress * 100)}%`,
      px + panelW - pad,
      curY + barH + smallFont + zoom,
    );
    ctx.textAlign = "left";

    curY += barH + smallFont + zoom * 2;

    // Hint.
    if (a.hint) {
      ctx.fillStyle = "#666677";
      ctx.font = `${smallFont}px ${font}`;
      ctx.fillText(a.hint, px + pad, curY + smallFont);
    }
  }

  // Suppress unused-variable warning.
  void py;
  void panelH;
}
