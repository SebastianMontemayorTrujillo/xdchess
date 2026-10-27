// Original chiptune tracks. Each token is one 16th-note step; '.' is a rest.
// Parts and drum strings loop independently (see playMusic in audio.js).
const s = (str) => str.trim().split(/\s+/).map((t) => (t === '.' ? null : t));
const rep = (str, n) => Array(n).fill(str).join(' ');
const bassBar = (lo, hi) => rep(`${lo} . ${hi} .`, 4);
const arpBar = (notes) => rep(notes, 4);

export const TRACKS = {
  // Suspense: timpani rolls and minor stabs.
  coin: {
    bpm: 90,
    drums: 't---t---t-t-tttt' + 't-------t---tttt',
    parts: [
      { type: 'triangle', gain: 0.35, len: 8, notes: s('A2 . . . . . . . A2 . . . . . . . F2 . . . . . . . E2 . . . . . . .') },
      { type: 'sawtooth', gain: 0.07, len: 2, notes: s(`
        E5 . . . . . . . E5 . . F5 . . E5 .
        D5 . . . . . . . C5 . B4 . G#4 . . .`) },
      { type: 'square', gain: 0.04, len: 8, notes: s('A3 . . . . . . . C4 . . . . . . . A3 . . . . . . . G#3 . . . . . . .') },
    ],
  },

  // Heroic training-montage fanfare.
  boxing: {
    bpm: 120,
    drums: 'k---s---k-k-s---',
    parts: [
      { type: 'sawtooth', gain: 0.12, notes: s(`${bassBar('C2', 'C3')} ${bassBar('F2', 'F3')} ${rep('Ab1 . Ab2 .', 2)} ${rep('Bb1 . Bb2 .', 2)} ${bassBar('C2', 'C3')}`) },
      { type: 'sawtooth', gain: 0.09, len: 2, notes: s(`
        G4 . . C5 . . E5 . . . . . G5 . . .
        F5 . . . E5 . D5 . C5 . . . A4 . . .
        C5 . . . Eb5 . . . D5 . . . F5 . . .
        E5 . . . . . . . C5 . G4 . C5 . . .`) },
      { type: 'square', gain: 0.04, len: 4, notes: s(`
        E4 . . . . . . . G4 . . . . . . .
        A4 . . . . . . . C5 . . . . . . .
        Eb4 . . . . . . . F4 . . . . . . .
        G4 . . . . . . . E4 . . . . . . .`) },
    ],
  },

  // Fast minor-key action.
  shooter: {
    bpm: 165,
    drums: 'k-h-s-h-k-k-s-hh',
    parts: [
      { type: 'sawtooth', gain: 0.1, notes: s(`${rep('E2 E3', 8)} ${rep('C2 C3', 8)} ${rep('D2 D3', 8)} ${rep('B1 B2', 8)}`) },
      { type: 'square', gain: 0.07, len: 1.5, notes: s(`
        E5 . G5 . B5 . A5 G5 F#5 . E5 . D5 . E5 .
        C5 . E5 . G5 . F#5 E5 D5 . C5 . B4 . C5 .
        D5 . F#5 . A5 . G5 F#5 E5 . D5 . C#5 . D5 .
        B4 . D#5 . F#5 . B5 . A5 . F#5 . D#5 . B4 .`) },
    ],
  },

  // Driving adventure chiptune.
  platformer: {
    bpm: 150,
    drums: 'k-h-s-h-k-k-s-h-',
    parts: [
      { type: 'triangle', gain: 0.35, notes: s(`${bassBar('D2', 'D3')} ${bassBar('B1', 'B2')} ${bassBar('G1', 'G2')} ${bassBar('A1', 'A2')}`) },
      { type: 'square', gain: 0.035, notes: s(`${arpBar('D4 F#4 A4 F#4')} ${arpBar('B3 D4 F#4 D4')} ${arpBar('G3 B3 D4 B3')} ${arpBar('A3 C#4 E4 C#4')}`) },
      { type: 'square', gain: 0.08, len: 1.5, notes: s(`
        A4 . D5 . F#5 . . E5 D5 . . . A4 . . .
        B4 . D5 . F#5 . . A5 G5 . F#5 . E5 . . .
        G5 . . F#5 E5 . D5 . B4 . . . G4 . . .
        A4 . C#5 . E5 . . A5 G5 . F#5 . E5 . C#5 .`) },
    ],
  },
};
