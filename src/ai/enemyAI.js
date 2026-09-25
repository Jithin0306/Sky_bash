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
 * Complete 6-Fighter Roster for 1v1, 2v2 Teams, and 3-to-6 Player Free-For-All!
 */
export const FIGHTER_ROSTER = [
  {
    slot: 0,
    name: "VOLT",
    ringColor: [28, 175, 245],
    uiColor: [85, 235, 255],
    palette: null, // Uses default Volt Electric-Cyan palette
  },
  {
    slot: 1,
    name: "PYRO",
    ringColor: [235, 62, 55],
    uiColor: [255, 105, 95],
    palette: PYRO_BOT_PALETTE,
  },
  {
    slot: 2,
    name: "BLITZ",
    ringColor: [245, 190, 32],
    uiColor: [255, 225, 85],
    palette: {
      SHADOW: [8, 10, 20],
      BOOTS: [42, 36, 24],
      BOOT_SOLE: [255, 240, 120],
      LEGS: [232, 225, 210],
      BODY_MAIN: [235, 165, 22],
      BODY_TRIM: [255, 242, 135],
      HEAD: [248, 244, 230],
      VISOR: [28, 24, 14],
      VISOR_GLOW: [255, 235, 75],
      GLOVES: [255, 195, 35],
      SCARF: [255, 240, 95],
    },
  },
  {
    slot: 3,
    name: "NOVA",
    ringColor: [38, 215, 125],
    uiColor: [95, 255, 165],
    palette: {
      SHADOW: [8, 10, 20],
      BOOTS: [24, 45, 36],
      BOOT_SOLE: [125, 255, 185],
      LEGS: [215, 235, 225],
      BODY_MAIN: [28, 182, 102],
      BODY_TRIM: [135, 255, 195],
      HEAD: [235, 248, 240],
      VISOR: [14, 28, 22],
      VISOR_GLOW: [75, 255, 165],
      GLOVES: [45, 225, 135],
      SCARF: [115, 255, 185],
    },
  },
  {
    slot: 4,
    name: "VORTEX",
    ringColor: [168, 68, 245],
    uiColor: [210, 135, 255],
    palette: {
      SHADOW: [8, 10, 20],
      BOOTS: [38, 24, 52],
      BOOT_SOLE: [225, 145, 255],
      LEGS: [228, 218, 238],
      BODY_MAIN: [142, 48, 222],
      BODY_TRIM: [225, 155, 255],
      HEAD: [242, 235, 250],
      VISOR: [22, 14, 34],
      VISOR_GLOW: [215, 95, 255],
      GLOVES: [185, 75, 255],
      SCARF: [225, 135, 255],
    },
  },
  {
    slot: 5,
    name: "TITAN",
    ringColor: [255, 118, 32],
    uiColor: [255, 165, 85],
    palette: {
      SHADOW: [8, 10, 20],
      BOOTS: [48, 30, 22],
      BOOT_SOLE: [255, 185, 95],
      LEGS: [232, 222, 215],
      BODY_MAIN: [235, 95, 25],
      BODY_TRIM: [255, 205, 115],
      HEAD: [246, 238, 232],
      VISOR: [32, 18, 14],
      VISOR_GLOW: [255, 142, 55],
      GLOVES: [255, 115, 35],
      SCARF: [255, 175, 75],
    },
  },
];

/**
 * Helper to select the closest living enemy fighter (respecting 2v2 teams!).
 */
function selectBestOpponent(bot, targetOrFighters) {
  if (!Array.isArray(targetOrFighters)) {
    return targetOrFighters;
  }
  let bestTarget = null;
  let bestDist = Infinity;

  for (const f of targetOrFighters) {
    if (!f || f === bot) continue;
    if (f.isFallingInVoid || f.isEliminated || (f.lives !== undefined && f.lives <= 0)) {
      continue;
    }
    // In 2v2 Team Battle, never target a teammate on the same team!
    if (bot.team && bot.team !== "none" && f.team === bot.team) {
      continue;
    }
    const dx = f.pos.x - bot.pos.x;
    const dy = (f.pos.y - bot.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
    const d = Math.hypot(dx, dy);
    if (d < bestDist) {
      bestDist = d;
      bestTarget = f;
    }
  }
  return bestTarget || targetOrFighters[0];
}

/**
 * Creates an autonomous AI controller for an enemy `Player` entity.
 *
 * @param {Object} bot - The KAPLAY `Player` entity controlled by AI
 * @param {Object|Array<Object>} targetOrFighters - Single target player OR array of all fighters
 * @param {Array<Object>} physicsObjects - Array of arena physics objects & bombs
 */
export function createEnemyAIController(bot, targetOrFighters, physicsObjects) {
  let strafePhase = rand(0, Math.PI * 2);
  let actionCooldown = 0.35;
  let fighterGrabCooldown = 5.5;
  let holdTimer = 0;

  return {
    enabled: true,

    /**
     * Computes the single-frame `inputState` for `bot`.
     */
    computeInput(delta) {
      const targetPlayer = selectBestOpponent(bot, targetOrFighters);
      const emptyInput = {
        moveX: 0,
        moveY: 0,
        isMoving: false,
        sprintHeld: false,
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

      if (bot.isCarried) {
        bot.aiStateLabel = "GRABBED! STRUGGLING!";
        return emptyInput;
      }

      strafePhase += delta * 2.6;
      actionCooldown = Math.max(0, actionCooldown - delta);
      fighterGrabCooldown = Math.max(0, fighterGrabCooldown - delta);

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
      // PRIORITY 2: EVADE LIVE BOMBS, STICKY BOMBS, & ARMED LANDMINES!
      // ----------------------------------------------------------------------
      let nearestDangerBomb = null;
      let nearestBombDist = 175; // Safe buffer outside the blast/trigger radius!
      let stuckWithStickyBomb = false;

      for (const obj of physicsObjects) {
        if (obj.stuckToTarget === bot && obj.isLit) {
          stuckWithStickyBomb = true;
          continue;
        }
        const isDangerExplosive =
          (obj.objectType === "bomb" && obj.isLit) ||
          (obj.objectType === "stickyBomb" &&
            obj.isLit &&
            obj.stuckToTarget !== targetPlayer) ||
          (obj.objectType === "mine" && (obj.isArmed || obj.isTriggered));

        if (
          isDangerExplosive &&
          !obj.isCarried &&
          !obj.isExplodedCooldown &&
          !obj.isFallingInVoid &&
          !obj.isWaitingToDrop
        ) {
          const bdx = bot.pos.x - obj.pos.x;
          const bdy =
            (bot.pos.y - obj.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
          const bDist = Math.hypot(bdx, bdy);
          const dangerThreshold =
            obj.objectType === "mine" && !obj.isTriggered ? 118 : 175;
          if (bDist < dangerThreshold && bDist < nearestBombDist) {
            nearestBombDist = bDist;
            nearestDangerBomb = obj;
          }
        }
      }

      if (nearestDangerBomb) {
        bot.aiStateLabel =
          nearestDangerBomb.objectType === "mine"
            ? "AVOID LANDMINE!"
            : "DODGE BOMB!";
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
          jumpPressed:
            bot.isGrounded && (nearestDangerBomb.fuseTimer || 2.0) < 0.7,
        };
      }

      // Measure 2.5D vector & distance from Pyro to Volt
      const toPlayerX = targetPlayer.pos.x - bot.pos.x;
      const toPlayerY =
        (targetPlayer.pos.y - bot.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
      const distToPlayer = Math.hypot(toPlayerX, toPlayerY) || 1;
      const dirToPlayerX = toPlayerX / distToPlayer;
      const dirToPlayerY = toPlayerY / distToPlayer;

      // If a Sticky Bomb is glued to Pyro, Pyro panics and chases Volt to share the blast!
      if (stuckWithStickyBomb) {
        bot.aiStateLabel = "STUCK! SHARE BLAST!";
        return {
          ...emptyInput,
          moveX: dirToPlayerX,
          moveY: dirToPlayerY,
          isMoving: true,
        };
      }

      // ----------------------------------------------------------------------
      // PRIORITY 3: AIM & THROW WHEN CARRYING AN OBJECT, BOMB, STICKY, MINE, OR FIGHTER!
      // ----------------------------------------------------------------------
      if (bot.heldObject) {
        // Special case: Pyro is carrying VOLT overhead! March toward the nearest cliff edge and throw him into the Void!
        if (bot.heldObject.objectType === "fighter") {
          bot.aiStateLabel = "THROW VOLT TO VOID!";
          const outX = bot.pos.x - ARENA_CONFIG.CENTER_X;
          const outY =
            (bot.pos.y - ARENA_CONFIG.CENTER_Y) /
            ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
          const outLen = Math.hypot(outX, outY) || 1;
          const rimDirX = outLen > 5 ? outX / outLen : 1;
          const rimDirY = outLen > 5 ? outY / outLen : 0;

          if (
            (distFromCenter >= ARENA_CONFIG.RADIUS * 0.64 && holdTimer > 0.75) ||
            holdTimer > 2.1
          ) {
            bot.facing.x = rimDirX;
            bot.facing.y = rimDirY;
            actionCooldown = 0.75;
            fighterGrabCooldown = 8.5;
            return {
              ...emptyInput,
              moveX: rimDirX,
              moveY: rimDirY,
              isMoving: true,
              throwPressed: true,
            };
          }

          return {
            ...emptyInput,
            moveX: rimDirX,
            moveY: rimDirY,
            isMoving: true,
          };
        }

        bot.aiStateLabel = `AIM ${bot.heldObject.objectType.toUpperCase()}`;

        const isHoldingExplosive =
          bot.heldObject.objectType === "bomb" ||
          bot.heldObject.objectType === "stickyBomb" ||
          bot.heldObject.objectType === "mine";
        const bombUrgent =
          isHoldingExplosive && (bot.heldObject.fuseTimer || 3.5) < 1.85;

        // Check how well Pyro's facing direction is aligned with Volt
        const alignDot =
          bot.facing.x * dirToPlayerX + bot.facing.y * dirToPlayerY;

        let moveX = dirToPlayerX;
        let moveY = dirToPlayerY;

        if (distToPlayer < 115 && !bombUrgent) {
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
      // PRIORITY 4: OPPORTUNISTICALLY GRAB NEARBY ITEMS / BOMBS / STICKIES / MINES
      // ----------------------------------------------------------------------
      if (distToPlayer > 78 && actionCooldown <= 0) {
        let bestItem = null;
        let bestScore = 195; // Max search distance for an item

        for (const obj of physicsObjects) {
          if (
            obj.isCarried ||
            obj.isFallingInVoid ||
            obj.isExplodedCooldown ||
            obj.isWaitingToDrop ||
            obj.isThrownProjectile ||
            obj.stuckToTarget
          ) {
            continue;
          }
          // Don't grab a bomb or sticky bomb that is already about to explode, or an armed landmine!
          if (
            (obj.objectType === "bomb" || obj.objectType === "stickyBomb") &&
            obj.isLit &&
            obj.fuseTimer < 2.2
          ) {
            continue;
          }
          if (
            obj.objectType === "mine" &&
            (obj.isArmed || obj.isTriggered)
          ) {
            continue;
          }
          // Only fetch items safely inside the arena
          if (!isPointOnArena(obj.pos.x, obj.pos.y, 55)) continue;

          const idx = obj.pos.x - bot.pos.x;
          const idy =
            (obj.pos.y - bot.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
          const itemDist = Math.hypot(idx, idy);

          // Prioritize Bombs, Sticky Bombs, and Standby Landmines!
          const isExplosiveItem =
            obj.objectType === "bomb" ||
            obj.objectType === "stickyBomb" ||
            obj.objectType === "mine";
          const priorityBonus = isExplosiveItem ? -28 : 0;
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
      // PRIORITY 5: PACE & BRAWL (Relaxed arcade movement + occasional Fighter Grab!)
      // ----------------------------------------------------------------------
      bot.aiStateLabel = distToPlayer <= 68 ? "MELEE BRAWL!" : "PATROL & CHASE";

      // Take a brief 0.5s breather pause right after swinging or throwing
      if (actionCooldown > 0.35) {
        bot.facing.x = dirToPlayerX;
        bot.facing.y = dirToPlayerY;
        return emptyInput;
      }

      // Add a wide, relaxed strafing circle so Pyro doesn't beeline straight like a hound
      const weave = Math.sin(strafePhase * 0.7) * (distToPlayer > 95 ? 0.52 : 0.2);
      const perpX = -dirToPlayerY;
      const perpY = dirToPlayerX;

      let chaseX = dirToPlayerX + perpX * weave;
      let chaseY = dirToPlayerY + perpY * weave;
      const chaseLen = Math.hypot(chaseX, chaseY) || 1;
      chaseX /= chaseLen;
      chaseY /= chaseLen;

      const inMeleeRange =
        distToPlayer <= 56 &&
        actionCooldown <= 0 &&
        !targetPlayer.isFallingInVoid &&
        !targetPlayer.isCarried &&
        Math.abs((targetPlayer.zHeight || 0) - bot.zHeight) < 38;

      const shouldGrabPlayer =
        inMeleeRange &&
        fighterGrabCooldown <= 0 &&
        bot.nearestPickupCandidate === targetPlayer &&
        (targetPlayer.grabImmunityTimer || 0) <= 0;

      const shouldPunch = inMeleeRange && !shouldGrabPlayer;

      if (shouldGrabPlayer) {
        bot.facing.x = dirToPlayerX;
        bot.facing.y = dirToPlayerY;
        actionCooldown = 0.65;
        fighterGrabCooldown = 8.5;
      } else if (shouldPunch) {
        bot.facing.x = dirToPlayerX;
        bot.facing.y = dirToPlayerY;
        actionCooldown = 0.88; // Generous pause after each punch!
      }

      return {
        ...emptyInput,
        moveX: chaseX,
        moveY: chaseY,
        isMoving: distToPlayer > 52,
        pickupPressed: shouldGrabPlayer,
        punchPressed: shouldPunch,
      };
    },
  };
}
