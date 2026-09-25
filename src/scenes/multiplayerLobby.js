// ============================================================================
// src/scenes/multiplayerLobby.js
// ============================================================================
// Pre-Match Mode & Room Setup Scene ("multiplayerLobby"):
// Supports BOTH:
// 1. SINGLE PLAYER (VS AI BOTS):
//    - 1v1 Duel (2 Fighters)
//    - 2v2 Team Battle (4 Fighters: Team Blue vs Team Red with AI Teammate!)
//    - Free-For-All Chaos (3, 4, 5, or 6 Fighters — 1v1v1 up to 6P, No Teams!)
// 2. ONLINE MULTIPLAYER (TRYSTERO SERVERLESS P2P):
//    - Host a 4-Digit Room Code or Join a Friend's 4-Digit Code (or ?room=XXXX URL)
//    - 1v1 Online, 2v2 Team Battle Online, or 3-to-6 Player Free-For-All Online
//    - Optional "Fill Empty Slots with AI Bots" toggle (`B` key)
// ============================================================================

import { GAME_CONFIG, CAMERA_CONFIG } from "../config/gameConfig.js";
import { createArenaCamera } from "../systems/camera.js";
import { createAmbientBackground, createFloatingArena } from "./arena.js";
import { FIGHTER_ROSTER } from "../ai/enemyAI.js";
import {
  connectToTrysteroRoom,
  setupSinglePlayerMatchConfig,
  setLobbyModeConfig,
  toggleLocalPlayerTeam,
  triggerOnlineMatchStart,
  copyRoomInviteLink,
  getActiveMatchConfig,
  generateRoomCode,
  leaveMultiplayerRoom,
} from "../network/trysteroManager.js";

/**
 * Registers the "multiplayerLobby" scene with KAPLAY.
 */
export function registerMultiplayerLobbyScene() {
  scene("multiplayerLobby", (params = {}) => {
    const isOnlineLobby = Boolean(params.isOnline);
    const initialRoomCode = params.roomCode || generateRoomCode();
    const joinAsGuest = Boolean(params.joinAsGuest);

    const camera = createArenaCamera();
    camera.setZoom(CAMERA_CONFIG.DEFAULT_ZOOM);

    createAmbientBackground();
    createFloatingArena();

    let selectedMode = params.mode || "1v1"; // "1v1" | "2v2" | "ffa"
    let ffaPlayerCount = 4;                  // 3, 4, 5, or 6 fighters in FFA
    let fillBotsInOnline = true;
    let playerTeam = "blue";
    let showJoinCodeModal = false;
    let typedJoinCode = "";
    let feedbackBanner = "";

    if (isOnlineLobby) {
      const net = connectToTrysteroRoom(
        initialRoomCode,
        !joinAsGuest,
        selectedMode,
        selectedMode === "1v1" ? 2 : selectedMode === "2v2" ? 4 : ffaPlayerCount
      );
      net.fillWithBots = fillBotsInOnline;
      net.onStartMatch = () => {
        go("multiplayerArena");
      };
    } else {
      setupSinglePlayerMatchConfig(selectedMode, ffaPlayerCount, playerTeam);
    }

    function applyModeSelection(newMode, newFfaCount = ffaPlayerCount) {
      selectedMode = newMode;
      ffaPlayerCount = Math.max(3, Math.min(6, newFfaCount));
      const maxP =
        selectedMode === "1v1" ? 2 : selectedMode === "2v2" ? 4 : ffaPlayerCount;

      if (isOnlineLobby) {
        const net = getActiveMatchConfig();
        if (net.isHost) {
          setLobbyModeConfig(selectedMode, maxP, fillBotsInOnline);
        }
      } else {
        setupSinglePlayerMatchConfig(selectedMode, ffaPlayerCount, playerTeam);
      }
    }

    function launchMatchFromLobby() {
      if (isOnlineLobby) {
        const net = getActiveMatchConfig();
        if (net.isHost) {
          net.fillWithBots = fillBotsInOnline;
          triggerOnlineMatchStart();
        } else {
          feedbackBanner = "WAITING FOR ROOM HOST TO START THE MATCH...";
        }
      } else {
        setupSinglePlayerMatchConfig(selectedMode, ffaPlayerCount, playerTeam);
        go("multiplayerArena");
      }
    }

    // Mode Selection Hotkeys (1 = 1v1, 2 = 2v2 Teams, 3 = Free-For-All 3-6P)
    onKeyPress("1", () => {
      if (showJoinCodeModal) return;
      applyModeSelection("1v1", ffaPlayerCount);
    });
    onKeyPress("2", () => {
      if (showJoinCodeModal) return;
      applyModeSelection("2v2", ffaPlayerCount);
    });
    onKeyPress("3", () => {
      if (showJoinCodeModal) return;
      applyModeSelection("ffa", ffaPlayerCount);
    });

    // Adjust Free-For-All player count (3, 4, 5, 6) with Left / Right arrows or + / -
    onKeyPress("left", () => {
      if (showJoinCodeModal || selectedMode !== "ffa") return;
      applyModeSelection("ffa", ffaPlayerCount - 1);
    });
    onKeyPress("right", () => {
      if (showJoinCodeModal || selectedMode !== "ffa") return;
      applyModeSelection("ffa", ffaPlayerCount + 1);
    });

    // Toggle Team (Blue <-> Red) in 2v2 mode (`T` key)
    onKeyPress("t", () => {
      if (showJoinCodeModal) return;
      if (selectedMode === "2v2") {
        playerTeam = playerTeam === "blue" ? "red" : "blue";
        if (isOnlineLobby) {
          toggleLocalPlayerTeam();
        } else {
          setupSinglePlayerMatchConfig(selectedMode, ffaPlayerCount, playerTeam);
        }
      }
    });

    // Toggle AI Bot Fill in Online Mode (`B` key)
    onKeyPress("b", () => {
      if (!isOnlineLobby || showJoinCodeModal) return;
      const net = getActiveMatchConfig();
      if (net.isHost) {
        fillBotsInOnline = !fillBotsInOnline;
        setLobbyModeConfig(selectedMode, net.maxPlayers, fillBotsInOnline);
      }
    });

    // Copy 1-Click Shareable Invite Link (`C` key)
    onKeyPress("c", () => {
      if (!isOnlineLobby || showJoinCodeModal) return;
      const link = copyRoomInviteLink();
      feedbackBanner = `INVITE LINK COPIED! (${link})`;
    });

    // Open Join Room by 4-Digit Code Modal (`J` key)
    onKeyPress("j", () => {
      if (!isOnlineLobby) return;
      showJoinCodeModal = !showJoinCodeModal;
      typedJoinCode = "";
    });

    // Start Match (`Space` or `Enter`)
    onKeyPress("space", () => {
      if (!showJoinCodeModal) launchMatchFromLobby();
    });

    onKeyPress("enter", () => {
      if (showJoinCodeModal) {
        if (typedJoinCode.length >= 4) {
          showJoinCodeModal = false;
          connectToTrysteroRoom(typedJoinCode, false, selectedMode, ffaPlayerCount);
          const net = getActiveMatchConfig();
          net.onStartMatch = () => go("multiplayerArena");
        }
      } else {
        launchMatchFromLobby();
      }
    });

    onKeyPress("escape", () => {
      if (showJoinCodeModal) {
        showJoinCodeModal = false;
        typedJoinCode = "";
      } else {
        leaveMultiplayerRoom();
        go("menu");
      }
    });

    onKeyPress("backspace", () => {
      if (showJoinCodeModal && typedJoinCode.length > 0) {
        typedJoinCode = typedJoinCode.slice(0, -1);
      }
    });

    // Digits 0-9 when typing a Friend's 4-Digit Room Code
    const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    for (const d of digits) {
      onKeyPress(d, () => {
        if (!showJoinCodeModal) return;
        if (typedJoinCode.length < 4) {
          typedJoinCode += d;
          if (typedJoinCode.length === 4) {
            showJoinCodeModal = false;
            connectToTrysteroRoom(typedJoinCode, false, selectedMode, ffaPlayerCount);
            const net = getActiveMatchConfig();
            net.onStartMatch = () => go("multiplayerArena");
          }
        }
      });
    }

    // Mouse Click Support for Mode Cards, FFA Count Buttons, Copy Link, Join Code, & Start
    onMousePress("left", () => {
      const m = mousePos();
      const cx = GAME_CONFIG.WIDTH * 0.5;
      const cy = GAME_CONFIG.HEIGHT * 0.5;

      if (showJoinCodeModal) {
        if (m.x >= cx - 75 && m.x <= cx + 75 && m.y >= cy + 82 && m.y <= cy + 116) {
          showJoinCodeModal = false;
          typedJoinCode = "";
        }
        return;
      }

      // 1. Mode Selection Tabs (1v1, 2v2 Teams, Free-For-All 3-6P)
      if (m.y >= cy - 128 && m.y <= cy - 72) {
        if (m.x >= cx - 310 && m.x <= cx - 110) {
          applyModeSelection("1v1", ffaPlayerCount);
          return;
        }
        if (m.x >= cx - 95 && m.x <= cx + 105) {
          applyModeSelection("2v2", ffaPlayerCount);
          return;
        }
        if (m.x >= cx + 120 && m.x <= cx + 320) {
          applyModeSelection("ffa", ffaPlayerCount);
          return;
        }
      }

      // 2. FFA Fighter Count Selector Buttons (3P, 4P, 5P, 6P) when in FFA mode
      if (selectedMode === "ffa" && m.y >= cy - 62 && m.y <= cy - 34) {
        for (let count = 3; count <= 6; count++) {
          const bx = cx - 150 + (count - 3) * 80;
          if (m.x >= bx && m.x <= bx + 68) {
            applyModeSelection("ffa", count);
            return;
          }
        }
      }

      // 3. Online Copy Link & Join By Code Buttons
      if (isOnlineLobby && m.y >= cy - 178 && m.y <= cy - 142) {
        if (m.x >= cx + 15 && m.x <= cx + 165) {
          const link = copyRoomInviteLink();
          feedbackBanner = `INVITE LINK COPIED! (${link})`;
          return;
        }
        if (m.x >= cx + 175 && m.x <= cx + 320) {
          showJoinCodeModal = true;
          typedJoinCode = "";
          return;
        }
      }

      // 4. START MATCH Button
      if (m.x >= cx - 165 && m.x <= cx + 165 && m.y >= cy + 148 && m.y <= cy + 198) {
        launchMatchFromLobby();
        return;
      }

      // 5. BACK TO MENU Button
      if (m.x >= cx - 320 && m.x <= cx - 195 && m.y >= cy + 154 && m.y <= cy + 194) {
        leaveMultiplayerRoom();
        go("menu");
      }
    });

    // Render the Lobby UI
    add([
      fixed(),
      z(1000),
      {
        draw() {
          const cx = GAME_CONFIG.WIDTH * 0.5;
          const cy = GAME_CONFIG.HEIGHT * 0.5;
          const net = getActiveMatchConfig();
          const activeMode = net.mode || selectedMode;
          const slots = net.slots || [];

          // Dark backdrop
          drawRect({
            pos: vec2(0, 0),
            width: GAME_CONFIG.WIDTH,
            height: GAME_CONFIG.HEIGHT,
            color: rgb(8, 12, 24),
            opacity: 0.68,
          });

          // Main Lobby Card
          drawRect({
            pos: vec2(cx - 345, cy - 220),
            width: 690,
            height: 435,
            radius: 16,
            color: rgb(12, 18, 34),
            opacity: 0.95,
            outline: {
              width: 3,
              color: isOnlineLobby ? rgb(75, 245, 185) : rgb(75, 195, 255),
            },
          });

          // Header Title
          drawText({
            text: isOnlineLobby
              ? "ONLINE P2P MULTIPLAYER LOBBY (TRYSTERO SERVERLESS)"
              : "SINGLE PLAYER BATTLE SETUP (VS AUTONOMOUS AI BOTS)",
            pos: vec2(cx - 315, cy - 202),
            size: 16,
            color: isOnlineLobby ? rgb(95, 255, 195) : rgb(95, 230, 255),
          });

          // Online Room Code Bar + Copy Link + Join Code Buttons
          if (isOnlineLobby) {
            drawRect({
              pos: vec2(cx - 315, cy - 176),
              width: 320,
              height: 32,
              radius: 7,
              color: rgb(20, 34, 54),
              outline: { width: 1.5, color: rgb(95, 255, 195) },
            });
            drawText({
              text: `ROOM CODE : ${net.roomCode}   (${net.isHost ? "HOST" : "GUEST"})`,
              pos: vec2(cx - 302, cy - 166),
              size: 12.5,
              color: rgb(255, 235, 95),
            });

            // Copy Invite Link Button (C)
            drawRect({
              pos: vec2(cx + 15, cy - 176),
              width: 150,
              height: 32,
              radius: 7,
              color: rgb(24, 95, 78),
              outline: { width: 1.5, color: rgb(115, 255, 205) },
            });
            drawText({
              text: "COPY LINK (KEY C)",
              pos: vec2(cx + 32, cy - 165),
              size: 11,
              color: rgb(235, 255, 245),
            });

            // Join By Code Button (J)
            drawRect({
              pos: vec2(cx + 175, cy - 176),
              width: 145,
              height: 32,
              radius: 7,
              color: rgb(38, 52, 88),
              outline: { width: 1.5, color: rgb(145, 205, 255) },
            });
            drawText({
              text: "JOIN CODE (KEY J)",
              pos: vec2(cx + 190, cy - 165),
              size: 11,
              color: rgb(225, 240, 255),
            });
          } else {
            drawText({
              text: "CHOOSE 1v1 DUEL, 2v2 TEAM BATTLE, OR UP TO 6-PLAYER FREE-FOR-ALL CHAOS!",
              pos: vec2(cx - 315, cy - 164),
              size: 11.5,
              color: rgb(195, 215, 245),
            });
          }

          // 3 Mode Cards: 1 = 1v1 Duel, 2 = 2v2 Teams, 3 = Free-For-All (3-6P)
          const modes = [
            {
              id: "1v1",
              key: "1",
              title: "1 vs 1 DUEL",
              sub: "2 Fighters Head-to-Head",
              x: cx - 310,
            },
            {
              id: "2v2",
              key: "2",
              title: "2 vs 2 TEAMS",
              sub: "Team Blue vs Team Red",
              x: cx - 95,
            },
            {
              id: "ffa",
              key: "3",
              title: "FREE-FOR-ALL",
              sub: "1v1v1 up to 6 Players!",
              x: cx + 120,
            },
          ];

          for (const m of modes) {
            const isSel = activeMode === m.id;
            drawRect({
              pos: vec2(m.x, cy - 128),
              width: 200,
              height: 54,
              radius: 10,
              color: isSel ? rgb(28, 115, 175) : rgb(20, 28, 48),
              outline: {
                width: isSel ? 2.5 : 1.5,
                color: isSel ? rgb(125, 245, 255) : rgb(72, 92, 135),
              },
            });
            drawText({
              text: `KEY ${m.key} : ${m.title}`,
              pos: vec2(m.x + 14, cy - 116),
              size: 13,
              color: isSel ? rgb(255, 255, 255) : rgb(185, 205, 235),
            });
            drawText({
              text: m.sub,
              pos: vec2(m.x + 14, cy - 95),
              size: 10,
              color: isSel ? rgb(205, 245, 255) : rgb(142, 162, 195),
            });
          }

          // Mode-specific Sub-Options Bar (FFA Player Count 3..6 OR 2v2 Team Switcher)
          if (activeMode === "ffa") {
            drawText({
              text: "FFA FIGHTERS (ARROWS / CLICK):",
              pos: vec2(cx - 310, cy - 53),
              size: 11,
              color: rgb(255, 225, 115),
            });
            for (let count = 3; count <= 6; count++) {
              const bx = cx - 90 + (count - 3) * 82;
              const isCnt = net.maxPlayers === count;
              drawRect({
                pos: vec2(bx, cy - 61),
                width: 72,
                height: 26,
                radius: 6,
                color: isCnt ? rgb(215, 135, 24) : rgb(24, 34, 56),
                outline: {
                  width: 1.5,
                  color: isCnt ? rgb(255, 235, 115) : rgb(85, 105, 145),
                },
              });
              drawText({
                text: `${count}P FFA`,
                pos: vec2(bx + 12, cy - 53),
                size: 11,
                color: rgb(255, 255, 255),
              });
            }
          } else if (activeMode === "2v2") {
            drawText({
              text: "2v2 TEAM MODE : PRESS KEY T TO SWITCH YOUR TEAM (TEAM BLUE VS TEAM RED)!",
              pos: vec2(cx - 310, cy - 53),
              size: 11,
              color: rgb(135, 225, 255),
            });
          } else {
            drawText({
              text: "1v1 CLASSIC RULES : 3 STOCK LIVES EACH  |  99s MATCH TIMER  |  SKY POWER-UPS ON",
              pos: vec2(cx - 310, cy - 53),
              size: 11,
              color: rgb(175, 225, 255),
            });
          }

          // 6 Fighter Roster Slots Grid (2 rows x 3 columns)
          for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            const roster = FIGHTER_ROSTER[i] || FIGHTER_ROSTER[0];
            const col = i % 3;
            const row = Math.floor(i / 3);
            const sx = cx - 310 + col * 212;
            const sy = cy - 22 + row * 78;

            const isBlue = s.team === "blue";
            const isRed = s.team === "red";
            const borderCol = isBlue
              ? rgb(45, 175, 255)
              : isRed
              ? rgb(255, 75, 75)
              : rgb(...roster.uiColor);

            drawRect({
              pos: vec2(sx, sy),
              width: 196,
              height: 66,
              radius: 9,
              color: rgb(18, 26, 46),
              outline: { width: 2, color: borderCol },
            });

            // Fighter Color Dot
            drawCircle({
              pos: vec2(sx + 20, sy + 22),
              radius: 9,
              color: rgb(...roster.ringColor),
            });

            drawText({
              text: `P${i + 1} : ${roster.name}`,
              pos: vec2(sx + 36, sy + 14),
              size: 13,
              color: rgb(...roster.uiColor),
            });

            const roleLabel = s.peerId
              ? i === 0 && !isOnlineLobby
                ? "YOU (LOCAL P1)"
                : "HUMAN PLAYER"
              : isOnlineLobby && !net.fillWithBots
              ? "WAITING FOR PEER..."
              : "AI BOT FIGHTER";

            drawText({
              text: roleLabel,
              pos: vec2(sx + 14, sy + 36),
              size: 10,
              color: s.peerId ? rgb(115, 255, 185) : rgb(215, 225, 245),
            });

            const teamBadge = isBlue
              ? "TEAM BLUE"
              : isRed
              ? "TEAM RED"
              : "SOLO (FFA)";
            drawText({
              text: teamBadge,
              pos: vec2(sx + 118, sy + 15),
              size: 9.5,
              color: borderCol,
            });
          }

          // Status / Online Bot Fill Info Line
          const statusMsg =
            feedbackBanner ||
            (isOnlineLobby
              ? `${net.statusText}   |   KEY B : AI BOT FILL (${net.fillWithBots ? "ON" : "OFF"})`
              : "READY TO LAUNCH! ALL AI BOTS USE AUTONOMOUS 2.5D COMBAT & RECOVERY");
          drawText({
            text: statusMsg,
            pos: vec2(cx - 310, cy + 132),
            size: 10.5,
            color: rgb(255, 230, 115),
          });

          // BACK Button (ESC)
          drawRect({
            pos: vec2(cx - 310, cy + 154),
            width: 120,
            height: 40,
            radius: 8,
            color: rgb(36, 44, 68),
            outline: { width: 1.5, color: rgb(145, 165, 205) },
          });
          drawText({
            text: "ESC : MENU",
            pos: vec2(cx - 288, cy + 168),
            size: 12,
            color: rgb(225, 235, 255),
          });

          // START MATCH Button (SPACE / ENTER)
          drawRect({
            pos: vec2(cx - 155, cy + 150),
            width: 320,
            height: 46,
            radius: 10,
            color: rgb(28, 168, 118),
            outline: { width: 2.5, color: rgb(135, 255, 205) },
          });
          drawText({
            text: isOnlineLobby
              ? "START ONLINE MATCH (SPACE / ENTER)"
              : "START BATTLE (SPACE / ENTER / CLICK)",
            pos: vec2(cx - 134, cy + 166),
            size: 13.5,
            color: rgb(255, 255, 255),
          });

          // Modal for Joining a Friend's 4-Digit Room Code (`J` key)
          if (showJoinCodeModal) {
            drawRect({
              pos: vec2(cx - 210, cy - 110),
              width: 420,
              height: 240,
              radius: 14,
              color: rgb(10, 16, 30),
              opacity: 0.98,
              outline: { width: 3, color: rgb(95, 245, 195) },
            });
            drawText({
              text: "ENTER FRIEND'S 4-DIGIT ROOM CODE",
              pos: vec2(cx - 152, cy - 82),
              size: 14,
              color: rgb(95, 255, 195),
            });
            drawText({
              text: "Type the 4 digits shown on the Host's Lobby screen:",
              pos: vec2(cx - 158, cy - 54),
              size: 11,
              color: rgb(205, 225, 248),
            });

            for (let i = 0; i < 4; i++) {
              const bx = cx - 102 + i * 54;
              const by = cy - 22;
              const hasChar = i < typedJoinCode.length;
              drawRect({
                pos: vec2(bx, by),
                width: 42,
                height: 48,
                radius: 8,
                color: rgb(22, 32, 56),
                outline: {
                  width: 2,
                  color: hasChar ? rgb(95, 255, 195) : rgb(85, 115, 165),
                },
              });
              if (hasChar) {
                drawText({
                  text: typedJoinCode[i],
                  pos: vec2(bx + 14, by + 13),
                  size: 20,
                  color: rgb(125, 255, 205),
                });
              }
            }

            drawRect({
              pos: vec2(cx - 75, cy + 82),
              width: 150,
              height: 32,
              radius: 7,
              color: rgb(42, 48, 72),
              outline: { width: 1.5, color: rgb(145, 165, 205) },
            });
            drawText({
              text: "ESC : CANCEL",
              pos: vec2(cx - 44, cy + 92),
              size: 11.5,
              color: rgb(225, 235, 255),
            });
          }
        },
      },
    ]);
  });
}
