// ============================================================================
// src/ai/enemyAI.js
// ============================================================================
// Phase 10: Autonomous 2.5D Brawler AI Opponent ("PYRO"):
// Feeds standard `{ moveX, moveY, isMoving, jumpPressed, punchPressed,
// pickupPressed, throwPressed, dropPressed }` input snapshots into a `Player`
// entity every frame—proving our multiplayer/AI input architecture!
//
// 5-PRIORITY AI BEHAVIOR TREE:
// 1. CLIFF RECOVERY  : Steer back toward center & jump if near the outer rim.
// 2. DODGE LIVE BOMB : Sprint outside the red blast ring of any ticking bomb.
// 3. AIM & THROW     : When holding an object/bomb, face Volt and hurl it!
// 4. FETCH WEAPON    : Grab nearby unlit Bombs, Crates, Balls, or Heavy Boxes.
// 5. CHASE & BRAWL   : Pursue Volt with strafing weave & throw 1-2 punches!
// ============================================================================

import { ARENA_CONFIG, COMBAT_CONFIG } from "../config/gameConfig.js";
import { getArenaDistance, isPointOnArena } from "../scenes/arena.js";

/**
 * Custom Crimson-Gold & Obsidian color palette for the AI rival ("PYRO").
 */
export const PYRO_BOT_PALETTE = {
  SHADOW: [8, 10, 20],
  BOOTS: [45, 38, 52],          // Dark obsidian steel boots
  BOOT_SOLE: [255, 205, 65],    // Bright gold boot soles
  LEGS: [215, 208, 222],        // Silver-ash greaves
  BODY_MAIN: [212, 42, 52],     // Crimson-red brawler tunic
  BODY_TRIM: [255, 195, 55],    // Molten gold belt & chest trim
  HEAD: [242, 232, 225],        // Warm ivory helmet
  VISOR: [28, 16, 28],          // Dark crimson-black visor glass
  VISOR_GLOW: [255, 75, 55],    // Glowing fiery red visor eyes
  GLOVES: [255, 125, 38],       // Blazing orange-gold boxing gloves
  SCARF: [255, 205, 55],        // Flowing golden-amber battle scarf
};

/**
 * Creates an autonomous AI controller for an enemy `Player` entity.
 *
 * @param {Object} bot - The KAPLAY `Player` entity controlled by AI ("PYRO")
 * @param {Object} targetPlayer - The human player entity ("VOLT")
 * @param {Array<Object>} physicsObjects - Array of arena physics objects & bombs
 */
export function createEnemyAIController(bot, targetPlayer, physicsObjects) {
  let strafePhase = rand(0, Math.PI * 2);
  let actionCooldown = 0.35;
  let holdTimer = 0;

  return {
    enabled: true,

    /**
     * Computes the single-frame `inputState` for `bot`.
     */
    computeInput(delta) {
      const emptyInput = {
        moveX: 0,
        moveY: 0,
        isMoving: false,
        jumpPressed: false,
        punchPressed: false,
        pickupPressed: false,
        throwPressed: false,
        dropPressed: false,
      };

      if (!this.enabled) {
        bot.aiStateLabel = "PAUSED (Press T)";
        return emptyInput;
      }

      if (bot.isFallingInVoid) {
        bot.aiStateLabel = "RING OUT!!";
        return emptyInput;
      }

      strafePhase += delta * 2.6;
      actionCooldown = Math.max(0, actionCooldown - delta);

      if (bot.heldObject) {
        holdTimer += delta;
      } else {
        holdTimer = 0;
      }

      // ----------------------------------------------------------------------
      // PRIORITY 1: CLIFF EDGE RECOVERY (Stay safely inside the circular rim!)
      // ----------------------------------------------------------------------
      const distFromCenter = getArenaDistance(bot.pos.x, bot.pos.y);
      const safeRadius = ARENA_CONFIG.RADIUS * 0.81;

      if (distFromCenter > safeRadius) {
        bot.aiStateLabel = "CLIFF SAVE";
        const toCenterX = ARENA_CONFIG.CENTER_X - bot.pos.x;
        const toCenterY =
          (ARENA_CONFIG.CENTER_Y - bot.pos.y) /
          ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
        const len = Math.hypot(toCenterX, toCenterY) || 1;

        return {
          ...emptyInput,
          moveX: toCenterX / len,
          moveY: toCenterY / len,
          isMoving: true,
          jumpPressed:
            bot.isGrounded && distFromCenter > ARENA_CONFIG.RADIUS * 0.9,
        };
      }

      // ----------------------------------------------------------------------
      // PRIORITY 2: EVADE LIVE TICKING BOMBS ON THE FLOOR
      // ----------------------------------------------------------------------
      let nearestDangerBomb = null;
      let nearestBombDist = 175; // Safe buffer outside the 145px blast radius!

      for (const obj of physicsObjects) {
        if (
          obj.objectType === "bomb" &&
          obj.isLit &&
          !obj.isCarried &&
          !obj.isExplodedCooldown &&
          !obj.isFallingInVoid
        ) {
          const bdx = bot.pos.x - obj.pos.x;
          const bdy =
            (bot.pos.y - obj.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
          const bDist = Math.hypot(bdx, bdy);
          if (bDist < nearestBombDist) {
            nearestBombDist = bDist;
            nearestDangerBomb = obj;
          }
        }
      }

      if (nearestDangerBomb) {
        bot.aiStateLabel = "DODGE BOMB!";
        let awayX = bot.pos.x - nearestDangerBomb.pos.x;
        let awayY =
          (bot.pos.y - nearestDangerBomb.pos.y) /
          ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
        // Blend with vector toward arena center so Pyro never dodges off the cliff!
        const toCenterX = (ARENA_CONFIG.CENTER_X - bot.pos.x) * 0.45;
        const toCenterY =
          ((ARENA_CONFIG.CENTER_Y - bot.pos.y) /
            ARENA_CONFIG.PERSPECTIVE_Y_SCALE) *
          0.45;

        awayX += toCenterX;
        awayY += toCenterY;
        const len = Math.hypot(awayX, awayY) || 1;

        return {
          ...emptyInput,
          moveX: awayX / len,
          moveY: awayY / len,
          isMoving: true,
          jumpPressed: bot.isGrounded && nearestDangerBomb.fuseTimer < 0.7,
        };
      }

      // Measure 2.5D vector & distance from Pyro to Volt
      const toPlayerX = targetPlayer.pos.x - bot.pos.x;
      const toPlayerY =
        (targetPlayer.pos.y - bot.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
      const distToPlayer = Math.hypot(toPlayerX, toPlayerY) || 1;
      const dirToPlayerX = toPlayerX / distToPlayer;
      const dirToPlayerY = toPlayerY / distToPlayer;

      // ----------------------------------------------------------------------
      // PRIORITY 3: AIM & THROW WHEN CARRYING AN OBJECT OR LIVE BOMB
      // ----------------------------------------------------------------------
      if (bot.heldObject) {
        bot.aiStateLabel = `AIM ${bot.heldObject.objectType.toUpperCase()}`;

        const isHoldingBomb = bot.heldObject.objectType === "bomb";
        const bombUrgent =
          isHoldingBomb && (bot.heldObject.fuseTimer || 3.5) < 1.85;

        // Check how well Pyro's facing direction is aligned with Volt
        const alignDot =
          bot.facing.x * dirToPlayerX + bot.facing.y * dirToPlayerY;

        // Desired throw distance (~135px to 245px for our halved throw arc)
        let moveX = dirToPlayerX;
        let moveY = dirToPlayerY;

        if (distToPlayer < 115 && !bombUrgent) {
          // Back up slightly to line up the throw arc while still turning toward Volt
          moveX = dirToPlayerX;
          moveY = dirToPlayerY;
        }

        const inThrowRange = distToPlayer <= 255;
        const readyToThrow =
          holdTimer > 0.32 &&
          actionCooldown <= 0 &&
          ((alignDot > 0.78 && inThrowRange) || bombUrgent || holdTimer > 2.2);

        if (readyToThrow) {
          // Snap facing directly at Volt right before releasing the throw!
          bot.facing.x = dirToPlayerX;
          bot.facing.y = dirToPlayerY;
          actionCooldown = 0.55;
          return {
            ...emptyInput,
            moveX: dirToPlayerX,
            moveY: dirToPlayerY,
            isMoving: true,
            throwPressed: true,
          };
        }

        return {
          ...emptyInput,
          moveX,
          moveY,
          isMoving: true,
        };
      }

      // ----------------------------------------------------------------------
      // PRIORITY 4: OPPORTUNISTICALLY GRAB NEARBY ITEMS / UNLIT BOMBS
      // ----------------------------------------------------------------------
      if (distToPlayer > 78 && actionCooldown <= 0) {
        let bestItem = null;
        let bestScore = 195; // Max search distance for an item

        for (const obj of physicsObjects) {
          if (
            obj.isCarried ||
            obj.isFallingInVoid ||
            obj.isExplodedCooldown ||
            obj.isThrownProjectile
          ) {
            continue;
          }
          // Don't grab a bomb that is already about to explode!
          if (obj.objectType === "bomb" && obj.isLit && obj.fuseTimer < 2.2) {
            continue;
          }
          // Only fetch items safely inside the arena
          if (!isPointOnArena(obj.pos.x, obj.pos.y, 55)) continue;

          const idx = obj.pos.x - bot.pos.x;
          const idy =
            (obj.pos.y - bot.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
          const itemDist = Math.hypot(idx, idy);

          // Slightly prioritize Bombs and Crates
          const priorityBonus = obj.objectType === "bomb" ? -25 : 0;
          if (itemDist + priorityBonus < bestScore) {
            bestScore = itemDist + priorityBonus;
            bestItem = obj;
          }
        }

        if (bestItem) {
          bot.aiStateLabel = `FETCH ${bestItem.objectType.toUpperCase()}`;
          const idx = bestItem.pos.x - bot.pos.x;
          const idy =
            (bestItem.pos.y - bot.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
          const itemDist = Math.hypot(idx, idy) || 1;

          const canGrabNow =
            bot.nearestPickupCandidate &&
            itemDist <= COMBAT_CONFIG.PICKUP_RANGE - 6;

          if (canGrabNow) {
            actionCooldown = 0.35;
          }

          return {
            ...emptyInput,
            moveX: idx / itemDist,
            moveY: idy / itemDist,
            isMoving: true,
            pickupPressed: Boolean(canGrabNow),
          };
        }
      }

      // ----------------------------------------------------------------------
      // PRIORITY 5: CHASE VOLT & BRAWL (MELEE PUNCH COMBOS!)
      // ----------------------------------------------------------------------
      bot.aiStateLabel = distToPlayer <= 62 ? "MELEE BRAWL!" : "CHASE VOLT";

      // Add a natural brawler weave perpendicular to the chase vector
      const weave = Math.sin(strafePhase) * (distToPlayer > 90 ? 0.28 : 0.08);
      const perpX = -dirToPlayerY;
      const perpY = dirToPlayerX;

      let chaseX = dirToPlayerX + perpX * weave;
      let chaseY = dirToPlayerY + perpY * weave;
      const chaseLen = Math.hypot(chaseX, chaseY) || 1;
      chaseX /= chaseLen;
      chaseY /= chaseLen;

      const shouldPunch =
        distToPlayer <= 58 &&
        actionCooldown <= 0 &&
        !targetPlayer.isFallingInVoid &&
        Math.abs((targetPlayer.zHeight || 0) - bot.zHeight) < 38;

      if (shouldPunch) {
        bot.facing.x = dirToPlayerX;
        bot.facing.y = dirToPlayerY;
        actionCooldown = 0.36;
      }

      return {
        ...emptyInput,
        moveX: chaseX,
        moveY: chaseY,
        isMoving: distToPlayer > 34,
        punchPressed: shouldPunch,
      };
    },
  };
}
