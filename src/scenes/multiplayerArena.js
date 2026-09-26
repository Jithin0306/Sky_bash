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
import { respawnPlayer } from "../player/playerMovement.js";
import {
  updatePhysicsSystem,
  resolveFighterToFighterCollisions,
  resolvePlayerToObjectInteractions,
} from "../systems/physics.js";
import { createCrate } from "../objects/crate.js";
import { createBall } from "../objects/ball.js";
import { createHeavyBox } from "../objects/heavyBox.js";
import { createBomb } from "../objects/bomb.js";
import { createStickyBomb } from "../objects/stickyBomb.js";
import { createMine } from "../objects/mine.js";
import {
  createPowerUp,
  updatePowerUpSystem,
  applyPowerUpToFighter,
} from "../objects/powerup.js";
import {
  spawnExplosionVFX,
  registerExplosionListener,
} from "../objects/bomb.js";
import {
  pickupObject,
  throwHeldObject,
  dropHeldObject,
  spawnPickupVFX,
} from "../player/playerCombat.js";
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
import { updateDepthSort } from "../systems/depthSort.js";
import { sound } from "../systems/sound.js";

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
    sound.playMusic("arena");
    sound.registerAudioKeyBindings();
    onMousePress(() => {
      const m = mousePos();
      if (sound.handleAudioClick(m.x, m.y)) return;
    });

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
      const roster = FIGHTER_ROSTER[i] || FIGHTER_ROSTER[0];
      const slotInfo = activeSlots[i] || {
        slot: i,
        name: roster.name,
        playerName: i === 0 ? net.localPlayerName || "PLAYER 1" : `BOT ${roster.name}`,
        peerId: i === 0 ? net.selfPeerId : null,
        isBot: i !== 0,
        team: mode === "2v2" ? (i < 2 ? "blue" : "red") : "none",
      };

      const spawn = getRingSpawnCoordinates(i, totalFighters);

      const isLocalHuman = isOnline
        ? slotInfo.peerId === net.selfPeerId || (net.isHost && i === 0)
        : i === 0;
      const isRemoteHuman = isOnline && Boolean(slotInfo.peerId) && !isLocalHuman;
      const isBotFighter = !isLocalHuman && !isRemoteHuman;

      const customPlayerName = isLocalHuman
        ? net.localPlayerName || slotInfo.playerName || `PLAYER ${i + 1}`
        : isRemoteHuman
        ? slotInfo.playerName || `PLAYER ${i + 1}`
        : `BOT ${roster.name}`;

      const f = createPlayer(spawn.x, spawn.y, {
        playerId: i + 1,
        displayName: customPlayerName,
        isAI: isBotFighter,
        colors: roster.palette,
        ringColor: roster.ringColor,
        camera,
      });

      f.slotIndex = i;
      f.fighterName = roster.name;
      f.playerName = customPlayerName;
      f.peerId = slotInfo.peerId || `BOT_${i}`;
      f.team = mode === "2v2" ? slotInfo.team || (i < 2 ? "blue" : "red") : "none";
      f.uiColor = roster.uiColor;
      f.displayTag = customPlayerName;
      f.facing = vec2(spawn.facingX, spawn.facingY);
      f.cameraRef = camera;
      f.lives = 3;
      f.ringOutCount = 0;
      f.isEliminated = false;
      f.isRemoteHuman = isRemoteHuman;
      f.netTargetPos = vec2(spawn.x, spawn.y);
      f.netTargetZ = 0;
      f.respawn = function (rx, ry) {
        respawnPlayer(f);
        if (typeof rx === "number" && typeof ry === "number") {
          f.pos.x = rx;
          f.pos.y = ry;
        }
      };

      if (isLocalHuman) {
        localFighter = f;
        f.isLocalPlayer = true;
      }

      fighters.push(f);
    }

    if (!localFighter) {
      localFighter = fighters[0];
      localFighter.isLocalPlayer = true;
    }

    // Create Autonomous AI Controllers for all Bot Fighters
    for (const f of fighters) {
      if (f.isAI) {
        const ai = createEnemyAIController(f, fighters, physicsObjects);
        aiControllers.push({ bot: f, ai });
      }
    }

    // 3. Spawn Arena Props & Explosives with Deterministic Network IDs
    const props = createDepthTestProps(false);
    const crates = [
      createCrate(ARENA_CONFIG.CENTER_X - 95, ARENA_CONFIG.CENTER_Y - 58, 0, 0),
      createCrate(ARENA_CONFIG.CENTER_X + 95, ARENA_CONFIG.CENTER_Y - 58, 0, 0),
      createCrate(ARENA_CONFIG.CENTER_X, ARENA_CONFIG.CENTER_Y + 75, 0, 0),
    ];
    crates[0].netId = "crate_0";
    crates[1].netId = "crate_1";
    crates[2].netId = "crate_2";

    const balls = [
      createBall(ARENA_CONFIG.CENTER_X - 65, ARENA_CONFIG.CENTER_Y + 32, 0, 0),
      createBall(ARENA_CONFIG.CENTER_X + 65, ARENA_CONFIG.CENTER_Y - 22, 0, 0),
    ];
    balls[0].netId = "ball_0";
    balls[1].netId = "ball_1";

    const heavyBoxes = [
      createHeavyBox(ARENA_CONFIG.CENTER_X + 125, ARENA_CONFIG.CENTER_Y + 35, 0, 0),
    ];
    heavyBoxes[0].netId = "heavy_0";

    const bombs = [
      createBomb(ARENA_CONFIG.CENTER_X - 45, ARENA_CONFIG.CENTER_Y - 18, 0, 0),
      createBomb(ARENA_CONFIG.CENTER_X + 45, ARENA_CONFIG.CENTER_Y + 18, 0, 0),
    ];
    bombs[0].netId = "bomb_0";
    bombs[1].netId = "bomb_1";

    const stickyBombs = [
      createStickyBomb(ARENA_CONFIG.CENTER_X, ARENA_CONFIG.CENTER_Y - 72, 0, 0),
    ];
    stickyBombs[0].netId = "sticky_0";

    const mines = [
      createMine(ARENA_CONFIG.CENTER_X - 115, ARENA_CONFIG.CENTER_Y + 25, 0, 0),
    ];
    mines[0].netId = "mine_0";

    physicsObjects.push(
      ...crates,
      ...balls,
      ...heavyBoxes,
      ...bombs,
      ...stickyBombs,
      ...mines
    );

    for (const obj of physicsObjects) {
      obj.netTargetPos = vec2(obj.pos.x, obj.pos.y);
      obj.netTargetZ = 0;
    }

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

    let cleanupExplosionListener = null;
    if (isOnline && net.isHost) {
      cleanupExplosionListener = registerExplosionListener((exp) => {
        if (net.sendWorld) {
          net.sendWorld({
            type: "EXPLOSION",
            ...exp,
          });
        }
      });
    }

    function spawnRandomSkyPowerUp(forcedType = null, forcedX = null, forcedY = null, forcedId = null) {
      if (activePowerUps.length >= 2) return;
      const angle = rand(0, Math.PI * 2);
      const dist = rand(45, ARENA_CONFIG.RADIUS * 0.58);
      const px =
        forcedX !== null ? forcedX : Math.round(ARENA_CONFIG.CENTER_X + Math.cos(angle) * dist);
      const py =
        forcedY !== null
          ? forcedY
          : Math.round(
              ARENA_CONFIG.CENTER_Y +
                Math.sin(angle) * dist * ARENA_CONFIG.PERSPECTIVE_Y_SCALE
            );
      const pType = forcedType || powerUpCycle[powerUpIndex % powerUpCycle.length];
      const pId = forcedId || `powerup_${powerUpIndex}_${Math.floor(time() * 10)}`;
      powerUpIndex += 1;

      const orb = createPowerUp(px, py, pType, 240, pId);
      orb.netTargetPos = vec2(px, py);
      orb.netTargetZ = 240;
      activePowerUps.push(orb);

      if (isOnline && net.isHost && net.sendWorld) {
        net.sendWorld({
          type: "POWERUP_SPAWN",
          id: pId,
          pType,
          x: px,
          y: py,
          z: 240,
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
        if (data.pName) {
          target.playerName = data.pName;
          target.displayTag = data.pName;
        }
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
          let cand = null;
          if (data.candNetId) {
            cand = physicsObjects.find((o) => o.netId === data.candNetId);
          } else if (typeof data.candSlot === "number") {
            cand = fighters.find((f) => f.slotIndex === data.candSlot);
          }
          if (cand && !actor.heldObject) {
            pickupObject(actor, cand);
          } else {
            actor.setInput({
              ...actor.input,
              pickupPressed: true,
            });
          }
        } else if (data.action === "throw") {
          if (actor.heldObject) {
            throwHeldObject(actor, camera);
          } else {
            actor.setInput({
              ...actor.input,
              throwPressed: true,
            });
          }
        }
      };

      net.onWorldSync = (data) => {
        if (!data || net.isHost) return;
        if (data.type === "WORLD_SNAPSHOT") {
          if (typeof data.timer === "number") {
            matchTimer = data.timer;
          }

          // 1. Synchronize all 10 arena physics objects (crates, balls, heavyBoxes, bombs, mines)
          if (Array.isArray(data.items)) {
            for (const item of data.items) {
              const obj = physicsObjects.find((o) => o.netId === item.id);
              if (!obj) continue;

              // Carrying state synchronization
              if (typeof item.cSlot === "number") {
                const carrier = fighters.find((f) => f.slotIndex === item.cSlot);
                if (carrier) {
                  obj.isCarried = true;
                  obj.carrier = carrier;
                  carrier.heldObject = obj;
                  obj.pos.x = carrier.pos.x;
                  obj.pos.y = carrier.pos.y;
                  obj.zHeight = carrier.zHeight + 56;
                  obj.velocity.x = 0;
                  obj.velocity.y = 0;
                  obj.velZ = 0;
                }
              } else {
                if (obj.isCarried) {
                  if (obj.carrier && obj.carrier.heldObject === obj) {
                    obj.carrier.heldObject = null;
                  }
                  obj.isCarried = false;
                  obj.carrier = null;
                }
                obj.netTargetPos.x = item.x;
                obj.netTargetPos.y = item.y;
                obj.netTargetZ = item.z;
                obj.velocity.x = item.vx;
                obj.velocity.y = item.vy;
                obj.velZ = item.vz;
                obj.isFallingInVoid = item.void;
                obj.isWaitingToDrop = item.drop;
                obj.isLit = item.lit;
                if (typeof item.fuse === "number") obj.fuseTimer = item.fuse;
                obj.isArmed = item.arm;
                obj.isTriggered = item.trig;
              }
            }
          }

          // 2. Synchronize active power-up orbs
          if (Array.isArray(data.powerups)) {
            for (const p of data.powerups) {
              let orb = activePowerUps.find((o) => o.netId === p.id);
              if (!orb && !p.col) {
                orb = createPowerUp(p.x, p.y, p.t, p.z, p.id);
                orb.netTargetPos = vec2(p.x, p.y);
                orb.netTargetZ = p.z;
                activePowerUps.push(orb);
              } else if (orb) {
                if (p.col && !orb.isCollected) {
                  orb.isCollected = true;
                  destroy(orb);
                } else if (!p.col) {
                  orb.netTargetPos.x = p.x;
                  orb.netTargetPos.y = p.y;
                  orb.netTargetZ = p.z;
                }
              }
            }

            // Remove any orbs locally that Host no longer tracks
            for (let i = activePowerUps.length - 1; i >= 0; i--) {
              const localOrb = activePowerUps[i];
              if (!data.powerups.some((p) => p.id === localOrb.netId)) {
                localOrb.isCollected = true;
                destroy(localOrb);
                activePowerUps.splice(i, 1);
              }
            }
          }
        } else if (data.type === "POWERUP_SPAWN") {
          let orb = activePowerUps.find((o) => o.netId === data.id);
          if (!orb) {
            orb = createPowerUp(data.x, data.y, data.pType, data.z || 240, data.id);
            orb.netTargetPos = vec2(data.x, data.y);
            orb.netTargetZ = data.z || 240;
            activePowerUps.push(orb);
          }
        } else if (data.type === "POWERUP_COLLECT") {
          const targetFighter = fighters.find((f) => f.slotIndex === data.slot);
          if (targetFighter) {
            applyPowerUpToFighter(targetFighter, data.pType);
          }
          const orb = activePowerUps.find((p) => p.netId === data.id);
          if (orb) {
            orb.isCollected = true;
            destroy(orb);
          }
        } else if (data.type === "EXPLOSION") {
          spawnExplosionVFX(data.x, data.y, data.z, data.radius, data.theme);
          if (camera) {
            camera.shake(17.5);
          }
        }
      };

      net.onMatchResult = (data) => {
        if (!data) return;
        if (data.type === "MATCH_OVER") {
          isMatchOver = true;
          matchWinnerLabel = data.winnerLabel || "MATCH COMPLETE!";
          matchWinnerColor = data.winnerColor || [95, 245, 255];
          sound.playVictory();
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
          const winName = bestFighter.playerName || bestFighter.displayName || bestFighter.fighterName;
          matchWinnerLabel = `${winName} ${modeSuffix}`;
          matchWinnerColor = bestFighter.uiColor || [95, 245, 255];
        }
      }

      if (isMatchOver) {
        sound.playVictory();
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
        if (cleanupExplosionListener) cleanupExplosionListener();
        if (isOnline && net.isHost && net.sendResult) {
          net.sendResult({ type: "REMATCH" });
        }
        go("multiplayerArena");
      }
    });
    onKeyPress("enter", () => {
      if (isMatchOver) {
        if (cleanupExplosionListener) cleanupExplosionListener();
        if (isOnline && net.isHost && net.sendResult) {
          net.sendResult({ type: "REMATCH" });
        }
        go("multiplayerArena");
      }
    });
    onKeyPress("escape", () => {
      if (cleanupExplosionListener) cleanupExplosionListener();
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
            const cand = localFighter.nearestPickupCandidate;
            net.sendCombat({
              slot: localFighter.slotIndex,
              action: "pickup",
              candNetId: cand?.netId || null,
              candSlot: typeof cand?.slotIndex === "number" ? cand.slotIndex : null,
            });
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
            const tx = f.netTargetPos?.x;
            const ty = f.netTargetPos?.y;
            const tz = f.netTargetZ;
            if (typeof tx === "number" && !isNaN(tx) && typeof f.pos.x === "number") {
              f.pos.x = lerp(f.pos.x, tx, Math.min(1, delta * 14));
            }
            if (typeof ty === "number" && !isNaN(ty) && typeof f.pos.y === "number") {
              f.pos.y = lerp(f.pos.y, ty, Math.min(1, delta * 14));
            }
            if (typeof tz === "number" && !isNaN(tz) && typeof f.zHeight === "number") {
              f.zHeight = lerp(f.zHeight, tz, Math.min(1, delta * 14));
            }
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
            pName: localFighter.playerName,
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

          // Host also broadcasts AI bot states to guests
          if (net.isHost) {
            for (const { bot } of aiControllers) {
              if (bot.isEliminated) continue;
              net.sendMove({
                slot: bot.slotIndex,
                pName: bot.playerName || bot.displayName,
                x: Math.round(bot.pos.x),
                y: Math.round(bot.pos.y),
                z: Math.round(bot.zHeight || 0),
                vx: Math.round(bot.velocity.x || 0),
                vy: Math.round(bot.velocity.y || 0),
                vz: Math.round(bot.velZ || 0),
                fx: Number(bot.facing.x.toFixed(2)),
                fy: Number(bot.facing.y.toFixed(2)),
                hp: bot.health,
                lives: bot.lives,
                elim: bot.isEliminated,
              });
            }
          }
        }
      }

      // Host broadcasts authoritative World Snapshot at 15Hz (items, powerups, timer)
      if (isOnline && net.isHost && net.sendWorld) {
        worldSyncAccum += delta;
        if (worldSyncAccum >= 0.066) {
          worldSyncAccum = 0;
          net.sendWorld({
            type: "WORLD_SNAPSHOT",
            timer: Math.round(matchTimer * 10) / 10,
            items: physicsObjects.map((obj) => ({
              id: obj.netId,
              x: Math.round(obj.pos.x),
              y: Math.round(obj.pos.y),
              z: Math.round(obj.zHeight || 0),
              vx: Math.round(obj.velocity.x || 0),
              vy: Math.round(obj.velocity.y || 0),
              vz: Math.round(obj.velZ || 0),
              cSlot: obj.isCarried && obj.carrier ? obj.carrier.slotIndex : null,
              lit: Boolean(obj.isLit),
              fuse: typeof obj.fuseTimer === "number" ? Number(obj.fuseTimer.toFixed(1)) : null,
              arm: Boolean(obj.isArmed),
              trig: Boolean(obj.isTriggered),
              void: Boolean(obj.isFallingInVoid),
              drop: Boolean(obj.isWaitingToDrop),
            })),
            powerups: activePowerUps.map((p) => ({
              id: p.netId,
              t: p.powerType,
              x: Math.round(p.pos.x),
              y: Math.round(p.pos.y),
              z: Math.round(p.zHeight || 0),
              col: Boolean(p.isCollected),
            })),
          });
        }
      }

      // 6. Physics & Power-Ups
      if (!isOnline || net.isHost) {
        // Host & Single-Player: Authoritative 2.5D physics and powerup collection
        updatePhysicsSystem(fighters, physicsObjects, props, camera);
        updatePowerUpSystem(fighters, activePowerUps, (orb, fighter) => {
          if (isOnline && net.isHost && net.sendWorld) {
            net.sendWorld({
              type: "POWERUP_COLLECT",
              id: orb.netId,
              pType: orb.powerType,
              slot: fighter.slotIndex,
            });
          }
        });
      } else {
        // Guest: Smoothly interpolate all objects & powerups to Host's authoritative positions!
        for (const obj of physicsObjects) {
          if (obj.isCarried && obj.carrier) {
            obj.pos.x = obj.carrier.pos.x;
            obj.pos.y = obj.carrier.pos.y;
            obj.zHeight = obj.carrier.zHeight + 56;
            obj.velZ = 0;
          } else if (obj.isWaitingToDrop) {
            obj.pos.x = -2000;
            obj.pos.y = -2000;
            obj.zHeight = 0;
          } else {
            const tx = obj.netTargetPos.x;
            const ty = obj.netTargetPos.y;
            const tz = obj.netTargetZ;

            const distSq = (obj.pos.x - tx) ** 2 + (obj.pos.y - ty) ** 2;
            if (distSq > 150000) {
              obj.pos.x = tx;
              obj.pos.y = ty;
              obj.zHeight = tz;
            } else {
              obj.pos.x = lerp(obj.pos.x, tx, Math.min(1, delta * 16));
              obj.pos.y = lerp(obj.pos.y, ty, Math.min(1, delta * 16));
              obj.zHeight = lerp(obj.zHeight, tz, Math.min(1, delta * 16));
            }

            const speed = Math.hypot(
              obj.velocity.x,
              obj.velocity.y / ARENA_CONFIG.PERSPECTIVE_Y_SCALE
            );
            if (speed > 2) {
              const dirSign = obj.velocity.x >= 0 ? 1 : -1;
              obj.rollAngle += dirSign * (speed / obj.footprintRadius) * delta * 35;
            }
          }

          if (typeof obj.squashFactor === "number" && !isNaN(obj.squashFactor)) {
            obj.squashFactor = lerp(obj.squashFactor, 0, Math.min(1, 10 * delta));
          } else {
            obj.squashFactor = 0;
          }
          updateDepthSort(obj);
        }

        // Guest: Smoothly interpolate active powerups
        for (const orb of activePowerUps) {
          if (orb.isCollected || !orb.exists()) continue;
          if (orb.netTargetPos) {
            orb.pos.x = lerp(orb.pos.x, orb.netTargetPos.x, Math.min(1, delta * 16));
            orb.pos.y = lerp(orb.pos.y, orb.netTargetPos.y, Math.min(1, delta * 16));
            if (typeof orb.netTargetZ === "number") {
              orb.zHeight = lerp(orb.zHeight, orb.netTargetZ, Math.min(1, delta * 16));
            }
          }
          updateDepthSort(orb);
        }

        // Guest fighter-to-fighter body collisions
        resolveFighterToFighterCollisions(fighters);
        // Guest local fighter pushing interactions with objects for tactile collision feel (without jittering!)
        resolvePlayerToObjectInteractions(localFighter, physicsObjects, camera, true);
      }

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
          const cardName = f.playerName || f.displayName || f.fighterName || "FIGHTER";
          drawText({
            text: `${teamLabel}: ${cardName}`,
            pos: vec2(x + 10, y + 8),
            size: 11,
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

        // 3. Separate Music & SFX Mute Buttons at Top-Right
        sound.drawAudioHUD();

        // 4. Bottom Controls Strip
        drawRect({
          pos: vec2(cx - 325, GAME_CONFIG.HEIGHT - 32),
          width: 650,
          height: 24,
          radius: 6,
          color: rgb(12, 16, 28),
          opacity: 0.78,
        });
        drawText({
          text: "WASD : Move  |  SHIFT : Sprint  |  SPACE : Jump  |  J : Punch  |  E : Grab  |  K : Throw  |  M : Music  |  X : SFX  |  ESC : Menu",
          pos: vec2(cx - 312, GAME_CONFIG.HEIGHT - 25),
          size: 9.5,
          color: rgb(195, 215, 245),
        });

        // 5. Victory / Defeat Podium Overlay
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
