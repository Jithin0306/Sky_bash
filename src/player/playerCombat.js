// ============================================================================
// src/player/playerCombat.js
// ============================================================================
// Implements the Milestone 5 Melee Punch System (Section 7):
// 1. Triggers punch animation & alternates Left/Right golden boxing gloves.
// 2. Creates an active 2.5D circular attack hitbox during the hit window.
// 3. Detects nearby "punchable" objects/dummies/enemies using KAPLAY's `get()`.
// 4. Applies knockback force (`PUNCH_FORCE`) & hit-stop freeze frames.
// 5. Spawns punch swipe arcs and starburst impact VFX.
// ============================================================================

import {
  PLAYER_CONFIG,
  ARENA_CONFIG,
  COMBAT_CONFIG,
} from "../config/gameConfig.js";

/**
 * Updates the player's melee punch timers, active hitbox detection,
 * and hit-stop state for a single frame.
 *
 * @param {Object} player - The KAPLAY player entity
 * @param {number} delta - Frame delta time in seconds
 * @param {Object} [camera] - Optional camera controller for impact shake
 */
export function updatePlayerCombat(player, delta, camera = null) {
  // 1. Count down cooldown timer between punches
  if (player.punchCooldownTimer > 0) {
    player.punchCooldownTimer = Math.max(0, player.punchCooldownTimer - delta);
  }

  // 2. Handle brief "hit-stop" micro-freeze when a heavy punch connects
  if (player.hitStopTimer > 0) {
    player.hitStopTimer = Math.max(0, player.hitStopTimer - delta);
    return;
  }

  // 3. Trigger a new punch when Left Click or J is pressed (and not on cooldown)
  if (
    player.input.punchPressed &&
    player.punchCooldownTimer <= 0 &&
    !player.isFallingInVoid
  ) {
    startPunch(player);
  }

  // 4. Update active punch animation & hitbox window
  if (player.isPunching) {
    player.punchTimer += delta;

    // Override character state to "punch" so the HUD and visuals show it clearly
    player.state = "punch";

    // Is the punch currently inside the active hit window (0.03s .. 0.16s)?
    const inHitWindow =
      player.punchTimer >= COMBAT_CONFIG.HIT_WINDOW_START &&
      player.punchTimer <= COMBAT_CONFIG.HIT_WINDOW_END;

    if (inHitWindow) {
      checkPunchHitbox(player, camera);
    }

    // Finish punch when duration expires
    if (player.punchTimer >= COMBAT_CONFIG.PUNCH_DURATION) {
      player.isPunching = false;
      player.punchTimer = 0;
      player.hitTargetsThisSwing.clear();
    }
  }
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

  // KAPLAY's `get("punchable")` returns an array of every game object in the
  // current scene that has the `"punchable"` tag!
  const targets = get("punchable");

  for (const target of targets) {
    // Skip if this target was already hit during this single punch swing
    if (player.hitTargetsThisSwing.has(target)) continue;

    // 1. Check vertical (zHeight) overlap so ground punches hit ground objects
    const targetZ = target.zHeight || 0;
    const targetHeight = target.propHeight || 50;
    const playerPunchZ = player.zHeight + 28; // Fist height (~chest level)

    if (
      playerPunchZ < targetZ - 15 ||
      playerPunchZ > targetZ + targetHeight + 20
    ) {
      continue;
    }

    // 2. Check 2.5D horizontal/depth distance on the arena floor
    const dx = target.pos.x - hitboxCenter.x;
    const dy =
      (target.pos.y - hitboxCenter.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
    const dist = Math.hypot(dx, dy);
    const hitRadius =
      COMBAT_CONFIG.PUNCH_RADIUS + (target.footprintRadius || 18);

    if (dist <= hitRadius) {
      // HIT CONNECTED!
      player.hitTargetsThisSwing.add(target);

      // Compute normalized knockback direction from player toward target
      let kbDirX = player.facing.x;
      let kbDirY = player.facing.y;
      const centerDx = target.pos.x - player.pos.x;
      const centerDy =
        (target.pos.y - player.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
      const centerLen = Math.hypot(centerDx, centerDy);

      if (centerLen > 0.001) {
        // Blend 65% player facing direction + 35% radial center-to-target vector
        kbDirX = player.facing.x * 0.65 + (centerDx / centerLen) * 0.35;
        kbDirY = player.facing.y * 0.65 + (centerDy / centerLen) * 0.35;
        const nLen = Math.hypot(kbDirX, kbDirY);
        kbDirX /= nLen;
        kbDirY /= nLen;
      }

      // Notify the target that it was punched!
      if (typeof target.onPunchHit === "function") {
        target.onPunchHit(vec2(kbDirX, kbDirY), PLAYER_CONFIG.PUNCH_FORCE, player);
      }

      // Apply micro hit-stop freeze & camera shake for punchy impact!
      player.hitStopTimer = COMBAT_CONFIG.HIT_STOP_DURATION;
      if (camera) {
        camera.shake(9.5);
      }

      // Spawn starburst hit flash & comic impact popup at the contact point
      const impactX = (hitboxCenter.x + target.pos.x) * 0.5;
      const impactY = (hitboxCenter.y + target.pos.y) * 0.5;
      spawnHitImpactVFX(impactX, impactY, playerPunchZ);
    }
  }
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

        // Outer golden energy arc
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
 * Spawns a bright, high-contrast comic book starburst & "POW!" / "BAM!" badge
 * on foreground layer z(900) so it is always 100% visible against the sandstone arena!
 */
function spawnHitImpactVFX(x, y, zHeight) {
  let age = 0;
  const duration = 0.65; // Long enough to clearly read the comic callout!
  const hitWord = COMIC_HIT_WORDS[hitWordIndex % COMIC_HIT_WORDS.length];
  hitWordIndex += 1;
  const badgeTilt = rand(-10, 10);

  // Create 10 radial spark particles
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
    // Layer z(900) guarantees the POW! popup is NEVER hidden behind the arena or props!
    z(900),
    {
      update() {
        age += dt();
        if (age >= duration) destroy(this);
      },
      draw() {
        const progress = age / duration;
        // Stay 100% opaque for the first 65% of duration, then fade out smoothly
        const alpha = progress < 0.65 ? 1.0 : 1.0 - (progress - 0.65) / 0.35;
        const drawY = -zHeight;

        // 1. Expanding impact shockwave ring (first 0.25s)
        if (age < 0.25) {
          const ringProg = age / 0.25;
          drawCircle({
            pos: vec2(0, drawY),
            radius: lerp(12, 46, ringProg),
            color: rgb(255, 250, 200),
            opacity: (1 - ringProg) * 0.7,
          });
        }

        // 2. Radial flying hit sparks with dark outlines for contrast
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

        // 3. COMPACT HIGH-CONTRAST COMIC "POW!" / "BAM!" BADGE
        // Positioned high above the target (drawY - 56) and compact (56x20)
        // so it is crisp and readable without blocking the player character!
        const popScale =
          age < 0.10
            ? lerp(0.5, 1.08, age / 0.10)
            : lerp(1.08, 0.95, Math.min(1, (age - 0.10) / 0.15));

        const floatY = drawY - 56 - progress * 24;

        pushTransform();
        pushTranslate(0, floatY);
        pushRotate(badgeTilt * 0.6);
        pushScale(popScale, popScale);

        // Dark outer drop-shadow plate
        drawRect({
          pos: vec2(-27, -9),
          width: 56,
          height: 21,
          radius: 6,
          color: rgb(15, 18, 32),
          opacity: alpha * 0.9,
        });

        // Compact crimson comic badge with gold border
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

        // Crisp 12px comic lettering centered in the compact badge
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
