// ============================================================================
// src/scenes/menu.js
// ============================================================================
// Modern, Cinematic Title & Mode Selection Screen ("menu"):
// - Atmospheric 2.5D sky arena backdrop with gentle camera drift & ambient motes.
// - High-contrast hero typography ("SKY BASH: 2.5D ARENA BRAWL") with subtle glow.
// - Premium interactive Game Mode Cards:
//     * [ SINGLE PLAYER — VS AI BOTS ] (Offline practice, 1v1, 2v2, FFA)
//     * [ ONLINE MULTIPLAYER — P2P WEBRTC ] (Hero highlighted, private rooms, 2-6P)
// - Sleek Player Profile Badge (Top-Left) with 1-click & hotkey [N] custom name editor.
// - Compact Audio HUD (Top-Right) with independent Music [M] & SFX [X] controls.
// - Discreet Developer Test Lab button (Bottom) protected by 4-digit PIN gate [F2/D].
// - 100% zero-build, responsive, and preserves all existing mechanics and shortcuts!
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

/**
 * Registers the redesigned "menu" scene with KAPLAY.
 */
export function registerMenuScene() {
  scene("menu", () => {
    sound.playMusic("menu");

    // 1. Initialize the 2.5D Arena Camera
    const camera = createArenaCamera();
    camera.setZoom(CAMERA_CONFIG.DEFAULT_ZOOM);

    // 2. Render live 2.5D floating island in the background of the Title Screen
    createAmbientBackground();
    createFloatingArena();

    // 3. UI State Management
    let showPinModal = false;
    let enteredPin = "";
    let statusMessage = "";
    let statusColor = [255, 220, 85];

    let showNameModal = false;
    let typedPlayerName = getLocalPlayerName();

    // Cinematic Intro & Interactive Hover Transition Variables
    let introTimer = 0;
    let hoverSP = 0;       // Single Player card hover intensity (0 -> 1)
    let hoverMP = 0;       // Multiplayer card hover intensity (0 -> 1)
    let hoverProfile = 0;  // Profile card hover intensity (0 -> 1)
    let hoverDev = 0;      // Dev button hover intensity (0 -> 1)

    // Floating UI foreground sparks/energy motes for extra depth
    const uiSparks = [];
    for (let i = 0; i < 24; i++) {
      uiSparks.push({
        x: rand(60, GAME_CONFIG.WIDTH - 60),
        y: rand(40, GAME_CONFIG.HEIGHT),
        radius: rand(1.2, 2.6),
        speedY: rand(-12, -24),
        speedX: rand(-4, 4),
        alpha: rand(0.12, 0.38),
        phase: rand(0, Math.PI * 2),
      });
    }

    // 4. Helper to attempt unlocking Developer Mode with the current PIN
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

    // 5. Global Keyboard Shortcuts on Main Menu
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

    // Single Player shortcut keys (S or 1)
    onKeyPress("s", () => {
      if (!showPinModal && !showNameModal) {
        sound.playUIClick();
        go("multiplayerLobby", { isOnline: false, mode: "1v1" });
      }
    });

    onKeyPress("1", () => {
      if (!showPinModal && !showNameModal) {
        sound.playUIClick();
        go("multiplayerLobby", { isOnline: false, mode: "1v1" });
      }
    });

    // Online Multiplayer shortcut keys (O or 2)
    onKeyPress("o", () => {
      if (!showPinModal && !showNameModal) {
        sound.playUIClick();
        go("multiplayerLobby", { isOnline: true, mode: "1v1" });
      }
    });

    onKeyPress("2", () => {
      if (!showPinModal && !showNameModal) {
        sound.playUIClick();
        go("multiplayerLobby", { isOnline: true, mode: "1v1" });
      }
    });

    // Player Profile Name Edit hotkey (N)
    onKeyPress("n", () => {
      sound.playUIClick();
      if (!showPinModal && !showNameModal) {
        showNameModal = true;
        typedPlayerName = getLocalPlayerName();
      }
    });

    // Developer Access hotkeys (F2 or D)
    onKeyPress("f2", () => {
      if (showNameModal) return;
      if (showPinModal) {
        showPinModal = false;
      } else {
        requestDevAccess();
      }
    });

    onKeyPress("d", () => {
      if (showNameModal || showPinModal) return;
      requestDevAccess();
    });

    // Audio hotkeys (M for Music, X for SFX)
    sound.registerAudioKeyBindings(() => !showPinModal && !showNameModal);

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

    // 6. Interactive Mouse Click Dispatcher
    onMousePress("left", () => {
      const m = mousePos();
      const cx = GAME_CONFIG.WIDTH * 0.5;
      const cy = GAME_CONFIG.HEIGHT * 0.5;

      // Handle custom modals first if open
      if (showNameModal) {
        // Save Name button
        if (m.x >= cx - 150 && m.x <= cx - 10 && m.y >= cy + 72 && m.y <= cy + 108) {
          typedPlayerName = setLocalPlayerName(typedPlayerName || "PLAYER 1");
          showNameModal = false;
          return;
        }
        // Cancel Name button
        if (m.x >= cx + 10 && m.x <= cx + 150 && m.y >= cy + 72 && m.y <= cy + 108) {
          showNameModal = false;
          return;
        }
        return;
      }

      if (showPinModal) {
        // Cancel PIN button
        if (m.x >= cx - 75 && m.x <= cx + 75 && m.y >= cy + 88 && m.y <= cy + 122) {
          showPinModal = false;
          enteredPin = "";
        }
        return;
      }

      // Audio Mute Buttons at Top-Right
      if (sound.handleAudioClick(m.x, m.y)) return;

      // 0. Click Custom Player Profile Badge (Top-Left)
      if (m.x >= 32 && m.x <= 276 && m.y >= 14 && m.y <= 58) {
        sound.playUIClick();
        showNameModal = true;
        typedPlayerName = getLocalPlayerName();
        return;
      }

      // Card Dimensions & Positions
      const spCardX = cx - 380;
      const mpCardX = cx + 20;
      const cardY = 285;
      const cardW = 360;
      const cardH = 215;

      // 1. SINGLE PLAYER CARD Click Bounds
      if (m.x >= spCardX && m.x <= spCardX + cardW && m.y >= cardY && m.y <= cardY + cardH) {
        sound.playUIClick();
        go("multiplayerLobby", { isOnline: false, mode: "1v1" });
        return;
      }

      // 2. ONLINE MULTIPLAYER CARD Click Bounds
      if (m.x >= mpCardX && m.x <= mpCardX + cardW && m.y >= cardY && m.y <= cardY + cardH) {
        sound.playUIClick();
        go("multiplayerLobby", { isOnline: true, mode: "1v1" });
        return;
      }

      // 3. DEVELOPER TEST LAB Button Bounds (Bottom Center)
      if (m.x >= cx - 160 && m.x <= cx + 160 && m.y >= 524 && m.y <= 558) {
        sound.playUIClick();
        requestDevAccess();
        return;
      }
    });

    // 7. Update Loop for Ambient Physics & Smooth Hover Interpolation
    onUpdate(() => {
      const delta = dt();
      const t = time();

      // Atmospheric camera drift over the floating arena
      camera.setTarget(
        vec2(
          ARENA_CONFIG.CENTER_X + Math.sin(t * 0.35) * 10,
          ARENA_CONFIG.CENTER_Y + Math.cos(t * 0.28) * 6
        )
      );

      // Intro animation progression (0 -> 1 with smooth cubic ease)
      introTimer = Math.min(1.0, introTimer + delta * 2.2);

      // Drifting foreground sparks
      for (const sp of uiSparks) {
        sp.y += sp.speedY * delta;
        sp.x += sp.speedX * delta;
        if (sp.y < -20) {
          sp.y = GAME_CONFIG.HEIGHT + 20;
          sp.x = rand(60, GAME_CONFIG.WIDTH - 60);
        }
      }

      // Smooth hover transitions
      const m = mousePos();
      const cx = GAME_CONFIG.WIDTH * 0.5;
      const spCardX = cx - 380;
      const mpCardX = cx + 20;
      const cardY = 285;
      const cardW = 360;
      const cardH = 215;

      const isOverSP =
        !showNameModal &&
        !showPinModal &&
        m.x >= spCardX &&
        m.x <= spCardX + cardW &&
        m.y >= cardY &&
        m.y <= cardY + cardH;

      const isOverMP =
        !showNameModal &&
        !showPinModal &&
        m.x >= mpCardX &&
        m.x <= mpCardX + cardW &&
        m.y >= cardY &&
        m.y <= cardY + cardH;

      const isOverProfile =
        !showNameModal &&
        !showPinModal &&
        m.x >= 32 &&
        m.x <= 276 &&
        m.y >= 14 &&
        m.y <= 58;

      const isOverDev =
        !showNameModal &&
        !showPinModal &&
        m.x >= cx - 160 &&
        m.x <= cx + 160 &&
        m.y >= 524 &&
        m.y <= 558;

      const lerpSpeed = Math.min(1, delta * 12);
      hoverSP += ((isOverSP ? 1 : 0) - hoverSP) * lerpSpeed;
      hoverMP += ((isOverMP ? 1 : 0) - hoverMP) * lerpSpeed;
      hoverProfile += ((isOverProfile ? 1 : 0) - hoverProfile) * lerpSpeed;
      hoverDev += ((isOverDev ? 1 : 0) - hoverDev) * lerpSpeed;
    });

    // 8. Render the Main Menu UI & High-End Visuals
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

          // Smooth cubic ease for entrance animation
          const ease = 1 - Math.pow(1 - introTimer, 3);
          const uiAlpha = Math.min(1, ease * 1.25);
          const titleSlideOffset = (1 - ease) * -40;
          const cardsSlideOffset = (1 - ease) * 45;

          // A. Cinematic Atmospheric Backdrop Vignette (Arena remains visible behind!)
          drawRect({
            pos: vec2(0, 0),
            width: GAME_CONFIG.WIDTH,
            height: GAME_CONFIG.HEIGHT,
            color: rgb(6, 10, 20),
            opacity: showPinModal || showNameModal ? 0.88 : 0.62,
          });

          // Soft radial glow behind the hero branding & arena depth
          drawCircle({
            pos: vec2(cx, 160),
            radius: 380,
            color: rgb(22, 58, 108),
            opacity: 0.16 * uiAlpha,
          });
          drawCircle({
            pos: vec2(cx, cy + 90),
            radius: 540,
            color: rgb(18, 38, 76),
            opacity: 0.22 * uiAlpha,
          });

          // Floating foreground energy motes
          for (const sp of uiSparks) {
            const pulse = 0.75 + 0.25 * Math.sin(t * 2.5 + sp.phase);
            drawCircle({
              pos: vec2(sp.x, sp.y),
              radius: sp.radius,
              color: rgb(130, 215, 255),
              opacity: sp.alpha * pulse * uiAlpha,
            });
          }

          // B. Top Bar: Player Profile Badge (Top-Left)
          const profBgColor = lerpColor([12, 18, 32], [22, 34, 58], hoverProfile);
          const profBorderColor = lerpColor([56, 75, 115], [255, 215, 80], hoverProfile);

          drawRect({
            pos: vec2(32, 14),
            width: 244,
            height: 44,
            radius: 10,
            color: rgb(...profBgColor),
            opacity: 0.92 * uiAlpha,
            outline: {
              width: 1.5 + hoverProfile * 0.8,
              color: rgb(...profBorderColor),
            },
          });

          // Profile avatar crest
          drawCircle({
            pos: vec2(56, 36),
            radius: 14,
            color: rgb(22, 36, 62),
            outline: {
              width: 2,
              color: rgb(...profBorderColor),
            },
          });
          drawText({
            text: currentName ? currentName.charAt(0).toUpperCase() : "P",
            pos: vec2(49, 27),
            size: 15,
            color: rgb(255, 225, 110),
          });

          // Profile text stack
          drawText({
            text: "FIGHTER PROFILE",
            pos: vec2(78, 20),
            size: 9,
            color: rgb(135, 165, 205),
          });
          drawText({
            text: currentName || "PLAYER 1",
            pos: vec2(78, 32),
            size: 14,
            color: rgb(255, 240, 150),
          });

          // Edit chip [N]
          drawRect({
            pos: vec2(208, 22),
            width: 58,
            height: 26,
            radius: 6,
            color: rgb(24, 34, 56),
            outline: {
              width: 1.2,
              color: hoverProfile > 0.5 ? rgb(255, 215, 85) : rgb(85, 115, 165),
            },
          });
          drawText({
            text: "EDIT (N)",
            pos: vec2(214, 29),
            size: 9.5,
            color: hoverProfile > 0.5 ? rgb(255, 235, 130) : rgb(205, 225, 255),
          });

          // C. Top Bar: Audio Controls (Top-Right)
          sound.drawAudioHUD();

          // D. Hero / Branding Area (Center-Top)
          const floatOffset = Math.sin(t * 1.6) * 3;
          const heroY = 126 + floatOffset + titleSlideOffset;

          // Subtle horizontal sci-fi divider lines
          drawLine({
            p1: vec2(cx - 320, heroY - 4),
            p2: vec2(cx - 150, heroY - 4),
            width: 1.5,
            color: rgb(45, 105, 175),
            opacity: 0.45 * uiAlpha,
          });
          drawLine({
            p1: vec2(cx + 150, heroY - 4),
            p2: vec2(cx + 320, heroY - 4),
            width: 1.5,
            color: rgb(45, 105, 175),
            opacity: 0.45 * uiAlpha,
          });

          // Multi-layer high-contrast Game Title: "SKY BASH"
          // Layer 1: Soft ambient glow
          const glowAlpha = (0.28 + Math.sin(t * 2) * 0.08) * uiAlpha;
          drawText({
            text: "SKY BASH",
            pos: vec2(cx - 300, heroY - 32),
            width: 600,
            align: "center",
            size: 52,
            color: rgb(32, 175, 245),
            opacity: glowAlpha,
          });

          // Layer 2: Deep sharp drop shadow
          drawText({
            text: "SKY BASH",
            pos: vec2(cx - 300, heroY - 30),
            width: 600,
            align: "center",
            size: 52,
            color: rgb(4, 8, 16),
            opacity: 0.95 * uiAlpha,
          });

          // Layer 3: Crisp foreground typography
          drawText({
            text: "SKY BASH",
            pos: vec2(cx - 300, heroY - 34),
            width: 600,
            align: "center",
            size: 52,
            color: rgb(240, 250, 255),
            opacity: uiAlpha,
          });

          // Subtitle Badge: "2.5D ARENA BRAWL"
          const subBadgeW = 230;
          const subBadgeH = 22;
          drawRect({
            pos: vec2(cx - subBadgeW * 0.5, heroY + 28),
            width: subBadgeW,
            height: subBadgeH,
            radius: 11,
            color: rgb(13, 22, 40),
            opacity: 0.92 * uiAlpha,
            outline: {
              width: 1.4,
              color: rgb(56, 189, 248),
            },
          });
          drawText({
            text: "2.5D ARENA BRAWL",
            pos: vec2(cx - subBadgeW * 0.5, heroY + 33),
            width: subBadgeW,
            align: "center",
            size: 11.5,
            color: rgb(155, 230, 255),
            opacity: uiAlpha,
          });

          // Tagline strip
          drawText({
            text: "FAST-PACED PHYSICS COMBAT  •  SERVERLESS P2P  •  UP TO 6 FIGHTERS",
            pos: vec2(cx - 350, heroY + 58),
            width: 700,
            align: "center",
            size: 11,
            color: rgb(140, 170, 210),
            opacity: 0.88 * uiAlpha,
          });

          // E. Premium Game Mode Cards (Side-by-Side)
          const spCardX = cx - 380;
          const mpCardX = cx + 20;
          const cardBaseY = 285 + cardsSlideOffset;
          const cardW = 360;
          const cardH = 215;

          // -------------------------------------------------------------
          // CARD 1: SINGLE PLAYER — VS AI BOTS
          // -------------------------------------------------------------
          const spY = cardBaseY - hoverSP * 4;
          const spBorderCol = lerpColor([45, 75, 120], [80, 215, 255], hoverSP);
          const spBgCol = lerpColor([12, 18, 32], [16, 26, 46], hoverSP);

          // Card Backdrop Shadow
          drawRect({
            pos: vec2(spCardX + 2, spY + 4),
            width: cardW,
            height: cardH,
            radius: 16,
            color: rgb(4, 6, 12),
            opacity: 0.55 * uiAlpha,
          });

          // Main Single Player Card
          drawRect({
            pos: vec2(spCardX, spY),
            width: cardW,
            height: cardH,
            radius: 16,
            color: rgb(...spBgCol),
            opacity: 0.94 * uiAlpha,
            outline: {
              width: 2 + hoverSP * 1.2,
              color: rgb(...spBorderCol),
            },
          });

          // Header Category Pill: [ 🤖 BOT SPARRING ]
          drawRect({
            pos: vec2(spCardX + 22, spY + 20),
            width: 126,
            height: 22,
            radius: 6,
            color: rgb(22, 38, 68),
            outline: { width: 1, color: rgb(75, 145, 225) },
          });
          drawText({
            text: "🤖 BOT SPARRING",
            pos: vec2(spCardX + 28, spY + 25),
            size: 9.5,
            color: rgb(135, 205, 255),
          });

          drawText({
            text: "OFFLINE",
            pos: vec2(spCardX + cardW - 74, spY + 25),
            size: 10,
            color: rgb(125, 150, 185),
          });

          // Card Title
          drawText({
            text: "SINGLE PLAYER",
            pos: vec2(spCardX + 22, spY + 54),
            size: 21,
            color: rgb(255, 255, 255),
          });

          // Card Subtitle / Description
          drawText({
            text: "Fight smart AI brawlers with full physics,",
            pos: vec2(spCardX + 22, spY + 84),
            size: 12,
            color: rgb(185, 210, 240),
          });
          drawText({
            text: "weapons, items, and platform ring-outs.",
            pos: vec2(spCardX + 22, spY + 102),
            size: 12,
            color: rgb(185, 210, 240),
          });

          // Feature bullets
          drawText({
            text: "• 1v1 Duel   • 2v2 Teams   • Chaos FFA",
            pos: vec2(spCardX + 22, spY + 128),
            size: 11,
            color: rgb(135, 185, 235),
          });

          // Bottom Action Button inside Single Player Card
          const spBtnBg = lerpColor([24, 88, 148], [34, 135, 215], hoverSP);
          drawRect({
            pos: vec2(spCardX + 20, spY + 154),
            width: cardW - 40,
            height: 42,
            radius: 10,
            color: rgb(...spBtnBg),
            outline: {
              width: 1.5,
              color: hoverSP > 0.5 ? rgb(165, 245, 255) : rgb(95, 195, 255),
            },
          });
          drawText({
            text: "PLAY VS BOTS  (PRESS S / ENTER)",
            pos: vec2(spCardX + 20, spY + 167),
            width: cardW - 40,
            align: "center",
            size: 12.5,
            color: rgb(255, 255, 255),
          });

          // -------------------------------------------------------------
          // CARD 2: ONLINE MULTIPLAYER — HERO HIGHLIGHT
          // -------------------------------------------------------------
          const mpY = cardBaseY - hoverMP * 4;
          const mpPulse = Math.sin(t * 3) * 0.15 + 0.85;
          const mpBorderCol = lerpColor([38, 166, 110], [68, 255, 175], Math.max(hoverMP, mpPulse * 0.4));
          const mpBgCol = lerpColor([12, 22, 34], [16, 32, 48], hoverMP);

          // Card Backdrop Shadow
          drawRect({
            pos: vec2(mpCardX + 2, mpY + 4),
            width: cardW,
            height: cardH,
            radius: 16,
            color: rgb(4, 6, 12),
            opacity: 0.55 * uiAlpha,
          });

          // Main Online Multiplayer Card
          drawRect({
            pos: vec2(mpCardX, mpY),
            width: cardW,
            height: cardH,
            radius: 16,
            color: rgb(...mpBgCol),
            opacity: 0.94 * uiAlpha,
            outline: {
              width: 2.2 + hoverMP * 1.2,
              color: rgb(...mpBorderCol),
            },
          });

          // Header Category Pill: [ 🌐 P2P WEBRTC • ZERO LAG ]
          drawRect({
            pos: vec2(mpCardX + 22, mpY + 20),
            width: 172,
            height: 22,
            radius: 6,
            color: rgb(18, 55, 40),
            outline: { width: 1, color: rgb(68, 235, 160) },
          });
          drawText({
            text: "🌐 P2P WEBRTC • ZERO LAG",
            pos: vec2(mpCardX + 28, mpY + 25),
            size: 9.5,
            color: rgb(105, 255, 185),
          });

          // Featured Badge (Top-Right)
          drawText({
            text: "FEATURED",
            pos: vec2(mpCardX + cardW - 84, mpY + 25),
            size: 10,
            color: rgb(110, 255, 195),
          });

          // Card Title
          drawText({
            text: "ONLINE MULTIPLAYER",
            pos: vec2(mpCardX + 22, mpY + 54),
            size: 21,
            color: rgb(255, 255, 255),
          });

          // Card Subtitle / Description
          drawText({
            text: "Play with friends across the globe in private",
            pos: vec2(mpCardX + 22, mpY + 84),
            size: 12,
            color: rgb(190, 245, 220),
          });
          drawText({
            text: "rooms with synced physics & item drops.",
            pos: vec2(mpCardX + 22, mpY + 102),
            size: 12,
            color: rgb(190, 245, 220),
          });

          // Feature bullets
          drawText({
            text: "• 1-Click Link   • 4-Digit Code   • 2-6 Players",
            pos: vec2(mpCardX + 22, mpY + 128),
            size: 11,
            color: rgb(125, 245, 190),
          });

          // Bottom Hero Action Button inside Online Multiplayer Card
          const mpBtnBg = lerpColor([18, 138, 92], [28, 188, 124], hoverMP);
          drawRect({
            pos: vec2(mpCardX + 20, mpY + 154),
            width: cardW - 40,
            height: 42,
            radius: 10,
            color: rgb(...mpBtnBg),
            outline: {
              width: 1.8,
              color: hoverMP > 0.5 ? rgb(165, 255, 215) : rgb(115, 255, 190),
            },
          });
          drawText({
            text: "PLAY ONLINE  (PRESS O)",
            pos: vec2(mpCardX + 20, mpY + 167),
            width: cardW - 40,
            align: "center",
            size: 12.5,
            color: rgb(255, 255, 255),
          });

          // F. Discreet Developer Test Area Button (Bottom Center)
          const devBtnW = 320;
          const devBtnH = 30;
          const devBtnX = cx - devBtnW * 0.5;
          const devBtnY = 528;
          const devBorderCol = devUnlocked
            ? lerpColor([45, 185, 115], [85, 255, 165], hoverDev)
            : lerpColor([52, 66, 92], [255, 205, 80], hoverDev);

          drawRect({
            pos: vec2(devBtnX, devBtnY),
            width: devBtnW,
            height: devBtnH,
            radius: 8,
            color: rgb(12, 18, 30),
            opacity: 0.85 * uiAlpha,
            outline: {
              width: 1.2,
              color: rgb(...devBorderCol),
            },
          });

          const devTitle = devUnlocked
            ? "⚡ DEV SANDBOX UNLOCKED  (PRESS F2 / CLICK)"
            : "🔒 DEVELOPER TEST LAB  (PRESS F2 / CLICK)";
          drawText({
            text: devTitle,
            pos: vec2(devBtnX, devBtnY + 9),
            width: devBtnW,
            align: "center",
            size: 11,
            color: devUnlocked ? rgb(110, 255, 180) : rgb(185, 205, 235),
          });

          // G. Footer Helper Strip: Desktop Controls & Version Info
          const footerW = 780;
          const footerH = 26;
          drawRect({
            pos: vec2(cx - footerW * 0.5, 646),
            width: footerW,
            height: footerH,
            radius: 13,
            color: rgb(10, 15, 26),
            opacity: 0.88 * uiAlpha,
            outline: { width: 1, color: rgb(36, 50, 75) },
          });

          drawText({
            text: "WASD: Move  •  SPACE: Jump  •  J/CLICK: Punch  •  E: Grab  •  K: Throw  •  N: Rename  •  M: Music  •  X: SFX",
            pos: vec2(cx - footerW * 0.5, 652),
            width: footerW,
            align: "center",
            size: 11,
            color: rgb(175, 195, 225),
          });

          drawText({
            text: "Sky Bash v1.4  •  100% Serverless 2.5D WebRTC Arena  •  KAPLAY & Trystero",
            pos: vec2(cx - 300, 688),
            width: 600,
            align: "center",
            size: 9.5,
            color: rgb(115, 135, 165),
          });

          // ===========================================================
          // H. Modal Overlay: Custom Player Name Editor (Press N / Click Profile)
          // ===========================================================
          if (showNameModal) {
            drawRect({
              pos: vec2(cx - 225, cy - 130),
              width: 450,
              height: 260,
              radius: 16,
              color: rgb(10, 16, 30),
              opacity: 0.98,
              outline: { width: 2.5, color: rgb(255, 215, 75) },
            });

            drawText({
              text: "SET YOUR BRAWLER NAME",
              pos: vec2(cx - 225, cy - 98),
              width: 450,
              align: "center",
              size: 16,
              color: rgb(255, 230, 95),
            });

            drawText({
              text: "Type up to 12 letters/numbers and press ENTER to save:",
              pos: vec2(cx - 225, cy - 68),
              width: 450,
              align: "center",
              size: 12.5,
              color: rgb(205, 225, 250),
            });

            // Input Field Box
            drawRect({
              pos: vec2(cx - 165, cy - 30),
              width: 330,
              height: 48,
              radius: 8,
              color: rgb(20, 30, 52),
              outline: { width: 2, color: rgb(105, 245, 255) },
            });

            const cursorBlink = Math.floor(t * 2.5) % 2 === 0 ? "_" : "";
            drawText({
              text: `${typedPlayerName}${cursorBlink}`,
              pos: vec2(cx - 165, cy - 16),
              width: 330,
              align: "center",
              size: 20,
              color: rgb(135, 255, 215),
            });

            // Save Button
            drawRect({
              pos: vec2(cx - 150, cy + 70),
              width: 140,
              height: 38,
              radius: 8,
              color: rgb(26, 150, 100),
              outline: { width: 1.5, color: rgb(125, 255, 195) },
            });
            drawText({
              text: "ENTER : SAVE",
              pos: vec2(cx - 150, cy + 82),
              width: 140,
              align: "center",
              size: 12.5,
              color: rgb(255, 255, 255),
            });

            // Cancel Button
            drawRect({
              pos: vec2(cx + 10, cy + 70),
              width: 140,
              height: 38,
              radius: 8,
              color: rgb(38, 46, 68),
              outline: { width: 1.5, color: rgb(135, 155, 195) },
            });
            drawText({
              text: "ESC : CANCEL",
              pos: vec2(cx + 10, cy + 82),
              width: 140,
              align: "center",
              size: 12.5,
              color: rgb(225, 235, 255),
            });
          }

          // ===========================================================
          // I. Modal Overlay: Developer PIN Gate (Press F2 / Click Dev)
          // ===========================================================
          if (showPinModal) {
            drawRect({
              pos: vec2(cx - 225, cy - 130),
              width: 450,
              height: 260,
              radius: 16,
              color: rgb(10, 14, 26),
              opacity: 0.98,
              outline: { width: 2.5, color: rgb(255, 205, 65) },
            });

            drawText({
              text: "DEVELOPER SECURITY CLEARANCE",
              pos: vec2(cx - 225, cy - 98),
              width: 450,
              align: "center",
              size: 15,
              color: rgb(255, 220, 75),
            });

            drawText({
              text: "Enter 4-digit PIN to access element test sandbox:",
              pos: vec2(cx - 225, cy - 68),
              width: 450,
              align: "center",
              size: 12.5,
              color: rgb(205, 225, 250),
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
              pos: vec2(cx - 225, cy + 38),
              width: 450,
              align: "center",
              size: 12,
              color: rgb(...statusColor),
            });

            // Cancel Button
            drawRect({
              pos: vec2(cx - 75, cy + 86),
              width: 150,
              height: 36,
              radius: 8,
              color: rgb(38, 46, 68),
              outline: { width: 1.5, color: rgb(135, 155, 195) },
            });
            drawText({
              text: "ESC : CANCEL",
              pos: vec2(cx - 75, cy + 96),
              width: 150,
              align: "center",
              size: 12.5,
              color: rgb(225, 235, 255),
            });
          }
        },
      },
    ]);
  });
}

/**
 * Utility helper to smoothly interpolate between two RGB triplets [r, g, b].
 */
function lerpColor(c1, c2, t) {
  const clampedT = Math.max(0, Math.min(1, t));
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * clampedT),
    Math.round(c1[1] + (c2[1] - c1[1]) * clampedT),
    Math.round(c1[2] + (c2[2] - c1[2]) * clampedT),
  ];
}
