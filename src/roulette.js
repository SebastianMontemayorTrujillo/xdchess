import { minigames } from './minigames/index.js';
import { sfx } from './audio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COLORS = ['#e4572e', '#29335c', '#f3a712', '#2a9d8f', '#8e44ad', '#c0392b'];
const SIZE = 380;
const PEGS = 4; // tick pegs per segment
const SPIN_MS = 4000;
const easeOut = (t) => 1 - (1 - t) ** 3;

// Spin a roulette wheel over the registry and resolve with the chosen minigame.
// `?game=<id>` in the URL forces a specific minigame (for testing).
export async function spinRoulette(container, title) {
  const n = minigames.length;
  const seg = (Math.PI * 2) / n;
  const forced = new URLSearchParams(location.search).get('game');
  const forcedIdx = minigames.findIndex((g) => g.id === forced);
  const target = forcedIdx >= 0 ? forcedIdx : Math.floor(Math.random() * n);

  container.innerHTML = `<div class="big">${title}</div><canvas width="${SIZE}" height="${SIZE}" class="wheel"></canvas><div class="big wheel-result">&nbsp;</div>`;
  const ctx = container.querySelector('canvas').getContext('2d');
  const result = container.querySelector('.wheel-result');

  // Segment i spans [i*seg, (i+1)*seg) measured clockwise from the pointer at the top.
  // Rotating the wheel by `angle` puts wheel-angle (-angle) under the pointer.
  const jitter = (Math.random() - 0.5) * seg * 0.6;
  const finalAngle = Math.PI * 2 * 5 - (target + 0.5) * seg + jitter;

  const draw = (angle, highlight = -1) => {
    const c = SIZE / 2, r = c - 14;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(angle);
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + i * seg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, a0, a0 + seg);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.globalAlpha = highlight < 0 || highlight === i ? 1 : 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.save();
      ctx.rotate(a0 + seg / 2);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(minigames[i].name, r - 16, 0);
      ctx.restore();
      for (let p = 0; p < PEGS; p++) {
        const a = a0 + (p * seg) / PEGS;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (r - 5), Math.sin(a) * (r - 5), 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd700';
        ctx.fill();
      }
    }
    ctx.restore();
    // hub
    ctx.beginPath();
    ctx.arc(c, c, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd700';
    ctx.fill();
    // pointer
    ctx.beginPath();
    ctx.moveTo(c - 14, 2);
    ctx.lineTo(c + 14, 2);
    ctx.lineTo(c, 34);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  };

  await new Promise((resolve) => {
    const start = performance.now();
    let lastPeg = 0;
    const frame = (now) => {
      const t = Math.min(1, (now - start) / SPIN_MS);
      const angle = finalAngle * easeOut(t);
      const peg = Math.floor(angle / (seg / PEGS));
      if (peg !== lastPeg) {
        lastPeg = peg;
        sfx.tick();
      }
      draw(angle);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });

  sfx.land();
  draw(finalAngle, target);
  result.textContent = minigames[target].name + '!';
  await sleep(900);
  return minigames[target];
}

// Show a message in the overlay for `ms` milliseconds.
export async function flash(container, html, ms = 1500) {
  container.innerHTML = html;
  await sleep(ms);
}
