const MUSIC_STORAGE_KEY = 'ultima3_music_enabled';

// MIDI note number to frequency (Hz)
function midiToFreq(midi) {
  if (!midi || midi <= 0) return 0;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Retro Chiptune Scores (each step = 1 eighth-note tick)
// 0 = rest
const THEMES = {
  // Overworld: "Wanderer's Ballad of Avalon" (A Aeolian / Dorian medieval theme)
  overworld: {
    stepMs: 250,
    leadWave: 'triangle',
    bassWave: 'sine',
    leadGain: 0.055,
    bassGain: 0.045,
    lead: [
      // Bar 1 (Am)
      69, 0, 72, 74, 76, 0, 74, 72,
      // Bar 2 (G)
      71, 0, 67, 71, 74, 0, 71, 0,
      // Bar 3 (F)
      69, 0, 65, 69, 72, 0, 71, 69,
      // Bar 4 (E)
      68, 0, 64, 68, 71, 0, 0, 0,
      // Bar 5 (Am)
      76, 0, 79, 77, 76, 0, 74, 72,
      // Bar 6 (Dm)
      74, 0, 69, 72, 74, 0, 76, 77,
      // Bar 7 (G -> Em)
      76, 74, 72, 71, 69, 71, 72, 68,
      // Bar 8 (Am)
      69, 0, 69, 0, 69, 0, 0, 0
    ],
    bass: [
      // Bar 1 (Am)
      45, 52, 57, 52, 45, 52, 57, 52,
      // Bar 2 (G)
      43, 50, 55, 50, 43, 50, 55, 50,
      // Bar 3 (F)
      41, 48, 53, 48, 41, 48, 53, 48,
      // Bar 4 (E)
      40, 47, 52, 47, 40, 47, 52, 47,
      // Bar 5 (Am)
      45, 52, 57, 52, 48, 55, 60, 55,
      // Bar 6 (Dm)
      50, 57, 62, 57, 50, 57, 62, 57,
      // Bar 7 (G -> E)
      43, 50, 55, 50, 40, 47, 52, 47,
      // Bar 8 (Am)
      45, 52, 57, 52, 45, 0, 45, 0
    ]
  },

  // Town & Tavern: "Hearth & Lute of Oakhaven" (Warm Renaissance pastoral in C / G)
  town: {
    stepMs: 240,
    leadWave: 'triangle',
    bassWave: 'triangle',
    leadGain: 0.05,
    bassGain: 0.038,
    lead: [
      // Bar 1 (C)
      72, 0, 76, 74, 72, 0, 67, 0,
      // Bar 2 (F -> G)
      69, 72, 74, 76, 74, 0, 67, 0,
      // Bar 3 (Em -> Am)
      76, 0, 79, 76, 72, 0, 69, 0,
      // Bar 4 (Dm -> G)
      74, 72, 71, 69, 67, 0, 0, 0,
      // Bar 5 (C)
      76, 0, 79, 81, 79, 76, 72, 0,
      // Bar 6 (F)
      77, 76, 74, 72, 74, 0, 71, 0,
      // Bar 7 (C -> G)
      72, 74, 76, 72, 74, 0, 71, 0,
      // Bar 8 (C)
      72, 0, 72, 0, 72, 0, 0, 0
    ],
    bass: [
      // Bar 1 (C)
      48, 55, 60, 55, 48, 55, 60, 55,
      // Bar 2 (F -> G)
      41, 48, 53, 48, 43, 50, 55, 50,
      // Bar 3 (Em -> Am)
      40, 47, 52, 47, 45, 52, 57, 52,
      // Bar 4 (Dm -> G)
      50, 57, 62, 57, 43, 50, 55, 50,
      // Bar 5 (C)
      48, 55, 60, 55, 48, 55, 60, 55,
      // Bar 6 (F -> G)
      41, 48, 53, 48, 43, 50, 55, 50,
      // Bar 7 (C -> G)
      48, 55, 60, 55, 43, 50, 55, 50,
      // Bar 8 (C)
      48, 55, 60, 55, 48, 0, 48, 0
    ]
  },

  // Dungeon: "Whispers of the Abyssal Crypt" (Spooky 3-voice C harmonic minor / diminished / tritone theme)
  dungeon: {
    stepMs: 240,
    leadWave: 'sine',
    harmonyWave: 'triangle',
    bassWave: 'triangle',
    leadGain: 0.044,
    harmonyGain: 0.025,
    bassGain: 0.048,
    leadDetuneCents: 14,
    lead: [
      // Bar 1 (Cm(maj7) — Creeping phantom motif)
      0, 0, 72, 0, 71, 0, 68, 67,
      // Bar 2 (Cdim7 / F# — Tritone dread)
      66, 0, 0, 67, 63, 0, 62, 0,
      // Bar 3 (Abm / Cm — Ghostly footsteps)
      0, 0, 75, 0, 74, 0, 68, 0,
      // Bar 4 (G7b9 / Bdim7 — Unresolved shiver)
      71, 0, 68, 0, 67, 66, 67, 0,
      // Bar 5 (Cm -> C#dim — Chromatic shadow crawl)
      72, 0, 75, 74, 73, 0, 70, 67,
      // Bar 6 (Fm(maj7) -> F#dim7 — Cold whisper)
      68, 0, 64, 65, 66, 0, 72, 69,
      // Bar 7 (G7sus4 -> G7b9 — Descending lament)
      67, 0, 63, 60, 59, 0, 62, 56,
      // Bar 8 (Cm — Cavern drip echo)
      60, 0, 0, 0, 84, 0, 78, 0,
      // Bar 9 (Ebm / F#m — Haunted organ modulation)
      75, 0, 78, 77, 75, 0, 73, 70,
      // Bar 10 (Dm7b5 -> G7 — Spectral wail)
      72, 71, 68, 65, 67, 0, 74, 0,
      // Bar 11 (Dbmaj7#11 — Phrygian dark mystery)
      73, 0, 72, 68, 67, 0, 68, 65,
      // Bar 12 (Cdim7 -> B7 — Spiraling into the abyss)
      66, 69, 72, 75, 74, 0, 71, 0,
      // Bar 13 (Cm -> Bbm6 — High phantom cry)
      79, 0, 78, 79, 75, 0, 72, 0,
      // Bar 14 (Abmaj7#5 -> G7 — Augmented tension)
      76, 0, 75, 72, 71, 0, 68, 67,
      // Bar 15 (F#dim7 -> G7b9 — Crypt cadence)
      66, 0, 68, 66, 67, 0, 59, 62,
      // Bar 16 (Cm — Echoing into darkness)
      60, 0, 0, 0, 72, 71, 0, 0
    ],
    harmony: [
      // Bar 1
      60, 63, 68, 67, 60, 63, 66, 67,
      // Bar 2
      60, 63, 66, 63, 59, 62, 65, 68,
      // Bar 3
      56, 60, 63, 60, 56, 59, 63, 59,
      // Bar 4
      55, 59, 62, 65, 68, 65, 62, 59,
      // Bar 5
      60, 67, 63, 67, 61, 67, 64, 67,
      // Bar 6
      53, 56, 60, 64, 54, 57, 60, 63,
      // Bar 7
      55, 60, 63, 60, 55, 59, 62, 68,
      // Bar 8
      60, 63, 67, 0, 72, 0, 66, 0,
      // Bar 9
      63, 66, 70, 66, 63, 66, 69, 66,
      // Bar 10
      62, 65, 68, 65, 59, 62, 65, 68,
      // Bar 11
      61, 65, 68, 72, 61, 67, 68, 65,
      // Bar 12
      60, 63, 66, 69, 59, 63, 66, 69,
      // Bar 13
      60, 63, 67, 63, 58, 63, 67, 63,
      // Bar 14
      56, 60, 64, 60, 55, 59, 63, 59,
      // Bar 15
      54, 60, 63, 66, 55, 59, 62, 65,
      // Bar 16
      60, 63, 59, 60, 0, 0, 55, 0
    ],
    bass: [
      // Bar 1
      36, 0, 0, 0, 43, 0, 42, 0,
      // Bar 2
      30, 0, 0, 0, 31, 0, 0, 0,
      // Bar 3
      32, 0, 0, 0, 39, 0, 32, 0,
      // Bar 4
      31, 0, 38, 0, 35, 0, 31, 0,
      // Bar 5
      36, 0, 43, 0, 37, 0, 34, 0,
      // Bar 6
      29, 0, 36, 0, 30, 0, 36, 0,
      // Bar 7
      31, 0, 38, 0, 31, 0, 32, 31,
      // Bar 8
      36, 0, 43, 0, 36, 0, 0, 0,
      // Bar 9
      39, 0, 46, 0, 39, 0, 37, 0,
      // Bar 10
      38, 0, 32, 0, 31, 0, 35, 0,
      // Bar 11
      37, 0, 44, 0, 37, 0, 32, 0,
      // Bar 12
      36, 0, 30, 0, 35, 0, 31, 0,
      // Bar 13
      36, 0, 43, 0, 34, 0, 43, 0,
      // Bar 14
      32, 0, 40, 0, 31, 0, 39, 0,
      // Bar 15
      30, 0, 36, 0, 31, 0, 29, 31,
      // Bar 16
      36, 0, 36, 0, 24, 0, 0, 0
    ]
  },

  // Combat: "Clash of Steel & Sorcery" (Fast, thrilling E-minor battle anthem with galloping bass)
  combat: {
    stepMs: 145,
    leadWave: 'square',
    harmonyWave: 'triangle',
    bassWave: 'triangle',
    leadGain: 0.028,
    harmonyGain: 0.034,
    bassGain: 0.046,
    lead: [
      // Bar 1 (Em — Urgent fanfare & gallop)
      64, 64, 67, 71, 76, 0, 74, 71,
      // Bar 2 (C -> D — Syncopated strike)
      72, 0, 71, 69, 71, 74, 69, 0,
      // Bar 3 (Em — Rising blade flurry)
      64, 67, 71, 76, 79, 78, 76, 74,
      // Bar 4 (C -> B7 — Harmonic tension)
      72, 76, 74, 72, 71, 0, 63, 71,
      // Bar 5 (Am — Counterattack surge)
      69, 69, 72, 76, 81, 0, 79, 76,
      // Bar 6 (F -> D — Heroic shift)
      77, 76, 74, 72, 74, 0, 78, 0,
      // Bar 7 (G -> B7 — Rapid climactic run)
      79, 78, 76, 74, 72, 71, 69, 71,
      // Bar 8 (Em — Mid-point stinger)
      76, 0, 71, 76, 64, 0, 0, 0,
      // Bar 9 (C — Desperate charge)
      76, 0, 79, 76, 72, 76, 79, 81,
      // Bar 10 (D — Ascending fury)
      78, 0, 81, 78, 74, 78, 81, 83,
      // Bar 11 (Em — High peak clash)
      84, 83, 79, 76, 79, 78, 76, 74,
      // Bar 12 (C -> B7 — Spiraling descent)
      72, 74, 76, 72, 71, 0, 75, 0,
      // Bar 13 (Am -> Bm — Relentless climb)
      69, 71, 72, 76, 71, 74, 78, 81,
      // Bar 14 (C -> D — Double-time rush)
      79, 76, 72, 76, 81, 78, 74, 78,
      // Bar 15 (B7 — Diminished seventh shred to cadence)
      83, 79, 78, 75, 76, 75, 71, 75,
      // Bar 16 (Em — Turnaround resolution)
      76, 0, 76, 0, 64, 0, 67, 71
    ],
    harmony: [
      // Bar 1
      52, 0, 55, 59, 64, 0, 62, 59,
      // Bar 2
      60, 0, 55, 60, 62, 0, 57, 62,
      // Bar 3
      52, 55, 59, 64, 67, 66, 64, 62,
      // Bar 4
      60, 64, 62, 60, 59, 0, 54, 59,
      // Bar 5
      57, 0, 60, 64, 69, 0, 67, 64,
      // Bar 6
      65, 60, 57, 60, 62, 0, 66, 0,
      // Bar 7
      67, 66, 64, 62, 60, 59, 57, 63,
      // Bar 8
      64, 0, 59, 64, 52, 0, 0, 0,
      // Bar 9
      60, 64, 67, 64, 60, 64, 67, 64,
      // Bar 10
      62, 66, 69, 66, 62, 66, 69, 66,
      // Bar 11
      64, 67, 71, 67, 64, 66, 64, 62,
      // Bar 12
      60, 62, 64, 60, 59, 0, 63, 0,
      // Bar 13
      57, 60, 64, 60, 59, 62, 66, 62,
      // Bar 14
      60, 64, 67, 64, 62, 66, 69, 66,
      // Bar 15
      71, 67, 66, 63, 64, 63, 59, 63,
      // Bar 16
      64, 0, 64, 0, 52, 0, 55, 59
    ],
    bass: [
      // Bar 1
      40, 52, 40, 52, 40, 52, 43, 45,
      // Bar 2
      36, 48, 36, 48, 38, 50, 38, 50,
      // Bar 3
      40, 52, 40, 52, 40, 52, 40, 52,
      // Bar 4
      36, 48, 36, 48, 35, 47, 42, 47,
      // Bar 5
      45, 57, 45, 57, 45, 57, 43, 45,
      // Bar 6
      41, 53, 41, 53, 38, 50, 38, 50,
      // Bar 7
      43, 55, 42, 54, 35, 47, 42, 47,
      // Bar 8
      40, 52, 47, 52, 40, 0, 40, 42,
      // Bar 9
      36, 48, 36, 48, 36, 48, 36, 48,
      // Bar 10
      38, 50, 38, 50, 38, 50, 38, 50,
      // Bar 11
      40, 52, 40, 52, 43, 55, 38, 50,
      // Bar 12
      36, 48, 36, 48, 35, 47, 35, 47,
      // Bar 13
      45, 57, 45, 57, 47, 59, 47, 59,
      // Bar 14
      36, 48, 36, 48, 38, 50, 38, 50,
      // Bar 15
      35, 47, 42, 47, 35, 47, 39, 42,
      // Bar 16
      40, 52, 40, 52, 40, 0, 43, 47
    ]
  }
};

class RetroMusicPlayer {
  constructor() {
    this.ctx = null;
    this.enabled = this.loadPreference();
    this.currentThemeKey = null;
    this.stepIndex = 0;
    this.timerId = null;
    this.unlockBound = false;
  }

  loadPreference() {
    try {
      const saved = localStorage.getItem(MUSIC_STORAGE_KEY);
      if (saved === null) return true;
      return saved === 'true';
    } catch {
      return true;
    }
  }

  savePreference(val) {
    try {
      localStorage.setItem(MUSIC_STORAGE_KEY, val ? 'true' : 'false');
    } catch {
      // ignore storage errors
    }
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  bindAutoplayUnlock() {
    if (this.unlockBound) return;
    this.unlockBound = true;
    const unlock = () => {
      if (this.enabled && this.currentThemeKey) {
        this.ensureContext();
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  playNote(freq, waveType, peakGain, durationSec, detuneCents = 0) {
    if (!freq || !this.ctx || !peakGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = waveType || 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    if (detuneCents) {
      osc.detune.setValueAtTime(detuneCents, now);
    }

    // Gentle chiptune envelope (no harsh clicks)
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  tick() {
    if (!this.enabled || !this.currentThemeKey) return;
    const theme = THEMES[this.currentThemeKey];
    if (!theme) return;

    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'running') {
      const len = theme.lead.length;
      const idx = this.stepIndex % len;
      const leadMidi = theme.lead[idx];
      const harmonyMidi = theme.harmony ? theme.harmony[idx] : 0;
      const bassMidi = theme.bass[idx];
      const durSec = (theme.stepMs / 1000) * 0.92;

      if (leadMidi > 0) {
        const leadFreq = midiToFreq(leadMidi);
        this.playNote(leadFreq, theme.leadWave, theme.leadGain, durSec);
        if (theme.leadDetuneCents) {
          this.playNote(
            leadFreq,
            theme.leadWave,
            theme.leadGain * 0.65,
            durSec * 1.35,
            theme.leadDetuneCents
          );
        }
      }
      if (harmonyMidi > 0) {
        this.playNote(
          midiToFreq(harmonyMidi),
          theme.harmonyWave || 'triangle',
          theme.harmonyGain || 0.03,
          durSec * 0.88
        );
      }
      if (bassMidi > 0) {
        this.playNote(midiToFreq(bassMidi), theme.bassWave, theme.bassGain, durSec * 0.85);
      }
      this.stepIndex = (this.stepIndex + 1) % len;
    }
  }

  setMode(themeKey) {
    this.bindAutoplayUnlock();

    if (!themeKey || !THEMES[themeKey]) {
      this.stopLoop();
      this.currentThemeKey = null;
      return;
    }

    if (this.currentThemeKey === themeKey && this.timerId !== null) {
      return;
    }

    this.currentThemeKey = themeKey;
    this.stepIndex = 0;
    this.stopLoop();

    if (this.enabled) {
      const theme = THEMES[themeKey];
      this.tick();
      this.timerId = window.setInterval(() => this.tick(), theme.stepMs);
    }
  }

  stopLoop() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  toggle(desiredThemeKey = null) {
    this.enabled = !this.enabled;
    this.savePreference(this.enabled);
    if (!this.enabled) {
      this.stopLoop();
    } else {
      this.ensureContext();
      const target = desiredThemeKey || this.currentThemeKey;
      this.currentThemeKey = null;
      if (target) {
        this.setMode(target);
      }
    }
    return this.enabled;
  }
}

export const retroMusic = new RetroMusicPlayer();
