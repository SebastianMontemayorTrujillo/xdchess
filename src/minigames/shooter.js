const W = 640, H = 420;
const R = 16, SPEED = 220;            // player radius, px/s
const BULLET_R = 5, BULLET_SPEED = 420;
const COOLDOWN = 300, MAX_HP = 3;
const CONTROLS = {
  w: { up: 'w', left: 'a', down: 's', right: 'd', fire: 'x' },
  b: { up: 'i', left: 'j', down: 'k', right: 'l', fire: 'm' },
};
const GAME_KEYS = new Set(Object.values(CONTROLS).flatMap(Object.values));
// Computer shooter: re-decides every `reaction` ms, dodges bullets it sees coming,
// otherwise keeps `range` px from the opponent while strafing.
const BOT = { reaction: 140, range: 260, lookahead: 0.6, dodgeMargin: 12, fireChance: 0.6, strafeSwitch: 1.2 };

export default {
  id: 'shooter',
  name: 'Water Gun',
  run(container, { ai = null } = {}) {
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

      // Computer input: same actions as the keyboard (up/down/left/right/fire).
      const bot = { input: {}, nextDecision: 0, strafe: 1, strafeUntil: 0 };
      const decide = (now) => {
        const me = players[ai];
        const foe = players[ai === 'w' ? 'b' : 'w'];
        let mx = 0, my = 0;

        // Dodge the incoming bullet that will pass closest soonest.
        let threat = null;
        for (const b of bullets) {
          if (b.owner === ai) continue;
          const dx = me.x - b.x, dy = me.y - b.y;
          const t = (dx * b.vx + dy * b.vy) / (BULLET_SPEED * BULLET_SPEED); // time to closest approach
          if (t <= 0 || t > BOT.lookahead) continue;
          const miss = Math.hypot(dx - b.vx * t, dy - b.vy * t);
          if (miss < R + BULLET_R + BOT.dodgeMargin && (!threat || t < threat.t)) threat = { b, t };
        }
        if (threat) {
          const { b } = threat;
          // Step perpendicular to the bullet, toward the side we're already on.
          const side = Math.sign((me.x - b.x) * b.vy - (me.y - b.y) * b.vx) || 1;
          mx = (b.vy / BULLET_SPEED) * side;
          my = (-b.vx / BULLET_SPEED) * side;
          const nx = me.x + mx * 40, ny = me.y + my * 40;
          if (nx < R || nx > W - R || ny < R || ny > H - R) { mx = -mx; my = -my; }
        } else {
          // Hold range and strafe around the opponent.
          const dx = foe.x - me.x, dy = foe.y - me.y;
          const dist = Math.hypot(dx, dy) || 1;
          const toward = dist > BOT.range + 40 ? 1 : dist < BOT.range - 40 ? -1 : 0;
          if (now > bot.strafeUntil) {
            bot.strafe = Math.random() < 0.5 ? -1 : 1;
            bot.strafeUntil = now + BOT.strafeSwitch * 1000 * (0.5 + Math.random());
          }
          mx = (dx / dist) * toward + (-dy / dist) * bot.strafe;
          my = (dy / dist) * toward + (dx / dist) * bot.strafe;
          if (me.y < R + 20 || me.y > H - R - 20 || me.x < R + 20 || me.x > W - R - 20) bot.strafe = -bot.strafe;
        }
        bot.input = {
          left: mx < -0.3, right: mx > 0.3, up: my < -0.3, down: my > 0.3,
          fire: Math.random() < BOT.fireChance,
        };
      };
      const pressed = (c, action) => (c === ai ? bot.input[action] : keys.has(CONTROLS[c][action]));

      const frame = (now) => {
        const dt = Math.min(0.05, (now - prev) / 1000);
        prev = now;
        if (ai && now >= bot.nextDecision) {
          decide(now);
          bot.nextDecision = now + BOT.reaction;
        }

        for (const c of ['w', 'b']) {
          const p = players[c];
          if (pressed(c, 'up')) p.y -= SPEED * dt;
          if (pressed(c, 'down')) p.y += SPEED * dt;
          if (pressed(c, 'left')) p.x -= SPEED * dt;
          if (pressed(c, 'right')) p.x += SPEED * dt;
          p.x = Math.max(R, Math.min(W - R, p.x));
          p.y = Math.max(R, Math.min(H - R, p.y));
          if (pressed(c, 'fire')) fire(c, now);
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
