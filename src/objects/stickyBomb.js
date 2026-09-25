// ============================================================================
// src/objects/stickyBomb.js
// ============================================================================
// Slime Sticky Bomb Explosive:
// - Ignites when picked up (E), punched (J/Click), thrown (K/Click), or caught
//   in another explosion.
// - Glues itself directly onto any Fighter (Volt or Pyro!) or Arena Floor on
//   impact! When stuck to a fighter, it rides along on their chest with a
//   "STUCK!!" callout until the fuse hits 0 and detonates in a Neon Slime blast!
// ============================================================================

import { OBJECTS_CONFIG, ARENA_CONFIG } from "../config/gameConfig.js";
import { createPhysicsObject } from "./GameObject.js";
import { detonateBomb } from "./bomb.js";

/**
 * Spawns a 2.5D Slime Sticky Bomb at (x, y).
 */
export function createStickyBomb(x, y, startZ = 240, initialDropDelay = 0) {
  const cfg = OBJECTS_CONFIG.STICKY_BOMB;

  const sticky = createPhysicsObject({
    ...cfg,
    x,
    y,
    startZ,
    initialDropDelay,
    renderVisuals(obj, isFlashing) {
      drawStickyBombVisuals(
        isFlashing,
        obj.isLit,
        obj.fuseTimer,
        obj.fuseDuration,
        Boolean(obj.stuckToTarget || obj.isStuckToFloor)
      );
    },
  });

  // --- Sticky Bomb State ---
  sticky.fuseDuration = cfg.fuseDuration || 3.4;
  sticky.fuseTimer = sticky.fuseDuration;
  sticky.blastRadius = cfg.blastRadius || 140;
  sticky.blastForce = cfg.blastForce || 665;
  sticky.isLit = false;
  sticky.isExplodedCooldown = false;
  sticky.respawnTimer = 0;
  sticky.stuckToTarget = null;
  sticky.isStuckToFloor = false;
  sticky.throwAirTimer = 0;

  // Wrap base onPunchHit so punching a Sticky Bomb ignites it and unsticks it briefly
  const baseOnPunchHit = sticky.onPunchHit.bind(sticky);
  sticky.onPunchHit = function (dir, force) {
    if (this.isExplodedCooldown) return;
    this.stuckToTarget = null;
    this.isStuckToFloor = false;
    baseOnPunchHit(dir, force);
    this.ignite();
  };

  // Wrap base respawnFromSky so sticky state resets cleanly
  const baseRespawn = sticky.respawnFromSky.bind(sticky);
  sticky.respawnFromSky = function () {
    baseRespawn();
    this.isLit = false;
    this.fuseTimer = this.fuseDuration;
    this.isExplodedCooldown = false;
    this.respawnTimer = 0;
    this.stuckToTarget = null;
    this.isStuckToFloor = false;
    this.throwAirTimer = 0;
  };

  /**
   * Lights the Sticky Bomb's fuse!
   */
  sticky.ignite = function (maxRemainingSeconds = null) {
    if (this.isExplodedCooldown) return;
    if (!this.isLit) {
      this.isLit = true;
      this.fuseTimer = this.fuseDuration;
    }
    if (maxRemainingSeconds !== null && this.fuseTimer > maxRemainingSeconds) {
      this.fuseTimer = maxRemainingSeconds;
    }
  };

  return sticky;
}

/**
 * Updates all Slime Sticky Bombs every frame:
 * - Checks for mid-air or ground impact against Fighters (sticks to their body!)
 * - Glues to the sandstone floor upon landing when lit/thrown
 * - Counts down fuse and triggers a Neon Slime radial blast!
 */
export function updateStickyBombSystem(fighters, objects, props, camera) {
  const delta = dt();
  const fighterList = Array.isArray(fighters)
    ? fighters
    : fighters
    ? [fighters]
    : [];

  for (const obj of objects) {
    if (obj.objectType !== "stickyBomb") continue;
    if (obj.isWaitingToDrop) continue;

    // 1. Post-explosion respawn cooldown
    if (obj.isExplodedCooldown) {
      obj.respawnTimer -= delta;
      obj.pos.x = -2000;
      obj.pos.y = -2000;
      obj.velocity = vec2(0, 0);
      if (obj.respawnTimer <= 0) {
        obj.respawnFromSky();
      }
      continue;
    }

    // 2. If picked up, clear any previous stuck state and ignite fuse!
    if (obj.isCarried) {
      obj.stuckToTarget = null;
      obj.isStuckToFloor = false;
      obj.throwAirTimer = 0;
      if (!obj.isLit) {
        obj.ignite();
      }
    }

    if (obj.isThrownProjectile) {
      obj.throwAirTimer += delta;
      if (!obj.isLit) {
        obj.ignite();
      }
    } else {
      obj.throwAirTimer = 0;
    }

    // 3. Check if a thrown or lit Sticky Bomb hits a Fighter -> GLUE ONTO FIGHTER!
    if (
      !obj.isCarried &&
      !obj.stuckToTarget &&
      (obj.isThrownProjectile || obj.isLit)
    ) {
      for (const fighter of fighterList) {
        if (!fighter || fighter.isFallingInVoid || fighter.isCarried) continue;
        // Brief 0.15s grace period so the thrower doesn't stick to their own hand on release
        if (fighter === obj.thrower && obj.throwAirTimer < 0.15) continue;

        const zDiff = Math.abs((fighter.zHeight || 0) + 20 - obj.zHeight);
        if (zDiff > 54) continue;

        const dx = fighter.pos.x - obj.pos.x;
        const dy =
          (fighter.pos.y - obj.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
        const dist = Math.hypot(dx, dy);
        const stickDist = fighter.footprintRadius + obj.footprintRadius + 9;

        if (dist <= stickDist) {
          obj.stuckToTarget = fighter;
          obj.isStuckToFloor = false;
          obj.isThrownProjectile = false;
          obj.velocity = vec2(0, 0);
          obj.velZ = 0;
          obj.isGrounded = false;
          obj.ignite();
          break;
        }
      }
    }

    // 4. Ride along with the victim Fighter if stuck to them!
    if (obj.stuckToTarget) {
      if (obj.stuckToTarget.isFallingInVoid) {
        obj.stuckToTarget = null;
        obj.isFallingInVoid = true;
      } else {
        const host = obj.stuckToTarget;
        obj.pos.x = host.pos.x + (host.facing?.x || 0) * 11;
        obj.pos.y = host.pos.y + (host.facing?.y || 1) * 5;
        obj.zHeight = (host.zHeight || 0) + 25;
        obj.velocity = vec2(0, 0);
        obj.velZ = 0;
        obj.isGrounded = false;
      }
    } else if (obj.isLit && obj.isGrounded && !obj.isCarried) {
      // 5. If lit and touching the arena floor, glue firmly in place!
      obj.velocity = vec2(0, 0);
      obj.isStuckToFloor = true;
    }

    // 6. Advance fuse countdown and detonate!
    if (obj.isLit) {
      obj.fuseTimer -= delta;
      if (obj.fuseTimer <= 0) {
        detonateBomb(obj, fighterList, objects, props, camera, "slime");
      }
    }
  }
}

/**
 * Renders the Neon Slime-Green Sticky Bomb with sticky suction nodes,
 * glossy slime highlights, sizzling spark wick, and "STUCK!" countdown badge.
 */
export function drawStickyBombVisuals(
  isFlashing = false,
  isLit = false,
  fuseTimer = 3.4,
  fuseDuration = 3.4,
  isStuck = false
) {
  const t = time();
  const radius = 15;

  const urgency = isLit ? clamp(1 - fuseTimer / fuseDuration, 0, 1) : 0;
  const pulseFreq = lerp(7, 26, urgency);
  const dangerPulse = isLit && Math.sin(t * pulseFreq) > 0;

  // 1. Sticky slime puddle splat underneath when glued to floor or fighter!
  if (isStuck) {
    drawCircle({
      pos: vec2(0, -4),
      radius: 19 + Math.sin(t * 9) * 1.5,
      color: rgb(65, 235, 75),
      opacity: 0.78,
    });
  }

  // 2. Six radial sticky gel suction spikes around the sphere
  const nodeCount = 6;
  for (let i = 0; i < nodeCount; i++) {
    const angle = (i / nodeCount) * Math.PI * 2 + t * (isLit ? 2.2 : 0.4);
    const nx = Math.cos(angle) * (radius + 2.5);
    const ny = -radius + Math.sin(angle) * (radius + 2.5);
    drawCircle({
      pos: vec2(nx, ny),
      radius: 4.5,
      color: dangerPulse ? rgb(255, 240, 85) : rgb(135, 255, 75),
      outline: { width: 1.5, color: rgb(18, 52, 24) },
    });
  }

  // 3. Main Neon Slime-Emerald bomb core
  let bodyColor = rgb(36, 178, 64);
  if (isFlashing) {
    bodyColor = rgb(255, 255, 255);
  } else if (dangerPulse) {
    bodyColor = rgb(195, 255, 55);
  }

  drawCircle({
    pos: vec2(0, -radius),
    radius,
    color: bodyColor,
    outline: {
      width: 2.5,
      color: dangerPulse ? rgb(255, 85, 45) : rgb(16, 58, 26),
    },
  });

  // 4. Toxic-lime hazard stripe & glossy slime bubble highlight
  drawCircle({
    pos: vec2(0, -radius),
    radius: 7.5,
    color: dangerPulse ? rgb(255, 75, 55) : rgb(165, 255, 95),
  });
  drawCircle({
    pos: vec2(-5, -radius - 5.5),
    radius: 3.8,
    color: rgb(230, 255, 210),
    opacity: 0.85,
  });

  // 5. Fuse cap & sizzling spark wick
  drawRect({
    pos: vec2(-4.5, -radius * 2 - 3),
    width: 9,
    height: 4.5,
    radius: 2,
    color: rgb(65, 82, 68),
    outline: { width: 1.5, color: rgb(18, 32, 22) },
  });

  const fuseLen = isLit
    ? lerp(3, 11, clamp(fuseTimer / fuseDuration, 0.15, 1))
    : 11;
  const tipX = 4 + Math.sin(t * 11) * 1.5;
  const tipY = -radius * 2 - 3 - fuseLen;

  drawLine({
    p1: vec2(0, -radius * 2 - 3),
    p2: vec2(tipX, tipY),
    width: 2.8,
    color: rgb(195, 245, 150),
  });

  if (isLit) {
    const sparkRadius = 4.2 + Math.sin(t * 38) * 1.6;
    drawCircle({
      pos: vec2(tipX, tipY),
      radius: sparkRadius + 2,
      color: rgb(120, 255, 65),
      opacity: 0.8,
    });
    drawCircle({
      pos: vec2(tipX, tipY),
      radius: sparkRadius,
      color: rgb(255, 255, 155),
    });

    // Floating countdown / "STUCK!" badge (NO square brackets!)
    const secsLeft = Math.max(1, Math.ceil(fuseTimer));
    const badgeY = -radius * 2 - 26;
    const label = isStuck ? `STUCK! ${secsLeft}` : `${secsLeft}`;
    const pillW = isStuck ? 64 : 22;

    drawRect({
      pos: vec2(-pillW * 0.5, badgeY - 8),
      width: pillW,
      height: 16,
      radius: 5,
      color: dangerPulse ? rgb(225, 42, 42) : rgb(18, 46, 24),
      outline: {
        width: 1.8,
        color: rgb(145, 255, 85),
      },
    });

    drawText({
      text: label,
      pos: vec2(-pillW * 0.5 + (isStuck ? 7 : 7), badgeY - 5),
      size: 10.5,
      color: rgb(235, 255, 165),
    });
  }
}
