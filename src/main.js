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
import { registerArenaScene } from "./scenes/arena.js";

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

// 2. Register all game scenes
registerArenaScene();

// 3. Start the "arena" scene
go("arena");
