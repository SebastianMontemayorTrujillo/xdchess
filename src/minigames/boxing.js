import { pieceHTML, DEFAULT_PIECES } from '../pieces.js';
import { playSfx } from '../audio.js';

const MAX_HP = 10;
const COOLDOWN = 150; // ms between punches
const KEYS = {
  x: ['w', 'punch'], s: ['w', 'block'],
  m: ['b', 'punch'], k: ['b', 'block'],
};
// Computer boxer: punches every 170–300 ms and sometimes blocks right after being hit.
const BOT = { tick: 40, punchMin: 170, punchMax: 300, blockChance: 0.3, blockMin: 200, blockMax: 450 };

const rand = (a, b) => a + Math.random() * (b - a);

export default {
  id: 'boxing',
  name: 'Boxing',
  run(container, { ai = null, pieces = DEFAULT_PIECES } = {}) {
    return new Promise((resolve) => {
      container.innerHTML = `
        <div class="big">🥊 Boxing</div>
        <div>White: X punch, hold S block · Black: M punch, hold K block</div>
        <div class="boxers">
          <div class="boxer" id="bx-w">${pieceHTML('w', pieces.w)}<div class="hpbar"><div style="background:#eee"></div></div></div>
          <div class="boxer" id="bx-b">${pieceHTML('b', pieces.b)}<div class="hpbar"><div style="background:#e55"></div></div></div>
        </div>`;
      const p = {
        w: { hp: MAX_HP, blocking: false, last: 0, hitAt: 0, el: container.querySelector('#bx-w') },
        b: { hp: MAX_HP, blocking: false, last: 0, hitAt: 0, el: container.querySelector('#bx-b') },
      };
      let finished = false;
      let botTimer;
      const draw = () => {
        for (const c of ['w', 'b']) {
          p[c].el.querySelector('.hpbar > div').style.width = `${(p[c].hp / MAX_HP) * 100}%`;
          p[c].el.classList.toggle('block', p[c].blocking);
        }
      };
      const done = (winner) => {
        finished = true;
        clearInterval(botTimer);
        window.removeEventListener('keydown', down);
        window.removeEventListener('keyup', up);
        setTimeout(() => resolve(winner), 400);
      };
      const punch = (c) => {
        const me = p[c];
        const foe = p[c === 'w' ? 'b' : 'w'];
        if (finished || me.blocking || performance.now() - me.last < COOLDOWN) return;
        me.last = performance.now();
        me.el.classList.add('punch');
        setTimeout(() => me.el.classList.remove('punch'), 80);
        if (foe.blocking) {
          playSfx('block');
        } else {
          foe.hp--;
          foe.hitAt = performance.now();
          playSfx('punch');
        }
        draw();
        if (foe.hp <= 0) done(c);
      };
      const setBlock = (c, on) => {
        p[c].blocking = on;
        draw();
      };
      const down = (e) => {
        const k = KEYS[e.key.toLowerCase()];
        if (!k || k[0] === ai) return;
        e.preventDefault();
        const [c, action] = k;
        if (action === 'block') setBlock(c, true);
        else if (!e.repeat) punch(c);
      };
      const up = (e) => {
        const k = KEYS[e.key.toLowerCase()];
        if (k && k[0] !== ai && k[1] === 'block') setBlock(k[0], false);
      };
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);

      if (ai) {
        const me = p[ai];
        let nextPunch = performance.now() + rand(BOT.punchMin, BOT.punchMax);
        let blockUntil = 0;
        let lastHitSeen = 0;
        botTimer = setInterval(() => {
          const now = performance.now();
          if (me.blocking && now >= blockUntil) setBlock(ai, false);
          if (me.hitAt > lastHitSeen) {
            lastHitSeen = me.hitAt;
            if (!me.blocking && Math.random() < BOT.blockChance) {
              setBlock(ai, true);
              blockUntil = now + rand(BOT.blockMin, BOT.blockMax);
            }
          }
          if (!me.blocking && now >= nextPunch) {
            punch(ai);
            nextPunch = now + rand(BOT.punchMin, BOT.punchMax);
          }
        }, BOT.tick);
      }
      draw();
    });
  },
};
