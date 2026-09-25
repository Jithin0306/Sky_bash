// ============================================================================
// src/scenes/arena.js
// ============================================================================
// Defines the main "arena" scene and the 2.5D circular platform geometry.
//
// HOW THE 2.5D PERSPECTIVE WORKS:
// A circle in 3D space viewed from an elevated angle looks like an ellipse on a
// 2D screen. We achieve this cleanly in KAPLAY by scaling the arena's Y-axis
// by ARENA_CONFIG.PERSPECTIVE_Y_SCALE (0.64).
//
// Because the floor is vertically compressed by 0.64, checking if a point (x, y)
// is still inside the circular arena simply requires dividing the vertical
// offset (dy) by 0.64 before measuring the distance from the center!
// ============================================================================

import {
  GAME_CONFIG,
  ARENA_CONFIG,
  PLAYER_CONFIG,
  COMBAT_CONFIG,
  OBJECTS_CONFIG,
  CAMERA_CONFIG,
} from "../config/gameConfig.js";
import { createArenaCamera } from "../systems/camera.js";
import { readLocalPlayerInput } from "../systems/input.js";
import { createPlayer } from "../player/Player.js";
import { computeThrowLaunchState } from "../player/playerCombat.js";
import {
  updateDepthSort,
  computeDepthScale,
  drawGroundShadow,
} from "../systems/depthSort.js";
import { updatePhysicsSystem } from "../systems/physics.js";
import { createCrate } from "../objects/crate.js";
import { createBall } from "../objects/ball.js";
import { createHeavyBox } from "../objects/heavyBox.js";
import { createBomb } from "../objects/bomb.js";
import { createStickyBomb } from "../objects/stickyBomb.js";
import { createMine } from "../objects/mine.js";
import {
  createEnemyAIController,
  PYRO_BOT_PALETTE,
} from "../ai/enemyAI.js";

/**
 * Converts a 2D screen/floor coordinate (x, y) into its true 2.5D radial distance
 * from the center of the arena.
 *
 * @param {number} x - World X coordinate on the ground plane
 * @param {number} y - World Y coordinate on the ground plane
 * @returns {number} Distance in un-compressed arena units (0 = center, 495 = edge)
 */
export function getArenaDistance(x, y) {
  const dx = x - ARENA_CONFIG.CENTER_X;
  // Un-compress the Y axis so vertical movement matches horizontal movement in 3D
  const dy = (y - ARENA_CONFIG.CENTER_Y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
  return Math.hypot(dx, dy);
}

/**
 * Returns true if the ground coordinate (x, y) is safely inside the circular arena.
 * When this returns false, a grounded player or physics object will fall into the void!
 */
export function isPointOnArena(x, y, margin = 0) {
  return getArenaDistance(x, y) <= ARENA_CONFIG.RADIUS - margin;
}

/**
 * Registers the "arena" scene with KAPLAY (NORMAL GAME — Player vs AI Match Mode).
 * Developer test props (Sparring Dummy) and debug hotkeys (T/B/R/1-6) are strictly
 * separated into the Developer-Only "devTest" scene!
 */
export function registerArenaScene() {
  scene("arena", () => {
    // 1. Initialize the smooth 2.5D camera controller
    const camera = createArenaCamera();

    // 2. Create floating background motes for depth & parallax
    createAmbientBackground();

    // 3. Create the 2.5D Floating Circular Arena
    createFloatingArena();

    // 4. Spawn playable character ("VOLT") & AI Rival ("PYRO")!
    const player = createPlayer(
      ARENA_CONFIG.CENTER_X - 155,
      ARENA_CONFIG.CENTER_Y + 65,
      {
        playerId: 1,
        displayName: "VOLT",
        ringColor: [25, 175, 235],
        camera,
      }
    );

    const enemyBot = createPlayer(
      ARENA_CONFIG.CENTER_X + 155,
      ARENA_CONFIG.CENTER_Y - 35,
      {
        playerId: 2,
        displayName: "PYRO",
        isAI: true,
        speedMultiplier: 0.62,
        colors: PYRO_BOT_PALETTE,
        ringColor: [245, 78, 65],
        camera,
      }
    );
    enemyBot.facing = vec2(-1, 0.3);

    // 5. Spawn decorative 2.5D Crystal Totems ONLY (no Developer Sparring Dummy in Normal Game!)
    const props = createDepthTestProps(false);

    // 6. Spawn 2.5D Arena Physics Objects & Explosives with natural staggered sky-drop timers
    const physicsObjects = spawnArenaPhysicsObjects();

    // 7. Initialize Autonomous AI Controller for Pyro
    const aiController = createEnemyAIController(
      enemyBot,
      player,
      physicsObjects
    );

    // Press ESC anytime to return to the Main Menu
    onKeyPress("escape", () => {
      go("menu");
    });

    const fighters = [player, enemyBot];

    // 8. Connect local keyboard/mouse input, AI brain, 2.5D physics engine, & camera each frame
    onUpdate(() => {
      const inputState = readLocalPlayerInput();
      player.setInput(inputState);

      // Step Pyro's autonomous AI decision tree
      const aiInput = aiController.computeInput(dt());
      enemyBot.setInput(aiInput);

      // Step the 2.5D Physics Engine for both fighters, objects, bombs, & props
      updatePhysicsSystem(fighters, physicsObjects, props, camera);

      for (const f of fighters) {
        resolvePropFootprintCollisions(f, props);

        // Trigger "KO! RING OUT!" banner & score point when a fighter falls off the cliff!
        if (f.isFallingInVoid && !f.hasTriggeredRingOutBanner) {
          f.hasTriggeredRingOutBanner = true;
          spawnRingOutBanner(f.pos.x, f.pos.y);
          if (f === enemyBot) {
            player.ringOutCount += 1;
          } else {
            enemyBot.ringOutCount += 1;
          }
        }

        // Landing dust ring when landing from a jump/drop (no camera shake!)
        if (f.justLanded && f.landImpactSpeed > 200) {
          spawnLandingRing(f.pos.x, f.pos.y);
        }
      }

      camera.setTarget(player.pos);
    });

    // 9. Create the interactive E-Grab highlight & clean Normal Match Scoreboard HUD
    createPickupPromptRenderer(player);
    createNormalGameHUD(player, enemyBot);
  });
}

/**
 * Spawns a balanced assortment of 2.5D Physics Objects & Explosives around the circular court
 * with staggered sky-drop delays so items enter the arena gradually over time:
 * - 1 Slime Sticky Bomb & 1 Proximity Landmine right at match start (0s delay)
 * - Followed by Supply Crate, Sky Fuse Bomb, Brawler Sphere, Heavy Box, & extra Sticky/Mine!
 */
export function spawnArenaPhysicsObjects() {
  const cx = ARENA_CONFIG.CENTER_X;
  const cy = ARENA_CONFIG.CENTER_Y;

  return [
    createStickyBomb(cx - 175, cy + 20, 210, 0),
    createMine(cx - 85, cy + 92, 230, 0),
    createCrate(cx - 145, cy - 42, 180, 2.8),
    createBomb(cx + 185, cy + 18, 240, 4.4),
    createBall(cx + 145, cy - 55, 270, 6.0),
    createStickyBomb(cx + 120, cy + 82, 240, 7.6),
    createMine(cx + 55, cy - 88, 250, 9.0),
    createHeavyBox(cx, cy - 10, 240, 10.5),
  ];
}

/**
 * Spawns a brief expanding 2.5D dust/impact ring on the floor when landing.
 */
export function spawnLandingRing(x, y) {
  let age = 0;
  const duration = 0.28;

  const ring = add([
    pos(x, y),
    scale(1, ARENA_CONFIG.PERSPECTIVE_Y_SCALE),
    z(-10), // On the arena floor beneath the player's boots
    {
      update() {
        age += dt();
        if (age >= duration) {
          destroy(this);
        }
      },
      draw() {
        const progress = age / duration;
        const radius = lerp(14, 38, progress);
        const alpha = (1 - progress) * 0.55;

        drawCircle({
          pos: vec2(0, 0),
          radius,
          fill: false,
          outline: {
            width: 3 * (1 - progress * 0.5),
            color: rgb(185, 230, 255),
            opacity: alpha,
          },
        });
      },
    },
  ]);
  return ring;
}

/**
 * Spawns a giant, high-contrast "KO!! RING OUT!" comic banner on foreground
 * layer z(950) at the cliff edge whenever a target is knocked off the arena!
 */
export function spawnRingOutBanner(x, y) {
  let age = 0;
  const duration = 1.05;

  // Keep the banner well inside the visible screen bounds
  const safeX = clamp(x, 90, GAME_CONFIG.WIDTH - 90);
  const safeY = clamp(y, 90, GAME_CONFIG.HEIGHT - 75);

  add([
    pos(safeX, safeY),
    z(950),
    {
      update() {
        age += dt();
        if (age >= duration) destroy(this);
      },
      draw() {
        const progress = age / duration;
        const alpha = progress < 0.7 ? 1.0 : 1.0 - (progress - 0.7) / 0.3;
        const popScale =
          age < 0.12
            ? lerp(0.45, 1.08, age / 0.12)
            : lerp(1.08, 0.96, Math.min(1, (age - 0.12) / 0.15));

        const floatY = -52 - progress * 22;

        pushTransform();
        pushTranslate(0, floatY);
        pushScale(popScale, popScale);

        // 1. Subtle golden KO ring
        if (age < 0.35) {
          const rProg = age / 0.35;
          drawCircle({
            pos: vec2(0, 0),
            radius: lerp(14, 44, rProg),
            fill: false,
            outline: {
              width: 3 * (1 - rProg),
              color: rgb(255, 230, 70),
              opacity: (1 - rProg) * 0.8,
            },
          });
        }

        // 2. Dark drop-shadow backing plate
        drawRect({
          pos: vec2(-51, -12),
          width: 104,
          height: 27,
          radius: 7,
          color: rgb(12, 14, 26),
          opacity: alpha * 0.9,
        });

        // 3. Compact Gold & Crimson Comic Pill
        drawRect({
          pos: vec2(-52, -14),
          width: 104,
          height: 26,
          radius: 7,
          color: rgb(255, 215, 45),
          opacity: alpha,
          outline: {
            width: 2.5,
            color: rgb(225, 35, 35),
          },
        });

        // 4. Crisp 12px "KO! RING OUT!" text
        drawText({
          text: "KO! RING OUT!",
          pos: vec2(-43, -6),
          size: 12,
          color: rgb(195, 22, 22),
          opacity: alpha,
        });

        popTransform();
      },
    },
  ]);
}

/**
 * Spawns soft, drifting background particles in the sky void behind the arena.
 */
export function createAmbientBackground() {
  const moteCount = 32;
  const motes = [];

  for (let i = 0; i < moteCount; i++) {
    motes.push({
      x: rand(-200, GAME_CONFIG.WIDTH + 200),
      y: rand(-150, GAME_CONFIG.HEIGHT + 150),
      radius: rand(1.5, 4.5),
      speedY: rand(-14, -5),
      alpha: rand(0.12, 0.35),
      phase: rand(0, Math.PI * 2),
    });
  }

  add([
    pos(0, 0),
    z(-200), // Always behind the arena
    {
      draw() {
        const t = time();

        // Subtle atmospheric horizon glow behind the platform
        drawCircle({
          pos: vec2(ARENA_CONFIG.CENTER_X, ARENA_CONFIG.CENTER_Y - 20),
          radius: 540,
          color: rgb(32, 48, 86),
          opacity: 0.22,
        });

        // Draw drifting sky motes
        for (const m of motes) {
          m.y += m.speedY * dt();
          if (m.y < -150) {
            m.y = GAME_CONFIG.HEIGHT + 150;
          }
          const pulse = 0.75 + 0.25 * Math.sin(t * 2 + m.phase);
          drawCircle({
            pos: vec2(m.x, m.y),
            radius: m.radius,
            color: rgb(130, 195, 255),
            opacity: m.alpha * pulse,
          });
        }
      },
    },
  ]);
}

/**
 * Builds the multi-layered 2.5D Circular Arena.
 * We use KAPLAY's `scale(1, PERSPECTIVE_Y_SCALE)` component so every circle
 * drawn inside this object is automatically rendered as a 2.5D perspective ellipse.
 */
export function createFloatingArena() {
  const C = ARENA_CONFIG.COLORS;
  const R = ARENA_CONFIG.RADIUS;
  const depth = ARENA_CONFIG.PLATFORM_DEPTH;

  // Main arena renderer positioned at the arena center
  add([
    pos(ARENA_CONFIG.CENTER_X, ARENA_CONFIG.CENTER_Y),
    // Compressing Y by 0.64 transforms 2D circles into 2.5D perspective ellipses!
    scale(1, ARENA_CONFIG.PERSPECTIVE_Y_SCALE),
    z(-50), // Floor layer (players and objects will sort above this in Milestone 4)
    {
      draw() {
        const t = time();
        // Subtle floating hover oscillation for the entire sky island
        const hoverOffset = Math.sin(t * 1.5) * 3.5;

        // --------------------------------------------------------------------
        // A. DEEP ABYSS SHADOW (far below the floating platform)
        // --------------------------------------------------------------------
        drawCircle({
          pos: vec2(0, depth * 2.3 + hoverOffset),
          radius: R + 42,
          color: rgb(...C.ABYSS_SHADOW),
          opacity: 0.65,
        });

        // --------------------------------------------------------------------
        // B. 3D EXTRUDED PLATFORM UNDERBELLY (stacked vertical layers)
        // --------------------------------------------------------------------
        // Lower tapered pillar base
        drawCircle({
          pos: vec2(0, depth * 1.45 + hoverOffset),
          radius: R - 26,
          color: rgb(22, 28, 48),
        });

        // Main dark cliff wall
        drawCircle({
          pos: vec2(0, depth + hoverOffset),
          radius: R + 18,
          color: rgb(...C.CLIFF_DARK),
        });

        // Middle structural bevel band
        drawCircle({
          pos: vec2(0, depth * 0.52 + hoverOffset),
          radius: R + 20,
          color: rgb(...C.CLIFF_MID),
        });

        // --------------------------------------------------------------------
        // C. RAISED OUTER BOUNDARY RIM (the curb around the arena)
        // --------------------------------------------------------------------
        // Outer dark curb shadow
        drawCircle({
          pos: vec2(0, 8 + hoverOffset),
          radius: R + 20,
          color: rgb(...C.RIM_OUTER),
        });

        // Top lit rim bevel
        drawCircle({
          pos: vec2(0, hoverOffset),
          radius: R + 18,
          color: rgb(...C.RIM_HIGHLIGHT),
        });

        // --------------------------------------------------------------------
        // D. PLAYABLE ARENA SURFACE (exact radius = ARENA_CONFIG.RADIUS)
        // --------------------------------------------------------------------
        drawCircle({
          pos: vec2(0, hoverOffset),
          radius: R,
          color: rgb(...C.FLOOR_BASE),
        });

        // Outer danger-zone warning ring (lets players see when they are near the edge)
        drawCircle({
          pos: vec2(0, hoverOffset),
          radius: R,
          fill: false,
          outline: {
            width: 5,
            color: rgb(...C.DANGER_RING),
            opacity: 0.45,
          },
        });

        // Inner recessed ring near the boundary
        drawCircle({
          pos: vec2(0, hoverOffset),
          radius: R * 0.91,
          fill: false,
          outline: {
            width: 2.5,
            color: rgb(184, 152, 108),
            opacity: 0.65,
          },
        });

        // --------------------------------------------------------------------
        // E. INNER ARENA GEOMETRY & COURT MARKINGS
        // --------------------------------------------------------------------
        // Mid-court stone ring
        drawCircle({
          pos: vec2(0, hoverOffset),
          radius: R * 0.64,
          color: rgb(...C.FLOOR_INNER),
          outline: {
            width: 3.5,
            color: rgb(172, 138, 92),
          },
        });

        // Diagonal & cardinal arena court lines
        const lineRadius = R * 0.91;
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 4;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          drawLine({
            p1: vec2(-cos * lineRadius, -sin * lineRadius + hoverOffset),
            p2: vec2(cos * lineRadius, sin * lineRadius + hoverOffset),
            width: 3,
            color: rgb(176, 142, 96),
            opacity: 0.55,
          });
        }

        // Center brawl emblem disc
        drawCircle({
          pos: vec2(0, hoverOffset),
          radius: R * 0.26,
          color: rgb(...C.FLOOR_CENTER),
          outline: {
            width: 4,
            color: rgb(...C.ACCENT_GLOW),
            opacity: 0.85,
          },
        });

        // Pulsing center energy core ring
        const corePulse = 0.6 + 0.35 * Math.sin(t * 3.2);
        drawCircle({
          pos: vec2(0, hoverOffset),
          radius: R * 0.12,
          color: rgb(42, 62, 84),
          outline: {
            width: 3.5,
            color: rgb(...C.ACCENT_GLOW),
            opacity: corePulse,
          },
        });

        // --------------------------------------------------------------------
        // F. PERIMETER ACCENT NODES (glowing bumpers along the outer rim)
        // --------------------------------------------------------------------
        const nodeCount = ARENA_CONFIG.RIM_NODE_COUNT;
        const nodeRadius = R + 9;
        for (let i = 0; i < nodeCount; i++) {
          const angle = (i / nodeCount) * Math.PI * 2;
          const nx = Math.cos(angle) * nodeRadius;
          const ny = Math.sin(angle) * nodeRadius + hoverOffset;

          // Node housing (warm dark bronze)
          drawCircle({
            pos: vec2(nx, ny),
            radius: 10,
            color: rgb(68, 46, 38),
            outline: {
              width: 2,
              color: rgb(255, 215, 115),
            },
          });

          // Glowing turquoise node beacon
          drawCircle({
            pos: vec2(nx, ny),
            radius: 5,
            color: rgb(...C.ACCENT_GLOW),
            opacity: 0.8 + 0.2 * Math.sin(t * 4 + i),
          });
        }
      },
    },
  ]);
}

/**
 * Spawns depth-sorted 2.5D arena objects (two Crystal Braziers + optional Center Sparring Dummy).
 * When `includeTestDummy === false` (in Normal Game mode), only the Crystal Braziers are spawned!
 */
export function createDepthTestProps(includeTestDummy = true) {
  const props = [];

  // 1. Left & Right Crystal Energy Totems (Ring/flash when punched!)
  const totemPositions = [
    { x: ARENA_CONFIG.CENTER_X - 235, y: ARENA_CONFIG.CENTER_Y - 14 },
    { x: ARENA_CONFIG.CENTER_X + 235, y: ARENA_CONFIG.CENTER_Y - 14 },
  ];

  for (const pt of totemPositions) {
    const totem = add([
      pos(pt.x, pt.y),
      z(Math.round(pt.y)),
      "arenaProp",
      "punchable",
      {
        footprintRadius: 20,
        propHeight: 58,
        hitFlashTimer: 0,
        orbShake: 0,
        onPunchHit(dir, force) {
          this.hitFlashTimer = 0.18;
          this.orbShake = 10;
        },
        update() {
          const delta = dt();
          updateDepthSort(this);
          this.hitFlashTimer = Math.max(0, this.hitFlashTimer - delta);
          this.orbShake = lerp(this.orbShake, 0, Math.min(1, 12 * delta));
        },
        draw() {
          const t = time();
          const dScale = computeDepthScale(this.pos.y);
          const floatCrystal = Math.sin(t * 3 + this.pos.x) * 4;
          const shakeX = Math.sin(t * 45) * this.orbShake;

          drawGroundShadow({
            radius: this.footprintRadius,
            zHeight: 0,
            overArena: true,
          });

          pushTransform();
          pushScale(dScale, dScale);

          // Stone pedestal base
          drawRect({
            pos: vec2(-16 + shakeX * 0.3, -24),
            width: 32,
            height: 24,
            radius: 5,
            color:
              this.hitFlashTimer > 0 ? rgb(255, 245, 200) : rgb(118, 92, 74),
            outline: { width: 2.5, color: rgb(58, 42, 34) },
          });

          // Golden trim band on pedestal
          drawRect({
            pos: vec2(-18 + shakeX * 0.3, -26),
            width: 36,
            height: 6,
            radius: 3,
            color: rgb(245, 198, 92),
            outline: { width: 2, color: rgb(92, 62, 28) },
          });

          // Floating turquoise crystal orb above the pedestal
          drawCircle({
            pos: vec2(shakeX, -44 + floatCrystal),
            radius: this.hitFlashTimer > 0 ? 14 : 12,
            color:
              this.hitFlashTimer > 0 ? rgb(255, 255, 255) : rgb(38, 225, 208),
            outline: { width: 2.5, color: rgb(210, 255, 250) },
          });

          drawCircle({
            pos: vec2(-4 + shakeX, -48 + floatCrystal),
            radius: 3.5,
            color: rgb(255, 255, 255),
          });

          popTransform();
        },
      },
    ]);
    props.push(totem);
  }

  // Only spawn the Sparring Target Dummy inside the Developer Test Area!
  if (!includeTestDummy) {
    return props;
  }

  // 2. Center-North Sparring Target Dummy (Developer Test Sandbox only!)
  const dummySpawn = vec2(ARENA_CONFIG.CENTER_X, ARENA_CONFIG.CENTER_Y - 95);
  const dummy = add([
    pos(dummySpawn.x, dummySpawn.y),
    z(Math.round(dummySpawn.y)),
    "arenaProp",
    "sparringDummy",
    "punchable",
    {
      footprintRadius: 19,
      propHeight: 56,
      velocity: vec2(0, 0),
      zHeight: 0,
      velZ: 0,
      isGrounded: true,
      isFallingInVoid: false,
      wobbleAngle: 0,
      hitFlashTimer: 0,
      totalHitsTaken: 0,

      /**
       * Triggered by playerCombat.js when a punch connects with the dummy!
       */
      onPunchHit(dir, force) {
        this.totalHitsTaken += 1;
        this.hitFlashTimer = 0.16;

        // Apply horizontal knockback across the sandstone floor
        this.velocity.x = dir.x * force * 0.85;
        this.velocity.y =
          dir.y * force * 0.85 * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

        // Pop the dummy slightly into the air on impact!
        this.velZ = 210;
        this.isGrounded = false;

        // Dramatic tilt in the direction of the punch
        this.wobbleAngle = (dir.x >= 0 ? 1 : -1) * 34;
      },

      update() {
        const delta = dt();

        // 1. Apply horizontal slide velocity & friction
        this.pos.x += this.velocity.x * delta;
        this.pos.y += this.velocity.y * delta;

        const friction = this.isGrounded ? 980 : 280;
        if (Math.hypot(this.velocity.x, this.velocity.y) <= friction * delta) {
          this.velocity = vec2(0, 0);
        } else {
          const angle = Math.atan2(this.velocity.y, this.velocity.x);
          this.velocity.x -= Math.cos(angle) * friction * delta;
          this.velocity.y -= Math.sin(angle) * friction * delta;
        }

        // 2. Check if the dummy was knocked off the circular arena!
        const overArena = isPointOnArena(this.pos.x, this.pos.y);
        if (this.isGrounded && !overArena) {
          this.isGrounded = false;
          this.isFallingInVoid = true;
          this.velZ = -40;
          spawnRingOutBanner(this.pos.x, this.pos.y);
        }

        if (!this.isGrounded) {
          this.velZ -= PLAYER_CONFIG.PLAYER_GRAVITY * delta;
          this.zHeight += this.velZ * delta;

          if (this.zHeight <= 0) {
            if (overArena && !this.isFallingInVoid) {
              this.zHeight = 0;
              this.velZ = 0;
              this.isGrounded = true;
              spawnLandingRing(this.pos.x, this.pos.y);
            } else if (!this.isFallingInVoid) {
              this.isFallingInVoid = true;
              spawnRingOutBanner(this.pos.x, this.pos.y);
            }
          }
        }

        // 3. Respawn the Sparring Dummy if knocked deep into the abyss!
        if (this.zHeight < PLAYER_CONFIG.ABYSS_RESPAWN_Z) {
          this.pos.x = dummySpawn.x;
          this.pos.y = dummySpawn.y;
          this.velocity = vec2(0, 0);
          this.zHeight = 220;
          this.velZ = 0;
          this.isGrounded = false;
          this.isFallingInVoid = false;
          this.wobbleAngle = 0;
        }

        // 4. Update 2.5D depth sorting (including falling behind the North cliff!)
        updateDepthSort(this);

        // 5. Recover wobble & hit flash
        this.wobbleAngle = lerp(
          this.wobbleAngle,
          this.isFallingInVoid ? Math.sin(time() * 14) * 35 : 0,
          Math.min(1, 9 * delta)
        );
        this.hitFlashTimer = Math.max(0, this.hitFlashTimer - delta);
      },

      draw() {
        const overArena = isPointOnArena(this.pos.x, this.pos.y);
        const dScale = computeDepthScale(this.pos.y);
        const abyssScale = this.isFallingInVoid
          ? clamp(1 + this.zHeight / 640, 0.35, 1.0)
          : 1.0;
        const totalScale = dScale * abyssScale;
        const isFlashing = this.hitFlashTimer > 0;

        // 2.5D ground shadow
        drawGroundShadow({
          radius: this.footprintRadius,
          zHeight: this.zHeight,
          overArena,
          isFallingInVoid: this.isFallingInVoid,
          ringColor: [235, 95, 75],
        });

        pushTransform();
        pushTranslate(0, -this.zHeight);
        pushTranslate(0, -24);
        pushRotate(this.wobbleAngle);
        pushScale(totalScale, totalScale);
        pushTranslate(0, 24);

        // Wooden spring post
        drawRect({
          pos: vec2(-5, -18),
          width: 10,
          height: 18,
          radius: 2,
          color: isFlashing ? rgb(255, 255, 255) : rgb(135, 88, 48),
          outline: { width: 2, color: rgb(62, 38, 20) },
        });

        // Padded red/gold sparring torso
        drawRect({
          pos: vec2(-14, -44),
          width: 28,
          height: 28,
          radius: 8,
          color: isFlashing ? rgb(255, 245, 200) : rgb(228, 78, 68),
          outline: { width: 2.5, color: rgb(88, 28, 24) },
        });

        // Bullseye target rings on chest
        drawCircle({
          pos: vec2(0, -30),
          radius: 8,
          color: rgb(255, 242, 215),
        });
        drawCircle({
          pos: vec2(0, -30),
          radius: 4,
          color: rgb(235, 65, 55),
        });

        // Dummy head
        drawCircle({
          pos: vec2(0, -54),
          radius: 11,
          color: isFlashing ? rgb(255, 255, 255) : rgb(238, 204, 154),
          outline: { width: 2.5, color: rgb(88, 58, 32) },
        });

        // Comic "KO!!" bubble when the dummy is knocked off the cliff!
        if (this.isFallingInVoid) {
          drawRect({
            pos: vec2(-22, -82),
            width: 44,
            height: 17,
            radius: 5,
            color: rgb(255, 235, 110),
            outline: { width: 2, color: rgb(225, 55, 45) },
          });
          drawText({
            text: "KO!!",
            pos: vec2(-14, -78),
            size: 11,
            color: rgb(215, 35, 35),
          });
        }

        popTransform();
      },
    },
  ]);
  props.push(dummy);

  return props;
}

/**
 * Resolves 2.5D circular footprint collisions between the player and arena props
 * when the player is lower than the top of the prop (zHeight < prop.propHeight).
 */
export function resolvePropFootprintCollisions(player, props) {
  if (player.isFallingInVoid) return;

  for (const prop of props) {
    if (prop.isFallingInVoid) continue;
    // Allow the player to jump OVER the prop if zHeight is higher than the prop!
    if (player.zHeight > prop.propHeight - 10) continue;

    const dx = player.pos.x - prop.pos.x;
    const dy = (player.pos.y - prop.pos.y) / ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
    const dist = Math.hypot(dx, dy);
    const minDist = PLAYER_CONFIG.FOOTPRINT_RADIUS + prop.footprintRadius;

    if (dist < minDist && dist > 0.001) {
      const overlap = minDist - dist;
      const nx = dx / dist;
      const ny = dy / dist;

      player.pos.x += nx * overlap;
      player.pos.y += ny * overlap * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
    }
  }
}

/**
 * Renders a pulsing turquoise target ring on the floor and a compact "E : GRAB"
 * prompt above the nearest pickupable object whenever Volt's hands are free!
 * (Note: Never use square brackets like [E] inside KAPLAY drawText, because KAPLAY
 * parses square brackets as rich-text style tags!)
 */
export function createPickupPromptRenderer(player) {
  add([
    pos(0, 0),
    z(890), // Above arena objects so the prompt is always crisp and readable
    {
      draw() {
        if (player.heldObject || !player.nearestPickupCandidate) return;

        const target = player.nearestPickupCandidate;
        if (
          !target ||
          target.isCarried ||
          target.isFallingInVoid ||
          target.isWaitingToDrop
        ) {
          return;
        }

        const t = time();
        const pulse = Math.sin(t * 7) * 2.5;
        const ringRadius = (target.footprintRadius || 16) + 8 + pulse;
        const isFighterTarget = target.objectType === "fighter";
        const highlightColor = isFighterTarget
          ? rgb(255, 195, 55)
          : rgb(65, 245, 220);

        // 1. Pulsing 2.5D selection ring around the base of the pickupable object or fighter
        pushTransform();
        pushTranslate(target.pos.x, target.pos.y);
        pushScale(1, ARENA_CONFIG.PERSPECTIVE_Y_SCALE);
        drawCircle({
          pos: vec2(0, 0),
          radius: ringRadius,
          fill: false,
          outline: {
            width: 2.5,
            color: highlightColor,
            opacity: 0.85,
          },
        });
        popTransform();

        // 2. Compact floating "E : GRAB" or "E : GRAB FOE" pill above the target (no square brackets!)
        const badgeY =
          target.pos.y -
          (target.zHeight || 0) -
          (target.propHeight || 30) -
          (isFighterTarget ? 34 : 20) +
          Math.sin(t * 6) * 2;

        const pillWidth = isFighterTarget ? 88 : 56;
        const labelText = isFighterTarget ? "E : GRAB FOE" : "E : GRAB";

        pushTransform();
        pushTranslate(target.pos.x, badgeY);

        drawRect({
          pos: vec2(-pillWidth * 0.5, -10),
          width: pillWidth,
          height: 18,
          radius: 5,
          color: rgb(14, 22, 38),
          opacity: 0.92,
          outline: {
            width: 1.8,
            color: highlightColor,
          },
        });

        drawText({
          text: labelText,
          pos: vec2(-pillWidth * 0.5 + 7, -5),
          size: 10,
          color: isFighterTarget ? rgb(255, 230, 110) : rgb(125, 255, 230),
        });

        popTransform();
      },
    },
  ]);
}

/**
 * Displays the clean, player-facing Normal Game Arcade Match Scoreboard HUD
 * (VOLT vs PYRO, HP & Stamina bars, KO Score, and controls banner).
 */
function createNormalGameHUD(player, enemyBot) {
  add([
    fixed(),
    z(1000),
    {
      draw() {
        const cx = GAME_CONFIG.WIDTH * 0.5;

        // 1. Top-Center VS Match Scoreboard Banner
        drawRect({
          pos: vec2(cx - 250, 12),
          width: 500,
          height: 62,
          radius: 10,
          color: rgb(12, 16, 28),
          opacity: 0.88,
          outline: { width: 2, color: rgb(64, 92, 142) },
        });

        // Left Fighter: VOLT (Player 1)
        const p1Hp = clamp((player.health || 0) / 100, 0, 1);
        const p1Stam = clamp((player.stamina ?? 100) / 100, 0, 1);

        drawText({
          text: `VOLT  (KOs: ${player.ringOutCount})`,
          pos: vec2(cx - 234, 20),
          size: 13,
          color: rgb(95, 235, 255),
        });

        // Volt HP Bar
        drawRect({
          pos: vec2(cx - 234, 38),
          width: 170,
          height: 10,
          radius: 4,
          color: rgb(24, 30, 48),
        });
        if (p1Hp > 0) {
          drawRect({
            pos: vec2(cx - 234, 38),
            width: Math.max(4, 170 * p1Hp),
            height: 10,
            radius: 4,
            color: rgb(45, 225, 210),
          });
        }

        // Volt Stamina Bar
        drawRect({
          pos: vec2(cx - 234, 52),
          width: 170,
          height: 6,
          radius: 3,
          color: rgb(20, 26, 42),
        });
        if (p1Stam > 0) {
          drawRect({
            pos: vec2(cx - 234, 52),
            width: Math.max(3, 170 * p1Stam),
            height: 6,
            radius: 3,
            color: player.isStaminaExhausted
              ? rgb(255, 95, 55)
              : rgb(165, 255, 85),
          });
        }

        // Center "VS" Badge
        drawCircle({
          pos: vec2(cx, 43),
          radius: 20,
          color: rgb(28, 38, 66),
          outline: { width: 2, color: rgb(255, 215, 75) },
        });
        drawText({
          text: "VS",
          pos: vec2(cx - 10, 37),
          size: 13,
          color: rgb(255, 225, 85),
        });

        // Right Fighter: PYRO (AI Rival)
        const p2Hp = clamp((enemyBot.health || 0) / 100, 0, 1);

        drawText({
          text: `PYRO  (KOs: ${enemyBot.ringOutCount})`,
          pos: vec2(cx + 64, 20),
          size: 13,
          color: rgb(255, 135, 115),
        });

        drawRect({
          pos: vec2(cx + 64, 38),
          width: 170,
          height: 10,
          radius: 4,
          color: rgb(24, 30, 48),
        });
        if (p2Hp > 0) {
          drawRect({
            pos: vec2(cx + 64, 38),
            width: Math.max(4, 170 * p2Hp),
            height: 10,
            radius: 4,
            color: rgb(245, 75, 65),
          });
        }

        drawText({
          text: "ARENA BRAWL MODE",
          pos: vec2(cx + 64, 53),
          size: 10,
          color: rgb(185, 198, 225),
        });

        // 2. Bottom Controls Helper Pill (No square brackets!)
        drawRect({
          pos: vec2(cx - 310, GAME_CONFIG.HEIGHT - 34),
          width: 620,
          height: 24,
          radius: 6,
          color: rgb(12, 16, 28),
          opacity: 0.82,
          outline: { width: 1.5, color: rgb(52, 72, 112) },
        });

        drawText({
          text: "WASD : Move  |  SHIFT : Sprint  |  SPACE : Jump / Escape  |  E : Grab  |  J / K : Punch & Throw  |  ESC : Menu",
          pos: vec2(cx - 296, GAME_CONFIG.HEIGHT - 27),
          size: 10.5,
          color: rgb(205, 220, 245),
        });
      },
    },
  ]);
}



