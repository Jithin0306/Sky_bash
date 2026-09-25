// ============================================================================
// src/scenes/multiplayerArena.js
// ============================================================================
// Multi-Fighter & Online P2P Synchronized Arena Scene ("multiplayerArena"):
// Supports BOTH Single-Player (vs AI Bots) and Online Trystero P2P Multiplayer:
// 1. "1v1" : 2-Fighter Duel (VOLT vs PYRO)
// 2. "2v2" : 4-Fighter Team Battle (Team Blue vs Team Red — with Team Halo Rings!)
// 3. "ffa" : 3-to-6 Fighter Free-For-All Chaos (VOLT, PYRO, BLITZ, NOVA, VORTEX, TITAN)
// ============================================================================

import {
  GAME_CONFIG,
  ARENA_CONFIG,
  CAMERA_CONFIG,
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
  createPowerUp,
  updatePowerUpSystem,
} from "../objects/powerup.js";
import {
  createEnemyAIController,
  FIGHTER_ROSTER,
} from "../ai/enemyAI.js";
import {
  createAmbientBackground,
  createFloatingArena,
  createDepthTestProps,
  resolvePropFootprintCollisions,
  spawnRingOutBanner,
  spawnLandingRing,
  createPickupPromptRenderer,
} from "./arena.js";
import {
  getActiveMatchConfig,
  leaveMultiplayerRoom,
} from "../network/trysteroManager.js";

/**
 * Computes evenly spaced ring spawn coordinates around the circular arena
 * for `2` to `6` fighters.
 */
function getRingSpawnCoordinates(slotIndex, totalFighters) {
  const angleRad =
    Math.PI + (slotIndex / Math.max(2, totalFighters)) * Math.PI * 2;
  const spawnRadius = 215;
  const x = ARENA_CONFIG.CENTER_X + Math.cos(angleRad) * spawnRadius;
  const y =
    ARENA_CONFIG.CENTER_Y +
    Math.sin(angleRad) * spawnRadius * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
  return {
    x,
    y,
    facingX: -Math.cos(angleRad),
    facingY: -Math.sin(angleRad),
  };
}

/**
 * Registers the "multiplayerArena" scene with KAPLAY.
 */
export function registerMultiplayerArenaScene() {
  scene("multiplayerArena", () => {
    const net = getActiveMatchConfig();
    const isOnline = Boolean(net.isOnline);
    const mode = net.mode || "1v1"; // "1v1" | "2v2" | "ffa"

    const camera = createArenaCamera();

    // 1. Background & 2.5D Floating Arena
    createAmbientBackground();
    createFloatingArena();

    // 2. Determine Participating Fighter Slots (2 to 6 fighters)
    const activeSlots = (net.slots || []).filter((s, idx) => {
      if (!isOnline) return true;
      return Boolean(s.peerId) || Boolean(net.fillWithBots) || idx < 2;
    });

    const totalFighters = Math.max(2, Math.min(6, activeSlots.length));
    const fighters = [];
    const aiControllers = [];
    const physicsObjects = [];
    const activePowerUps = [];

    let localFighter = null;

    for (let i = 0; i < totalFighters; i++) {
      const slotInfo = activeSlots[i] || {
        slot: i,
        name: (FIGHTER_ROSTER[i] || FIGHTER_ROSTER[0]).name,
        peerId: i === 0 ? net.selfPeerId : null,
        isBot: i !== 0,
        team: mode === "2v2" ? (i < 2 ? "blue" : "red") : "none",
      };

      const roster = FIGHTER_ROSTER[i] || FIGHTER_ROSTER[0];
      const spawn = getRingSpawnCoordinates(i, totalFighters);

      const isLocalHuman = isOnline
        ? slotInfo.peerId === net.selfPeerId
        : i === 0;
      const isRemoteHuman = isOnline && Boolean(slotInfo.peerId) && !isLocalHuman;
      const isBotFighter = !isLocalHuman && !isRemoteHuman;

      const f = createPlayer({
        x: spawn.x,
        y: spawn.y,
        name: roster.name,
        isAI: isBotFighter,
        palette: roster.palette,
        ringColor: roster.ringColor,
      });

      f.slotIndex = i;
      f.peerId = slotInfo.peerId || `BOT_${i}`;
      f.team = mode === "2v2" ? slotInfo.team || (i < 2 ? "blue" : "red") : "none";
      f.uiColor = roster.uiColor;
      f.displayTag =
        mode === "2v2"
          ? `P${i + 1} ${roster.name}`
          : `P${i + 1} ${roster.name}`;
      f.facing = vec2(spawn.facingX, spawn.facingY);
      f.cameraRef = camera;
      f.lives = 3;
      f.ringOutCount = 0;
      f.isEliminated = false;
      f.isRemoteHuman = isRemoteHuman;
      f.netTargetPos = vec2(spawn.x, spawn.y);
      f.netTargetZ = 0;

      if (isLocalHuman) {
        localFighter = f;
      }

      fighters.push(f);
      physicsObjects.push(f);
    }

    if (!localFighter) {
      localFighter = fighters[0];
    }

    // Create Autonomous AI Controllers for all Bot Fighters
    for (const f of fighters) {
      if (f.isAI) {
        const ai = createEnemyAIController(f, fighters, physicsObjects);
        aiControllers.push({ bot: f, ai });
      }
    }

    // 3. Spawn Arena Props & Explosives
    const props = createDepthTestProps(false);
    const crates = [
      createCrate(ARENA_CONFIG.CENTER_X - 95, ARENA_CONFIG.CENTER_Y - 58),
      createCrate(ARENA_CONFIG.CENTER_X + 95, ARENA_CONFIG.CENTER_Y - 58),
      createCrate(ARENA_CONFIG.CENTER_X, ARENA_CONFIG.CENTER_Y + 75),
    ];
    const balls = [
      createBall(ARENA_CONFIG.CENTER_X - 65, ARENA_CONFIG.CENTER_Y + 32),
      createBall(ARENA_CONFIG.CENTER_X + 65, ARENA_CONFIG.CENTER_Y - 22),
    ];
    const heavyBoxes = [
      createHeavyBox(ARENA_CONFIG.CENTER_X + 125, ARENA_CONFIG.CENTER_Y + 35),
    ];
    const bombs = [
      createBomb(ARENA_CONFIG.CENTER_X - 45, ARENA_CONFIG.CENTER_Y - 18),
      createBomb(ARENA_CONFIG.CENTER_X + 45, ARENA_CONFIG.CENTER_Y + 18),
    ];
    const stickyBombs = [
      createStickyBomb(ARENA_CONFIG.CENTER_X, ARENA_CONFIG.CENTER_Y - 72),
    ];
    const mines = [
      createMine(ARENA_CONFIG.CENTER_X - 115, ARENA_CONFIG.CENTER_Y + 25),
    ];

    physicsObjects.push(
      ...crates,
      ...balls,
      ...heavyBoxes,
      ...bombs,
      ...stickyBombs,
      ...mines
    );

    // 4. Match State, 99s Clock & Power-Up Drops
    let matchTimer = 99.0;
    let isMatchOver = false;
    let matchWinnerLabel = "";
    let matchWinnerColor = [95, 245, 255];
    let powerUpSpawnTimer = 7.5;
    let netSyncAccum = 0;
    let worldSyncAccum = 0;
    const powerUpCycle = ["gloves", "shield", "medkit"];
    let powerUpIndex = 0;

    function spawnRandomSkyPowerUp(forcedType = null, forcedX = null, forcedY = null) {
      if (activePowerUps.length >= 2) return;
      const angle = rand(0, Math.PI * 2);
      const dist = rand(45, ARENA_CONFIG.RADIUS * 0.58);
      const px =
        forcedX !== null ? forcedX : ARENA_CONFIG.CENTER_X + Math.cos(angle) * dist;
      const py =
        forcedY !== null
          ? forcedY
          : ARENA_CONFIG.CENTER_Y +
            Math.sin(angle) * dist * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;
      const pType = forcedType || powerUpCycle[powerUpIndex % powerUpCycle.length];
      powerUpIndex += 1;
      activePowerUps.push(createPowerUp(px, py, pType));

      if (isOnline && net.isHost && net.sendWorld) {
        net.sendWorld({
          type: "POWERUP_SPAWN",
          pType,
          x: px,
          y: py,
        });
      }
    }

    // 5. Wire Trystero Network Receivers (if Online)
    if (isOnline) {
      net.onRemoteMove = (data, peerId) => {
        if (!data) return;
        const target =
          fighters.find((f) => f.slotIndex === data.slot) ||
          fighters.find((f) => f.peerId === peerId);
        if (!target || target === localFighter) return;

        target.netTargetPos.x = data.x;
        target.netTargetPos.y = data.y;
        target.netTargetZ = data.z || 0;
        target.velocity.x = data.vx || 0;
        target.velocity.y = data.vy || 0;
        target.velZ = data.vz || 0;
        target.facing.x = data.fx || target.facing.x;
        target.facing.y = data.fy || target.facing.y;
        if (typeof data.hp === "number") target.health = data.hp;
        if (typeof data.lives === "number") target.lives = data.lives;
        if (typeof data.elim === "boolean") target.isEliminated = data.elim;
      };

      net.onRemoteCombat = (data, peerId) => {
        if (!data) return;
        const actor =
          fighters.find((f) => f.slotIndex === data.slot) ||
          fighters.find((f) => f.peerId === peerId);
        if (!actor || actor === localFighter) return;

        if (data.action === "punch") {
          actor.setInput({
            ...actor.input,
            punchPressed: true,
          });
        } else if (data.action === "pickup") {
          actor.setInput({
            ...actor.input,
            pickupPressed: true,
          });
        } else if (data.action === "throw") {
          actor.setInput({
            ...actor.input,
            throwPressed: true,
          });
        }
      };

      net.onWorldSync = (data) => {
        if (!data || net.isHost) return;
        if (data.type === "TIMER_SYNC" && typeof data.timer === "number") {
          matchTimer = data.timer;
        } else if (data.type === "POWERUP_SPAWN") {
          spawnRandomSkyPowerUp(data.pType, data.x, data.y);
        }
      };

      net.onMatchResult = (data) => {
        if (!data) return;
        if (data.type === "MATCH_OVER") {
          isMatchOver = true;
          matchWinnerLabel = data.winnerLabel || "MATCH COMPLETE!";
          matchWinnerColor = data.winnerColor || [95, 245, 255];
        } else if (data.type === "REMATCH") {
          go("multiplayerArena");
        }
      };
    }

    // Helper to evaluate if the match has been won (1v1, 2v2 Teams, or 3-6P FFA)
    function checkWinConditions(timeExpired = false) {
      if (isMatchOver) return;

      const aliveFighters = fighters.filter((f) => !f.isEliminated && f.lives > 0);

      if (mode === "2v2") {
        const blueAlive = aliveFighters.filter((f) => f.team === "blue");
        const redAlive = aliveFighters.filter((f) => f.team === "red");

        if (blueAlive.length === 0 || redAlive.length === 0 || timeExpired) {
          isMatchOver = true;
          const blueScore = blueAlive.reduce((s, f) => s + f.lives * 100 + f.health, 0);
          const redScore = redAlive.reduce((s, f) => s + f.lives * 100 + f.health, 0);

          if (blueScore >= redScore) {
            matchWinnerLabel = "TEAM BLUE WINS THE BATTLE!";
            matchWinnerColor = [75, 205, 255];
          } else {
            matchWinnerLabel = "TEAM RED WINS THE BATTLE!";
            matchWinnerColor = [255, 95, 95];
          }
        }
      } else {
        // 1v1 or Free-For-All (3-6P): Last standing fighter wins!
        if (aliveFighters.length <= 1 || timeExpired) {
          isMatchOver = true;
          let bestFighter = aliveFighters[0] || fighters[0];
          if (timeExpired && aliveFighters.length > 1) {
            bestFighter = [...aliveFighters].sort(
              (a, b) => b.lives * 100 + b.health - (a.lives * 100 + a.health)
            )[0];
          }
          const modeSuffix = mode === "ffa" ? "WINS FREE-FOR-ALL!" : "WINS THE DUEL!";
          matchWinnerLabel = `P${bestFighter.slotIndex + 1} ${bestFighter.name} ${modeSuffix}`;
          matchWinnerColor = bestFighter.uiColor || [95, 245, 255];
        }
      }

      if (isMatchOver && isOnline && net.isHost && net.sendResult) {
        net.sendResult({
          type: "MATCH_OVER",
          winnerLabel: matchWinnerLabel,
          winnerColor: matchWinnerColor,
        });
      }
    }

    // Rematch (`Space` / `Enter`) or Return to Menu (`Escape`)
    onKeyPress("space", () => {
      if (isMatchOver) {
        if (isOnline && net.isHost && net.sendResult) {
          net.sendResult({ type: "REMATCH" });
        }
        go("multiplayerArena");
      }
    });
    onKeyPress("enter", () => {
      if (isMatchOver) {
        if (isOnline && net.isHost && net.sendResult) {
          net.sendResult({ type: "REMATCH" });
        }
        go("multiplayerArena");
      }
    });
    onKeyPress("escape", () => {
      leaveMultiplayerRoom();
      go("menu");
    });

    // 6. Main Frame Update Loop
    onUpdate(() => {
      const delta = dt();

      if (isMatchOver) {
        for (const f of fighters) {
          f.setInput({
            moveX: 0,
            moveY: 0,
            isMoving: false,
            sprintHeld: false,
            jumpPressed: false,
            punchPressed: false,
            pickupPressed: false,
            throwPressed: false,
            dropPressed: false,
          });
        }
        updatePhysicsSystem(fighters, physicsObjects, props, camera);
        camera.setTarget(localFighter.pos);
        return;
      }

      // 1. Local Player Input & Instant Combat Broadcast
      if (!localFighter.isEliminated) {
        const inputSnapshot = readLocalPlayerInput();
        localFighter.setInput(inputSnapshot);

        if (isOnline && net.sendCombat) {
          if (inputSnapshot.punchPressed) {
            net.sendCombat({ slot: localFighter.slotIndex, action: "punch" });
          } else if (inputSnapshot.pickupPressed) {
            net.sendCombat({ slot: localFighter.slotIndex, action: "pickup" });
          } else if (inputSnapshot.throwPressed) {
            net.sendCombat({ slot: localFighter.slotIndex, action: "throw" });
          }
        }
      }

      // 2. Autonomous AI Bots Update (only on Host or Single-Player)
      if (!isOnline || net.isHost) {
        for (const { bot, ai } of aiControllers) {
          if (bot.isEliminated) continue;
          const aiInput = ai.computeInput(delta);
          bot.setInput(aiInput);
        }
      }

      // 3. Smooth Interpolation for Remote Human Fighters (60 FPS lerp)
      if (isOnline) {
        for (const f of fighters) {
          if (f.isRemoteHuman && !f.isEliminated && !f.isCarried) {
            f.pos.x = lerp(f.pos.x, f.netTargetPos.x, Math.min(1, delta * 14));
            f.pos.y = lerp(f.pos.y, f.netTargetPos.y, Math.min(1, delta * 14));
            f.zHeight = lerp(f.zHeight, f.netTargetZ, Math.min(1, delta * 14));
          }
        }
      }

      // 4. Match Timer & Sky Power-Up Spawns
      if (!isOnline || net.isHost) {
        matchTimer = Math.max(0, matchTimer - delta);
        if (matchTimer <= 0) {
          checkWinConditions(true);
        }

        powerUpSpawnTimer -= delta;
        if (powerUpSpawnTimer <= 0) {
          powerUpSpawnTimer = rand(10.5, 14.5);
          spawnRandomSkyPowerUp();
        }
      }

      // 5. Broadcast Local Fighter State at 30Hz (Online Mode)
      if (isOnline && net.sendMove) {
        netSyncAccum += delta;
        if (netSyncAccum >= 0.033) {
          netSyncAccum = 0;
          net.sendMove({
            slot: localFighter.slotIndex,
            x: Math.round(localFighter.pos.x),
            y: Math.round(localFighter.pos.y),
            z: Math.round(localFighter.zHeight),
            vx: Math.round(localFighter.velocity.x),
            vy: Math.round(localFighter.velocity.y),
            vz: Math.round(localFighter.velZ),
            fx: Number(localFighter.facing.x.toFixed(2)),
            fy: Number(localFighter.facing.y.toFixed(2)),
            hp: localFighter.health,
            lives: localFighter.lives,
            elim: localFighter.isEliminated,
          });
        }
      }

      if (isOnline && net.isHost && net.sendWorld) {
        worldSyncAccum += delta;
        if (worldSyncAccum >= 1.0) {
          worldSyncAccum = 0;
          net.sendWorld({
            type: "TIMER_SYNC",
            timer: matchTimer,
          });
        }
      }

      // 6. Physics & Power-Ups
      updatePhysicsSystem(fighters, physicsObjects, props, camera);
      updatePowerUpSystem(fighters, activePowerUps);

      // 7. Ring-Outs, 0% HP KOs, Stock Life Deduction & Sky Respawns
      for (const f of fighters) {
        if (f.isEliminated) {
          f.pos.x = -3000;
          f.pos.y = -3000;
          f.zHeight = 0;
          continue;
        }

        resolvePropFootprintCollisions(f, props);

        // Check 0% Health KO on the arena floor
        if (f.health <= 0 && !f.isFallingInVoid) {
          spawnRingOutBanner(f.pos.x, f.pos.y);
          f.lives = Math.max(0, (f.lives ?? 3) - 1);
          if (f.lives <= 0) {
            f.isEliminated = true;
            checkWinConditions(false);
            continue;
          } else {
            const sp = getRingSpawnCoordinates(f.slotIndex, totalFighters);
            f.respawn(sp.x, sp.y);
            f.spawnImmunityTimer = 2.2;
          }
        }

        // Check Void Ring-Out
        if (f.isFallingInVoid && !f.hasTriggeredRingOutBanner) {
          f.hasTriggeredRingOutBanner = true;
          spawnRingOutBanner(f.pos.x, f.pos.y);

          // Deduct 1 Stock Life
          f.lives = Math.max(0, (f.lives ?? 3) - 1);

          // Credit KO to last hitter or thrower
          if (f.thrower && f.thrower !== f) {
            f.thrower.ringOutCount = (f.thrower.ringOutCount || 0) + 1;
          }

          if (f.lives <= 0) {
            f.isEliminated = true;
            checkWinConditions(false);
            continue;
          }
        }

        // Sky Respawn after falling deep into the Void if lives > 0
        if (f.isFallingInVoid && f.zHeight < -420 && f.lives > 0) {
          const sp = getRingSpawnCoordinates(f.slotIndex, totalFighters);
          f.respawn(sp.x, sp.y);
          f.spawnImmunityTimer = 2.2;
        }

        if (f.justLanded && f.landImpactSpeed > 200) {
          spawnLandingRing(f.pos.x, f.pos.y);
        }
      }

      // Camera tracks local fighter (or nearest living fighter if local fighter is eliminated!)
      const camFocus =
        !localFighter.isEliminated
          ? localFighter
          : fighters.find((f) => !f.isEliminated) || localFighter;
      camera.setTarget(camFocus.pos);
    });

    // 7. Pickup Prompts & Dynamic 2-to-6 Player Scoreboard HUD
    createPickupPromptRenderer(localFighter);
    createMultiplayerScoreboardHUD(
      fighters,
      mode,
      isOnline,
      net.roomCode,
      () => matchTimer,
      () => isMatchOver,
      () => matchWinnerLabel,
      () => matchWinnerColor
    );
  });
}

/**
 * Renders the Dynamic 2-to-6 Fighter Scoreboard, Mode/Timer Badge, and Victory Podium.
 */
function createMultiplayerScoreboardHUD(
  fighters,
  mode,
  isOnline,
  roomCode,
  getMatchTimer,
  getIsMatchOver,
  getWinnerLabel,
  getWinnerColor
) {
  add([
    fixed(),
    z(1000),
    {
      draw() {
        const cx = GAME_CONFIG.WIDTH * 0.5;
        const count = fighters.length;

        // 1. Dynamic Top Fighter Cards (2 to 6 cards evenly spaced across the top)
        const cardW = count <= 2 ? 220 : count <= 4 ? 195 : 172;
        const gap = count <= 4 ? 14 : 8;
        const totalRowW = count * cardW + (count - 1) * gap;
        const startX = Math.max(12, cx - totalRowW * 0.5);

        for (let i = 0; i < count; i++) {
          const f = fighters[i];
          const x = startX + i * (cardW + gap);
          const y = 10;

          const isBlue = f.team === "blue";
          const isRed = f.team === "red";
          const accent = isBlue
            ? rgb(45, 175, 255)
            : isRed
            ? rgb(255, 75, 75)
            : rgb(...(f.uiColor || [95, 235, 255]));

          drawRect({
            pos: vec2(x, y),
            width: cardW,
            height: 54,
            radius: 8,
            color: rgb(12, 18, 32),
            opacity: f.isEliminated ? 0.45 : 0.88,
            outline: { width: 2, color: accent },
          });

          const teamLabel = isBlue ? "BLUE" : isRed ? "RED" : `P${i + 1}`;
          drawText({
            text: `${teamLabel} : ${f.name}`,
            pos: vec2(x + 10, y + 8),
            size: 11.5,
            color: accent,
          });

          // 3 Stock Life Orbs
          for (let s = 0; s < 3; s++) {
            const hasLife = s < (f.lives ?? 3);
            drawCircle({
              pos: vec2(x + cardW - 42 + s * 14, y + 14),
              radius: 5,
              color: hasLife ? accent : rgb(35, 42, 62),
              outline: { width: 1.2, color: rgb(225, 240, 255) },
            });
          }

          // HP Bar
          const hpBarW = cardW - 20;
          const hpRatio = clamp((f.health || 0) / 100, 0, 1);
          drawRect({
            pos: vec2(x + 10, y + 28),
            width: hpBarW,
            height: 8,
            radius: 4,
            color: rgb(26, 34, 54),
          });
          if (hpRatio > 0 && !f.isEliminated) {
            drawRect({
              pos: vec2(x + 10, y + 28),
              width: hpBarW * hpRatio,
              height: 8,
              radius: 4,
              color: accent,
            });
          }

          const statusStr = f.isEliminated
            ? "ELIMINATED"
            : `HP ${Math.round(f.health)}%  |  KO: ${f.ringOutCount || 0}`;
          drawText({
            text: statusStr,
            pos: vec2(x + 10, y + 40),
            size: 9.5,
            color: f.isEliminated ? rgb(255, 105, 105) : rgb(215, 232, 255),
          });
        }

        // 2. Match Clock & Mode Pill Below Top Cards
        const secs = Math.ceil(getMatchTimer());
        const modeTitle =
          mode === "2v2"
            ? "2v2 TEAM BATTLE"
            : mode === "ffa"
            ? `${count}-PLAYER FREE-FOR-ALL`
            : "1v1 DUEL";
        const netBadge = isOnline ? `ONLINE ROOM ${roomCode}` : "VS AI BOTS";

        drawRect({
          pos: vec2(cx - 165, 68),
          width: 330,
          height: 24,
          radius: 6,
          color: rgb(12, 18, 32),
          opacity: 0.85,
          outline: { width: 1.5, color: rgb(95, 215, 255) },
        });
        drawText({
          text: `${modeTitle} (${netBadge})   |   TIME: ${secs}s`,
          pos: vec2(cx - 150, 74),
          size: 10.5,
          color: secs <= 15 ? rgb(255, 95, 95) : rgb(225, 245, 255),
        });

        // 3. Bottom Controls Strip
        drawRect({
          pos: vec2(cx - 285, GAME_CONFIG.HEIGHT - 32),
          width: 570,
          height: 24,
          radius: 6,
          color: rgb(12, 16, 28),
          opacity: 0.78,
        });
        drawText({
          text: "WASD : Move  |  SHIFT : Sprint  |  SPACE : Jump  |  J : Punch  |  E : Grab  |  K : Throw  |  ESC : Menu",
          pos: vec2(cx - 270, GAME_CONFIG.HEIGHT - 25),
          size: 10,
          color: rgb(195, 215, 245),
        });

        // 4. Victory / Defeat Podium Overlay
        if (getIsMatchOver()) {
          const cy = GAME_CONFIG.HEIGHT * 0.5;
          const winCol = getWinnerColor();

          drawRect({
            pos: vec2(0, 0),
            width: GAME_CONFIG.WIDTH,
            height: GAME_CONFIG.HEIGHT,
            color: rgb(6, 10, 22),
            opacity: 0.78,
          });

          drawRect({
            pos: vec2(cx - 260, cy - 110),
            width: 520,
            height: 220,
            radius: 16,
            color: rgb(14, 22, 40),
            opacity: 0.96,
            outline: { width: 3.5, color: rgb(...winCol) },
          });

          drawText({
            text: "MATCH COMPLETE — CHAMPION CROWNED!",
            pos: vec2(cx - 165, cy - 82),
            size: 14,
            color: rgb(255, 225, 95),
          });

          drawText({
            text: getWinnerLabel(),
            pos: vec2(cx - 195, cy - 42),
            size: 20,
            color: rgb(...winCol),
          });

          drawText({
            text: "PRESS SPACE OR ENTER FOR INSTANT REMATCH",
            pos: vec2(cx - 168, cy + 28),
            size: 13,
            color: rgb(125, 255, 195),
          });

          drawText({
            text: "PRESS ESC TO RETURN TO MAIN MENU",
            pos: vec2(cx - 135, cy + 62),
            size: 11.5,
            color: rgb(195, 215, 245),
          });
        }
      },
    },
  ]);
}
