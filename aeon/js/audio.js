// ============================================================
// AEON :: SFX
// Procedural Web Audio sound effects — no asset files. Every
// sound is synthesized from oscillators + filtered noise so the
// game stays a single self-contained folder. Honors a persisted
// mute preference and only starts its AudioContext after a user
// gesture (browser autoplay policy).
// ============================================================

const Sfx = (function () {
  let ctx = null, master = null, noiseBuf = null;
  let muted = false;
  let lastAgeUp = 0;

  try { muted = localStorage.getItem('aeon_muted') === '1'; } catch (_) {}

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.45;
    master.connect(ctx.destination);
    // One second of white noise, reused for every percussive sound.
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // A single enveloped oscillator note.
  function tone(freq, t0, dur, type, peak, glideTo) {
    const c = ensure(); if (!c) return;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak || 0.3, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  // A burst of filtered noise (impacts, swells).
  function noise(t0, dur, peak, filterType, freq, q) {
    const c = ensure(); if (!c) return;
    const s = c.createBufferSource(); s.buffer = noiseBuf;
    const g = c.createGain(), f = c.createBiquadFilter();
    f.type = filterType || 'bandpass';
    f.frequency.value = freq || 1800;
    f.Q.value = q || 0.8;
    g.gain.setValueAtTime(peak || 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + dur + 0.03);
  }

  return {
    // Resume the AudioContext from inside a user gesture.
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
    },
    isMuted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('aeon_muted', muted ? '1' : '0'); } catch (_) {}
      if (master) master.gain.value = muted ? 0 : 0.45;
      return muted;
    },

    // Steel-on-steel clash when armies meet.
    clash() {
      const c = ensure(); if (!c || muted) return; const t = c.currentTime;
      noise(t, 0.16, 0.45, 'highpass', 1400, 0.6);   // bright shing
      noise(t, 0.34, 0.32, 'lowpass', 360, 0.5);     // body thud
      tone(165, t, 0.26, 'square', 0.16, 90);
      tone(330, t + 0.01, 0.13, 'sawtooth', 0.09);
    },

    // Bright three-note rise when a civ enters a new tech age.
    ageUp() {
      const c = ensure(); if (!c || muted) return;
      const now = performance.now();
      if (now - lastAgeUp < 320) return; // throttle (sims age fast)
      lastAgeUp = now;
      const t = c.currentTime;
      [523.25, 659.25, 783.99].forEach((f, i) =>   // C5 E5 G5
        tone(f, t + i * 0.085, 0.17, 'triangle', 0.2));
    },

    // Heavy descending boom for a special weapon.
    special() {
      const c = ensure(); if (!c || muted) return; const t = c.currentTime;
      tone(220, t, 0.6, 'sawtooth', 0.28, 42);
      tone(110, t + 0.02, 0.7, 'sine', 0.24, 30);
      noise(t, 0.6, 0.4, 'lowpass', 900, 0.4);
    },

    // Triumphant fanfare on victory.
    victory() {
      const c = ensure(); if (!c || muted) return; const t = c.currentTime;
      [392, 523.25, 659.25].forEach((f, i) =>       // G4 C5 E5
        tone(f, t + i * 0.12, 0.28, 'triangle', 0.24));
      tone(783.99, t + 0.36, 0.6, 'triangle', 0.27); // G5 hold
    },

    // Rising war-horn as the final battle begins.
    battleStart() {
      const c = ensure(); if (!c || muted) return; const t = c.currentTime;
      tone(98, t, 0.7, 'sawtooth', 0.28, 150);
      tone(147, t + 0.05, 0.62, 'sawtooth', 0.18);
    },
  };
})();

window.Sfx = Sfx;
