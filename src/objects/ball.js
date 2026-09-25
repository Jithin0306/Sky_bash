// ============================================================================
// src/objects/ball.js
// ============================================================================
// Lightweight Bouncing Brawler Sphere (Section 10):
// - Low mass (0.45), low rolling friction (220), and high bounce (0.78)!
// - Visually rotates/rolls (`rollAngle`) as it travels across the arena floor.
// ============================================================================

import { OBJECTS_CONFIG } from "../config/gameConfig.js";
import { createPhysicsObject } from "./GameObject.js";

/**
 * Spawns a 2.5D Bouncing Ball at (x, y).
 */
export function createBall(x, y, startZ = 240, initialDropDelay = 0) {
  const cfg = OBJECTS_CONFIG.BALL;

  return createPhysicsObject({
    ...cfg,
    x,
    y,
    startZ,
    initialDropDelay,
    renderVisuals(obj, isFlashing) {
      drawBallVisuals(obj.rollAngle, isFlashing);
    },
  });
}

/**
 * Draws the stylized rolling Brawler Sphere around its center at (0, -16).
 */
export function drawBallVisuals(rollAngle = 0, isFlashing = false) {
  const radius = 16;

  pushTransform();
  pushTranslate(0, -radius);
  pushRotate(rollAngle);

  // 1. Main vibrant magenta-coral sphere body
  drawCircle({
    pos: vec2(0, 0),
    radius,
    color: isFlashing ? rgb(255, 255, 255) : rgb(245, 72, 118),
    outline: { width: 2.5, color: rgb(42, 20, 48) },
  });

  // 2. Rotating equatorial stripe & cross panels (shows rolling spin clearly!)
  drawRect({
    pos: vec2(-radius + 2, -3.5),
    width: (radius - 2) * 2,
    height: 7,
    radius: 3,
    color: rgb(255, 215, 75),
  });

  drawCircle({
    pos: vec2(0, 0),
    radius: 6,
    color: rgb(42, 215, 235),
    outline: { width: 2, color: rgb(32, 24, 48) },
  });

  popTransform();

  // 3. Un-rotated specular light reflection on top-left of sphere
  drawCircle({
    pos: vec2(-5, -22),
    radius: 3.5,
    color: rgb(255, 255, 255),
    opacity: 0.85,
  });
}
