// ============================================================================
// src/systems/input.js
// ============================================================================
// Centralizes keyboard & mouse input handling.
//
// WHY THIS FILE EXISTS (Future Multiplayer Support - Section 27):
// Instead of hardcoding `isKeyDown("w")` directly inside Player.js, we read
// the local controls here and return a clean `inputState` object:
//   { moveX, moveY, jumpPressed, punchPressed, pickupPressed, throwPressed, dropPressed }
//
// Later, if you add a second local player (arrow keys / gamepad) or an AI bot,
// you can feed any `inputState` object into a Player without changing Player.js!
// ============================================================================

import { CONTROLS_CONFIG } from "../config/gameConfig.js";

/**
 * Helper that checks if ANY key in an array of key names is currently held down.
 * Uses KAPLAY's built-in `isKeyDown(keyName)` function.
 */
function isAnyKeyDown(keyList) {
  for (const key of keyList) {
    if (isKeyDown(key)) return true;
  }
  return false;
}

/**
 * Helper that checks if ANY key in an array was just pressed on this exact frame.
 * Uses KAPLAY's built-in `isKeyPressed(keyName)` function.
 */
function isAnyKeyPressed(keyList) {
  for (const key of keyList) {
    if (isKeyPressed(key)) return true;
  }
  return false;
}

/**
 * Reads the current frame's input state for the local desktop player.
 *
 * @returns {Object} Normalized movement vector and action trigger flags
 */
export function readLocalPlayerInput() {
  // 1. Read raw horizontal (-1 = Left, +1 = Right) and vertical (-1 = Up, +1 = Down) axes
  let rawX = 0;
  let rawY = 0;

  if (isAnyKeyDown(CONTROLS_CONFIG.MOVE_LEFT)) rawX -= 1;
  if (isAnyKeyDown(CONTROLS_CONFIG.MOVE_RIGHT)) rawX += 1;
  if (isAnyKeyDown(CONTROLS_CONFIG.MOVE_UP)) rawY -= 1;
  if (isAnyKeyDown(CONTROLS_CONFIG.MOVE_DOWN)) rawY += 1;

  // 2. Normalize diagonal movement:
  // Without normalization, holding W + D produces a vector of length sqrt(1^2 + 1^2) = 1.414,
  // making diagonal running 41% faster than running straight!
  let moveX = rawX;
  let moveY = rawY;
  const length = Math.hypot(rawX, rawY);

  if (length > 1) {
    moveX = rawX / length;
    moveY = rawY / length;
  }

  // 3. Read single-frame action triggers (for Jump, Punch, Pick Up, Throw, Drop)
  return {
    moveX,
    moveY,
    isMoving: length > 0,
    jumpPressed: isAnyKeyPressed(CONTROLS_CONFIG.JUMP),
    punchPressed:
      isAnyKeyPressed(CONTROLS_CONFIG.PUNCH) || isMousePressed("left"),
    pickupPressed: isAnyKeyPressed(CONTROLS_CONFIG.PICKUP),
    throwPressed:
      isAnyKeyPressed(CONTROLS_CONFIG.THROW) || isMousePressed("right"),
    dropPressed: isAnyKeyPressed(CONTROLS_CONFIG.DROP),
  };
}
