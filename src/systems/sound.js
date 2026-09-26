// ============================================================================
// src/systems/sound.js
// ============================================================================
// 100% Serverless, Zero-Asset Web Audio Synthesizer & Sound System for Sky_bash:
// 1. Procedural SFX (Punch swings, heavy impacts, bouncy jumps, landing thuds,
//    overhead pickups, yeet throws, bomb explosions, cartoon slide-whistles,
//    boxing ring bells, victory fanfares, and UI clicks).
// 2. Procedural Dynamic Background Music (BGM):
//    - "arena": Upbeat, high-energy 128 BPM electronic brawler battle groove
//      (4-on-the-floor kick, snappy snare, hi-hats, funky synth bassline, lead arp).
//    - "menu": Chill, atmospheric 105 BPM synthwave title groove.
// 3. Audio State Management:
//    - Persistent mute toggle (`M` key or HUD speaker icon).
//    - Volume controls (Master, SFX, Music).
//    - Safe browser autoplay unlocker (auto-resumes on first click or keypress).
// ============================================================================

class SoundManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.noiseBuffer = null;

    // Load initial separate mute states from localStorage if available
    let storedMusicMute = false;
    let storedSfxMute = false;
    try {
      storedMusicMute = localStorage.getItem("sky_bash_music_muted") === "true";
      storedSfxMute = localStorage.getItem("sky_bash_sfx_muted") === "true";
    } catch (e) {}

    this.isMusicMuted = storedMusicMute;
    this.isSfxMuted = storedSfxMute;
    this.masterVolume = 0.85;
    this.sfxVolume = 0.85;
    this.musicVolume = 0.35;

    // Music Sequencer State
    this.currentTrack = "none";
    this.musicTimer = null;
    this.musicStep = 0;
    this.nextNoteTime = 0;
    this.bpm = 128;
    this.isMusicPlaying = false;

    // Last played timestamps for rate-limiting rapid repetitive sounds (e.g. footsteps/swings)
    this.lastPlayTime = {};

    // Setup global interaction listeners to unlock AudioContext
    this._setupUnlockListeners();
  }

  /**
   * Initializes the Web Audio context and audio graph on first user interaction.
   */
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();

      // Master output node
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Dedicated SFX channel
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(
        this.isSfxMuted ? 0 : this.sfxVolume,
        this.ctx.currentTime
      );
      this.sfxGain.connect(this.masterGain);

      // Dedicated Music channel
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(
        this.isMusicMuted ? 0 : this.musicVolume,
        this.ctx.currentTime
      );
      this.musicGain.connect(this.masterGain);

      // Generate a 2-second white noise buffer for whooshes, impacts, snares & explosions
      this._createNoiseBuffer();

      // If a music track was queued before unlock, start it now
      if (this.currentTrack !== "none" && !this.isMusicPlaying) {
        this._startMusicSequencer();
      }
    } catch (e) {
      console.warn("Web Audio API initialization failed:", e);
    }
  }

  _setupUnlockListeners() {
    const unlock = () => {
      this.init();
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
  }

  _createNoiseBuffer() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate || 44100;
    const duration = 2.0;
    const bufferSize = sampleRate * duration;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  }

  /**
   * Toggles Music mute on/off. Persists state to localStorage.
   */
  toggleMusicMute() {
    this.setMusicMuted(!this.isMusicMuted);
    return this.isMusicMuted;
  }

  setMusicMuted(muted) {
    this.isMusicMuted = Boolean(muted);
    try {
      localStorage.setItem("sky_bash_music_muted", this.isMusicMuted ? "true" : "false");
    } catch (e) {}

    if (this.musicGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
      this.musicGain.gain.linearRampToValueAtTime(
        this.isMusicMuted ? 0 : this.musicVolume,
        t + 0.05
      );
    }

    if (!this.isMusicMuted && this.currentTrack !== "none" && !this.isMusicPlaying) {
      this._startMusicSequencer();
    }

    if (!this.isSfxMuted) {
      this.playUIClick();
    }
  }

  /**
   * Toggles Sound Effects (SFX) mute on/off. Persists state to localStorage.
   */
  toggleSfxMute() {
    this.setSfxMuted(!this.isSfxMuted);
    return this.isSfxMuted;
  }

  setSfxMuted(muted) {
    this.isSfxMuted = Boolean(muted);
    try {
      localStorage.setItem("sky_bash_sfx_muted", this.isSfxMuted ? "true" : "false");
    } catch (e) {}

    if (this.sfxGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.sfxGain.gain.cancelScheduledValues(t);
      this.sfxGain.gain.setValueAtTime(this.sfxGain.gain.value, t);
      this.sfxGain.gain.linearRampToValueAtTime(
        this.isSfxMuted ? 0 : this.sfxVolume,
        t + 0.05
      );
    }

    if (!this.isSfxMuted) {
      this.playUIClick();
    }
  }

  // Master mute toggle convenience methods
  toggleMute() {
    const allMuted = this.isMusicMuted && this.isSfxMuted;
    this.setMusicMuted(!allMuted);
    this.setSfxMuted(!allMuted);
    return !allMuted;
  }

  setMuted(muted) {
    this.setMusicMuted(muted);
    this.setSfxMuted(muted);
  }

  isMuted() {
    return this.isMusicMuted && this.isSfxMuted;
  }

  /**
   * Renders the separate Music & SFX Mute buttons on the HUD (Top-Right Corner).
   */
  drawAudioHUD() {
    const musicOff = this.isMusicMuted;
    const sfxOff = this.isSfxMuted;

    // 1. Music Toggle Button (Pos: 1058, 14, Width: 104, Height: 24)
    drawRect({
      pos: vec2(1058, 14),
      width: 104,
      height: 24,
      radius: 6,
      color: rgb(12, 18, 32),
      opacity: 0.88,
      outline: {
        width: 1.5,
        color: musicOff ? rgb(255, 95, 95) : rgb(95, 235, 160),
      },
    });
    drawText({
      text: musicOff ? "MUSIC: OFF (M)" : "MUSIC: ON (M)",
      pos: vec2(1066, 20),
      size: 9.5,
      color: musicOff ? rgb(255, 145, 145) : rgb(125, 255, 195),
    });

    // 2. Sound Effects Toggle Button (Pos: 1168, 14, Width: 98, Height: 24)
    drawRect({
      pos: vec2(1168, 14),
      width: 98,
      height: 24,
      radius: 6,
      color: rgb(12, 18, 32),
      opacity: 0.88,
      outline: {
        width: 1.5,
        color: sfxOff ? rgb(255, 95, 95) : rgb(95, 235, 160),
      },
    });
    drawText({
      text: sfxOff ? "SFX: OFF (X)" : "SFX: ON (X)",
      pos: vec2(1178, 20),
      size: 9.5,
      color: sfxOff ? rgb(255, 145, 145) : rgb(125, 255, 195),
    });
  }

  /**
   * Handles mouse clicks for the separate Music & SFX Mute buttons.
   * Returns true if either button was clicked.
   */
  handleAudioClick(mx, my) {
    // Music Button Click Bounds
    if (mx >= 1058 && mx <= 1162 && my >= 12 && my <= 40) {
      this.toggleMusicMute();
      return true;
    }
    // SFX Button Click Bounds
    if (mx >= 1168 && mx <= 1266 && my >= 12 && my <= 40) {
      this.toggleSfxMute();
      return true;
    }
    return false;
  }

  /**
   * Registers global keyboard shortcuts:
   * - `M` for toggling Music
   * - `X` for toggling Sound Effects
   */
  registerAudioKeyBindings(canTrigger = null) {
    onKeyPress("m", () => {
      if (typeof canTrigger === "function" && !canTrigger()) return;
      this.toggleMusicMute();
    });
    onKeyPress("x", () => {
      if (typeof canTrigger === "function" && !canTrigger()) return;
      this.toggleSfxMute();
    });
  }

  _canPlay(id, minInterval = 0.04) {
    if (this.isSfxMuted) return false;
    this.init();
    if (!this.ctx || this.ctx.state === "suspended") return false;

    const now = performance.now() / 1000;
    if (this.lastPlayTime[id] && now - this.lastPlayTime[id] < minInterval) {
      return false;
    }
    this.lastPlayTime[id] = now;
    return true;
  }

  // ==========================================================================
  // PROCEDURAL SOUND EFFECTS (SFX)
  // ==========================================================================

  /**
   * Crisp punch swipe whoosh in the air.
   */
  playPunchSwing() {
    if (!this._canPlay("punch_swing", 0.09)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Filtered noise swoosh
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1400, t);
      filter.frequency.exponentialRampToValueAtTime(320, t + 0.12);
      filter.Q.setValueAtTime(1.8, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.24, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      noise.start(t);
      noise.stop(t + 0.14);
    }

    // Tonal air slice
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(340, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.11);

    oscGain.gain.setValueAtTime(0.12, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.12);
  }

  /**
   * Crunchy punch impact crack + deep sub thump when connecting with a target.
   */
  playPunchHit({ isHeavy = false, isDummy = false } = {}) {
    if (!this._canPlay("punch_hit", 0.06)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // 1. Initial sharp impact crack (filtered noise)
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(isHeavy ? 1100 : 1600, t);
      filter.Q.setValueAtTime(2.2, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (isHeavy ? 0.08 : 0.05));

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      noise.start(t);
      noise.stop(t + 0.09);
    }

    // 2. Punch body thump (rapid pitch drop)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isHeavy ? "sawtooth" : "triangle";

    const startFreq = isHeavy ? 140 : 190;
    const endFreq = isHeavy ? 35 : 48;
    const dur = isHeavy ? 0.18 : 0.12;

    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);

    gain.gain.setValueAtTime(isHeavy ? 0.5 : 0.38, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + dur + 0.02);

    // 3. Wooden wobble resonance if dummy was struck
    if (isDummy) {
      const woodOsc = ctx.createOscillator();
      const woodGain = ctx.createGain();
      woodOsc.type = "sine";
      woodOsc.frequency.setValueAtTime(280, t + 0.02);
      woodOsc.frequency.exponentialRampToValueAtTime(120, t + 0.14);

      woodGain.gain.setValueAtTime(0.22, t + 0.02);
      woodGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

      woodOsc.connect(woodGain);
      woodGain.connect(this.sfxGain);

      woodOsc.start(t + 0.02);
      woodOsc.stop(t + 0.16);
    }
  }

  /**
   * Bouncy, uplifting arcade jump sound.
   */
  playJump() {
    if (!this._canPlay("jump", 0.08)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";

    // Pitch sweep upward
    osc.frequency.setValueAtTime(155, t);
    osc.frequency.exponentialRampToValueAtTime(380, t + 0.13);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.26, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.16);
  }

  /**
   * Landing impact thud when touching down on the arena floor.
   */
  playLand(speed = 200) {
    if (!this._canPlay("land", 0.12)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const intensity = Math.min(1.0, Math.max(0.25, speed / 360));

    // Low thump
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.09);

    gain.gain.setValueAtTime(0.32 * intensity, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.11);

    // Dust rustle noise
    if (this.noiseBuffer && intensity > 0.4) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(450, t);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.18 * intensity, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.sfxGain);

      noise.start(t);
      noise.stop(t + 0.09);
    }
  }

  /**
   * Bright, snappy 2-tone chime when picking up an object or opponent.
   */
  playPickup() {
    if (!this._canPlay("pickup", 0.08)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const notes = [523.25, 783.99]; // C5 -> G5
    notes.forEach((freq, idx) => {
      const noteTime = t + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.22, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.09);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.1);
    });
  }

  /**
   * Powerful whip whoosh when throwing an object or fighter.
   */
  playThrow() {
    if (!this._canPlay("throw", 0.1)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1800, t);
      filter.frequency.exponentialRampToValueAtTime(380, t + 0.18);
      filter.Q.setValueAtTime(1.5, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      noise.start(t);
      noise.stop(t + 0.21);
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(360, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.18);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  /**
   * Soft drop clatter when placing down an item.
   */
  playDrop() {
    if (!this._canPlay("drop", 0.08)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.1);
  }

  /**
   * Quick popping escape sound when breaking free from carrier hands.
   */
  playEscape() {
    if (!this._canPlay("escape", 0.1)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(780, t + 0.09);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.12);
  }

  /**
   * Material-based bounce impact (wood crate, metal heavy box, or rubber ball).
   */
  playBounce(objectType = "crate", speed = 100) {
    if (!this._canPlay("bounce", 0.07)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const intensity = Math.min(1.0, Math.max(0.25, Math.abs(speed) / 250));

    if (objectType === "heavyBox") {
      // Metallic ping + ringing clank
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(720, t);
      osc.frequency.exponentialRampToValueAtTime(320, t + 0.14);

      gain.gain.setValueAtTime(0.28 * intensity, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.17);
    } else if (objectType === "ball") {
      // Rubbery boing chirp
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(210, t);
      osc.frequency.linearRampToValueAtTime(360, t + 0.04);
      osc.frequency.exponentialRampToValueAtTime(170, t + 0.13);

      gain.gain.setValueAtTime(0.24 * intensity, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.15);
    } else {
      // Woody hollow knock (Crate / Bomb / Mine)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.09);

      gain.gain.setValueAtTime(0.25 * intensity, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.11);
    }
  }

  /**
   * Massive 3-layer KABOOM explosion (Blast crack + Sub-bass rumble + Noise roar).
   */
  playExplosion(theme = "fire") {
    if (!this._canPlay("explosion", 0.12)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // 1. Initial Blast Crack
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = theme === "slime" ? "bandpass" : "lowpass";
      filter.frequency.setValueAtTime(theme === "slime" ? 950 : 2200, t);
      filter.frequency.exponentialRampToValueAtTime(80, t + 0.7);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.7, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      noise.start(t);
      noise.stop(t + 0.9);
    }

    // 2. Sub-Bass Rumble
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(110, t);
    subOsc.frequency.exponentialRampToValueAtTime(26, t + 0.75);

    subGain.gain.setValueAtTime(0.65, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

    subOsc.connect(subGain);
    subGain.connect(this.sfxGain);

    subOsc.start(t);
    subOsc.stop(t + 0.82);

    // 3. Distortion / Saturation Layer
    const distOsc = ctx.createOscillator();
    const distGain = ctx.createGain();
    distOsc.type = theme === "slime" ? "triangle" : "sawtooth";
    distOsc.frequency.setValueAtTime(theme === "slime" ? 85 : 65, t);
    distOsc.frequency.exponentialRampToValueAtTime(20, t + 0.45);

    distGain.gain.setValueAtTime(0.35, t);
    distGain.gain.exponentialRampToValueAtTime(0.001, t + 0.48);

    distOsc.connect(distGain);
    distGain.connect(this.sfxGain);

    distOsc.start(t);
    distOsc.stop(t + 0.5);
  }

  /**
   * Spark / fuse ignition sound.
   */
  playFuseSpark() {
    if (!this._canPlay("fuse_spark", 0.15)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(680, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.08);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.1);
  }

  /**
   * High-tech arming beep when a mine lands and activates.
   */
  playMineArm() {
    if (!this._canPlay("mine_arm", 0.1)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    [1150, 1580].forEach((freq, idx) => {
      const noteTime = t + idx * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.2, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.05);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.06);
    });
  }

  /**
   * Rapid high warning buzz when someone steps near a triggered landmine.
   */
  playMineTrigger() {
    if (!this._canPlay("mine_trigger", 0.1)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1750, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.12);

    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.14);
  }

  /**
   * Celestial celestial twinkle when a power-up orb falls from the sky.
   */
  playPowerUpSpawn() {
    if (!this._canPlay("powerup_spawn", 0.15)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    [880, 1108, 1318].forEach((freq, idx) => {
      const noteTime = t + idx * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.18, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.12);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.13);
    });
  }

  /**
   * Sparkling ascending 4-note arpeggio upon collecting an energy power-up!
   */
  playPowerUpCollect() {
    if (!this._canPlay("powerup_collect", 0.15)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const arpeggio = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    arpeggio.forEach((freq, idx) => {
      const noteTime = t + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.25, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.16);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.18);
    });
  }

  /**
   * Classic cartoon slide-whistle down ("Fwwweeeeewww...") when falling off the cliff!
   */
  playCliffFall() {
    if (!this._canPlay("cliff_fall", 0.4)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";

    // Slide smoothly down from 740Hz to 125Hz with slight comic vibrato
    osc.frequency.setValueAtTime(740, t);
    osc.frequency.exponentialRampToValueAtTime(125, t + 0.72);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.78);
  }

  /**
   * Dramatic boxing match bell / gong resonance on Ring-Out or KO.
   */
  playRingOut() {
    if (!this._canPlay("ring_out", 0.3)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Metallic bell chord (Fundamental + Harmonics)
    const freqs = [440, 880, 1320, 1760];
    const amps = [0.35, 0.22, 0.15, 0.08];

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(amps[idx], t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.25);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 1.3);
    });
  }

  /**
   * Match countdown beeps (3, 2, 1) and triumphal "GO!" chime.
   */
  playCountdown(count) {
    if (!this._canPlay("countdown", 0.2)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const isGo = count === 0 || count === "GO";

    if (isGo) {
      // High triumphal chord for "GO!"
      [880, 1108].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(t);
        osc.stop(t + 0.35);
      });
    } else {
      // Short punchy countdown pip
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, t);

      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.12);
    }
  }

  /**
   * Triumphant 5-note celebratory victory fanfare!
   */
  playVictory() {
    if (!this._canPlay("victory", 0.5)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const fanfare = [
      { freq: 392.0, time: 0.0, dur: 0.12 }, // G4
      { freq: 523.25, time: 0.13, dur: 0.12 }, // C5
      { freq: 659.25, time: 0.26, dur: 0.12 }, // E5
      { freq: 783.99, time: 0.39, dur: 0.15 }, // G5
      { freq: 1046.5, time: 0.55, dur: 0.45 }, // C6 (grand finale!)
    ];

    fanfare.forEach((n) => {
      const noteTime = t + n.time;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(n.freq, noteTime);

      gain.gain.setValueAtTime(0.32, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + n.dur);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(noteTime);
      osc.stop(noteTime + n.dur + 0.02);
    });
  }

  /**
   * Crisp arcade button click.
   */
  playUIClick() {
    if (!this._canPlay("ui_click", 0.04)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.045);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  /**
   * Subtle micro-tick when hovering interactive buttons.
   */
  playUIHover() {
    if (!this._canPlay("ui_hover", 0.06)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(780, t);

    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.03);
  }

  // ==========================================================================
  // PROCEDURAL DYNAMIC BACKGROUND MUSIC (BGM)
  // ==========================================================================

  /**
   * Starts playing a procedural background music track ("arena" or "menu").
   */
  playMusic(trackName = "arena") {
    if (this.currentTrack === trackName && this.isMusicPlaying) return;

    this.currentTrack = trackName;
    this.init();

    if (!this.ctx || this.ctx.state === "suspended") {
      // Will start automatically once the user clicks or presses a key
      return;
    }

    this._startMusicSequencer();
  }

  stopMusic() {
    this.currentTrack = "none";
    this.isMusicPlaying = false;
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  _startMusicSequencer() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }

    if (this.currentTrack === "none" || !this.ctx) return;

    this.isMusicPlaying = true;
    this.bpm = this.currentTrack === "arena" ? 128 : 104;
    this.musicStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;

    // Run scheduler clock every 35ms (standard Web Audio lookahead pattern)
    this.musicTimer = setInterval(() => {
      this._scheduleMusic();
    }, 35);
  }

  _scheduleMusic() {
    if (!this.ctx || this.ctx.state === "suspended" || !this.isMusicPlaying) return;

    const secondsPer16th = 60 / this.bpm / 4;
    const scheduleAheadTime = 0.12; // 120ms lookahead

    while (this.nextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
      if (this.currentTrack === "arena") {
        this._playArena16thStep(this.musicStep, this.nextNoteTime);
      } else if (this.currentTrack === "menu") {
        this._playMenu16thStep(this.musicStep, this.nextNoteTime);
      }

      this.nextNoteTime += secondsPer16th;
      this.musicStep = (this.musicStep + 1) % 32; // 2-bar 32-step loop
    }
  }

  // --- ARENA BATTLE THEME (High-Energy Electronic Brawler Beat) ---
  _playArena16thStep(step, time) {
    if (this.isMusicMuted) return;

    // 1. Kick Drum (4-on-the-floor: beats 0, 4, 8, 12, 16, 20, 24, 28)
    if (step % 4 === 0) {
      this._synthKick(time);
    }

    // 2. Snare / Clap (Backbeats: steps 4, 12, 20, 28)
    if (step % 8 === 4) {
      this._synthSnare(time);
    }

    // 3. Shuffling Closed Hi-Hat (Every odd 16th note & 8th note offbeat)
    if (step % 2 === 1 || step % 4 === 2) {
      this._synthHiHat(time, step % 4 === 2 ? 0.09 : 0.04);
    }

    // 4. Driving Funky Synth Bassline (D minor groove)
    // D2 = 73.42, F2 = 87.31, G2 = 98.0, A2 = 110.0, C3 = 130.81
    const bassPattern = [
      73.42, 0, 73.42, 87.31, 0, 73.42, 98.0, 0,
      73.42, 0, 73.42, 110.0, 87.31, 0, 73.42, 0,
      73.42, 0, 73.42, 87.31, 0, 73.42, 98.0, 0,
      110.0, 0, 98.0, 0, 87.31, 0, 73.42, 0,
    ];
    const bassFreq = bassPattern[step];
    if (bassFreq > 0) {
      this._synthBass(time, bassFreq);
    }

    // 5. Melodic Chiptune Lead Synth Arpeggio (D minor pentatonic)
    // Steps 16-31 have an energetic lead arp
    const leadPattern = [
      0, 293.66, 0, 349.23, 0, 392.0, 0, 440.0,
      0, 523.25, 0, 587.33, 0, 440.0, 0, 349.23,
      293.66, 0, 349.23, 0, 392.0, 0, 440.0, 0,
      523.25, 587.33, 0, 523.25, 440.0, 392.0, 349.23, 0,
    ];
    const leadFreq = leadPattern[step];
    if (leadFreq > 0) {
      this._synthLead(time, leadFreq);
    }
  }

  // --- MENU TITLE THEME (Atmospheric Chill Synthwave) ---
  _playMenu16thStep(step, time) {
    if (this.isMusicMuted) return;

    // Gentle soft kick on beats 0 and 16
    if (step === 0 || step === 16) {
      this._synthKick(time, 0.22);
    }

    // Soft warm hi-hat on every 4th step
    if (step % 4 === 2) {
      this._synthHiHat(time, 0.04);
    }

    // Warm Ambient Synth Pad / Arp Notes
    // Fmaj -> Am -> G -> C progression
    const menuArp = [
      349.23, 0, 440.0, 0, 523.25, 0, 659.25, 0,
      440.0, 0, 523.25, 0, 659.25, 0, 783.99, 0,
      392.0, 0, 493.88, 0, 587.33, 0, 783.99, 0,
      523.25, 0, 659.25, 0, 783.99, 0, 1046.5, 0,
    ];
    const arpFreq = menuArp[step];
    if (arpFreq > 0) {
      this._synthAmbientPluck(time, arpFreq);
    }
  }

  // --- Procedural Drum & Synth Voice Helpers ---

  _synthKick(time, volume = 0.42) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(145, time);
    osc.frequency.exponentialRampToValueAtTime(32, time + 0.08);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

    osc.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.1);
  }

  _synthSnare(time, volume = 0.22) {
    const ctx = this.ctx;
    if (!this.noiseBuffer) return;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(1000, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    noise.start(time);
    noise.stop(time + 0.12);

    // Body snap
    const osc = ctx.createOscillator();
    const snapGain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.06);

    snapGain.gain.setValueAtTime(0.18, time);
    snapGain.gain.exponentialRampToValueAtTime(0.001, time + 0.065);

    osc.connect(snapGain);
    snapGain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.07);
  }

  _synthHiHat(time, volume = 0.06) {
    const ctx = this.ctx;
    if (!this.noiseBuffer) return;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(8500, time);
    filter.Q.setValueAtTime(3.5, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    noise.start(time);
    noise.stop(time + 0.04);
  }

  _synthBass(time, freq, volume = 0.28) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, time);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(650, time);
    filter.frequency.exponentialRampToValueAtTime(180, time + 0.14);
    filter.Q.setValueAtTime(3.5, time);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.16);
  }

  _synthLead(time, freq, volume = 0.14) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(freq, time);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, time);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.13);
  }

  _synthAmbientPluck(time, freq, volume = 0.16) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.24);

    osc.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.26);
  }
}

// Global Singleton Export
export const sound = new SoundManager();
