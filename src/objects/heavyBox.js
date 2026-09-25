// ============================================================================
// src/objects/heavyBox.js
// ============================================================================
// Heavy Iron-Core Box (Section 10):
// - High mass (2.6), strong ground friction (1450), and low bounce (0.08).
// - Resists casual pushing, lands with a camera-shaking thud, and bowls lighter
//   crates and balls out of its path when punched or thrown!
// ============================================================================

import { OBJECTS_CONFIG } from "../config/gameConfig.js";
import { createPhysicsObject } from "./GameObject.js";

/**
 * Spawns a 2.5D Iron Heavy Box at (x, y).
 */
export function createHeavyBox(x, y, startZ = 220, initialDropDelay = 0) {
  const cfg = OBJECTS_CONFIG.HEAVY_BOX;

  return createPhysicsObject({
    ...cfg,
    x,
    y,
    startZ,
    initialDropDelay,
    renderVisuals(obj, isFlashing) {
      drawHeavyBoxVisuals(isFlashing);
    },
  });
}

/**
 * Draws the industrial dark-steel & gold hazard Heavy Box.
 */
export function drawHeavyBoxVisuals(isFlashing = false) {
  // 1. 3D Heavy dark-steel lower hull
  drawRect({
    pos: vec2(-21, -34),
    width: 42,
    height: 34,
    radius: 5,
    color: isFlashing ? rgb(255, 255, 255) : rgb(62, 72, 92),
    outline: { width: 3, color: rgb(26, 30, 42) },
  });

  // 2. 2.5D Top beveled steel plate
  drawRect({
    pos: vec2(-21, -41),
    width: 42,
    height: 12,
    radius: 4,
    color: isFlashing ? rgb(255, 255, 255) : rgb(98, 112, 138),
    outline: { width: 2.5, color: rgb(26, 30, 42) },
  });

  // 3. Industrial gold/amber hazard band across the front
  drawRect({
    pos: vec2(-18, -22),
    width: 36,
    height: 8,
    radius: 2,
    color: rgb(245, 185, 45),
  });

  // Diagonal dark stripes on the hazard band
  drawLine({
    p1: vec2(-10, -22),
    p2: vec2(-4, -14),
    width: 3.5,
    color: rgb(35, 38, 48),
  });
  drawLine({
    p1: vec2(4, -22),
    p2: vec2(10, -14),
    width: 3.5,
    color: rgb(35, 38, 48),
  });

  // 4. Corner steel rivets
  const rivets = [
    vec2(-14, -29),
    vec2(14, -29),
    vec2(-14, -7),
    vec2(14, -7),
  ];
  for (const r of rivets) {
    drawCircle({
      pos: r,
      radius: 2.2,
      color: rgb(175, 190, 215),
    });
  }
}
