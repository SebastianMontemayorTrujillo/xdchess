import { GLYPH } from '../board.js';
import { sfx } from '../audio.js';
import { loadAssets, pieceSprite, facesLeft, silhouette } from '../assets.js';
import {
  W, H, R, CRATE, CRATE_HP, MAX_HP, ZONE_WAIT, ZONE_SHRINK, TIME_CAP,
  createState, step, zoneRadius, inZone,
} from './shooter-logic.js';

const STEP = 1 / 120;
const COUNTDOWN = 1.5; // 3·2·1 before the fight; "SPLASH!" shows briefly after
const SPRITE = 54, GUN = 30;
const CONTROLS = {
  w: { up: 'w', left: 'a', down: 's', right: 'd', fire: 'x' },
  b: { up: 'i', left: 'j', down: 'k', right: 'l', fire: 'm' },
};
const GAME_KEYS = new Set(Object.values(CONTROLS).flatMap(Object.values));
const WATER = ['#bfe9ff', '#7fd4ff', '#4fb8f0', '#ffffff'];

function tinted(img, size, color) {
  const c = silhouette(img, size);
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  return c;
}

export default {
  id: 'shooter',
  name: 'Water Gun',
  async run(container, fighters) {
    container.innerHTML = `
      <div class="big">💦 Water Gun</div>
      <div>White: W/A/S/D move, X shoot · Black: I/J/K/L move, M shoot — shots auto-aim at your rival</div>
      <div>Hide behind crates (they break after ${CRATE_HP} hits) · Stay inside the zone or you dry out!</div>
      <canvas class="arena" width="${W}" height="${H}"></canvas>`;
    const ctx = container.querySelector('canvas').getContext('2d');
    const assets = await loadAssets();
    const sprite = { w: pieceSprite(assets, fighters.w), b: pieceSprite(assets, fighters.b) };
    const flash = { w: silhouette(sprite.w, SPRITE), b: silhouette(sprite.b, SPRITE) };
    const redTint = { w: tinted(sprite.w, SPRITE, '#ff3030'), b: tinted(sprite.b, SPRITE, '#ff3030') };

    return new Promise((resolve) => {
      const state = createState();
      const fx = { w: { recoilAt: -9, hitAt: -9, hurtAt: -9 }, b: { recoilAt: -9, hitAt: -9, hurtAt: -9 } };
      const crateHitAt = new Map();
      const particles = [], puddles = [], popups = [], debris = [];
      const keys = new Set(), pressed = new Set();
      let clock = 0, hitStop = 0, shake = 0, result = null;
      let prev = performance.now(), acc = 0;

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
          up: keys.has(k.up), down: keys.has(k.down), left: keys.has(k.left), right: keys.has(k.right),
          fire: keys.has(k.fire) || pressed.has(k.fire), // taps between frames still fire
        };
      };

      const burst = (x, y, n, { speed = 160, colors = WATER, size = 4, life = 0.4, angle = null, spread = Math.PI * 2 } = {}) => {
        for (let i = 0; i < n; i++) {
          const a = angle === null ? Math.random() * Math.PI * 2 : angle + (Math.random() - 0.5) * spread;
          const v = speed * (0.4 + Math.random() * 0.8);
          particles.push({
            x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: clock, life: life * (0.6 + Math.random() * 0.6),
            color: colors[(Math.random() * colors.length) | 0], size: size * (0.6 + Math.random() * 0.8),
          });
        }
      };

      const handle = (ev) => {
        switch (ev.type) {
          case 'fire': {
            const p = state.players[ev.c];
            fx[ev.c].recoilAt = clock;
            burst(p.x + Math.cos(ev.angle) * (R + 16), p.y + Math.sin(ev.angle) * (R + 16), 5, { angle: ev.angle, spread: 0.8, speed: 120, life: 0.2, size: 3 });
            sfx.whoosh();
            break;
          }
          case 'hit':
            fx[ev.c].hitAt = clock;
            burst(ev.x, ev.y, 18, { angle: ev.angle, spread: 1.6, speed: 220 });
            puddles.push({ x: ev.x, y: ev.y, r: 14 + Math.random() * 8, t0: clock });
            popups.push({ img: assets.splash, x: ev.x, y: ev.y, t0: clock, dur: 0.4, size: 46 });
            hitStop = 0.06;
            shake = 0.12;
            sfx.hit();
            sfx.splash();
            break;
          case 'crateHit':
            crateHitAt.set(ev.crate.id, clock);
            burst(ev.x, ev.y, 8, { speed: 120, life: 0.25, size: 3 });
            puddles.push({ x: ev.x, y: ev.y, r: 8 + Math.random() * 6, t0: clock });
            sfx.splash();
            break;
          case 'crateBreak':
            for (let i = 0; i < 14; i++) {
              const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 180;
              debris.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, t0: clock, w: 6 + Math.random() * 10, h: 4 + Math.random() * 4 });
            }
            shake = 0.15;
            sfx.crateBreak();
            break;
          case 'zoneHurt':
            fx[ev.c].hurtAt = clock;
            popups.push({ text: '-1 🔥', x: ev.x, y: ev.y - 30, t0: clock, dur: 0.8 });
            sfx.zoneHurt();
            break;
          case 'ko':
          case 'timeUp':
            result = { winner: ev.winner, reason: ev.type, at: clock };
            if (ev.type === 'ko') {
              const lp = state.players[ev.loser];
              burst(lp.x, lp.y, 40, { speed: 280, life: 0.7, size: 5 });
              hitStop = 0.25;
              shake = 0.45;
            }
            break;
        }
      };

      const update = (dt) => {
        clock += dt;
        for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; }
        for (const d of debris) { d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 0.92; d.vy *= 0.92; d.rot += d.vr * dt; d.vr *= 0.95; }
        if (clock < COUNTDOWN || result) { pressed.clear(); return; }
        if (hitStop > 0) { hitStop -= dt; return; }
        const evs = step(state, { w: inputFor('w'), b: inputFor('b') }, dt);
        pressed.clear();
        evs.forEach(handle);
      };

      const frame = (now) => {
        let dt = Math.min(0.05, (now - prev) / 1000);
        prev = now;
        if (result && result.reason === 'ko') dt *= 0.35;
        acc += dt;
        while (acc >= STEP) { update(STEP); acc -= STEP; }
        shake = Math.max(0, shake - dt);
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
      const drawGround = () => {
        for (let i = 0; i < W / 40; i++) {
          ctx.fillStyle = i % 2 ? '#5fae4b' : '#57a443';
          ctx.fillRect(i * 40, 0, 40, H);
        }
        ctx.fillStyle = 'rgba(30,80,20,0.25)';
        for (let i = 0; i < 160; i++) ctx.fillRect((i * 97) % W, (i * 211) % H, 2, 5);
        // hedge border
        ctx.fillStyle = '#2f6b2a';
        for (let x = 0; x <= W; x += 22) {
          for (const y of [0, H]) { ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill(); }
        }
        for (let y = 0; y <= H; y += 22) {
          for (const x of [0, W]) { ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill(); }
        }
      };

      const drawPuddles = () => {
        for (let i = puddles.length - 1; i >= 0; i--) {
          const p = puddles[i];
          const k = (clock - p.t0) / 4;
          if (k >= 1) { puddles.splice(i, 1); continue; }
          ctx.fillStyle = `rgba(80,170,230,${0.45 * (1 - k)})`;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.r * (1 + k * 0.4), p.r * 0.7 * (1 + k * 0.4), 0, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      const drawZone = () => {
        const r = zoneRadius(state.time);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2, true);
        ctx.fillStyle = `rgba(255,140,30,${0.28 + Math.sin(clock * 3) * 0.04})`;
        ctx.fill('evenodd');
        ctx.setLineDash([14, 10]);
        ctx.lineDashOffset = -clock * 40;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255,240,200,0.9)';
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      };

      const drawCrates = () => {
        for (const c of state.crates) {
          const since = clock - (crateHitAt.get(c.id) ?? -9);
          const jig = since < 0.15 ? Math.sin(since * 120) * 3 : 0;
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.beginPath();
          ctx.ellipse(c.x + 4, c.y + CRATE / 2 - 2, CRATE * 0.55, CRATE * 0.18, 0, 0, Math.PI * 2);
          ctx.fill();
          const s = CRATE * 1.18;
          ctx.drawImage(assets.crate, c.x - s / 2 + jig, c.y - s / 2, s, s);
          // cracks grow as the crate takes water damage
          ctx.strokeStyle = 'rgba(60,30,10,0.8)';
          ctx.lineWidth = 2;
          for (let i = 0; i < CRATE_HP - c.hp; i++) {
            const a = (c.id * 1.3 + i * 2.1) % (Math.PI * 2);
            ctx.beginPath();
            ctx.moveTo(c.x + jig, c.y);
            ctx.lineTo(c.x + jig + Math.cos(a) * 18, c.y + Math.sin(a) * 18);
            ctx.lineTo(c.x + jig + Math.cos(a + 0.5) * 26, c.y + Math.sin(a + 0.5) * 26);
            ctx.stroke();
          }
        }
        for (let i = debris.length - 1; i >= 0; i--) {
          const d = debris[i];
          const k = (clock - d.t0) / 1.2;
          if (k >= 1) { debris.splice(i, 1); continue; }
          ctx.save();
          ctx.globalAlpha = 1 - k;
          ctx.translate(d.x, d.y);
          ctx.rotate(d.rot);
          ctx.fillStyle = '#c8894d';
          ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
          ctx.restore();
        }
      };

      const drawPlayer = (c) => {
        const p = state.players[c], foe = state.players[c === 'w' ? 'b' : 'w'];
        const f = fx[c];
        const aim = Math.atan2(foe.y - p.y, foe.x - p.x);
        const bob = p.moving ? Math.abs(Math.sin(clock * 14)) * 4 : Math.sin(clock * 3) * 1.2;
        const recoil = Math.max(0, 1 - (clock - f.recoilAt) / 0.12);
        const facing = Math.cos(aim) >= 0 ? 1 : -1;
        const out = !inZone(p, state.time) && !result;
        const dead = result && result.reason === 'ko' && p.hp === 0;

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + R - 2, R, R * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(p.x, p.y - bob);
        if (dead) { ctx.rotate(Math.min(1, (clock - result.at) / 0.5) * Math.PI / 2 * facing); ctx.globalAlpha = 0.85; }
        ctx.save();
        ctx.scale(facing * (facesLeft(fighters[c]) ? -1 : 1), 1);
        const sq = 1 + recoil * 0.08;
        ctx.scale(sq, 2 - sq);
        const img = clock - f.hitAt < 0.1 ? flash[c]
          : out && Math.sin(clock * 12) > 0 ? redTint[c]
          : clock - f.hurtAt < 0.15 ? redTint[c] : sprite[c];
        ctx.drawImage(img, -SPRITE / 2, -SPRITE * 0.62, SPRITE, SPRITE);
        ctx.restore();
        if (!dead) {
          // water gun, auto-aimed at the rival
          ctx.save();
          ctx.rotate(aim);
          ctx.translate(R + 6 - recoil * 7, 6);
          if (facing < 0) ctx.scale(1, -1);
          ctx.scale(-1, 1); // the Twemoji water gun points left
          ctx.drawImage(assets.watergun, -GUN / 2, -GUN / 2, GUN, GUN);
          ctx.restore();
        }
        ctx.restore();

        if (out) {
          // arrow toward the safe centre
          const a = Math.atan2(H / 2 - p.y, W / 2 - p.x);
          ctx.save();
          ctx.translate(p.x + Math.cos(a) * 40, p.y + Math.sin(a) * 40);
          ctx.rotate(a);
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(10, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      };

      const drawBullets = () => {
        for (const b of state.bullets) {
          const s = Math.hypot(b.vx, b.vy);
          const tx = b.x - (b.vx / s) * 22, ty = b.y - (b.vy / s) * 22;
          const g = ctx.createLinearGradient(tx, ty, b.x, b.y);
          g.addColorStop(0, 'rgba(127,212,255,0)');
          g.addColorStop(1, 'rgba(127,212,255,0.8)');
          ctx.strokeStyle = g;
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.fillStyle = '#4fb8f0';
          ctx.beginPath();
          ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(b.x - 2, b.y - 2, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      const drawEffects = () => {
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          const k = (clock - p.t0) / p.life;
          if (k >= 1) { particles.splice(i, 1); continue; }
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = popups.length - 1; i >= 0; i--) {
          const e = popups[i];
          const k = (clock - e.t0) / e.dur;
          if (k >= 1) { popups.splice(i, 1); continue; }
          ctx.globalAlpha = 1 - k;
          if (e.img) {
            const s = e.size * (0.6 + k * 0.8);
            ctx.drawImage(e.img, e.x - s / 2, e.y - s / 2, s, s);
          } else {
            ctx.font = 'bold 18px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffdddd';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.strokeText(e.text, e.x, e.y - k * 20);
            ctx.fillText(e.text, e.x, e.y - k * 20);
          }
        }
        ctx.globalAlpha = 1;
      };

      const banner = (text, color, size = 72) => {
        ctx.font = `italic 900 ${size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#000';
        ctx.strokeText(text, W / 2, H / 2);
        ctx.fillStyle = color;
        ctx.fillText(text, W / 2, H / 2);
      };

      const drawHud = () => {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, 40);
        for (const c of ['w', 'b']) {
          const left = c === 'w';
          ctx.font = 'bold 15px system-ui, sans-serif';
          ctx.textBaseline = 'middle';
          ctx.textAlign = left ? 'left' : 'right';
          ctx.fillStyle = '#fff';
          ctx.fillText(`${left ? 'WHITE' : 'BLACK'} ${GLYPH[fighters[c].type]}`, left ? 12 : W - 12, 20);
          for (let i = 0; i < MAX_HP; i++) {
            const x = left ? 110 + i * 26 : W - 110 - (i + 1) * 26;
            ctx.globalAlpha = i < state.players[c].hp ? 1 : 0.2;
            ctx.drawImage(assets.heart, x, 8, 24, 24);
          }
          ctx.globalAlpha = 1;
        }
        const t = state.time;
        const zoneText = t < ZONE_WAIT ? `Zone shrinks in ${Math.ceil(ZONE_WAIT - t)}`
          : t < ZONE_WAIT + ZONE_SHRINK ? 'Zone closing!' : 'Final zone';
        ctx.textAlign = 'center';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillStyle = t >= ZONE_WAIT ? '#ffb347' : '#fff';
        ctx.fillText(zoneText, W / 2, 13);
        ctx.fillStyle = '#ddd';
        ctx.fillText(`⏱ ${Math.max(0, Math.ceil(TIME_CAP - t))}`, W / 2, 29);

        if (clock < COUNTDOWN) banner(String(3 - Math.floor((clock / COUNTDOWN) * 3)), '#fff', 96);
        else if (clock < COUNTDOWN + 0.6) banner('SPLASH!', '#7fd4ff');
        if (result) banner(result.reason === 'ko' ? 'SOAKED!' : 'TIME!', '#4fb8f0');
      };

      const draw = () => {
        ctx.save();
        if (shake > 0) ctx.translate((Math.random() - 0.5) * 70 * shake, (Math.random() - 0.5) * 50 * shake);
        drawGround();
        drawPuddles();
        drawZone();
        drawCrates();
        const order = state.players.w.y <= state.players.b.y ? ['w', 'b'] : ['b', 'w'];
        for (const c of order) drawPlayer(c);
        drawBullets();
        drawEffects();
        ctx.restore();
        drawHud();
      };

      requestAnimationFrame(frame);
    });
  },
};
