// ============================================================================
// src/systems/camera.js
// ============================================================================
// Manages the 2.5D Arena Camera:
// 1. Smoothly blends between the arena center and the active target (player/cursor)
//    so the player never loses sight of the arena edges.
// 2. Smoothly interpolates camera zoom (for dramatic moments or edge proximity).
// 3. Applies damped directional/random screen shake for punches, throws, & landings.
// ============================================================================

import { ARENA_CONFIG, CAMERA_CONFIG } from "../config/gameConfig.js";

/**
 * Creates and attaches the arena camera controller to the current KAPLAY scene.
 *
 * @returns {Object} Camera controller API with methods:
 *   - setTarget(posVec2): Updates the focus target (e.g., player position)
 *   - shake(amount): Adds screen shake intensity (e.g., 6 for light hit, 14 for heavy slam)
 *   - setZoom(scale): Smoothly zooms the camera to the given multiplier
 *   - getState(): Returns current camera state for debugging/UI
 */
export function createArenaCamera() {
  // The anchor point is the center of our floating arena
  const arenaCenter = vec2(ARENA_CONFIG.CENTER_X, ARENA_CONFIG.CENTER_Y);

  // Current smoothed camera position (starts centered on the arena)
  let currentPos = arenaCenter.clone();

  // The point of interest we are tracking (player position, or cursor in Milestone 1)
  let targetPos = arenaCenter.clone();

  // Zoom state
  let currentZoom = CAMERA_CONFIG.DEFAULT_ZOOM;
  let targetZoom = CAMERA_CONFIG.DEFAULT_ZOOM;

  // Screen shake intensity (0 = no shake)
  let shakeIntensity = 0;

  // Initialize KAPLAY's built-in camera position and scale
  camPos(currentPos);
  camScale(vec2(currentZoom));

  // onUpdate() runs once every frame in KAPLAY.
  // dt() returns the time in seconds since the last frame (e.g., ~0.016s at 60 FPS).
  onUpdate(() => {
    const delta = dt();

    // 1. Compute desired focus point:
    // Calculate how far the target is from the arena center, multiply by
    // PLAYER_WEIGHT, and strictly CLAMP the offset so the arena NEVER leaves
    // the center of the screen—even if the cursor or player goes far off-screen!
    const rawOffsetX = (targetPos.x - arenaCenter.x) * CAMERA_CONFIG.PLAYER_WEIGHT;
    const rawOffsetY = (targetPos.y - arenaCenter.y) * CAMERA_CONFIG.PLAYER_WEIGHT;

    const clampedOffsetX = clamp(
      rawOffsetX,
      -CAMERA_CONFIG.MAX_OFFSET_X,
      CAMERA_CONFIG.MAX_OFFSET_X
    );
    const clampedOffsetY = clamp(
      rawOffsetY,
      -CAMERA_CONFIG.MAX_OFFSET_Y,
      CAMERA_CONFIG.MAX_OFFSET_Y
    );

    const desiredX = arenaCenter.x + clampedOffsetX;
    const desiredY = arenaCenter.y + clampedOffsetY;

    // 2. Smoothly move currentPos toward desiredPos using frame-rate independent lerp
    const followFactor = Math.min(1, CAMERA_CONFIG.FOLLOW_SPEED * delta);
    currentPos.x = lerp(currentPos.x, desiredX, followFactor);
    currentPos.y = lerp(currentPos.y, desiredY, followFactor);

    // 3. Smoothly interpolate camera zoom
    const zoomFactor = Math.min(1, CAMERA_CONFIG.ZOOM_SPEED * delta);
    currentZoom = lerp(currentZoom, targetZoom, zoomFactor);

    // 4. Calculate screen shake offset if shakeIntensity > 0
    let shakeOffsetX = 0;
    let shakeOffsetY = 0;

    if (shakeIntensity > 0.05) {
      const clampedShake = Math.min(
        shakeIntensity,
        CAMERA_CONFIG.MAX_SHAKE_OFFSET
      );
      // Random offset in both X and Y proportional to current shake intensity
      shakeOffsetX = rand(-clampedShake, clampedShake);
      shakeOffsetY = rand(-clampedShake, clampedShake);

      // Decay shake smoothly toward zero over time
      shakeIntensity = Math.max(
        0,
        shakeIntensity - CAMERA_CONFIG.SHAKE_DECAY * delta
      );
    } else {
      shakeIntensity = 0;
    }

    // 5. Apply final position and zoom to KAPLAY's camera
    camPos(vec2(currentPos.x + shakeOffsetX, currentPos.y + shakeOffsetY));
    camScale(vec2(currentZoom));
  });

  // Public API returned to the scene and gameplay systems
  return {
    /**
     * Sets the target world position for the camera to follow.
     * @param {Vec2} newTarget - A KAPLAY vec2(x, y) position
     */
    setTarget(newTarget) {
      targetPos = vec2(newTarget.x, newTarget.y);
    },

    /**
     * Triggers a camera shake effect.
     * @param {number} intensity - Shake power in pixels (e.g. 5 = light, 14 = heavy)
     */
    shake(intensity = 8) {
      shakeIntensity = Math.min(
        CAMERA_CONFIG.MAX_SHAKE_OFFSET,
        shakeIntensity + intensity
      );
    },

    /**
     * Sets the desired camera zoom multiplier (1.0 = default, 1.12 = zoomed in).
     * @param {number} zoomLevel
     */
    setZoom(zoomLevel) {
      targetZoom = zoomLevel;
    },

    /**
     * Returns internal values for debug display or camera queries.
     */
    getState() {
      return {
        currentPos,
        currentZoom,
        shakeIntensity,
      };
    },
  };
}
