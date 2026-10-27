const W = 640, H = 420;
const R = 16, SPEED = 220;            // player radius, px/s
const BULLET_R = 5, BULLET_SPEED = 420;
const COOLDOWN = 300, MAX_HP = 3;
const CONTROLS = {
  w: { up: 'w', left: 'a', down: 's', right: 'd', fire: 'x' },
  b: { up: 'i', left: 'j', down: 'k', right: 'l', fire: 'm' },
};
const GAME_KEYS = new Set(Object.values(CONTROLS).flatMap(Object.values));

export default {
  id: 'shooter',
  name: 'Water Gun',
  run(container) {
    return new Promise((resolve) => {
      container.innerHTML = `
        <div class="big">💦 Water Gun</div>
        <div>White: W/A/S/D move, X shoot · Black: I/J/K/L move, M shoot</div>
        <canvas width="${W}" height="${H}"></canvas>`;
      const ctx = container.querySelector('canvas').getContext('2d');
      const players = {
        w: { x: 80, y: H / 2, hp: MAX_HP, last: -Infinity, color: '#f5f5f5' },
        b: { x: W - 80, y: H / 2, hp: MAX_HP, last: -Infinity, color: '#ff5a5a' },
      };
      const bullets = [];
      const keys = new Set();
      let prev = performance.now();
      let raf;

      const down = (e) => {
        const k = e.key.toLowerCase();
        if (GAME_KEYS.has(k)) e.preventDefault();
        keys.add(k);
      };
      const up = (e) => keys.delete(e.key.toLowerCase());
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);

      const fire = (c, now) => {
        const me = players[c];
        const foe = players[c === 'w' ? 'b' : 'w'];
        if (now - me.last < COOLDOWN) return;
        // Aim at the opponent's position at the instant of firing.
        const dx = foe.x - me.x, dy = foe.y - me.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;
        me.last = now;
        bullets.push({
          owner: c,
          x: me.x + (dx / dist) * (R + BULLET_R),
          y: me.y + (dy / dist) * (R + BULLET_R),
          vx: (dx / dist) * BULLET_SPEED,
          vy: (dy / dist) * BULLET_SPEED,
        });
      };

      const frame = (now) => {
        const dt = Math.min(0.05, (now - prev) / 1000);
        prev = now;

        for (const c of ['w', 'b']) {
          const p = players[c], ctl = CONTROLS[c];
          if (keys.has(ctl.up)) p.y -= SPEED * dt;
          if (keys.has(ctl.down)) p.y += SPEED * dt;
          if (keys.has(ctl.left)) p.x -= SPEED * dt;
          if (keys.has(ctl.right)) p.x += SPEED * dt;
          p.x = Math.max(R, Math.min(W - R, p.x));
          p.y = Math.max(R, Math.min(H - R, p.y));
          if (keys.has(ctl.fire)) fire(c, now);
        }

        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          const target = players[b.owner === 'w' ? 'b' : 'w'];
          if (Math.hypot(b.x - target.x, b.y - target.y) < R + BULLET_R) {
            target.hp--;
            bullets.splice(i, 1);
          } else if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) {
            bullets.splice(i, 1);
          }
        }

        draw();
        const loser = ['w', 'b'].find((c) => players[c].hp <= 0);
        if (loser) {
          window.removeEventListener('keydown', down);
          window.removeEventListener('keyup', up);
          setTimeout(() => resolve(loser === 'w' ? 'b' : 'w'), 400);
          return;
        }
        raf = requestAnimationFrame(frame);
      };

      const draw = () => {
        ctx.clearRect(0, 0, W, H);
        for (const b of bullets) {
          ctx.fillStyle = '#7fd4ff';
          ctx.beginPath();
          ctx.arc(b.x, b.y, BULLET_R, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const c of ['w', 'b']) {
          const p = players[c];
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
          ctx.fill();
          for (let i = 0; i < MAX_HP; i++) {
            ctx.fillStyle = i < p.hp ? '#4f4' : '#555';
            ctx.fillRect(p.x - 15 + i * 11, p.y - R - 12, 9, 5);
          }
        }
      };

      raf = requestAnimationFrame(frame);
    });
  },
};
