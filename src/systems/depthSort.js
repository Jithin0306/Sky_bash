// ============================================================================
// src/systems/depthSort.js
// ============================================================================
// Reusable 2.5D Depth-Sorting, Perspective Scaling & Ground Shadow System.
//
// HOW 2.5D DEPTH SORTING WORKS (Section 12):
// In a 2.5D angled view, the vertical screen axis (Y) represents depth:
// - Smaller Y (near top of screen) = Farther away from the camera (North)
// - Larger Y (near bottom of screen) = Closer to the camera (South)
//
// By setting every object's KAPLAY layer index (`entity.z`) equal to its
// ground footprint `pos.y` (`depth = y`), any character or object with a
// higher `pos.y` automatically draws IN FRONT OF objects with a lower `pos.y`!
// ============================================================================

import { ARENA_CONFIG, DEPTH_CONFIG, PLAYER_CONFIG } from "../config/gameConfig.js";

/**
 * Updates a game entity's KAPLAY `z` layer based on its ground `pos.y` footprint.
 * Also handles behind-the-island occlusion when falling off the North cliff edge!
 *
 * @param {Object} entity - Any KAPLAY object with `pos` and `z` components
 */
export function updateDepthSort(entity) {
  const zHeight = entity.zHeight || 0;
  const isFallingInVoid = Boolean(entity.isFallingInVoid);

  // Special Case: If the entity fell off the back (North) half of the circular
  // arena and has dropped below the golden rim (zHeight < -10), place it at
  // z = -60 so the floating island (at z = -50) hides it from view!
  if (
    isFallingInVoid &&
    entity.pos.y < ARENA_CONFIG.CENTER_Y &&
    zHeight < -10
  ) {
    entity.z = DEPTH_CONFIG.BEHIND_ARENA_Z;
    return;
  }

  // Standard 2.5D Rule: depth = ground Y coordinate!
  // Since the arena floor is at z = -50 and ground Y ranges from ~140 to ~610,
  // every entity on the surface has a positive z (140..610) and sorts accurately
  // against every other player, pillar, crate, and ball!
  // Adding a micro-offset for fighters ensures clean sorting without z-fighting flicker.
  const subLayer = entity.isPlayer || entity.objectType === "fighter" ? 0.2 : 0.0;
  entity.z = Math.round(entity.pos.y) + subLayer;
}

/**
 * Computes a subtle 2.5D perspective scale multiplier based on ground Y.
 * Objects closer to the bottom of the screen appear slightly larger (+8%),
 * while objects near the far top rim appear slightly smaller (-8%).
 *
 * @param {number} groundY - The entity's ground Y coordinate
 * @returns {number} Scale multiplier (e.g., 0.92 to 1.08)
 */
export function computeDepthScale(groundY) {
  const maxVerticalSpan = ARENA_CONFIG.RADIUS * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
  // Normalized depth from -1.0 (far North rim) to +1.0 (close South rim)
  const normalizedDepth = clamp(
    (groundY - ARENA_CONFIG.CENTER_Y) / maxVerticalSpan,
    -1.2,
    1.2
  );

  return 1.0 + normalizedDepth * DEPTH_CONFIG.PERSPECTIVE_SCALE_STRENGTH;
}

/**
 * Draws a soft, dual-layered 2.5D elliptical ground shadow at local (0, 0)
 * on the arena floor. Automatically shrinks and fades as `zHeight` increases!
 *
 * @param {Object} options
 * @param {number} options.radius - Base horizontal footprint radius of the shadow
 * @param {number} [options.zHeight=0] - Height of the object above the floor
 * @param {boolean} [options.overArena=true] - Whether the footprint is on the arena
 * @param {boolean} [options.isFallingInVoid=false] - Whether falling into the abyss
 * @param {Array<number>} [options.ringColor=null] - Optional RGB array for player indicator ring
 */
export function drawGroundShadow({
  radius = 18,
  zHeight = 0,
  overArena = true,
  isFallingInVoid = false,
  ringColor = null,
}) {
  // Do not draw a ground shadow if the entity has fallen off the arena into empty sky!
  if (!overArena || isFallingInVoid) {
    return;
  }

  // Shadow shrinks toward SHADOW_MIN_SCALE (0.32) as the object rises into the air
  const heightScale = clamp(
    1 - zHeight / DEPTH_CONFIG.SHADOW_MAX_HEIGHT,
    DEPTH_CONFIG.SHADOW_MIN_SCALE,
    1.0
  );

  const outerAlpha = clamp(0.32 * heightScale, 0.08, 0.32);
  const coreAlpha = clamp(0.54 * heightScale, 0.14, 0.54);

  pushTransform();
  // Compress vertically by 0.64 to match the 2.5D floor plane
  pushScale(1, ARENA_CONFIG.PERSPECTIVE_Y_SCALE);

  // 1. Soft outer penumbra shadow
  drawCircle({
    pos: vec2(0, 0),
    radius: (radius + 5) * heightScale,
    color: rgb(...PLAYER_CONFIG.COLORS.SHADOW),
    opacity: outerAlpha,
  });

  // 2. Darker inner contact shadow right under the feet/base
  drawCircle({
    pos: vec2(0, 0),
    radius: (radius + 1) * heightScale,
    color: rgb(...PLAYER_CONFIG.COLORS.SHADOW),
    opacity: coreAlpha,
  });

  // 3. Optional player/target ground indicator ring
  if (ringColor) {
    drawCircle({
      pos: vec2(0, 0),
      radius: (radius + 8) * heightScale,
      fill: false,
      outline: {
        width: 2.5,
        color: rgb(...ringColor),
        opacity: 0.72 * heightScale,
      },
    });
  }

  popTransform();
}
