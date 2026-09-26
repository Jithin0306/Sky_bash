// ============================================================================
// src/scenes/menu.js
// ============================================================================
// Main Title Menu & Restricted Developer Access Gate ("menu"):
// - Normal Players press ENTER / SPACE (or click PLAY NORMAL GAME) to launch
//   the standard "arena" scene (clean Player vs AI match, no debug tools).
// - Developers press F2 (or click DEVELOPER TEST LAB) to open the Developer
//   Passcode Gate. Entering the secret Developer PIN (`DEV_CONFIG.PASSCODE`,
//   default "1234") unlocks and launches the restricted "devTest" sandbox!
// ============================================================================

import {
  GAME_CONFIG,
  CAMERA_CONFIG,
  DEV_CONFIG,
} from "../config/gameConfig.js";
import { createArenaCamera } from "../systems/camera.js";
import { createAmbientBackground, createFloatingArena } from "./arena.js";
import { isDevAccessUnlocked } from "./devTest.js";
import {
  getLocalPlayerName,
  setLocalPlayerName,
} from "../network/trysteroManager.js";
import { sound } from "../systems/sound.js";

/**
 * Registers the "menu" scene with KAPLAY.
 */
export function registerMenuScene() {
  scene("menu", () => {
    sound.playMusic("menu");
    const camera = createArenaCamera();
    camera.setZoom(CAMERA_CONFIG.DEFAULT_ZOOM);

    // Render live 2.5D floating island in the background of the Title Screen
    createAmbientBackground();
    createFloatingArena();

    let showPinModal = false;
    let enteredPin = "";
    let statusMessage = "";
    let statusColor = [255, 220, 85];

    let showNameModal = false;
    let typedPlayerName = getLocalPlayerName();

    // Helper to attempt unlocking Developer Mode with the current PIN
    function verifyPinAndLaunch() {
      if (enteredPin === DEV_CONFIG.PASSCODE) {
        try {
          sessionStorage.setItem(DEV_CONFIG.STORAGE_KEY, "true");
        } catch (e) {}
        statusMessage = "ACCESS GRANTED! LOADING DEV SANDBOX...";
        statusColor = [95, 255, 160];
        go("devTest");
      } else {
        statusMessage = "ACCESS DENIED — DEVELOPER PIN REQUIRED!";
        statusColor = [255, 85, 85];
        enteredPin = "";
      }
    }

    // Open Developer Test Lab (directly if already unlocked, or open PIN modal)
    function requestDevAccess() {
      if (isDevAccessUnlocked()) {
        go("devTest");
      } else {
        showPinModal = true;
        showNameModal = false;
        enteredPin = "";
        statusMessage = "TYPE 4-DIGIT DEV PIN ON KEYBOARD (DEFAULT: 1234)";
        statusColor = [135, 235, 255];
      }
    }

    // Keyboard shortcuts on Main Menu
    onKeyPress("space", () => {
      sound.playUIClick();
      if (showNameModal) {
        if (typedPlayerName.length < 12) typedPlayerName += " ";
        return;
      }
      if (!showPinModal) {
        go("multiplayerLobby", { isOnline: false, mode: "1v1" });
      }
    });

    onKeyPress("enter", () => {
      sound.playUIClick();
      if (showNameModal) {
        typedPlayerName = setLocalPlayerName(typedPlayerName || "PLAYER 1");
        showNameModal = false;
        return;
      }
      if (showPinModal) {
        verifyPinAndLaunch();
      } else {
        go("multiplayerLobby", { isOnline: false, mode: "1v1" });
      }
    });

    onKeyPress("n", () => {
      sound.playUIClick();
      if (!showPinModal && !showNameModal) {
        showNameModal = true;
        typedPlayerName = getLocalPlayerName();
      }
    });

    onKeyPress("m", () => {
      if (!showPinModal && !showNameModal) {
        sound.toggleMute();
      }
    });

    onKeyPress("o", () => {
      if (!showPinModal && !showNameModal) {
        sound.playUIClick();
        go("multiplayerLobby", { isOnline: true, mode: "1v1" });
      }
    });

    onKeyPress("f2", () => {
      if (showNameModal) return;
      if (showPinModal) {
        showPinModal = false;
      } else {
        requestDevAccess();
      }
    });

    onKeyPress("escape", () => {
      if (showNameModal) {
        showNameModal = false;
      } else if (showPinModal) {
        showPinModal = false;
        enteredPin = "";
      }
    });

    onKeyPress("backspace", () => {
      if (showNameModal && typedPlayerName.length > 0) {
        typedPlayerName = typedPlayerName.slice(0, -1);
      } else if (showPinModal && enteredPin.length > 0) {
        enteredPin = enteredPin.slice(0, -1);
      }
    });

    // Listen for characters in Name Modal & digits in PIN Modal
    onCharInput((ch) => {
      if (showNameModal) {
        const cleanCh = ch.replace(/[^a-zA-Z0-9 _-]/g, "").toUpperCase();
        if (cleanCh && typedPlayerName.length < 12) {
          typedPlayerName += cleanCh;
        }
      } else if (showPinModal) {
        if (/^[0-9]$/.test(ch) && enteredPin.length < 4) {
          enteredPin += ch;
          if (enteredPin.length === 4) {
            verifyPinAndLaunch();
          }
        }
      }
    });

    // Mouse Click Support for Single Player, Online Multiplayer, Name Box, & Dev Access buttons
    onMousePress("left", () => {
      const m = mousePos();
      const cx = GAME_CONFIG.WIDTH * 0.5;
      const cy = GAME_CONFIG.HEIGHT * 0.5;

      if (showNameModal) {
        if (m.x >= cx - 150 && m.x <= cx - 10 && m.y >= cy + 72 && m.y <= cy + 108) {
          typedPlayerName = setLocalPlayerName(typedPlayerName || "PLAYER 1");
          showNameModal = false;
          return;
        }
        if (m.x >= cx + 10 && m.x <= cx + 150 && m.y >= cy + 72 && m.y <= cy + 108) {
          showNameModal = false;
          return;
        }
        return;
      }

      if (showPinModal) {
        if (
          m.x >= cx - 75 &&
          m.x <= cx + 75 &&
          m.y >= cy + 88 &&
          m.y <= cy + 122
        ) {
          showPinModal = false;
          enteredPin = "";
        }
        return;
      }

      // Audio Mute / Unmute Button at Top-Right
      if (m.x >= GAME_CONFIG.WIDTH - 130 && m.x <= GAME_CONFIG.WIDTH - 10 && m.y >= 12 && m.y <= 42) {
        sound.toggleMute();
        return;
      }

      // 0. Click Custom Player Name Pill on Main Menu
      if (
        m.x >= cx - 175 &&
        m.x <= cx + 175 &&
        m.y >= cy - 102 &&
        m.y <= cy - 72
      ) {
        sound.playUIClick();
        showNameModal = true;
        typedPlayerName = getLocalPlayerName();
        return;
      }

      // 1. SINGLE PLAYER (VS AI BOTS) Button Bounds
      if (
        m.x >= cx - 195 &&
        m.x <= cx + 195 &&
        m.y >= cy - 58 &&
        m.y <= cy - 2
      ) {
        sound.playUIClick();
        go("multiplayerLobby", { isOnline: false, mode: "1v1" });
        return;
      }

      // 2. ONLINE MULTIPLAYER (TRYSTERO P2P) Button Bounds
      if (
        m.x >= cx - 195 &&
        m.x <= cx + 195 &&
        m.y >= cy + 14 &&
        m.y <= cy + 70
      ) {
        sound.playUIClick();
        go("multiplayerLobby", { isOnline: true, mode: "1v1" });
        return;
      }

      // 3. DEVELOPER TEST LAB Button Bounds
      if (
        m.x >= cx - 195 &&
        m.x <= cx + 195 &&
        m.y >= cy + 88 &&
        m.y <= cy + 138
      ) {
        sound.playUIClick();
        requestDevAccess();
      }
    });

    // Render the Main Menu UI & Modals
    add([
      fixed(),
      z(1000),
      {
        draw() {
          const cx = GAME_CONFIG.WIDTH * 0.5;
          const cy = GAME_CONFIG.HEIGHT * 0.5;
          const t = time();
          const devUnlocked = isDevAccessUnlocked();
          const currentName = getLocalPlayerName();

          // Dark translucent backdrop vignette
          drawRect({
            pos: vec2(0, 0),
            width: GAME_CONFIG.WIDTH,
            height: GAME_CONFIG.HEIGHT,
            color: rgb(8, 12, 24),
            opacity: showPinModal || showNameModal ? 0.82 : 0.52,
          });

          // Audio Mute / Unmute Button at Top-Right
          const isMuted = sound.isMuted();
          drawRect({
            pos: vec2(GAME_CONFIG.WIDTH - 128, 14),
            width: 114,
            height: 24,
            radius: 6,
            color: rgb(12, 18, 32),
            opacity: 0.88,
            outline: { width: 1.5, color: isMuted ? rgb(255, 95, 95) : rgb(95, 235, 160) },
          });
          drawText({
            text: isMuted ? "MUTED (M)" : "AUDIO ON (M)",
            pos: vec2(GAME_CONFIG.WIDTH - 118, 20),
            size: 10,
            color: isMuted ? rgb(255, 145, 145) : rgb(125, 255, 195),
          });

          // Main Title Panel
          drawRect({
            pos: vec2(cx - 280, cy - 205),
            width: 560,
            height: 380,
            radius: 16,
            color: rgb(14, 20, 36),
            opacity: 0.94,
            outline: {
              width: 3,
              color: rgb(65, 195, 245),
            },
          });

          // Game Title & Subtitle with high-contrast shadow
          drawText({
            text: "SKY BASH : 2.5D ARENA BRAWL",
            pos: vec2(cx - 280, cy - 179),
            width: 560,
            align: "center",
            size: 28,
            color: rgb(10, 16, 32),
          });
          drawText({
            text: "SKY BASH : 2.5D ARENA BRAWL",
            pos: vec2(cx - 280, cy - 181),
            width: 560,
            align: "center",
            size: 28,
            color: rgb(105, 245, 255),
          });

          drawText({
            text: "1v1 DUEL  |  2v2 TEAMS  |  UP TO 6-PLAYER FREE-FOR-ALL CHAOS",
            pos: vec2(cx - 280, cy - 144),
            width: 560,
            align: "center",
            size: 13,
            color: rgb(215, 232, 255),
          });

          // Custom Player Name Badge (Click or Press N to Edit!)
          drawRect({
            pos: vec2(cx - 190, cy - 105),
            width: 380,
            height: 32,
            radius: 8,
            color: rgb(20, 30, 52),
            outline: { width: 1.8, color: rgb(255, 220, 75) },
          });
          drawText({
            text: `PLAYER NAME: ${currentName}   (PRESS N OR CLICK TO EDIT)`,
            pos: vec2(cx - 190, cy - 96),
            width: 380,
            align: "center",
            size: 13,
            color: rgb(255, 235, 110),
          });

          // Button 1: SINGLE PLAYER (VS AI BOTS)
          const pulseScale = 1 + Math.sin(t * 4) * 0.012;
          pushTransform();
          pushTranslate(cx, cy - 30);
          pushScale(pulseScale, pulseScale);

          drawRect({
            pos: vec2(-195, -28),
            width: 390,
            height: 58,
            radius: 10,
            color: rgb(28, 148, 212),
            outline: { width: 2.5, color: rgb(165, 245, 255) },
          });

          drawText({
            text: "SINGLE PLAYER — VS AI BOTS (ENTER / CLICK)",
            pos: vec2(-195, -16),
            width: 390,
            align: "center",
            size: 16,
            color: rgb(255, 255, 255),
          });
          drawText({
            text: "Play 1v1 Duel, 2v2 Teams, or 3-6P Free-For-All vs AI Bots",
            pos: vec2(-195, 8),
            width: 390,
            align: "center",
            size: 12,
            color: rgb(215, 248, 255),
          });
          popTransform();

          // Button 2: ONLINE MULTIPLAYER (TRYSTERO P2P — NO SERVER)
          drawRect({
            pos: vec2(cx - 195, cy + 14),
            width: 390,
            height: 58,
            radius: 10,
            color: rgb(22, 138, 98),
            outline: { width: 2.5, color: rgb(115, 255, 195) },
          });

          drawText({
            text: "ONLINE MULTIPLAYER — P2P ROOMS (PRESS M)",
            pos: vec2(cx - 195, cy + 26),
            width: 390,
            align: "center",
            size: 16,
            color: rgb(255, 255, 255),
          });
          drawText({
            text: "1v1 Online, 2v2 Teams & Up to 6P Free-For-All (4-Digit Room Code)",
            pos: vec2(cx - 195, cy + 50),
            width: 390,
            align: "center",
            size: 12,
            color: rgb(215, 255, 235),
          });

          // Button 3: DEVELOPER TEST LAB Button (Protected by Developer PIN)
          drawRect({
            pos: vec2(cx - 195, cy + 88),
            width: 390,
            height: 52,
            radius: 10,
            color: devUnlocked ? rgb(18, 85, 58) : rgb(28, 34, 54),
            outline: {
              width: 2,
              color: devUnlocked ? rgb(85, 255, 165) : rgb(255, 195, 65),
            },
          });

          const devBtnTitle = devUnlocked
            ? "DEV TEST AREA — UNLOCKED (PRESS F2)"
            : "DEVELOPER TEST AREA — LOCKED (PRESS F2)";
          drawText({
            text: devBtnTitle,
            pos: vec2(cx - 195, cy + 98),
            width: 390,
            align: "center",
            size: 14,
            color: devUnlocked ? rgb(110, 255, 175) : rgb(255, 215, 85),
          });

          drawText({
            text: "Restricted Element Spawner, Target Dummy & AI Debug Tools",
            pos: vec2(cx - 195, cy + 120),
            width: 390,
            align: "center",
            size: 11,
            color: rgb(185, 202, 230),
          });

          // Modal Overlay when Custom Player Name Editor is open (Key N / Click)
          if (showNameModal) {
            drawRect({
              pos: vec2(cx - 215, cy - 115),
              width: 430,
              height: 245,
              radius: 14,
              color: rgb(10, 16, 30),
              opacity: 0.98,
              outline: { width: 3, color: rgb(255, 220, 85) },
            });
            drawText({
              text: "SET YOUR CUSTOM PLAYER NAME",
              pos: vec2(cx - 215, cy - 86),
              width: 430,
              align: "center",
              size: 16,
              color: rgb(255, 230, 95),
            });
            drawText({
              text: "Type up to 12 letters/numbers and press ENTER to save:",
              pos: vec2(cx - 215, cy - 56),
              width: 430,
              align: "center",
              size: 13,
              color: rgb(215, 232, 255),
            });

            drawRect({
              pos: vec2(cx - 165, cy - 22),
              width: 330,
              height: 48,
              radius: 8,
              color: rgb(22, 32, 56),
              outline: { width: 2, color: rgb(115, 245, 255) },
            });

            const cursorBlink = Math.floor(t * 2.5) % 2 === 0 ? "_" : "";
            drawText({
              text: `${typedPlayerName}${cursorBlink}`,
              pos: vec2(cx - 165, cy - 9),
              width: 330,
              align: "center",
              size: 20,
              color: rgb(135, 255, 215),
            });

            drawRect({
              pos: vec2(cx - 150, cy + 72),
              width: 140,
              height: 36,
              radius: 7,
              color: rgb(28, 155, 105),
              outline: { width: 1.5, color: rgb(135, 255, 205) },
            });
            drawText({
              text: "ENTER : SAVE",
              pos: vec2(cx - 150, cy + 82),
              width: 140,
              align: "center",
              size: 13,
              color: rgb(255, 255, 255),
            });

            drawRect({
              pos: vec2(cx + 10, cy + 72),
              width: 140,
              height: 36,
              radius: 7,
              color: rgb(42, 48, 72),
              outline: { width: 1.5, color: rgb(145, 165, 205) },
            });
            drawText({
              text: "ESC : CANCEL",
              pos: vec2(cx + 10, cy + 82),
              width: 140,
              align: "center",
              size: 13,
              color: rgb(225, 235, 255),
            });
          }

          // Modal Overlay when Developer PIN is requested
          if (showPinModal) {
            drawRect({
              pos: vec2(cx - 215, cy - 115),
              width: 430,
              height: 250,
              radius: 14,
              color: rgb(10, 14, 26),
              opacity: 0.98,
              outline: { width: 3, color: rgb(255, 205, 65) },
            });

            drawText({
              text: "DEVELOPER SECURITY CLEARANCE",
              pos: vec2(cx - 215, cy - 90),
              width: 430,
              align: "center",
              size: 16,
              color: rgb(255, 220, 75),
            });

            drawText({
              text: "Only Developers can access the Element Test Sandbox.",
              pos: vec2(cx - 215, cy - 62),
              width: 430,
              align: "center",
              size: 13,
              color: rgb(215, 228, 250),
            });

            // 4-Digit PIN Boxes
            for (let i = 0; i < 4; i++) {
              const bx = cx - 102 + i * 54;
              const by = cy - 28;
              const hasChar = i < enteredPin.length;

              drawRect({
                pos: vec2(bx, by),
                width: 42,
                height: 48,
                radius: 8,
                color: rgb(22, 30, 52),
                outline: {
                  width: 2,
                  color: hasChar ? rgb(85, 245, 185) : rgb(88, 110, 155),
                },
              });

              if (hasChar) {
                drawText({
                  text: enteredPin[i],
                  pos: vec2(bx, by + 12),
                  width: 42,
                  align: "center",
                  size: 22,
                  color: rgb(110, 255, 195),
                });
              }
            }

            drawText({
              text: statusMessage,
              pos: vec2(cx - 215, cy + 40),
              width: 430,
              align: "center",
              size: 13,
              color: rgb(...statusColor),
            });

            // Cancel Button
            drawRect({
              pos: vec2(cx - 75, cy + 88),
              width: 150,
              height: 34,
              radius: 7,
              color: rgb(42, 48, 72),
              outline: { width: 1.5, color: rgb(145, 165, 205) },
            });
            drawText({
              text: "ESC : CANCEL",
              pos: vec2(cx - 75, cy + 97),
              width: 150,
              align: "center",
              size: 13,
              color: rgb(225, 235, 255),
            });
          }
        },
      },
    ]);
  });
}
