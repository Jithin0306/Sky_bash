// ============================================================================
// src/main.js
// ============================================================================
// Entry point of the game.
// 1. Initializes the KAPLAY game engine canvas with our GAME_CONFIG settings.
// 2. Registers our modular game scenes.
// 3. Starts the game in the "arena" scene.
// ============================================================================

import kaplay from "kaplay";
import { GAME_CONFIG } from "./config/gameConfig.js";
import { registerMenuScene } from "./scenes/menu.js";
import { registerArenaScene } from "./scenes/arena.js";
import { registerDevTestScene, isDevAccessUnlocked } from "./scenes/devTest.js";
import { registerMultiplayerLobbyScene } from "./scenes/multiplayerLobby.js";
import { registerMultiplayerArenaScene } from "./scenes/multiplayerArena.js";

// 1. Initialize KAPLAY
// By default, kaplay() attaches its helper functions (scene, add, pos, vec2,
// drawCircle, onUpdate, etc.) to the global scope so our modular files can
// call them cleanly without repetitive boilerplate.
kaplay({
  width: GAME_CONFIG.WIDTH,
  height: GAME_CONFIG.HEIGHT,
  background: GAME_CONFIG.BG_COLOR,
  letterbox: true, // Preserves 16:9 aspect ratio when the browser window resizes
  crisp: false,    // Smooth anti-aliased rendering for clean vector/2.5D shapes
});

// 2. Register all game scenes:
// - "menu"             : Mode Selection Title Screen & Developer PIN Gate
// - "multiplayerLobby" : Single-Player Bot Mode Setup & Online Trystero Room Lobby (1v1, 2v2, 3-6P FFA)
// - "multiplayerArena" : 2-to-6 Fighter Synchronized Arena (Single-Player vs Bots & Online P2P)
// - "arena"            : Classic 1v1 Arena Scene
// - "devTest"          : Restricted Developer Test Sandbox (Spawner 1-9, Target Dummy, Debug Tools)
registerMenuScene();
registerMultiplayerLobbyScene();
registerMultiplayerArenaScene();
registerArenaScene();
registerDevTestScene();

// 3. Start on the Main Menu (or auto-join if ?room=XXXX Invite Link or ?dev=1234 is passed!)
const urlParams = new URLSearchParams(window.location.search);
const inviteRoomCode = urlParams.get("room");
if (inviteRoomCode) {
  go("multiplayerLobby", {
    isOnline: true,
    roomCode: inviteRoomCode,
    joinAsGuest: true,
  });
} else if (urlParams.get("dev") && isDevAccessUnlocked()) {
  go("devTest");
} else {
  go("menu");
}
