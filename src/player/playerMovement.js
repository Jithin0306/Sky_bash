// ============================================================================
// src/player/playerMovement.js
// ============================================================================
// Handles 2.5D ground & aerial physics for a Player entity:
// - Smooth ground acceleration & crisp deceleration
// - Air control multiplier while jumping/falling
// - 2.5D vertical jump axis (zHeight & velZ) independent of floor (x, y)
// - Circular arena ground detection (walking or jumping off the edge into the void!)
// - Solid under-platform cliff wall collision while falling
// ============================================================================

import { PLAYER_CONFIG, ARENA_CONFIG, COMBAT_CONFIG } from "../config/gameConfig.js";
import { getArenaDistance, isPointOnArena } from "../scenes/arena.js";
import { sound } from "../systems/sound.js";

/**
 * Helper function that moves `current` toward `target` by at most `maxDelta`.
 */
function moveToward(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }
  return current + Math.sign(target - current) * maxDelta;
}

/**
 * Respawns the player above the center of the circular arena after falling
 * into the abyss (Milestone 13 will hook this into the Round Over system).
 */
export function respawnPlayer(player) {
  if (player.carrier && player.carrier.heldObject === player) {
    player.carrier.heldObject = null;
  }
  player.carrier = null;
  player.isCarried = false;
  player.struggleProgress = 0;
  player.pos.x = player.homePos ? player.homePos.x : ARENA_CONFIG.CENTER_X;
  player.pos.y = player.homePos ? player.homePos.y : ARENA_CONFIG.CENTER_Y;
  player.velocity = vec2(0, 0);
  player.knockback = vec2(0, 0);
  player.zHeight = 220; // Drop in smoothly from the sky!
  player.velZ = 0;
  player.isGrounded = false;
  player.isFallingInVoid = false;
  player.hasTriggeredRingOutBanner = false;
  player.health = player.maxHealth || 100;
  player.stamina = player.maxStamina || PLAYER_CONFIG.MAX_STAMINA;
  player.isStaminaExhausted = false;
  player.state = "fall";
}

/**
 * Updates a player's 2.5D movement, jump height (zHeight), gravity, and
 * circular arena ground detection for a single frame.
 *
 * @param {Object} player - The KAPLAY player entity
 * @param {number} delta - Frame delta time in seconds (from dt())
 */
export function updatePlayerMovement(player, delta) {
  const input = player.input;

  // Reset single-frame event flags (used by camera shake / VFX / sound)
  player.justJumped = false;
  player.justLanded = false;
  player.landImpactSpeed = 0;

  // --------------------------------------------------------------------------
  // 1. HORIZONTAL FLOOR MOVEMENT (X, Y) WITH STAMINA SPRINT & CARRY WEIGHT
  // --------------------------------------------------------------------------
  // Step Stamina drain (when holding Shift + moving) & regeneration
  if (player.maxStamina === undefined) {
    player.maxStamina = PLAYER_CONFIG.MAX_STAMINA;
    player.stamina = PLAYER_CONFIG.MAX_STAMINA;
    player.isStaminaExhausted = false;
    player.staminaRegenDelay = 0;
  }

  const wantsToSprint = Boolean(input.sprintHeld && input.isMoving && player.isGrounded);
  const canSprint = !player.isStaminaExhausted && player.stamina > 0;
  player.isSprinting = wantsToSprint && canSprint;

  if (player.isSprinting) {
    player.stamina = Math.max(
      0,
      player.stamina - PLAYER_CONFIG.STAMINA_DRAIN_RATE * delta
    );
    player.staminaRegenDelay = PLAYER_CONFIG.STAMINA_REGEN_DELAY;
    if (player.stamina <= 0) {
      player.isStaminaExhausted = true;
      player.isSprinting = false;
    }
  } else {
    if (player.staminaRegenDelay > 0) {
      player.staminaRegenDelay = Math.max(0, player.staminaRegenDelay - delta);
    } else {
      player.stamina = Math.min(
        player.maxStamina,
        player.stamina + PLAYER_CONFIG.STAMINA_REGEN_RATE * delta
      );
      if (
        player.isStaminaExhausted &&
        player.stamina >= PLAYER_CONFIG.STAMINA_EXHAUST_RECOVERY
      ) {
        player.isStaminaExhausted = false;
      }
    }
  }

  // Select base speed: 285 when Shift-sprinting with stamina, or 195 normal walking speed!
  const baseMoveSpeed = player.isSprinting
    ? PLAYER_CONFIG.PLAYER_SPRINT_SPEED
    : PLAYER_CONFIG.PLAYER_SPEED;

  const carryMass = player.heldObject ? player.heldObject.mass || 1.0 : 0;
  const carrySpeedMult = 1 / (1 + carryMass * COMBAT_CONFIG.CARRY_MASS_SLOWDOWN);
  const fighterSpeedMult = player.speedMultiplier || 1.0;
  const effectiveSpeed = baseMoveSpeed * carrySpeedMult * fighterSpeedMult;

  const targetVelX = input.moveX * effectiveSpeed;
  const targetVelY =
    input.moveY *
    effectiveSpeed *
    ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

  // Base acceleration or deceleration rate
  let baseRate = input.isMoving
    ? PLAYER_CONFIG.PLAYER_ACCELERATION
    : PLAYER_CONFIG.PLAYER_DECELERATION;

  // While airborne, multiply steering responsiveness by PLAYER_AIR_CONTROL (0.72)
  if (!player.isGrounded) {
    baseRate *= PLAYER_CONFIG.PLAYER_AIR_CONTROL;
  }

  player.velocity.x = moveToward(player.velocity.x, targetVelX, baseRate * delta);
  player.velocity.y = moveToward(player.velocity.y, targetVelY, baseRate * delta);

  // Decay any external knockback velocity using friction
  player.knockback.x = moveToward(
    player.knockback.x,
    0,
    PLAYER_CONFIG.PLAYER_FRICTION * delta
  );
  player.knockback.y = moveToward(
    player.knockback.y,
    0,
    PLAYER_CONFIG.PLAYER_FRICTION * delta
  );

  // Move the player's ground footprint (x, y)
  player.pos.x += (player.velocity.x + player.knockback.x) * delta;
  player.pos.y += (player.velocity.y + player.knockback.y) * delta;

  // --------------------------------------------------------------------------
  // 2. FACING DIRECTION (Snappy Arcade Turn!)
  // --------------------------------------------------------------------------
  if (input.isMoving) {
    // Calculate the dot product between current facing and desired input direction:
    // +1 = same direction, 0 = 90-degree turn, -1 = 180-degree opposite direction
    const dot = player.facing.x * input.moveX + player.facing.y * input.moveY;

    if (dot < -0.15) {
      // If reversing direction (>100 degrees), snap immediately so there is ZERO turn lag!
      player.facing.x = input.moveX;
      player.facing.y = input.moveY;
    } else {
      // For smooth diagonal steering, rotate rapidly at PLAYER_TURN_SPEED (55)
      const turnFactor = Math.min(1, PLAYER_CONFIG.PLAYER_TURN_SPEED * delta);
      player.facing.x = lerp(player.facing.x, input.moveX, turnFactor);
      player.facing.y = lerp(player.facing.y, input.moveY, turnFactor);
    }

    const fLen = Math.hypot(player.facing.x, player.facing.y);
    if (fLen > 0.001) {
      player.facing.x /= fLen;
      player.facing.y /= fLen;
    }
  }

  // --------------------------------------------------------------------------
  // 3. JUMP TRIGGER (SPACE BAR)
  // --------------------------------------------------------------------------
  if (input.jumpPressed && player.isGrounded) {
    player.velZ = PLAYER_CONFIG.PLAYER_JUMP_FORCE;
    player.isGrounded = false;
    player.isFallingInVoid = false;
    player.justJumped = true;
    player.landingSquash = -0.35; // Slight vertical stretch on takeoff!
    sound.playJump();
  }

  // --------------------------------------------------------------------------
  // 4. GRAVITY & GROUND DETECTION ON THE CIRCULAR ARENA
  // --------------------------------------------------------------------------
  // Check if the player's (x, y) footprint is currently inside the circular rim
  const overArena = isPointOnArena(player.pos.x, player.pos.y);
  const wasFalling = Boolean(player.isFallingInVoid);

  // Case A: Player was walking on the ground and stepped past the circular edge!
  if (player.isGrounded && !overArena) {
    player.isGrounded = false;
    player.isFallingInVoid = true;
    player.velZ = -40; // Immediate downward tip off the ledge
  }

  // Case B: Player is in the air (jumping or falling)
  if (!player.isGrounded) {
    // Apply downward gravity to vertical velocity (velZ)
    player.velZ = Math.max(
      PLAYER_CONFIG.TERMINAL_FALL_SPEED,
      player.velZ - PLAYER_CONFIG.PLAYER_GRAVITY * delta
    );

    // Update vertical height above/below the arena floor
    player.zHeight += player.velZ * delta;

    // Did the player fall below the arena surface?
    if (player.zHeight <= 0) {
      if (overArena && !player.isFallingInVoid) {
        // LANDED ON THE ARENA FLOOR!
        player.landImpactSpeed = Math.abs(player.velZ);
        player.zHeight = 0;
        player.velZ = 0;
        player.isGrounded = true;
        player.justLanded = true;
        player.landingSquash = 1.0; // Trigger landing knee-bend/squash!
        sound.playLand(player.landImpactSpeed);
      } else {
        // MISSED THE ARENA! Now plummeting below the platform into the void!
        player.isFallingInVoid = true;
      }
    }
  }

  if (!wasFalling && player.isFallingInVoid) {
    sound.playCliffFall();
  }

  // --------------------------------------------------------------------------
  // 5. SOLID UNDER-ARENA CLIFF WALL COLLISION
  // --------------------------------------------------------------------------
  // Once the player has stepped/fallen past the circular boundary (isFallingInVoid),
  // keep their radial footprint outside the outer golden rim (RADIUS + 26).
  // When falling off the top edge, this lets you see Volt's head and "AAAH!!"
  // bubble sink right behind the back golden rim before the solid arena hides him!
  if (player.isFallingInVoid) {
    const distFromCenter = getArenaDistance(player.pos.x, player.pos.y);
    const cliffWallRadius = ARENA_CONFIG.RADIUS + 26;

    if (distFromCenter < cliffWallRadius && distFromCenter > 0.001) {
      const targetDist = lerp(distFromCenter, cliffWallRadius, Math.min(1, 18 * delta));
      const pushFactor = targetDist / distFromCenter;
      const dx = player.pos.x - ARENA_CONFIG.CENTER_X;
      const dy = player.pos.y - ARENA_CONFIG.CENTER_Y;
      player.pos.x = ARENA_CONFIG.CENTER_X + dx * pushFactor;
      player.pos.y = ARENA_CONFIG.CENTER_Y + dy * pushFactor;
    }
  }

  // --------------------------------------------------------------------------
  // 6. ABYSS RESPAWN CHECK
  // --------------------------------------------------------------------------
  if (player.zHeight < PLAYER_CONFIG.ABYSS_RESPAWN_Z) {
    respawnPlayer(player);
  }

  // --------------------------------------------------------------------------
  // 7. DECAY LANDING SQUASH & UPDATE CHARACTER STATE
  // --------------------------------------------------------------------------
  player.landingSquash = moveToward(player.landingSquash, 0, 5.5 * delta);

  const groundSpeed = Math.hypot(
    player.velocity.x,
    player.velocity.y / ARENA_CONFIG.PERSPECTIVE_Y_SCALE
  );

  if (!player.isGrounded) {
    if (player.velZ > 25) {
      player.state = "jump";
    } else {
      player.state = "fall";
    }
    player.animTimer += delta * 6;
  } else if (player.pickupAnimTimer > 0) {
    player.state = "pickup";
    player.animTimer += delta * 10;
  } else if (player.heldObject) {
    player.state = "carry";
    if (groundSpeed > 15) {
      player.animTimer += delta * (groundSpeed / PLAYER_CONFIG.PLAYER_SPEED) * 14;
    } else {
      player.animTimer += delta * 3.2;
    }
  } else if (groundSpeed > 15) {
    player.state = "run";
    player.animTimer += delta * (groundSpeed / PLAYER_CONFIG.PLAYER_SPEED) * 14;
  } else {
    player.state = "idle";
    player.animTimer += delta * 3.2;
  }
}
