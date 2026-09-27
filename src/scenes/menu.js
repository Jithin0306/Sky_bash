// ============================================================================
// src/scenes/menu.js — Rewritten with Ponytail (Minimal, zero-bloat, robust)
// ============================================================================

import {
  GAME_CONFIG,
  ARENA_CONFIG,
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

const lerp = (a, b, t) => Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
const lerpColor = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

export function registerMenuScene() {
  scene("menu", () => {
    sound.playMusic("menu");
    const camera = createArenaCamera();
    camera.setZoom(CAMERA_CONFIG.DEFAULT_ZOOM);
    createAmbientBackground();
    createFloatingArena();

    // State
    let showPinModal = false;
    let showNameModal = false;
    let enteredPin = "";
    let statusMessage = "TYPE 4-DIGIT DEV PIN (DEFAULT: 1234)";
    let statusColor = [135, 235, 255];
    let typedPlayerName = getLocalPlayerName();

    let introTimer = 0;
    let hoverSP = 0;
    let hoverMP = 0;
    let hoverProfile = 0;
    let hoverDev = 0;

    // Drifting foreground particles
    const sparks = Array.from({ length: 20 }, () => ({
      x: rand(60, GAME_CONFIG.WIDTH - 60),
      y: rand(40, GAME_CONFIG.HEIGHT),
      r: rand(1.2, 2.5),
      vy: rand(-12, -22),
      vx: rand(-4, 4),
      alpha: rand(0.15, 0.4),
      phase: rand(0, Math.PI * 2),
    }));

    // Navigation helpers
    const goSinglePlayer = () => { sound.playUIClick(); go("multiplayerLobby", { isOnline: false, mode: "1v1" }); };
    const goMultiplayer = () => { sound.playUIClick(); go("multiplayerLobby", { isOnline: true, mode: "1v1" }); };

    function verifyPinAndLaunch() {
      if (enteredPin === DEV_CONFIG.PASSCODE) {
        try { sessionStorage.setItem(DEV_CONFIG.STORAGE_KEY, "true"); } catch (e) {}
        go("devTest");
      } else {
        statusMessage = "ACCESS DENIED — INVALID PIN!";
        statusColor = [255, 85, 85];
        enteredPin = "";
      }
    }

    function requestDevAccess() {
      if (isDevAccessUnlocked()) {
        go("devTest");
      } else {
        showPinModal = true;
        showNameModal = false;
        enteredPin = "";
        statusMessage = "TYPE 4-DIGIT DEV PIN (DEFAULT: 1234)";
        statusColor = [135, 235, 255];
      }
    }

    // Keyboard shortcuts
    const isModalOpen = () => showNameModal || showPinModal;

    ["space", "enter", "s", "1"].forEach((k) =>
      onKeyPress(k, () => {
        if (showNameModal) {
          if (k === "space" && typedPlayerName.length < 12) typedPlayerName += " ";
          if (k === "enter") {
            typedPlayerName = setLocalPlayerName(typedPlayerName || "PLAYER 1");
            showNameModal = false;
          }
          return;
        }
        if (showPinModal) {
          if (k === "enter") verifyPinAndLaunch();
          return;
        }
        goSinglePlayer();
      })
    );

    ["o", "2"].forEach((k) => onKeyPress(k, () => { if (!isModalOpen()) goMultiplayer(); }));

    onKeyPress("n", () => {
      if (!isModalOpen()) {
        sound.playUIClick();
        showNameModal = true;
        typedPlayerName = getLocalPlayerName();
      }
    });

    ["f2", "d"].forEach((k) => onKeyPress(k, () => {
      if (showNameModal) return;
      if (showPinModal && k === "f2") { showPinModal = false; return; }
      requestDevAccess();
    }));

    onKeyPress("escape", () => {
      showNameModal = false;
      showPinModal = false;
      enteredPin = "";
    });

    onKeyPress("backspace", () => {
      if (showNameModal && typedPlayerName.length > 0) typedPlayerName = typedPlayerName.slice(0, -1);
      if (showPinModal && enteredPin.length > 0) enteredPin = enteredPin.slice(0, -1);
    });

    onCharInput((ch) => {
      if (showNameModal) {
        const clean = ch.replace(/[^a-zA-Z0-9 _-]/g, "").toUpperCase();
        if (clean && typedPlayerName.length < 12) typedPlayerName += clean;
      } else if (showPinModal && /^[0-9]$/.test(ch) && enteredPin.length < 4) {
        enteredPin += ch;
        if (enteredPin.length === 4) verifyPinAndLaunch();
      }
    });

    sound.registerAudioKeyBindings(() => !isModalOpen());

    // Coordinate constants
    const cx = GAME_CONFIG.WIDTH * 0.5;
    const cy = GAME_CONFIG.HEIGHT * 0.5;
    const spX = cx - 380;
    const mpX = cx + 20;
    const cardY = 285;
    const cardW = 360;
    const cardH = 215;

    // Mouse Clicks
    onMousePress("left", () => {
      const m = mousePos();
      if (sound.handleAudioClick(m.x, m.y)) return;

      if (showNameModal) {
        if (m.x >= cx - 150 && m.x <= cx - 10 && m.y >= cy + 70 && m.y <= cy + 108) {
          typedPlayerName = setLocalPlayerName(typedPlayerName || "PLAYER 1");
          showNameModal = false;
        } else if (m.x >= cx + 10 && m.x <= cx + 150 && m.y >= cy + 70 && m.y <= cy + 108) {
          showNameModal = false;
        }
        return;
      }

      if (showPinModal) {
        if (m.x >= cx - 75 && m.x <= cx + 75 && m.y >= cy + 86 && m.y <= cy + 122) {
          showPinModal = false;
          enteredPin = "";
        }
        return;
      }

      // Profile click
      if (m.x >= 32 && m.x <= 276 && m.y >= 14 && m.y <= 58) {
        sound.playUIClick();
        showNameModal = true;
        typedPlayerName = getLocalPlayerName();
        return;
      }

      // Cards
      if (m.y >= cardY && m.y <= cardY + cardH) {
        if (m.x >= spX && m.x <= spX + cardW) { goSinglePlayer(); return; }
        if (m.x >= mpX && m.x <= mpX + cardW) { goMultiplayer(); return; }
      }

      // Dev button
      if (m.x >= cx - 160 && m.x <= cx + 160 && m.y >= 524 && m.y <= 558) {
        sound.playUIClick();
        requestDevAccess();
      }
    });

    // Per-frame physics & hover update
    onUpdate(() => {
      const delta = dt();
      const t = time();
      camera.setTarget(vec2(ARENA_CONFIG.CENTER_X + Math.sin(t * 0.35) * 10, ARENA_CONFIG.CENTER_Y + Math.cos(t * 0.28) * 6));
      introTimer = Math.min(1.0, introTimer + delta * 2.2);

      for (const sp of sparks) {
        sp.y += sp.vy * delta;
        sp.x += sp.vx * delta;
        if (sp.y < -20) { sp.y = GAME_CONFIG.HEIGHT + 20; sp.x = rand(60, GAME_CONFIG.WIDTH - 60); }
      }

      const m = mousePos();
      const over = (x, y, w, h) => !isModalOpen() && m.x >= x && m.x <= x + w && m.y >= y && m.y <= y + h;
      const step = Math.min(1, delta * 12);
      hoverSP += ((over(spX, cardY, cardW, cardH) ? 1 : 0) - hoverSP) * step;
      hoverMP += ((over(mpX, cardY, cardW, cardH) ? 1 : 0) - hoverMP) * step;
      hoverProfile += ((over(32, 14, 244, 44) ? 1 : 0) - hoverProfile) * step;
      hoverDev += ((over(cx - 160, 524, 320, 34) ? 1 : 0) - hoverDev) * step;
    });

    // Render Main Menu
    add([
      fixed(),
      z(1000),
      {
        draw() {
          const t = time();
          const ease = 1 - Math.pow(1 - introTimer, 3);
          const alpha = Math.min(1, ease * 1.25);
          const titleY = 126 + Math.sin(t * 1.6) * 3 - (1 - ease) * 40;
          const cardBaseY = 285 + (1 - ease) * 45;
          const currentName = getLocalPlayerName();
          const devUnlocked = isDevAccessUnlocked();

          // 1. Atmosphere backdrop
          drawRect({ pos: vec2(0, 0), width: GAME_CONFIG.WIDTH, height: GAME_CONFIG.HEIGHT, color: rgb(6, 10, 20), opacity: isModalOpen() ? 0.88 : 0.62 });
          drawCircle({ pos: vec2(cx, 160), radius: 380, color: rgb(22, 58, 108), opacity: 0.16 * alpha });
          drawCircle({ pos: vec2(cx, cy + 90), radius: 540, color: rgb(18, 38, 76), opacity: 0.22 * alpha });

          for (const sp of sparks) {
            drawCircle({ pos: vec2(sp.x, sp.y), radius: sp.r, color: rgb(130, 215, 255), opacity: sp.alpha * (0.75 + 0.25 * Math.sin(t * 2.5 + sp.phase)) * alpha });
          }

          // 2. Profile Badge (Top-Left)
          const pBorder = lerpColor([56, 75, 115], [255, 215, 80], hoverProfile);
          drawRect({ pos: vec2(32, 14), width: 244, height: 44, radius: 10, color: rgb(...lerpColor([12, 18, 32], [22, 34, 58], hoverProfile)), opacity: 0.92 * alpha, outline: { width: 1.5 + hoverProfile * 0.8, color: rgb(...pBorder) } });
          drawCircle({ pos: vec2(56, 36), radius: 14, color: rgb(22, 36, 62), outline: { width: 2, color: rgb(...pBorder) } });
          drawText({ text: currentName ? currentName[0].toUpperCase() : "P", pos: vec2(49, 27), size: 15, color: rgb(255, 225, 110) });
          drawText({ text: "FIGHTER PROFILE", pos: vec2(78, 20), size: 9, color: rgb(135, 165, 205) });
          drawText({ text: currentName || "PLAYER 1", pos: vec2(78, 32), size: 14, color: rgb(255, 240, 150) });
          drawRect({ pos: vec2(208, 22), width: 58, height: 26, radius: 6, color: rgb(24, 34, 56), outline: { width: 1.2, color: hoverProfile > 0.5 ? rgb(255, 215, 85) : rgb(85, 115, 165) } });
          drawText({ text: "EDIT (N)", pos: vec2(214, 29), size: 9.5, color: hoverProfile > 0.5 ? rgb(255, 235, 130) : rgb(205, 225, 255) });

          // 3. Audio HUD (Top-Right)
          sound.drawAudioHUD();

          // 4. Hero Branding
          drawLine({ p1: vec2(cx - 320, titleY - 4), p2: vec2(cx - 150, titleY - 4), width: 1.5, color: rgb(45, 105, 175), opacity: 0.45 * alpha });
          drawLine({ p1: vec2(cx + 150, titleY - 4), p2: vec2(cx + 320, titleY - 4), width: 1.5, color: rgb(45, 105, 175), opacity: 0.45 * alpha });

          // Glowing title layers
          drawText({ text: "SKY BASH", pos: vec2(cx - 300, titleY - 32), width: 600, align: "center", size: 52, color: rgb(32, 175, 245), opacity: (0.28 + Math.sin(t * 2) * 0.08) * alpha });
          drawText({ text: "SKY BASH", pos: vec2(cx - 300, titleY - 30), width: 600, align: "center", size: 52, color: rgb(4, 8, 16), opacity: 0.95 * alpha });
          drawText({ text: "SKY BASH", pos: vec2(cx - 300, titleY - 34), width: 600, align: "center", size: 52, color: rgb(240, 250, 255), opacity: alpha });

          drawRect({ pos: vec2(cx - 115, titleY + 28), width: 230, height: 22, radius: 11, color: rgb(13, 22, 40), opacity: 0.92 * alpha, outline: { width: 1.4, color: rgb(56, 189, 248) } });
          drawText({ text: "2.5D ARENA BRAWL", pos: vec2(cx - 115, titleY + 33), width: 230, align: "center", size: 11.5, color: rgb(155, 230, 255), opacity: alpha });
          drawText({ text: "FAST-PACED PHYSICS COMBAT  •  SERVERLESS P2P  •  UP TO 6 FIGHTERS", pos: vec2(cx - 350, titleY + 58), width: 700, align: "center", size: 11, color: rgb(140, 170, 210), opacity: 0.88 * alpha });

          // 5. Game Mode Cards (Clean Helper to eliminate 200+ lines of duplicate rendering)
          const renderCard = (x, hover, pillTag, pillW, badgeText, title, desc1, desc2, bullets, btnLabel, colors) => {
            const y = cardBaseY - hover * 4;
            const borderCol = lerpColor(colors.borderDim, colors.borderLit, hover);
            drawRect({ pos: vec2(x + 2, y + 4), width: cardW, height: cardH, radius: 16, color: rgb(4, 6, 12), opacity: 0.55 * alpha });
            drawRect({ pos: vec2(x, y), width: cardW, height: cardH, radius: 16, color: rgb(...lerpColor(colors.bgBase, colors.bgLit, hover)), opacity: 0.94 * alpha, outline: { width: 2 + hover, color: rgb(...borderCol) } });

            drawRect({ pos: vec2(x + 22, y + 20), width: pillW, height: 22, radius: 6, color: rgb(...colors.pillBg), outline: { width: 1, color: rgb(...colors.pillOutline) } });
            drawText({ text: pillTag, pos: vec2(x + 28, y + 25), size: 9.5, color: rgb(...colors.pillText) });
            drawText({ text: badgeText, pos: vec2(x + cardW - 84, y + 25), size: 10, color: rgb(...colors.badgeColor) });

            drawText({ text: title, pos: vec2(x + 22, y + 54), size: 21, color: rgb(255, 255, 255) });
            drawText({ text: desc1, pos: vec2(x + 22, y + 84), size: 12, color: rgb(185, 210, 240) });
            drawText({ text: desc2, pos: vec2(x + 22, y + 102), size: 12, color: rgb(185, 210, 240) });
            drawText({ text: bullets, pos: vec2(x + 22, y + 128), size: 11, color: rgb(...colors.bulletColor) });

            const btnBg = lerpColor(colors.btnBase, colors.btnLit, hover);
            drawRect({ pos: vec2(x + 20, y + 154), width: cardW - 40, height: 42, radius: 10, color: rgb(...btnBg), outline: { width: 1.5, color: hover > 0.5 ? rgb(...colors.btnOutlineLit) : rgb(...colors.btnOutlineBase) } });
            drawText({ text: btnLabel, pos: vec2(x + 20, y + 167), width: cardW - 40, align: "center", size: 12.5, color: rgb(255, 255, 255) });
          };

          // Single Player Card
          renderCard(
            spX, hoverSP, "🤖 BOT SPARRING", 126, "OFFLINE", "SINGLE PLAYER",
            "Fight smart AI brawlers with full physics,", "weapons, items, and platform ring-outs.",
            "• 1v1 Duel   • 2v2 Teams   • Chaos FFA", "PLAY VS BOTS  (PRESS S / ENTER)",
            {
              borderDim: [45, 75, 120], borderLit: [80, 215, 255], bgBase: [12, 18, 32], bgLit: [16, 26, 46],
              pillBg: [22, 38, 68], pillOutline: [75, 145, 225], pillText: [135, 205, 255], badgeColor: [125, 150, 185],
              bulletColor: [135, 185, 235], btnBase: [24, 88, 148], btnLit: [34, 135, 215],
              btnOutlineBase: [95, 195, 255], btnOutlineLit: [165, 245, 255]
            }
          );

          // Online Multiplayer Card (Hero highlighted)
          const mpPulse = Math.sin(t * 3) * 0.15 + 0.85;
          renderCard(
            mpX, Math.max(hoverMP, mpPulse * 0.4), "🌐 P2P WEBRTC • ZERO LAG", 172, "FEATURED", "ONLINE MULTIPLAYER",
            "Play with friends across the globe in private", "rooms with synced physics & item drops.",
            "• 1-Click Link   • 4-Digit Code   • 2-6 Players", "PLAY ONLINE  (PRESS O)",
            {
              borderDim: [38, 166, 110], borderLit: [68, 255, 175], bgBase: [12, 22, 34], bgLit: [16, 32, 48],
              pillBg: [18, 55, 40], pillOutline: [68, 235, 160], pillText: [105, 255, 185], badgeColor: [110, 255, 195],
              bulletColor: [125, 245, 190], btnBase: [18, 138, 92], btnLit: [28, 188, 124],
              btnOutlineBase: [115, 255, 190], btnOutlineLit: [165, 255, 215]
            }
          );

          // 6. Discreet Dev Button
          const devBorderCol = devUnlocked ? lerpColor([45, 185, 115], [85, 255, 165], hoverDev) : lerpColor([52, 66, 92], [255, 205, 80], hoverDev);
          drawRect({ pos: vec2(cx - 160, 528), width: 320, height: 30, radius: 8, color: rgb(12, 18, 30), opacity: 0.85 * alpha, outline: { width: 1.2, color: rgb(...devBorderCol) } });
          const devTitle = devUnlocked ? "⚡ DEV SANDBOX UNLOCKED  (PRESS F2 / CLICK)" : "🔒 DEVELOPER TEST LAB  (PRESS F2 / CLICK)";
          drawText({ text: devTitle, pos: vec2(cx - 160, 537), width: 320, align: "center", size: 11, color: devUnlocked ? rgb(110, 255, 180) : rgb(185, 205, 235) });

          // 7. Footer
          drawRect({ pos: vec2(cx - 390, 646), width: 780, height: 26, radius: 13, color: rgb(10, 15, 26), opacity: 0.88 * alpha, outline: { width: 1, color: rgb(36, 50, 75) } });
          drawText({ text: "WASD: Move  •  SPACE: Jump  •  J/CLICK: Punch  •  E: Grab  •  K: Throw  •  N: Rename  •  M: Music  •  X: SFX", pos: vec2(cx - 390, 652), width: 780, align: "center", size: 11, color: rgb(175, 195, 225) });
          drawText({ text: "Sky Bash v1.4  •  100% Serverless 2.5D WebRTC Arena  •  KAPLAY & Trystero", pos: vec2(cx - 300, 688), width: 600, align: "center", size: 9.5, color: rgb(115, 135, 165) });

          // 8. Modals (Unified layout)
          if (showNameModal) {
            drawRect({ pos: vec2(cx - 225, cy - 130), width: 450, height: 260, radius: 16, color: rgb(10, 16, 30), opacity: 0.98, outline: { width: 2.5, color: rgb(255, 215, 75) } });
            drawText({ text: "SET YOUR BRAWLER NAME", pos: vec2(cx - 225, cy - 98), width: 450, align: "center", size: 16, color: rgb(255, 230, 95) });
            drawText({ text: "Type up to 12 letters/numbers and press ENTER to save:", pos: vec2(cx - 225, cy - 68), width: 450, align: "center", size: 12.5, color: rgb(205, 225, 250) });

            drawRect({ pos: vec2(cx - 165, cy - 30), width: 330, height: 48, radius: 8, color: rgb(20, 30, 52), outline: { width: 2, color: rgb(105, 245, 255) } });
            const cursor = Math.floor(t * 2.5) % 2 === 0 ? "_" : "";
            drawText({ text: `${typedPlayerName}${cursor}`, pos: vec2(cx - 165, cy - 16), width: 330, align: "center", size: 20, color: rgb(135, 255, 215) });

            drawRect({ pos: vec2(cx - 150, cy + 70), width: 140, height: 38, radius: 8, color: rgb(26, 150, 100), outline: { width: 1.5, color: rgb(125, 255, 195) } });
            drawText({ text: "ENTER : SAVE", pos: vec2(cx - 150, cy + 82), width: 140, align: "center", size: 12.5, color: rgb(255, 255, 255) });

            drawRect({ pos: vec2(cx + 10, cy + 70), width: 140, height: 38, radius: 8, color: rgb(38, 46, 68), outline: { width: 1.5, color: rgb(135, 155, 195) } });
            drawText({ text: "ESC : CANCEL", pos: vec2(cx + 10, cy + 82), width: 140, align: "center", size: 12.5, color: rgb(225, 235, 255) });
          }

          if (showPinModal) {
            drawRect({ pos: vec2(cx - 225, cy - 130), width: 450, height: 260, radius: 16, color: rgb(10, 14, 26), opacity: 0.98, outline: { width: 2.5, color: rgb(255, 205, 65) } });
            drawText({ text: "DEVELOPER SECURITY CLEARANCE", pos: vec2(cx - 225, cy - 98), width: 450, align: "center", size: 15, color: rgb(255, 220, 75) });
            drawText({ text: "Enter 4-digit PIN to access element test sandbox:", pos: vec2(cx - 225, cy - 68), width: 450, align: "center", size: 12.5, color: rgb(205, 225, 250) });

            for (let i = 0; i < 4; i++) {
              const bx = cx - 102 + i * 54;
              const hasChar = i < enteredPin.length;
              drawRect({ pos: vec2(bx, cy - 28), width: 42, height: 48, radius: 8, color: rgb(22, 30, 52), outline: { width: 2, color: hasChar ? rgb(85, 245, 185) : rgb(88, 110, 155) } });
              if (hasChar) drawText({ text: enteredPin[i], pos: vec2(bx, cy - 16), width: 42, align: "center", size: 22, color: rgb(110, 255, 195) });
            }

            drawText({ text: statusMessage, pos: vec2(cx - 225, cy + 38), width: 450, align: "center", size: 12, color: rgb(...statusColor) });

            drawRect({ pos: vec2(cx - 75, cy + 86), width: 150, height: 36, radius: 8, color: rgb(38, 46, 68), outline: { width: 1.5, color: rgb(135, 155, 195) } });
            drawText({ text: "ESC : CANCEL", pos: vec2(cx - 75, cy + 96), width: 150, align: "center", size: 12.5, color: rgb(225, 235, 255) });
          }
        },
      },
    ]);
  });
}
