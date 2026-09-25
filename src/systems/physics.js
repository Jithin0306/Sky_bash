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

/**
 * Steps the entire 2.5D object physics simulation for the current frame.
 *
 * @param {Object} player - The playable character
 * @param {Array<Object>} objects - Array of active physics objects in the arena
 * @param {Object} camera - Arena camera controller (for heavy landing shakes)
 * @param {Function} [onRingOut] - Optional callback when an object falls off the cliff
 */
export function updatePhysicsSystem(
  player,
  objects,
  props = [],
  camera = null
) {
  const delta = dt();

  // 1. Update each individual object's motion, gravity, bounce, & cliff fall
  for (const obj of objects) {
    updateSingleObjectPhysics(obj, delta, camera);
  }

  // 2. Resolve Object-vs-Object 2.5D elastic collisions (mass-weighted!)
  resolveObjectToObjectCollisions(objects);

  // 3. Resolve Object-vs-ArenaProp collisions (so Heavy Boxes, Crates, & Balls
  //    bounce/slide solidly around the Crystal Orb Stands & Sparring Dummy!)
  resolveObjectToPropCollisions(objects, props);

  // 4. Resolve Player-vs-Object pushing & footprint collisions
  if (player && !player.isFallingInVoid) {
    resolvePlayerToObjectInteractions(player, objects);
    // Re-check Object-vs-Prop after player pushing so the player can NEVER
    // wedge or shove a Heavy Box inside a Crystal Orb Stand!
    resolveObjectToPropCollisions(objects, props);
  }
}

/**
 * Updates a single physics object's velocity, bounce, rolling angle, and ground state.
 */
function updateSingleObjectPhysics(obj, delta, camera, onRingOut) {
  // If carried in a player's hands (Milestone 7), skip normal floor physics
  if (obj.isCarried) {
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

        // Bounce back into the air if impactSpeed is high enough!
        if (impactSpeed > 95 && obj.bounce > 0.15) {
          obj.velZ = impactSpeed * obj.bounce;
          obj.squashFactor = 0.28;
        } else {
          obj.velZ = 0;
          obj.isGrounded = true;
          obj.squashFactor = 0.2;
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

  // 7. Respawn from the sky if fallen deep into the abyss
  if (obj.zHeight < PLAYER_CONFIG.ABYSS_RESPAWN_Z) {
    obj.respawnFromSky();
  }

  // 8. Decay visual squash & hit flash, and update 2.5D depth layer (`z = y`)
  obj.squashFactor = lerp(obj.squashFactor, 0, Math.min(1, 10 * delta));
  obj.hitFlashTimer = Math.max(0, obj.hitFlashTimer - delta);
  updateDepthSort(obj);
}

/**
 * Resolves 2.5D elastic collisions between all pairs of physics objects,
 * transferring momentum accurately based on each object's `mass` and `bounce`!
 */
function resolveObjectToObjectCollisions(objects) {
  for (let i = 0; i < objects.length; i++) {
    const a = objects[i];
    if (a.isCarried || a.isFallingInVoid) continue;

    for (let j = i + 1; j < objects.length; j++) {
      const b = objects[j];
      if (b.isCarried || b.isFallingInVoid) continue;

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
          const restitution = Math.max(a.bounce, b.bounce, 0.35);
          const impulse =
            (-(1 + restitution) * velAlongNormal) / totalInvMass;

          a.velocity.x -= impulse * invMassA * nx;
          a.velocity.y -=
            impulse * invMassA * ny * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

          b.velocity.x += impulse * invMassB * nx;
          b.velocity.y +=
            impulse * invMassB * ny * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

          a.squashFactor = 0.18;
          b.squashFactor = 0.18;
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
function resolveObjectToPropCollisions(objects, props) {
  if (!props || props.length === 0) return;

  for (const obj of objects) {
    if (obj.isCarried || obj.isFallingInVoid) continue;

    for (const prop of props) {
      if (prop.isFallingInVoid) continue;

      const propZ = prop.zHeight || 0;
      const propH = prop.propHeight || 55;

      // Check vertical 3D overlap
      if (
        obj.zHeight > propZ + propH - 6 ||
        propZ > obj.zHeight + obj.propHeight - 6
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

        if (isMovableDummy) {
          // Split separation between the physics object and the movable Sparring Dummy
          obj.pos.x += nx * overlap * 0.5;
          obj.pos.y +=
            ny * overlap * 0.5 * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

          prop.pos.x -= nx * overlap * 0.5;
          prop.pos.y -=
            ny * overlap * 0.5 * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

          // Transfer momentum if a fast object slams into the Sparring Dummy!
          const objSpeed = Math.hypot(
            obj.velocity.x,
            obj.velocity.y / ARENA_CONFIG.PERSPECTIVE_Y_SCALE
          );
          if (objSpeed > 80) {
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

          // Bounce/deflect the object's velocity off the solid stone pedestal
          const velX = obj.velocity.x;
          const velY = obj.velocity.y / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
          const velAlongNormal = velX * nx + velY * ny;

          if (velAlongNormal < 0) {
            const restitution = Math.max(0.35, obj.bounce);
            obj.velocity.x =
              (velX - (1 + restitution) * velAlongNormal * nx);
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
 * Resolves Player-vs-Object pushing and collision:
 * - Light objects (Ball, mass 0.45) get dribbled/kicked briskly when you run into them!
 * - Medium objects (Crate, mass 1.0) slide steadily when pushed!
 * - Heavy objects (Heavy Box, mass 2.6) strongly resist pushing!
 */
function resolvePlayerToObjectInteractions(player, objects) {
  for (const obj of objects) {
    if (obj.isCarried || obj.isFallingInVoid) continue;

    // Allow the player to jump clean OVER the object if zHeight > object's top!
    if (player.zHeight > obj.zHeight + obj.propHeight - 8) continue;

    const dx = obj.pos.x - player.pos.x;
    const dy = (obj.pos.y - player.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
    const dist = Math.hypot(dx, dy);
    const minDist = PLAYER_CONFIG.FOOTPRINT_RADIUS + obj.footprintRadius;

    if (dist < minDist && dist > 0.001) {
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;

      // How much the object yields vs how much the player is stopped (based on mass)
      const objectYield = clamp(1 / (0.6 + obj.mass), 0.22, 0.78);
      const playerYield = 1 - objectYield;

      // Separate positions
      player.pos.x -= nx * overlap * playerYield;
      player.pos.y -=
        ny * overlap * playerYield * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

      obj.pos.x += nx * overlap * objectYield;
      obj.pos.y +=
        ny * overlap * objectYield * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

      // Transfer push velocity from the running player into the object (scaled by 1/mass)
      const pushSpeed = Math.hypot(
        player.velocity.x,
        player.velocity.y / ARENA_CONFIG.PERSPECTIVE_Y_SCALE
      );
      if (pushSpeed > 20) {
        const transfer = (pushSpeed * 0.68) / obj.mass;
        obj.velocity.x = nx * transfer;
        obj.velocity.y = ny * transfer * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
      }
    }
  }
}
