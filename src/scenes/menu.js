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

/**
 * Registers the "menu" scene with KAPLAY.
 */
export function registerMenuScene() {
  scene("menu", () => {
    const camera = createArenaCamera();
    camera.setZoom(CAMERA_CONFIG.DEFAULT_ZOOM);

    // Render live 2.5D floating island in the background of the Title Screen
    createAmbientBackground();
    createFloatingArena();

    let showPinModal = false;
    let enteredPin = "";
    let statusMessage = "";
    let statusColor = [255, 220, 85];

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
        enteredPin = "";
        statusMessage = "TYPE 4-DIGIT DEV PIN ON KEYBOARD (DEFAULT: 1234)";
        statusColor = [135, 235, 255];
      }
    }

    // Keyboard shortcuts on Main Menu
    onKeyPress("space", () => {
      if (!showPinModal) {
        go("multiplayerLobby", { isOnline: false, mode: "1v1" });
      }
    });

    onKeyPress("enter", () => {
      if (showPinModal) {
        verifyPinAndLaunch();
      } else {
        go("multiplayerLobby", { isOnline: false, mode: "1v1" });
      }
    });

    onKeyPress("m", () => {
      if (!showPinModal) {
        go("multiplayerLobby", { isOnline: true, mode: "1v1" });
      }
    });

    onKeyPress("f2", () => {
      if (showPinModal) {
        showPinModal = false;
      } else {
        requestDevAccess();
      }
    });

    onKeyPress("escape", () => {
      if (showPinModal) {
        showPinModal = false;
        enteredPin = "";
      }
    });

    onKeyPress("backspace", () => {
      if (showPinModal && enteredPin.length > 0) {
        enteredPin = enteredPin.slice(0, -1);
      }
    });

    // Listen for digit keys 0-9 when the Developer PIN modal is open
    const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    for (const d of digits) {
      onKeyPress(d, () => {
        if (!showPinModal) return;
        if (enteredPin.length < 4) {
          enteredPin += d;
          if (enteredPin.length === 4) {
            verifyPinAndLaunch();
          }
        }
      });
    }

    // Mouse Click Support for Single Player, Online Multiplayer, & Dev Access buttons
    onMousePress("left", () => {
      const m = mousePos();
      const cx = GAME_CONFIG.WIDTH * 0.5;
      const cy = GAME_CONFIG.HEIGHT * 0.5;

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

      // 1. SINGLE PLAYER (VS AI BOTS) Button Bounds
      if (
        m.x >= cx - 195 &&
        m.x <= cx + 195 &&
        m.y >= cy - 58 &&
        m.y <= cy - 2
      ) {
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
        requestDevAccess();
      }
    });

    // Render the Main Menu UI & Developer PIN Modal
    add([
      fixed(),
      z(1000),
      {
        draw() {
          const cx = GAME_CONFIG.WIDTH * 0.5;
          const cy = GAME_CONFIG.HEIGHT * 0.5;
          const t = time();
          const devUnlocked = isDevAccessUnlocked();

          // Dark translucent backdrop vignette
          drawRect({
            pos: vec2(0, 0),
            width: GAME_CONFIG.WIDTH,
            height: GAME_CONFIG.HEIGHT,
            color: rgb(8, 12, 24),
            opacity: showPinModal ? 0.82 : 0.52,
          });

          // Main Title Panel
          drawRect({
            pos: vec2(cx - 280, cy - 195),
            width: 560,
            height: 365,
            radius: 16,
            color: rgb(14, 20, 36),
            opacity: 0.94,
            outline: {
              width: 3,
              color: rgb(65, 195, 245),
            },
          });

          // Game Title & Subtitle
          drawText({
            text: "SKY BASH : 2.5D ARENA BRAWL",
            pos: vec2(cx - 196, cy - 162),
            size: 24,
            color: rgb(95, 235, 255),
          });

          drawText({
            text: "1v1 DUEL  |  2v2 TEAMS  |  UP TO 6-PLAYER FREE-FOR-ALL CHAOS",
            pos: vec2(cx - 208, cy - 126),
            size: 11.5,
            color: rgb(195, 212, 240),
          });

          // Button 1: SINGLE PLAYER (VS AI BOTS)
          const pulseScale = 1 + Math.sin(t * 4) * 0.012;
          pushTransform();
          pushTranslate(cx, cy - 30);
          pushScale(pulseScale, pulseScale);

          drawRect({
            pos: vec2(-195, -28),
            width: 390,
            height: 56,
            radius: 10,
            color: rgb(28, 148, 212),
            outline: { width: 2.5, color: rgb(155, 245, 255) },
          });

          drawText({
            text: "SINGLE PLAYER — VS AI BOTS (ENTER / CLICK)",
            pos: vec2(-168, -14),
            size: 14,
            color: rgb(255, 255, 255),
          });
          drawText({
            text: "Play 1v1 Duel, 2v2 Teams, or 3-6P Free-For-All vs AI Bots",
            pos: vec2(-162, 7),
            size: 10.5,
            color: rgb(215, 248, 255),
          });
          popTransform();

          // Button 2: ONLINE MULTIPLAYER (TRYSTERO P2P — NO SERVER)
          drawRect({
            pos: vec2(cx - 195, cy + 14),
            width: 390,
            height: 56,
            radius: 10,
            color: rgb(22, 138, 98),
            outline: { width: 2.5, color: rgb(115, 255, 195) },
          });

          drawText({
            text: "ONLINE MULTIPLAYER — P2P ROOMS (PRESS M)",
            pos: vec2(cx - 168, cy + 28),
            size: 14,
            color: rgb(255, 255, 255),
          });
          drawText({
            text: "1v1 Online, 2v2 Teams & Up to 6P Free-For-All (4-Digit Room Code)",
            pos: vec2(cx - 174, cy + 49),
            size: 10,
            color: rgb(215, 255, 235),
          });

          // Button 3: DEVELOPER TEST LAB Button (Protected by Developer PIN)
          drawRect({
            pos: vec2(cx - 195, cy + 88),
            width: 390,
            height: 50,
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
            pos: vec2(cx - 150, cy + 100),
            size: 13,
            color: devUnlocked ? rgb(110, 255, 175) : rgb(255, 215, 85),
          });

          drawText({
            text: "Restricted Element Spawner, Target Dummy & AI Debug Tools",
            pos: vec2(cx - 152, cy + 119),
            size: 10,
            color: rgb(175, 192, 220),
          });

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
              pos: vec2(cx - 142, cy - 90),
              size: 15,
              color: rgb(255, 220, 75),
            });

            drawText({
              text: "Only Developers can access the Element Test Sandbox.",
              pos: vec2(cx - 165, cy - 62),
              size: 11.5,
              color: rgb(210, 222, 245),
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
                  pos: vec2(bx + 14, by + 13),
                  size: 20,
                  color: rgb(110, 255, 195),
                });
              }
            }

            drawText({
              text: statusMessage,
              pos: vec2(cx - 158, cy + 40),
              size: 11,
              color: rgb(...statusColor),
            });

            // Cancel Button
            drawRect({
              pos: vec2(cx - 75, cy + 88),
              width: 150,
              height: 32,
              radius: 7,
              color: rgb(42, 48, 72),
              outline: { width: 1.5, color: rgb(145, 165, 205) },
            });
            drawText({
              text: "ESC : CANCEL",
              pos: vec2(cx - 44, cy + 98),
              size: 11.5,
              color: rgb(225, 235, 255),
            });
          }
        },
      },
    ]);
  });
}
