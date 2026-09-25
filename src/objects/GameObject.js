// ============================================================================
// src/objects/GameObject.js
// ============================================================================
// Base factory for all 2.5D Physics Objects in the arena (Section 10 & 11).
//
// Every physics object created through `createPhysicsObject()` automatically gets:
// - Configurable `mass`, `friction`, `bounce`, `throwForce`, and `damage`
// - 2.5D vertical height (`zHeight`, `velZ`) & ground footprint (`pos.x`, `pos.y`)
// - Dynamic 2.5D depth sorting (`z = pos.y`) and ground shadow rendering
// - Automatic `"punchable"` & `"pickupable"` tags
// ============================================================================

import { ARENA_CONFIG } from "../config/gameConfig.js";
import { isPointOnArena } from "../scenes/arena.js";
import {
  computeDepthScale,
  drawGroundShadow,
} from "../systems/depthSort.js";

/**
 * Creates a modular 2.5D physics object in the current KAPLAY scene.
 *
 * @param {Object} opts - Object configuration and custom `renderVisuals(obj, scale)` callback
 * @returns {Object} The KAPLAY game object
 */
export function createPhysicsObject(opts) {
  const spawnX = opts.x ?? ARENA_CONFIG.CENTER_X;
  const spawnY = opts.y ?? ARENA_CONFIG.CENTER_Y;
  const startZ = opts.startZ ?? 180; // Drops in from the sky when spawned!

  const obj = add([
    pos(spawnX, spawnY),
    z(Math.round(spawnY)),
    "physicsObject",
    "punchable",
    "pickupable",
    opts.type || "genericObject",
    {
      // --- Configurable Physics Properties (Section 10) ---
      objectType: opts.type || "crate",
      label: opts.label || "Object",
      mass: opts.mass ?? 1.0,
      friction: opts.friction ?? 800,
      bounce: opts.bounce ?? 0.3,
      throwForce: opts.throwForce ?? 500,
      damage: opts.damage ?? 20,

      // --- Dimensions ---
      footprintRadius: opts.footprintRadius ?? 18,
      propHeight: opts.propHeight ?? 34,

      // --- 2.5D Motion & State ---
      homePos: vec2(spawnX, spawnY),
      velocity: vec2(0, 0),
      zHeight: startZ,
      velZ: 0,
      isGrounded: startZ <= 0,
      isFallingInVoid: false,
      isCarried: false,
      carrier: null,

      // --- Visual Feedback State ---
      rollAngle: 0,
      squashFactor: 0,
      hitFlashTimer: 0,

      /**
       * Called automatically by `playerCombat.js` when a player's punch hits this object!
       * Notice how knockback velocity is divided by `this.mass`:
       * - Light objects (Ball, mass 0.45) launch fast and bounce!
       * - Medium objects (Crate, mass 1.0) slide a solid distance!
       * - Heavy objects (Heavy Box, mass 2.6) budge a short, heavy distance!
       */
      onPunchHit(dir, force) {
        this.hitFlashTimer = 0.16;
        this.squashFactor = 0.32;

        const effectiveForce = force / this.mass;
        this.velocity.x = dir.x * effectiveForce;
        this.velocity.y =
          dir.y * effectiveForce * ARENA_CONFIG.PERSPECTIVE_Y_SCALE;

        // Upward pop into the air (inversely proportional to mass)
        this.velZ = clamp(240 / Math.sqrt(this.mass), 95, 320);
        this.isGrounded = false;
      },

      /**
       * Resets the object high in the sky above its original spawn point.
       */
      respawnFromSky() {
        if (this.carrier && this.carrier.heldObject === this) {
          this.carrier.heldObject = null;
        }
        this.carrier = null;
        this.pos.x = this.homePos.x + rand(-10, 10);
        this.pos.y = this.homePos.y + rand(-10, 10);
        this.velocity = vec2(0, 0);
        this.zHeight = rand(210, 290);
        this.velZ = 0;
        this.isGrounded = false;
        this.isFallingInVoid = false;
        this.isCarried = false;
        this.rollAngle = 0;
      },

      /**
       * Renders the object's 2.5D ground shadow, perspective scale, squash/stretch,
       * and custom visual design.
       */
      draw() {
        // When carried by the player (Milestone 7), the player draws the held object
        if (this.isCarried) return;

        const overArena = isPointOnArena(this.pos.x, this.pos.y);

        // 1. Draw 2.5D Ground Shadow on the sandstone floor
        drawGroundShadow({
          radius: this.footprintRadius,
          zHeight: this.zHeight,
          overArena,
          isFallingInVoid: this.isFallingInVoid,
        });

        // 2. Compute 2.5D depth scale + abyss shrink scale + impact squash/stretch
        const dScale = computeDepthScale(this.pos.y);
        const abyssScale = this.isFallingInVoid
          ? clamp(1 + this.zHeight / 640, 0.35, 1.0)
          : 1.0;
        const baseScale = dScale * abyssScale;

        const scaleX = baseScale * (1 + this.squashFactor * 0.45);
        const scaleY = baseScale * (1 - this.squashFactor * 0.35);

        pushTransform();
        pushTranslate(0, -this.zHeight);
        pushScale(scaleX, scaleY);

        if (typeof opts.renderVisuals === "function") {
          opts.renderVisuals(this, this.hitFlashTimer > 0);
        }

        popTransform();
      },
    },
  ]);

  return obj;
}
