// Music and sound effects via the Web Audio API.
// Files live in public/audio/sfx/ and public/audio/music/ (see public/audio/CREDITS.md).
// Browsers only allow sound after the user interacts with the page, so loading starts on the
// first click or key press; sounds requested before that are skipped silently.

// name -> { files (one is picked at random), volume }
const SFX = {
  move: { files: ['move-1', 'move-2'], volume: 0.8 },
  select: { files: ['select'], volume: 0.35 },
  capture: { files: ['capture'], volume: 0.9 },
  removed: { files: ['removed'], volume: 0.7 },
  fight: { files: ['fight'], volume: 0.8 },
  tick: { files: ['tick'], volume: 0.3 },
  pick: { files: ['pick'], volume: 0.6 },
  punch: { files: ['punch-1', 'punch-2', 'punch-3'], volume: 0.7 },
  block: { files: ['block'], volume: 0.6 },
  shot: { files: ['shot'], volume: 0.4 },
  hit: { files: ['hit'], volume: 0.8 },
  coin: { files: ['coin'], volume: 0.8 },
  check: { files: ['check'], volume: 0.6 },
  win: { files: ['win'], volume: 0.7 },
  lose: { files: ['lose'], volume: 0.7 },
};

// Looping background tracks; playMusic() crossfades between them.
const MUSIC = {
  board: { file: 'board', volume: 0.35 },
  fight: { file: 'fight', volume: 0.4 },
};
const FADE_SECONDS = 1;

const MUTE_KEY = 'crabchess.muted';
const BASE = `${import.meta.env.BASE_URL}audio/`;

let ctx = null;
let master = null;
const buffers = {}; // sfx file name -> AudioBuffer
const musicBuffers = {}; // music name -> AudioBuffer
let wantedMusic = null; // track that should be playing
let currentMusic = null; // { name, src, gain }
let muted = readMuted();

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function init() {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);
  const files = new Set(Object.values(SFX).flatMap((s) => s.files));
  for (const name of files) {
    load(`sfx/${name}`, (buf) => { buffers[name] = buf; });
  }
  for (const [name, { file }] of Object.entries(MUSIC)) {
    load(`music/${file}`, (buf) => {
      musicBuffers[name] = buf;
      startWantedMusic();
    });
  }
}

function load(path, onLoad) {
  fetch(`${BASE}${path}.m4a`)
    .then((r) => r.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .then(onLoad)
    .catch(() => {}); // a missing sound should never break the game
}

for (const type of ['pointerdown', 'keydown']) {
  window.addEventListener(type, init, { once: true, capture: true });
}

export function playSfx(name) {
  const sfx = SFX[name];
  if (!ctx || muted || !sfx) return;
  const buf = buffers[sfx.files[Math.floor(Math.random() * sfx.files.length)]];
  if (!buf) return;
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = sfx.volume;
  src.buffer = buf;
  src.connect(gain).connect(master);
  src.start();
}

// Switch the background music to 'board' or 'fight'. Safe to call before audio has loaded:
// the track starts as soon as it's available.
export function playMusic(name) {
  wantedMusic = name;
  startWantedMusic();
}

function startWantedMusic() {
  const buf = musicBuffers[wantedMusic];
  if (!ctx || !buf || currentMusic?.name === wantedMusic) return;
  const now = ctx.currentTime;

  if (currentMusic) {
    const { gain, src } = currentMusic;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    src.stop(now + FADE_SECONDS);
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(MUSIC[wantedMusic].volume, now + FADE_SECONDS);
  src.connect(gain).connect(master);
  src.start();
  currentMusic = { name: wantedMusic, src, gain };
}

export const isMuted = () => muted;

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = muted ? 0 : 1;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // storage unavailable (private mode): the setting just won't be remembered
  }
}
