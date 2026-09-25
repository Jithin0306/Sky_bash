// ============================================================================
// src/scenes/devTest.js
// ============================================================================
// Restricted Developer-Only Test Sandbox Scene ("devTest"):
// - Strictly protected by `DEV_CONFIG.STORAGE_KEY` (only accessible after
//   unlocking the Developer PIN Gate in `src/scenes/menu.js`!).
// - Includes the Sparring Target Dummy, live AI toggle (`T`), instant item
//   spawner hotkeys (`1`–`6`), instant explosive trigger (`B`), God Mode (`G`),
//   full heal (`H`), and live physics/AI telemetry HUD.
// ============================================================================

import {
  GAME_CONFIG,
  ARENA_CONFIG,
  CAMERA_CONFIG,
  DEV_CONFIG,
} from "../config/gameConfig.js";
import { createArenaCamera } from "../systems/camera.js";
import { readLocalPlayerInput } from "../systems/input.js";
import { createPlayer } from "../player/Player.js";
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
import {
  createAmbientBackground,
  createFloatingArena,
  createDepthTestProps,
  resolvePropFootprintCollisions,
  createPickupPromptRenderer,
  spawnLandingRing,
  spawnRingOutBanner,
} from "./arena.js";

/**
 * Checks if the current session has unlocked Developer Access.
 */
export function isDevAccessUnlocked() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("dev") === DEV_CONFIG.PASSCODE) {
      sessionStorage.setItem(DEV_CONFIG.STORAGE_KEY, "true");
      return true;
    }
    return sessionStorage.getItem(DEV_CONFIG.STORAGE_KEY) === "true";
  } catch (e) {
    return false;
  }
}

/**
 * Registers the restricted "devTest" scene with KAPLAY.
 */
export function registerDevTestScene() {
  scene("devTest", () => {
    // 0. SECURITY GUARD: Block unauthorized access and redirect to Main Menu!
    if (!isDevAccessUnlocked()) {
      go("menu");
      return;
    }

    // 1. Initialize the 2.5D camera controller
    const camera = createArenaCamera();

    // 2. Create background & 2.5D Circular Arena
    createAmbientBackground();
    createFloatingArena();

    // 3. Spawn VOLT (Player 1) & PYRO (AI Test Opponent)
    const player = createPlayer(
      ARENA_CONFIG.CENTER_X - 145,
      ARENA_CONFIG.CENTER_Y + 65,
      {
        playerId: 1,
        displayName: "VOLT (DEV)",
        ringColor: [25, 225, 175],
        camera,
      }
    );

    const enemyBot = createPlayer(
      ARENA_CONFIG.CENTER_X + 145,
      ARENA_CONFIG.CENTER_Y - 35,
      {
        playerId: 2,
        displayName: "PYRO (BOT)",
        isAI: true,
        speedMultiplier: 0.62,
        colors: PYRO_BOT_PALETTE,
        ringColor: [245, 78, 65],
        camera,
      }
    );
    enemyBot.facing = vec2(-1, 0.3);

    // 4. Spawn Developer Test Props (Includes the Center Sparring Target Dummy!)
    const props = createDepthTestProps(true);

    // 5. Spawn initial test assortment right away (0s delay in Dev Test Lab!)
    const cx = ARENA_CONFIG.CENTER_X;
    const cy = ARENA_CONFIG.CENTER_Y;
    const physicsObjects = [
      createStickyBomb(cx - 175, cy + 20, 180, 0),
      createMine(cx - 85, cy + 92, 190, 0),
      createBomb(cx + 185, cy + 18, 200, 0),
      createCrate(cx - 145, cy - 42, 180, 0),
      createBall(cx + 145, cy - 55, 210, 0),
      createHeavyBox(cx, cy + 115, 200, 0),
    ];

    // 6. Initialize Pyro AI Controller
    const aiController = createEnemyAIController(
      enemyBot,
      player,
      physicsObjects
    );

    let godMode = false;
    let lastSpawnedLabel = "NONE (Press 1-6 to Spawn)";

    // Helper to spawn any item directly in front of Volt on demand!
    function spawnDevItem(factoryFn, label) {
      const dropX = clamp(
        player.pos.x + player.facing.x * 62,
        cx - 360,
        cx + 360
      );
      const dropY = clamp(
        player.pos.y + player.facing.y * 42,
        cy - 220,
        cy + 220
      );
      const newObj = factoryFn(dropX, dropY, 185, 0);
      physicsObjects.push(newObj);
      lastSpawnedLabel = label;
    }

    // --- DEVELOPER SPAWNER HOTKEYS (1 - 6) ---
    onKeyPress("1", () => spawnDevItem(createBomb, "SKY FUSE BOMB"));
    onKeyPress("2", () => spawnDevItem(createStickyBomb, "SLIME STICKY BOMB"));
    onKeyPress("3", () => spawnDevItem(createMine, "PROXIMITY LANDMINE"));
    onKeyPress("4", () => spawnDevItem(createCrate, "SUPPLY CRATE"));
    onKeyPress("5", () => spawnDevItem(createBall, "BRAWLER SPHERE"));
    onKeyPress("6", () => spawnDevItem(createHeavyBox, "IRON HEAVY BOX"));

    // --- DEVELOPER DEBUG CONTROLS ---
    // T : Toggle Pyro AI Brain ON / OFF
    onKeyPress("t", () => {
      aiController.enabled = !aiController.enabled;
    });

    // R : Drop all existing physics objects fresh from the sky
    onKeyPress("r", () => {
      for (const obj of physicsObjects) {
        obj.respawnFromSky();
      }
      lastSpawnedLabel = "ALL ITEMS RESPAWNED";
    });

    // B : Ignite / Trigger all Bombs, Sticky Bombs, & Landmines
    onKeyPress("b", () => {
      for (const obj of physicsObjects) {
        if (
          obj.objectType === "bomb" ||
          obj.objectType === "stickyBomb" ||
          obj.objectType === "mine"
        ) {
          if (obj.isExplodedCooldown || obj.isWaitingToDrop) {
            obj.respawnFromSky();
          }
          if (typeof obj.ignite === "function") {
            obj.ignite();
          }
        }
      }
      lastSpawnedLabel = "ALL EXPLOSIVES IGNITED!";
    });

    // H : Instant Heal & Stamina Refill for both fighters
    onKeyPress("h", () => {
      player.health = 100;
      player.stamina = 100;
      player.isStaminaExhausted = false;
      enemyBot.health = 100;
      enemyBot.stamina = 100;
      lastSpawnedLabel = "HP & STAMINA REFILLED";
    });

    // G : Toggle Infinite Stamina & God Mode for Volt
    onKeyPress("g", () => {
      godMode = !godMode;
    });

    // L : Lock Developer Mode & return to Main Menu
    onKeyPress("l", () => {
      try {
        sessionStorage.removeItem(DEV_CONFIG.STORAGE_KEY);
      } catch (e) {}
      go("menu");
    });

    // ESC : Return to Main Menu
    onKeyPress("escape", () => {
      go("menu");
    });

    const fighters = [player, enemyBot];

    // 7. Main Developer Sandbox Update Loop
    onUpdate(() => {
      const inputState = readLocalPlayerInput();
      player.setInput(inputState);

      if (godMode) {
        player.health = 100;
        player.stamina = 100;
        player.isStaminaExhausted = false;
      }

      const aiInput = aiController.computeInput(dt());
      enemyBot.setInput(aiInput);

      updatePhysicsSystem(fighters, physicsObjects, props, camera);

      for (const f of fighters) {
        resolvePropFootprintCollisions(f, props);

        if (f.isFallingInVoid && !f.hasTriggeredRingOutBanner) {
          f.hasTriggeredRingOutBanner = true;
          spawnRingOutBanner(f.pos.x, f.pos.y);
          if (f === enemyBot) {
            player.ringOutCount += 1;
          } else {
            enemyBot.ringOutCount += 1;
          }
        }

        if (f.justLanded && f.landImpactSpeed > 200) {
          spawnLandingRing(f.pos.x, f.pos.y);
        }
      }

      camera.setTarget(player.pos);
    });

    // 8. Pickup Prompt & Developer Sandbox Telemetry HUD
    createPickupPromptRenderer(player);
    createDevTestHUD(
      player,
      enemyBot,
      aiController,
      physicsObjects,
      camera,
      () => godMode,
      () => lastSpawnedLabel
    );
  });
}

/**
 * Renders the Developer Sandbox Spawner Toolbar & Live Telemetry HUD.
 */
function createDevTestHUD(
  player,
  enemyBot,
  aiController,
  physicsObjects,
  camera,
  getGodMode,
  getLastSpawned
) {
  let isZoomedIn = false;

  onKeyPress("c", () => camera.shake(12));
  onKeyPress("z", () => {
    isZoomedIn = !isZoomedIn;
    camera.setZoom(isZoomedIn ? 1.0 : CAMERA_CONFIG.DEFAULT_ZOOM);
  });

  add([
    fixed(),
    z(1000),
    {
      draw() {
        // 1. Top-Left Developer Telemetry & Debug Console Card
        drawRect({
          pos: vec2(14, 12),
          width: 590,
          height: 136,
          radius: 10,
          color: rgb(10, 18, 26),
          opacity: 0.88,
          outline: {
            width: 2,
            color: rgb(55, 225, 165),
          },
        });

        drawText({
          text: "DEVELOPER TEST SANDBOX (AUTHORIZED DEV ACCESS ONLY)",
          pos: vec2(28, 22),
          size: 13,
          color: rgb(85, 255, 175),
        });

        drawText({
          text: "SPAWN KEYS ->  1 : Bomb  |  2 : Sticky Bomb  |  3 : Landmine  |  4 : Crate  |  5 : Ball  |  6 : Heavy",
          pos: vec2(28, 44),
          size: 11,
          color: rgb(255, 230, 110),
        });

        drawText({
          text: "DEBUG KEYS ->  T : Toggle AI  |  B : Detonate All  |  R : Respawn  |  H : Heal  |  G : God Mode",
          pos: vec2(28, 65),
          size: 11,
          color: rgb(205, 225, 250),
        });

        const stamPct = Math.round(player.stamina ?? 100);
        const godTag = getGodMode() ? "ON (INF STAMINA/HP)" : "OFF";
        drawText({
          text: `VOLT HP: ${player.health}% | STAMINA: ${stamPct}% | GOD MODE: ${godTag}   |   PYRO AI: ${enemyBot.aiStateLabel}`,
          pos: vec2(28, 88),
          size: 11,
          color: rgb(135, 245, 255),
        });

        drawText({
          text: `ACTIVE OBJECTS: ${physicsObjects.length}  |  LAST ACTION: ${getLastSpawned()}  |  L : Lock Dev  |  ESC : Menu`,
          pos: vec2(28, 112),
          size: 11,
          color: rgb(165, 245, 190),
        });
      },
    },
  ]);
}
