import { TRACKS } from './music.js';

// Tiny Web Audio synth: a looping step sequencer for music plus a few sound effects.
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
let current = null; // { timer, gain }

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const SEMI = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
export function noteToFreq(note) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(note);
  if (!m) return null;
  const n = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * 2 ** (n / 12);
}

function playNote(dest, type, freq, t, dur, gain) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.setValueAtTime(gain, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dest, t, dur, gain, filterType, freq) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function drum(dest, kind, t) {
  if (kind === 'k') {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.22);
  } else if (kind === 's') {
    noise(dest, t, 0.15, 0.5, 'bandpass', 1800);
    playNote(dest, 'triangle', 190, t, 0.08, 0.3);
  } else if (kind === 'h') {
    noise(dest, t, 0.04, 0.2, 'highpass', 7000);
  } else if (kind === 't') {
    // low tom / timpani hit
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.4);
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.52);
  }
}

// A track: { bpm, parts: [{ type, gain, len?, notes: [...] }], drums: 'k-h-s-h-...' }
// Every part and the drum string loop independently over 16th-note steps.
export function playMusic(id) {
  stopMusic();
  const track = TRACKS[id];
  if (!track || !audio()) return;
  const gain = ctx.createGain();
  gain.connect(master);
  const stepDur = 60 / track.bpm / 4;
  let step = 0;
  let next = ctx.currentTime + 0.05;
  const schedule = () => {
    while (next < ctx.currentTime + 0.12) {
      for (const part of track.parts) {
        const note = part.notes[step % part.notes.length];
        const freq = note && noteToFreq(note);
        if (freq) playNote(gain, part.type, freq, next, stepDur * (part.len || 1), part.gain);
      }
      const d = track.drums?.[step % track.drums.length];
      if (d && d !== '-') drum(gain, d, next);
      step++;
      next += stepDur;
    }
  };
  schedule();
  current = { timer: setInterval(schedule, 25), gain };
}

export function stopMusic() {
  if (!current) return;
  clearInterval(current.timer);
  const g = current.gain;
  g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
  setTimeout(() => g.disconnect(), 400);
  current = null;
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}
export const isMuted = () => muted;

export const sfx = {
  tick() {
    if (!audio()) return;
    playNote(master, 'square', 1400, ctx.currentTime, 0.03, 0.15);
  },
  land() {
    if (!audio()) return;
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) =>
      playNote(master, 'square', noteToFreq(n), ctx.currentTime + i * 0.08, 0.25, 0.2));
  },
  jump() {
    if (!audio()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.1);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.13);
  },
  death() {
    if (!audio()) return;
    const t = ctx.currentTime;
    noise(master, t, 0.3, 0.4, 'lowpass', 1200);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.4);
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.42);
  },
};
