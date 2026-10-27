import { GLYPH } from '../board.js';
import { sfx } from '../audio.js';
import { loadAssets, pieceSprite, facesLeft, silhouette } from '../assets.js';
import {
  ARENA_W, MAX_HP, JUMP, PUNCH, AIR_PUNCH,
  createFighter, stepFighter, resolveAttack, pushApart, timeUpWinner,
} from './boxing-logic.js';

const W = ARENA_W, H = 420, FLOOR_Y = 360;
const STEP = 1 / 120;
const ROUND_TIME = 60;
const INTRO = 1.4; // seconds of "ROUND 1 / FIGHT!"
const SPRITE = 120, GLOVE = 38;
const GLOVE_ROT = Math.PI / 2; // rotates the Twemoji glove so its fist points forward (+x)
const CONTROLS = {
  w: { left: 'a', right: 'd', jump: 'w', punch: 'x', block: 's' },
  b: { left: 'j', right: 'l', jump: 'i', punch: 'm', block: 'k' },
};
const GAME_KEYS = new Set(Object.values(CONTROLS).flatMap(Object.values));

// Per-piece idle personality: bob amplitude/speed, tilt, hover height.
const STYLE = {
  p: { amp: 5, speed: 11, tilt: 0.05, hover: 0 },   // jittery pawn
  n: { amp: 4, speed: 7, tilt: 0.14, hover: 0 },    // rocking horse
  b: { amp: 3, speed: 6, tilt: 0.09, hover: 0 },    // swaying bishop
  r: { amp: 1.5, speed: 4, tilt: 0.02, hover: 0 },  // heavy rook
  q: { amp: 6, speed: 3.5, tilt: 0.05, hover: 8 },  // floating queen
  k: { amp: 2.5, speed: 5, tilt: 0.03, hover: 0 },  // regal king
};

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const easeOut = (k) => 1 - (1 - k) ** 3;

// Pose in the fighter's local space (+x = forward, -y = up, origin at the feet).
function pose(f, time, style) {
  const guardF = { x: 36, y: -64, rot: 0, s: 1 };
  const guardB = { x: 16, y: -74, rot: 0, s: 0.9 };
  const p = { y: 0, rot: 0, sx: 1, sy: 1, shake: 0, flash: false, front: guardF, back: guardB };
  const bob = Math.sin(time * style.speed);
  switch (f.state) {
    case 'idle':
      p.y = -style.hover - bob * style.amp;
      p.rot = bob * style.tilt * 0.4;
      p.sy = 1 + bob * 0.02;
      p.front = { ...guardF, y: guardF.y - bob * 3 };
      p.back = { ...guardB, y: guardB.y + bob * 3 };
      break;
    case 'walk': {
      const step = Math.abs(Math.sin(time * style.speed * 1.4));
      const forward = Math.sign(f.vx) === f.facing ? 1 : -1;
      p.y = -style.hover - step * style.amp * 1.6;
      p.rot = forward * style.tilt;
      p.front = { ...guardF, x: guardF.x + forward * 4, y: guardF.y - step * 4 };
      break;
    }
    case 'jump': {
      const k = Math.max(-1, Math.min(1, f.vy / JUMP));
      p.sx = 1 - k * 0.1;
      p.sy = 1 + k * 0.14;
      p.rot = -k * 0.1;
      p.front = { ...guardF, y: -84 };
      p.back = { ...guardB, y: -90 };
      break;
    }
    case 'punch': {
      const { startup, active, recovery } = PUNCH;
      let ext; // 0 = guard, -0.3 = wind-up, 1 = full extension
      if (f.t < startup) ext = -0.3 * (f.t / startup);
      else if (f.t < startup + active) ext = lerp(-0.3, 1, easeOut(clamp01((f.t - startup) / (active * 0.5))));
      else ext = 1 - clamp01((f.t - startup - active) / recovery);
      p.rot = Math.max(0, ext) * 0.16;
      p.front = { x: guardF.x + ext * (PUNCH.reach - 6), y: -62, rot: 0, s: 1 + Math.max(0, ext) * 0.3 };
      p.back = { ...guardB, x: guardB.x - Math.max(0, ext) * 8 };
      p.whoosh = f.t >= startup && f.t < startup + active;
      break;
    }
    case 'airpunch': {
      const k = easeOut(clamp01(f.t / AIR_PUNCH.startup));
      p.rot = 0.35 * k;
      p.front = { x: lerp(guardF.x, 62, k), y: lerp(guardF.y, -18, k), rot: 0.7 * k, s: 1 + 0.3 * k };
      p.back = { ...guardB, y: -84 };
      p.whoosh = f.t >= AIR_PUNCH.startup && f.t < AIR_PUNCH.startup + 0.12;
      break;
    }
    case 'block':
    case 'blockstun':
      p.rot = -0.1;
      p.sx = 0.96;
      p.front = { x: 40, y: -80, rot: -Math.PI / 2, s: 1.05 };
      p.back = { x: 34, y: -56, rot: -Math.PI / 2, s: 1 };
      if (f.state === 'blockstun') p.shake = 2;
      break;
    case 'hit':
      p.rot = -0.28;
      p.shake = 3;
      p.flash = f.t < 0.1;
      p.front = { ...guardF, x: 20, y: -86, rot: -0.8 };
      p.back = { ...guardB, x: 0, y: -90, rot: -0.8 };
      break;
    case 'ko': {
      const k = easeOut(clamp01(f.t / 0.6));
      p.rot = -k * Math.PI / 2;
      p.flash = f.t < 0.12;
      p.front = { ...guardF, x: 20, y: lerp(guardF.y, -20, k), rot: -1.5 * k };
      p.back = { ...guardB, x: -10, y: lerp(guardB.y, -16, k), rot: -1.5 * k };
      break;
    }
  }
  return p;
}

export default {
  id: 'boxing',
  name: 'Boxing',
  async run(container, fighters) {
    container.innerHTML = `
      <div class="big">🥊 Boxing</div>
      <div>White: A/D move, W jump, X punch, S block · Black: J/L move, I jump, M punch, K block</div>
      <div>Punch in the air (jump + punch) hits harder · Blocking takes only chip damage</div>
      <canvas class="ring" width="${W}" height="${H}"></canvas>`;
    const ctx = container.querySelector('canvas').getContext('2d');
    const assets = await loadAssets();
    const spriteOf = (c) => pieceSprite(assets, fighters[c]);
    const flashOf = { w: silhouette(spriteOf('w'), SPRITE), b: silhouette(spriteOf('b'), SPRITE) };

    return new Promise((resolve) => {
      const f = { w: createFighter('w', 220), b: createFighter('b', W - 220) };
      const lagHp = { w: MAX_HP, b: MAX_HP }; // trailing red damage bar
      const keys = new Set();
      const pressed = new Set();
      const effects = [];
      let clock = 0;        // seconds since start (scaled by slow-mo)
      let hitStop = 0;      // freeze frames on impact
      let shake = 0;
      let result = null;    // { winner, reason, at }
      let prev = performance.now();
      let acc = 0;

      const down = (e) => {
        const k = e.key.toLowerCase();
        if (!GAME_KEYS.has(k)) return;
        e.preventDefault();
        if (!e.repeat) pressed.add(k);
        keys.add(k);
      };
      const up = (e) => keys.delete(e.key.toLowerCase());
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);

      const inputFor = (c) => {
        const k = CONTROLS[c];
        return {
          left: keys.has(k.left), right: keys.has(k.right), block: keys.has(k.block),
          punch: pressed.has(k.punch), jump: pressed.has(k.jump),
        };
      };

      const finish = (winner, reason) => {
        if (!result) result = { winner, reason, at: clock };
      };

      const update = (dt) => {
        clock += dt;
        if (clock < INTRO || (result && result.reason === 'time')) { pressed.clear(); return; }
        if (hitStop > 0) { hitStop -= dt; return; }
        const idle = {};
        const prevStates = { w: f.w.state, b: f.b.state };
        stepFighter(f.w, result ? idle : inputFor('w'), dt, f.b.x);
        stepFighter(f.b, result ? idle : inputFor('b'), dt, f.w.x);
        pressed.clear();
        for (const c of ['w', 'b']) {
          const s = f[c].state;
          if (s !== prevStates[c] && (s === 'punch' || s === 'airpunch')) sfx.whoosh();
          if (s === 'jump' && prevStates[c] !== 'jump' && prevStates[c] !== 'airpunch') sfx.jump();
        }
        pushApart(f.w, f.b);
        for (const [a, d] of [[f.w, f.b], [f.b, f.w]]) {
          const r = resolveAttack(a, d);
          if (!r) continue;
          const sy = FLOOR_Y - r.y;
          if (r.type === 'block') {
            sfx.block();
            effects.push({ img: assets.sparkle, x: r.x, y: sy, t0: clock, dur: 0.25, size: 40 });
          } else {
            sfx.hit();
            effects.push({ img: assets.impact, x: r.x, y: sy, t0: clock, dur: 0.3, size: r.type === 'ko' ? 110 : 64 });
            hitStop = r.type === 'ko' ? 0.25 : 0.07;
            shake = r.type === 'ko' ? 0.4 : 0.15;
            if (r.type === 'ko') finish(a.color, 'ko');
          }
        }
        if (!result && clock - INTRO >= ROUND_TIME) finish(timeUpWinner(f.w, f.b), 'time');
      };

      const frame = (now) => {
        let dt = Math.min(0.05, (now - prev) / 1000);
        prev = now;
        if (result && result.reason === 'ko') dt *= 0.35; // K.O. slow-motion
        acc += dt;
        while (acc >= STEP) { update(STEP); acc -= STEP; }
        shake = Math.max(0, shake - dt);
        for (const c of ['w', 'b']) lagHp[c] = Math.max(f[c].hp, lagHp[c] - 30 * dt);
        draw();
        if (result && clock - result.at > (result.reason === 'ko' ? 0.9 : 1.6)) {
          window.removeEventListener('keydown', down);
          window.removeEventListener('keyup', up);
          resolve(result.winner);
          return;
        }
        requestAnimationFrame(frame);
      };

      // ---- Drawing ----
      const drawStage = () => {
        const sky = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
        sky.addColorStop(0, '#2a1b4d');
        sky.addColorStop(0.6, '#c9446b');
        sky.addColorStop(1, '#f59e4c');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, FLOOR_Y);
        ctx.fillStyle = '#ffd36b';
        ctx.beginPath();
        ctx.arc(W / 2, FLOOR_Y - 90, 60, 0, Math.PI * 2);
        ctx.fill();
        // skyline
        ctx.fillStyle = '#1b1233';
        for (let i = 0; i < 20; i++) {
          const bw = 30 + ((i * 37) % 25), bh = 50 + ((i * 53) % 90);
          ctx.fillRect(i * 42 - 10, FLOOR_Y - 40 - bh, bw, bh + 40);
        }
        // cheering crowd
        ctx.fillStyle = '#0e0a1f';
        for (let i = 0; i < 40; i++) {
          const hop = Math.abs(Math.sin(clock * 6 + i * 1.7)) * (result ? 8 : 3);
          ctx.beginPath();
          ctx.arc(i * 21 + 8, FLOOR_Y - 26 - hop, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(i * 21 - 1, FLOOR_Y - 20 - hop, 18, 20 + hop);
        }
        // chessboard floor in perspective
        const rows = 4, n = 12;
        const fx = (k, s) => W / 2 + ((k / n) * W - W / 2) * s;
        for (let r = 0; r < rows; r++) {
          const y0 = FLOOR_Y + (r * (H - FLOOR_Y)) / rows, y1 = FLOOR_Y + ((r + 1) * (H - FLOOR_Y)) / rows;
          const s0 = 1 + r * 0.08, s1 = 1 + (r + 1) * 0.08;
          for (let i = -2; i < n + 2; i++) {
            ctx.fillStyle = (i + r) % 2 ? '#b58863' : '#f0d9b5';
            ctx.beginPath();
            ctx.moveTo(fx(i, s0), y0); ctx.lineTo(fx(i + 1, s0), y0);
            ctx.lineTo(fx(i + 1, s1), y1); ctx.lineTo(fx(i, s1), y1);
            ctx.fill();
          }
        }
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, FLOOR_Y, W, 3);
      };

      const drawGlove = (g) => {
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(GLOVE_ROT + g.rot);
        const s = GLOVE * g.s;
        ctx.drawImage(assets.glove, -s / 2, -s / 2, s, s);
        ctx.restore();
      };

      const drawFighter = (c) => {
        const fi = f[c];
        const p = pose(fi, clock + (c === 'b' ? 0.37 : 0), STYLE[fighters[c].type]);
        const sx = fi.x, sy = FLOOR_Y - fi.y;
        // shadow
        const sh = Math.max(0.35, 1 - fi.y / 250);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(sx, FLOOR_Y + 4, 38 * sh, 8 * sh, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(sx + (p.shake ? Math.sin(clock * 90) * p.shake : 0), sy + p.y);
        ctx.scale(fi.facing, 1);
        ctx.rotate(p.rot);
        drawGlove(p.back);
        ctx.save();
        ctx.scale(p.sx, p.sy);
        if (facesLeft(fighters[c])) ctx.scale(-1, 1);
        ctx.drawImage(p.flash ? flashOf[c] : spriteOf(c), -SPRITE / 2, -SPRITE * 0.92, SPRITE, SPRITE);
        ctx.restore();
        if (p.whoosh) {
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 3;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(p.front.x - 40, p.front.y + i * 9);
            ctx.lineTo(p.front.x - 14, p.front.y + i * 9);
            ctx.stroke();
          }
        }
        drawGlove(p.front);
        ctx.restore();
      };

      const banner = (text, color) => {
        ctx.font = 'italic 900 72px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#000';
        ctx.strokeText(text, W / 2, H / 2 - 30);
        ctx.fillStyle = color;
        ctx.fillText(text, W / 2, H / 2 - 30);
      };

      const drawHud = () => {
        const bw = 330, bh = 22, top = 16;
        for (const c of ['w', 'b']) {
          const left = c === 'w';
          const x0 = left ? 20 : W - 20 - bw;
          ctx.fillStyle = '#000';
          ctx.fillRect(x0 - 3, top - 3, bw + 6, bh + 6);
          ctx.fillStyle = '#8b0000';
          ctx.fillRect(x0, top, bw, bh);
          // bars drain toward the centre, like the arcade games
          const lag = (lagHp[c] / MAX_HP) * bw, hp = (f[c].hp / MAX_HP) * bw;
          ctx.fillStyle = '#ff4040';
          ctx.fillRect(left ? x0 + bw - lag : x0, top, lag, bh);
          ctx.fillStyle = f[c].hp > 30 ? '#ffd400' : '#ff9800';
          ctx.fillRect(left ? x0 + bw - hp : x0, top, hp, bh);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 16px system-ui, sans-serif';
          ctx.textAlign = left ? 'left' : 'right';
          ctx.textBaseline = 'top';
          ctx.fillText(`${left ? 'WHITE' : 'BLACK'} ${GLYPH[fighters[c].type]}`, left ? x0 : x0 + bw, top + bh + 6);
        }
        const left = Math.max(0, Math.ceil(ROUND_TIME - Math.max(0, clock - INTRO)));
        ctx.fillStyle = '#000';
        ctx.fillRect(W / 2 - 30, top - 6, 60, 40);
        ctx.fillStyle = left <= 10 ? '#ff5a5a' : '#ffd400';
        ctx.font = 'bold 30px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(String(left), W / 2, top - 2);

        if (clock < INTRO) banner(clock < INTRO * 0.55 ? 'ROUND 1' : 'FIGHT!', clock < INTRO * 0.55 ? '#fff' : '#ffd400');
        if (result) banner(result.reason === 'ko' ? 'K.O.!' : 'TIME!', '#ff3b3b');
      };

      const draw = () => {
        ctx.save();
        if (shake > 0) ctx.translate((Math.random() - 0.5) * 80 * shake, (Math.random() - 0.5) * 50 * shake);
        drawStage();
        // the attacking fighter is drawn on top
        const order = ['punch', 'airpunch'].includes(f.w.state) ? ['b', 'w'] : ['w', 'b'];
        for (const c of order) drawFighter(c);
        for (let i = effects.length - 1; i >= 0; i--) {
          const e = effects[i];
          const k = (clock - e.t0) / e.dur;
          if (k >= 1) { effects.splice(i, 1); continue; }
          ctx.globalAlpha = 1 - k;
          const s = e.size * (0.6 + k * 0.8);
          ctx.drawImage(e.img, e.x - s / 2, e.y - s / 2, s, s);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
        drawHud();
      };

      requestAnimationFrame(frame);
    });
  },
};
