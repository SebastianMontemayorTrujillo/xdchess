// Water Gun battle logic (surviv.io-inspired): no DOM, so it can be unit-tested.
export const W = 800, H = 480;
export const R = 18, SPEED = 230;                 // player radius, px/s
export const BULLET_R = 6, BULLET_SPEED = 480;
export const COOLDOWN = 0.3, MAX_HP = 5;
export const CRATE = 56, CRATE_HP = 4;
export const ZONE_WAIT = 8, ZONE_SHRINK = 25, ZONE_MIN = 70, ZONE_TICK = 1.5;
export const TIME_CAP = 60;
export const ZONE_START = Math.hypot(W / 2, H / 2) + 10;
const KNOCK = 260, KNOCK_DECAY = 10;

// Point-symmetric layout so neither side has an advantage.
const CRATE_SPOTS = [[210, 240], [330, 120], [330, 360]];

export function createState() {
  const crates = CRATE_SPOTS.flatMap(([x, y]) => [[x, y], [W - x, H - y]])
    .map(([x, y], i) => ({ id: i, x, y, hp: CRATE_HP }));
  const player = (x) => ({ x, y: H / 2, hp: MAX_HP, last: -Infinity, kx: 0, ky: 0, zoneTimer: 0, moving: false });
  return { time: 0, players: { w: player(80), b: player(W - 80) }, bullets: [], crates, winner: null };
}

export function zoneRadius(t) {
  if (t < ZONE_WAIT) return ZONE_START;
  const k = Math.min(1, (t - ZONE_WAIT) / ZONE_SHRINK);
  return ZONE_START + (ZONE_MIN - ZONE_START) * k;
}
export const inZone = (p, t) => Math.hypot(p.x - W / 2, p.y - H / 2) <= zoneRadius(t);

// Circle vs crate (axis-aligned square). Returns push-out vector or null.
function crateOverlap(cx, cy, r, c) {
  const h = CRATE / 2;
  const nx = Math.max(c.x - h, Math.min(cx, c.x + h));
  const ny = Math.max(c.y - h, Math.min(cy, c.y + h));
  const dx = cx - nx, dy = cy - ny;
  const d = Math.hypot(dx, dy);
  if (d >= r) return null;
  if (d > 0) return { x: (dx / d) * (r - d), y: (dy / d) * (r - d) };
  // centre inside the box: push out along the shallowest axis
  const ox = h + r - Math.abs(cx - c.x), oy = h + r - Math.abs(cy - c.y);
  return ox < oy ? { x: Math.sign(cx - c.x || 1) * ox, y: 0 } : { x: 0, y: Math.sign(cy - c.y || 1) * oy };
}

const clampArena = (p) => {
  p.x = Math.max(R, Math.min(W - R, p.x));
  p.y = Math.max(R, Math.min(H - R, p.y));
};

/**
 * Advance the battle. inputs = { w: {up,down,left,right,fire}, b: {...} }.
 * Returns events: { type: 'fire'|'hit'|'crateHit'|'crateBreak'|'zoneHurt'|'ko', ... }.
 */
export function step(state, inputs, dt) {
  const events = [];
  if (state.winner) return events;
  state.time += dt;
  const t = state.time;

  for (const c of ['w', 'b']) {
    const p = state.players[c], foe = state.players[c === 'w' ? 'b' : 'w'];
    const inp = inputs[c] || {};
    let dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    let dy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    const len = Math.hypot(dx, dy);
    p.moving = len > 0;
    if (len) { dx /= len; dy /= len; }
    p.x += (dx * SPEED + p.kx) * dt;
    p.y += (dy * SPEED + p.ky) * dt;
    const decay = Math.exp(-KNOCK_DECAY * dt);
    p.kx *= decay;
    p.ky *= decay;
    clampArena(p);
    for (const cr of state.crates) {
      const push = crateOverlap(p.x, p.y, R, cr);
      if (push) { p.x += push.x; p.y += push.y; }
    }
    clampArena(p);

    // Fire toward the opponent's position at this instant.
    if (inp.fire && t - p.last >= COOLDOWN) {
      const ax = foe.x - p.x, ay = foe.y - p.y;
      const d = Math.hypot(ax, ay);
      if (d > 0) {
        p.last = t;
        const ux = ax / d, uy = ay / d;
        state.bullets.push({
          owner: c,
          x: p.x + ux * (R + BULLET_R + 2), y: p.y + uy * (R + BULLET_R + 2),
          vx: ux * BULLET_SPEED, vy: uy * BULLET_SPEED,
        });
        events.push({ type: 'fire', c, angle: Math.atan2(uy, ux) });
      }
    }
  }

  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const crate = state.crates.find((cr) => crateOverlap(b.x, b.y, BULLET_R, cr));
    if (crate) {
      state.bullets.splice(i, 1);
      crate.hp--;
      events.push({ type: 'crateHit', x: b.x, y: b.y, crate });
      if (crate.hp <= 0) {
        state.crates.splice(state.crates.indexOf(crate), 1);
        events.push({ type: 'crateBreak', x: crate.x, y: crate.y, crate });
      }
      continue;
    }
    const tc = b.owner === 'w' ? 'b' : 'w';
    const target = state.players[tc];
    if (Math.hypot(b.x - target.x, b.y - target.y) < R + BULLET_R) {
      state.bullets.splice(i, 1);
      target.hp = Math.max(0, target.hp - 1);
      const s = Math.hypot(b.vx, b.vy);
      target.kx += (b.vx / s) * KNOCK;
      target.ky += (b.vy / s) * KNOCK;
      events.push({ type: 'hit', c: tc, x: b.x, y: b.y, angle: Math.atan2(b.vy, b.vx) });
      continue;
    }
    if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) state.bullets.splice(i, 1);
  }

  for (const c of ['w', 'b']) {
    const p = state.players[c];
    if (inZone(p, t)) { p.zoneTimer = 0; continue; }
    p.zoneTimer += dt;
    if (p.zoneTimer >= ZONE_TICK) {
      p.zoneTimer -= ZONE_TICK;
      p.hp = Math.max(0, p.hp - 1);
      events.push({ type: 'zoneHurt', c, x: p.x, y: p.y });
    }
  }

  const { w, b } = state.players;
  if (w.hp === 0 || b.hp === 0) {
    // Simultaneous KO is a tie: White wins, like the other minigames.
    state.winner = w.hp === 0 && b.hp > 0 ? 'b' : 'w';
    events.push({ type: 'ko', winner: state.winner, loser: state.winner === 'w' ? 'b' : 'w' });
  } else if (t >= TIME_CAP) {
    state.winner = b.hp > w.hp ? 'b' : 'w';
    events.push({ type: 'timeUp', winner: state.winner });
  }
  return events;
}
