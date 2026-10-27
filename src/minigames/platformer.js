import { GLYPH } from '../board.js';
import { sfx } from '../audio.js';
import { TILE, PW, PH, STEP, LEVEL, SPAWN, newPlayer, stepPlayer, raceWinner } from './platformer-physics.js';

const VW = 800, VH = LEVEL.length * TILE;
const LEVEL_W = LEVEL[0].length * TILE;
const CONTROLS = {
  w: { left: 'a', right: 'd', jump: 'w' },
  b: { left: 'j', right: 'l', jump: 'i' },
};
const GAME_KEYS = new Set(Object.values(CONTROLS).flatMap(Object.values));
const READY_MS = 1500;
const TIME_LIMIT = 40; // seconds; then the furthest best progress wins
const finishCol = LEVEL[LEVEL.length - 3].indexOf('F');
const progress = (x) => Math.max(0, Math.min(1, (x - SPAWN.x) / (finishCol * TILE - SPAWN.x)));

export default {
  id: 'platformer',
  name: 'Platform Race',
  run(container, fighters) {
    return new Promise((resolve) => {
      container.innerHTML = `
        <div class="big">🏁 Platform Race</div>
        <div>White: A/D move, W jump · Black: J/L move, I jump</div>
        <div>Reach the flag, or be furthest after ${TIME_LIMIT}s. Dying restarts you, but your best progress counts.</div>
        <div class="platformer">
          <canvas id="pf-w" width="${VW}" height="${VH}"></canvas>
          <canvas id="pf-b" width="${VW}" height="${VH}"></canvas>
        </div>`;
      const views = {
        w: container.querySelector('#pf-w').getContext('2d'),
        b: container.querySelector('#pf-b').getContext('2d'),
      };
      const players = {
        w: { ...newPlayer(), deaths: 0, deadAt: -Infinity, best: SPAWN.x },
        b: { ...newPlayer(), deaths: 0, deadAt: -Infinity, best: SPAWN.x },
      };
      const keys = new Set();
      const down = (e) => {
        const k = e.key.toLowerCase();
        if (GAME_KEYS.has(k)) e.preventDefault();
        keys.add(k);
      };
      const up = (e) => keys.delete(e.key.toLowerCase());
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);

      const startAt = performance.now();
      let prev = startAt;
      let acc = 0;
      let winner = null;
      let timeUp = false;
      let elapsed = 0; // race seconds, counted in physics steps

      const frame = (now) => {
        acc += Math.min(0.05, (now - prev) / 1000);
        prev = now;
        const racing = now - startAt >= READY_MS;
        while (racing && acc >= STEP && !winner) {
          acc -= STEP;
          elapsed += STEP;
          for (const c of ['w', 'b']) {
            const ctl = CONTROLS[c];
            const input = { left: keys.has(ctl.left), right: keys.has(ctl.right), jump: keys.has(ctl.jump) };
            const ev = stepPlayer(players[c], input, STEP, LEVEL);
            if (ev === 'jump') sfx.jump();
            else if (ev === 'dead') {
              sfx.death();
              Object.assign(players[c], newPlayer(), { deaths: players[c].deaths + 1, deadAt: now, jumpHeld: input.jump });
            } else if (ev === 'finish') winner = c;
            players[c].best = Math.max(players[c].best, players[c].x);
          }
          if (!winner && elapsed >= TIME_LIMIT) {
            winner = raceWinner(players.w, players.b);
            timeUp = true;
          }
        }
        if (!racing) acc = 0;
        for (const c of ['w', 'b']) drawView(c, now, racing);
        if (winner) {
          window.removeEventListener('keydown', down);
          window.removeEventListener('keyup', up);
          setTimeout(() => resolve(winner), 600);
          return;
        }
        requestAnimationFrame(frame);
      };

      const drawPlayer = (ctx, c, p, alpha) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x + PW / 2, p.y + PH / 2);
        ctx.scale(p.facing, 1);
        ctx.font = '28px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = c === 'w' ? 3 : 1.5;
        ctx.strokeStyle = c === 'w' ? '#000' : '#ddd';
        ctx.fillStyle = c === 'w' ? '#fff' : '#111';
        if (c === 'b') {
          // Light disc so the dark piece stays visible on dark backgrounds.
          ctx.save();
          ctx.fillStyle = '#d8d8d8';
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        const g = GLYPH[fighters[c].type];
        ctx.strokeText(g, 0, 0);
        ctx.fillText(g, 0, 0);
        ctx.restore();
      };

      const drawView = (c, now, racing) => {
        const ctx = views[c];
        const me = players[c];
        const foeC = c === 'w' ? 'b' : 'w';
        const camX = Math.max(0, Math.min(LEVEL_W - VW, me.x - VW / 3));

        const sky = ctx.createLinearGradient(0, 0, 0, VH);
        sky.addColorStop(0, c === 'w' ? '#2b5876' : '#4e2b5e');
        sky.addColorStop(1, '#0b141b');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, VW, VH);

        ctx.save();
        ctx.translate(-Math.round(camX), 0);
        const c0 = Math.floor(camX / TILE), c1 = Math.min(LEVEL[0].length - 1, c0 + Math.ceil(VW / TILE) + 1);
        for (let r = 0; r < LEVEL.length; r++) {
          for (let col = c0; col <= c1; col++) {
            const t = LEVEL[r][col], x = col * TILE, y = r * TILE;
            if (t === '#') {
              ctx.fillStyle = '#5b4636';
              ctx.fillRect(x, y, TILE, TILE);
              if (LEVEL[r - 1]?.[col] !== '#') {
                ctx.fillStyle = '#4caf50';
                ctx.fillRect(x, y, TILE, 5);
              }
              ctx.strokeStyle = '#3e2f24';
              ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
            } else if (t === '^' || t === 'v') {
              ctx.fillStyle = '#ddd';
              ctx.beginPath();
              for (let i = 0; i < 2; i++) {
                const sx = x + i * (TILE / 2);
                if (t === '^') {
                  ctx.moveTo(sx, y + TILE); ctx.lineTo(sx + TILE / 4, y + TILE / 2); ctx.lineTo(sx + TILE / 2, y + TILE);
                } else {
                  ctx.moveTo(sx, y); ctx.lineTo(sx + TILE / 4, y + TILE / 2); ctx.lineTo(sx + TILE / 2, y);
                }
              }
              ctx.fill();
            } else if (t === 'F' && LEVEL[r - 1]?.[col] !== 'F') {
              ctx.fillStyle = '#ccc';
              ctx.fillRect(x + 4, y - TILE, 3, TILE * 3);
              ctx.fillStyle = (Math.floor(now / 250) % 2) ? '#ffd700' : '#ff5a5a';
              ctx.beginPath();
              ctx.moveTo(x + 7, y - TILE); ctx.lineTo(x + 22, y - TILE + 7); ctx.lineTo(x + 7, y - TILE + 14);
              ctx.fill();
            }
          }
        }
        drawPlayer(ctx, foeC, players[foeC], 0.3);
        drawPlayer(ctx, c, me, 1);
        ctx.restore();

        // Death flash
        const since = now - me.deadAt;
        if (since < 300) {
          ctx.fillStyle = `rgba(255,0,0,${0.5 * (1 - since / 300)})`;
          ctx.fillRect(0, 0, VW, VH);
        }
        // HUD: label, deaths, progress bar with both players
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, VW, 26);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const bestPct = Math.round(progress(me.best) * 100);
        ctx.fillText(`${c === 'w' ? 'WHITE' : 'BLACK'} ${GLYPH[fighters[c].type]}   💀 ${me.deaths}   ★ ${bestPct}%`, 8, 13);
        const left = Math.max(0, Math.ceil(TIME_LIMIT - elapsed));
        ctx.textAlign = 'right';
        ctx.fillStyle = left <= 10 ? '#ff5a5a' : '#fff';
        ctx.fillText(`⏱ ${left}s`, VW - 8, 13);
        const bx = 250, bw = VW - 330;
        ctx.fillStyle = '#333';
        ctx.fillRect(bx, 9, bw, 8);
        for (const pc of [foeC, c]) {
          const color = pc === 'w' ? '#fff' : '#e55';
          ctx.globalAlpha = pc === c ? 1 : 0.6;
          // best-progress tick (thin) and live position (thick)
          ctx.fillStyle = color;
          ctx.fillRect(bx + progress(players[pc].best) * bw - 1, 3, 2, 20);
          ctx.fillRect(bx + progress(players[pc].x) * bw - 3, 6, 6, 14);
          ctx.globalAlpha = 1;
        }
        if (!racing) {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 48px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(now - startAt < READY_MS * 0.66 ? 'READY…' : 'GO!', VW / 2, VH / 2);
        }
        if (winner) {
          ctx.fillStyle = '#ffd700';
          ctx.font = 'bold 48px system-ui, sans-serif';
          ctx.textAlign = 'center';
          const msg = winner === c ? 'YOU WIN!' : 'TOO SLOW!';
          ctx.fillText(timeUp ? `TIME! ${winner === c ? 'You win on progress' : 'Too slow'}` : msg, VW / 2, VH / 2);
        }
      };

      requestAnimationFrame(frame);
    });
  },
};
