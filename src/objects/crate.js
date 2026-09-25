// ============================================================================
// src/objects/crate.js
// ============================================================================
// Medium-weight Reinforced Supply Crate (Section 10):
// - Balanced mass (1.0), medium slide friction, and moderate bounce (0.25).
// - Can be pushed, punched across the court, picked up (Milestone 7), and thrown!
// ============================================================================

import { OBJECTS_CONFIG } from "../config/gameConfig.js";
import { createPhysicsObject } from "./GameObject.js";

/**
 * Spawns a 2.5D Supply Crate at (x, y).
 */
export function createCrate(x, y, startZ = 200, initialDropDelay = 0) {
  const cfg = OBJECTS_CONFIG.CRATE;

  return createPhysicsObject({
    ...cfg,
    x,
    y,
    startZ,
    initialDropDelay,
    renderVisuals(obj, isFlashing) {
      drawCrateVisuals(isFlashing);
    },
  });
}

/**
 * Draws the 2.5D stylized wooden & iron-braced crate.
 * Exported so Milestone 7 can also draw the crate when held in the player's hands!
 */
export function drawCrateVisuals(isFlashing = false) {
  // 1. 3D Lower dark wood front face
  drawRect({
    pos: vec2(-17, -28),
    width: 34,
    height: 28,
    radius: 4,
    color: isFlashing ? rgb(255, 255, 255) : rgb(158, 104, 52),
    outline: { width: 2.5, color: rgb(62, 38, 18) },
  });

  // 2. 2.5D Top lit lid surface (lighter warm timber)
  drawRect({
    pos: vec2(-17, -34),
    width: 34,
    height: 11,
    radius: 3,
    color: isFlashing ? rgb(255, 255, 255) : rgb(212, 152, 86),
    outline: { width: 2, color: rgb(62, 38, 18) },
  });

  // 3. Diagonal wooden brace plank across front face
  drawLine({
    p1: vec2(-13, -22),
    p2: vec2(13, -4),
    width: 4,
    color: rgb(192, 132, 72),
  });

  // 4. Iron corner brackets & golden center emblem
  drawRect({
    pos: vec2(-17, -25),
    width: 34,
    height: 4,
    color: rgb(72, 82, 102),
  });
  drawCircle({
    pos: vec2(0, -13),
    radius: 4,
    color: rgb(255, 215, 75),
    outline: { width: 1.5, color: rgb(62, 38, 18) },
  });
}
