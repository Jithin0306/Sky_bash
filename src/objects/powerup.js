// ============================================================================
// src/objects/powerup.js
// ============================================================================
// Phase 11: 2.5D Sky Power-Up Drops ("gloves", "shield", "medkit"):
// - Drops from the sky onto the circular arena with a glowing 2.5D aura ring.
// - Instant touch-pickup by either VOLT or PYRO AI!
// - Types:
//   1. "gloves" : Super Boxing Gloves (10s) -> 1.55x Punch Knockback & Damage!
//   2. "shield" : Energy Shield Bubble (10s / 80 HP) -> Absorbs hits & blasts!
//   3. "medkit" : Sky Medkit (Instant) -> Restores +50 HP & 100% Stamina!
// ============================================================================

import { ARENA_CONFIG, PLAYER_CONFIG } from "../config/gameConfig.js";
import { isPointOnArena } from "../scenes/arena.js";
import {
  updateDepthSort,
  computeDepthScale,
  drawGroundShadow,
} from "../systems/depthSort.js";
import { spawnPickupVFX } from "../player/playerCombat.js";

const POWERUP_TYPES = ["gloves", "shield", "medkit"];

/**
 * Spawns a 2.5D Power-Up Orb at (x, y) that drops from `startZ`.
 *
 * @param {number} x - Arena floor X coordinate
 * @param {number} y - Arena floor Y coordinate
 * @param {string} powerType - "gloves" | "shield" | "medkit" (or random if null)
 * @param {number} startZ - Initial sky drop height
 */
export function createPowerUp(
  x = ARENA_CONFIG.CENTER_X,
  y = ARENA_CONFIG.CENTER_Y,
  powerType = null,
  startZ = 240
) {
  const chosenType =
    powerType || POWERUP_TYPES[Math.floor(rand(0, POWERUP_TYPES.length))];

  const orb = add([
    pos(x, y),
    z(Math.round(y)),
    "powerUpOrb",
    {
      powerType: chosenType,
      footprintRadius: 19,
      zHeight: startZ,
      velZ: 0,
      isGrounded: startZ <= 0,
      isCollected: false,
      lifeTimer: 16.0, // Stays on the court for 16s before fading out

      update() {
        const delta = dt();
        if (this.isCollected) {
          destroy(this);
          return;
        }

        // Sky-drop gravity with gentle parachute descent
        if (!this.isGrounded) {
          this.velZ = Math.max(-290, this.velZ - 640 * delta);
          this.zHeight += this.velZ * delta;
          if (this.zHeight <= 0) {
            this.zHeight = 0;
            this.velZ = 110; // Small bounce on touchdown
            this.isGrounded = true;
          }
        } else {
          this.lifeTimer -= delta;
          if (this.lifeTimer <= 0) {
            destroy(this);
            return;
          }
        }

        updateDepthSort(this);
      },

      draw() {
        if (this.isCollected) return;
        const t = time();
        const overArena = isPointOnArena(this.pos.x, this.pos.y);

        // Blink warning during final 3 seconds before despawn
        if (this.lifeTimer < 3.0 && Math.sin(t * 24) < 0) return;

        const theme = getPowerUpTheme(this.powerType);
        const hoverY = this.isGrounded ? Math.sin(t * 4.5) * 5.5 : 0;

        // 1. 2.5D Ground Shadow & Pulsing Aura Ring
        drawGroundShadow({
          radius: 17,
          zHeight: this.zHeight + hoverY,
          overArena,
          ringColor: theme.mainRGB,
        });

        pushTransform();
        pushScale(1, ARENA_CONFIG.PERSPECTIVE_Y_SCALE);
        drawCircle({
          pos: vec2(0, 0),
          radius: 23 + Math.sin(t * 6) * 2.5,
          fill: false,
          outline: {
            width: 2.5,
            color: rgb(...theme.mainRGB),
            opacity: 0.85,
          },
        });
        popTransform();

        // 2. Floating 2.5D Power-Up Capsule / Hologram Orb
        const dScale = computeDepthScale(this.pos.y);
        pushTransform();
        pushTranslate(0, -this.zHeight - 18 - hoverY);
        pushScale(dScale, dScale);

        // Outer glowing energy sphere
        drawCircle({
          pos: vec2(0, 0),
          radius: 16,
          color: rgb(...theme.bgRGB),
          opacity: 0.92,
          outline: {
            width: 2.5,
            color: rgb(...theme.mainRGB),
          },
        });

        // Inner emblem icon based on powerType
        if (this.powerType === "gloves") {
          // Mini Golden-Red Boxing Glove Icon
          drawCircle({
            pos: vec2(1, 0),
            radius: 8.5,
            color: rgb(255, 95, 45),
            outline: { width: 1.8, color: rgb(255, 225, 85) },
          });
          drawCircle({
            pos: vec2(-5, 3),
            radius: 4.5,
            color: rgb(255, 195, 55),
          });
        } else if (this.powerType === "shield") {
          // Mini Cyan Energy Shield Hexagon/Ring Icon
          drawCircle({
            pos: vec2(0, 0),
            radius: 9,
            color: rgb(55, 225, 255),
            opacity: 0.55,
            outline: { width: 2.5, color: rgb(195, 252, 255) },
          });
          drawCircle({
            pos: vec2(-3, -3),
            radius: 3,
            color: rgb(255, 255, 255),
          });
        } else {
          // "medkit" -> Emerald Health Cross Icon
          drawRect({
            pos: vec2(-3, -8),
            width: 6,
            height: 16,
            radius: 1.5,
            color: rgb(95, 255, 135),
          });
          drawRect({
            pos: vec2(-8, -3),
            width: 16,
            height: 6,
            radius: 1.5,
            color: rgb(95, 255, 135),
          });
        }

        // Floating Power-Up Label Pill above the Orb (No square brackets!)
        drawRect({
          pos: vec2(-theme.pillW * 0.5, -34),
          width: theme.pillW,
          height: 15,
          radius: 4,
          color: rgb(12, 18, 32),
          opacity: 0.92,
          outline: { width: 1.5, color: rgb(...theme.mainRGB) },
        });

        drawText({
          text: theme.shortLabel,
          pos: vec2(-theme.pillW * 0.5 + 6, -30),
          size: 9.5,
          color: rgb(...theme.textRGB),
        });

        popTransform();
      },
    },
  ]);

  return orb;
}

/**
 * Checks if any Fighter touches an active Power-Up Orb and applies its buff!
 */
export function updatePowerUpSystem(fighters, activePowerUps) {
  const fighterList = Array.isArray(fighters)
    ? fighters
    : fighters
    ? [fighters]
    : [];

  for (let i = activePowerUps.length - 1; i >= 0; i--) {
    const orb = activePowerUps[i];
    if (!orb || !orb.exists() || orb.isCollected) {
      activePowerUps.splice(i, 1);
      continue;
    }

    // Only collect when within vertical reach
    if (orb.zHeight > 52) continue;

    for (const fighter of fighterList) {
      if (!fighter || fighter.isFallingInVoid || fighter.isCarried) continue;

      const dx = fighter.pos.x - orb.pos.x;
      const dy =
        (fighter.pos.y - orb.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
      const dist = Math.hypot(dx, dy);

      if (dist <= fighter.footprintRadius + orb.footprintRadius + 6) {
        applyPowerUpToFighter(fighter, orb.powerType);
        orb.isCollected = true;
        destroy(orb);
        activePowerUps.splice(i, 1);
        break;
      }
    }
  }
}

/**
 * Applies the selected Power-Up buff to `fighter` and spawns a comic callout!
 */
export function applyPowerUpToFighter(fighter, powerType) {
  if (!fighter) return;

  if (powerType === "gloves") {
    fighter.powerGlovesTimer = 10.0;
    spawnPickupVFX(
      fighter.pos.x,
      fighter.pos.y,
      (fighter.zHeight || 0) + 34,
      "SUPER GLOVES!"
    );
  } else if (powerType === "shield") {
    fighter.shieldTimer = 10.0;
    fighter.shieldHp = 80;
    spawnPickupVFX(
      fighter.pos.x,
      fighter.pos.y,
      (fighter.zHeight || 0) + 34,
      "SHIELD UP!"
    );
  } else if (powerType === "medkit") {
    fighter.health = Math.min(
      fighter.maxHealth || 100,
      (fighter.health || 0) + 50
    );
    fighter.stamina = PLAYER_CONFIG.MAX_STAMINA;
    fighter.isStaminaExhausted = false;
    spawnPickupVFX(
      fighter.pos.x,
      fighter.pos.y,
      (fighter.zHeight || 0) + 34,
      "+50 HP HEAL!"
    );
  }
}

function getPowerUpTheme(powerType) {
  if (powerType === "gloves") {
    return {
      shortLabel: "POWER GLOVES",
      pillW: 86,
      mainRGB: [255, 145, 45],
      bgRGB: [52, 24, 18],
      textRGB: [255, 225, 115],
    };
  }
  if (powerType === "shield") {
    return {
      shortLabel: "ENERGY SHIELD",
      pillW: 88,
      mainRGB: [65, 235, 255],
      bgRGB: [16, 42, 64],
      textRGB: [175, 248, 255],
    };
  }
  return {
    shortLabel: "MEDKIT +50 HP",
    pillW: 88,
    mainRGB: [85, 245, 135],
    bgRGB: [16, 48, 28],
    textRGB: [185, 255, 205],
  };
}
