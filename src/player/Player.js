// ============================================================================
// src/player/Player.js
// ============================================================================
// Creates a playable character entity ("Volt" — Original 2.5D Sky-Brawler).
//
// ARCHITECTURE NOTE:
// - The Player object holds all state needed for future multiplayer:
//   position, velocity, zHeight, velZ, knockback, health, state, facing, input.
// - Ground shadow stays anchored at (0, 0) on the arena floor while the character
//   body renders at `y = -player.zHeight` to create a true 2.5D jump illusion!
// ============================================================================

import { PLAYER_CONFIG, ARENA_CONFIG, COMBAT_CONFIG } from "../config/gameConfig.js";
import { updatePlayerMovement } from "./playerMovement.js";
import {
  updatePlayerCombat,
  dropHeldObject,
  breakFreeFromCarrier,
} from "./playerCombat.js";
import { isPointOnArena } from "../scenes/arena.js";
import {
  updateDepthSort,
  computeDepthScale,
  drawGroundShadow,
} from "../systems/depthSort.js";
import { drawCrateVisuals } from "../objects/crate.js";
import { drawBallVisuals } from "../objects/ball.js";
import { drawHeavyBoxVisuals } from "../objects/heavyBox.js";
import { drawBombVisuals } from "../objects/bomb.js";
import { drawStickyBombVisuals } from "../objects/stickyBomb.js";
import { drawMineVisuals } from "../objects/mine.js";

/**
 * Spawns a Player or AI Brawler character at the specified (x, y) arena coordinates.
 *
 * @param {number} spawnX - Initial X coordinate on the arena floor
 * @param {number} spawnY - Initial Y coordinate on the arena floor
 * @param {Object} options - Optional overrides (playerId, displayName, colors, ringColor, isAI)
 * @returns {Object} The KAPLAY fighter entity
 */
export function createPlayer(
  spawnX = ARENA_CONFIG.CENTER_X,
  spawnY = ARENA_CONFIG.CENTER_Y,
  options = {}
) {
  // Support calling createPlayer({ x, y, ... }) OR createPlayer(x, y, options)
  if (typeof spawnX === "object" && spawnX !== null) {
    options = spawnX;
    spawnX = typeof options.x === "number" ? options.x : ARENA_CONFIG.CENTER_X;
    spawnY = typeof options.y === "number" ? options.y : ARENA_CONFIG.CENTER_Y;
  }

  const palette = options.colors || options.palette || PLAYER_CONFIG.COLORS;
  const ringColor = options.ringColor || [25, 145, 215];

  const player = add([
    // KAPLAY built-in position component (ground footprint X, Y)
    pos(spawnX, spawnY),
    // Initial z-layer (dynamically updated every frame by updateDepthSort!)
    z(Math.round(spawnY)),
    "player",
    "fighter",
    "punchable",
    "pickupable",
    {
      // --- Multiplayer & AI State Properties (Section 27) ---
      playerId: options.playerId || 1,
      displayName: options.displayName || options.name || "VOLT",
      isAI: Boolean(options.isAI),
      speedMultiplier: options.speedMultiplier ?? 1.0,
      aiStateLabel: "IDLE",
      palette,
      ringColor,
      homePos: vec2(spawnX, spawnY),
      footprintRadius: PLAYER_CONFIG.FOOTPRINT_RADIUS,
      propHeight: 56,
      velocity: vec2(0, 0),
      knockback: vec2(0, 0),
      facing: vec2(0, 1), // Starts facing South (toward the camera)
      health: 100,
      maxHealth: 100,
      lives: 3,
      maxLives: 3,
      ringOutCount: 0,
      hasTriggeredRingOutBanner: false,
      hitFlashTimer: 0,
      squashFactor: 0,
      state: "idle",
      heldObject: null,
      nearestPickupCandidate: null,
      pickupAnimTimer: 0,
      throwAnimTimer: 0,
      animTimer: 0,
      cameraRef: options.camera || null,

      // --- Phase 11: Power-Up Buffs & Spawn Immunity ---
      powerGlovesTimer: 0,
      shieldTimer: 0,
      shieldHp: 0,
      spawnImmunityTimer: 0,

      // --- Fighter Carry & Escape Struggle Properties ---
      objectType: "fighter",
      mass: COMBAT_CONFIG.FIGHTER_CARRY_MASS,
      throwForce: COMBAT_CONFIG.FIGHTER_THROW_FORCE,
      isCarried: false,
      carrier: null,
      struggleProgress: 0,
      grabImmunityTimer: 0,
      isThrownProjectile: false,
      thrower: null,

      // --- Shift Sprint & Stamina System ---
      stamina: PLAYER_CONFIG.MAX_STAMINA,
      maxStamina: PLAYER_CONFIG.MAX_STAMINA,
      staminaRegenDelayTimer: 0,
      isStaminaExhausted: false,
      isSprinting: false,

      // --- Phase 3: 2.5D Vertical Jump & Ground State ---
      zHeight: 0,           // Height in pixels above (>0) or below (<0) the arena floor
      velZ: 0,              // Vertical velocity in pixels/sec
      isGrounded: true,     // True when standing on the circular arena surface
      isFallingInVoid: false, // True when falling past the outer edge of the island
      landingSquash: 0,     // Visual knee-bend/squash factor upon landing
      justJumped: false,
      justLanded: false,
      landImpactSpeed: 0,

      // --- Phase 5: Melee Punch & Combat State ---
      isPunching: false,
      punchTimer: 0,
      punchCooldownTimer: 0,
      punchHand: "right",   // Alternates "left" and "right" for 1-2 combos!
      hitStopTimer: 0,      // Brief 45ms freeze-frame when a heavy hit lands
      hitTargetsThisSwing: new Set(),

      // Input state snapshot fed in each frame (by keyboard OR by enemyAI.js!)
      input: {
        moveX: 0,
        moveY: 0,
        isMoving: false,
        sprintHeld: false,
        jumpPressed: false,
        punchPressed: false,
        pickupPressed: false,
        throwPressed: false,
        dropPressed: false,
      },

      /**
       * Feeds a new input snapshot into this fighter.
       */
      setInput(newInputState) {
        this.input = newInputState;
      },

      /**
       * Phase 10 & 11: Triggered when another fighter's melee punch lands on this character!
       */
      onPunchHit(dir, force, rawDamage = 14) {
        if (
          this.isFallingInVoid ||
          this.isCarried ||
          this.spawnImmunityTimer > 0
        ) {
          return;
        }

        // If carrying an object or another fighter overhead, a direct punch knocks them loose!
        if (this.heldObject) {
          dropHeldObject(this);
        }

        this.hitFlashTimer = 0.16;
        this.landingSquash = 0.35;

        let knockMult = 0.92;
        if (this.shieldTimer > 0 && this.shieldHp > 0) {
          // Energy Shield Bubble absorbs the hit and halves knockback!
          this.shieldHp = Math.max(0, this.shieldHp - rawDamage * 1.4);
          knockMult = 0.42;
          if (this.shieldHp <= 0) {
            this.shieldTimer = 0;
          }
        } else {
          this.health = Math.max(0, this.health - rawDamage);
        }

        // Apply extra knockback boost as health gets lower (arcade brawler style!)
        const lowHpBoost = 1 + (1 - this.health / this.maxHealth) * 0.45;
        const effectiveForce = force * knockMult * lowHpBoost;

        this.knockback.x = dir.x * effectiveForce;
        this.knockback.y =
          dir.y * effectiveForce * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
        this.velZ = 210;
        this.isGrounded = false;
      },

      /**
       * KAPLAY runs update() automatically every frame.
       */
      update() {
        const delta = dt();
        if (this.hitFlashTimer > 0) {
          this.hitFlashTimer = Math.max(0, this.hitFlashTimer - delta);
        }
        if (this.grabImmunityTimer > 0) {
          this.grabImmunityTimer = Math.max(0, this.grabImmunityTimer - delta);
        }
        if (this.powerGlovesTimer > 0) {
          this.powerGlovesTimer = Math.max(0, this.powerGlovesTimer - delta);
        }
        if (this.shieldTimer > 0) {
          this.shieldTimer = Math.max(0, this.shieldTimer - delta);
          if (this.shieldTimer <= 0) {
            this.shieldHp = 0;
          }
        }
        if (this.spawnImmunityTimer > 0) {
          this.spawnImmunityTimer = Math.max(
            0,
            this.spawnImmunityTimer - delta
          );
        }

        // --- CARRIED OVERHEAD STATE (Spam keys to break free out of the carrier's hands!) ---
        if (this.isCarried && this.carrier) {
          if (this.carrier.isFallingInVoid) {
            dropHeldObject(this.carrier);
            return;
          }

          this.pos.x = this.carrier.pos.x;
          this.pos.y = this.carrier.pos.y;
          this.zHeight = this.carrier.zHeight + 56;
          this.velZ = 0;
          this.isGrounded = false;
          this.animTimer += delta * 18; // Fast kicking legs while carried!

          // Recover stamina while being carried
          this.stamina = Math.min(
            this.maxStamina,
            this.stamina + PLAYER_CONFIG.STAMINA_REGEN_RATE * delta
          );

          if (this.isAI) {
            // AI bot steadily struggles to break free (~2.9s to escape if carrier holds too long)
            this.struggleProgress += COMBAT_CONFIG.AI_STRUGGLE_RATE * delta;
          } else {
            // Human player: base struggle + rapid key-spam boost (Space / J / E / K)
            this.struggleProgress += 7 * delta;
            if (
              this.input.jumpPressed ||
              this.input.punchPressed ||
              this.input.pickupPressed ||
              this.input.throwPressed
            ) {
              this.struggleProgress += COMBAT_CONFIG.STRUGGLE_PER_TAP;
            }
          }

          if (this.struggleProgress >= 100) {
            breakFreeFromCarrier(this);
          }

          updateDepthSort(this);
          return;
        }

        // Clear thrown projectile flag once landed
        if (this.isGrounded && this.isThrownProjectile) {
          this.isThrownProjectile = false;
          this.thrower = null;
        }

        // Update combat first (checks punch input, active hitbox, and hit-stop)
        updatePlayerCombat(this, delta, this.cameraRef);

        // Only advance movement physics when not in a 45ms hit-stop freeze frame!
        if (this.hitStopTimer <= 0) {
          updatePlayerMovement(this, delta);
          if (this.isPunching) {
            this.state = "punch";
          }
        }

        // Phase 4: Update 2.5D depth layer (z = pos.y, or -60 behind North cliff)
        updateDepthSort(this);
      },

      /**
       * KAPLAY runs draw() automatically every frame to render the character.
       */
      draw() {
        // When carried overhead, the carrier's drawCarriedObjectVisuals() renders this fighter!
        if (this.isCarried) return;
        drawCharacterVisuals(this, palette, false);
      },
    },
  ]);

  return player;
}

/**
 * Helper to draw a single articulated leg (Hip -> Knee -> Ankle + High-Contrast Boot)
 * so both legs are clearly visible and animate with a lively knee bend & stride.
 */
function drawSingleLeg(hipPos, footPos, kneeBendX, C) {
  const kneePos = vec2(
    (hipPos.x + footPos.x) * 0.5 + kneeBendX,
    (hipPos.y + footPos.y) * 0.5 - 2
  );

  // 1. Dark outer leg outline (for crisp contrast against any floor color)
  drawLine({
    p1: hipPos,
    p2: kneePos,
    width: 10,
    color: rgb(20, 28, 48),
  });
  drawLine({
    p1: kneePos,
    p2: footPos,
    width: 10,
    color: rgb(20, 28, 48),
  });

  // 2. Inner bright silver-white leg pants/greaves
  drawLine({
    p1: hipPos,
    p2: kneePos,
    width: 6,
    color: rgb(...C.LEGS),
  });
  drawLine({
    p1: kneePos,
    p2: footPos,
    width: 6,
    color: rgb(...C.LEGS),
  });

  // Knee cap joint circle
  drawCircle({
    pos: kneePos,
    radius: 3.5,
    color: rgb(...C.LEGS),
  });

  // 3. Chunky Flame-Coral Brawler Boot at the ankle/foot
  const bootWidth = 15;
  const bootHeight = 9;
  drawRect({
    pos: vec2(footPos.x - bootWidth * 0.5, footPos.y - bootHeight + 2),
    width: bootWidth,
    height: bootHeight,
    radius: 4,
    color: rgb(...C.BOOTS),
    outline: { width: 2, color: rgb(24, 20, 32) },
  });

  // 4. Bright Gold/White Boot Sole stripe at the bottom of the shoe
  drawRect({
    pos: vec2(footPos.x - bootWidth * 0.5 + 1, footPos.y - 1),
    width: bootWidth - 2,
    height: 3,
    radius: 1.5,
    color: rgb(...C.BOOT_SOLE),
  });
}

/**
 * Renders the stylized 2.5D character ("Volt" or "Pyro") relative to the player's
 * ground footprint position (0, 0) or overhead inside a carrier's raised hands.
 */
function drawCharacterVisuals(player, C, isRenderedOverhead = false) {
  const isCarrying = Boolean(player.heldObject) && !isRenderedOverhead;
  const isRunning =
    player.state === "run" || (isCarrying && player.input.isMoving);
  const isJumping = player.state === "jump";
  const isFalling = player.state === "fall";
  const isAirborne = !player.isGrounded;
  // When falling off the cliff OR being carried overhead, kick legs & flail!
  const isPanicFall = player.isFallingInVoid || isRenderedOverhead;
  const t = player.animTimer;

  // --------------------------------------------------------------------------
  // A. 2.5D GROUND SHADOW & PLAYER / TEAM RING (skip when rendered overhead in hands)
  // --------------------------------------------------------------------------
  if (!isRenderedOverhead) {
    const overArena = isPointOnArena(player.pos.x, player.pos.y);

    // Draw outer 2v2 Team Halo Ring if in Team Mode ("blue" or "red")
    if (overArena && !player.isFallingInVoid && player.team && player.team !== "none") {
      const isBlueTeam = player.team === "blue";
      const teamColor = isBlueTeam ? rgb(35, 165, 255) : rgb(255, 65, 65);
      pushTransform();
      pushScale(1, ARENA_CONFIG.PERSPECTIVE_Y_SCALE);
      drawCircle({
        pos: vec2(0, 0),
        radius: PLAYER_CONFIG.FOOTPRINT_RADIUS + 8,
        fill: false,
        outline: {
          width: 3.5,
          color: teamColor,
        },
        opacity: 0.9,
      });
      popTransform();
    }

    drawGroundShadow({
      radius: PLAYER_CONFIG.FOOTPRINT_RADIUS,
      zHeight: player.zHeight,
      overArena,
      isFallingInVoid: player.isFallingInVoid,
      ringColor:
        player.team === "blue"
          ? [35, 165, 255]
          : player.team === "red"
          ? [255, 65, 65]
          : player.ringColor || [25, 145, 215],
    });

    // Floating Fighter Name Badge above head (for Multi-Fighter & Online modes)
    if (player.displayTag && !player.isFallingInVoid) {
      const badgeColor =
        player.team === "blue"
          ? rgb(95, 215, 255)
          : player.team === "red"
          ? rgb(255, 115, 115)
          : rgb(...(player.uiColor || [135, 240, 255]));
      const tagW = Math.max(48, player.displayTag.length * 6.5 + 12);
      const tagY = -player.zHeight - 78;
      drawRect({
        pos: vec2(-tagW * 0.5, tagY),
        width: tagW,
        height: 15,
        radius: 4,
        color: rgb(10, 14, 24),
        opacity: 0.78,
        outline: { width: 1.2, color: badgeColor },
      });
      drawText({
        text: player.displayTag,
        pos: vec2(-tagW * 0.5 + 6, tagY + 3),
        size: 9.5,
        color: badgeColor,
      });
    }
  }

  // --------------------------------------------------------------------------
  // B. VERTICAL BODY SHIFT + 2.5D PERSPECTIVE DEPTH SCALING
  // --------------------------------------------------------------------------
  const squashOffsetY = player.landingSquash * 6;
  const runBob = isRunning
    ? -Math.abs(Math.sin(t)) * 5.5
    : isAirborne
    ? 0
    : -Math.sin(t) * 1.5;

  // When falling off the cliff or carried overhead, face the camera so you can see
  // the panicked expression, flailing arms, and pedaling legs!
  const lookX = isPanicFall ? Math.sin(t * 6) * 0.35 : player.facing.x;
  const lookY = isPanicFall ? 1.0 : player.facing.y;
  const perpX = -lookY;
  const perpY = lookX * 0.45;

  // Combine 2.5D depth perspective scale (0.92x at North rim .. 1.08x at South rim)
  // with the abyss shrink scale when falling off the cliff!
  const depthPerspectiveScale = isRenderedOverhead
    ? 0.88
    : computeDepthScale(player.pos.y);
  const abyssScale = player.isFallingInVoid
    ? clamp(1 + player.zHeight / 640, 0.35, 1.0)
    : 1.0;
  const totalScale = depthPerspectiveScale * abyssScale;

  // Wild cartoon wobble tilt when falling off the cliff or squirming in a grab!
  const panicTiltDeg = isRenderedOverhead
    ? Math.sin(t * 5.5) * 18
    : player.isFallingInVoid
    ? Math.sin(t * 4.2) * 26
    : 0;

  pushTransform();
  pushTranslate(0, isRenderedOverhead ? 6 : -player.zHeight);
  // Rotate & scale around fighter's waist (-28px)
  pushTranslate(0, -28);
  pushRotate(panicTiltDeg);
  pushScale(totalScale, totalScale);
  pushTranslate(0, 28);

  // --------------------------------------------------------------------------
  // C. FLOWING SCARF TAILS (shoots straight up when falling off the cliff!)
  // --------------------------------------------------------------------------
  const tailDirX = -lookX;
  const tailDirY = -lookY * 0.5;
  const flutter =
    Math.sin(t * (isPanicFall ? 8.0 : 2.2)) * (isPanicFall ? 11 : 4.5);
  const airScarfLift = isPanicFall ? -26 : isFalling ? -10 : isJumping ? 6 : 0;

  drawLine({
    p1: vec2(0, -37 + runBob + squashOffsetY),
    p2: vec2(
      tailDirX * 23 + flutter,
      -32 + tailDirY * 14 + runBob + airScarfLift + squashOffsetY
    ),
    width: 7,
    color: rgb(...C.SCARF),
  });

  // --------------------------------------------------------------------------
  // D. ARTICULATED LEGS & BOOTS (with Hyper-Speed Cartoon Pedaling on Cliff Fall!)
  // --------------------------------------------------------------------------
  const hipSpread = 7.5;
  const leftHip = vec2(-hipSpread + lookX * 1.5, -19 + runBob + squashOffsetY);
  const rightHip = vec2(hipSpread + lookX * 1.5, -19 + runBob + squashOffsetY);

  let leftFoot;
  let rightFoot;
  let kneeBendDir = lookX * 4.5;

  if (isPanicFall) {
    // FUNNY CARTOON BICYCLE-PEDALING LEGS IN MID-AIR!
    const pedalSpeed = t * 5.5;
    leftFoot = vec2(
      -hipSpread - 6 + Math.cos(pedalSpeed) * 13,
      -4 + Math.sin(pedalSpeed) * 9
    );
    rightFoot = vec2(
      hipSpread + 6 + Math.cos(pedalSpeed + Math.PI) * 13,
      -4 + Math.sin(pedalSpeed + Math.PI) * 9
    );
    kneeBendDir = Math.sin(pedalSpeed) * 8;
  } else if (isAirborne) {
    // Normal jump/fall mid-air leg tuck
    const tuckLeftY = isJumping ? -8 : -4 + Math.sin(t * 3) * 3;
    const tuckRightY = isJumping ? -3 : -7 - Math.sin(t * 3) * 3;

    leftFoot = vec2(-hipSpread - 2 + lookX * 5, tuckLeftY);
    rightFoot = vec2(hipSpread + 2 - lookX * 3, tuckRightY);
    kneeBendDir = lookX * 6 + (lookX === 0 ? 4 : 0);
  } else {
    // Grounded idle or running stride cycle
    const leftPhase = Math.sin(t);
    const rightPhase = Math.sin(t + Math.PI);
    const leftLift = isRunning ? Math.max(0, Math.cos(t)) * 9 : 0;
    const rightLift = isRunning ? Math.max(0, -Math.cos(t)) * 9 : 0;

    const strideForwardX = lookX * 11 + (Math.abs(lookX) < 0.35 ? 4.5 : 0);
    const strideForwardY = lookY * 5.5;

    leftFoot = vec2(
      -hipSpread + (isRunning ? leftPhase * strideForwardX : -1.5),
      -2 + (isRunning ? leftPhase * strideForwardY - leftLift : 0)
    );
    rightFoot = vec2(
      hipSpread + (isRunning ? rightPhase * strideForwardX : 1.5),
      -2 + (isRunning ? rightPhase * strideForwardY - rightLift : 0)
    );
    kneeBendDir = isRunning ? lookX * 4.5 : player.landingSquash * 3;
  }

  // Draw back leg first, front leg second
  if (leftFoot.y < rightFoot.y) {
    drawSingleLeg(leftHip, leftFoot, kneeBendDir, C);
    drawSingleLeg(rightHip, rightFoot, kneeBendDir, C);
  } else {
    drawSingleLeg(rightHip, rightFoot, kneeBendDir, C);
    drawSingleLeg(leftHip, leftFoot, kneeBendDir, C);
  }

  // --------------------------------------------------------------------------
  // E. HANDS / GLOVES (Overhead Carry, 1-2 Boxing Punch, or Normal Swing)
  // --------------------------------------------------------------------------
  let leftHandPos;
  let rightHandPos;
  let leftRadius = 6.5;
  let rightRadius = 6.5;

  // Calculate smooth 0 -> 1 -> 0 punch extension curve
  const punchProgress = player.isPunching
    ? clamp(player.punchTimer / COMBAT_CONFIG.PUNCH_DURATION, 0, 1)
    : 0;
  const punchExtend = player.isPunching
    ? Math.sin(punchProgress * Math.PI) * 26
    : 0;

  // Smooth hoist progress (0 -> 1) when picking up an object
  const hoistProgress = isCarrying
    ? clamp(1 - player.pickupAnimTimer / COMBAT_CONFIG.PICKUP_ANIM_DURATION, 0, 1)
    : 0;

  if (isPanicFall) {
    const windmillAngle = t * 6.5;
    leftHandPos = vec2(
      -19 + Math.cos(windmillAngle) * 11,
      -46 + Math.sin(windmillAngle) * 12
    );
    rightHandPos = vec2(
      19 + Math.cos(windmillAngle + Math.PI) * 11,
      -46 + Math.sin(windmillAngle + Math.PI) * 12
    );
  } else if (isCarrying) {
    // Phase 7: Both Golden Gloves raised overhead to support the carried object!
    const handY = lerp(-30, -64, hoistProgress) + runBob + squashOffsetY;
    const gripWidth =
      player.heldObject.objectType === "heavyBox" ||
      player.heldObject.objectType === "fighter"
        ? 19
        : 16;

    leftHandPos = vec2(-gripWidth + lookX * 2, handY);
    rightHandPos = vec2(gripWidth + lookX * 2, handY);
  } else if (player.throwAnimTimer > 0) {
    // Phase 8: Snappy two-handed forward pitch follow-through after hurling an object!
    const throwProg =
      1 - player.throwAnimTimer / COMBAT_CONFIG.THROW_ANIM_DURATION;
    const reach = Math.sin(throwProg * Math.PI) * 22;
    const pitchY = lerp(-56, -28, throwProg) + runBob + squashOffsetY;

    leftHandPos = vec2(
      perpX * 11 + lookX * (10 + reach),
      pitchY + lookY * reach * 0.45
    );
    rightHandPos = vec2(
      -perpX * 11 + lookX * (10 + reach),
      pitchY + lookY * reach * 0.45
    );
    leftRadius = 7.8;
    rightRadius = 7.8;
  } else if (player.isPunching) {
    const isLeftPunch = player.punchHand === "left";
    const leftForward = isLeftPunch ? punchExtend : -6;
    const rightForward = !isLeftPunch ? punchExtend : -6;

    leftHandPos = vec2(
      perpX * (isLeftPunch ? 8 : 15) + lookX * (6 + leftForward),
      -29 + perpY * 6 + lookY * leftForward * 0.55 + runBob + squashOffsetY
    );
    rightHandPos = vec2(
      -perpX * (!isLeftPunch ? 8 : 15) + lookX * (6 + rightForward),
      -29 - perpY * 6 + lookY * rightForward * 0.55 + runBob + squashOffsetY
    );

    if (isLeftPunch) {
      leftRadius = 6.5 + Math.sin(punchProgress * Math.PI) * 4.2;
    } else {
      rightRadius = 6.5 + Math.sin(punchProgress * Math.PI) * 4.2;
    }
  } else {
    const armSwing = isRunning ? Math.cos(t) * 10 : Math.sin(t) * 1.5;
    const airArmLift = isFalling ? -11 : isJumping ? -7 : 0;

    leftHandPos = vec2(
      perpX * 15 + lookX * (3 - armSwing * 0.55),
      -29 + perpY * 8 + runBob + squashOffsetY + armSwing * 0.35 + airArmLift
    );
    rightHandPos = vec2(
      -perpX * 15 + lookX * (3 + armSwing * 0.55),
      -29 - perpY * 8 + runBob + squashOffsetY - armSwing * 0.35 + airArmLift
    );
  }

  const hasPowerGloves = (player.powerGlovesTimer || 0) > 0;
  const gloveBonusRadius = hasPowerGloves ? 3.2 : 0;
  const activeGloveColor = hasPowerGloves ? [255, 78, 38] : C.GLOVES;
  const activeGloveOutline = hasPowerGloves
    ? rgb(255, 230, 85)
    : rgb(35, 28, 15);

  const leftIsBack = leftHandPos.y < rightHandPos.y;
  const backHandPos = leftIsBack ? leftHandPos : rightHandPos;
  const frontHandPos = leftIsBack ? rightHandPos : leftHandPos;
  const backHandRadius =
    (leftIsBack ? leftRadius : rightRadius) + gloveBonusRadius;
  const frontHandRadius =
    (leftIsBack ? rightRadius : leftRadius) + gloveBonusRadius;

  // Draw Back Glove
  drawCircle({
    pos: backHandPos,
    radius: backHandRadius,
    color: rgb(...activeGloveColor),
    outline: { width: hasPowerGloves ? 2.5 : 2, color: activeGloveOutline },
  });

  // --------------------------------------------------------------------------
  // F. TORSO / TUNIC
  // --------------------------------------------------------------------------
  const punchLeanX = lookX * punchExtend * 0.16;
  const punchLeanY = lookY * punchExtend * 0.08;

  drawRect({
    pos: vec2(
      -12 + lookX * 1.5 + punchLeanX,
      -39 + runBob + squashOffsetY + punchLeanY
    ),
    width: 24,
    height: 21 - squashOffsetY * 0.4,
    radius: 8,
    color: rgb(...C.BODY_MAIN),
    outline: { width: 2, color: rgb(22, 42, 88) },
  });

  drawRect({
    pos: vec2(
      -10 + lookX * 2.5 + punchLeanX,
      -26 + runBob + squashOffsetY * 0.6 + punchLeanY
    ),
    width: 20,
    height: 4.5,
    radius: 2,
    color: rgb(...C.BODY_TRIM),
  });

  drawRect({
    pos: vec2(
      -11 + lookX * 1.5 + punchLeanX,
      -41 + runBob + squashOffsetY + punchLeanY
    ),
    width: 22,
    height: 6,
    radius: 3,
    color: rgb(...C.SCARF),
  });

  // --------------------------------------------------------------------------
  // G. HEAD & VISOR HELMET
  // --------------------------------------------------------------------------
  const headCenter = vec2(
    lookX * 2.5 + punchLeanX * 1.1,
    -52 + runBob + squashOffsetY * 1.1 + punchLeanY
  );

  drawCircle({
    pos: headCenter,
    radius: 14.5,
    color: rgb(...C.HEAD),
    outline: { width: 2.5, color: rgb(42, 54, 82) },
  });

  if (lookY > -0.85) {
    const visorOffset = vec2(
      lookX * 6.5,
      lookY * 3.5 + (isJumping ? -1 : isFalling ? 2 : 1)
    );
    const visorPos = headCenter.add(visorOffset);

    drawRect({
      pos: vec2(visorPos.x - 9, visorPos.y - 5),
      width: 18,
      height: isPanicFall ? 12 : 10,
      radius: 5,
      color: rgb(...C.VISOR),
    });

    if (isPanicFall) {
      drawCircle({
        pos: vec2(visorPos.x - 4.2, visorPos.y + 0.5),
        radius: 4.2,
        color: rgb(255, 255, 255),
      });
      drawCircle({
        pos: vec2(visorPos.x + 4.2, visorPos.y + 0.5),
        radius: 3.4,
        color: rgb(255, 255, 255),
      });
      const jitterX = Math.cos(t * 12) * 1.2;
      drawCircle({
        pos: vec2(visorPos.x - 4.2 + jitterX, visorPos.y + 0.5),
        radius: 1.5,
        color: rgb(15, 25, 45),
      });
      drawCircle({
        pos: vec2(visorPos.x + 4.2 + jitterX, visorPos.y + 0.5),
        radius: 1.3,
        color: rgb(15, 25, 45),
      });
    } else {
      drawCircle({
        pos: vec2(visorPos.x - 4 + lookX * 1.5, visorPos.y),
        radius: 2.3,
        color: rgb(...C.VISOR_GLOW),
      });
      drawCircle({
        pos: vec2(visorPos.x + 4 + lookX * 1.5, visorPos.y),
        radius: 2.3,
        color: rgb(...C.VISOR_GLOW),
      });
    }
  }

  // --------------------------------------------------------------------------
  // H. PHASE 7 & 10: OVERHEAD CARRIED OBJECT OR CARRIED FIGHTER!
  // --------------------------------------------------------------------------
  if (isCarrying && player.heldObject) {
    const carriedY = lerp(-26, -63, hoistProgress) + runBob + squashOffsetY;
    pushTransform();
    pushTranslate(lookX * 3, carriedY);
    drawCarriedObjectVisuals(player.heldObject);
    popTransform();
  }

  // --------------------------------------------------------------------------
  // I. FRONT HAND / GLOVE + PHASE 11 ENERGY SHIELD BUBBLE & SPAWN IMMUNITY
  // --------------------------------------------------------------------------
  drawCircle({
    pos: frontHandPos,
    radius: frontHandRadius,
    color: rgb(...activeGloveColor),
    outline: { width: hasPowerGloves ? 2.5 : 2, color: activeGloveOutline },
  });

  if (player.isPunching && frontHandRadius > 7.5) {
    drawCircle({
      pos: vec2(frontHandPos.x + lookX * 2, frontHandPos.y - 2),
      radius: frontHandRadius * 0.42,
      color: rgb(255, 250, 210),
    });
  }

  // Phase 11: Translucent 2.5D Energy Shield Bubble Dome
  if (!isRenderedOverhead && (player.shieldTimer || 0) > 0 && (player.shieldHp || 0) > 0) {
    const shieldPulse = 0.22 + 0.1 * Math.sin(t * 7);
    drawCircle({
      pos: vec2(0, -34 + runBob),
      radius: 31,
      color: rgb(55, 225, 255),
      opacity: shieldPulse,
      outline: {
        width: 2.5,
        color: rgb(175, 250, 255),
        opacity: 0.85,
      },
    });
  }

  // Phase 11: Golden Respawn Invulnerability Ring
  if (!isRenderedOverhead && (player.spawnImmunityTimer || 0) > 0) {
    drawCircle({
      pos: vec2(0, -34 + runBob),
      radius: 33,
      fill: false,
      outline: {
        width: 2.5,
        color: rgb(255, 225, 75),
        opacity: 0.65 + 0.35 * Math.sin(t * 18),
      },
    });
  }

  // --------------------------------------------------------------------------
  // J. OVERHEAD CALLOUTS: ESCAPE STRUGGLE METER, PANIC "AAAH!!", OR HP + STAMINA
  // --------------------------------------------------------------------------
  if (isRenderedOverhead) {
    // Carried Fighter Escape Struggle Meter (NO square brackets in drawText!)
    const escRatio = clamp((player.struggleProgress || 0) / 100, 0, 1);
    drawRect({
      pos: vec2(-46, -98),
      width: 92,
      height: 24,
      radius: 6,
      color: rgb(14, 18, 32),
      opacity: 0.94,
      outline: { width: 2, color: rgb(255, 215, 55) },
    });
    drawText({
      text: player.isAI ? "STRUGGLING!" : "SPAM SPACE / J!",
      pos: vec2(-39, -94),
      size: 9.5,
      color: rgb(255, 235, 95),
    });
    drawRect({
      pos: vec2(-40, -81),
      width: 80,
      height: 4.5,
      radius: 2,
      color: rgb(32, 38, 56),
    });
    if (escRatio > 0) {
      drawRect({
        pos: vec2(-40, -81),
        width: Math.max(3, 80 * escRatio),
        height: 4.5,
        radius: 2,
        color: rgb(110, 255, 130),
      });
    }
  } else if (player.isFallingInVoid) {
    // Flying sweat droplets shooting upward off the helmet
    const dropOffset = (t * 28) % 16;
    drawCircle({
      pos: vec2(-18 - dropOffset * 0.5, -62 - dropOffset),
      radius: 3,
      color: rgb(110, 225, 255),
    });
    drawCircle({
      pos: vec2(18 + dropOffset * 0.5, -60 - dropOffset * 0.8),
      radius: 2.5,
      color: rgb(110, 225, 255),
    });

    // Floating cartoon "AAAH!!" panic tag above helmet
    drawRect({
      pos: vec2(-28, -88),
      width: 56,
      height: 18,
      radius: 6,
      color: rgb(255, 245, 135),
      outline: { width: 2, color: rgb(235, 65, 55) },
    });
    drawText({
      text: "AAAH!!",
      pos: vec2(-21, -84),
      size: 11,
      color: rgb(220, 40, 40),
    });
  } else {
    // ------------------------------------------------------------------------
    // COMPACT OVERHEAD FIGHTER TAG, MINI HEALTH BAR, & STAMINA SPRINT BAR
    // ------------------------------------------------------------------------
    const tagBaseY = isCarrying ? -124 : -83;
    const hpRatio = clamp((player.health || 0) / (player.maxHealth || 100), 0, 1);
    const barColor = player.isAI
      ? rgb(245, 78, 68)
      : rgb(55, 225, 210);

    // 1. Mini dark HP bar background
    drawRect({
      pos: vec2(-20, tagBaseY),
      width: 40,
      height: 5,
      radius: 2,
      color: rgb(16, 20, 34),
      outline: { width: 1.2, color: rgb(45, 55, 82) },
    });

    // Live HP fill
    if (hpRatio > 0) {
      drawRect({
        pos: vec2(-19, tagBaseY + 1),
        width: Math.max(2, 38 * hpRatio),
        height: 3,
        radius: 1.5,
        color: barColor,
      });
    }

    // 2. Mini Stamina Bar right beneath the HP Bar (for Shift Sprint!)
    const stamRatio = clamp(
      (player.stamina ?? 100) / (player.maxStamina || 100),
      0,
      1
    );
    const stamColor = player.isStaminaExhausted
      ? rgb(255, 95, 55)
      : player.isSprinting
      ? rgb(155, 255, 90)
      : rgb(255, 215, 75);

    drawRect({
      pos: vec2(-20, tagBaseY + 6.5),
      width: 40,
      height: 4,
      radius: 1.5,
      color: rgb(14, 18, 30),
      outline: { width: 1, color: rgb(38, 48, 72) },
    });

    if (stamRatio > 0) {
      drawRect({
        pos: vec2(-19, tagBaseY + 7.5),
        width: Math.max(1.5, 38 * stamRatio),
        height: 2,
        radius: 1,
        color: stamColor,
      });
    }

    // Fighter name label ("VOLT" or "PYRO")
    drawText({
      text: player.displayName || "VOLT",
      pos: vec2(-14, tagBaseY - 10),
      size: 9,
      color: player.isAI ? rgb(255, 175, 145) : rgb(155, 240, 255),
    });
  }

  popTransform();
}

/**
 * Renders the currently carried physics object (Crate, Ball, Heavy Box, Bomb, or Fighter!)
 * centered between the carrier's raised boxing gloves during a hoist/carry!
 */
function drawCarriedObjectVisuals(heldObj) {
  if (!heldObj) return;
  if (heldObj.objectType === "crate") {
    drawCrateVisuals(false);
  } else if (heldObj.objectType === "ball") {
    drawBallVisuals(heldObj.rollAngle || 0, false);
  } else if (heldObj.objectType === "heavyBox") {
    drawHeavyBoxVisuals(false);
  } else if (heldObj.objectType === "bomb") {
    drawBombVisuals(
      false,
      heldObj.isLit,
      heldObj.fuseTimer,
      heldObj.fuseDuration
    );
  } else if (heldObj.objectType === "stickyBomb") {
    drawStickyBombVisuals(
      false,
      heldObj.isLit,
      heldObj.fuseTimer,
      heldObj.fuseDuration,
      false
    );
  } else if (heldObj.objectType === "mine") {
    drawMineVisuals(
      false,
      heldObj.isArmed,
      heldObj.isTriggered,
      heldObj.triggerTimer,
      heldObj.triggerRadius,
      false
    );
  } else if (heldObj.objectType === "fighter") {
    drawCharacterVisuals(
      heldObj,
      heldObj.palette || PLAYER_CONFIG.COLORS,
      true
    );
  }
}

