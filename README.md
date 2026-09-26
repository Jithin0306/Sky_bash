# Sky_bash — 2.5D Serverless Multiplayer Physics Arena

[![Play Live](https://img.shields.io/badge/Play%20Live-GitHub%20Pages-brightgreen?style=for-the-badge&logo=github)](https://jithin0306.github.io/Sky_bash/)

🎮 **Play Live Now on GitHub Pages**: **[https://jithin0306.github.io/Sky_bash/](https://jithin0306.github.io/Sky_bash/)**

A fast-paced, 100% serverless **2.5D multiplayer physics arena brawler** built with **KAPLAY** and **Trystero (WebRTC P2P)** using vanilla JavaScript ES Modules (zero build tools, zero bundlers, zero external server costs).

---

## 🕹️ Game Modes

### 🌐 Serverless P2P Multiplayer (Powered by Trystero & WebRTC)
Connect instantly with friends across the globe directly in the browser—no servers or accounts required!
- **1 vs 1 Duel**: Head-to-head fast combat.
- **2 vs 2 Team Brawl**: Blue Team vs Orange Team cooperative throwdowns.
- **Free-For-All (FFA)**: 3 to 6 players competing in an all-out chaotic ring-out battle.
- **Custom Player Names**: Choose your own display name (`N` key or menu button) which syncs to all connected peers.
- **Shareable Room Codes**: Create a room, share the 4-to-6 character code, and your friends join your peer mesh in seconds.
- **Host-Authoritative Synchronized Drops & Physics**: Supply crates, brawler spheres, and heavy boxes drop periodically at identical positions with matching contents across every player's screen without physics jitter.

### 🤖 Single-Player & Practice Arena
- Battle against reactive AI bot brawlers with auto-patrolling, jumping, and punching.
- Test object pickup, throwing, punching, and hilarious cartoon cliff falls.

---

## 🎮 Controls

| Action | Keyboard / Mouse |
| :--- | :--- |
| **Move / Air-Steer** | `W` `A` `S` `D` or `Arrow Keys` |
| **Sprint** | Hold `Shift` |
| **Jump** | `Space` |
| **Punch (1-2 Combo)** | `Left Mouse Click` or `J` |
| **Pick Up / Place Down** | `E` |
| **Throw Object / Bomb** | `K` |
| **Toggle Music (BGM)** | `M` or Click `[🎵 MUSIC]` button |
| **Toggle Sound Effects (SFX)** | `X` or Click `[🔊 SFX]` button |
| **Change Player Name** | `N` |
| **Spawn Physics Object** | `R` (in Practice mode) |
| **Test Camera Zoom / Shake** | `Z` / `C` |

---

## ✨ Key Features & Architecture

- **100% Serverless Web Audio Synthesizer & Procedural Sounds**:
  - **Procedural Sound Effects**: Dynamic punch swooshes, bone-crunching hits, bouncy arcade jumps, landing thuds, item pickups, yeet throws, material-based bounces (metal, wood, rubber), multi-layered explosions (KABOOM!!), proximity mine beeps, power-up chimes, cartoon slide-whistles, boxing ring bells, and triumphant victory fanfares.
  - **Procedural Background Music (BGM)**: Built-in 128 BPM electronic brawler battle groove (4-on-the-floor kick, snappy snare, hi-hats, funky bassline, and lead arpeggios) for the arena, plus a chill synthwave ambient groove for the menu.
  - **Dual Independent Audio Controls**: Independent mute channels for background music and sound effects with dedicated hotkeys (`M` for Music, `X` for SFX) and interactive top-right HUD buttons with persistent `localStorage` memory. Zero external audio assets required!

- **Visual Clarity & High-DPI Rendering**:
  - Native pixel-density rendering (`pixelDensity: Math.min(window.devicePixelRatio, 2)`) ensures crisp, sharp text and UI on high-resolution, Retina, and Windows scaling monitors.
  - Mini animated neon tracking arrow and `"YOU"` indicator badge above your character's head to never lose your fighter in multi-player brawls.
  - High-contrast, glowing overhead player name badges with distinct colors (Gold for local player, Cyan for rivals, Orange for bots).

- **2.5D Physics & Arena Mechanics**:
  - Elliptical perspective projection (`PERSPECTIVE_Y_SCALE = 0.64`) with floating sunlit sky island, perimeter beacons, and depth sorting (`depth = y`).
  - Independent `zHeight` and vertical velocity with dynamic ground shadows and hilarious cartoon cliff-fall animations (`"AAAH!!"`, pedaling legs, windmill arms).
  - Modular physics objects (Supply Crates, Brawler Spheres, Heavy Iron Boxes) with elastic collisions, mass, friction, and throw dynamics.
  - Client-side prediction with Host-authoritative snapshot interpolation, eliminating object glitching/jittering when walking into items.

- **Zero-Build Vanilla Web Stack**:
  - Powered by KAPLAY v3001 and Trystero v0.20 via native browser `<script type="importmap">`.
  - Runs directly on any static web host (GitHub Pages, Vercel, Netlify, or local static server).

---

## 🚀 Running Locally

Because this project uses standard browser ES Modules and import maps, no compilation or npm build step is required!

Simply start any static file server from the root directory:

```bash
# Using Node.js npx serve
npx serve .

# Or using Python 3
python -m http.server 8000
```

Then visit `http://localhost:3000` (or `http://localhost:8000`) in your browser.

---

## 📜 License
MIT
