// ============================================================================
// src/player/playerCombat.js
// ============================================================================
// Manages Melee Combat (Milestone 5) AND Object Pick-Up / Carry / Drop (Milestone 7):
// 1. Melee Punch: 1-2 alternating glove combo, active hit window, knockback, & hit-stop.
// 2. Pick-Up System (`E` key):
//    - Continuously detects the nearest valid `"pickupable"` object within range.
//    - Attaches the object overhead to Volt's hands (`player.heldObject`).
//    - Suspends normal floor physics while carried (`obj.isCarried = true`).
// 3. Drop System (`Q` key or `E` again):
//    - Releases the carried object cleanly in front of the player and restores physics.
// ============================================================================

import {
  PLAYER_CONFIG,
  ARENA_CONFIG,
  COMBAT_CONFIG,
} from "../config/gameConfig.js";
import { sound } from "../systems/sound.js";

/**
 * Updates the player's melee punch, object pick-up/carry/drop interactions,
 * and hit-stop state for a single frame.
 *
 * @param {Object} player - The KAPLAY player entity
 * @param {number} delta - Frame delta time in seconds
 * @param {Object} [camera] - Optional camera controller for impact shake
 */
export function updatePlayerCombat(player, delta, camera = null) {
  // 1. Count down punch cooldown, pickup hoist timer, & throw follow-through timer
  if (player.punchCooldownTimer > 0) {
    player.punchCooldownTimer = Math.max(0, player.punchCooldownTimer - delta);
  }
  if (player.pickupAnimTimer > 0) {
    player.pickupAnimTimer = Math.max(0, player.pickupAnimTimer - delta);
  }
  if (player.throwAnimTimer > 0) {
    player.throwAnimTimer = Math.max(0, player.throwAnimTimer - delta);
  }

  // 2. Handle brief "hit-stop" micro-freeze when a heavy punch connects
  if (player.hitStopTimer > 0) {
    player.hitStopTimer = Math.max(0, player.hitStopTimer - delta);
    return;
  }

  // 3. If the player falls off the cliff while carrying an object, drop it!
  if (player.isFallingInVoid && player.heldObject) {
    dropHeldObject(player);
    return;
  }

  // --------------------------------------------------------------------------
  // 4. PHASE 7 & 8: PICK-UP (`E`), DROP (`Q` / `E`), & THROW (`K` / `J` / `Click`)
  // --------------------------------------------------------------------------
  if (player.heldObject) {
    // Player is currently carrying an object overhead!
    player.nearestPickupCandidate = null;

    // Keep the carried object's world coordinates synced to the player
    const obj = player.heldObject;
    obj.pos.x = player.pos.x;
    obj.pos.y = player.pos.y;
    obj.zHeight = player.zHeight + 56;
    obj.velocity = vec2(0, 0);
    obj.velZ = 0;

    // Phase 8: Press K, Right-Click, J, or Left-Click while carrying to THROW!
    if (player.input.throwPressed || player.input.punchPressed) {
      throwHeldObject(player, camera);
      return;
    }

    // Phase 7: Press Q (or press E again) to gently drop the carried object in front of you
    if (player.input.dropPressed || player.input.pickupPressed) {
      dropHeldObject(player);
      return;
    }
  } else {
    // Player is empty-handed: scan for the closest valid "pickupable" object
    player.nearestPickupCandidate = findNearestPickupCandidate(player);

    // Press E near a valid object to pick it up!
    if (player.input.pickupPressed && player.nearestPickupCandidate) {
      pickupObject(player, player.nearestPickupCandidate);
      return;
    }
  }

  // --------------------------------------------------------------------------
  // 5. MILESTONE 5: MELEE PUNCH TRIGGER (Only when not carrying an object)
  // --------------------------------------------------------------------------
  if (
    !player.heldObject &&
    player.input.punchPressed &&
    player.punchCooldownTimer <= 0 &&
    !player.isFallingInVoid
  ) {
    startPunch(player);
  }

  // 6. Update active punch animation & hitbox window
  if (player.isPunching) {
    player.punchTimer += delta;
    player.state = "punch";

    const inHitWindow =
      player.punchTimer >= COMBAT_CONFIG.HIT_WINDOW_START &&
      player.punchTimer <= COMBAT_CONFIG.HIT_WINDOW_END;

    if (inHitWindow) {
      checkPunchHitbox(player, camera);
    }

    if (player.punchTimer >= COMBAT_CONFIG.PUNCH_DURATION) {
      player.isPunching = false;
      player.punchTimer = 0;
      player.hitTargetsThisSwing.clear();
    }
  }
}

/**
 * Scans all `"pickupable"` objects in the scene and returns the closest one
 * within `COMBAT_CONFIG.PICKUP_RANGE` (58 px), or `null` if none is in reach.
 */
export function findNearestPickupCandidate(player) {
  if (player.isFallingInVoid || player.isCarried) return null;

  const candidates = get("pickupable");
  let bestObj = null;
  let bestDist = COMBAT_CONFIG.PICKUP_RANGE;

  // Bias slightly in front of where the player is facing (+12px)
  const reachOriginX = player.pos.x + player.facing.x * 12;
  const reachOriginY =
    player.pos.y + player.facing.y * 12 * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

  for (const obj of candidates) {
    if (
      obj === player ||
      obj.isCarried ||
      obj.isFallingInVoid ||
      obj.isExplodedCooldown ||
      obj.isWaitingToDrop ||
      obj.stuckToTarget ||
      (obj.objectType === "fighter" &&
        player.team &&
        player.team !== "none" &&
        obj.team === player.team) ||
      (obj.objectType === "mine" && (obj.isArmed || obj.isTriggered)) ||
      (obj.grabImmunityTimer && obj.grabImmunityTimer > 0)
    ) {
      continue;
    }

    // Must be within reachable vertical height
    if (Math.abs((obj.zHeight || 0) - player.zHeight) > 48) continue;

    const dx = obj.pos.x - reachOriginX;
    const dy = (obj.pos.y - reachOriginY) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
    const dist = Math.hypot(dx, dy);

    if (dist <= bestDist) {
      bestDist = dist;
      bestObj = obj;
    }
  }

  // Hysteresis stickiness: if the player already has a valid candidate within reach,
  // require an alternative candidate to be at least 14px closer to avoid target flickering!
  const currentCandidate = player.nearestPickupCandidate;
  if (
    currentCandidate &&
    bestObj &&
    bestObj !== currentCandidate &&
    candidates.includes(currentCandidate)
  ) {
    const curDx = currentCandidate.pos.x - reachOriginX;
    const curDy = (currentCandidate.pos.y - reachOriginY) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
    const curDist = Math.hypot(curDx, curDy);
    if (curDist <= COMBAT_CONFIG.PICKUP_RANGE && bestDist > curDist - 14) {
      return currentCandidate;
    }
  }

  return bestObj;
}

/**
 * Picks up the target physics object OR opponent Fighter and hoists them overhead!
 */
export function pickupObject(player, obj) {
  if (!obj || obj === player || obj.isCarried || player.heldObject) return;

  // If the target is another fighter who was carrying an item, make them drop their item first!
  if (obj.objectType === "fighter" && obj.heldObject) {
    dropHeldObject(obj);
  }

  // Cancel any active punch swing
  player.isPunching = false;
  player.punchTimer = 0;

  // Attach object/fighter to player
  player.heldObject = obj;
  player.nearestPickupCandidate = null;
  player.pickupAnimTimer = COMBAT_CONFIG.PICKUP_ANIM_DURATION;
  player.landingSquash = 0.45; // Subtle knee bend as Volt hoists the weight!

  // Disable normal ground physics on the object/fighter while carried
  obj.isCarried = true;
  obj.carrier = player;
  obj.stuckToTarget = null;
  obj.isStuckToFloor = false;
  obj.velocity = vec2(0, 0);
  if (obj.knockback) obj.knockback = vec2(0, 0);
  obj.velZ = 0;
  obj.isGrounded = false;
  if (obj.objectType === "fighter") {
    obj.struggleProgress = 0;
  }

  // Picking up a Bomb or Sticky Bomb ignites its fuse; picking up a Landmine prepares it to arm on landing!
  if (obj.objectType === "mine") {
    obj.armOnLanding = true;
    obj.armingTimer = obj.armDelay || 0.65;
    obj.isArmed = false;
    obj.isTriggered = false;
    obj.isLit = false;
  } else if (typeof obj.ignite === "function") {
    obj.ignite();
  }

  // Spawn a snappy cyan/gold pickup ring VFX
  const grabLabel = obj.objectType === "fighter" ? "GRABBED!" : "GRAB!";
  spawnPickupVFX(player.pos.x, player.pos.y, player.zHeight + 24, grabLabel);
  sound.playPickup();
}

/**
 * Called when a carried fighter spams Space/J/E (or AI squirms) to 100% and breaks free!
 */
export function breakFreeFromCarrier(carriedFighter) {
  const carrier = carriedFighter.carrier;
  if (!carrier) return;

  carrier.heldObject = null;
  carrier.pickupAnimTimer = 0;

  carriedFighter.isCarried = false;
  carriedFighter.carrier = null;
  carriedFighter.struggleProgress = 0;
  carriedFighter.grabImmunityTimer = 1.6; // 1.6s immunity so they cannot be instantly re-grabbed!

  // Place the escaped fighter safely in front of the carrier and hop upward
  const escapeDirX = carrier.facing.x || 0;
  const escapeDirY = carrier.facing.y || 1;
  carriedFighter.pos.x = carrier.pos.x + escapeDirX * 36;
  carriedFighter.pos.y =
    carrier.pos.y + escapeDirY * 36 * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
  carriedFighter.zHeight = Math.max(12, carrier.zHeight + 24);
  carriedFighter.velZ = 215;
  carriedFighter.isGrounded = false;
  carriedFighter.knockback = vec2(
    escapeDirX * 190,
    escapeDirY * 190 * ARENA_CONFIG.PERSPECTIVE_Y_SCALE
  );

  // Shove the carrier backward in recoil!
  carrier.knockback = vec2(
    -escapeDirX * 230,
    -escapeDirY * 230 * ARENA_CONFIG.PERSPECTIVE_Y_SCALE
  );
  carrier.velZ = 135;
  carrier.isGrounded = false;
  carrier.hitFlashTimer = 0.16;

  spawnPickupVFX(
    carriedFighter.pos.x,
    carriedFighter.pos.y,
    carriedFighter.zHeight + 20,
    "ESCAPED!"
  );
  sound.playEscape();
}

/**
 * Gently drops the currently carried object or fighter in front of the player
 * and restores its normal 2.5D physics.
 */
export function dropHeldObject(player) {
  const obj = player.heldObject;
  if (!obj) return;

  // Release references
  player.heldObject = null;
  player.pickupAnimTimer = 0;
  obj.isCarried = false;
  obj.carrier = null;

  // Place the object ~30px in front of the player's facing direction
  const dropDist = PLAYER_CONFIG.FOOTPRINT_RADIUS + (obj.footprintRadius || 18) + 6;
  obj.pos.x = player.pos.x + player.facing.x * dropDist;
  obj.pos.y =
    player.pos.y +
    player.facing.y * dropDist * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

  // Start at chest height with a gentle forward & upward hop
  obj.zHeight = Math.max(10, player.zHeight + 26);
  obj.velZ = 115;
  obj.isGrounded = false;

  const forwardSpeed =
    COMBAT_CONFIG.DROP_FORWARD_SPEED / Math.sqrt(obj.mass || 1.0);
  const vx = player.velocity.x * 0.4 + player.facing.x * forwardSpeed;
  const vy =
    player.velocity.y * 0.4 +
    player.facing.y * forwardSpeed * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

  if (obj.objectType === "fighter") {
    obj.struggleProgress = 0;
    obj.grabImmunityTimer = 0.9;
    obj.knockback = vec2(vx * 1.4, vy * 1.4);
  } else {
    obj.velocity = vec2(vx, vy);
  }

  spawnPickupVFX(obj.pos.x, obj.pos.y, obj.zHeight, "DROP");
  sound.playDrop();
}

/**
 * Computes the exact 2.5D initial launch position and velocity vector (`vx`, `vy`, `velZ`)
 * when Volt throws the currently held object or fighter.
 */
export function computeThrowLaunchState(player, obj) {
  const launchDist = PLAYER_CONFIG.FOOTPRINT_RADIUS + (obj.footprintRadius || 18) + 6;
  const startX = player.pos.x + player.facing.x * launchDist;
  const startY =
    player.pos.y +
    player.facing.y * launchDist * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
  const startZ = Math.max(24, player.zHeight + 48);

  const glovesBoost = (player.powerGlovesTimer || 0) > 0 ? 1.28 : 1.0;
  const throwForce = (obj.throwForce || 260) * glovesBoost;
  const momentumMult = COMBAT_CONFIG.THROW_PLAYER_MOMENTUM_FACTOR;

  const vx =
    player.facing.x * throwForce + player.velocity.x * momentumMult;
  const vy =
    player.facing.y * throwForce * ARENA_CONFIG.PERSPECTIVE_Y_SCALE +
    player.velocity.y * momentumMult;

  const velZ =
    COMBAT_CONFIG.THROW_ARC_VEL_Z / Math.sqrt(Math.max(0.4, obj.mass || 1.0));

  return { startX, startY, startZ, vx, vy, velZ };
}

/**
 * Phase 8: Hurls the currently carried object OR opponent Fighter along a 2.5D arc
 * in the direction Volt is facing (great for throwing rivals into the Void!).
 */
export function throwHeldObject(player, camera = null) {
  const obj = player.heldObject;
  if (!obj) return;

  const launch = computeThrowLaunchState(player, obj);

  // Release object/fighter from Volt's hands
  player.heldObject = null;
  player.pickupAnimTimer = 0;
  player.throwAnimTimer = COMBAT_CONFIG.THROW_ANIM_DURATION;
  player.punchCooldownTimer = 0.24;
  player.landingSquash = 0.35;
  player.state = "throw";

  obj.isCarried = false;
  obj.carrier = null;
  obj.pos.x = launch.startX;
  obj.pos.y = launch.startY;
  obj.zHeight = launch.startZ;
  obj.isGrounded = false;

  if (obj.objectType === "fighter") {
    // Throwing an opponent Fighter! Launch them via knockback + velZ so they soar toward the cliff/void!
    obj.struggleProgress = 0;
    obj.grabImmunityTimer = 1.0;
    obj.knockback = vec2(launch.vx * 1.45, launch.vy * 1.45);
    obj.velocity = vec2(launch.vx * 0.45, launch.vy * 0.45);
    obj.velZ = launch.velZ * 1.35;
    obj.hitFlashTimer = 0.18;
  } else {
    // Throwing a Physics Object (Crate, Ball, Heavy Box, Bomb)
    obj.isThrownProjectile = true;
    obj.thrower = player;
    obj.throwHitSet.clear();
    obj.velocity = vec2(launch.vx, launch.vy);
    obj.velZ = launch.velZ;
    obj.squashFactor = -0.25;
  }

  spawnPickupVFX(obj.pos.x, obj.pos.y, obj.zHeight, "YEET!");
  sound.playThrow();
}


/**
 * Starts a melee punch swing, alternates hands, applies a forward lunge,
 * and spawns a crescent swipe trail in front of the player.
 */
function startPunch(player) {
  player.isPunching = true;
  player.punchTimer = 0;
  player.punchCooldownTimer = COMBAT_CONFIG.PUNCH_COOLDOWN;
  player.hitTargetsThisSwing.clear();

  // Alternate between "right" and "left" boxing glove for a 1-2 combo feel!
  player.punchHand = player.punchHand === "right" ? "left" : "right";

  // Subtle forward lunge in the direction Volt is facing
  player.velocity.x += player.facing.x * COMBAT_CONFIG.PUNCH_LUNGE_SPEED;
  player.velocity.y +=
    player.facing.y *
    COMBAT_CONFIG.PUNCH_LUNGE_SPEED *
    ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

  // Spawn the visual crescent punch swipe arc
  spawnPunchSwipeVFX(player);
  sound.playPunchSwing();
}

/**
 * Computes the 2.5D attack hitbox in front of the player and checks all
 * objects tagged `"punchable"` in the scene.
 */
export function getPunchHitboxCenter(player) {
  const range = COMBAT_CONFIG.PUNCH_RANGE;
  return vec2(
    player.pos.x + player.facing.x * range,
    player.pos.y + player.facing.y * range * ARENA_CONFIG.PERSPECTIVE_Y_SCALE
  );
}

function checkPunchHitbox(player, camera) {
  const hitboxCenter = getPunchHitboxCenter(player);
  const targets = get("punchable");

  for (const target of targets) {
    if (target === player || target.isCarried || target.isExplodedCooldown) continue;
    if (
      target.objectType === "fighter" &&
      player.team &&
      player.team !== "none" &&
      target.team === player.team
    ) {
      continue;
    }
    if (player.hitTargetsThisSwing.has(target)) continue;

    const targetZ = target.zHeight || 0;
    const targetHeight = target.propHeight || 50;
    const playerPunchZ = player.zHeight + 28;

    if (
      playerPunchZ < targetZ - 15 ||
      playerPunchZ > targetZ + targetHeight + 20
    ) {
      continue;
    }

    const dx = target.pos.x - hitboxCenter.x;
    const dy =
      (target.pos.y - hitboxCenter.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
    const dist = Math.hypot(dx, dy);
    const hitRadius =
      COMBAT_CONFIG.PUNCH_RADIUS + (target.footprintRadius || 18);

    if (dist <= hitRadius) {
      player.hitTargetsThisSwing.add(target);

      let kbDirX = player.facing.x;
      let kbDirY = player.facing.y;
      const centerDx = target.pos.x - player.pos.x;
      const centerDy =
        (target.pos.y - player.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
      const centerLen = Math.hypot(centerDx, centerDy);

      if (centerLen > 0.001) {
        kbDirX = player.facing.x * 0.65 + (centerDx / centerLen) * 0.35;
        kbDirY = player.facing.y * 0.65 + (centerDy / centerLen) * 0.35;
        const nLen = Math.hypot(kbDirX, kbDirY);
        kbDirX /= nLen;
        kbDirY /= nLen;
      }

      const hasSuperGloves = (player.powerGlovesTimer || 0) > 0;
      const punchForce =
        PLAYER_CONFIG.PUNCH_FORCE * (hasSuperGloves ? 1.55 : 1.0);
      const rawDamage = hasSuperGloves ? 23 : 14;

      if (typeof target.onPunchHit === "function") {
        target.onPunchHit(vec2(kbDirX, kbDirY), punchForce, rawDamage);
      }

      sound.playPunchHit({
        isHeavy: hasSuperGloves,
        isDummy: Boolean(target.wobbleAngle !== undefined || target.totalHitsTaken !== undefined),
      });

      player.hitStopTimer = COMBAT_CONFIG.HIT_STOP_DURATION;

      const impactX = (hitboxCenter.x + target.pos.x) * 0.5;
      const impactY = (hitboxCenter.y + target.pos.y) * 0.5;
      spawnHitImpactVFX(
        impactX,
        impactY,
        playerPunchZ,
        hasSuperGloves ? "MEGA POW!" : "POW!"
      );
    }
  }
}

/**
 * Spawns a quick cyan/gold sparkle ring when picking up or dropping an object.
 */
export function spawnPickupVFX(x, y, zHeight, tagText = "GRAB!") {
  let age = 0;
  const duration = 0.38;

  add([
    pos(x, y),
    z(890),
    {
      update() {
        age += dt();
        if (age >= duration) destroy(this);
      },
      draw() {
        const progress = age / duration;
        const alpha = 1 - progress;
        const drawY = -zHeight;

        drawCircle({
          pos: vec2(0, drawY),
          radius: lerp(10, 32, progress),
          fill: false,
          outline: {
            width: 3 * alpha,
            color: rgb(86, 245, 215),
            opacity: alpha * 0.85,
          },
        });

        drawText({
          text: tagText,
          pos: vec2(-18, drawY - 18 - progress * 16),
          size: 11,
          color: rgb(120, 255, 225),
          opacity: alpha,
        });
      },
    },
  ]);
}

/**
 * Spawns a quick golden/white crescent swipe arc in front of Volt when punching.
 */
function spawnPunchSwipeVFX(player) {
  let age = 0;
  const duration = 0.16;
  const startFacing = player.facing.clone();

  add([
    pos(player.pos.x, player.pos.y),
    z(Math.round(player.pos.y) + 5),
    {
      update() {
        age += dt();
        this.pos.x = player.pos.x;
        this.pos.y = player.pos.y;
        this.z = Math.round(player.pos.y) + 5;
        if (age >= duration) destroy(this);
      },
      draw() {
        const progress = age / duration;
        const reach = lerp(18, COMBAT_CONFIG.PUNCH_RANGE + 12, progress);
        const alpha = (1 - progress) * 0.75;

        const cx = startFacing.x * reach;
        const cy =
          startFacing.y * reach * ARENA_CONFIG.PERSPECTIVE_Y_SCALE -
          28 -
          player.zHeight;

        drawCircle({
          pos: vec2(cx, cy),
          radius: lerp(12, 24, progress),
          fill: false,
          outline: {
            width: 4 * (1 - progress * 0.5),
            color: rgb(255, 225, 95),
            opacity: alpha,
          },
        });
      },
    },
  ]);
}

// Comic book hit words that cycle on each punch impact
const COMIC_HIT_WORDS = ["POW!", "BAM!", "WHAM!", "SMASH!"];
let hitWordIndex = 0;

/**
 * Spawns a compact, high-contrast comic book starburst & "POW!" / "BAM!" badge
 * on foreground layer z(900) above the hit target.
 */
export function spawnHitImpactVFX(x, y, zHeight, customWord = null) {
  let age = 0;
  const duration = 0.65;
  const hitWord =
    customWord || COMIC_HIT_WORDS[hitWordIndex % COMIC_HIT_WORDS.length];
  if (!customWord) {
    hitWordIndex += 1;
  }
  const badgeTilt = rand(-10, 10);

  const sparks = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + rand(-0.2, 0.2);
    sparks.push({
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      speed: rand(110, 210),
      size: rand(4.5, 7.5),
    });
  }

  add([
    pos(x, y),
    z(900),
    {
      update() {
        age += dt();
        if (age >= duration) destroy(this);
      },
      draw() {
        const progress = age / duration;
        const alpha = progress < 0.65 ? 1.0 : 1.0 - (progress - 0.65) / 0.35;
        const drawY = -zHeight;

        if (age < 0.25) {
          const ringProg = age / 0.25;
          drawCircle({
            pos: vec2(0, drawY),
            radius: lerp(12, 46, ringProg),
            color: rgb(255, 250, 200),
            opacity: (1 - ringProg) * 0.7,
          });
        }

        if (age < 0.35) {
          const sparkProg = age / 0.35;
          for (const s of sparks) {
            const dist = s.speed * age;
            const sx = s.cos * dist;
            const sy = drawY + s.sin * dist * 0.75;

            drawCircle({
              pos: vec2(sx, sy),
              radius: s.size * (1 - sparkProg * 0.6),
              color: rgb(255, 110, 40),
              outline: { width: 2, color: rgb(25, 20, 35) },
            });
          }
        }

        const popScale =
          age < 0.10
            ? lerp(0.5, 1.08, age / 0.10)
            : lerp(1.08, 0.95, Math.min(1, (age - 0.10) / 0.15));

        const floatY = drawY - 56 - progress * 24;

        pushTransform();
        pushTranslate(0, floatY);
        pushRotate(badgeTilt * 0.6);
        pushScale(popScale, popScale);

        drawRect({
          pos: vec2(-27, -9),
          width: 56,
          height: 21,
          radius: 6,
          color: rgb(15, 18, 32),
          opacity: alpha * 0.9,
        });

        drawRect({
          pos: vec2(-28, -11),
          width: 56,
          height: 20,
          radius: 6,
          color: rgb(232, 45, 45),
          opacity: alpha,
          outline: {
            width: 2,
            color: rgb(255, 230, 75),
          },
        });

        drawText({
          text: hitWord,
          pos: vec2(hitWord.length > 4 ? -22 : -18, -6),
          size: 12,
          color: rgb(255, 250, 140),
          opacity: alpha,
        });

        popTransform();
      },
    },
  ]);
}
