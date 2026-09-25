// ============================================================================
// src/config/gameConfig.js
// ============================================================================
// Central configuration file for the entire game.
// Keeping all tunable numbers and colors here makes it easy to experiment
// with the feel and visual style without hunting through multiple files.
// ============================================================================

export const GAME_CONFIG = {
  // Logical resolution of the game canvas (16:9 widescreen)
  WIDTH: 1280,
  HEIGHT: 720,

  // Background color of the sky/void around the floating arena
  BG_COLOR: [15, 20, 35],
};

// ----------------------------------------------------------------------------
// PLAYER CONTROLS CONFIGURATION (Section 5)
// ----------------------------------------------------------------------------
// Keep all desktop controls in one place so you can easily rebind keys later.
// ----------------------------------------------------------------------------
export const CONTROLS_CONFIG = {
  MOVE_UP: ["w", "up"],
  MOVE_DOWN: ["s", "down"],
  MOVE_LEFT: ["a", "left"],
  MOVE_RIGHT: ["d", "right"],
  JUMP: ["space"],
  PUNCH: ["j"],          // Plus Left Mouse Button
  PICKUP: ["e"],
  THROW: ["k"],          // Plus Right Mouse Button
  DROP: ["q"],
};

// ----------------------------------------------------------------------------
// PLAYER MOVEMENT & CHARACTER CONFIGURATION (Section 6)
// ----------------------------------------------------------------------------
export const PLAYER_CONFIG = {
  // Maximum running speed on the horizontal axis (in pixels per second).
  // Try increasing to 340 for a faster arcade feel, or 220 for heavier brawling.
  PLAYER_SPEED: 280,

  // Controls how strongly the player accelerates toward top speed.
  // Increase this value for snappier movement response.
  PLAYER_ACCELERATION: 1800,

  // Controls how quickly the player slows down when movement keys are released.
  // Higher values (e.g., 2200) stop on a dime; lower values (e.g., 600) feel icy.
  PLAYER_DECELERATION: 2000,

  // Friction applied to external knockback velocities
  PLAYER_FRICTION: 900,

  // --- Milestone 3: Jump, Gravity & Ground Detection ---
  // Upward vertical impulse (velZ) when pressing SPACE to jump.
  // Increase for higher jumps (e.g., 500); decrease for shorter hops (e.g., 360).
  PLAYER_JUMP_FORCE: 440,

  // Downward pull of gravity in pixels/sec^2.
  // Higher gravity (1180) + strong jump force (440) creates snappy, non-floaty jumps!
  PLAYER_GRAVITY: 1180,

  // Multiplier on horizontal steering while in mid-air (0.0 = no air steering, 1.0 = full).
  PLAYER_AIR_CONTROL: 0.72,

  // Maximum downward falling speed (in pixels/sec)
  TERMINAL_FALL_SPEED: -900,

  // How fast the character rotates to face the new movement direction.
  // Higher values (e.g. 55) make turning almost instant; lower values (12) turn slowly.
  PLAYER_TURN_SPEED: 55,

  // Knockback impulse applied when the player lands a punch (Section 6 & 7)
  PUNCH_FORCE: 480,

  // How far below the arena floor (zHeight) the player falls before respawning
  ABYSS_RESPAWN_Z: -520,

  // Collision footprint radius on the ground (in pixels)
  FOOTPRINT_RADIUS: 18,

  // Character visual palette ("Volt" — Original Sky-Brawler design)
  COLORS: {
    SHADOW: [8, 12, 22],
    LEGS: [220, 232, 252],          // Crisp light silver-white leg greaves/pants (high contrast!)
    BOOTS: [255, 95, 72],           // Vibrant flame-coral brawler boots
    BOOT_SOLE: [255, 220, 115],     // Bright gold/white boot sole & toe trim
    BODY_MAIN: [56, 132, 255],      // Vibrant cobalt blue tunic
    BODY_TRIM: [110, 185, 255],     // Lighter shoulder/belt highlight
    HEAD: [242, 246, 255],          // Clean white/silver helmet shell
    VISOR: [25, 35, 58],            // Dark visor glass
    VISOR_GLOW: [86, 245, 215],     // Bright mint/cyan eyes
    SCARF: [255, 92, 118],          // Energetic coral-red scarf/headband
    GLOVES: [255, 205, 75],         // Golden-yellow brawler gloves
  },
};

// ----------------------------------------------------------------------------
// 2.5D ARENA CONFIGURATION
// ----------------------------------------------------------------------------
// To create a convincing 2.5D illusion in a 2D engine, we compress vertical
// distances by PERSPECTIVE_Y_SCALE (0.64). A flat horizontal circle of radius
// 410px in 3D space appears 410px wide horizontally, but 410 * 0.64 = 262.4px
// tall vertically on screen.
// ----------------------------------------------------------------------------
export const ARENA_CONFIG = {
  // Screen coordinates of the arena's center point
  CENTER_X: 640,
  CENTER_Y: 365,

  // Playable horizontal radius of the circular platform (in pixels)
  // Increased by ~1.4x (from 355 -> 495px, a 990px-wide circular court!)
  RADIUS: 495,

  // Vertical compression ratio that creates the 2.5D viewing angle.
  // 1.0 = flat top-down 2D circle
  // 0.64 = angled 2.5D view (~40 degrees above horizon)
  // 0.35 = very steep side-view angle
  PERSPECTIVE_Y_SCALE: 0.64,

  // Visual thickness of the 3D platform edge underneath the floor
  PLATFORM_DEPTH: 54,

  // Number of decorative perimeter pillars/lights around the rim
  RIM_NODE_COUNT: 16,

  // Color palette for the floating arena (RGB arrays: [R, G, B])
  // Warm Sunlit Sandstone & Golden-Bronze palette creates high contrast
  // against the dark midnight-indigo void and makes the character pop!
  COLORS: {
    ABYSS_SHADOW: [6, 8, 16],         // Deep shadow underneath the floating island
    CLIFF_DARK: [78, 52, 48],         // Lowest 3D extruded warm umber rock layer
    CLIFF_MID: [128, 84, 64],         // Middle 3D terracotta canyon layer
    RIM_OUTER: [188, 124, 68],        // Warm bronze outer curb boundary
    RIM_HIGHLIGHT: [255, 224, 128],   // Bright sunlit golden-amber top bevel (highlights the rim!)
    FLOOR_BASE: [234, 214, 176],      // Bright warm sandstone playable surface
    FLOOR_INNER: [216, 192, 148],     // Inner carved stone ring color
    FLOOR_CENTER: [196, 168, 122],    // Center emblem disc color
    ACCENT_GLOW: [28, 215, 195],      // Vibrant turquoise energy lines & perimeter lights
    DANGER_RING: [242, 78, 62],       // Crisp coral-red warning ring near the drop-off edge
  },
};

// ----------------------------------------------------------------------------
// CAMERA SYSTEM CONFIGURATION
// ----------------------------------------------------------------------------
export const CAMERA_CONFIG = {
  // How quickly the camera catches up to its target position.
  FOLLOW_SPEED: 6.0,

  // How quickly the camera interpolates toward the target zoom level.
  ZOOM_SPEED: 5.0,

  // Default camera zoom (0.84 fits the 1.4x expanded 990px-wide arena with full sky margin!)
  DEFAULT_ZOOM: 0.84,

  // Smoothly leans toward the player as they roam the expanded 1.4x arena
  PLAYER_WEIGHT: 0.18,

  // Maximum camera pan offset from arena center
  MAX_OFFSET_X: 75,
  MAX_OFFSET_Y: 45,

  // How fast screen shake decays back to 0 (in shake units per second)
  SHAKE_DECAY: 28.0,

  // Maximum pixel offset during a heavy camera shake
  MAX_SHAKE_OFFSET: 22,
};

// ----------------------------------------------------------------------------
// MILESTONE 4: 2.5D DEPTH SORTING & SHADOW CONFIGURATION (Section 12)
// ----------------------------------------------------------------------------
export const DEPTH_CONFIG = {
  // Subtle perspective scale difference between the far North edge and close South edge.
  // 0.08 means objects at the bottom edge appear 8% larger than at the center,
  // and objects at the top edge appear 8% smaller—enhancing the 3D camera illusion!
  PERSPECTIVE_SCALE_STRENGTH: 0.08,

  // Z-index used when an object or player falls behind the North cliff into the void
  BEHIND_ARENA_Z: -60,

  // Maximum height (in pixels) before a ground shadow reaches its minimum size
  SHADOW_MAX_HEIGHT: 280,

  // Minimum scale multiplier for a shadow when high in the air
  SHADOW_MIN_SCALE: 0.32,
};

// ----------------------------------------------------------------------------
// MILESTONE 5: PUNCH & MELEE COMBAT CONFIGURATION (Section 7)
// ----------------------------------------------------------------------------
export const COMBAT_CONFIG = {
  // Total duration of the punch animation (in seconds)
  PUNCH_DURATION: 0.22,

  // Active hit window (in seconds from the start of the punch)
  HIT_WINDOW_START: 0.03,
  HIT_WINDOW_END: 0.16,

  // Minimum time (in seconds) before another punch can be triggered
  PUNCH_COOLDOWN: 0.30,

  // How far in front of the player's center the punch hitbox is placed (in pixels)
  PUNCH_RANGE: 34,

  // Radius of the circular punch hitbox (in pixels)
  PUNCH_RADIUS: 30,

  // Forward velocity boost when throwing a punch (feels snappy & aggressive!)
  PUNCH_LUNGE_SPEED: 185,

  // Brief impact freeze-frame ("hit-stop") duration in seconds when a punch lands
  HIT_STOP_DURATION: 0.045,

  // --- Phase 7: Pick-Up & Carry System Configuration (Section 8) ---
  // Maximum distance (in 2.5D floor pixels) to detect and grab an object with E
  PICKUP_RANGE: 68,

  // Duration of the hoist-up animation when picking up an object (in seconds)
  PICKUP_ANIM_DURATION: 0.20,

  // How much heavier objects slow down the player's running speed while carried
  // Formula: speedMultiplier = 1 / (1 + object.mass * CARRY_MASS_SLOWDOWN)
  CARRY_MASS_SLOWDOWN: 0.14,

  // Gentle forward hop velocity when pressing Q to drop a carried object
  DROP_FORWARD_SPEED: 115,

  // --- Phase 8: 2.5D Throw System Configuration (Section 9) ---
  // Upward vertical arc velocity (velZ) when hurling an object (scaled by 1/sqrt(mass))
  THROW_ARC_VEL_Z: 165,

  // Fraction of the player's running velocity added to the thrown projectile
  THROW_PLAYER_MOMENTUM_FACTOR: 0.22,

  // Duration of Volt's two-handed overhead throw follow-through animation (in seconds)
  THROW_ANIM_DURATION: 0.22,
};

// ----------------------------------------------------------------------------
// PHASE 6: PHYSICS OBJECTS CONFIGURATION (Section 10 & 11)
// ----------------------------------------------------------------------------
// Every physics object has configurable: mass, friction, bounce, throwForce, damage.
// - Lower mass (0.78) = lively bounce when punched/thrown, but heavy enough not to roll away on touch.
// - Higher mass (2.6) = heavy resistance, pushes lighter objects out of the way!
// ----------------------------------------------------------------------------
export const OBJECTS_CONFIG = {
  GRAVITY: 1120,

  CRATE: {
    type: "crate",
    label: "Supply Crate",
    mass: 1.0,
    friction: 820,
    bounce: 0.25,
    throwForce: 260,
    damage: 25,
    footprintRadius: 20,
    propHeight: 36,
  },

  BALL: {
    type: "ball",
    label: "Brawler Sphere",
    mass: 0.78,
    friction: 540,
    bounce: 0.35,
    throwForce: 325,
    damage: 15,
    footprintRadius: 17,
    propHeight: 32,
  },

  HEAVY_BOX: {
    type: "heavyBox",
    label: "Iron Heavy Box",
    mass: 2.6,
    friction: 1450,
    bounce: 0.08,
    throwForce: 180,
    damage: 50,
    footprintRadius: 24,
    propHeight: 42,
  },

  BOMB: {
    type: "bomb",
    label: "Sky Fuse Bomb",
    mass: 0.85,
    friction: 580,
    bounce: 0.30,
    throwForce: 310,
    damage: 65,
    footprintRadius: 17,
    propHeight: 32,
    fuseDuration: 3.5,
    blastRadius: 145,
    blastForce: 680,
  },
};
