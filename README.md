# SkyRing Brawl — KAPLAY 2.5D Circular Arena Prototype

A modular, learning-first **2.5D multiplayer-style physics & arena fighting game prototype** built with **KAPLAY (JavaScript ES Modules)**.

---

## ✨ Features Implemented (Milestones 1 – 6)

- **Milestone 1 — 2.5D Circular Arena & Camera System**:
  - Elliptical 2.5D perspective projection (`PERSPECTIVE_Y_SCALE = 0.64`) with a sunlit sandstone & golden-bronze floating island, 3D underbelly cliffs, pulsing perimeter beacons, and smooth clamped camera tracking + impact shake.
- **Milestone 2 — Original Character ("Volt") & 2.5D Movement**:
  - Articulated 2-segment legs, flame-coral brawler boots, cobalt tunic, flowing scarf, floating golden boxing gloves, and instant arcade turning.
- **Milestone 3 — Jump, Gravity, Ground Detection & Funny Cliff Fall**:
  - Independent vertical height axis (`zHeight`, `velZ`) with dynamic ground shadows and a hilarious cartoon cliff-fall animation (`"AAAH!!"`, windmill arms, pedaling legs, googly visor eyes, and North-edge behind-island occlusion).
- **Milestone 4 — 2.5D Depth Sorting (`depth = y`) & Perspective Scaling**:
  - Dynamic per-frame `z = Math.round(pos.y)` depth sorting, $\pm 8\%$ depth perspective scaling, and solid 3D footprint collisions with Crystal Orb Stands & a Sparring Target Dummy.
- **Milestone 5 — Melee Punch System**:
  - 1-2 alternating left/right boxing combo, active hit window, `480 px/s` knockback, `45ms` hit-stop freeze frames, and compact comic-book `"POW! / BAM! / WHAM!"` & `"KO! RING OUT!"` callouts.
- **Milestone 6 — 2.5D Physics Objects**:
  - Modular physics objects (`Supply Crate`, `Brawler Sphere / Ball`, `Iron Heavy Box`) with configurable `mass`, `friction`, `bounce`, `throwForce`, and `damage`, plus Object-vs-Object elastic billiard collisions and Player-vs-Object pushing.

---

## 🎮 Controls

| Action | Key / Mouse |
| :--- | :--- |
| **Move / Air-Steer** | `W` `A` `S` `D` or `Arrow Keys` |
| **Jump** | `Space` |
| **Punch (1-2 Combo)** | `Left Mouse Click` or `J` |
| **Drop Fresh Physics Objects** | `R` |
| **Test Camera Shake / Zoom** | `C` / `Z` |

---

## 🚀 How to Run Locally

Because this project uses standard browser ES Modules + an `<script type="importmap">`, no bundler or build step is needed!

```bash
npx serve .
```

Then open the local URL shown in your terminal (e.g., `http://localhost:3000`).
