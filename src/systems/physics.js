// ============================================================================
// src/systems/physics.js
// ============================================================================
// 2.5D Physics Engine for Arena Objects (Milestone 6 - Section 10 & 11):
// Handles:
// 1. Gravity, floor bouncing (`bounce`), and rolling/sliding friction (`friction`)
// 2. Mass-based knockback (`mass`) when punched or bumped
// 3. Object-vs-Object elastic 2.5D collisions (chain-reaction impacts!)
// 4. Player-vs-Object pushing (dribbling balls, sliding crates, heavy resistance)
// 5. Falling off the circular arena into the abyss & sky respawning
// ============================================================================

import {
  ARENA_CONFIG,
  PLAYER_CONFIG,
  OBJECTS_CONFIG,
} from "../config/gameConfig.js";
import { getArenaDistance, isPointOnArena } from "../scenes/arena.js";
import { updateDepthSort } from "./depthSort.js";
import { spawnHitImpactVFX } from "../player/playerCombat.js";
import { updateBombSystem } from "../objects/bomb.js";
import { updateStickyBombSystem } from "../objects/stickyBomb.js";
import { updateMineSystem } from "../objects/mine.js";

/**
 * Steps the entire 2.5D object physics simulation for the current frame.
 *
 * @param {Object} player - The playable character
 * @param {Array<Object>} objects - Array of active physics objects in the arena
 * @param {Array<Object>} props - Arena props (Crystal Orb Stands & Sparring Dummy)
 * @param {Object} camera - Arena camera controller (for heavy landing & throw impact shakes)
 */
export function updatePhysicsSystem(
  fighters,
  objects,
  props = [],
  camera = null
) {
  const delta = dt();
  const fighterList = Array.isArray(fighters)
    ? fighters
    : fighters
    ? [fighters]
    : [];

  // 0. Step Bombs, Slime Sticky Bombs, & Proximity Landmines!
  updateBombSystem(fighterList, objects, props, camera);
  updateStickyBombSystem(fighterList, objects, props, camera);
  updateMineSystem(fighterList, objects, props, camera);

  // 1. Update each individual object's motion, gravity, bounce, & cliff fall
  for (const obj of objects) {
    updateSingleObjectPhysics(obj, delta, camera);
  }

  // 2. Resolve Object-vs-Object 2.5D elastic collisions (mass-weighted + thrown impact VFX!)
  resolveObjectToObjectCollisions(objects, camera);

  // 3. Resolve Object-vs-ArenaProp collisions (so Heavy Boxes, Crates, & Balls
  //    bounce/slide solidly around the Crystal Orb Stands & Sparring Dummy!)
  resolveObjectToPropCollisions(objects, props, camera);

  // 4. Resolve Fighter-vs-Fighter body collisions (Volt vs Pyro AI!)
  resolveFighterToFighterCollisions(fighterList);

  // 5. Resolve Fighter-vs-Object pushing & Thrown Projectile-vs-Fighter impacts!
  for (const fighter of fighterList) {
    if (fighter && !fighter.isFallingInVoid) {
      resolvePlayerToObjectInteractions(fighter, objects, camera);
    }
  }

  // Re-check Object-vs-Prop after fighter pushing so nobody can wedge a Heavy Box inside an Orb Stand!
  resolveObjectToPropCollisions(objects, props, camera);
}

/**
 * Updates a single physics object's velocity, bounce, rolling angle, and ground state.
 */
function updateSingleObjectPhysics(obj, delta, camera, onRingOut) {
  // 0. If waiting in the sky drop queue, count down skyDropDelayTimer before dropping!
  if (obj.isWaitingToDrop) {
    obj.skyDropDelayTimer -= delta;
    if (obj.skyDropDelayTimer <= 0) {
      obj.respawnFromSky();
    }
    return;
  }

  // If carried in a player's hands (Phase 7) or cooling down after exploding (Phase 9), skip floor physics
  if (obj.isCarried || obj.isExplodedCooldown) {
    return;
  }

  // If a Sticky Bomb is glued onto a fighter, updateDepthSort so it renders in front of their chest and return!
  if (obj.stuckToTarget) {
    obj.z = Math.round(obj.pos.y) + 2;
    return;
  }

  // 1. Apply horizontal velocity to 2.5D floor coordinates (x, y)
  obj.pos.x += obj.velocity.x * delta;
  obj.pos.y += obj.velocity.y * delta;

  // 2. Advance visual roll angle (used by rolling spheres/balls)
  const speed = Math.hypot(
    obj.velocity.x,
    obj.velocity.y / ARENA_CONFIG.PERSPECTIVE_Y_SCALE
  );
  if (speed > 2) {
    const dirSign = obj.velocity.x >= 0 ? 1 : -1;
    obj.rollAngle += dirSign * (speed / obj.footprintRadius) * delta * 35;
  }

  // 3. Apply ground friction (or light air resistance while airborne)
  const activeFriction = obj.isGrounded ? obj.friction : 110;
  const currentVelMag = Math.hypot(obj.velocity.x, obj.velocity.y);

  if (currentVelMag <= activeFriction * delta) {
    obj.velocity.x = 0;
    obj.velocity.y = 0;
  } else {
    const scale = (currentVelMag - activeFriction * delta) / currentVelMag;
    obj.velocity.x *= scale;
    obj.velocity.y *= scale;
  }

  // 4. Circular Arena Ground Detection & Cliff Drop-Off
  const overArena = isPointOnArena(obj.pos.x, obj.pos.y);

  if (obj.isGrounded && !overArena) {
    // Rolled or slid off the circular rim!
    obj.isGrounded = false;
    obj.isFallingInVoid = true;
    obj.velZ = -45;
    if (onRingOut) onRingOut(obj);
  }

  // 5. Vertical Gravity & Floor Bouncing (`bounce`)
  if (!obj.isGrounded) {
    obj.velZ = Math.max(
      PLAYER_CONFIG.TERMINAL_FALL_SPEED,
      obj.velZ - OBJECTS_CONFIG.GRAVITY * delta
    );
    obj.zHeight += obj.velZ * delta;

    if (obj.zHeight <= 0) {
      if (overArena && !obj.isFallingInVoid) {
        const impactSpeed = Math.abs(obj.velZ);
        obj.zHeight = 0;

        // Heavy objects shake the camera when slamming onto the sandstone floor!
        if (impactSpeed > 220 && obj.mass >= 2.0 && camera) {
          camera.shake(6.5);
        }

        // Bounce back into the air only once if impactSpeed is high enough!
        if (impactSpeed > 135 && obj.bounce > 0.18) {
          obj.velZ = impactSpeed * obj.bounce;
          obj.squashFactor = 0.24;
        } else {
          obj.velZ = 0;
          obj.isGrounded = true;
          obj.squashFactor = 0.18;
        }
      } else if (!obj.isFallingInVoid) {
        // Missed the arena surface in mid-air -> plummet into the void!
        obj.isFallingInVoid = true;
        if (onRingOut) onRingOut(obj);
      }
    }
  }

  // 6. Push falling objects slightly outside the golden rim so they sink cleanly
  // behind the North edge or down the South cliff
  if (obj.isFallingInVoid) {
    const dist = getArenaDistance(obj.pos.x, obj.pos.y);
    const cliffRadius = ARENA_CONFIG.RADIUS + 26;
    if (dist < cliffRadius && dist > 0.001) {
      const targetDist = lerp(dist, cliffRadius, Math.min(1, 18 * delta));
      const factor = targetDist / dist;
      obj.pos.x = ARENA_CONFIG.CENTER_X + (obj.pos.x - ARENA_CONFIG.CENTER_X) * factor;
      obj.pos.y = ARENA_CONFIG.CENTER_Y + (obj.pos.y - ARENA_CONFIG.CENTER_Y) * factor;
    }
  }

  // 7. Schedule delayed respawn from the sky (5.5s-9.5s wait) if fallen deep into the abyss
  if (obj.zHeight < PLAYER_CONFIG.ABYSS_RESPAWN_Z) {
    if (typeof obj.scheduleSkyRespawn === "function") {
      obj.scheduleSkyRespawn();
    } else {
      obj.respawnFromSky();
    }
  }

  // 8. Phase 8: Clear `isThrownProjectile` once the object settles on the floor
  if (obj.isThrownProjectile && obj.isGrounded && speed < 65) {
    obj.isThrownProjectile = false;
    obj.thrower = null;
    obj.throwHitSet.clear();
  }

  // 9. Decay visual squash & hit flash, and update 2.5D depth layer (`z = y`)
  if (typeof obj.squashFactor === "number" && !isNaN(obj.squashFactor)) {
    obj.squashFactor = lerp(obj.squashFactor, 0, Math.min(1, 10 * delta));
  } else {
    obj.squashFactor = 0;
  }
  obj.hitFlashTimer = Math.max(0, (obj.hitFlashTimer || 0) - delta);
  updateDepthSort(obj);
}

/**
 * Resolves 2.5D elastic collisions between all pairs of physics objects,
 * transferring momentum accurately based on each object's `mass` and `bounce`!
 */
function resolveObjectToObjectCollisions(objects, camera = null) {
  for (let i = 0; i < objects.length; i++) {
    const a = objects[i];
    if (a.isCarried || a.isFallingInVoid || a.isExplodedCooldown || a.isWaitingToDrop) continue;

    for (let j = i + 1; j < objects.length; j++) {
      const b = objects[j];
      if (b.isCarried || b.isFallingInVoid || b.isExplodedCooldown || b.isWaitingToDrop) continue;

      // Check vertical height (zHeight) overlap
      if (
        a.zHeight > b.zHeight + b.propHeight ||
        b.zHeight > a.zHeight + a.propHeight
      ) {
        continue;
      }

      // Check 2.5D elliptical ground distance
      const dx = b.pos.x - a.pos.x;
      const dy = (b.pos.y - a.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
      const dist = Math.hypot(dx, dy);
      const minDist = a.footprintRadius + b.footprintRadius;

      if (dist < minDist && dist > 0.001) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        // Inverse mass weighting (lighter objects get pushed more than heavier ones!)
        const invMassA = 1 / a.mass;
        const invMassB = 1 / b.mass;
        const totalInvMass = invMassA + invMassB;

        // 1. Separate overlapping footprints
        a.pos.x -= nx * overlap * (invMassA / totalInvMass);
        a.pos.y -=
          ny *
          overlap *
          (invMassA / totalInvMass) *
          ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

        b.pos.x += nx * overlap * (invMassB / totalInvMass);
        b.pos.y +=
          ny *
          overlap *
          (invMassB / totalInvMass) *
          ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

        // 2. Elastic velocity impulse exchange
        const relVelX = b.velocity.x - a.velocity.x;
        const relVelY =
          (b.velocity.y - a.velocity.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
        const velAlongNormal = relVelX * nx + relVelY * ny;

        // Only bounce if moving toward each other
        if (velAlongNormal < 0) {
          const restitution = Math.max(a.bounce, b.bounce, 0.42);
          const impulse =
            (-(1 + restitution) * velAlongNormal) / totalInvMass;

          a.velocity.x -= impulse * invMassA * nx;
          a.velocity.y -=
            impulse * invMassA * ny * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

          b.velocity.x += impulse * invMassB * nx;
          b.velocity.y +=
            impulse * invMassB * ny * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

          a.squashFactor = 0.22;
          b.squashFactor = 0.22;

          // Phase 8: High-impact thrown projectile chain-reaction crash VFX!
          const thrownObj = a.isThrownProjectile
            ? a
            : b.isThrownProjectile
            ? b
            : null;
          const otherObj = thrownObj === a ? b : a;

          if (
            thrownObj &&
            otherObj &&
            !thrownObj.throwHitSet.has(otherObj) &&
            Math.abs(velAlongNormal) > 85
          ) {
            thrownObj.throwHitSet.add(otherObj);
            otherObj.velZ = Math.max(otherObj.velZ, 165 / Math.sqrt(otherObj.mass));
            otherObj.isGrounded = false;
            otherObj.hitFlashTimer = 0.14;
            // Camera shake ONLY for Heavy Box impacts!
            if (camera && thrownObj.objectType === "heavyBox") {
              camera.shake(6.0);
            }
            spawnHitImpactVFX(
              (a.pos.x + b.pos.x) * 0.5,
              (a.pos.y + b.pos.y) * 0.5,
              Math.max(a.zHeight, b.zHeight) + 20,
              "CRASH!"
            );
          }
        }
      }
    }
  }
}

/**
 * Resolves solid 2.5D footprint collisions between Physics Objects (Crates,
 * Balls, Heavy Boxes) and Arena Props (Crystal Orb Stands & Sparring Dummy).
 * Guarantees that Heavy Boxes and Crates can NEVER merge into the Orb Stands!
 */
function resolveObjectToPropCollisions(objects, props, camera = null) {
  if (!props || props.length === 0) return;

  for (const obj of objects) {
    if (obj.isCarried || obj.isFallingInVoid || obj.isExplodedCooldown || obj.isWaitingToDrop) continue;

    for (const prop of props) {
      if (prop.isFallingInVoid) continue;

      const propZ = prop.zHeight || 0;
      const propH = prop.propHeight || 55;

      // Check vertical 3D overlap
      if (
        obj.zHeight > propZ + propH - 4 ||
        propZ > obj.zHeight + obj.propHeight - 4
      ) {
        continue;
      }

      const dx = obj.pos.x - prop.pos.x;
      const dy = (obj.pos.y - prop.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
      const dist = Math.hypot(dx, dy);
      // Add a +3px visual buffer so rectangular crates/heavy boxes never visually clip the orb stand
      const minDist = obj.footprintRadius + prop.footprintRadius + 3;

      if (dist < minDist && dist > 0.001) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        const isMovableDummy = Boolean(prop.velocity);
        const objSpeed = Math.hypot(
          obj.velocity.x,
          obj.velocity.y / ARENA_CONFIG.PERSPECTIVE_Y_SCALE
        );

        if (isMovableDummy) {
          // Split separation between the physics object and the movable Sparring Dummy
          obj.pos.x += nx * overlap * 0.5;
          obj.pos.y +=
            ny * overlap * 0.5 * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

          prop.pos.x -= nx * overlap * 0.5;
          prop.pos.y -=
            ny * overlap * 0.5 * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

          // Phase 8: High-impact thrown projectile hit on the Sparring Dummy!
          if (
            obj.isThrownProjectile &&
            !obj.throwHitSet.has(prop) &&
            objSpeed > 65
          ) {
            obj.throwHitSet.add(prop);

            // Launch dummy in the direction the thrown object was travelling!
            const hitDirX = -nx;
            const hitDirY = -ny;
            const knockbackSpeed =
              (290 + objSpeed * 0.65) * Math.sqrt(obj.mass);

            prop.velocity.x = hitDirX * knockbackSpeed;
            prop.velocity.y =
              hitDirY * knockbackSpeed * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
            prop.velZ = 235 * Math.sqrt(obj.mass * 0.75);
            prop.isGrounded = false;
            prop.hitFlashTimer = 0.20;
            prop.wobbleAngle = (hitDirX >= 0 ? 1 : -1) * 38;
            prop.totalHitsTaken = (prop.totalHitsTaken || 0) + 1;

            // Ricochet the thrown object upward slightly on impact
            obj.velocity.x *= -0.35;
            obj.velocity.y *= -0.35;
            obj.velZ = 150;
            obj.isGrounded = false;
            obj.squashFactor = 0.30;
            obj.hitFlashTimer = 0.14;

            // Camera shake ONLY for Heavy Box!
            if (camera && obj.objectType === "heavyBox") {
              camera.shake(9.0);
            }

            const impactWord =
              obj.objectType === "heavyBox"
                ? "CRUSH!"
                : obj.objectType === "ball"
                ? "BONK!"
                : "SMASH!";

            spawnHitImpactVFX(
              prop.pos.x,
              prop.pos.y,
              (prop.zHeight || 0) + 28,
              impactWord
            );
          } else if (objSpeed > 60) {
            // Normal sliding/bumping momentum transfer
            prop.velocity.x -= nx * objSpeed * 0.55 * obj.mass;
            prop.velocity.y -=
              ny *
              objSpeed *
              0.55 *
              obj.mass *
              ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
            prop.wobbleAngle = (nx <= 0 ? 1 : -1) * 28;
          }
        } else {
          // Static Crystal Orb Stand: push the physics object 100% outside the stand!
          obj.pos.x += nx * overlap;
          obj.pos.y += ny * overlap * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

          // If a thrown projectile slams into the Crystal Orb Stand, ring the orb!
          if (
            obj.isThrownProjectile &&
            !obj.throwHitSet.has(prop) &&
            objSpeed > 75
          ) {
            obj.throwHitSet.add(prop);
            if (typeof prop.onPunchHit === "function") {
              prop.onPunchHit(vec2(-nx, -ny), objSpeed);
            }
            // Camera shake ONLY for Heavy Box!
            if (camera && obj.objectType === "heavyBox") {
              camera.shake(6.0);
            }
            spawnHitImpactVFX(
              prop.pos.x,
              prop.pos.y,
              32,
              "CLANG!"
            );
          }

          // Bounce/deflect the object's velocity off the solid stone pedestal
          const velX = obj.velocity.x;
          const velY = obj.velocity.y / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
          const velAlongNormal = velX * nx + velY * ny;

          if (velAlongNormal < 0) {
            const restitution = Math.max(0.35, obj.bounce);
            obj.velocity.x =
              velX - (1 + restitution) * velAlongNormal * nx;
            obj.velocity.y =
              (velY - (1 + restitution) * velAlongNormal * ny) *
              ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
            obj.squashFactor = 0.2;
          }
        }
      }
    }
  }
}

/**
 * Phase 10: Resolves solid 2.5D body collisions between fighters (Volt vs Pyro AI)
 * so they cannot walk through each other and can body-check near the cliff rim!
 */
export function resolveFighterToFighterCollisions(fighterList) {
  for (let i = 0; i < fighterList.length; i++) {
    const a = fighterList[i];
    if (!a || a.isFallingInVoid) continue;

    for (let j = i + 1; j < fighterList.length; j++) {
      const b = fighterList[j];
      if (!b || b.isFallingInVoid) continue;

      if (Math.abs((a.zHeight || 0) - (b.zHeight || 0)) > 46) continue;

      const dx = b.pos.x - a.pos.x;
      const dy = (b.pos.y - a.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
      const dist = Math.hypot(dx, dy);
      const minDist = PLAYER_CONFIG.FOOTPRINT_RADIUS * 2;

      if (dist < minDist && dist > 0.001) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = (minDist - dist) * 0.5;

        a.pos.x -= nx * overlap;
        a.pos.y -= ny * overlap * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

        b.pos.x += nx * overlap;
        b.pos.y += ny * overlap * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
      }
    }
  }
}

/**
 * Resolves Fighter-vs-Object pushing AND Thrown Projectile-vs-Fighter impacts!
 */
export function resolvePlayerToObjectInteractions(
  player,
  objects,
  camera = null,
  isGuestClient = false
) {
  for (const obj of objects) {
    if (obj.isCarried || obj.isFallingInVoid || obj.isExplodedCooldown || obj.isWaitingToDrop) continue;

    // Allow the fighter to jump clean OVER the object if zHeight > object's top!
    if (player.zHeight > obj.zHeight + obj.propHeight - 8) continue;

    const dx = obj.pos.x - player.pos.x;
    const dy = (obj.pos.y - player.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
    const dist = Math.hypot(dx, dy);
    const minDist = PLAYER_CONFIG.FOOTPRINT_RADIUS + obj.footprintRadius;

    if (dist < minDist && dist > 0.001) {
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;

      const objSpeed = Math.hypot(
        obj.velocity.x,
        obj.velocity.y / ARENA_CONFIG.PERSPECTIVE_Y_SCALE
      );

      // Phase 8 & 10: Check if `obj` is a live THROWN PROJECTILE hitting an opponent fighter!
      if (
        obj.isThrownProjectile &&
        obj.thrower !== player &&
        !obj.throwHitSet.has(player) &&
        objSpeed > 65
      ) {
        obj.throwHitSet.add(player);

        // Special case: Slime Sticky Bomb glues directly onto the fighter instead of bouncing off!
        if (obj.objectType === "stickyBomb") {
          obj.stuckToTarget = player;
          obj.isStuckToFloor = false;
          obj.isThrownProjectile = false;
          obj.velocity = vec2(0, 0);
          obj.velZ = 0;
          obj.isGrounded = false;
          if (typeof obj.ignite === "function") obj.ignite();
          player.hitFlashTimer = 0.16;
          spawnHitImpactVFX(
            player.pos.x,
            player.pos.y,
            (player.zHeight || 0) + 28,
            "STUCK!!"
          );
          continue;
        }

        // Knock the fighter in the direction the projectile was flying!
        const hitDirX = -nx;
        const hitDirY = -ny;
        const dmg = obj.damage || 25;
        player.health = Math.max(0, (player.health || 100) - dmg);
        player.hitFlashTimer = 0.20;
        player.landingSquash = 0.38;

        const lowHpBoost = 1 + (1 - player.health / (player.maxHealth || 100)) * 0.45;
        const knockForce =
          (285 + objSpeed * 0.65) * Math.sqrt(obj.mass || 1.0) * lowHpBoost;

        player.knockback.x = hitDirX * knockForce;
        player.knockback.y =
          hitDirY * knockForce * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
        player.velZ = 225 * Math.sqrt((obj.mass || 1.0) * 0.75);
        player.isGrounded = false;

        // Ricochet the projectile off the hit fighter
        obj.velocity.x *= -0.35;
        obj.velocity.y *= -0.35;
        obj.velZ = 150;
        obj.isGrounded = false;
        obj.squashFactor = 0.30;
        obj.hitFlashTimer = 0.14;

        // Camera shake ONLY when hit by a Heavy Box!
        if (camera && obj.objectType === "heavyBox") {
          camera.shake(9.0);
        }

        const impactWord =
          obj.objectType === "heavyBox"
            ? "CRUSH!"
            : obj.objectType === "ball"
            ? "BONK!"
            : "SMASH!";

        spawnHitImpactVFX(
          player.pos.x,
          player.pos.y,
          (player.zHeight || 0) + 28,
          impactWord
        );
        continue;
      }

      // Skip grounded pushing if the object is glued to a fighter/floor or is an armed landmine!
      if (
        obj.stuckToTarget ||
        obj.isStuckToFloor ||
        (obj.objectType === "mine" && obj.isArmed)
      ) {
        continue;
      }

      // Guest Client Optimization: Only push the local player out of the object footprint.
      // Do NOT modify obj.pos or obj.velocity locally on Guest, preventing fighting against
      // Host-authoritative 15Hz snapshots (which causes object glitching/jitter)!
      if (isGuestClient) {
        player.pos.x -= nx * overlap;
        player.pos.y -= ny * overlap * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
        continue;
      }

      // On Host for a Remote Human player: Remote player position is interpolated from network.
      // Push the object authoritatively, but do not fight against the remote player's stream!
      if (player.isRemoteHuman) {
        obj.pos.x += nx * overlap;
        obj.pos.y += ny * overlap * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
        const pushSpeed = Math.hypot(
          player.velocity.x,
          player.velocity.y / ARENA_CONFIG.PERSPECTIVE_Y_SCALE
        );
        if (pushSpeed > 15) {
          const transfer = (pushSpeed * 0.36) / obj.mass;
          obj.velocity.x = nx * transfer;
          obj.velocity.y = ny * transfer * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
        }
        continue;
      }

      // Standard grounded pushing interaction (Host local player or AI bots)
      const objectYield = clamp(1 / (0.6 + obj.mass), 0.22, 0.78);
      const playerYield = 1 - objectYield;

      player.pos.x -= nx * overlap * playerYield;
      player.pos.y -=
        ny * overlap * playerYield * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

      obj.pos.x += nx * overlap * objectYield;
      obj.pos.y +=
        ny * overlap * objectYield * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

      const pushSpeed = Math.hypot(
        player.velocity.x,
        player.velocity.y / ARENA_CONFIG.PERSPECTIVE_Y_SCALE
      );
      if (pushSpeed > 20) {
        const transfer = (pushSpeed * 0.36) / obj.mass;
        obj.velocity.x = nx * transfer;
        obj.velocity.y = ny * transfer * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
      }
    }
  }
}
