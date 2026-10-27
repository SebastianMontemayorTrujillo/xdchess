const MAX_HP = 10;
const COOLDOWN = 150; // ms between punches
const KEYS = {
  x: ['w', 'punch'], s: ['w', 'block'],
  m: ['b', 'punch'], k: ['b', 'block'],
};

export default {
  id: 'boxing',
  name: 'Boxing',
  run(container) {
    return new Promise((resolve) => {
      container.innerHTML = `
        <div class="big">🥊 Boxing</div>
        <div>White: X punch, hold S block · Black: M punch, hold K block</div>
        <div class="boxers">
          <div class="boxer" id="bx-w">🦀<div class="hpbar"><div style="background:#eee"></div></div></div>
          <div class="boxer" id="bx-b">🦞<div class="hpbar"><div style="background:#e55"></div></div></div>
        </div>`;
      const p = {
        w: { hp: MAX_HP, blocking: false, last: 0, el: container.querySelector('#bx-w') },
        b: { hp: MAX_HP, blocking: false, last: 0, el: container.querySelector('#bx-b') },
      };
      const draw = () => {
        for (const c of ['w', 'b']) {
          p[c].el.querySelector('.hpbar > div').style.width = `${(p[c].hp / MAX_HP) * 100}%`;
          p[c].el.classList.toggle('block', p[c].blocking);
        }
      };
      const done = (winner) => {
        window.removeEventListener('keydown', down);
        window.removeEventListener('keyup', up);
        setTimeout(() => resolve(winner), 400);
      };
      const down = (e) => {
        const k = KEYS[e.key.toLowerCase()];
        if (!k) return;
        e.preventDefault();
        const [c, action] = k;
        const me = p[c];
        const foe = p[c === 'w' ? 'b' : 'w'];
        if (action === 'block') me.blocking = true;
        else if (!e.repeat && !me.blocking && performance.now() - me.last >= COOLDOWN) {
          me.last = performance.now();
          me.el.classList.add('punch');
          setTimeout(() => me.el.classList.remove('punch'), 80);
          if (!foe.blocking) foe.hp--;
          if (foe.hp <= 0) {
            draw();
            return done(c);
          }
        }
        draw();
      };
      const up = (e) => {
        const k = KEYS[e.key.toLowerCase()];
        if (k && k[1] === 'block') {
          p[k[0]].blocking = false;
          draw();
        }
      };
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);
      draw();
    });
  },
};
