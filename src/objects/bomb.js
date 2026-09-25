// ============================================================================
// src/objects/bomb.js
// ============================================================================
// Phase 9: 2.5D Sky Fuse Bomb & Explosive Blast System:
// - Ignites automatically when picked up (E), punched (J/Click), thrown (K/Click),
//   or caught inside another bomb's blast wave (chain-reaction detonation!).
// - Displays a sizzling fuse spark, accelerating crimson warning flash, a 2.5D
//   ground blast-radius warning ring, and a live 3..2..1 countdown badge.
// - Explodes with a multi-layered fireball, shockwave ring, "KABOOM!!" comic
//   banner, camera shake, and radial 2.5D knockback on players, dummies, & crates!
// ============================================================================

import { OBJECTS_CONFIG, ARENA_CONFIG } from "../config/gameConfig.js";
import { createPhysicsObject } from "./GameObject.js";

/**
 * Spawns a 2.5D Sky Fuse Bomb at (x, y).
 */
export function createBomb(x, y, startZ = 240) {
  const cfg = OBJECTS_CONFIG.BOMB;

  const bomb = createPhysicsObject({
    ...cfg,
    x,
    y,
    startZ,
    renderVisuals(obj, isFlashing) {
      drawBombVisuals(
        isFlashing,
        obj.isLit,
        obj.fuseTimer,
        obj.fuseDuration
      );
    },
  });

  // --- Phase 9 Bomb Fuse & Detonation State ---
  bomb.fuseDuration = cfg.fuseDuration || 3.5;
  bomb.fuseTimer = bomb.fuseDuration;
  bomb.blastRadius = cfg.blastRadius || 145;
  bomb.blastForce = cfg.blastForce || 680;
  bomb.isLit = false;
  bomb.isExplodedCooldown = false;
  bomb.respawnTimer = 0;

  // Wrap base onPunchHit so punching an unlit bomb also ignites its fuse!
  const baseOnPunchHit = bomb.onPunchHit.bind(bomb);
  bomb.onPunchHit = function (dir, force) {
    if (this.isExplodedCooldown) return;
    baseOnPunchHit(dir, force);
    this.ignite();
  };

  // Wrap base respawnFromSky so fuse state resets cleanly
  const baseRespawn = bomb.respawnFromSky.bind(bomb);
  bomb.respawnFromSky = function () {
    baseRespawn();
    this.isLit = false;
    this.fuseTimer = this.fuseDuration;
    this.isExplodedCooldown = false;
    this.respawnTimer = 0;
  };

  /**
   * Lights the bomb's fuse! If already lit, optionally shortens the remaining fuse
   * (used for chain-reaction explosions).
   */
  bomb.ignite = function (maxRemainingSeconds = null) {
    if (this.isExplodedCooldown) return;
    if (!this.isLit) {
      this.isLit = true;
      this.fuseTimer = this.fuseDuration;
    }
    if (maxRemainingSeconds !== null && this.fuseTimer > maxRemainingSeconds) {
      this.fuseTimer = maxRemainingSeconds;
    }
  };

  return bomb;
}

/**
 * Steps the fuse timer and handles detonation & sky-respawn for all Bomb objects.
 * Called every frame from `updatePhysicsSystem()` in `src/systems/physics.js`.
 */
export function updateBombSystem(player, objects, props, camera) {
  const delta = dt();

  for (const obj of objects) {
    if (obj.objectType !== "bomb") continue;

    // 1. Handle post-explosion respawn delay before dropping a fresh bomb from the sky
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

    // 2. If the bomb was just picked up or thrown, ensure its fuse is lit!
    if ((obj.isCarried || obj.isThrownProjectile) && !obj.isLit) {
      obj.ignite();
    }

    // 3. Advance the fuse countdown while lit
    if (obj.isLit) {
      obj.fuseTimer -= delta;
      if (obj.fuseTimer <= 0) {
        detonateBomb(obj, player, objects, props, camera);
      }
    }
  }
}

/**
 * Triggers a massive 2.5D radial explosion at the bomb's current position!
 */
export function detonateBomb(bomb, player, objects, props, camera) {
  // If Volt was still holding the bomb when the timer ran out, force-release it at Volt's head!
  let blastX = bomb.pos.x;
  let blastY = bomb.pos.y;
  let blastZ = Math.max(0, bomb.zHeight);

  if (bomb.isCarried && bomb.carrier) {
    blastX = bomb.carrier.pos.x;
    blastY = bomb.carrier.pos.y;
    blastZ = bomb.carrier.zHeight + 44;
    bomb.carrier.heldObject = null;
    bomb.carrier.pickupAnimTimer = 0;
  }

  bomb.isCarried = false;
  bomb.carrier = null;
  bomb.isLit = false;
  bomb.isThrownProjectile = false;
  bomb.isExplodedCooldown = true;
  bomb.respawnTimer = 2.4;

  const radius = bomb.blastRadius || 145;
  const maxForce = bomb.blastForce || 680;

  // 1. Heavy camera shake & multi-layered KABOOM!! visual explosion
  if (camera) {
    camera.shake(16.5);
  }
  spawnExplosionVFX(blastX, blastY, blastZ, radius);

  // 2. Apply radial 2.5D blast knockback to the Player (Volt)
  if (player && !player.isFallingInVoid) {
    const dx = player.pos.x - blastX;
    const dy = (player.pos.y - blastY) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
    const dist = Math.hypot(dx, dy);

    if (dist <= radius) {
      const falloff = clamp(1 - dist / (radius * 1.15), 0.3, 1.0);
      const nx = dist > 1 ? dx / dist : 0;
      const ny = dist > 1 ? dy / dist : 1;

      const launchForce = maxForce * 0.92 * falloff;
      player.knockback.x += nx * launchForce;
      player.knockback.y +=
        ny * launchForce * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
      player.velZ = Math.max(player.velZ, 315 * falloff);
      player.isGrounded = false;
      player.landingSquash = -0.35;
      player.health = Math.max(0, (player.health || 100) - Math.round(bomb.damage * falloff));
    }
  }

  // 3. Apply radial 2.5D blast knockback to Arena Props (Sparring Dummy & Crystal Orbs)
  if (props) {
    for (const prop of props) {
      if (prop.isFallingInVoid) continue;
      const dx = prop.pos.x - blastX;
      const dy = (prop.pos.y - blastY) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
      const dist = Math.hypot(dx, dy);

      if (dist <= radius) {
        const falloff = clamp(1 - dist / (radius * 1.15), 0.35, 1.0);
        const nx = dist > 1 ? dx / dist : 0;
        const ny = dist > 1 ? dy / dist : -1;

        if (prop.velocity) {
          // Movable Sparring Dummy -> blast it high and far across the court!
          const dummyForce = maxForce * 1.05 * falloff;
          prop.velocity.x = nx * dummyForce;
          prop.velocity.y =
            ny * dummyForce * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
          prop.velZ = 330 * falloff;
          prop.isGrounded = false;
          prop.hitFlashTimer = 0.28;
          prop.wobbleAngle = (nx >= 0 ? 1 : -1) * 42;
          prop.totalHitsTaken = (prop.totalHitsTaken || 0) + 1;
        } else if (typeof prop.onPunchHit === "function") {
          prop.onPunchHit(vec2(nx, ny), maxForce * falloff);
        }
      }
    }
  }

  // 4. Apply radial 2.5D blast knockback to all other Physics Objects & Chain-Ignite Bombs!
  if (objects) {
    for (const other of objects) {
      if (other === bomb || other.isCarried || other.isFallingInVoid || other.isExplodedCooldown) {
        continue;
      }

      const dx = other.pos.x - blastX;
      const dy = (other.pos.y - blastY) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
      const dist = Math.hypot(dx, dy);

      if (dist <= radius * 1.1) {
        const falloff = clamp(1 - dist / (radius * 1.2), 0.3, 1.0);
        const nx = dist > 1 ? dx / dist : rand(-1, 1);
        const ny = dist > 1 ? dy / dist : rand(-1, 1);

        const objForce = (maxForce * falloff) / Math.sqrt(other.mass || 1.0);
        other.velocity.x = nx * objForce;
        other.velocity.y =
          ny * objForce * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
        other.velZ = clamp((290 * falloff) / Math.sqrt(other.mass || 1.0), 140, 360);
        other.isGrounded = false;
        other.hitFlashTimer = 0.22;
        other.squashFactor = 0.35;

        // Domino Chain-Reaction: If another bomb is inside the blast wave, ignite it with a short 0.28s fuse!
        if (other.objectType === "bomb" && typeof other.ignite === "function") {
          other.ignite(0.28);
        }
      }
    }
  }
}

/**
 * Draws the stylized 2.5D Iron Fuse Bomb, sizzling wick spark, and countdown badge.
 * Exported so `Player.js` can also draw the bomb when Volt carries it overhead!
 */
export function drawBombVisuals(
  isFlashing = false,
  isLit = false,
  fuseTimer = 3.5,
  fuseDuration = 3.5
) {
  const t = time();
  const radius = 16;

  // Accelerating crimson-red danger pulse as fuseTimer counts down toward 0!
  const urgency = isLit ? clamp(1 - fuseTimer / fuseDuration, 0, 1) : 0;
  const pulseFreq = lerp(7, 26, urgency);
  const redPulse = isLit && Math.sin(t * pulseFreq) > 0;

  let bodyColor = rgb(38, 44, 58);
  if (isFlashing) {
    bodyColor = rgb(255, 255, 255);
  } else if (redPulse) {
    bodyColor = rgb(245, 52, 48);
  }

  // 1. Main round cast-iron bomb sphere
  drawCircle({
    pos: vec2(0, -radius),
    radius,
    color: bodyColor,
    outline: {
      width: 2.5,
      color: redPulse ? rgb(255, 220, 95) : rgb(18, 22, 32),
    },
  });

  // 2. Danger hazard band across bomb belly
  drawRect({
    pos: vec2(-13, -radius - 3),
    width: 26,
    height: 6,
    radius: 2,
    color: redPulse ? rgb(255, 235, 90) : rgb(235, 85, 45),
  });

  // 3. Specular metallic highlight on top-left of iron sphere
  drawCircle({
    pos: vec2(-5.5, -radius - 6),
    radius: 4,
    color: rgb(140, 158, 188),
    opacity: 0.75,
  });

  // 4. Brass fuse cap at the top of the bomb
  drawRect({
    pos: vec2(-5, -radius * 2 - 3),
    width: 10,
    height: 5,
    radius: 2,
    color: rgb(215, 168, 65),
    outline: { width: 1.5, color: rgb(42, 30, 16) },
  });

  // 5. Curved rope fuse cord (shortens as fuseTimer burns down!)
  const fuseLen = isLit ? lerp(3, 12, clamp(fuseTimer / fuseDuration, 0.15, 1)) : 12;
  const tipX = 5 + Math.sin(t * 10) * 1.5;
  const tipY = -radius * 2 - 3 - fuseLen;

  drawLine({
    p1: vec2(0, -radius * 2 - 3),
    p2: vec2(tipX, tipY),
    width: 3,
    color: rgb(215, 195, 145),
  });

  // 6. Sizzling golden-orange spark at the fuse tip & live countdown pill when lit!
  if (isLit) {
    const sparkRadius = 4.5 + Math.sin(t * 38) * 1.8;
    drawCircle({
      pos: vec2(tipX, tipY),
      radius: sparkRadius + 2.5,
      color: rgb(255, 115, 35),
      opacity: 0.75,
    });
    drawCircle({
      pos: vec2(tipX, tipY),
      radius: sparkRadius,
      color: rgb(255, 245, 130),
    });

    // Floating numeric countdown badge ("3", "2", "1") above the bomb
    const secsLeft = Math.max(1, Math.ceil(fuseTimer));
    const badgeY = -radius * 2 - 26;

    drawRect({
      pos: vec2(-11, badgeY - 8),
      width: 22,
      height: 16,
      radius: 5,
      color: redPulse ? rgb(235, 38, 38) : rgb(18, 22, 36),
      outline: {
        width: 1.8,
        color: rgb(255, 220, 75),
      },
    });

    drawText({
      text: `${secsLeft}`,
      pos: vec2(-4, badgeY - 5),
      size: 11,
      color: rgb(255, 248, 165),
    });
  }
}

/**
 * Spawns a dramatic 2.5D explosion fireball, expanding shockwave ring,
 * flying ember shards, and a compact "KABOOM!!" comic banner!
 */
function spawnExplosionVFX(x, y, zHeight, blastRadius) {
  let age = 0;
  const duration = 0.62;

  const embers = [];
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + rand(-0.18, 0.18);
    embers.push({
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      speed: rand(160, 320),
      size: rand(5, 9),
      isGold: i % 2 === 0,
    });
  }

  add([
    pos(x, y),
    z(930),
    {
      update() {
        age += dt();
        if (age >= duration) destroy(this);
      },
      draw() {
        const progress = age / duration;
        const alpha = 1 - progress;
        const drawY = -zHeight;

        // 1. Expanding 2.5D ground blast shockwave ring on the arena floor
        pushTransform();
        pushScale(1, ARENA_CONFIG.PERSPECTIVE_Y_SCALE);
        drawCircle({
          pos: vec2(0, 0),
          radius: lerp(24, blastRadius, Math.min(1, progress * 1.45)),
          fill: false,
          outline: {
            width: 5 * alpha,
            color: rgb(255, 195, 65),
            opacity: alpha * 0.85,
          },
        });
        popTransform();

        // 2. Central expanding & fading fireball core
        if (age < 0.36) {
          const fireProg = age / 0.36;
          const fireAlpha = 1 - fireProg;

          // Outer crimson-orange blast sphere
          drawCircle({
            pos: vec2(0, drawY - 18),
            radius: lerp(22, blastRadius * 0.62, fireProg),
            color: rgb(255, 92, 32),
            opacity: fireAlpha * 0.85,
          });

          // Inner white-gold flash core
          drawCircle({
            pos: vec2(0, drawY - 18),
            radius: lerp(14, blastRadius * 0.38, fireProg),
            color: rgb(255, 248, 185),
            opacity: fireAlpha * 0.95,
          });
        }

        // 3. Flying ember shards
        for (const e of embers) {
          const dist = e.speed * age;
          const ex = e.cos * dist;
          const ey = drawY - 16 + e.sin * dist * 0.72;
          drawCircle({
            pos: vec2(ex, ey),
            radius: e.size * (1 - progress * 0.7),
            color: e.isGold ? rgb(255, 220, 70) : rgb(245, 75, 38),
            outline: { width: 1.5, color: rgb(28, 18, 22) },
          });
        }

        // 4. Compact high-contrast "KABOOM!!" comic badge above the blast
        const badgeY = drawY - 64 - progress * 24;
        const popScale =
          age < 0.1
            ? lerp(0.5, 1.12, age / 0.1)
            : lerp(1.12, 0.96, Math.min(1, (age - 0.1) / 0.2));

        pushTransform();
        pushTranslate(0, badgeY);
        pushScale(popScale, popScale);

        drawRect({
          pos: vec2(-37, -10),
          width: 76,
          height: 22,
          radius: 6,
          color: rgb(15, 18, 30),
          opacity: alpha * 0.9,
        });

        drawRect({
          pos: vec2(-38, -12),
          width: 76,
          height: 21,
          radius: 6,
          color: rgb(255, 205, 45),
          opacity: alpha,
          outline: { width: 2.2, color: rgb(225, 35, 30) },
        });

        drawText({
          text: "KABOOM!!",
          pos: vec2(-30, -7),
          size: 12,
          color: rgb(195, 22, 22),
          opacity: alpha,
        });

        popTransform();
      },
    },
  ]);
}
