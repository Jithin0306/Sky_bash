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
      isThrownProjectile: false,
      thrower: null,
      throwHitSet: new Set(),

      // --- Visual Feedback State ---
      rollAngle: 0,
      squashFactor: 0,
      hitFlashTimer: 0,

      /**
       * Called automatically by `playerCombat.js` when a player's punch hits this object!
       * Notice how knockback velocity is divided by `this.mass`:
       * - Light objects (Ball, mass 0.78) launch fast and bounce!
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
        this.isThrownProjectile = false;
        this.thrower = null;
        this.throwHitSet.clear();
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
       * thrown projectile wind streaks, and custom visual design.
       */
      draw() {
        // When carried by the player (Phase 7) or waiting to respawn after exploding (Phase 9), skip ground draw
        if (this.isCarried || this.isExplodedCooldown) return;

        const overArena = isPointOnArena(this.pos.x, this.pos.y);

        // Phase 9: If this is a lit Bomb on the floor, draw its 2.5D blast-radius danger ring!
        if (this.objectType === "bomb" && this.isLit && overArena && !this.isFallingInVoid) {
          const urgency = clamp(
            1 - (this.fuseTimer || 0) / (this.fuseDuration || 3.5),
            0,
            1
          );
          const pulseAlpha = 0.22 + 0.25 * Math.abs(Math.sin(time() * lerp(6, 20, urgency)));

          pushTransform();
          pushScale(1, ARENA_CONFIG.PERSPECTIVE_Y_SCALE);
          drawCircle({
            pos: vec2(0, 0),
            radius: this.blastRadius || 145,
            color: rgb(245, 55, 45),
            opacity: pulseAlpha * 0.32,
            outline: {
              width: 2.5,
              color: rgb(255, 95, 65),
              opacity: pulseAlpha + 0.2,
            },
          });
          popTransform();
        }

        // 1. Draw 2.5D Ground Shadow on the sandstone floor
        drawGroundShadow({
          radius: this.footprintRadius,
          zHeight: this.zHeight,
          overArena,
          isFallingInVoid: this.isFallingInVoid,
        });

        // 2. Phase 8: High-speed motion wind streaks when flying as a thrown projectile!
        if (this.isThrownProjectile) {
          const speed = Math.hypot(this.velocity.x, this.velocity.y);
          if (speed > 90) {
            const dirX = -this.velocity.x / speed;
            const dirY = -this.velocity.y / speed;
            const streakLen = clamp(speed * 0.08, 18, 46);
            const centerDrawY = -this.zHeight - this.propHeight * 0.5;

            drawLine({
              p1: vec2(dirX * 10, centerDrawY - 8 + dirY * 6),
              p2: vec2(dirX * (10 + streakLen), centerDrawY - 8 + dirY * streakLen),
              width: 3,
              color: rgb(255, 235, 130),
              opacity: 0.75,
            });
            drawLine({
              p1: vec2(dirX * 14, centerDrawY + 6 + dirY * 6),
              p2: vec2(dirX * (14 + streakLen * 0.8), centerDrawY + 6 + dirY * streakLen * 0.8),
              width: 2.5,
              color: rgb(120, 240, 255),
              opacity: 0.7,
            });
          }
        }

        // 3. Compute 2.5D depth scale + abyss shrink scale + impact squash/stretch
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
