// ============================================================================
// src/scenes/multiplayerLobby.js
// ============================================================================
// Pre-Match Mode & Room Setup Scene ("multiplayerLobby"):
// Supports BOTH:
// 1. SINGLE PLAYER (VS AI BOTS): 1v1, 2v2 Teams, or 3-6P Free-For-All
// 2. ONLINE MULTIPLAYER (TRYSTERO SERVERLESS P2P):
//    - Custom Player Name Editor (N key / click)
//    - Host 4-digit code or join friend's code (J key / click)
//    - 1-Click invite link copy (C key / click)
//    - AI Bot Fill toggle (B key)
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
  getLocalPlayerName,
  setLocalPlayerName,
} from "../network/trysteroManager.js";
import { sound } from "../systems/sound.js";

const MODES = [
  { id: "1v1", key: "1", title: "1 vs 1 DUEL", sub: "2 Fighters Head-to-Head", xOff: -310 },
  { id: "2v2", key: "2", title: "2 vs 2 TEAMS", sub: "Team Blue vs Team Red", xOff: -95 },
  { id: "ffa", key: "3", title: "FREE-FOR-ALL", sub: "1v1v1 up to 6 Players!", xOff: 120 },
];

export function registerMultiplayerLobbyScene() {
  scene("multiplayerLobby", (params = {}) => {
    sound.playMusic("menu");
    const isOnlineLobby = Boolean(params.isOnline);
    const initialRoomCode = params.roomCode || generateRoomCode();
    const joinAsGuest = Boolean(params.joinAsGuest);

    const camera = createArenaCamera();
    camera.setZoom(CAMERA_CONFIG.DEFAULT_ZOOM);
    createAmbientBackground();
    createFloatingArena();

    let selectedMode = params.mode || "1v1";
    let ffaPlayerCount = 4;
    let fillBotsInOnline = true;
    let playerTeam = "blue";
    let showJoinCodeModal = false;
    let typedJoinCode = "";
    let showNameModal = false;
    let typedPlayerName = getLocalPlayerName();
    let feedbackBanner = "";
    let isTransitioningToArena = false;

    const safeGoToArena = () => {
      if (isTransitioningToArena) return;
      isTransitioningToArena = true;
      go("multiplayerArena");
    };

    if (isOnlineLobby) {
      const net = connectToTrysteroRoom(
        initialRoomCode,
        !joinAsGuest,
        selectedMode,
        selectedMode === "1v1" ? 2 : selectedMode === "2v2" ? 4 : ffaPlayerCount
      );
      net.fillWithBots = fillBotsInOnline;
      net.onStartMatch = safeGoToArena;
    } else {
      setupSinglePlayerMatchConfig(selectedMode, ffaPlayerCount, playerTeam);
    }

    function applyModeSelection(newMode, newFfaCount = ffaPlayerCount) {
      sound.playUIClick();
      selectedMode = newMode;
      ffaPlayerCount = Math.max(3, Math.min(6, newFfaCount));
      const maxP = selectedMode === "1v1" ? 2 : selectedMode === "2v2" ? 4 : ffaPlayerCount;
      if (isOnlineLobby) {
        const net = getActiveMatchConfig();
        if (net.isHost) setLobbyModeConfig(selectedMode, maxP, fillBotsInOnline);
      } else {
        setupSinglePlayerMatchConfig(selectedMode, ffaPlayerCount, playerTeam);
      }
    }

    function launchMatchFromLobby() {
      sound.playUIClick();
      if (isOnlineLobby) {
        const net = getActiveMatchConfig();
        net.onStartMatch = safeGoToArena;
        if (net.isHost) {
          net.fillWithBots = fillBotsInOnline;
          triggerOnlineMatchStart();
        } else {
          feedbackBanner = "WAITING FOR ROOM HOST TO PRESS START...";
        }
      } else {
        setupSinglePlayerMatchConfig(selectedMode, ffaPlayerCount, playerTeam);
        safeGoToArena();
      }
    }

    function openNameEditor() {
      sound.playUIClick();
      showNameModal = true;
      showJoinCodeModal = false;
      typedPlayerName = getLocalPlayerName();
    }

    function saveNameEditor() {
      sound.playUIClick();
      const saved = setLocalPlayerName(typedPlayerName || "PLAYER 1");
      typedPlayerName = saved;
      showNameModal = false;
      feedbackBanner = `PLAYER NAME UPDATED TO: ${saved}`;
    }

    // Mode keys (1, 2, 3)
    MODES.forEach((m) =>
      onKeyPress(m.key, () => {
        if (!showJoinCodeModal && !showNameModal) applyModeSelection(m.id, ffaPlayerCount);
      })
    );

    // Left / Right arrows for FFA player count
    onKeyPress("left", () => {
      if (!showJoinCodeModal && !showNameModal && selectedMode === "ffa") applyModeSelection("ffa", ffaPlayerCount - 1);
    });
    onKeyPress("right", () => {
      if (!showJoinCodeModal && !showNameModal && selectedMode === "ffa") applyModeSelection("ffa", ffaPlayerCount + 1);
    });

    onKeyPress("n", () => {
      if (!showJoinCodeModal && !showNameModal) openNameEditor();
    });

    onKeyPress("t", () => {
      if (showJoinCodeModal || showNameModal || selectedMode !== "2v2") return;
      sound.playUIClick();
      playerTeam = playerTeam === "blue" ? "red" : "blue";
      if (isOnlineLobby) toggleLocalPlayerTeam();
      else setupSinglePlayerMatchConfig(selectedMode, ffaPlayerCount, playerTeam);
    });

    onKeyPress("b", () => {
      if (!isOnlineLobby || showJoinCodeModal || showNameModal) return;
      const net = getActiveMatchConfig();
      if (net.isHost) {
        sound.playUIClick();
        fillBotsInOnline = !fillBotsInOnline;
        setLobbyModeConfig(selectedMode, net.maxPlayers, fillBotsInOnline);
      }
    });

    onKeyPress("c", () => {
      if (!isOnlineLobby || showJoinCodeModal || showNameModal) return;
      sound.playUIClick();
      feedbackBanner = `INVITE LINK COPIED! (${copyRoomInviteLink()})`;
    });

    onKeyPress("j", () => {
      if (!isOnlineLobby || showNameModal) return;
      sound.playUIClick();
      showJoinCodeModal = !showJoinCodeModal;
      typedJoinCode = "";
    });

    sound.registerAudioKeyBindings(() => !showNameModal && !showJoinCodeModal);

    onKeyPress("space", () => {
      if (showNameModal) {
        if (typedPlayerName.length < 12) typedPlayerName += " ";
        return;
      }
      if (!showJoinCodeModal) launchMatchFromLobby();
    });

    onKeyPress("enter", () => {
      if (showNameModal) return saveNameEditor();
      if (showJoinCodeModal) {
        if (typedJoinCode.length >= 4) {
          sound.playUIClick();
          showJoinCodeModal = false;
          const net = connectToTrysteroRoom(typedJoinCode, false, selectedMode, ffaPlayerCount);
          net.onStartMatch = safeGoToArena;
        }
      } else {
        launchMatchFromLobby();
      }
    });

    onKeyPress("escape", () => {
      sound.playUIClick();
      if (showNameModal) {
        showNameModal = false;
      } else if (showJoinCodeModal) {
        showJoinCodeModal = false;
        typedJoinCode = "";
      } else {
        leaveMultiplayerRoom();
        go("menu");
      }
    });

    onKeyPress("backspace", () => {
      if (showNameModal && typedPlayerName.length > 0) typedPlayerName = typedPlayerName.slice(0, -1);
      else if (showJoinCodeModal && typedJoinCode.length > 0) typedJoinCode = typedJoinCode.slice(0, -1);
    });

    onCharInput((ch) => {
      if (showNameModal) {
        const cleanCh = ch.replace(/[^a-zA-Z0-9 _-]/g, "").toUpperCase();
        if (cleanCh && typedPlayerName.length < 12) typedPlayerName += cleanCh;
      } else if (showJoinCodeModal && /^[0-9]$/.test(ch) && typedJoinCode.length < 4) {
        typedJoinCode += ch;
        if (typedJoinCode.length === 4) {
          showJoinCodeModal = false;
          const net = connectToTrysteroRoom(typedJoinCode, false, selectedMode, ffaPlayerCount);
          net.onStartMatch = safeGoToArena;
        }
      }
    });

    const inBox = (x, y, x1, y1, x2, y2) => x >= x1 && x <= x2 && y >= y1 && y <= y2;

    onMousePress("left", () => {
      const m = mousePos();
      const cx = GAME_CONFIG.WIDTH * 0.5;
      const cy = GAME_CONFIG.HEIGHT * 0.5;

      if (sound.handleAudioClick(m.x, m.y)) return;

      if (showNameModal) {
        if (inBox(m.x, m.y, cx - 150, cy + 72, cx - 10, cy + 108)) return saveNameEditor();
        if (inBox(m.x, m.y, cx + 10, cy + 72, cx + 150, cy + 108)) {
          showNameModal = false;
          return;
        }
        return;
      }

      if (showJoinCodeModal) {
        if (inBox(m.x, m.y, cx - 75, cy + 82, cx + 75, cy + 116)) {
          showJoinCodeModal = false;
          typedJoinCode = "";
        }
        return;
      }

      // Name editor pill
      if (inBox(m.x, m.y, cx + 95, cy - 210, cx + 325, cy - 180)) return openNameEditor();

      // Mode tabs
      for (const mode of MODES) {
        if (inBox(m.x, m.y, cx + mode.xOff, cy - 128, cx + mode.xOff + 200, cy - 72)) {
          return applyModeSelection(mode.id, ffaPlayerCount);
        }
      }

      // FFA count buttons
      if (selectedMode === "ffa" && inBox(m.x, m.y, cx - 90, cy - 62, cx - 90 + 4 * 82, cy - 34)) {
        for (let c = 3; c <= 6; c++) {
          const bx = cx - 90 + (c - 3) * 82;
          if (inBox(m.x, m.y, bx, cy - 62, bx + 72, cy - 34)) return applyModeSelection("ffa", c);
        }
      }

      // Online Copy Link & Join Code
      if (isOnlineLobby && inBox(m.x, m.y, cx + 15, cy - 176, cx + 165, cy - 142)) {
        feedbackBanner = `INVITE LINK COPIED! (${copyRoomInviteLink()})`;
        return;
      }
      if (isOnlineLobby && inBox(m.x, m.y, cx + 175, cy - 176, cx + 320, cy - 142)) {
        showJoinCodeModal = true;
        typedJoinCode = "";
        return;
      }

      // Start match
      if (inBox(m.x, m.y, cx - 155, cy + 148, cx + 165, cy + 198)) return launchMatchFromLobby();

      // Back to menu
      if (inBox(m.x, m.y, cx - 320, cy + 150, cx - 190, cy + 196)) {
        leaveMultiplayerRoom();
        go("menu");
      }
    });

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
          const myPlayerName = getLocalPlayerName();

          // Dark backdrop & audio HUD
          drawRect({
            pos: vec2(0, 0),
            width: GAME_CONFIG.WIDTH,
            height: GAME_CONFIG.HEIGHT,
            color: rgb(8, 12, 24),
            opacity: 0.68,
          });
          sound.drawAudioHUD();

          // Main Card
          drawRect({
            pos: vec2(cx - 345, cy - 220),
            width: 690,
            height: 435,
            radius: 16,
            color: rgb(12, 18, 34),
            opacity: 0.95,
            outline: { width: 3, color: isOnlineLobby ? rgb(75, 245, 185) : rgb(75, 195, 255) },
          });

          // Header Title
          drawText({
            text: isOnlineLobby ? "ONLINE P2P ROOM LOBBY (TRYSTERO)" : "SINGLE PLAYER SETUP (VS AI BOTS)",
            pos: vec2(cx - 315, cy - 204),
            size: 15,
            color: isOnlineLobby ? rgb(95, 255, 195) : rgb(95, 230, 255),
          });

          // Player Name Badge
          drawRect({
            pos: vec2(cx + 95, cy - 210),
            width: 225,
            height: 28,
            radius: 6,
            color: rgb(26, 42, 68),
            outline: { width: 1.5, color: rgb(255, 220, 85) },
          });
          drawText({
            text: `NAME: ${myPlayerName} (KEY N)`,
            pos: vec2(cx + 106, cy - 201),
            size: 11,
            color: rgb(255, 235, 115),
          });

          // Online Room Code Bar & Buttons
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

            drawRect({
              pos: vec2(cx + 15, cy - 176),
              width: 150,
              height: 32,
              radius: 7,
              color: rgb(24, 95, 78),
              outline: { width: 1.5, color: rgb(115, 255, 205) },
            });
            drawText({ text: "COPY LINK (KEY C)", pos: vec2(cx + 32, cy - 165), size: 11, color: rgb(235, 255, 245) });

            drawRect({
              pos: vec2(cx + 175, cy - 176),
              width: 145,
              height: 32,
              radius: 7,
              color: rgb(38, 52, 88),
              outline: { width: 1.5, color: rgb(145, 205, 255) },
            });
            drawText({ text: "JOIN CODE (KEY J)", pos: vec2(cx + 190, cy - 165), size: 11, color: rgb(225, 240, 255) });
          } else {
            drawText({
              text: "PRESS KEY N ANYTIME TO CUSTOMIZE YOUR PLAYER NAME! CHOOSE MODE BELOW:",
              pos: vec2(cx - 315, cy - 164),
              size: 11,
              color: rgb(195, 215, 245),
            });
          }

          // Mode Selection Tabs
          for (const m of MODES) {
            const isSel = activeMode === m.id;
            drawRect({
              pos: vec2(cx + m.xOff, cy - 128),
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
              pos: vec2(cx + m.xOff + 14, cy - 116),
              size: 13,
              color: isSel ? rgb(255, 255, 255) : rgb(185, 205, 235),
            });
            drawText({
              text: m.sub,
              pos: vec2(cx + m.xOff + 14, cy - 95),
              size: 10,
              color: isSel ? rgb(205, 245, 255) : rgb(142, 162, 195),
            });
          }

          // Sub-options bar
          if (activeMode === "ffa") {
            drawText({
              text: "FFA FIGHTERS (ARROWS / CLICK):",
              pos: vec2(cx - 310, cy - 53),
              size: 11,
              color: rgb(255, 225, 115),
            });
            for (let c = 3; c <= 6; c++) {
              const bx = cx - 90 + (c - 3) * 82;
              const isCnt = net.maxPlayers === c;
              drawRect({
                pos: vec2(bx, cy - 61),
                width: 72,
                height: 26,
                radius: 6,
                color: isCnt ? rgb(215, 135, 24) : rgb(24, 34, 56),
                outline: { width: 1.5, color: isCnt ? rgb(255, 235, 115) : rgb(85, 105, 145) },
              });
              drawText({ text: `${c}P FFA`, pos: vec2(bx + 12, cy - 53), size: 11, color: rgb(255, 255, 255) });
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

          // Fighter Slots Grid
          slots.forEach((s, i) => {
            const roster = FIGHTER_ROSTER[i] || FIGHTER_ROSTER[0];
            const sx = cx - 310 + (i % 3) * 212;
            const sy = cy - 22 + Math.floor(i / 3) * 78;
            const isBlue = s.team === "blue";
            const isRed = s.team === "red";
            const borderCol = isBlue ? rgb(45, 175, 255) : isRed ? rgb(255, 75, 75) : rgb(...roster.uiColor);

            drawRect({
              pos: vec2(sx, sy),
              width: 196,
              height: 66,
              radius: 9,
              color: rgb(18, 26, 46),
              outline: { width: 2, color: borderCol },
            });
            drawCircle({ pos: vec2(sx + 20, sy + 20), radius: 9, color: rgb(...roster.ringColor) });

            const slotName = s.playerName || (s.peerId ? `PLAYER ${i + 1}` : `BOT ${roster.name}`);
            drawText({ text: `P${i + 1}: ${slotName}`, pos: vec2(sx + 35, sy + 13), size: 11.5, color: rgb(255, 255, 255) });

            const roleLabel = s.peerId
              ? `HUMAN (${roster.name})`
              : isOnlineLobby && !net.fillWithBots
              ? `OPEN (${roster.name})`
              : `AI BOT (${roster.name})`;
            drawText({
              text: roleLabel,
              pos: vec2(sx + 14, sy + 38),
              size: 10,
              color: s.peerId ? rgb(115, 255, 185) : rgb(...roster.uiColor),
            });
            drawText({
              text: isBlue ? "BLUE" : isRed ? "RED" : "SOLO",
              pos: vec2(sx + 146, sy + 38),
              size: 9.5,
              color: borderCol,
            });
          });

          // Status Msg
          const statusMsg =
            feedbackBanner ||
            (isOnlineLobby
              ? `${net.statusText}   |   KEY B : AI BOT FILL (${net.fillWithBots ? "ON" : "OFF"})`
              : "READY TO LAUNCH! PRESS KEY N TO SET YOUR PLAYER NAME OR SPACE TO START");
          drawText({ text: statusMsg, pos: vec2(cx - 310, cy + 132), size: 10.5, color: rgb(255, 230, 115) });

          // ESC : MENU Button
          drawRect({
            pos: vec2(cx - 310, cy + 154),
            width: 120,
            height: 40,
            radius: 8,
            color: rgb(36, 44, 68),
            outline: { width: 1.5, color: rgb(145, 165, 205) },
          });
          drawText({ text: "ESC : MENU", pos: vec2(cx - 288, cy + 168), size: 12, color: rgb(225, 235, 255) });

          // START MATCH Button
          drawRect({
            pos: vec2(cx - 155, cy + 150),
            width: 320,
            height: 46,
            radius: 10,
            color: rgb(28, 168, 118),
            outline: { width: 2.5, color: rgb(135, 255, 205) },
          });
          drawText({
            text: isOnlineLobby ? "START ONLINE MATCH (SPACE / ENTER)" : "START BATTLE (SPACE / ENTER / CLICK)",
            pos: vec2(cx - 134, cy + 166),
            size: 13.5,
            color: rgb(255, 255, 255),
          });

          // Modal Box Helper
          const drawModalCard = (w, h, outlineCol, title, sub) => {
            drawRect({
              pos: vec2(cx - w * 0.5, cy - h * 0.5),
              width: w,
              height: h,
              radius: 14,
              color: rgb(10, 16, 30),
              opacity: 0.98,
              outline: { width: 3, color: outlineCol },
            });
            drawText({ text: title, pos: vec2(cx - w * 0.5 + 40, cy - h * 0.5 + 28), size: 14.5, color: outlineCol });
            drawText({ text: sub, pos: vec2(cx - w * 0.5 + 40, cy - h * 0.5 + 56), size: 11, color: rgb(205, 225, 248) });
          };

          // Name Modal
          if (showNameModal) {
            drawModalCard(430, 245, rgb(255, 220, 85), "SET YOUR CUSTOM PLAYER NAME", "Type up to 12 letters/numbers and press ENTER to save:");
            drawRect({
              pos: vec2(cx - 165, cy - 22),
              width: 330,
              height: 48,
              radius: 8,
              color: rgb(22, 32, 56),
              outline: { width: 2, color: rgb(115, 245, 255) },
            });
            const cursorBlink = Math.floor(time() * 2.5) % 2 === 0 ? "_" : "";
            drawText({ text: `${typedPlayerName}${cursorBlink}`, pos: vec2(cx - 145, cy - 7), size: 18, color: rgb(135, 255, 215) });

            drawRect({
              pos: vec2(cx - 150, cy + 72),
              width: 140,
              height: 34,
              radius: 7,
              color: rgb(28, 155, 105),
              outline: { width: 1.5, color: rgb(135, 255, 205) },
            });
            drawText({ text: "ENTER : SAVE", pos: vec2(cx - 122, cy + 83), size: 11.5, color: rgb(255, 255, 255) });

            drawRect({
              pos: vec2(cx + 10, cy + 72),
              width: 140,
              height: 34,
              radius: 7,
              color: rgb(42, 48, 72),
              outline: { width: 1.5, color: rgb(145, 165, 205) },
            });
            drawText({ text: "ESC : CANCEL", pos: vec2(cx + 36, cy + 83), size: 11.5, color: rgb(225, 235, 255) });
          }

          // Join Room Modal
          if (showJoinCodeModal) {
            drawModalCard(420, 240, rgb(95, 245, 195), "ENTER FRIEND'S 4-DIGIT ROOM CODE", "Type the 4 digits shown on the Host's Lobby screen:");
            for (let i = 0; i < 4; i++) {
              const bx = cx - 102 + i * 54;
              const hasChar = i < typedJoinCode.length;
              drawRect({
                pos: vec2(bx, cy - 22),
                width: 42,
                height: 48,
                radius: 8,
                color: rgb(22, 32, 56),
                outline: { width: 2, color: hasChar ? rgb(95, 255, 195) : rgb(85, 115, 165) },
              });
              if (hasChar) {
                drawText({ text: typedJoinCode[i], pos: vec2(bx + 14, cy - 9), size: 20, color: rgb(125, 255, 205) });
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
            drawText({ text: "ESC : CANCEL", pos: vec2(cx - 44, cy + 92), size: 11.5, color: rgb(225, 235, 255) });
          }
        },
      },
    ]);
  });
}
