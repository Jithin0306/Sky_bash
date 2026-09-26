// ============================================================================
// src/objects/mine.js
// ============================================================================
// Proximity Landmine Explosive:
// - Spawns in safe Standby mode (Cyan/Amber LED) so Volt or Pyro can safely
//   pick it up (E) and throw/place it (K / J / Q / Click) anywhere on the court!
// - Once thrown or punched, it arms itself 0.65s after touching the floor,
//   projecting a 2.5D Red Laser Proximity Ring (58px radius).
// - When any Fighter or moving object steps into the proximity ring (or caught
//   in another explosion), it flashes "BEEP!!" for 0.34s and detonates!
// ============================================================================

import { OBJECTS_CONFIG, ARENA_CONFIG } from "../config/gameConfig.js";
import { createPhysicsObject } from "./GameObject.js";
import { detonateBomb } from "./bomb.js";
import { sound } from "../systems/sound.js";

/**
 * Spawns a 2.5D Proximity Landmine at (x, y).
 */
export function createMine(x, y, startZ = 240, initialDropDelay = 0) {
  const cfg = OBJECTS_CONFIG.MINE;

  const mine = createPhysicsObject({
    ...cfg,
    x,
    y,
    startZ,
    initialDropDelay,
    renderVisuals(obj, isFlashing) {
      drawMineVisuals(
        isFlashing,
        obj.isArmed,
        obj.isTriggered,
        obj.triggerTimer,
        obj.triggerRadius,
        !obj.isCarried && obj.isGrounded
      );
    },
  });

  // --- Proximity Landmine State ---
  mine.blastRadius = cfg.blastRadius || 150;
  mine.blastForce = cfg.blastForce || 710;
  mine.triggerRadius = cfg.triggerRadius || 58;
  mine.armDelay = cfg.armDelay || 0.65;
  mine.triggerCountdown = cfg.triggerCountdown || 0.34;

  mine.armOnLanding = false;
  mine.armingTimer = 0;
  mine.isArmed = false;
  mine.isTriggered = false;
  mine.triggerTimer = mine.triggerCountdown;
  mine.isLit = false; // True when armed/triggered so AI & physics systems treat it as active
  mine.fuseTimer = 3.5;
  mine.isExplodedCooldown = false;
  mine.respawnTimer = 0;

  // Punching a Landmine arms or immediately triggers it!
  const baseOnPunchHit = mine.onPunchHit.bind(mine);
  mine.onPunchHit = function (dir, force) {
    if (this.isExplodedCooldown) return;
    baseOnPunchHit(dir, force);
    if (this.isArmed) {
      this.ignite(0.25);
    } else {
      this.armOnLanding = true;
      this.armingTimer = 0.45;
    }
  };

  // Reset all mine states when respawning from the sky
  const baseRespawn = mine.respawnFromSky.bind(mine);
  mine.respawnFromSky = function () {
    baseRespawn();
    this.armOnLanding = false;
    this.armingTimer = 0;
    this.isArmed = false;
    this.isTriggered = false;
    this.isLit = false;
    this.triggerTimer = this.triggerCountdown;
    this.isExplodedCooldown = false;
    this.respawnTimer = 0;
  };

  /**
   * Triggers the Landmine countdown (used by proximity sensor or chain-reaction blasts!).
   */
  mine.ignite = function (maxRemainingSeconds = null) {
    if (this.isExplodedCooldown) return;
    if (!this.isTriggered) {
      sound.playMineTrigger();
    }
    this.isArmed = true;
    this.isTriggered = true;
    this.isLit = true;
    if (
      maxRemainingSeconds !== null &&
      this.triggerTimer > maxRemainingSeconds
    ) {
      this.triggerTimer = maxRemainingSeconds;
    }
    this.fuseTimer = this.triggerTimer;
  };

  return mine;
}

/**
 * Steps arming, proximity detection, and detonation for all Proximity Landmines.
 */
export function updateMineSystem(fighters, objects, props, camera) {
  const delta = dt();
  const fighterList = Array.isArray(fighters)
    ? fighters
    : fighters
    ? [fighters]
    : [];

  for (const obj of objects) {
    if (obj.objectType !== "mine") continue;
    if (obj.isWaitingToDrop) continue;

    // 1. Post-explosion respawn delay
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

    // 2. While carried overhead, keep the mine disarmed until thrown/dropped!
    if (obj.isCarried) {
      obj.isArmed = false;
      obj.isTriggered = false;
      obj.isLit = false;
      obj.armOnLanding = true;
      obj.armingTimer = obj.armDelay;
      obj.triggerTimer = obj.triggerCountdown;
      continue;
    }

    // 3. When thrown as a projectile, mark to arm as soon as it lands on the floor
    if (obj.isThrownProjectile && !obj.armOnLanding) {
      obj.armOnLanding = true;
      obj.armingTimer = obj.armDelay;
    }

    // 4. Count down arming delay once grounded on the arena floor
    if (obj.armOnLanding && !obj.isArmed && obj.isGrounded) {
      obj.velocity.x *= 0.82;
      obj.velocity.y *= 0.82;
      obj.armingTimer -= delta;
      if (obj.armingTimer <= 0) {
        obj.isArmed = true;
        obj.isLit = true;
        obj.fuseTimer = 2.0; // Signals AI to dodge armed mines!
        obj.velocity = vec2(0, 0);
        sound.playMineArm();
      }
    }

    // 5. Proximity Sensor Check when Armed on the floor!
    if (obj.isArmed && !obj.isTriggered && obj.isGrounded) {
      obj.velocity = vec2(0, 0);

      // Check if any Fighter steps inside the 2.5D Laser Proximity Ring
      for (const fighter of fighterList) {
        if (!fighter || fighter.isFallingInVoid || fighter.isCarried) continue;
        if ((fighter.zHeight || 0) > 42) continue;

        const dx = fighter.pos.x - obj.pos.x;
        const dy =
          (fighter.pos.y - obj.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
        const dist = Math.hypot(dx, dy);

        if (dist <= obj.triggerRadius) {
          obj.ignite();
          break;
        }
      }

      // Also check if a thrown/sliding physics object hits the armed mine
      if (!obj.isTriggered) {
        for (const other of objects) {
          if (
            other === obj ||
            other.isCarried ||
            other.isFallingInVoid ||
            other.isExplodedCooldown ||
            other.isWaitingToDrop
          ) {
            continue;
          }
          const speed = Math.hypot(other.velocity.x, other.velocity.y);
          if (speed < 45 && !other.isThrownProjectile) continue;

          const dx = other.pos.x - obj.pos.x;
          const dy =
            (other.pos.y - obj.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
          const dist = Math.hypot(dx, dy);
          if (dist <= obj.triggerRadius * 0.85) {
            obj.ignite();
            break;
          }
        }
      }
    }

    // 6. Triggered rapid-beep countdown -> DETONATE!
    if (obj.isTriggered) {
      obj.triggerTimer -= delta;
      obj.fuseTimer = Math.max(0.05, obj.triggerTimer);
      if (obj.triggerTimer <= 0) {
        detonateBomb(obj, fighterList, objects, props, camera, "mine");
      }
    }
  }
}

/**
 * Renders the 2.5D Tactical Steel & Hazard-Gold Proximity Landmine disc,
 * 2.5D red laser sensor ring when armed, and central LED beacon.
 */
export function drawMineVisuals(
  isFlashing = false,
  isArmed = false,
  isTriggered = false,
  triggerTimer = 0.34,
  triggerRadius = 58,
  showFloorSensorRing = false
) {
  const t = time();

  // 1. 2.5D Red Laser Proximity Sensor Ring on the arena floor when ARMED!
  if ((isArmed || isTriggered) && showFloorSensorRing) {
    const ringPulse = isTriggered
      ? 0.9
      : 0.45 + 0.3 * Math.sin(t * 7);

    pushTransform();
    pushScale(1, ARENA_CONFIG.PERSPECTIVE_Y_SCALE);
    drawCircle({
      pos: vec2(0, 0),
      radius: triggerRadius,
      color: rgb(255, 45, 55),
      opacity: isTriggered ? 0.28 : 0.11,
      outline: {
        width: isTriggered ? 3.5 : 2,
        color: isTriggered ? rgb(255, 235, 75) : rgb(255, 65, 65),
        opacity: ringPulse,
      },
    });
    popTransform();
  }

  // 2. Heavy Dark Steel Base Plate (2.5D oval disc)
  pushTransform();
  pushTranslate(0, -5);
  pushScale(1, 0.68);
  drawCircle({
    pos: vec2(0, 0),
    radius: 19,
    color: isFlashing ? rgb(255, 255, 255) : rgb(42, 48, 62),
    outline: {
      width: 2.5,
      color: rgb(18, 22, 32),
    },
  });

  // Hazard yellow-gold inner rim segments
  drawCircle({
    pos: vec2(0, -3),
    radius: 14.5,
    color: rgb(72, 82, 102),
    outline: {
      width: 2.2,
      color: isArmed ? rgb(255, 95, 55) : rgb(245, 195, 55),
    },
  });
  popTransform();

  // 3. Central Pressure Sensor Dome & Blinking LED Beacon
  const blinkFast = isTriggered
    ? Math.sin(t * 45) > 0
    : isArmed
    ? Math.sin(t * 11) > 0
    : Math.sin(t * 3.5) > 0;

  const domeColor = isTriggered
    ? blinkFast
      ? rgb(255, 255, 180)
      : rgb(255, 38, 38)
    : isArmed
    ? blinkFast
      ? rgb(255, 55, 55)
      : rgb(165, 22, 28)
    : blinkFast
    ? rgb(65, 235, 220)
    : rgb(35, 125, 135);

  drawCircle({
    pos: vec2(0, -11),
    radius: 6.5,
    color: domeColor,
    outline: { width: 1.8, color: rgb(22, 26, 38) },
  });

  // Specular LED shine dot
  drawCircle({
    pos: vec2(-2, -13),
    radius: 2,
    color: rgb(255, 255, 255),
    opacity: 0.85,
  });

  // 4. Floating Status Callout ("BEEP!!" when triggered, "ARMED" when armed)
  if (isTriggered) {
    drawRect({
      pos: vec2(-28, -38),
      width: 56,
      height: 16,
      radius: 5,
      color: rgb(235, 35, 35),
      outline: { width: 1.8, color: rgb(255, 235, 85) },
    });
    drawText({
      text: "BEEP!!",
      pos: vec2(-21, -34),
      size: 10.5,
      color: rgb(255, 250, 175),
    });
  } else if (isArmed && showFloorSensorRing) {
    drawRect({
      pos: vec2(-25, -35),
      width: 50,
      height: 15,
      radius: 4,
      color: rgb(22, 18, 28),
      opacity: 0.88,
      outline: { width: 1.4, color: rgb(255, 75, 65) },
    });
    drawText({
      text: "ARMED",
      pos: vec2(-19, -31),
      size: 9.5,
      color: rgb(255, 115, 95),
    });
  }
}
