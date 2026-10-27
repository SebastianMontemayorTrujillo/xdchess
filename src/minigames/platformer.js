import { GLYPH } from '../board.js';
import { sfx } from '../audio.js';
import { loadAssets, pieceSprite, facesLeft } from '../assets.js';
import {
  TILE, PW, PH, STEP, ROWS, RUN, LEVEL, PLATFORMS, SPAWN,
  newPlayer, stepPlayer, raceWinner, platformX, crumbleState,
} from './platformer-physics.js';

const VW = 800, VH = ROWS * TILE;
const LEVEL_W = LEVEL[0].length * TILE;
const CONTROLS = {
  w: { left: 'a', right: 'd', jump: 'w' },
  b: { left: 'j', right: 'l', jump: 'i' },
};
const GAME_KEYS = new Set(Object.values(CONTROLS).flatMap(Object.values));
const READY = 1.5;      // seconds of READY/GO before the race clock starts
const TIME_LIMIT = 40;  // then the furthest best progress wins
const SPRITE = 32;
const finishCol = LEVEL[ROWS - 3].indexOf('F');
const progress = (x) => Math.max(0, Math.min(1, (x - SPAWN.x) / (finishCol * TILE - SPAWN.x)));

// Day for White's view, dusk for Black's.
const PALETTES = {
  w: { sky: ['#6ec6ff', '#d8f1ff'], sun: '#fff3b0', far: '#8fb8d8', near: '#6aa86b', cloud: 'rgba(255,255,255,0.85)' },
  b: { sky: ['#3b2463', '#e0779a'], sun: '#ffd3e0', far: '#5b4a86', near: '#3e5a5a', cloud: 'rgba(255,220,235,0.55)' },
};
const CONFETTI = ['#ff5a5a', '#ffd400', '#4fb8f0', '#7ed957', '#c77dff'];

// Deterministic pseudo-random in [0, 1) for tile decoration.
const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const ridge = (x, seed, amp) =>
  Math.sin(x * 0.004 + seed) * amp + Math.sin(x * 0.011 + seed * 2) * amp * 0.45 + Math.sin(x * 0.023 + seed * 3) * amp * 0.2;

export default {
  id: 'platformer',
  name: 'Platform Race',
  async run(container, fighters) {
    container.innerHTML = `
      <div class="big">🏁 Platform Race</div>
      <div>White: A/D move, W jump · Black: J/L move, I jump · Springs launch you, platforms carry you, cracked blocks crumble!</div>
      <div>Reach the flag, or be furthest after ${TIME_LIMIT}s. Dying restarts you, but your best progress counts.</div>
      <div class="platformer">
        <canvas id="pf-w" width="${VW}" height="${VH}"></canvas>
        <canvas id="pf-b" width="${VW}" height="${VH}"></canvas>
      </div>`;
    const views = {
      w: container.querySelector('#pf-w').getContext('2d'),
      b: container.querySelector('#pf-b').getContext('2d'),
    };
    const assets = await loadAssets();
    const sprite = { w: pieceSprite(assets, fighters.w), b: pieceSprite(assets, fighters.b) };

    return new Promise((resolve) => {
      const players = {
        w: { ...newPlayer(), deaths: 0, best: SPAWN.x },
        b: { ...newPlayer(), deaths: 0, best: SPAWN.x },
      };
      // `?pfstart=<column>` drops both racers at a column (for testing sections).
      const startCol = Number(new URLSearchParams(location.search).get('pfstart'));
      if (startCol > 0) for (const p of Object.values(players)) { p.x = startCol * TILE; p.y = 0; }
      const fx = {};
      for (const c of ['w', 'b']) {
        fx[c] = {
          landAt: -9, jumpAt: -9, springAt: -9, spawnAt: 0, deadAt: -9, shake: 0, dustAt: 0,
          spring: null, camX: 0, particles: [], shards: [], falling: [], seenFallen: new Set(),
        };
      }
      const keys = new Set();
      const down = (e) => {
        const k = e.key.toLowerCase();
        if (GAME_KEYS.has(k)) e.preventDefault();
        keys.add(k);
      };
      const up = (e) => keys.delete(e.key.toLowerCase());
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);

      let clock = 0;    // seconds since the minigame started
      let elapsed = 0;  // race seconds (drives physics and moving platforms)
      let result = null; // { winner, timeUp, at }
      let prev = performance.now();
      let acc = 0;

      const puff = (c, x, y, n, { colors = ['#f4e9d8', '#e0d2bb', '#ffffff'], speed = 60, up = 30, life = 0.4, size = 3, gravity = 0 } = {}) => {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          fx[c].particles.push({
            x, y, vx: Math.cos(a) * speed * Math.random(), vy: -Math.random() * up, g: gravity,
            t0: clock, life: life * (0.6 + Math.random() * 0.7), size: size * (0.6 + Math.random() * 0.8),
            color: colors[(Math.random() * colors.length) | 0],
          });
        }
      };

      const shatter = (c, p) => {
        // Break the sprite into a grid of shards that fly apart (Celeste-style death).
        const n = 4;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 180;
            fx[c].shards.push({
              x: p.x + PW / 2 + (i - 1.5) * 7, y: p.y + PH - SPRITE * 0.6 + (j - 1.5) * 7,
              vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, rot: 0, vr: (Math.random() - 0.5) * 20,
              i, j, n, t0: clock,
            });
          }
        }
      };

      const confetti = (c, x, y) => {
        puff(c, x, y, 60, { colors: CONFETTI, speed: 260, up: 320, life: 1.6, size: 4, gravity: 500 });
      };

      const stepRace = () => {
        elapsed += STEP;
        const world = { level: LEVEL, platforms: PLATFORMS, time: elapsed };
        for (const c of ['w', 'b']) {
          const p = players[c], f = fx[c], ctl = CONTROLS[c];
          const input = result ? {} : { left: keys.has(ctl.left), right: keys.has(ctl.right), jump: keys.has(ctl.jump) };
          const before = { x: p.x, y: p.y };
          const ev = stepPlayer(p, input, STEP, world);
          const feetX = p.x + PW / 2, feetY = p.y + PH;
          if (ev === 'jump') {
            f.jumpAt = clock;
            puff(c, feetX, feetY, 6, { speed: 50, up: 10 });
            sfx.jump();
          } else if (ev === 'land') {
            f.landAt = clock;
            puff(c, feetX, feetY, 8, { speed: 80, up: 15 });
          } else if (ev === 'spring') {
            f.springAt = clock;
            f.spring = { col: Math.floor(feetX / TILE), row: Math.round(feetY / TILE) };
            puff(c, feetX, feetY, 14, { colors: ['#ffd400', '#ff9f1c', '#fff'], speed: 120, up: 60, life: 0.5 });
            sfx.spring();
          } else if (ev === 'dead') {
            shatter(c, { x: before.x, y: before.y });
            f.deadAt = clock;
            f.shake = 0.25;
            sfx.death();
            Object.assign(p, newPlayer(), { deaths: p.deaths + 1, jumpHeld: input.jump });
            f.spawnAt = clock;
            f.snapAt = clock + 0.35; // hold the camera on the shatter, then jump back to the start
            f.seenFallen.clear();
          } else if (ev === 'finish' && !result) {
            result = { winner: c, timeUp: false, at: clock };
            for (const v of ['w', 'b']) confetti(v, feetX, feetY - 20);
            sfx.land();
          }
          // running dust and spring trail
          if (p.onGround && Math.abs(p.vx) > RUN * 0.8 && clock - f.dustAt > 0.09) {
            f.dustAt = clock;
            puff(c, feetX - Math.sign(p.vx) * 6, feetY, 1, { speed: 20, up: 12, life: 0.35 });
          }
          if (p.springing && clock - f.dustAt > 0.03) {
            f.dustAt = clock;
            puff(c, feetX, feetY - 6, 1, { colors: ['#ffd400', '#fff'], speed: 10, up: 0, life: 0.3, size: 4 });
          }
          // crumbling blocks that just fell: debris + sound
          for (const key of Object.keys(p.crumble)) {
            const [col, row] = key.split(',').map(Number);
            if (crumbleState(p, col, row, elapsed) === 'fallen' && !f.seenFallen.has(key)) {
              f.seenFallen.add(key);
              f.falling.push({ col, row, t0: clock });
              sfx.crumble();
            }
          }
          for (const key of f.seenFallen) if (!(key in p.crumble)) f.seenFallen.delete(key);
          p.best = Math.max(p.best, p.x);
        }
        if (!result && elapsed >= TIME_LIMIT) result = { winner: raceWinner(players.w, players.b), timeUp: true, at: clock };
      };

      const frame = (now) => {
        const dt = Math.min(0.05, (now - prev) / 1000);
        prev = now;
        acc += dt;
        while (acc >= STEP) {
          clock += STEP;
          if (clock >= READY) stepRace();
          for (const c of ['w', 'b']) {
            for (const q of fx[c].particles) { q.x += q.vx * STEP; q.y += q.vy * STEP; q.vy += q.g * STEP; q.vx *= 0.98; }
            for (const s of fx[c].shards) { s.x += s.vx * STEP; s.y += s.vy * STEP; s.vy += 900 * STEP; s.rot += s.vr * STEP; }
          }
          acc -= STEP;
        }
        for (const c of ['w', 'b']) {
          const f = fx[c], p = players[c];
          const target = Math.max(0, Math.min(LEVEL_W - VW, p.x + PW / 2 - VW * 0.38 + p.facing * 50));
          if (f.snapAt && clock >= f.snapAt) { f.camX = target; f.snapAt = 0; }
          else if (!f.snapAt) f.camX += (target - f.camX) * Math.min(1, dt * 5);
          f.shake = Math.max(0, f.shake - dt);
          drawView(c);
        }
        if (result && clock - result.at > 1.4) {
          window.removeEventListener('keydown', down);
          window.removeEventListener('keyup', up);
          resolve(result.winner);
          return;
        }
        requestAnimationFrame(frame);
      };

      // ---- Drawing ----
      const drawBackground = (ctx, c, camX) => {
        const pal = PALETTES[c];
        const sky = ctx.createLinearGradient(0, 0, 0, VH);
        sky.addColorStop(0, pal.sky[0]);
        sky.addColorStop(1, pal.sky[1]);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, VW, VH);
        ctx.fillStyle = pal.sun;
        ctx.beginPath();
        ctx.arc(VW * 0.78, 60, 30, 0, Math.PI * 2);
        ctx.fill();
        // clouds drift slowly and scroll at 20%
        ctx.fillStyle = pal.cloud;
        for (let i = 0; i < 7; i++) {
          const span = VW + 200;
          const x = ((i * 260 + clock * 12 - camX * 0.2) % span + span) % span - 100;
          const y = 30 + (i * 37) % 70;
          for (const [dx, dy, r] of [[0, 0, 16], [18, -6, 20], [38, 0, 15], [20, 6, 14]]) {
            ctx.beginPath();
            ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // far mountains (30%) and near hills (55%)
        for (const [color, par, base, amp, seed] of [[pal.far, 0.3, VH * 0.62, 38, 1.3], [pal.near, 0.55, VH * 0.8, 22, 4.1]]) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(0, VH);
          for (let x = 0; x <= VW; x += 16) ctx.lineTo(x, base - Math.abs(ridge(x + camX * par, seed, amp)) - amp * 0.4);
          ctx.lineTo(VW, VH);
          ctx.fill();
        }
      };

      const drawTile = (ctx, t, col, row, c) => {
        const x = col * TILE, y = row * TILE;
        const p = players[c], f = fx[c];
        if (t === '#' || t === 'S') {
          ctx.fillStyle = '#7a5235';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#6a4529';
          for (let k = 0; k < 3; k++) ctx.fillRect(x + hash(col, row + k) * 20, y + hash(row, col + k) * 20, 3, 3);
          const above = LEVEL[row - 1]?.[col];
          if (t === '#' && above !== '#' && above !== 'S') {
            ctx.fillStyle = '#4caf50';
            ctx.fillRect(x, y, TILE, 6);
            ctx.fillStyle = '#7ed957';
            ctx.fillRect(x, y, TILE, 2);
            ctx.fillStyle = '#3d8f40';
            for (let k = 0; k < 4; k++) ctx.fillRect(x + 2 + k * 6, y + 6, 2, 2 + hash(col, k) * 3);
          }
          if (t === 'S') {
            // spring: compresses briefly after a launch
            const used = f.spring && f.spring.col === col && f.spring.row === row ? clock - f.springAt : 9;
            const squish = used < 0.25 ? Math.sin((used / 0.25) * Math.PI) * 0.6 : 0;
            const top = y - 10 + squish * 8;
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let k = 0; k <= 4; k++) ctx.lineTo(x + (k % 2 ? 18 : 6), top + 4 + ((y - top - 4) * k) / 4);
            ctx.stroke();
            ctx.fillStyle = '#e63946';
            ctx.fillRect(x + 2, top, TILE - 4, 5);
            ctx.fillStyle = '#ff8a8a';
            ctx.fillRect(x + 2, top, TILE - 4, 2);
          }
        } else if (t === 'C') {
          const st = crumbleState(p, col, row, elapsed);
          if (st === 'fallen') return;
          const jx = st === 'shaking' ? Math.sin(clock * 80 + col) * 1.5 : 0;
          ctx.fillStyle = '#a18a6a';
          ctx.fillRect(x + jx, y, TILE, TILE);
          ctx.fillStyle = '#c2ab88';
          ctx.fillRect(x + jx, y, TILE, 3);
          ctx.strokeStyle = '#5e4b33';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + jx + 0.5, y + 0.5, TILE - 1, TILE - 1);
          ctx.beginPath();
          ctx.moveTo(x + jx + 5, y + 3); ctx.lineTo(x + jx + 11, y + 12); ctx.lineTo(x + jx + 8, y + 20);
          ctx.moveTo(x + jx + 11, y + 12); ctx.lineTo(x + jx + 19, y + 15);
          ctx.stroke();
        } else if (t === '^' || t === 'v') {
          const down = t === 'v';
          for (let k = 0; k < 3; k++) {
            const sx = x + k * 8;
            const g = ctx.createLinearGradient(sx, 0, sx + 8, 0);
            g.addColorStop(0, '#f2f2f2');
            g.addColorStop(1, '#8a8f98');
            ctx.fillStyle = g;
            ctx.beginPath();
            if (down) { ctx.moveTo(sx, y); ctx.lineTo(sx + 4, y + TILE * 0.55); ctx.lineTo(sx + 8, y); }
            else { ctx.moveTo(sx, y + TILE); ctx.lineTo(sx + 4, y + TILE * 0.45); ctx.lineTo(sx + 8, y + TILE); }
            ctx.fill();
          }
        } else if (t === 'F' && LEVEL[row - 1]?.[col] !== 'F') {
          ctx.fillStyle = '#ddd';
          ctx.fillRect(x + 4, y - TILE, 3, TILE * 3);
          ctx.fillStyle = '#ffd400';
          ctx.beginPath();
          ctx.arc(x + 5.5, y - TILE, 3, 0, Math.PI * 2);
          ctx.fill();
          // waving checkered flag
          const cells = 6, cw = 4, ch = 5;
          for (let i = 0; i < cells; i++) {
            const wave = Math.sin(clock * 6 - i * 0.8) * 2;
            for (let j = 0; j < 3; j++) {
              ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
              ctx.fillRect(x + 7 + i * cw, y - TILE + 2 + j * ch + wave, cw, ch);
            }
          }
        }
      };

      const drawPlatform = (ctx, pl) => {
        const x = platformX(pl, elapsed), y = pl.row * TILE, w = pl.w * TILE;
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(x, y, w, 10);
        ctx.fillStyle = '#b07a3f';
        ctx.fillRect(x, y, w, 3);
        ctx.fillStyle = '#5c3a1a';
        for (let k = 1; k < pl.w * 2; k++) ctx.fillRect(x + k * 12, y, 1, 10);
        ctx.fillStyle = '#ccc';
        ctx.fillRect(x + 3, y + 4, 2, 2);
        ctx.fillRect(x + w - 5, y + 4, 2, 2);
      };

      const drawPiece = (ctx, c, p, alpha, f) => {
        const k = (dtSince) => Math.max(0, 1 - dtSince);
        let sx = 1, sy = 1;
        if (f) {
          const land = k((clock - f.landAt) / 0.15), jump = k((clock - f.jumpAt) / 0.15), spring = k((clock - f.springAt) / 0.3);
          sx += land * 0.3 - jump * 0.2 - spring * 0.3;
          sy += -land * 0.3 + jump * 0.25 + spring * 0.4;
          if (!p.onGround) { const v = Math.max(-1, Math.min(1, p.vy / 600)); sx -= Math.abs(v) * 0.08; sy += Math.abs(v) * 0.1; }
          const pop = (clock - f.spawnAt) / 0.3;
          if (pop < 1) { const s = Math.sin(pop * Math.PI * 0.75) / Math.sin(Math.PI * 0.75); sx *= s; sy *= s; }
        }
        const bob = p.onGround && Math.abs(p.vx) > 20 ? Math.abs(Math.sin(clock * 18)) * 2 : 0;
        ctx.save();
        ctx.globalAlpha = alpha;
        if (f) {
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.ellipse(p.x + PW / 2, p.y + PH, 9, 3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.translate(p.x + PW / 2, p.y + PH - bob);
        ctx.rotate((p.vx / RUN) * 0.12);
        ctx.scale(sx * p.facing * (facesLeft(fighters[c]) ? -1 : 1), sy);
        ctx.drawImage(sprite[c], -SPRITE / 2, -SPRITE * 0.9, SPRITE, SPRITE);
        ctx.restore();
      };

      const banner = (ctx, text, color, sub) => {
        ctx.font = 'italic 900 52px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#000';
        ctx.strokeText(text, VW / 2, VH / 2 + 4);
        ctx.fillStyle = color;
        ctx.fillText(text, VW / 2, VH / 2 + 4);
        if (sub) {
          ctx.font = 'bold 20px system-ui, sans-serif';
          ctx.lineWidth = 4;
          ctx.strokeText(sub, VW / 2, VH / 2 + 44);
          ctx.fillStyle = '#fff';
          ctx.fillText(sub, VW / 2, VH / 2 + 44);
        }
      };

      const drawHud = (ctx, c) => {
        const me = players[c], foeC = c === 'w' ? 'b' : 'w';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(6, 4, VW - 12, 26, 8);
        ctx.fill();
        ctx.drawImage(sprite[c], 10, 5, 24, 24);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${c === 'w' ? 'WHITE' : 'BLACK'} ${GLYPH[fighters[c].type]}   💀 ${me.deaths}   ★ ${Math.round(progress(me.best) * 100)}%`, 38, 17);
        const left = Math.max(0, Math.ceil(TIME_LIMIT - elapsed));
        ctx.textAlign = 'right';
        ctx.fillStyle = left <= 10 ? '#ff5a5a' : '#fff';
        ctx.fillText(`⏱ ${left}s`, VW - 14, 17);
        const bx = 270, bw = VW - 360;
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.roundRect(bx, 13, bw, 8, 4);
        ctx.fill();
        ctx.fillStyle = '#ffd400';
        ctx.fillRect(bx + bw - 2, 9, 3, 16); // finish line
        for (const pc of [foeC, c]) {
          ctx.globalAlpha = pc === c ? 1 : 0.55;
          ctx.fillStyle = pc === 'w' ? '#fff' : '#e55';
          ctx.fillRect(bx + progress(players[pc].best) * bw - 1, 8, 2, 18);
          ctx.drawImage(sprite[pc], bx + progress(players[pc].x) * bw - 9, 8, 18, 18);
          ctx.globalAlpha = 1;
        }
        if (clock < READY) banner(ctx, clock < READY * 0.6 ? 'READY…' : 'GO!', clock < READY * 0.6 ? '#fff' : '#7ed957');
        if (result) {
          const won = result.winner === c;
          banner(ctx, result.timeUp ? 'TIME!' : won ? 'FINISH!' : 'TOO SLOW!', won ? '#ffd400' : '#ff5a5a',
            result.timeUp ? (won ? 'You win on progress' : 'Your rival got further') : won ? 'You win!' : null);
        }
      };

      const drawView = (c) => {
        const ctx = views[c], f = fx[c], me = players[c], foeC = c === 'w' ? 'b' : 'w';
        const camX = f.camX;
        drawBackground(ctx, c, camX);
        ctx.save();
        const shake = f.shake > 0 ? f.shake * 24 : 0;
        ctx.translate(-Math.round(camX) + (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        const c0 = Math.max(0, Math.floor(camX / TILE) - 1), c1 = Math.min(LEVEL[0].length - 1, c0 + Math.ceil(VW / TILE) + 2);
        for (let r = 0; r < ROWS; r++) for (let col = c0; col <= c1; col++) {
          const t = LEVEL[r][col];
          if (t !== ' ') drawTile(ctx, t, col, r, c);
        }
        for (const pl of PLATFORMS) drawPlatform(ctx, pl);
        // falling crumble blocks
        for (let i = f.falling.length - 1; i >= 0; i--) {
          const b = f.falling[i], age = clock - b.t0;
          if (age > 0.8) { f.falling.splice(i, 1); continue; }
          ctx.globalAlpha = 1 - age / 0.8;
          ctx.fillStyle = '#a18a6a';
          ctx.save();
          ctx.translate(b.col * TILE + TILE / 2, b.row * TILE + TILE / 2 + 450 * age * age);
          ctx.rotate(age * 3 * (b.col % 2 ? 1 : -1));
          ctx.fillRect(-TILE / 2, -TILE / 2, TILE, TILE);
          ctx.restore();
          ctx.globalAlpha = 1;
        }
        drawPiece(ctx, foeC, players[foeC], 0.3, null);
        if (clock - f.deadAt > 0.05 || f.deadAt < 0) drawPiece(ctx, c, me, 1, f);
        // death shards: pieces of the sprite flying apart
        const img = sprite[c];
        for (let i = f.shards.length - 1; i >= 0; i--) {
          const s = f.shards[i], age = clock - s.t0;
          if (age > 0.9) { f.shards.splice(i, 1); continue; }
          const src = img.width / s.n;
          ctx.save();
          ctx.globalAlpha = 1 - age / 0.9;
          ctx.translate(s.x, s.y);
          ctx.rotate(s.rot);
          ctx.drawImage(img, s.i * src, s.j * src, src, src, -4, -4, 8, 8);
          ctx.restore();
        }
        for (let i = f.particles.length - 1; i >= 0; i--) {
          const q = f.particles[i], k = (clock - q.t0) / q.life;
          if (k >= 1) { f.particles.splice(i, 1); continue; }
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = q.color;
          ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        const since = clock - f.deadAt;
        if (since < 0.3) {
          ctx.fillStyle = `rgba(255,0,0,${0.4 * (1 - since / 0.3)})`;
          ctx.fillRect(0, 0, VW, VH);
        }
        drawHud(ctx, c);
      };

      requestAnimationFrame(frame);
    });
  },
};
